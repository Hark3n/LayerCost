import {
  CustomFilamentPreset,
  FilamentEntry,
  GcodeFileItem,
  GcodeMetadata,
  PrinterPreset,
} from '../types/calculator';
import { MATERIAL_PRESETS, PRINTER_PRESETS } from '../data/presets';
import {
  OrcaBridgePayload,
  OrcaIncomingMessage,
  OrcaOutgoingMessage,
} from '../types/orca';
import { formatSecondsToHms } from './gcodeParser';
import {
  CUSTOM_FILAMENTS_STORAGE_KEY,
  loadFilamentPricingPrefs,
  safeGetItem,
} from './storage';

const DEFAULT_COLORS = ['#38bdf8', '#f97316', '#10b981', '#a855f7', '#eab308', '#ef4444'];

/**
 * Returns true when the app is executing inside OrcaSlicer's embedded Page WebView.
 */
export function isRunningInOrcaSlicer(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.orca !== 'undefined' &&
    typeof window.orca.postMessage === 'function'
  );
}

/**
 * Sends a typed JSON message from the embedded UI to the Python plugin backend.
 */
export function postToOrca(msg: OrcaOutgoingMessage): boolean {
  if (!isRunningInOrcaSlicer() || !window.orca) return false;
  try {
    window.orca.postMessage(msg);
    return true;
  } catch (err) {
    console.warn('OrcaSlicer postMessage failed:', err);
    return false;
  }
}

/**
 * Subscribes to messages coming from OrcaSlicer Python plugin (`self.post_message(...)`).
 */
export function subscribeOrcaMessages(
  handler: (msg: OrcaIncomingMessage) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  const bridgeAvailable =
    typeof window.orca !== 'undefined' &&
    typeof window.orca.onMessage === 'function';

  const wrappedHandler = (raw: unknown) => {
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === 'object') {
        handler(parsed as OrcaIncomingMessage);
      }
    } catch (err) {
      console.warn('Failed to process OrcaSlicer message:', err);
    }
  };

  if (bridgeAvailable && window.orca) {
    try {
      window.orca.onMessage(wrappedHandler as (data: OrcaIncomingMessage) => void);
    } catch (err) {
      console.warn('OrcaSlicer onMessage registration failed:', err);
    }
  }

  // Also support a custom DOM event so browser simulator / host injections work cleanly
  const domListener = (evt: Event) => {
    const customEvent = evt as CustomEvent<OrcaIncomingMessage>;
    if (customEvent.detail) {
      handler(customEvent.detail);
    }
  };
  window.addEventListener('orcaslicer-message', domListener);

  return () => {
    window.removeEventListener('orcaslicer-message', domListener);
  };
}

/**
 * Requests the latest sliced data snapshot from the OrcaSlicer Python plugin.
 */
export function requestLatestSliceFromOrca(): boolean {
  return postToOrca({ type: 'pull_slice_data' });
}

/**
 * Sends invoice HTML to OrcaSlicer Python storage when running inside the slicer WebView.
 */
export function saveInvoiceViaOrca(filename: string, html: string): boolean {
  return postToOrca({ type: 'save_invoice_html', filename, html });
}

/**
 * Fuzzy-matches an OrcaSlicer printer profile name against LayerCost printer presets.
 */
export function matchPrinterPreset(printerName?: string): PrinterPreset | null {
  if (!printerName) return null;
  const q = printerName.toLowerCase();

  if (q.includes('x1c') || q.includes('x1-carbon') || q.includes('x1 carbon') || q.includes('x1e')) {
    return PRINTER_PRESETS.find((p) => p.id === 'bambu-x1c') || null;
  }
  if (q.includes('p1s') || q.includes('p1p') || q.includes('a1')) {
    return PRINTER_PRESETS.find((p) => p.id === 'bambu-p1s') || null;
  }
  if (q.includes('xl')) {
    return PRINTER_PRESETS.find((p) => p.id === 'prusa-xl') || null;
  }
  if (q.includes('mk4') || q.includes('mk3') || q.includes('prusa')) {
    return PRINTER_PRESETS.find((p) => p.id === 'prusa-mk4s') || null;
  }
  if (q.includes('k1')) {
    return PRINTER_PRESETS.find((p) => p.id === 'creality-k1-max') || null;
  }
  if (q.includes('ender')) {
    return PRINTER_PRESETS.find((p) => p.id === 'creality-ender3-v3') || null;
  }
  if (q.includes('voron')) {
    return PRINTER_PRESETS.find((p) => p.id === 'voron-2-4') || null;
  }
  if (q.includes('neptune') || q.includes('elegoo')) {
    return PRINTER_PRESETS.find((p) => p.id === 'elegoo-neptune4-pro') || null;
  }

  return null;
}

/**
 * Resolves filament spool pricing from the user's saved custom filaments first,
 * falling back to standard material presets.
 */
export function resolveFilamentPricing(
  type: string,
  name?: string,
  slot?: number
): { spoolPrice: number; spoolWeightGrams: number; resolvedName?: string; colorHex?: string } {
  const normType = (type || 'PLA').toUpperCase().trim();
  const normName = (name || '').toLowerCase().trim();

  try {
    const rawCustom = safeGetItem(CUSTOM_FILAMENTS_STORAGE_KEY);
    if (rawCustom) {
      const customs: CustomFilamentPreset[] = JSON.parse(rawCustom);
      // 1. Exact/partial name match
      if (normName) {
        const byName = customs.find(
          (c) =>
            c.name.toLowerCase().includes(normName) ||
            normName.includes(c.name.toLowerCase())
        );
        if (byName) {
          return {
            spoolPrice: byName.spoolPrice,
            spoolWeightGrams: byName.spoolWeightGrams,
            resolvedName: byName.name,
            colorHex: byName.colorHex,
          };
        }
      }
      // 2. Type match in custom library
      const byType = customs.find((c) => c.type.toUpperCase() === normType);
      if (byType) {
        return {
          spoolPrice: byType.spoolPrice,
          spoolWeightGrams: byType.spoolWeightGrams,
          resolvedName: byType.name,
          colorHex: byType.colorHex,
        };
      }
    }
  } catch {
    // ignore storage errors
  }

  // 3. User's saved inline spool edits (persists manual changes to filament price/weight/name)
  try {
    const prefs = loadFilamentPricingPrefs();
    const byName = normName ? prefs[`name:${normName}`] : undefined;
    const bySlot = slot ? prefs[`slot:${slot}:${normType}`] : undefined;
    const byType = prefs[`type:${normType}`];
    const matchedPref = byName || bySlot || byType;
    if (matchedPref && matchedPref.spoolPrice >= 0) {
      return {
        spoolPrice: matchedPref.spoolPrice,
        spoolWeightGrams: Math.max(1, matchedPref.spoolWeightGrams || 1000),
        resolvedName: matchedPref.name,
        colorHex: matchedPref.colorHex,
      };
    }
  } catch {
    // ignore storage errors
  }

  // Built-in standard material presets
  const preset =
    MATERIAL_PRESETS.find((m) => m.type.toUpperCase() === normType) ||
    MATERIAL_PRESETS.find((m) => normType.includes(m.type.toUpperCase())) ||
    MATERIAL_PRESETS[0];

  return {
    spoolPrice: preset.spoolPrice,
    spoolWeightGrams: preset.spoolWeightGrams,
  };
}

/**
 * Converts an incoming OrcaSlicer bridge payload into strongly-typed LayerCost queue items & filament slots.
 * Supports multi-plate payloads by building all plate files and aggregating filaments across all plates.
 */
export function convertOrcaPayloadToJob(payload: OrcaBridgePayload): {
  files: GcodeFileItem[];
  filaments: FilamentEntry[];
  matchedPrinter: PrinterPreset | null;
  projectName?: string;
} {
  const now = Date.now();
  const matchedPrinter = matchPrinterPreset(payload.printerName);
  const incomingFiles = payload.files || [];

  // 1. Build filament slots (use top-level aggregated filaments first; otherwise aggregate across ALL plates)
  let filaments: FilamentEntry[] = [];
  if (payload.filaments && payload.filaments.length > 0) {
    filaments = payload.filaments.map((f, idx) => {
      const slotNum = f.slot || idx + 1;
      const pricing = resolveFilamentPricing(f.type, f.name, slotNum);
      return {
        id: `orca-fil-${slotNum}-${now}`,
        name: f.name || pricing.resolvedName || `AMS Slot ${slotNum} (${f.type || 'PLA'})`,
        type: (f.type || 'PLA').toUpperCase(),
        spoolPrice: f.spoolPrice ?? pricing.spoolPrice,
        spoolWeightGrams: f.spoolWeightGrams ?? pricing.spoolWeightGrams,
        gramsUsed: Math.round((f.gramsUsed || 0) * 10) / 10,
        purgeGrams: Math.round((f.purgeGrams || 0) * 10) / 10,
        colorHex: f.colorHex || pricing.colorHex || DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
      };
    });
  } else if (incomingFiles.length > 0) {
    const slotMap = new Map<
      string,
      {
        slot: number;
        name: string;
        type: string;
        gramsUsed: number;
        purgeGrams: number;
        colorHex: string;
      }
    >();

    incomingFiles.forEach((f) => {
      if (f.multiFilaments && f.multiFilaments.length > 0) {
        f.multiFilaments.forEach((m, mIdx) => {
          const mType = (m.type || 'PLA').toUpperCase();
          const slotNum = m.slot || mIdx + 1;
          const key = `${slotNum}:${mType}:${m.name || ''}`;
          const existing = slotMap.get(key);
          if (existing) {
            existing.gramsUsed += m.grams || 0;
            existing.purgeGrams += m.purgeGrams || 0;
          } else {
            slotMap.set(key, {
              slot: slotNum,
              name: m.name || `AMS Slot ${slotNum} (${mType})`,
              type: mType,
              gramsUsed: m.grams || 0,
              purgeGrams: m.purgeGrams || 0,
              colorHex: m.colorHex || DEFAULT_COLORS[mIdx % DEFAULT_COLORS.length],
            });
          }
        });
      } else if ((f.filamentGrams || 0) > 0) {
        const fType = (f.filamentType || 'PLA').toUpperCase();
        const key = `1:${fType}`;
        const existing = slotMap.get(key);
        if (existing) {
          existing.gramsUsed += f.filamentGrams || 0;
        } else {
          slotMap.set(key, {
            slot: 1,
            name: `Primary ${fType} Spool`,
            type: fType,
            gramsUsed: f.filamentGrams || 0,
            purgeGrams: 0,
            colorHex: DEFAULT_COLORS[0],
          });
        }
      }
    });

    filaments = Array.from(slotMap.values()).map((s, idx) => {
      const pricing = resolveFilamentPricing(s.type, s.name, s.slot);
      return {
        id: `orca-fil-${s.slot}-${idx}-${now}`,
        name: pricing.resolvedName || s.name,
        type: s.type,
        spoolPrice: pricing.spoolPrice,
        spoolWeightGrams: pricing.spoolWeightGrams,
        gramsUsed: Math.round(s.gramsUsed * 10) / 10,
        purgeGrams: Math.round(s.purgeGrams * 10) / 10,
        colorHex: s.colorHex || pricing.colorHex,
      };
    });
  }

  // 2. Build G-code file entries for ALL plates
  const files: GcodeFileItem[] = incomingFiles.map((f, idx) => {
    const metadata: GcodeMetadata = {
      fileName: f.fileName || `OrcaSlicer_Plate_${idx + 1}.gcode`,
      fileSizeBytes: f.fileSizeBytes || 0,
      slicer: f.slicer || payload.slicerVersion || 'OrcaSlicer 2.5+',
      printTimeSeconds: Math.max(1, f.printTimeSeconds || 0),
      printTimeFormatted: f.printTimeFormatted || formatSecondsToHms(f.printTimeSeconds || 0),
      filamentGrams: Math.round((f.filamentGrams || 0) * 10) / 10,
      filamentMeters: Math.round((f.filamentMeters || 0) * 10) / 10,
      filamentVolumeCm3: Math.round((f.filamentVolumeCm3 || 0) * 10) / 10,
      layerCount: Math.max(1, f.layerCount || 1),
      layerHeightMm: f.layerHeightMm || 0.2,
      bedTempC: f.bedTempC,
      nozzleTempC: f.nozzleTempC,
      filamentType: f.filamentType,
      dimensions: f.dimensions,
      multiFilaments: f.multiFilaments?.map((m) => ({
        slot: m.slot,
        grams: m.grams,
        type: m.type,
        colorHex: m.colorHex,
      })),
    };

    // Match this plate to its primary filament slot (prefer matching slot/type)
    let matchedFilamentId = filaments[0]?.id;
    const primaryType = (f.multiFilaments?.[0]?.type || f.filamentType || '').toUpperCase();
    const primaryName = (f.multiFilaments?.[0]?.name || '').toLowerCase();
    if (filaments.length > 1) {
      const exactMatch = filaments.find(
        (fil) =>
          (primaryName && fil.name.toLowerCase() === primaryName) ||
          (primaryType && fil.type.toUpperCase() === primaryType)
      );
      if (exactMatch) {
        matchedFilamentId = exactMatch.id;
      }
    }

    return {
      id: `orca-file-${now}-${idx}`,
      fileName: metadata.fileName,
      metadata,
      quantity: Math.max(1, f.quantity || 1),
      assignedFilamentId: matchedFilamentId,
      enabled: true,
    };
  });

  const cleanProject =
    payload.projectName ||
    (files[0]?.fileName ? files[0].fileName.replace(/\.gcode(\.3mf)?$/i, '') : undefined);

  return {
    files,
    filaments,
    matchedPrinter,
    projectName: cleanProject,
  };
}

/**
 * Dispatches a simulated multi-plate OrcaSlicer post-slice message for testing in browser mode.
 */
export function dispatchSimulatedOrcaSlice(): void {
  const simulatedPayload: OrcaBridgePayload = {
    source: 'orcaslicer-simulator',
    capturedAt: new Date().toISOString(),
    projectName: 'Industrial_Motor_Mount_v4',
    plateName: '2 Plates Sliced',
    plateCount: 2,
    printerName: 'Bambu Lab X1 Carbon 0.4 nozzle',
    slicerVersion: 'OrcaSlicer 2.5.0',
    objects: [
      {
        name: 'Motor_Housing_Main.step',
        instances: 2,
        dimensions: { width: 124.5, depth: 98.2, height: 52.0 },
      },
      {
        name: 'Gearbox_Cover_Plate2.step',
        instances: 1,
        dimensions: { width: 112.0, depth: 90.4, height: 28.0 },
      },
    ],
    filaments: [
      {
        slot: 1,
        name: 'Slot 1 · eSUN PETG Matte Black',
        type: 'PETG',
        gramsUsed: 204.2,
        purgeGrams: 14.8,
        colorHex: '#38bdf8',
      },
      {
        slot: 2,
        name: 'Slot 2 · Bambu Orange Accent PLA/Support',
        type: 'PLA',
        gramsUsed: 38.4,
        purgeGrams: 8.6,
        colorHex: '#f97316',
      },
    ],
    files: [
      {
        plateIndex: 1,
        plateName: 'Plate 1',
        fileName: 'Industrial_Motor_Mount_v4_plate_1.gcode',
        fileSizeBytes: 14820410,
        slicer: 'OrcaSlicer 2.5.0',
        printTimeSeconds: 19620, // 5h 27m
        printTimeFormatted: '5h 27m 00s',
        filamentGrams: 167.4,
        filamentMeters: 54.8,
        filamentVolumeCm3: 132.9,
        layerCount: 260,
        layerHeightMm: 0.2,
        bedTempC: 75,
        nozzleTempC: 245,
        filamentType: 'PETG',
        dimensions: {
          width: 124.5,
          depth: 98.2,
          height: 52.0,
          minX: 65.0,
          maxX: 189.5,
          minY: 78.0,
          maxY: 176.2,
          minZ: 0.2,
          maxZ: 52.2,
        },
        multiFilaments: [
          { slot: 1, grams: 142.6, purgeGrams: 11.4, type: 'PETG', colorHex: '#38bdf8' },
          { slot: 2, grams: 24.8, purgeGrams: 6.2, type: 'PLA', colorHex: '#f97316' },
        ],
        quantity: 1,
      },
      {
        plateIndex: 2,
        plateName: 'Plate 2',
        fileName: 'Industrial_Motor_Mount_v4_plate_2.gcode',
        fileSizeBytes: 7410200,
        slicer: 'OrcaSlicer 2.5.0',
        printTimeSeconds: 8940, // 2h 29m
        printTimeFormatted: '2h 29m 00s',
        filamentGrams: 75.2,
        filamentMeters: 24.5,
        filamentVolumeCm3: 59.8,
        layerCount: 140,
        layerHeightMm: 0.2,
        bedTempC: 75,
        nozzleTempC: 245,
        filamentType: 'PETG',
        dimensions: {
          width: 112.0,
          depth: 90.4,
          height: 28.0,
          minX: 72.0,
          maxX: 184.0,
          minY: 82.0,
          maxY: 172.4,
          minZ: 0.2,
          maxZ: 28.2,
        },
        multiFilaments: [
          { slot: 1, grams: 61.6, purgeGrams: 3.4, type: 'PETG', colorHex: '#38bdf8' },
          { slot: 2, grams: 13.6, purgeGrams: 2.4, type: 'PLA', colorHex: '#f97316' },
        ],
        quantity: 1,
      },
    ],
  };

  window.dispatchEvent(
    new CustomEvent<OrcaIncomingMessage>('orcaslicer-message', {
      detail: {
        type: 'slice_complete',
        payload: simulatedPayload,
      },
    })
  );
}
