import React from 'react';
import { GcodeFileItem, FilamentEntry } from '../types/calculator';
import { SAMPLE_GCODES } from '../data/presets';
import {
  FileCode,
  Layers,
  Clock,
  Trash2,
  Plus,
  Box,
  CheckCircle2,
  Circle,
  Sparkles,
  ChevronDown,
  UploadCloud,
} from 'lucide-react';

interface JobFilesQueueProps {
  files: GcodeFileItem[];
  activeFileId: string | null;
  onSelectActiveFile: (id: string) => void;
  onToggleFile: (id: string) => void;
  onChangeQuantity: (id: string, qty: number) => void;
  onAssignFilament: (id: string, filamentId: string) => void;
  onRemoveFile: (id: string) => void;
  onAddSample: (sampleIndex: number) => void;
  onTriggerUpload: () => void;
  filaments: FilamentEntry[];
  currencySymbol: string;
}

export const JobFilesQueue: React.FC<JobFilesQueueProps> = ({
  files,
  activeFileId,
  onSelectActiveFile,
  onToggleFile,
  onChangeQuantity,
  onAssignFilament,
  onRemoveFile,
  onAddSample,
  onTriggerUpload,
  filaments,
  currencySymbol,
}) => {
  const activeFiles = files.filter((f) => f.enabled);
  const totalParts = activeFiles.reduce((acc, f) => acc + f.quantity, 0);
  const totalPrintSeconds = activeFiles.reduce(
    (acc, f) => acc + f.metadata.printTimeSeconds * f.quantity,
    0
  );
  const totalFilamentGrams = activeFiles.reduce(
    (acc, f) => acc + f.metadata.filamentGrams * f.quantity,
    0
  );

  const formatHoursMins = (secs: number) => {
    const totalMins = Math.round(secs / 60);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return `${h}h ${m}m`;
  };

  return (
    <div className="p-4 sm:p-5 rounded-md border border-[#3f3f44] bg-[#2d2d30] space-y-4">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-[#3f3f44] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-[#00ae42]/15 border border-[#00ae42]/40 flex items-center justify-center text-[#00c44b]">
            <Box className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white flex flex-wrap items-center gap-2">
              <span>Multi-File Job Queue</span>
              <span className="text-[11px] font-mono font-normal text-zinc-400 tabular-nums">
                · {activeFiles.length}/{files.length} active ({totalParts} {totalParts === 1 ? 'plate' : 'plates'})
              </span>
            </h3>
            <p className="text-xs text-zinc-400">
              Combine multiple sliced G-code components or build plates into a consolidated production run.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Sample Dropdown */}
          <div className="relative group">
            <button
              type="button"
              className="px-3 py-1.5 text-xs font-medium text-zinc-200 hover:text-white bg-[#36363a] hover:bg-[#424247] rounded transition-colors flex items-center gap-1.5 border border-[#4e4e54] cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#f58220]" />
              <span>+ Add Sample Model</span>
              <ChevronDown className="w-3 h-3 text-zinc-400" />
            </button>
            <div className="absolute right-0 mt-1 w-60 py-1 bg-[#1e1e20] border border-[#4e4e54] rounded-md shadow-xl z-20 hidden group-hover:block hover:block">
              {SAMPLE_GCODES.map((sample, idx) => (
                <button
                  key={idx}
                  onClick={() => onAddSample(idx)}
                  className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-[#36363a] hover:text-white transition-colors flex flex-col cursor-pointer"
                >
                  <span className="font-medium text-zinc-200">{sample.label}</span>
                  <span className="text-[10px] text-zinc-400 truncate">{sample.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={onTriggerUpload}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-[#00ae42] hover:bg-[#00c44b] rounded transition-colors flex items-center gap-1.5 active:scale-95 cursor-pointer"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>+ Add G-Code Files</span>
          </button>
        </div>
      </div>

      {/* Files List / Table */}
      {files.length === 0 ? (
        <div className="p-8 text-center border border-dashed border-[#45454a] rounded bg-[#232325]">
          <FileCode className="w-10 h-10 text-zinc-500 mx-auto mb-2" />
          <h4 className="text-sm font-medium text-zinc-300">No G-code files loaded</h4>
          <p className="text-xs text-zinc-500 mt-1 mb-4">
            Drag and drop your slicer files or click the button below to add your first 3D print model.
          </p>
          <button
            type="button"
            onClick={onTriggerUpload}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#00ae42] hover:bg-[#00c44b] rounded inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Upload G-Code File</span>
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {files.map((file) => {
            const isSelectedForPreview = activeFileId === file.id;
            const singleTime = file.metadata.printTimeSeconds;
            const totalTime = singleTime * file.quantity;
            const singleGrams = file.metadata.filamentGrams;
            const totalGrams = singleGrams * file.quantity;

            return (
              <div
                key={file.id}
                onClick={() => onSelectActiveFile(file.id)}
                className={`p-3 rounded border transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer ${
                  !file.enabled
                    ? 'border-[#3a3a3f] bg-[#232325]/60 opacity-60'
                    : isSelectedForPreview
                    ? 'border-[#00ae42] bg-[#232325]'
                    : 'border-[#3a3a3f] bg-[#232325] hover:border-[#525259]'
                }`}
              >
                {/* File Identity & Enable Checkbox */}
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFile(file.id);
                    }}
                    className="mt-0.5 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                    title={file.enabled ? 'Click to disable file' : 'Click to enable file'}
                  >
                    {file.enabled ? (
                      <CheckCircle2 className="w-5 h-5 text-[#00c44b]" />
                    ) : (
                      <Circle className="w-5 h-5 text-zinc-600" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-sm font-semibold truncate ${
                          file.enabled ? 'text-white' : 'text-zinc-400 line-through'
                        }`}
                        title={file.fileName}
                      >
                        {file.fileName}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#1e1e20] text-zinc-300 border border-[#45454a] font-mono">
                        {file.metadata.slicer}
                      </span>
                      {isSelectedForPreview && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#00ae42]/15 text-[#00c44b] border border-[#00ae42]/40 font-mono font-medium">
                          Selected
                        </span>
                      )}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono text-zinc-400 tabular-nums">
                      <span className="flex items-center gap-1 text-zinc-300">
                        <Clock className="w-3.5 h-3.5 text-[#26b4b0]" />
                        <span>{file.metadata.printTimeFormatted}/plate</span>
                        {file.quantity > 1 && (
                          <span className="text-zinc-500">
                            (Total: <strong className="text-white">{formatHoursMins(totalTime)}</strong>)
                          </span>
                        )}
                      </span>

                      <span className="flex items-center gap-1 text-zinc-300">
                        <Layers className="w-3.5 h-3.5 text-[#f58220]" />
                        <span>{singleGrams}g/plate</span>
                        {file.quantity > 1 && (
                          <span className="text-zinc-500">
                            (Total: <strong className="text-white">{totalGrams.toFixed(1)}g</strong>)
                          </span>
                        )}
                      </span>

                      {file.metadata.dimensions && (
                        <span className="text-zinc-500 text-[11px]">
                          {file.metadata.dimensions.width}×{file.metadata.dimensions.depth}×{file.metadata.dimensions.height}mm
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Controls: Filament Mapping, Quantity Stepper & Delete */}
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="flex flex-wrap items-center gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-[#3a3a3f]"
                >
                  {/* Assigned Filament Slot */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-zinc-400">Spool:</span>
                    <select
                      value={file.assignedFilamentId || filaments[0]?.id || ''}
                      onChange={(e) => onAssignFilament(file.id, e.target.value)}
                      className="bg-[#1e1e20] border border-[#45454a] rounded px-2 py-1 text-xs text-zinc-200 focus:border-[#00ae42] focus:outline-hidden max-w-[140px] truncate"
                      title="Assign which filament spool this file is printed in"
                    >
                      {filaments.map((fil, idx) => (
                        <option key={fil.id} value={fil.id}>
                          Slot {idx + 1}: {fil.name || fil.type}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Quantity Stepper */}
                  <div className="flex items-center bg-[#1e1e20] border border-[#45454a] rounded p-0.5">
                    <button
                      type="button"
                      onClick={() => onChangeQuantity(file.id, Math.max(1, file.quantity - 1))}
                      className="w-6 h-6 rounded-xs bg-[#36363a] hover:bg-[#45454a] text-zinc-200 flex items-center justify-center text-xs font-mono transition-colors cursor-pointer"
                      title="Decrease quantity"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="1"
                      value={file.quantity}
                      onChange={(e) =>
                        onChangeQuantity(file.id, Math.max(1, parseInt(e.target.value, 10) || 1))
                      }
                      className="w-10 text-center bg-transparent py-0.5 text-xs font-mono text-white focus:outline-hidden tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => onChangeQuantity(file.id, file.quantity + 1)}
                      className="w-6 h-6 rounded-xs bg-[#36363a] hover:bg-[#45454a] text-zinc-200 flex items-center justify-center text-xs font-mono transition-colors cursor-pointer"
                      title="Increase quantity"
                    >
                      +
                    </button>
                  </div>

                  {/* Delete Button */}
                  <button
                    type="button"
                    onClick={() => onRemoveFile(file.id)}
                    className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-rose-950/40 rounded transition-colors border border-transparent hover:border-rose-900/60 cursor-pointer"
                    title="Remove file from queue"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Aggregate Queue Metrics Bar */}
      {files.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono bg-[#232325] p-3 rounded border border-[#3a3a3f] tabular-nums">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-zinc-300">
            <div>
              <span className="text-zinc-500">Active Files:</span>{' '}
              <strong className="text-white">{activeFiles.length}</strong>
            </div>
            <div className="text-zinc-600 hidden sm:inline">·</div>
            <div>
              <span className="text-zinc-500">Total Plates:</span>{' '}
              <strong className="text-[#f58220]">{totalParts} {totalParts === 1 ? 'plate' : 'plates'}</strong>
            </div>
            <div className="text-zinc-600 hidden sm:inline">·</div>
            <div>
              <span className="text-zinc-500">Machine Time:</span>{' '}
              <strong className="text-[#00c44b]">{formatHoursMins(totalPrintSeconds)}</strong>
            </div>
            <div className="text-zinc-600 hidden sm:inline">·</div>
            <div>
              <span className="text-zinc-500">Total Material:</span>{' '}
              <strong className="text-white">{totalFilamentGrams.toFixed(1)}g</strong>
            </div>
          </div>

          <div className="text-[11px] text-zinc-400 font-sans">
            Machine wear & electricity are amortized across all active file hours automatically.
          </div>
        </div>
      )}
    </div>
  );
};
