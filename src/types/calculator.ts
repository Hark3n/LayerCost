export interface GcodeMetadata {
  fileName: string;
  fileSizeBytes: number;
  slicer: string;
  printTimeSeconds: number;
  printTimeFormatted: string;
  filamentGrams: number;
  filamentMeters: number;
  filamentVolumeCm3: number;
  layerCount: number;
  layerHeightMm: number;
  bedTempC?: number;
  nozzleTempC?: number;
  filamentType?: string;
  dimensions?: {
    width: number;
    depth: number;
    height: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
  multiFilaments?: { slot: number; grams: number; type?: string; colorHex?: string }[];
  isSample?: boolean;
}

export interface PrinterPreset {
  id: string;
  name: string;
  brand: string;
  purchasePrice: number;
  lifespanHours: number;
  avgWatts: number;
  bedX: number;
  bedY: number;
  bedZ: number;
  hourlyMaintenance: number;
}

export interface MaterialPreset {
  id: string;
  name: string;
  type: string;
  spoolPrice: number;
  spoolWeightGrams: number;
  density: number; // g/cm³
  nozzleTemp: number;
  bedTemp: number;
}

export interface CustomFilamentPreset {
  id: string;
  name: string;
  type: string;
  spoolPrice: number;
  spoolWeightGrams: number;
  colorHex?: string;
  notes?: string;
}

export interface ElectricityPreset {
  id: string;
  region: string;
  ratePerKwh: number;
}

export interface FilamentEntry {
  id: string;
  name: string; // e.g. "Primary Matte Black PLA", "Support PVA", "Bambu Orange PETG"
  type: string; // PLA, PETG, ABS, TPU, Support PVA, etc.
  spoolPrice: number; // in local currency (e.g. ZAR)
  spoolWeightGrams: number; // e.g. 1000g or 750g
  gramsUsed: number; // grams used across prints or per unit
  purgeGrams?: number; // purge/poop tower waste for this slot
  colorHex?: string;
}

export interface GcodeFileItem {
  id: string;
  fileName: string;
  metadata: GcodeMetadata;
  quantity: number; // how many copies of this file to produce in the job
  assignedFilamentId?: string; // if mapped to a specific filament slot
  enabled: boolean;
}

export interface CostParameters {
  // Filaments: Support for multiple materials/spools
  filaments: FilamentEntry[];

  // Legacy single-filament fallbacks (kept for backward compatibility & easy quick-calc)
  filamentGrams: number;
  spoolPrice: number;
  spoolWeightGrams: number;
  extraPurgeGrams: number;

  // Electricity & Machine
  printHours: number;
  printerWatts: number;
  kwhRate: number;
  preheatKwh: number; // Surge energy during warm-up (typically 0.05-0.10 kWh)

  // Machine Depreciation
  printerCost: number;
  printerLifespanHours: number;
  salvageValue: number;

  // Consumables & Maintenance
  maintenanceHourlyRate: number; // Nozzles, belts, PEI sheet, lube
  prepConsumablesCost: number; // IPA, glue, cleaning wipes per print

  // 3D CAD Modeling & Client Review (Optional custom engineering)
  enableCadService: boolean;
  cadModelingHours: number; // Hours spent 3D modeling / CAD design
  cadReviewCycles: number; // Number of client review/feedback rounds
  cadReviewMinutesPerCycle: number; // Minutes per review session
  cadHourlyRate: number; // CAD design hourly rate (e.g. R450/hr)

  // Slicing & Workshop Labor
  slicingMins: number; // CAM / Slicing / toolpath generation
  setupMins: number;
  removalMins: number;
  postProcessingMins: number; // Support removal, sanding, deburring
  qaInspectionMins: number; // Dimensional verification, caliper & tolerance checks
  packagingMins: number; // Boxing, cushioning & courier labeling
  laborHourlyRate: number; // Workshop operator rate (e.g. R220/hr)

  // Failure & Risk Buffer
  failureRiskPercent: number; // e.g., 8-15%

  // Packaging & Overhead
  enablePackaging: boolean; // Option to exclude protective packaging completely (e.g. workshop collection)
  packagingCostPerUnit: number; // box, pouch, bubble wrap
  workshopOverheadPerPrint: number; // shop rent/filters allocation

  // Commercial / Profit
  markupPercent: number; // Profit margin on total cost
  quantity: number; // Job / Batch multiplier or total units
}

export interface FilamentCostItem {
  id: string;
  name: string;
  type: string;
  gramsUsed: number;
  purgeGrams: number;
  totalGrams: number;
  cost: number;
  spoolPrice: number;
  spoolWeightGrams: number;
  colorHex?: string;
}

export interface CostBreakdown {
  // Direct Costs
  filamentCost: number;
  purgeCost: number;
  totalMaterialCost: number;
  filamentItemCosts?: FilamentCostItem[]; // Itemized list for multi-filament jobs

  electricityCost: number;
  depreciationCost: number;
  maintenanceCost: number;
  prepConsumablesCost: number;
  totalMachineCost: number;

  // CAD Modeling & Client Review
  hasCadService: boolean;
  cadModelingHours: number;
  cadReviewHours: number;
  cadTotalHours: number;
  cadDesignCost: number;
  cadReviewCost: number;
  cadTotalCost: number;

  // Slicing & Workshop Labor
  slicingHours: number;
  slicingCost: number;
  workshopLaborHours: number;
  workshopLaborCost: number;

  // Distinct QA & Finishing & Packaging Labor
  qaInspectionHours: number;
  qaInspectionCost: number;
  postProcessingHours: number;
  postProcessingCost: number;
  packagingLaborHours: number;
  packagingLaborCost: number;

  totalLaborHours: number;
  totalLaborCost: number;
  laborHours: number; // alias
  laborCost: number; // alias for total labor

  // Packaging & Overhead
  enablePackaging: boolean;
  packagingCost: number;
  totalPackagingCost: number; // Material + labor packaging
  workshopOverheadCost: number;

  // Subtotal before risk
  subtotalDirectCost: number;

  // Failure buffer
  failureBufferCost: number;

  // Base Total Cost (Internal)
  baseTotalCost: number;
  baseUnitCost: number;

  // Commercial Margin
  profitAmount: number;
  finalTotalPrice: number;
  finalUnitPrice: number;

  // Percentage breakdown for visualization
  costPercentages: {
    material: number;
    cad: number;
    labor: number; // slicing + workshop handling
    qa: number; // QA & inspection
    packaging: number; // packaging material + labor
    electricity: number;
    depreciation: number;
    maintenance: number;
    buffer: number;
    overhead: number;
  };
}

