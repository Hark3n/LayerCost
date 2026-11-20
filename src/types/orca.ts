import { GcodeMetadata } from './calculator';

export interface OrcaObjectInfo {
  name: string;
  instances: number;
  dimensions?: {
    width: number;
    depth: number;
    height: number;
  };
}

export interface OrcaFilamentInfo {
  slot: number;
  name: string;
  type: string;
  gramsUsed: number;
  purgeGrams?: number;
  colorHex?: string;
  spoolPrice?: number;
  spoolWeightGrams?: number;
}

export interface OrcaFileInfo {
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
  plateIndex?: number;
  plateName?: string;
  dimensions?: GcodeMetadata['dimensions'];
  multiFilaments?: {
    slot: number;
    name?: string;
    grams: number;
    purgeGrams?: number;
    type?: string;
    colorHex?: string;
  }[];
  quantity?: number;
}

export interface OrcaBridgePayload {
  source: 'orcaslicer-plugin' | 'orcaslicer-simulator';
  capturedAt: string;
  projectName?: string;
  plateName?: string;
  plateCount?: number;
  printerName?: string;
  slicerVersion?: string;
  gcodePath?: string;
  objects?: OrcaObjectInfo[];
  files?: OrcaFileInfo[];
  filaments?: OrcaFilamentInfo[];
}

export type OrcaIncomingMessage =
  | { type: 'slicing_started'; timestamp?: number; message?: string }
  | { type: 'slice_complete'; payload: OrcaBridgePayload }
  | { type: 'gcode_data'; payload: OrcaBridgePayload }
  | { type: 'slicing_error'; message: string }
  | { type: 'no_slice_yet'; hostInfo?: { printerName?: string; projectName?: string; objectCount?: number } }
  | { type: 'invoice_saved'; path: string };

export type OrcaOutgoingMessage =
  | { type: 'ready' }
  | { type: 'pull_slice_data' }
  | { type: 'save_invoice_html'; filename: string; html: string }
  | { type: 'notify'; title: string; message: string };

export interface OrcaWindowBridge {
  postMessage: (data: OrcaOutgoingMessage | Record<string, unknown>) => void;
  onMessage: (callback: (data: OrcaIncomingMessage) => void) => void;
}

declare global {
  interface Window {
    orca?: OrcaWindowBridge;
  }
}
