import React, { useState } from 'react';
import { Palette, X, Plus, Sparkles, Check, DollarSign } from 'lucide-react';

interface CustomFilamentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddFilament: (filament: {
    name: string;
    type: string;
    spoolPrice: number;
    spoolWeightGrams: number;
    colorHex: string;
    saveToLibrary: boolean;
  }) => void;
  currencySymbol?: string;
}

const COMMON_TYPES = [
  'PLA',
  'PETG',
  'ABS',
  'ASA',
  'TPU',
  'PA-CF',
  'PC',
  'PVA',
  'HIPS',
  'PET',
  'Resin',
  'Other',
];

const QUICK_WEIGHTS = [
  { label: '250g', value: 250 },
  { label: '500g', value: 500 },
  { label: '750g', value: 750 },
  { label: '1kg (1000g)', value: 1000 },
  { label: '2.5kg', value: 2500 },
];

const PRESET_COLORS = [
  '#38bdf8', // sky blue
  '#f97316', // vibrant orange
  '#e2e8f0', // light grey / silver
  '#10b981', // emerald green
  '#a855f7', // purple
  '#ef4444', // red
  '#eab308', // amber / yellow
  '#6366f1', // indigo
  '#ec4899', // pink
  '#18181b', // dark charcoal / black
  '#ffffff', // pure white
  '#64748b', // carbon / slate
];

export const CustomFilamentModal: React.FC<CustomFilamentModalProps> = ({
  isOpen,
  onClose,
  onAddFilament,
  currencySymbol = 'R',
}) => {
  const [name, setName] = useState('');
  const [type, setType] = useState('PLA');
  const [spoolPrice, setSpoolPrice] = useState<number>(389.0);
  const [spoolWeightGrams, setSpoolWeightGrams] = useState<number>(1000);
  const [colorHex, setColorHex] = useState<string>('#38bdf8');
  const [saveToLibrary, setSaveToLibrary] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Please provide a name or brand for the custom filament.');
      return;
    }
    if (isNaN(spoolPrice) || spoolPrice <= 0) {
      setError('Please enter a valid spool price greater than 0.');
      return;
    }
    if (isNaN(spoolWeightGrams) || spoolWeightGrams <= 0) {
      setError('Please enter a valid spool weight in grams.');
      return;
    }

    setError(null);
    onAddFilament({
      name: trimmedName,
      type: type.trim().toUpperCase() || 'PLA',
      spoolPrice: Math.round(spoolPrice * 100) / 100,
      spoolWeightGrams: Math.round(spoolWeightGrams),
      colorHex,
      saveToLibrary,
    });

    // Reset fields for next time
    setName('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-fade-in">
      <div className="w-full max-w-lg bg-[#2d2d30] border border-[#45454a] rounded-md shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#3f3f44] bg-[#1e1e20]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-[#00ae42]/15 border border-[#00ae42]/40 flex items-center justify-center text-[#00c44b]">
              <Palette className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Add Custom Filament & Pricing</h2>
              <p className="text-xs text-zinc-400">Define custom materials, spool cost, and weight</p>
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Filament Name */}
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
              Filament Brand & Name <span className="text-[#f58220]">*</span>
            </label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. Fiberlogy Easy PLA Navy / PolyLite ASA"
              className="w-full bg-[#1e1e20] border border-[#45454a] rounded px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-[#00ae42] focus:outline-hidden"
            />
            {error && <p className="text-xs text-rose-400 mt-1 font-medium">{error}</p>}
          </div>

          {/* Material Type & Spool Price Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Material Polymer Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full bg-[#1e1e20] border border-[#45454a] rounded px-3 py-2 text-sm text-white focus:border-[#00ae42] focus:outline-hidden"
              >
                {COMMON_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Spool Price ({currencySymbol}) <span className="text-[#f58220]">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 font-mono text-sm">
                  {currencySymbol}
                </span>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  value={spoolPrice}
                  onChange={(e) => setSpoolPrice(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#1e1e20] border border-[#45454a] rounded pl-8 pr-3 py-2 text-sm text-white font-mono focus:border-[#00ae42] focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Spool Weight */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-zinc-300">
                Spool Net Weight (grams)
              </label>
              <span className="text-[11px] font-mono text-[#26b4b0] font-medium">
                {spoolWeightGrams}g ({spoolWeightGrams / 1000} kg)
              </span>
            </div>

            {/* Quick Weight Selectors */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              {QUICK_WEIGHTS.map((qw) => (
                <button
                  key={qw.value}
                  type="button"
                  onClick={() => setSpoolWeightGrams(qw.value)}
                  className={`px-2.5 py-1 text-xs rounded border font-mono transition-colors cursor-pointer ${
                    spoolWeightGrams === qw.value
                      ? 'bg-[#00ae42]/15 text-[#00c44b] border-[#00ae42] font-bold'
                      : 'bg-[#1e1e20] text-zinc-400 border-[#45454a] hover:text-white'
                  }`}
                >
                  {qw.label}
                </button>
              ))}
            </div>

            <input
              type="number"
              step="50"
              min="100"
              value={spoolWeightGrams}
              onChange={(e) => setSpoolWeightGrams(parseFloat(e.target.value) || 0)}
              className="w-full bg-[#1e1e20] border border-[#45454a] rounded px-3 py-2 text-sm text-white font-mono focus:border-[#00ae42] focus:outline-hidden"
            />
          </div>

          {/* Color Picker Swatches */}
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
              Filament Visual Swatch
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {PRESET_COLORS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setColorHex(hex)}
                  className={`w-7 h-7 rounded-full border transition-all flex items-center justify-center cursor-pointer ${
                    colorHex.toLowerCase() === hex.toLowerCase()
                      ? 'ring-2 ring-[#00ae42] scale-110 border-white'
                      : 'border-white/20 hover:scale-105'
                  }`}
                  style={{ backgroundColor: hex }}
                  title={hex}
                >
                  {colorHex.toLowerCase() === hex.toLowerCase() && (
                    <Check
                      className={`w-3.5 h-3.5 ${
                        hex === '#ffffff' || hex === '#e2e8f0' ? 'text-black' : 'text-white'
                      }`}
                    />
                  )}
                </button>
              ))}
              <div className="flex items-center gap-1.5 ml-2">
                <input
                  type="color"
                  value={colorHex}
                  onChange={(e) => setColorHex(e.target.value)}
                  className="w-7 h-7 rounded cursor-pointer bg-transparent border-0"
                  title="Custom hex color"
                />
                <span className="text-[11px] font-mono text-zinc-400">{colorHex}</span>
              </div>
            </div>
          </div>

          {/* Save to Permanent Library Checkbox */}
          <div className="pt-2">
            <label className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={saveToLibrary}
                onChange={(e) => setSaveToLibrary(e.target.checked)}
                className="w-4 h-4 rounded-xs bg-[#1e1e20] border-[#45454a] accent-[#00ae42] cursor-pointer"
              />
              <span>Save this custom filament to my preset library for future quotes</span>
            </label>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#3f3f44]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-zinc-300 hover:text-white bg-[#36363a] hover:bg-[#424247] border border-[#4e4e54] rounded transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-semibold text-white bg-[#00ae42] hover:bg-[#00c44b] rounded transition-colors flex items-center gap-1.5 active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Spool to Quote</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
