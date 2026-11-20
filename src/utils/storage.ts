import { CostParameters, CustomFilamentPreset, FilamentEntry } from '../types/calculator';

const memoryStorage = new Map<string, string>();

export function safeGetItem(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch {
    // Restricted WebView origin fallback
  }
  return memoryStorage.get(key) ?? null;
}

export function safeSetItem(key: string, value: string): void {
  memoryStorage.set(key, value);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Restricted WebView origin or quota fallback
  }
}

export function safeRemoveItem(key: string): void {
  memoryStorage.delete(key);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Restricted WebView origin fallback
  }
}

export interface FilamentPricingPref {
  name?: string;
  type: string;
  spoolPrice: number;
  spoolWeightGrams: number;
  colorHex?: string;
}

export interface PrinterOverrideSpec {
  printerWatts: number;
  printerCost: number;
  printerLifespanHours: number;
  salvageValue: number;
  maintenanceHourlyRate: number;
  prepConsumablesCost: number;
}

export interface LayerCostSavedSettings {
  currencyCode?: string;
  selectedPrinterId?: string;
  selectedElectricityId?: string;
  printerCustomized?: boolean;
  printerOverrides?: Record<string, PrinterOverrideSpec>;
  electricityOverrides?: Record<string, number>;
  savedParams?: Partial<CostParameters>;
  filaments?: FilamentEntry[];
  filamentPricingPrefs?: Record<string, FilamentPricingPref>;
  customFilaments?: CustomFilamentPreset[];
  clientName?: string;
  projectName?: string;
}

export const SETTINGS_STORAGE_KEY = 'layercost_user_settings_v1';
export const FILAMENT_PREFS_STORAGE_KEY = 'layercost_filament_pricing_prefs';
export const CUSTOM_FILAMENTS_STORAGE_KEY = 'layercost_custom_filaments';

export function loadSavedSettings(): LayerCostSavedSettings {
  try {
    const raw = safeGetItem(SETTINGS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveSettingsToStorage(
  settings: LayerCostSavedSettings,
  syncToOrca = true
): void {
  try {
    safeSetItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    if (settings.filamentPricingPrefs) {
      safeSetItem(FILAMENT_PREFS_STORAGE_KEY, JSON.stringify(settings.filamentPricingPrefs));
    }
    if (settings.customFilaments) {
      safeSetItem(CUSTOM_FILAMENTS_STORAGE_KEY, JSON.stringify(settings.customFilaments));
    }
    if (settings.currencyCode) {
      safeSetItem('layercost_currency_code', settings.currencyCode);
    }
    if (settings.clientName !== undefined) {
      safeSetItem('layercost_active_client', settings.clientName);
    }
    if (settings.projectName !== undefined) {
      safeSetItem('layercost_active_project', settings.projectName);
    }
  } catch {
    // ignore serialization errors
  }

  if (syncToOrca && typeof window !== 'undefined' && window.orca?.postMessage) {
    try {
      window.orca.postMessage({
        type: 'save_settings',
        settings: settings as unknown as Record<string, unknown>,
      });
    } catch {
      // ignore bridge errors
    }
  }
}

export function loadFilamentPricingPrefs(): Record<string, FilamentPricingPref> {
  try {
    const raw = safeGetItem(FILAMENT_PREFS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
    const settings = loadSavedSettings();
    return settings.filamentPricingPrefs || {};
  } catch {
    return {};
  }
}

export function buildFilamentPricingPrefs(
  filaments: FilamentEntry[],
  existing: Record<string, FilamentPricingPref> = {}
): Record<string, FilamentPricingPref> {
  const next: Record<string, FilamentPricingPref> = { ...existing };
  filaments.forEach((fil, idx) => {
    const typeKey = `type:${(fil.type || 'PLA').toUpperCase().trim()}`;
    const slotKey = `slot:${idx + 1}:${(fil.type || 'PLA').toUpperCase().trim()}`;
    const spec: FilamentPricingPref = {
      name: fil.name,
      type: (fil.type || 'PLA').toUpperCase().trim(),
      spoolPrice: Number(fil.spoolPrice) || 0,
      spoolWeightGrams: Math.max(1, Number(fil.spoolWeightGrams) || 1000),
      colorHex: fil.colorHex,
    };
    next[typeKey] = spec;
    next[slotKey] = spec;
    if (fil.name && fil.name.trim()) {
      next[`name:${fil.name.toLowerCase().trim()}`] = spec;
    }
  });
  return next;
}
