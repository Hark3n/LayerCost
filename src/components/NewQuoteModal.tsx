import React, { useState } from 'react';
import { FilePlus, X, AlertTriangle, User, FolderPlus, Layers, Check } from 'lucide-react';

interface NewQuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (clientName: string, projectName: string) => void;
  currentClientName?: string;
  currentProjectName?: string;
  currencySymbol?: string;
}

export const NewQuoteModal: React.FC<NewQuoteModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  currentClientName = '',
  currentProjectName = '',
}) => {
  const [clientName, setClientName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setClientName('');
      setProjectName('');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedClient = clientName.trim();
    if (!trimmedClient) {
      setError('Please enter a client or company name for this quote.');
      return;
    }
    setError(null);
    onConfirm(trimmedClient, projectName.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-fade-in">
      <div className="w-full max-w-lg bg-[#2d2d30] border border-[#45454a] rounded-md shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#3f3f44] bg-[#1e1e20]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-[#00ae42]/15 border border-[#00ae42]/40 flex items-center justify-center text-[#00c44b]">
              <FilePlus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Create New Client Quote</h2>
              <p className="text-xs text-zinc-400">Start a clean quote with blanked print and filament data</p>
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
          {/* Notice Banner */}
          <div className="p-3 rounded border border-[#f58220]/40 bg-[#f58220]/10 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-[#f58220] shrink-0 mt-0.5" />
            <div className="text-xs text-amber-100/90 leading-relaxed">
              <span className="font-semibold text-[#f58220]">Data Reset Notice:</span> Creating a new quote will blank all loaded G-code print files, reset print hours to 0, and clear filament consumption data so you can prepare an accurate, unpolluted quote. Machine tariffs and workshop rates will be retained.
            </div>
          </div>

          {/* Client Name Input */}
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#00c44b]" />
              <span>Client or Company Name <span className="text-[#f58220]">*</span></span>
            </label>
            <input
              type="text"
              autoFocus
              value={clientName}
              onChange={(e) => {
                setClientName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. Horizon Engineering Ltd / Jane Doe"
              className="w-full bg-[#1e1e20] border border-[#45454a] rounded px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-[#00ae42] focus:outline-hidden"
            />
            {error && <p className="text-xs text-rose-400 mt-1 font-medium">{error}</p>}
          </div>

          {/* Project Reference Input */}
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
              <FolderPlus className="w-3.5 h-3.5 text-[#26b4b0]" />
              <span>Project or Part Reference (Optional)</span>
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g. Drone Gimbal Housing - Prototype Batch"
              className="w-full bg-[#1e1e20] border border-[#45454a] rounded px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-[#00ae42] focus:outline-hidden"
            />
          </div>

          {/* Quick Checklist */}
          <div className="p-3 bg-[#232325] rounded border border-[#3a3a3f] text-xs space-y-1.5 text-zinc-400">
            <div className="font-semibold text-zinc-300 mb-1">What happens when you click Create:</div>
            <div className="flex items-center gap-2 text-zinc-300">
              <Check className="w-3.5 h-3.5 text-[#00c44b] shrink-0" />
              <span>Clears previous print queue files</span>
            </div>
            <div className="flex items-center gap-2 text-zinc-300">
              <Check className="w-3.5 h-3.5 text-[#00c44b] shrink-0" />
              <span>Blanks filament grams used & purge waste to 0g</span>
            </div>
            <div className="flex items-center gap-2 text-zinc-300">
              <Check className="w-3.5 h-3.5 text-[#00c44b] shrink-0" />
              <span>Attaches client name directly to the official PDF/Print Quote</span>
            </div>
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
              <FilePlus className="w-4 h-4" />
              <span>Create Quote & Blank Data</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
