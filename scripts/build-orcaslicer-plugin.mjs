import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

process.env.NODE_ENV = 'production';
const { build } = await import('vite');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const pluginDistDir = path.join(rootDir, 'dist-plugin');
const publicDir = path.join(rootDir, 'public');
const outputPluginPath = path.join(publicDir, 'layercost_plugin.py');

async function main() {
  console.log('[LayerCost] Building standalone single-file UI for OrcaSlicer plugin...');

  await build({
    configFile: path.join(rootDir, 'vite.plugin.config.ts'),
    mode: 'production',
    logLevel: 'warn',
  });

  const assetsDir = path.join(pluginDistDir, 'assets');
  const assetFiles = fs.readdirSync(assetsDir);

  const cssFile = assetFiles.find((f) => f.endsWith('.css'));
  const jsFile = assetFiles.find((f) => f.endsWith('.js'));

  if (!jsFile) {
    throw new Error('Could not find compiled plugin.js in dist-plugin/assets');
  }

  const cssContent = cssFile
    ? fs.readFileSync(path.join(assetsDir, cssFile), 'utf8')
    : '';
  const jsContent = fs.readFileSync(path.join(assetsDir, jsFile), 'utf8');

  // Escape closing script tags inside JS so inline <script> never terminates prematurely
  const safeJsContent = jsContent.replace(/<\/script/gi, '<\\/script');

  const standaloneHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>LayerCost - OrcaSlicer Cost & Quoting Plugin</title>
    <style>${cssContent}</style>
  </head>
  <body class="bg-[#262628] text-[#ededed]">
    <div id="root"></div>
    <script>${safeJsContent}</script>
  </body>
</html>`;

  const compressed = zlib.deflateSync(Buffer.from(standaloneHtml, 'utf8'), { level: 9 });
  const base64Ui = compressed.toString('base64');

  // Wrap base64 at 100 chars per line for clean Python source formatting
  const wrappedB64Lines = [];
  for (let i = 0; i < base64Ui.length; i += 100) {
    wrappedB64Lines.push(`    "${base64Ui.slice(i, i + 100)}"`);
  }

  const pythonPluginSource = buildPythonPluginSource(wrappedB64Lines.join('\n'));

  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  fs.writeFileSync(outputPluginPath, pythonPluginSource, 'utf8');

  // Clean up temporary plugin build directory
  fs.rmSync(pluginDistDir, { recursive: true, force: true });

  const sizeKb = (Buffer.byteLength(pythonPluginSource, 'utf8') / 1024).toFixed(1);
  console.log(`[LayerCost] Generated standalone OrcaSlicer plugin: ${outputPluginPath} (${sizeKb} KB)`);
}

function buildPythonPluginSource(wrappedBase64) {
  return `# /// script
# requires-python = ">=3.12"
# dependencies = []
#
# [tool.orcaslicer.plugin]
# name = "LayerCost - 3D Print Cost & Quoting"
# description = "Full standalone commercial 3D print cost calculator & PDF quote engine embedded inside OrcaSlicer. Automatically pulls sliced G-code print times, multi-filament weights, presets, and part dimensions directly after slicing."
# author = "LayerCost"
# version = "2.5.0"
# ///

"""
LayerCost — Standalone OrcaSlicer v2.5+ Native Python Plugin
=============================================================
Capabilities registered:
  1. PagesPluginCapabilityBase    -> Native "LayerCost" tab in OrcaSlicer's main window
  2. SlicingPipelineCapabilityBase -> Direct post-slice G-code hook (Step.psGCodePostProcess)
  3. ScriptPluginCapabilityBase   -> Manual "Pull Current Slice" action in Plugins dialog

Installation:
  Copy this single .py file into your OrcaSlicer plugins directory:
    - Windows: %APPDATA%\\OrcaSlicer\\plugins\\layercost_plugin.py
    - macOS:   ~/Library/Application Support/OrcaSlicer/plugins/layercost_plugin.py
    - Linux:   ~/.config/OrcaSlicer/plugins/layercost_plugin.py
  Restart OrcaSlicer and enable "LayerCost" under Preferences -> Plugins.
"""

from __future__ import annotations

import base64
import json
import os
import re
import tempfile
import threading
import time
import zipfile
import zlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import orca

# Thread-safe shared snapshot between SlicingPipeline worker thread and Page UI thread
_STATE_LOCK = threading.Lock()
_LATEST_SLICE_DATA: dict[str, Any] | None = None
_ACTIVE_PAGE_INSTANCE: "LayerCostPage | None" = None
_SLICE_START_TIME: float = 0.0
_BATCH_SLICING: bool = False
_SESSION_GCODE_PATHS: dict[str, float] = {}
_LAST_SESSION_DIR: str | None = None

DEFAULT_COLORS = ["#38bdf8", "#f97316", "#10b981", "#a855f7", "#eab308", "#ef4444"]


def _get_storage_dir() -> Path | None:
    """Safely resolve OrcaSlicer plugin private storage directory."""
    try:
        storage = orca.host.plugin.storage()
        p = Path(str(storage))
        p.mkdir(parents=True, exist_ok=True)
        return p
    except Exception:
        try:
            fallback = Path(tempfile.gettempdir()) / "orcaslicer_layercost"
            fallback.mkdir(parents=True, exist_ok=True)
            return fallback
        except Exception:
            return None


def _save_snapshot(snapshot: dict[str, Any]) -> None:
    global _LATEST_SLICE_DATA
    with _STATE_LOCK:
        _LATEST_SLICE_DATA = snapshot
        storage_dir = _get_storage_dir()
        if storage_dir is not None:
            try:
                (storage_dir / "latest_slice.json").write_text(
                    json.dumps(snapshot, indent=2),
                    encoding="utf-8",
                )
            except Exception:
                pass


def _load_snapshot() -> dict[str, Any] | None:
    global _LATEST_SLICE_DATA
    with _STATE_LOCK:
        if _LATEST_SLICE_DATA is not None:
            return _LATEST_SLICE_DATA
        storage_dir = _get_storage_dir()
        if storage_dir is not None:
            cache_file = storage_dir / "latest_slice.json"
            if cache_file.exists():
                try:
                    data = json.loads(cache_file.read_text(encoding="utf-8"))
                    _LATEST_SLICE_DATA = data
                    return data
                except Exception:
                    pass
        return None


def _save_user_settings(settings: dict[str, Any]) -> None:
    if not isinstance(settings, dict):
        return
    with _STATE_LOCK:
        storage_dir = _get_storage_dir()
        if storage_dir is not None:
            try:
                (storage_dir / "user_settings.json").write_text(
                    json.dumps(settings, indent=2),
                    encoding="utf-8",
                )
            except Exception:
                pass


def _load_user_settings() -> dict[str, Any]:
    with _STATE_LOCK:
        storage_dir = _get_storage_dir()
        if storage_dir is not None:
            cfg_file = storage_dir / "user_settings.json"
            if cfg_file.exists():
                try:
                    data = json.loads(cfg_file.read_text(encoding="utf-8"))
                    if isinstance(data, dict):
                        return data
                except Exception:
                    pass
        return {}


def _parse_time_to_seconds(raw: str) -> int:
    raw = raw.strip()
    colon_match = re.search(r"(\\d{1,2}):(\\d{2}):(\\d{2})", raw)
    if colon_match:
        return (
            int(colon_match.group(1)) * 3600
            + int(colon_match.group(2)) * 60
            + int(colon_match.group(3))
        )
    d = re.search(r"(\\d+)\\s*d", raw, re.IGNORECASE)
    h = re.search(r"(\\d+)\\s*h", raw, re.IGNORECASE)
    m = re.search(r"(\\d+)\\s*m(?:in)?", raw, re.IGNORECASE)
    s = re.search(r"(\\d+)\\s*s(?:ec)?", raw, re.IGNORECASE)
    total = (
        (int(d.group(1)) * 86400 if d else 0)
        + (int(h.group(1)) * 3600 if h else 0)
        + (int(m.group(1)) * 60 if m else 0)
        + (int(s.group(1)) if s else 0)
    )
    if total == 0:
        try:
            total = int(float(raw))
        except Exception:
            total = 0
    return total


def _format_seconds_hms(total_secs: int) -> str:
    d = total_secs // 86400
    h = (total_secs % 86400) // 3600
    m = (total_secs % 3600) // 60
    s = total_secs % 60
    parts: list[str] = []
    if d > 0:
        parts.append(f"{d}d")
    if h > 0 or d > 0:
        parts.append(f"{h}h")
    parts.append(f"{m}m")
    parts.append(f"{s:02d}s")
    return " ".join(parts)


def _read_header_footer(file_path: Path, chunk_bytes: int = 786432) -> str:
    size = file_path.stat().st_size
    with file_path.open("r", encoding="utf-8", errors="ignore") as f:
        header = f.read(min(size, chunk_bytes))
        footer = ""
        if size > chunk_bytes:
            f.seek(max(0, size - chunk_bytes))
            footer = f.read(chunk_bytes)
    return header + "\\n" + footer


_NON_SLICE_GCODE_RE = re.compile(
    r"^(?:ams_(?:load|unload|flush|purge|cut|retry|recover).*|(?:load|unload)_filament.*|filament_(?:load|unload).*|machine_(?:start|end|before_layer|after_layer).*|(?:start|end|pause|resume|cancel)_?(?:gcode|print)?|wipe_tower.*|toolchange.*|calibration.*|bed_level.*|nozzle_load.*)$",
    re.IGNORECASE,
)

_SLICED_GCODE_MARKER_RE = re.compile(
    r";\\s*(?:generated by\\s+(?:OrcaSlicer|BambuStudio|PrusaSlicer|SuperSlicer|Slic3r)|estimated printing time|total estimated time|model printing time|TIME:\\d+|filament used \\[g\\]|total filament used \\[g\\]|total layer number|LAYER_COUNT\\s*[:=]|HEADER_BLOCK_START|EXECUTABLE_BLOCK_START|CONFIG_BLOCK_START)",
    re.IGNORECASE,
)


def _is_non_slice_filename(file_path: Path) -> bool:
    stem = file_path.stem.lower()
    if re.search(r"plate[_\\-\\s]*\\d+", stem, re.IGNORECASE):
        return False
    return bool(_NON_SLICE_GCODE_RE.match(stem))


def _looks_like_sliced_gcode_text(text: str) -> bool:
    return bool(_SLICED_GCODE_MARKER_RE.search(text))


def _is_sliced_plate_gcode(file_path: Path) -> bool:
    """Return True only if file_path is an actual sliced build-plate G-code (not an AMS/printer macro)."""
    try:
        if not file_path.exists() or not file_path.is_file():
            return False
        if _is_non_slice_filename(file_path):
            return False
        size = file_path.stat().st_size
        if size <= 100:
            return False
        text = _read_header_footer(file_path, chunk_bytes=131072)
        return _looks_like_sliced_gcode_text(text)
    except Exception:
        return False


def _split_list_value(raw: str) -> list[str]:
    if ";" in raw:
        return [x.strip().strip('"').strip("'") for x in raw.split(";") if x.strip()]
    return [x.strip().strip('"').strip("'") for x in raw.split(",") if x.strip()]


def parse_gcode_metrics(gcode_path: str | Path) -> dict[str, Any]:
    """Extract comprehensive slicing metrics from OrcaSlicer generated G-code."""
    p = Path(gcode_path)
    file_size = p.stat().st_size if p.exists() else 0
    text = _read_header_footer(p) if p.exists() else ""
    return parse_gcode_metrics_from_text(p.name, file_size, text)


def parse_gcode_metrics_from_text(file_name: str, file_size: int, text: str) -> dict[str, Any]:
    """Extract comprehensive slicing metrics from raw OrcaSlicer G-code header/footer text."""

    # Slicer version
    slicer = "OrcaSlicer"
    m_slicer = re.search(r";\\s*generated by\\s+(OrcaSlicer[^\\r\\n]*|BambuStudio[^\\r\\n]*)", text, re.IGNORECASE)
    if m_slicer:
        slicer = m_slicer.group(1).strip()

    # Printer preset
    printer_name = None
    m_printer = re.search(r";\\s*printer_settings_id\\s*=\\s*([^\\r\\n]+)", text, re.IGNORECASE)
    if m_printer:
        printer_name = m_printer.group(1).strip().strip('"').strip("'")

    # Print time
    print_time_seconds = 0
    for rx in [
        r";\\s*(?:estimated printing time(?: \\([^)]+\\))?|total estimated time|model printing time)\\s*(?:=|:)\\s*([^\\r\\n]+)",
        r";\\s*TIME:(\\d+)",
    ]:
        m_t = re.search(rx, text, re.IGNORECASE)
        if m_t:
            print_time_seconds = _parse_time_to_seconds(m_t.group(1))
            if print_time_seconds > 0:
                break

    # Filament metadata lists
    types_list: list[str] = []
    m_types = re.search(r";\\s*filament_type\\s*=\\s*([^\\r\\n]+)", text, re.IGNORECASE)
    if m_types:
        types_list = [x.upper() for x in _split_list_value(m_types.group(1))]

    colors_list: list[str] = []
    m_colors = re.search(r";\\s*filament_colou?r\\s*=\\s*([^\\r\\n]+)", text, re.IGNORECASE)
    if m_colors:
        colors_list = _split_list_value(m_colors.group(1))

    names_list: list[str] = []
    m_names = re.search(r";\\s*filament_settings_id\\s*=\\s*([^\\r\\n]+)", text, re.IGNORECASE)
    if m_names:
        names_list = _split_list_value(m_names.group(1))

    # Filament used in grams (check per-slot array first so total_filament doesn't shadow it)
    filament_grams = 0.0
    multi_filaments: list[dict[str, Any]] = []
    m_grams = re.search(
        r";\\s*filament used \\[g\\]\\s*=\\s*([0-9.,;\\s]+)",
        text,
        re.IGNORECASE,
    ) or re.search(
        r";\\s*total filament used \\[g\\]\\s*=\\s*([0-9.,;\\s]+)",
        text,
        re.IGNORECASE,
    )
    if m_grams:
        raw_vals = []
        for token in re.split(r"[,;]", m_grams.group(1)):
            token = token.strip()
            if token:
                try:
                    raw_vals.append(float(token))
                except ValueError:
                    pass

        for idx, g_val in enumerate(raw_vals):
            if g_val <= 0 and len(raw_vals) > 1:
                continue
            f_type = types_list[idx] if idx < len(types_list) else (types_list[0] if types_list else "PLA")
            f_color = colors_list[idx] if idx < len(colors_list) else DEFAULT_COLORS[idx % len(DEFAULT_COLORS)]
            f_name = names_list[idx] if idx < len(names_list) else f"AMS Slot {idx + 1} ({f_type})"
            multi_filaments.append({
                "slot": idx + 1,
                "name": f_name,
                "grams": round(g_val, 2),
                "purgeGrams": 0.0,
                "type": f_type,
                "colorHex": f_color,
            })
        filament_grams = sum(raw_vals)

    # Flush/waste filament if reported by OrcaSlicer
    m_flush = re.search(r";\\s*(?:filament_wipe|flush_grams|total_flush_weight)\\s*(?:=|:)\\s*([0-9.]+)", text, re.IGNORECASE)
    if m_flush and multi_filaments:
        try:
            flush_g = float(m_flush.group(1))
            if flush_g > 0:
                per_slot = round(flush_g / len(multi_filaments), 2)
                for slot in multi_filaments:
                    slot["purgeGrams"] = per_slot
        except Exception:
            pass

    # Volume & meters
    filament_vol = 0.0
    m_vol = re.search(r";\\s*(?:total )?filament used \\[cm3\\]\\s*=\\s*([0-9.]+)", text, re.IGNORECASE)
    if m_vol:
        filament_vol = float(m_vol.group(1))
    elif filament_grams > 0:
        filament_vol = round(filament_grams / 1.24, 1)

    filament_meters = 0.0
    m_mm = re.search(r";\\s*(?:total )?filament used \\[mm\\]\\s*=\\s*([0-9.]+)", text, re.IGNORECASE)
    m_m = re.search(r";\\s*(?:total )?filament used \\[m\\]\\s*=\\s*([0-9.]+)", text, re.IGNORECASE)
    if m_m:
        filament_meters = float(m_m.group(1))
    elif m_mm:
        filament_meters = round(float(m_mm.group(1)) / 1000.0, 2)
    elif filament_vol > 0:
        filament_meters = round(filament_vol / 2.405, 1)

    # Layer height & layer count
    layer_height = 0.2
    m_lh = re.search(r";\\s*layer_height\\s*=\\s*([0-9.]+)", text, re.IGNORECASE)
    if m_lh:
        layer_height = float(m_lh.group(1))

    layer_count = 1
    m_lc = re.search(r";\\s*(?:total layer number|total layers|LAYER_COUNT)\\s*(?::|=)\\s*(\\d+)", text, re.IGNORECASE)
    if m_lc:
        layer_count = max(1, int(m_lc.group(1)))

    # Temperatures
    bed_temp = None
    m_bed = re.search(r";\\s*(?:bed_temperature|first_layer_bed_temperature)\\s*=\\s*(\\d+)", text, re.IGNORECASE)
    if m_bed:
        bed_temp = int(m_bed.group(1))

    nozzle_temp = None
    m_noz = re.search(r";\\s*(?:nozzle_temperature|temperature|first_layer_temperature)\\s*=\\s*(\\d+)", text, re.IGNORECASE)
    if m_noz:
        nozzle_temp = int(m_noz.group(1))

    if print_time_seconds == 0 and filament_grams > 0:
        print_time_seconds = int((filament_grams / 25.0) * 3600)

    return {
        "fileName": file_name,
        "fileSizeBytes": file_size,
        "slicer": slicer,
        "printerName": printer_name,
        "printTimeSeconds": max(1, print_time_seconds),
        "printTimeFormatted": _format_seconds_hms(max(1, print_time_seconds)),
        "filamentGrams": round(filament_grams, 2),
        "filamentMeters": round(filament_meters, 2),
        "filamentVolumeCm3": round(filament_vol, 2),
        "layerCount": layer_count,
        "layerHeightMm": layer_height,
        "bedTempC": bed_temp,
        "nozzleTempC": nozzle_temp,
        "filamentType": types_list[0] if types_list else "PLA",
        "multiFilaments": multi_filaments,
    }


def _plate_sort_key(file_path: Path) -> tuple[int, int | float, str]:
    """Sort plate G-code files naturally (plate_1, plate_2, ..., plate_10)."""
    m = re.search(r"plate[_\\-\\s]*(\\d+)", f"{file_path.parent.name}/{file_path.stem}", re.IGNORECASE)
    if m:
        return (0, int(m.group(1)), str(file_path).lower())
    try:
        mtime = file_path.stat().st_mtime
    except Exception:
        mtime = 0.0
    return (1, mtime, str(file_path).lower())


def _register_session_gcodes(paths: list[str | Path]) -> None:
    """Track all plate G-code files belonging to the active OrcaSlicer project session."""
    global _LAST_SESSION_DIR
    with _STATE_LOCK:
        for raw_p in paths:
            try:
                p = Path(str(raw_p)).resolve()
                if not _is_sliced_plate_gcode(p):
                    continue
                parent_str = str(p.parent)
                if _LAST_SESSION_DIR and _LAST_SESSION_DIR != parent_str:
                    try:
                        common = os.path.commonpath([_LAST_SESSION_DIR, parent_str])
                        if common in ("/", str(Path(tempfile.gettempdir()).resolve())):
                            _SESSION_GCODE_PATHS.clear()
                    except ValueError:
                        _SESSION_GCODE_PATHS.clear()
                _LAST_SESSION_DIR = parent_str
                _SESSION_GCODE_PATHS[str(p)] = p.stat().st_mtime
            except Exception:
                continue


def _get_temp_roots() -> list[Path]:
    """Return resolved OS temp root directories where OrcaSlicer writes temporary slices."""
    roots: list[Path] = []
    seen: set[str] = set()
    raw_candidates = [
        tempfile.gettempdir(),
        os.environ.get("TMP"),
        os.environ.get("TEMP"),
        os.environ.get("TMPDIR"),
        os.environ.get("XDG_RUNTIME_DIR"),
    ]
    local_appdata = os.environ.get("LOCALAPPDATA")
    if local_appdata:
        raw_candidates.append(str(Path(local_appdata) / "Temp"))
    for item in raw_candidates:
        if not item:
            continue
        try:
            rp = Path(item).resolve()
            key = str(rp)
            if rp.exists() and rp.is_dir() and key not in seen:
                seen.add(key)
                roots.append(rp)
        except Exception:
            continue
    return roots


def _iter_gcode_files(base_dir: Path, temp_roots: set[Path], max_depth: int = 7) -> list[Path]:
    """Permission-safe recursive scanner for OrcaSlicer sliced .gcode/.gco files."""
    found: list[Path] = []
    stack: list[tuple[Path, int]] = [(base_dir, 0)]
    skip_dirs = {"system", "resources", "plugins", "presets", "user", "profiles", "ota", "web", "locales"}
    while stack:
        cur_dir, depth = stack.pop()
        try:
            cur_resolved = cur_dir.resolve()
            is_temp_root = cur_resolved in temp_roots
            with os.scandir(cur_dir) as it:
                for entry in it:
                    try:
                        if entry.is_file(follow_symlinks=False):
                            lname = entry.name.lower()
                            if lname.endswith(".gcode") or lname.endswith(".gco"):
                                p = Path(entry.path)
                                if _is_sliced_plate_gcode(p):
                                    found.append(p)
                        elif depth < max_depth and entry.is_dir(follow_symlinks=False):
                            dlow = entry.name.lower()
                            if dlow in skip_dirs:
                                continue
                            if depth == 0 and is_temp_root:
                                if not any(k in dlow for k in ("orca", "bambu", "bbl", "slice", "slic3r", "plate", "3mf", "gcode", "model")):
                                    continue
                            stack.append((Path(entry.path), depth + 1))
                    except Exception:
                        continue
        except Exception:
            continue
    return found


def _extract_3mf_sliced_gcodes(search_dirs: list[Path], temp_roots: set[Path]) -> list[dict[str, Any]]:
    """Fallback: read Metadata/plate_*.gcode directly from the newest sliced .gcode.3mf in temp."""
    threemf_files: list[tuple[float, Path]] = []
    stack: list[tuple[Path, int]] = [(d, 0) for d in search_dirs]
    while stack:
        cur_dir, depth = stack.pop()
        try:
            cur_resolved = cur_dir.resolve()
            is_temp_root = cur_resolved in temp_roots
            with os.scandir(cur_dir) as it:
                for entry in it:
                    try:
                        if entry.is_file(follow_symlinks=False) and entry.name.lower().endswith(".gcode.3mf"):
                            st = entry.stat(follow_symlinks=False)
                            if st.st_size > 200:
                                threemf_files.append((st.st_mtime, Path(entry.path)))
                        elif depth < 4 and entry.is_dir(follow_symlinks=False):
                            dlow = entry.name.lower()
                            if depth == 0 and is_temp_root:
                                if not any(k in dlow for k in ("orca", "bambu", "bbl", "slice", "slic3r", "plate", "3mf", "gcode", "model")):
                                    continue
                            stack.append((Path(entry.path), depth + 1))
                    except Exception:
                        continue
        except Exception:
            continue

    if not threemf_files:
        return []

    threemf_files.sort(key=lambda x: x[0], reverse=True)
    _, newest_3mf = threemf_files[0]
    extracted: list[dict[str, Any]] = []
    try:
        with zipfile.ZipFile(newest_3mf, "r") as zf:
            gcode_entries = [
                info for info in zf.infolist()
                if info.filename.lower().endswith(".gcode") and not _is_non_slice_filename(Path(info.filename))
            ]
            gcode_entries.sort(key=lambda info: _plate_sort_key(Path(info.filename)))
            for info in gcode_entries:
                with zf.open(info, "r") as member:
                    raw = member.read()
                text = raw.decode("utf-8", errors="ignore")
                if len(text) > 1572864:
                    text = text[:786432] + "\\n" + text[-786432:]
                if _looks_like_sliced_gcode_text(text):
                    extracted.append({
                        "fileName": Path(info.filename).name,
                        "archivePath": str(newest_3mf),
                        "metrics": parse_gcode_metrics_from_text(Path(info.filename).name, info.file_size, text),
                    })
    except Exception:
        return []
    return extracted


def _discover_plate_gcodes(explicit_paths: list[str | Path] | None = None) -> list[Path]:
    """Discover all sliced plate .gcode files for the active single-plate or multi-plate job."""
    candidates: dict[str, Path] = {}

    if explicit_paths:
        _register_session_gcodes(explicit_paths)
        for raw_p in explicit_paths:
            try:
                p = Path(str(raw_p)).resolve()
                if _is_sliced_plate_gcode(p):
                    candidates[str(p)] = p
            except Exception:
                continue

    # Check host plater API for plate-level sliced paths if available
    try:
        plater = orca.host.plater()
        if plater is not None:
            for list_attr in ("gcode_paths", "get_gcode_paths", "plate_gcode_paths", "sliced_gcode_paths"):
                lval = getattr(plater, list_attr, None)
                lres = lval() if callable(lval) else lval
                if lres and isinstance(lres, (list, tuple)):
                    for gp_res in lres:
                        if gp_res:
                            try:
                                p = Path(str(gp_res)).resolve()
                                if _is_sliced_plate_gcode(p):
                                    candidates[str(p)] = p
                            except Exception:
                                continue
            for attr in ("plates", "get_plates", "partplate_list"):
                plates_val = getattr(plater, attr, None)
                plates = plates_val() if callable(plates_val) else plates_val
                if plates and isinstance(plates, (list, tuple)):
                    for plate in plates:
                        for p_attr in ("gcode_path", "get_gcode_path", "sliced_gcode_path", "output_path"):
                            gp = getattr(plate, p_attr, None)
                            gp_res = gp() if callable(gp) else gp
                            if gp_res:
                                try:
                                    p = Path(str(gp_res)).resolve()
                                    if _is_sliced_plate_gcode(p):
                                        candidates[str(p)] = p
                                except Exception:
                                    continue
    except Exception:
        pass

    # Include any already registered session plate paths that still exist
    with _STATE_LOCK:
        for raw_p in list(_SESSION_GCODE_PATHS.keys()):
            try:
                p = Path(raw_p)
                if _is_sliced_plate_gcode(p):
                    candidates[str(p)] = p
                else:
                    _SESSION_GCODE_PATHS.pop(raw_p, None)
            except Exception:
                _SESSION_GCODE_PATHS.pop(raw_p, None)

    # Scan OS temp folders + sibling directories of known G-code paths for multi-plate files
    temp_roots_list = _get_temp_roots()
    temp_roots = set(temp_roots_list)
    primary_temp_root = temp_roots_list[0] if temp_roots_list else Path(tempfile.gettempdir()).resolve()
    search_dirs: list[Path] = []
    anchor_file: Path | None = None

    if explicit_paths:
        for raw_p in reversed(explicit_paths):
            try:
                p = Path(str(raw_p)).resolve()
                if _is_sliced_plate_gcode(p):
                    anchor_file = p
                    break
                if p.exists() and p.is_dir() and p not in search_dirs:
                    search_dirs.append(p)
            except Exception:
                continue

    for existing_p in list(candidates.values()):
        parent_dir = existing_p.parent
        grandparent_dir = parent_dir.parent
        if (
            grandparent_dir not in temp_roots
            and grandparent_dir != parent_dir
            and re.search(r"plate[_\\-\\s]*\\d+", parent_dir.name, re.IGNORECASE)
            and grandparent_dir not in search_dirs
        ):
            search_dirs.append(grandparent_dir)
        elif parent_dir not in search_dirs:
            search_dirs.append(parent_dir)

    if not search_dirs:
        for tr in temp_roots_list:
            for sub in ("orcaslicer_model", "OrcaSlicer", "bambuslicer_model", "BambuStudio"):
                d = tr / sub
                try:
                    if d.exists() and d.is_dir() and d not in search_dirs:
                        search_dirs.append(d)
                except Exception:
                    continue
            if tr not in search_dirs:
                search_dirs.append(tr)

    scanned_files: list[tuple[float, Path]] = []
    min_mtime = max(0.0, _SLICE_START_TIME - 5.0)
    for base_dir in search_dirs:
        for gfile in _iter_gcode_files(base_dir, temp_roots, max_depth=7):
            try:
                st = gfile.stat()
                if st.st_size > 100:
                    scanned_files.append((st.st_mtime, gfile.resolve()))
            except Exception:
                continue

    # Determine active project directory from explicit anchor or newest sliced file
    if scanned_files:
        scanned_files.sort(key=lambda item: item[0], reverse=True)
        newest_mtime, newest_file = scanned_files[0]
        if anchor_file is not None:
            active_dir = anchor_file.parent
            try:
                newest_mtime = anchor_file.stat().st_mtime
            except Exception:
                pass
        else:
            active_dir = newest_file.parent

        is_dedicated_subdir = active_dir not in temp_roots
        session_cutoff = max(min_mtime, newest_mtime - 1800.0) if is_dedicated_subdir else max(min_mtime, newest_mtime - 120.0)

        for mtime, gpath in scanned_files:
            same_dir = gpath.parent == active_dir
            shared_project_root = (
                active_dir.parent not in temp_roots
                and gpath.parent.parent == active_dir.parent
            )
            is_plate_named = bool(re.search(r"plate[_\\-\\s]*\\d+", str(gpath), re.IGNORECASE))
            if (same_dir or shared_project_root) and (mtime >= session_cutoff or (is_dedicated_subdir and is_plate_named)):
                candidates[str(gpath)] = gpath
            elif anchor_file is None and mtime >= min_mtime and _SLICE_START_TIME > 0 and is_plate_named:
                candidates[str(gpath)] = gpath

    if not candidates and scanned_files:
        _, newest_file = scanned_files[0]
        candidates[str(newest_file)] = newest_file

    ordered = sorted(candidates.values(), key=_plate_sort_key)
    if ordered:
        _register_session_gcodes(ordered)
    return ordered


def _collect_host_context(
    include_temp_gcode_scan: bool = True,
    explicit_paths: list[str | Path] | None = None,
) -> dict[str, Any]:
    """Read live objects, active printer/presets, and discover all plate G-code files."""
    host_info: dict[str, Any] = {
        "objects": [],
        "printerName": None,
        "projectName": None,
        "discoveredGcodePaths": [],
    }

    try:
        model = orca.host.model()
        if model is not None:
            objs_attr = getattr(model, "objects", None)
            objs = objs_attr() if callable(objs_attr) else objs_attr
            if objs:
                for obj in objs:
                    name = getattr(obj, "name", None)
                    if callable(name):
                        name = name()
                    instances = getattr(obj, "instances", None)
                    inst_count = len(instances()) if callable(instances) else (len(instances) if isinstance(instances, (list, tuple)) else 1)
                    host_info["objects"].append({
                        "name": str(name or "Model Part"),
                        "instances": max(1, int(inst_count)),
                    })
                if host_info["objects"]:
                    host_info["projectName"] = str(host_info["objects"][0]["name"]).rsplit(".", 1)[0]
    except Exception:
        pass

    try:
        plater = orca.host.plater()
        if plater is not None:
            for attr in ("project_name", "get_project_name", "name"):
                val = getattr(plater, attr, None)
                res = val() if callable(val) else val
                if res:
                    host_info["projectName"] = str(res)
                    break
    except Exception:
        pass

    try:
        bundle = orca.host.preset_bundle()
        if bundle is not None:
            for attr in ("printer_name", "active_printer_name", "current_printer"):
                val = getattr(bundle, attr, None)
                res = val() if callable(val) else val
                if res:
                    host_info["printerName"] = str(res)
                    break
    except Exception:
        pass

    if include_temp_gcode_scan or explicit_paths:
        plate_paths = _discover_plate_gcodes(explicit_paths=explicit_paths)
        host_info["discoveredGcodePaths"] = [str(p) for p in plate_paths]
        if plate_paths:
            host_info["discoveredGcodePath"] = str(plate_paths[0])

    return host_info


def _assemble_payload(
    entries: list[tuple[str, dict[str, Any]]],
    host_info: dict[str, Any] | None = None,
    primary_path: str | None = None,
) -> dict[str, Any]:
    """Assemble consolidated multi-plate payload from (label, metrics) entries."""
    host_info = host_info or {}
    files_payload: list[dict[str, Any]] = []
    filament_agg: dict[tuple[int, str, str], dict[str, Any]] = {}
    detected_printer = host_info.get("printerName")
    detected_slicer = "OrcaSlicer 2.5+"

    for idx, (label, metrics) in enumerate(entries):
        if not detected_printer and metrics.get("printerName"):
            detected_printer = metrics.get("printerName")
        if metrics.get("slicer"):
            detected_slicer = metrics["slicer"]

        m_plate = re.search(r"plate[_\\-\\s]*(\\d+)", label, re.IGNORECASE)
        plate_idx = int(m_plate.group(1)) if m_plate else (idx + 1)

        files_payload.append({
            "plateIndex": plate_idx,
            "plateName": f"Plate {plate_idx}",
            "fileName": metrics["fileName"],
            "fileSizeBytes": metrics["fileSizeBytes"],
            "slicer": metrics["slicer"],
            "printTimeSeconds": metrics["printTimeSeconds"],
            "printTimeFormatted": metrics["printTimeFormatted"],
            "filamentGrams": metrics["filamentGrams"],
            "filamentMeters": metrics["filamentMeters"],
            "filamentVolumeCm3": metrics["filamentVolumeCm3"],
            "layerCount": metrics["layerCount"],
            "layerHeightMm": metrics["layerHeightMm"],
            "bedTempC": metrics.get("bedTempC"),
            "nozzleTempC": metrics.get("nozzleTempC"),
            "filamentType": metrics.get("filamentType"),
            "multiFilaments": metrics.get("multiFilaments"),
            "quantity": 1,
        })

        plate_fils = metrics.get("multiFilaments") or []
        if plate_fils:
            for m in plate_fils:
                slot = int(m.get("slot") or 1)
                f_type = str(m.get("type") or "PLA").upper()
                f_name = str(m.get("name") or f"AMS Slot {slot} ({f_type})")
                agg_key = (slot, f_type, f_name)
                if agg_key in filament_agg:
                    filament_agg[agg_key]["gramsUsed"] += float(m.get("grams") or 0.0)
                    filament_agg[agg_key]["purgeGrams"] += float(m.get("purgeGrams") or 0.0)
                else:
                    filament_agg[agg_key] = {
                        "slot": slot,
                        "name": f_name,
                        "type": f_type,
                        "gramsUsed": float(m.get("grams") or 0.0),
                        "purgeGrams": float(m.get("purgeGrams") or 0.0),
                        "colorHex": m.get("colorHex") or DEFAULT_COLORS[(slot - 1) % len(DEFAULT_COLORS)],
                    }
        elif metrics["filamentGrams"] > 0:
            f_type = str(metrics.get("filamentType") or "PLA").upper()
            f_name = f"Primary {f_type} Spool"
            agg_key = (1, f_type, f_name)
            if agg_key in filament_agg:
                filament_agg[agg_key]["gramsUsed"] += float(metrics["filamentGrams"])
            else:
                filament_agg[agg_key] = {
                    "slot": 1,
                    "name": f_name,
                    "type": f_type,
                    "gramsUsed": float(metrics["filamentGrams"]),
                    "purgeGrams": 0.0,
                    "colorHex": DEFAULT_COLORS[0],
                }

    filaments_payload = [
        {
            "slot": entry["slot"],
            "name": entry["name"],
            "type": entry["type"],
            "gramsUsed": round(entry["gramsUsed"], 2),
            "purgeGrams": round(entry["purgeGrams"], 2),
            "colorHex": entry["colorHex"],
        }
        for entry in sorted(filament_agg.values(), key=lambda x: (x["slot"], x["type"]))
    ]

    project_name = host_info.get("projectName")
    if not project_name and primary_path:
        raw_stem = Path(primary_path).stem.replace(".gcode", "")
        project_name = re.sub(r"[_\\-\\s]*plate[_\\-\\s]*\\d+$", "", raw_stem, flags=re.IGNORECASE) or raw_stem

    return {
        "source": "orcaslicer-plugin",
        "capturedAt": datetime.now(timezone.utc).isoformat(),
        "projectName": project_name or "OrcaSlicer Project",
        "plateName": f"{len(files_payload)} Plates Sliced" if len(files_payload) > 1 else (files_payload[0]["plateName"] if files_payload else "Plate 1"),
        "plateCount": len(files_payload),
        "printerName": detected_printer,
        "slicerVersion": detected_slicer,
        "gcodePath": primary_path,
        "objects": host_info.get("objects") or [],
        "filaments": filaments_payload,
        "files": files_payload,
    }


def _build_payload_from_gcodes(
    gcode_paths: list[str | Path],
    host_info: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Parse one or multiple plate G-code files into a consolidated multi-plate payload."""
    unique_paths: list[Path] = []
    seen: set[str] = set()
    for raw_p in gcode_paths:
        p = Path(str(raw_p))
        key = str(p.resolve()) if p.exists() else str(p)
        if key not in seen and _is_sliced_plate_gcode(p):
            seen.add(key)
            unique_paths.append(p)

    unique_paths.sort(key=_plate_sort_key)
    entries = [
        (f"{gpath.parent.name}/{gpath.stem}", parse_gcode_metrics(gpath))
        for gpath in unique_paths
    ]
    return _assemble_payload(entries, host_info, str(unique_paths[0]) if unique_paths else None)


def _build_payload_from_extracted_entries(
    extracted: list[dict[str, Any]],
    host_info: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build consolidated multi-plate payload from .gcode.3mf extracted plate entries."""
    entries = [(item["fileName"], item["metrics"]) for item in extracted]
    primary_path = extracted[0].get("archivePath") if extracted else None
    return _assemble_payload(entries, host_info, primary_path)


def _decode_embedded_ui() -> str:
    compressed = base64.b64decode(_EMBEDDED_UI_ZLIB_B64)
    return zlib.decompress(compressed).decode("utf-8")


def _extract_ctx_paths(ctx: Any) -> list[str]:
    """Collect any G-code path(s) exposed on an OrcaSlicer pipeline/lifecycle context."""
    found: list[str] = []
    if ctx is None:
        return found

    def _get(obj: Any, attr: str) -> Any:
        if isinstance(obj, dict):
            return obj.get(attr)
        val = getattr(obj, attr, None)
        return val() if callable(val) else val

    for attr in ("gcode_paths", "output_paths", "gcode_files", "plate_gcode_paths"):
        val = _get(ctx, attr)
        if val and isinstance(val, (list, tuple)):
            for item in val:
                try:
                    if item and Path(str(item)).exists():
                        found.append(str(item))
                except Exception:
                    continue

    for attr in ("gcode_path", "path", "output_path", "file_path", "filename", "output_dir", "temp_dir"):
        val = _get(ctx, attr)
        if val:
            try:
                p = Path(str(val))
                if p.exists():
                    found.append(str(p))
            except Exception:
                continue

    return found


# ---------------------------------------------------------------------------
# 1. Native OrcaSlicer Page Capability (Embedded Standalone React UI Tab)
# ---------------------------------------------------------------------------
class LayerCostPage(orca.pages.PagesPluginCapabilityBase):
    def get_name(self) -> str:
        return "LayerCost"

    def get_ui(self) -> str:
        global _ACTIVE_PAGE_INSTANCE
        _ACTIVE_PAGE_INSTANCE = self
        return _decode_embedded_ui()

    def _push_latest_to_ui(self) -> None:
        host_info = _collect_host_context(include_temp_gcode_scan=True)
        discovered_all = host_info.get("discoveredGcodePaths") or []
        if discovered_all:
            payload = _build_payload_from_gcodes(discovered_all, host_info)
            _save_snapshot(payload)
            self.post_message({"type": "slice_complete", "payload": payload})
            return

        # Fallback: check .gcode.3mf archives in temp dirs
        temp_roots_list = _get_temp_roots()
        extracted_3mf = _extract_3mf_sliced_gcodes(temp_roots_list, set(temp_roots_list))
        if extracted_3mf:
            payload = _build_payload_from_extracted_entries(extracted_3mf, host_info)
            _save_snapshot(payload)
            self.post_message({"type": "slice_complete", "payload": payload})
            return

        snapshot = _load_snapshot()
        if snapshot is not None:
            self.post_message({"type": "slice_complete", "payload": snapshot})
        else:
            self.post_message({
                "type": "no_slice_yet",
                "hostInfo": {
                    "printerName": host_info.get("printerName"),
                    "projectName": host_info.get("projectName"),
                    "objectCount": len(host_info.get("objects") or []),
                },
            })

    def on_message(self, data: dict[str, Any]) -> None:
        global _ACTIVE_PAGE_INSTANCE
        _ACTIVE_PAGE_INSTANCE = self

        msg_type = (data or {}).get("type")
        if msg_type == "ready":
            saved_settings = _load_user_settings()
            self.post_message({"type": "settings_loaded", "settings": saved_settings})
            self._push_latest_to_ui()
        elif msg_type == "pull_slice_data":
            self._push_latest_to_ui()
        elif msg_type == "save_settings":
            _save_user_settings((data or {}).get("settings") or {})
        elif msg_type == "save_invoice_html":
            filename = data.get("filename") or f"LayerCost_Quote_{int(time.time())}.html"
            html = data.get("html") or ""
            storage_dir = _get_storage_dir()
            if storage_dir is not None and html:
                out_path = storage_dir / filename
                out_path.write_text(html, encoding="utf-8")
                self.post_message({"type": "invoice_saved", "path": str(out_path)})
                try:
                    orca.host.ui.message("LayerCost Quote Saved", f"Saved quotation invoice to:\\n{out_path}")
                except Exception:
                    pass
        elif msg_type == "notify":
            try:
                orca.host.ui.message(
                    str(data.get("title") or "LayerCost"),
                    str(data.get("message") or ""),
                )
            except Exception:
                pass

    def on_lifecycle_event(self, event: Any, ctx: Any) -> None:
        global _SLICE_START_TIME, _BATCH_SLICING
        try:
            le = getattr(orca, "LifecycleEvent", None)
            started_events = {
                ev for ev in (
                    getattr(le, "SliceStarted", None) if le else None,
                    getattr(le, "SlicingStarted", None) if le else None,
                )
                if ev is not None
            }
            complete_events = {
                ev for ev in (
                    getattr(le, "SlicingJobComplete", None) if le else None,
                    getattr(le, "SliceComplete", None) if le else None,
                    getattr(le, "SlicingComplete", None) if le else None,
                    getattr(le, "GCodeExportFinished", None) if le else None,
                    getattr(le, "SliceGeometryFinished", None) if le else None,
                    getattr(le, "PlateSliced", None) if le else None,
                )
                if ev is not None
            }

            ev_name = str(event).lower()
            is_started = (event in started_events) or ("started" in ev_name and "slic" in ev_name)
            is_complete = (event in complete_events) or (
                not is_started and any(tok in ev_name for tok in ("complete", "finished", "gcodeexport", "sliced"))
            )

            if is_started:
                now = time.time()
                if not _BATCH_SLICING or _SLICE_START_TIME == 0.0:
                    _SLICE_START_TIME = now
                _BATCH_SLICING = True
                try:
                    self.post_message({"type": "slicing_started", "timestamp": _SLICE_START_TIME})
                except Exception:
                    pass
                return

            if is_complete:
                if "jobcomplete" in ev_name or "slicingcomplete" in ev_name or (
                    getattr(le, "SlicingJobComplete", None) == event if le else False
                ):
                    _BATCH_SLICING = False

                try:
                    evt_code_cls = getattr(orca, "LifecycleEvtCode", None)
                    err_code = getattr(evt_code_cls, "Error", None) if evt_code_cls else None
                    if err_code is not None and getattr(ctx, "code", None) == err_code:
                        err_msg = getattr(ctx, "msg", "Slicing failed inside OrcaSlicer.")
                        self.post_message({"type": "slicing_error", "message": str(err_msg)})
                        return
                except Exception:
                    pass

                explicit_paths = _extract_ctx_paths(ctx)
                host_info = _collect_host_context(
                    include_temp_gcode_scan=True,
                    explicit_paths=explicit_paths,
                )
                all_paths = host_info.get("discoveredGcodePaths") or [
                    p for p in explicit_paths if _is_sliced_plate_gcode(Path(p))
                ]

                if all_paths:
                    payload = _build_payload_from_gcodes(all_paths, host_info)
                    _save_snapshot(payload)
                    try:
                        self.post_message({"type": "slice_complete", "payload": payload})
                    except Exception:
                        pass
                else:
                    temp_roots_list = _get_temp_roots()
                    extracted_3mf = _extract_3mf_sliced_gcodes(temp_roots_list, set(temp_roots_list))
                    if extracted_3mf:
                        payload = _build_payload_from_extracted_entries(extracted_3mf, host_info)
                        _save_snapshot(payload)
                        try:
                            self.post_message({"type": "slice_complete", "payload": payload})
                        except Exception:
                            pass
                    else:
                        snapshot = _load_snapshot()
                        if snapshot is not None:
                            try:
                                self.post_message({"type": "slice_complete", "payload": snapshot})
                            except Exception:
                                pass
        except Exception:
            pass


# ---------------------------------------------------------------------------
# 2. Slicing Pipeline Hook (Runs on worker thread right after G-code gen)
# ---------------------------------------------------------------------------
class LayerCostSlicingHook(orca.slicing.SlicingPipelineCapabilityBase):
    def get_name(self) -> str:
        return "LayerCost Post-Slice Extractor"

    def execute(self, ctx: Any) -> Any:
        try:
            step_cls = getattr(getattr(orca, "slicing", None), "Step", None)
            post_step = getattr(step_cls, "psGCodePostProcess", None) if step_cls else None
            cur_step = getattr(ctx, "step", None)
            has_direct_gcode = bool(getattr(ctx, "gcode_path", None))
            if not has_direct_gcode and post_step is not None and cur_step is not None and cur_step != post_step:
                return orca.ExecutionResult.success()

            explicit_paths = _extract_ctx_paths(ctx)
            if explicit_paths:
                host_info = _collect_host_context(include_temp_gcode_scan=False)
                all_plates = _discover_plate_gcodes(explicit_paths=explicit_paths)
                target_paths = all_plates or [p for p in explicit_paths if _is_sliced_plate_gcode(Path(p))]
                if target_paths:
                    payload = _build_payload_from_gcodes(target_paths, host_info)
                    _save_snapshot(payload)
                    if _ACTIVE_PAGE_INSTANCE is not None:
                        try:
                            _ACTIVE_PAGE_INSTANCE.post_message({"type": "slice_complete", "payload": payload})
                        except Exception:
                            pass
        except Exception as exc:
            return orca.ExecutionResult.success(f"LayerCost hook skipped: {exc}")

        return orca.ExecutionResult.success("LayerCost extracted sliced job metrics")


# ---------------------------------------------------------------------------
# 3. Utility Script Capability (Manual trigger from OrcaSlicer Plugins menu)
# ---------------------------------------------------------------------------
class LayerCostPullScript(orca.script.ScriptPluginCapabilityBase):
    def get_name(self) -> str:
        return "Pull Current Slice to LayerCost"

    def execute(self) -> Any:
        host_info = _collect_host_context(include_temp_gcode_scan=True)
        discovered_all = host_info.get("discoveredGcodePaths") or []
        payload: dict[str, Any] | None = None
        if discovered_all:
            payload = _build_payload_from_gcodes(discovered_all, host_info)
        else:
            temp_roots_list = _get_temp_roots()
            extracted_3mf = _extract_3mf_sliced_gcodes(temp_roots_list, set(temp_roots_list))
            if extracted_3mf:
                payload = _build_payload_from_extracted_entries(extracted_3mf, host_info)

        if payload and payload.get("files"):
            _save_snapshot(payload)
            if _ACTIVE_PAGE_INSTANCE is not None:
                try:
                    _ACTIVE_PAGE_INSTANCE.post_message({"type": "slice_complete", "payload": payload})
                except Exception:
                    pass
            try:
                files = payload["files"]
                total_secs = sum(f["printTimeSeconds"] for f in files)
                total_grams = round(sum(f["filamentGrams"] for f in files), 1)
                summary_label = (
                    f"{len(files)} Plates Pulled"
                    if len(files) > 1
                    else files[0]["fileName"]
                )
                orca.host.ui.message(
                    "LayerCost Updated",
                    f"Pulled {summary_label}\\nTotal Print Time: {_format_seconds_hms(total_secs)} · Filament: {total_grams}g\\nOpen the 'LayerCost' tab to review quote & export PDF.",
                )
            except Exception:
                pass
            return orca.ExecutionResult.success(f"Pulled {len(payload['files'])} plate(s) to LayerCost")

        return orca.ExecutionResult.success("No sliced G-code detected yet. Please slice a plate first.")


# ---------------------------------------------------------------------------
# Plugin Package Entrypoint
# ---------------------------------------------------------------------------
@orca.plugin
class LayerCostPlugin(orca.base):
    def register_capabilities(self) -> None:
        try:
            read_roots = [str(p) for p in _get_temp_roots()] or [tempfile.gettempdir()]
            orca.request_permissions(
                fs_read=read_roots,
                fs_write=[],
            )
        except Exception:
            pass

        orca.register_capability(LayerCostPage)
        orca.register_capability(LayerCostSlicingHook)
        orca.register_capability(LayerCostPullScript)


# ---------------------------------------------------------------------------
# Compressed Standalone LayerCost Web UI Bundle (zlib + base64)
# ---------------------------------------------------------------------------
_EMBEDDED_UI_ZLIB_B64 = (
${wrappedBase64}
)
`;
}

main().catch((err) => {
  console.error('[LayerCost] Plugin build failed:', err);
  process.exit(1);
});

