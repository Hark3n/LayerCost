import React, { useState, useEffect } from 'react';
import { FilamentEntry, GcodeFileItem, CustomFilamentPreset } from '../types/calculator';
import { MATERIAL_PRESETS } from '../data/presets';
import { CUSTOM_FILAMENTS_STORAGE_KEY, safeGetItem, safeSetItem } from '../utils/storage';
import { CustomFilamentModal } from './CustomFilamentModal';
import {
  Layers,
  Plus,
  Trash2,
  RefreshCw,
  Palette,
  Sparkles,
  ChevronDown,
  Info,
  Bookmark,
  BookmarkCheck,
  Tag,
} from 'lucide-react';

interface MultiFilamentManagerProps {
  filaments: FilamentEntry[];
  onChangeFilaments: (filaments: FilamentEntry[]) => void;
  files: GcodeFileItem[];
  currencySymbol: string;
  batchMultiplier: number;
  onCustomLibraryChange?: (library: CustomFilamentPreset[]) => void;
}

const PRESET_COLORS = [
  '#38bdf8', // sky blue
  '#f97316', // vibrant orange
  '#e2e8f0', // light grey / zinc
  '#10b981', // emerald green
  '#a855f7', // purple
  '#ef4444', // red
  '#eab308', // amber/gold
  '#6366f1', // indigo
  '#ec4899', // pink
  '#18181b', // dark charcoal / black
];

const FILAMENT_TYPE_PRESETS = [
  { name: 'Standard PLA (eSUN / Creality)', type: 'PLA', price: 22.00, weight: 1000, color: '#38bdf8' },
  { name: 'Silk / Dual-Color PLA', type: 'PLA', price: 26.00, weight: 1000, color: '#a855f7' },
  { name: 'PETG All-Round Tough (Sunlu)', type: 'PETG', price: 24.00, weight: 1000, color: '#f97316' },
  { name: 'ABS Structural Engineering', type: 'ABS', price: 23.00, weight: 1000, color: '#ef4444' },
  { name: 'ASA UV-Resistant Outdoor', type: 'ASA', price: 30.00, weight: 1000, color: '#eab308' },
  { name: 'TPU 95A Flexible Elastic', type: 'TPU', price: 35.00, weight: 1000, color: '#10b981' },
  { name: 'PVA Water-Soluble Support', type: 'PVA', price: 45.00, weight: 500, color: '#6366f1' },
  { name: 'Carbon Fiber Nylon (PA-CF)', type: 'PA-CF', price: 69.00, weight: 1000, color: '#64748b' },
  { name: 'Polycarbonate (PC) High-Temp', type: 'PC', price: 49.00, weight: 1000, color: '#06b6d4' },
];

export const MultiFilamentManager: React.FC<MultiFilamentManagerProps> = ({
  filaments,
  onChangeFilaments,
  files,
  currencySymbol,
  batchMultiplier,
  onCustomLibraryChange,
}) => {
  const [showPresetMenu, setShowPresetMenu] = useState<boolean>(false);
  const [isCustomModalOpen, setIsCustomModalOpen] = useState<boolean>(false);
  const [savedSuccessId, setSavedSuccessId] = useState<string | null>(null);

  // Persistent Custom Filament Library
  const [customLibrary, setCustomLibrary] = useState<CustomFilamentPreset[]>(() => {
    try {
      const stored = safeGetItem(CUSTOM_FILAMENTS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const onHydrated = (evt: Event) => {
      const detail = (evt as CustomEvent<{ customFilaments?: CustomFilamentPreset[] }>).detail;
      if (detail?.customFilaments && Array.isArray(detail.customFilaments)) {
        setCustomLibrary(detail.customFilaments);
      }
    };
    window.addEventListener('layercost-settings-hydrated', onHydrated);
    return () => window.removeEventListener('layercost-settings-hydrated', onHydrated);
  }, []);

  const saveCustomLibrary = (list: CustomFilamentPreset[]) => {
    setCustomLibrary(list);
    try {
      safeSetItem(CUSTOM_FILAMENTS_STORAGE_KEY, JSON.stringify(list));
    } catch {
      // quota fallback
    }
    onCustomLibraryChange?.(list);
  };

  // Add a standard preset or basic slot
  const handleAddSlot = (preset?: typeof FILAMENT_TYPE_PRESETS[0]) => {
    const slotNumber = filaments.length + 1;
    const newSlot: FilamentEntry = {
      id: `fil-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: preset ? preset.name : `Filament Slot ${slotNumber}`,
      type: preset ? preset.type : 'PLA',
      spoolPrice: preset ? preset.price : 22.00,
      spoolWeightGrams: preset ? preset.weight : 1000,
      gramsUsed: 0,
      purgeGrams: 0,
      colorHex: preset ? preset.color : PRESET_COLORS[(slotNumber - 1) % PRESET_COLORS.length],
    };
    onChangeFilaments([...filaments, newSlot]);
    setShowPresetMenu(false);
  };

  // Add custom filament from modal
  const handleAddCustomFilament = (custom: {
    name: string;
    type: string;
    spoolPrice: number;
    spoolWeightGrams: number;
    colorHex: string;
    saveToLibrary: boolean;
  }) => {
    const newSlot: FilamentEntry = {
      id: `fil-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: custom.name,
      type: custom.type,
      spoolPrice: custom.spoolPrice,
      spoolWeightGrams: custom.spoolWeightGrams,
      gramsUsed: 0,
      purgeGrams: 0,
      colorHex: custom.colorHex,
    };
    onChangeFilaments([...filaments, newSlot]);

    if (custom.saveToLibrary) {
      const preset: CustomFilamentPreset = {
        id: `custom-fil-${Date.now()}`,
        name: custom.name,
        type: custom.type,
        spoolPrice: custom.spoolPrice,
        spoolWeightGrams: custom.spoolWeightGrams,
        colorHex: custom.colorHex,
      };
      const updated = [preset, ...customLibrary.filter((c) => c.name.toLowerCase() !== custom.name.toLowerCase())];
      saveCustomLibrary(updated);
    }
    setShowPresetMenu(false);
  };

  // Add an item from the saved custom filament library
  const handleAddFromLibrary = (custom: CustomFilamentPreset) => {
    const newSlot: FilamentEntry = {
      id: `fil-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: custom.name,
      type: custom.type,
      spoolPrice: custom.spoolPrice,
      spoolWeightGrams: custom.spoolWeightGrams,
      gramsUsed: 0,
      purgeGrams: 0,
      colorHex: custom.colorHex || '#38bdf8',
    };
    onChangeFilaments([...filaments, newSlot]);
    setShowPresetMenu(false);
  };

  // Delete an item from the custom library
  const handleDeleteFromLibrary = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const updated = customLibrary.filter((c) => c.id !== id);
    saveCustomLibrary(updated);
  };

  // Save an existing active spool card to the custom library
  const handleSaveSpoolToLibrary = (spool: FilamentEntry) => {
    const preset: CustomFilamentPreset = {
      id: `custom-fil-${Date.now()}`,
      name: spool.name,
      type: spool.type,
      spoolPrice: spool.spoolPrice,
      spoolWeightGrams: spool.spoolWeightGrams,
      colorHex: spool.colorHex,
    };
    const updated = [preset, ...customLibrary.filter((c) => c.name.toLowerCase() !== spool.name.toLowerCase())];
    saveCustomLibrary(updated);

    setSavedSuccessId(spool.id);
    setTimeout(() => {
      setSavedSuccessId(null);
    }, 2500);
  };

  // Update a single slot
  const handleUpdateSlot = (id: string, updates: Partial<FilamentEntry>) => {
    onChangeFilaments(
      filaments.map((f) => (f.id === id ? { ...f, ...updates } : f))
    );
  };

  // Remove a slot
  const handleRemoveSlot = (id: string) => {
    if (filaments.length <= 1) return;
    onChangeFilaments(filaments.filter((f) => f.id !== id));
  };

  // Auto-sync grams from loaded G-code files
  const handleSyncFromFiles = () => {
    const active = files.filter((f) => f.enabled);
    if (active.length === 0) return;

    const updated = filaments.map((fil, idx) => {
      // Find files assigned specifically to this slot
      const assignedFiles = active.filter(
        (file) => file.assignedFilamentId === fil.id
      );

      let totalAssignedGrams = assignedFiles.reduce(
        (sum, f) => sum + f.metadata.filamentGrams * f.quantity,
        0
      );

      // If this is the primary first slot (idx === 0), also include files that have no valid assignment
      if (idx === 0) {
        const unassignedFiles = active.filter(
          (file) =>
            !file.assignedFilamentId ||
            !filaments.some((slot) => slot.id === file.assignedFilamentId)
        );
        const unassignedGrams = unassignedFiles.reduce(
          (sum, f) => sum + f.metadata.filamentGrams * f.quantity,
          0
        );
        totalAssignedGrams += unassignedGrams;
      }

      return {
        ...fil,
        gramsUsed: Math.round(totalAssignedGrams * 10) / 10,
      };
    });

    onChangeFilaments(updated);
  };

  // Total material stats
  const totalGramsUsed = filaments.reduce(
    (sum, f) => sum + (f.gramsUsed + (f.purgeGrams || 0)),
    0
  );
  const totalMaterialCost = filaments.reduce((sum, f) => {
    const spoolWeight = Math.max(1, f.spoolWeightGrams || 1000);
    const totalGrams = (f.gramsUsed || 0) + (f.purgeGrams || 0);
    return sum + (totalGrams / spoolWeight) * (f.spoolPrice || 0) * Math.max(1, batchMultiplier);
  }, 0);

  return (
    <div className="p-4 sm:p-5 rounded-md border border-[#3f3f44] bg-[#2d2d30] space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-[#3f3f44] pb-3">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-xs bg-[#00ae42]" />
          <div>
            <h3 className="text-sm font-semibold text-white flex flex-wrap items-center gap-2">
              <span>1. Filament & Custom Spool Pricing</span>
              <span className="text-[11px] font-mono font-normal text-zinc-400 tabular-nums">
                · {filaments.length} Spool{filaments.length > 1 ? 's' : ''}
              </span>
            </h3>
            <p className="text-xs text-zinc-400">
              Configure brand filaments with specific spool prices, net weights, and colors for multi-material costing.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {files.length > 0 && (
            <button
              type="button"
              onClick={handleSyncFromFiles}
              className="px-3 py-1.5 text-xs font-medium text-zinc-200 hover:text-white bg-[#36363a] hover:bg-[#424247] rounded transition-colors flex items-center gap-1.5 border border-[#4e4e54] cursor-pointer"
              title="Automatically calculate grams used for each spool from the files assigned to it"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#26b4b0]" />
              <span>Sync Grams from Files</span>
            </button>
          )}

          {/* Quick Add Custom Filament Modal Button */}
          <button
            type="button"
            onClick={() => setIsCustomModalOpen(true)}
            className="px-3 py-1.5 text-xs font-semibold text-[#26b4b0] bg-[#1e1e20] hover:bg-[#36363a] border border-[#26b4b0]/40 rounded transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Create and add custom filament brand with specific price & weight"
          >
            <Tag className="w-3.5 h-3.5 text-[#26b4b0]" />
            <span>+ Custom Filament</span>
          </button>

          {/* Add Spool Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowPresetMenu(!showPresetMenu)}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-[#00ae42] hover:bg-[#00c44b] rounded transition-colors flex items-center gap-1.5 active:scale-95 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Spool</span>
              <ChevronDown className="w-3 h-3" />
            </button>

            {showPresetMenu && (
              <div className="absolute right-0 mt-1 w-72 max-h-96 overflow-y-auto py-1 bg-[#1e1e20] border border-[#4e4e54] rounded-md shadow-2xl z-30">
                {/* Custom Modal Launcher */}
                <div className="p-1 border-b border-[#3f3f44]">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPresetMenu(false);
                      setIsCustomModalOpen(true);
                    }}
                    className="w-full text-left px-3 py-2 text-xs font-semibold text-[#00c44b] bg-[#00ae42]/10 hover:bg-[#00ae42]/20 rounded transition-colors flex items-center gap-2 border border-[#00ae42]/30 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Create Custom Filament with Pricing...</span>
                  </button>
                </div>

                {/* Saved Custom Filaments Library */}
                {customLibrary.length > 0 && (
                  <div className="border-b border-[#3f3f44] pb-1">
                    <div className="px-3 py-1.5 text-[10px] uppercase font-semibold text-[#26b4b0] tracking-wider flex items-center justify-between">
                      <span>My Custom Filaments</span>
                      <span className="font-mono text-zinc-500">{customLibrary.length} saved</span>
                    </div>
                    {customLibrary.map((custom) => (
                      <div
                        key={custom.id}
                        onClick={() => handleAddFromLibrary(custom)}
                        className="group w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-[#36363a] hover:text-white transition-colors flex items-center justify-between cursor-pointer"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/20"
                            style={{ backgroundColor: custom.colorHex || '#38bdf8' }}
                          />
                          <span className="font-medium truncate">{custom.name}</span>
                          <span className="text-[10px] px-1 py-0.2 rounded bg-[#2d2d30] text-zinc-400 border border-[#45454a] font-mono">
                            {custom.type}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <span className="font-mono text-[#f58220] text-[11px] tabular-nums">
                            {currencySymbol}{custom.spoolPrice}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteFromLibrary(e, custom.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-rose-400 rounded transition-opacity cursor-pointer"
                            title="Delete from saved library"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Standard FDM Material Presets */}
                <div className="px-3 py-1.5 text-[10px] uppercase font-semibold text-zinc-400 tracking-wider">
                  Standard Material Presets
                </div>
                {FILAMENT_TYPE_PRESETS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleAddSlot(preset)}
                    className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-[#36363a] hover:text-white transition-colors flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/20"
                        style={{ backgroundColor: preset.color }}
                      />
                      <span className="font-medium truncate">{preset.name}</span>
                    </div>
                    <span className="font-mono text-zinc-400 text-[11px] shrink-0 ml-2 tabular-nums">
                      {currencySymbol}{preset.price}
                    </span>
                  </button>
                ))}

                {/* Basic Empty Slot */}
                <div className="border-t border-[#3f3f44] pt-1">
                  <button
                    type="button"
                    onClick={() => handleAddSlot()}
                    className="w-full text-left px-3 py-2 text-xs text-zinc-400 hover:bg-[#36363a] hover:text-zinc-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Basic Empty Spool Slot</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filament Slots List */}
      <div className="space-y-3">
        {filaments.map((fil, index) => {
          const spoolWeight = Math.max(1, fil.spoolWeightGrams || 1000);
          const grams = Math.max(0, fil.gramsUsed || 0);
          const purge = Math.max(0, fil.purgeGrams || 0);
          const totalGrams = grams + purge;
          const price = Math.max(0, fil.spoolPrice || 0);
          const slotCost = (totalGrams / spoolWeight) * price * Math.max(1, batchMultiplier);

          // Find which files feed this slot
          const assignedFiles = files.filter(
            (f) =>
              f.enabled &&
              (f.assignedFilamentId === fil.id ||
                (index === 0 && (!f.assignedFilamentId || !filaments.some((s) => s.id === f.assignedFilamentId))))
          );

          return (
            <div
              key={fil.id}
              className="p-3.5 sm:p-4 rounded border border-[#3a3a3f] bg-[#232325] hover:border-[#525259] transition-colors space-y-3"
            >
              {/* Row 1: Identification & Quick Controls */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  {/* Color Swatch / Preset Picker */}
                  <div className="relative group shrink-0">
                    <div
                      className="w-7 h-7 rounded border border-white/25 flex items-center justify-center cursor-pointer transition-transform group-hover:scale-105"
                      style={{ backgroundColor: fil.colorHex || '#38bdf8' }}
                      title="Click to pick swatch color"
                    >
                      <Palette className="w-3.5 h-3.5 text-black/60 mix-blend-difference" />
                    </div>
                    <div className="absolute left-0 mt-1 p-2 bg-[#1e1e20] border border-[#4e4e54] rounded shadow-xl z-20 hidden group-hover:grid grid-cols-5 gap-1.5 w-36">
                      {PRESET_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => handleUpdateSlot(fil.id, { colorHex: color })}
                          className="w-5 h-5 rounded-xs border border-white/20 hover:scale-110 transition-transform cursor-pointer"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Slot Title Input */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1e1e20] text-[#00c44b] border border-[#45454a] font-bold shrink-0">
                        AMS {index + 1}
                      </span>
                      <input
                        type="text"
                        value={fil.name}
                        onChange={(e) => handleUpdateSlot(fil.id, { name: e.target.value })}
                        placeholder="e.g. Primary Matte Black PLA"
                        className="bg-transparent text-sm font-semibold text-white border-b border-transparent hover:border-[#45454a] focus:border-[#00ae42] focus:outline-hidden w-full truncate"
                      />
                    </div>
                    {assignedFiles.length > 0 && (
                      <span className="text-[10px] text-zinc-400 mt-0.5 block truncate">
                        Fed by {assignedFiles.length} file{assignedFiles.length > 1 ? 's' : ''}:{' '}
                        {assignedFiles.map((f) => `${f.fileName} (${f.quantity}x)`).join(', ')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Material Type Dropdown, Save to Presets & Remove Button */}
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={fil.type}
                    onChange={(e) => {
                      const newType = e.target.value;
                      // Check standard presets
                      const preset = MATERIAL_PRESETS.find((m) => m.type === newType);
                      handleUpdateSlot(fil.id, {
                        type: newType,
                        spoolPrice: preset ? preset.spoolPrice : fil.spoolPrice,
                      });
                    }}
                    className="bg-[#1e1e20] border border-[#45454a] rounded px-2.5 py-1 text-xs text-zinc-200 focus:border-[#00ae42] focus:outline-hidden font-mono"
                  >
                    <option value="PLA">PLA</option>
                    <option value="PETG">PETG</option>
                    <option value="ABS">ABS</option>
                    <option value="ASA">ASA</option>
                    <option value="TPU">TPU 95A</option>
                    <option value="PVA">PVA Support</option>
                    <option value="PA-CF">PA-CF Nylon</option>
                    <option value="PC">PC Polycarbonate</option>
                    <option value="HIPS">HIPS</option>
                    <option value="Other">Other</option>
                  </select>

                  {/* Bookmark to Custom Library Button */}
                  <button
                    type="button"
                    onClick={() => handleSaveSpoolToLibrary(fil)}
                    className={`p-1.5 rounded border text-xs transition-colors flex items-center gap-1 cursor-pointer ${
                      savedSuccessId === fil.id
                        ? 'bg-[#00ae42]/15 border-[#00ae42] text-[#00c44b]'
                        : 'bg-[#36363a] text-zinc-300 hover:text-white border-[#4e4e54] hover:bg-[#424247]'
                    }`}
                    title="Save this spool to My Custom Filaments library"
                  >
                    {savedSuccessId === fil.id ? (
                      <>
                        <BookmarkCheck className="w-3.5 h-3.5 text-[#00c44b]" />
                        <span className="text-[10px] font-medium hidden sm:inline">Saved!</span>
                      </>
                    ) : (
                      <>
                        <Bookmark className="w-3.5 h-3.5" />
                        <span className="text-[10px] hidden sm:inline">Save Preset</span>
                      </>
                    )}
                  </button>

                  {filaments.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveSlot(fil.id)}
                      className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-950/40 rounded transition-colors cursor-pointer"
                      title="Remove filament spool slot"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Row 2: Numerical Fields (Used, Price, Spool Size, Purge) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Filament Used (g)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={fil.gramsUsed}
                    onChange={(e) =>
                      handleUpdateSlot(fil.id, { gramsUsed: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full bg-[#1e1e20] border border-[#45454a] rounded px-2.5 py-1.5 text-xs text-white font-mono focus:border-[#00ae42] focus:outline-hidden tabular-nums"
                  />
                  <span className="text-[9px] text-zinc-500 mt-0.5 block">Net part plastic</span>
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Purge / Prime Tower (g)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={fil.purgeGrams || 0}
                    onChange={(e) =>
                      handleUpdateSlot(fil.id, { purgeGrams: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full bg-[#1e1e20] border border-[#45454a] rounded px-2.5 py-1.5 text-xs text-white font-mono focus:border-[#00ae42] focus:outline-hidden tabular-nums"
                  />
                  <span className="text-[9px] text-zinc-500 mt-0.5 block">Purge / poop waste</span>
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    Spool Price ({currencySymbol})
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={fil.spoolPrice}
                    onChange={(e) =>
                      handleUpdateSlot(fil.id, { spoolPrice: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full bg-[#1e1e20] border border-[#45454a] rounded px-2.5 py-1.5 text-xs text-white font-mono focus:border-[#00ae42] focus:outline-hidden tabular-nums"
                  />
                  <span className="text-[9px] text-zinc-500 mt-0.5 block">Per full roll</span>
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Spool Size (g)</label>
                  <input
                    type="number"
                    step="50"
                    value={fil.spoolWeightGrams}
                    onChange={(e) =>
                      handleUpdateSlot(fil.id, {
                        spoolWeightGrams: parseFloat(e.target.value) || 1000,
                      })
                    }
                    className="w-full bg-[#1e1e20] border border-[#45454a] rounded px-2.5 py-1.5 text-xs text-white font-mono focus:border-[#00ae42] focus:outline-hidden tabular-nums"
                  />
                  <span className="text-[9px] text-zinc-500 mt-0.5 block">Typically 1000g or 750g</span>
                </div>
              </div>

              {/* Row 3: Slot Cost Mini-Summary */}
              <div className="flex items-center justify-between text-xs font-mono pt-2 border-t border-[#3a3a3f] text-zinc-400 tabular-nums">
                <div className="flex items-center gap-2 text-[11px]">
                  <span>Total plastic: {totalGrams.toFixed(1)}g</span>
                  <span>·</span>
                  <span>
                    Rate: {currencySymbol}
                    {((price / spoolWeight) * 1000).toFixed(2)}/kg
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[#00c44b] font-bold">
                  <span>Slot Cost:</span>
                  <span className="text-white">
                    {currencySymbol}
                    {slotCost.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Material Totals Banner */}
      <div className="p-3 bg-[#232325] border border-[#3a3a3f] rounded flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs">
        <div className="flex items-center gap-2 text-zinc-300">
          <Info className="w-4 h-4 text-[#26b4b0] shrink-0" />
          <span>
            Combined Plastic: <strong className="text-white font-mono tabular-nums">{totalGramsUsed.toFixed(1)}g</strong> across {filaments.length} spool{filaments.length > 1 ? 's' : ''}
            {batchMultiplier > 1 && ` (${(totalGramsUsed * batchMultiplier).toFixed(1)}g total for batch of ${batchMultiplier})`}
          </span>
        </div>
        <div className="text-sm font-bold text-white font-mono tabular-nums">
          Total Material Cost: <span className="text-[#00c44b]">{currencySymbol}{totalMaterialCost.toFixed(2)}</span>
        </div>
      </div>

      {/* Custom Filament Creator Modal */}
      <CustomFilamentModal
        isOpen={isCustomModalOpen}
        onClose={() => setIsCustomModalOpen(false)}
        onAddFilament={handleAddCustomFilament}
        currencySymbol={currencySymbol}
      />
    </div>
  );
};
