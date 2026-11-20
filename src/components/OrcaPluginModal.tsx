import React, { useState } from 'react';
import {
  X,
  Download,
  Copy,
  Check,
  Terminal,
  Cpu,
  Layers,
  Zap,
  Play,
  FolderOpen,
  CheckCircle2,
} from 'lucide-react';
import { dispatchSimulatedOrcaSlice } from '../utils/orcaBridge';

interface OrcaPluginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type OsTarget = 'windows' | 'macos' | 'linux';

const PLUGIN_PATHS: Record<OsTarget, { label: string; path: string; note: string }> = {
  windows: {
    label: 'Windows (10/11)',
    path: '%APPDATA%\\OrcaSlicer\\plugins\\layercost_plugin.py',
    note: 'Press Win + R, paste %APPDATA%\\OrcaSlicer\\plugins\\ and press Enter.',
  },
  macos: {
    label: 'macOS',
    path: '~/Library/Application Support/OrcaSlicer/plugins/layercost_plugin.py',
    note: 'In Finder press Cmd + Shift + G and paste the plugins folder path.',
  },
  linux: {
    label: 'Linux',
    path: '~/.config/OrcaSlicer/plugins/layercost_plugin.py',
    note: 'Create the plugins directory if it does not exist yet (mkdir -p ~/.config/OrcaSlicer/plugins).',
  },
};

export const OrcaPluginModal: React.FC<OrcaPluginModalProps> = ({ isOpen, onClose }) => {
  const [selectedOs, setSelectedOs] = useState<OsTarget>('windows');
  const [copiedPath, setCopiedPath] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadDone, setDownloadDone] = useState<boolean>(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopyPath = () => {
    navigator.clipboard.writeText(PLUGIN_PATHS[selectedOs].path);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 2000);
  };

  const handleDownloadPlugin = async () => {
    setIsDownloading(true);
    setDownloadError(null);
    try {
      const response = await fetch('/layercost_plugin.py', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const pluginText = await response.text();
      if (!pluginText.includes('[tool.orcaslicer.plugin]')) {
        throw new Error('Plugin bundle is not built yet.');
      }
      const blob = new Blob([pluginText], { type: 'text/x-python;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'layercost_plugin.py';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setDownloadDone(true);
      setTimeout(() => setDownloadDone(false), 3500);
    } catch (err) {
      console.error('Failed to download OrcaSlicer plugin:', err);
      setDownloadError('Could not fetch the compiled standalone plugin bundle. Run npm run build to regenerate.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleSimulateSlice = () => {
    onClose();
    setTimeout(() => {
      dispatchSimulatedOrcaSlice();
    }, 150);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs overflow-y-auto no-print">
      <div className="relative w-full max-w-2xl bg-[#2d2d30] border border-[#45454a] rounded-md shadow-2xl text-zinc-100 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#3f3f44] bg-[#1e1e20]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-[#00ae42]/15 border border-[#00ae42]/40 flex items-center justify-center text-[#00c44b]">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>OrcaSlicer Standalone Plugin</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#232325] text-[#26b4b0] border border-[#45454a]">
                  v2.5.0+ Native API
                </span>
              </h2>
              <p className="text-[11px] text-zinc-400">
                Runs directly inside OrcaSlicer & pulls sliced job data automatically after slicing
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded hover:bg-[#36363a] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Architecture Feature Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded bg-[#232325] border border-[#3a3a3f] space-y-1.5">
              <div className="flex items-center gap-1.5 text-[#26b4b0] font-semibold">
                <Layers className="w-4 h-4 shrink-0" />
                <span>Native Slicer Tab</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Registers <code className="text-zinc-300 font-mono">PagesPluginCapabilityBase</code> to add a full offline <strong className="text-zinc-200">LayerCost</strong> tab beside Prepare, Preview & Device.
              </p>
            </div>

            <div className="p-3 rounded bg-[#232325] border border-[#3a3a3f] space-y-1.5">
              <div className="flex items-center gap-1.5 text-[#f58220] font-semibold">
                <Zap className="w-4 h-4 shrink-0" />
                <span>Auto Post-Slice Pull</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Hooks <code className="text-zinc-300 font-mono">psGCodePostProcess</code> & <code className="text-zinc-300 font-mono">SlicingJobComplete</code> to extract print time, all plates, AMS grams & presets.
              </p>
            </div>

            <div className="p-3 rounded bg-[#232325] border border-[#3a3a3f] space-y-1.5">
              <div className="flex items-center gap-1.5 text-[#00c44b] font-semibold">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>100% Self-Contained</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Zero pip dependencies and zero external servers required. Entire React UI + quote PDF engine runs locally inside OrcaSlicer.
              </p>
            </div>
          </div>

          {/* Primary Download Box */}
          <div className="p-4 rounded bg-[#232325] border border-[#00ae42]/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-sm font-bold text-white font-mono flex items-center gap-2">
                <span>layercost_plugin.py</span>
                <span className="text-[10px] font-sans font-semibold px-1.5 py-0.5 rounded bg-[#00ae42]/15 text-[#00c44b] border border-[#00ae42]/40">
                  PEP 723 Single-File
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Includes OrcaSlicer-matched UI, multi-plate aggregation, world currencies, material pricing presets, and commercial PDF quote engine.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownloadPlugin}
              disabled={isDownloading}
              className="px-4 py-2.5 bg-[#00ae42] hover:bg-[#00c44b] text-white font-semibold rounded transition-colors flex items-center justify-center gap-2 shrink-0 active:scale-95 cursor-pointer disabled:opacity-60"
            >
              {downloadDone ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Downloaded .py!</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>{isDownloading ? 'Preparing...' : 'Download Standalone Plugin (.py)'}</span>
                </>
              )}
            </button>
          </div>

          {downloadError && (
            <div className="p-3 rounded bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs">
              {downloadError}
            </div>
          )}

          {/* Installation Guide */}
          <div className="p-4 rounded bg-[#232325] border border-[#3a3a3f] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white flex items-center gap-1.5">
                <FolderOpen className="w-4 h-4 text-[#00c44b]" />
                <span>1-Minute Installation in OrcaSlicer</span>
              </h3>
              <div className="flex bg-[#1e1e20] border border-[#45454a] rounded p-0.5 text-[11px]">
                {(['windows', 'macos', 'linux'] as OsTarget[]).map((os) => (
                  <button
                    key={os}
                    type="button"
                    onClick={() => setSelectedOs(os)}
                    className={`px-2.5 py-1 rounded-xs transition-colors capitalize cursor-pointer ${
                      selectedOs === os
                        ? 'bg-[#00ae42]/20 text-[#00c44b] font-semibold'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {os === 'macos' ? 'macOS' : os}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 bg-[#1e1e20] border border-[#45454a] rounded px-3 py-2 font-mono text-[11px] text-zinc-200">
              <Terminal className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              <span className="truncate flex-1 select-all">{PLUGIN_PATHS[selectedOs].path}</span>
              <button
                type="button"
                onClick={handleCopyPath}
                className="px-2 py-1 bg-[#36363a] hover:bg-[#45454a] text-[#00c44b] rounded border border-[#4e4e54] flex items-center gap-1 text-[10px] font-sans cursor-pointer shrink-0"
              >
                {copiedPath ? <Check className="w-3 h-3 text-[#00c44b]" /> : <Copy className="w-3 h-3" />}
                <span>{copiedPath ? 'Copied' : 'Copy Path'}</span>
              </button>
            </div>
            <p className="text-[11px] text-zinc-400">{PLUGIN_PATHS[selectedOs].note}</p>

            <ol className="space-y-1.5 text-[11px] text-zinc-300 list-decimal list-inside pt-1">
              <li>
                Save <code className="text-[#00c44b] font-mono">layercost_plugin.py</code> into the OrcaSlicer plugins folder above.
              </li>
              <li>
                Open OrcaSlicer &rarr; <strong className="text-white">Preferences &rarr; Plugins</strong> (or Plugins menu) and enable <strong className="text-white">LayerCost</strong>.
              </li>
              <li>
                <em>(Optional for guaranteed post-slice capture)</em> In <strong className="text-white">Process Settings &rarr; Others</strong>, enable the <code className="text-[#26b4b0] font-mono">LayerCost Post-Slice Extractor</code> pipeline step.
              </li>
              <li>
                Slice any model or multi-plate project — click the <strong className="text-[#00c44b]">LayerCost</strong> tab at the top of OrcaSlicer and your print time, all plates, AMS filaments, and pricing populate automatically!
              </li>
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-t border-[#3f3f44] bg-[#1e1e20]">
          <button
            type="button"
            onClick={handleSimulateSlice}
            className="px-3 py-1.5 text-xs font-medium text-[#26b4b0] hover:text-white bg-[#36363a] hover:bg-[#424247] border border-[#26b4b0]/40 rounded transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Test how OrcaSlicer automatically pushes a sliced multi-plate job into LayerCost"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Simulate Post-Slice Auto-Pull</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-white bg-[#36363a] hover:bg-[#45454a] border border-[#4e4e54] rounded transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
