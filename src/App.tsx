import React, { useState, useId, useMemo, useEffect, useRef } from 'react';
import {
  UploadCloud,
  FileCode,
  DollarSign,
  Zap,
  Clock,
  Wrench,
  UserCheck,
  AlertTriangle,
  Package,
  Layers,
  Sparkles,
  TrendingUp,
  FileSpreadsheet,
  Download,
  Info,
  CheckCircle2,
  ChevronRight,
  PencilRuler,
  Printer,
  Plus,
  FilePlus,
  Cpu,
  RefreshCw,
  Globe,
} from 'lucide-react';
import {
  PrinterPreset,
  MaterialPreset,
  ElectricityPreset,
  GcodeFileItem,
  FilamentEntry,
  CustomFilamentPreset,
  CostParameters,
} from './types/calculator';
import { PRINTER_PRESETS, MATERIAL_PRESETS, ELECTRICITY_PRESETS, SAMPLE_GCODES } from './data/presets';
import { WORLD_CURRENCIES, POPULAR_CURRENCY_CODES, findCurrencyByCode } from './data/currencies';
import { parseGcodeFile, formatSecondsToHms } from './utils/gcodeParser';
import { calculatePrintCosts } from './utils/costEngine';
import {
  isRunningInOrcaSlicer,
  postToOrca,
  subscribeOrcaMessages,
  requestLatestSliceFromOrca,
  convertOrcaPayloadToJob,
} from './utils/orcaBridge';
import {
  CUSTOM_FILAMENTS_STORAGE_KEY,
  FILAMENT_PREFS_STORAGE_KEY,
  FilamentPricingPref,
  LayerCostSavedSettings,
  PrinterOverrideSpec,
  buildFilamentPricingPrefs,
  loadSavedSettings,
  safeGetItem,
  safeSetItem,
  saveSettingsToStorage,
} from './utils/storage';
import { CostBreakdownChart } from './components/CostBreakdownChart';
import { BatchCalculator } from './components/BatchCalculator';
import { QuoteModal } from './components/QuoteModal';
import { NewQuoteModal } from './components/NewQuoteModal';
import { OrcaPluginModal } from './components/OrcaPluginModal';
import { JobFilesQueue } from './components/JobFilesQueue';
import { MultiFilamentManager } from './components/MultiFilamentManager';

export default function App() {
  const fileInputId = useId();

  const initialSaved = useMemo(() => loadSavedSettings(), []);

  // 1. Multi-Filament Slots State (Restored from saved settings or default Primary Standard PLA Roll)
  const [filaments, setFilaments] = useState<FilamentEntry[]>(() => {
    if (initialSaved.filaments && initialSaved.filaments.length > 0) {
      return initialSaved.filaments;
    }
    return [
      {
        id: 'fil-1',
        name: 'Primary Standard PLA (eSUN)',
        type: 'PLA',
        spoolPrice: 22.00,
        spoolWeightGrams: 1000,
        gramsUsed: SAMPLE_GCODES[0].metadata.filamentGrams,
        purgeGrams: 0,
        colorHex: '#38bdf8', // sky blue
      },
    ];
  });

  const [filamentPricingPrefs, setFilamentPricingPrefs] = useState<Record<string, FilamentPricingPref>>(
    () => initialSaved.filamentPricingPrefs || {}
  );
  const filamentPricingPrefsRef = useRef(filamentPricingPrefs);
  useEffect(() => {
    filamentPricingPrefsRef.current = filamentPricingPrefs;
  }, [filamentPricingPrefs]);

  // 2. Multi-File Job Queue State (Default: Benchy model preloaded)
  const [files, setFiles] = useState<GcodeFileItem[]>([
    {
      id: 'file-benchy-sample',
      fileName: SAMPLE_GCODES[0].metadata.fileName,
      metadata: SAMPLE_GCODES[0].metadata,
      quantity: 1,
      assignedFilamentId: 'fil-1',
      enabled: true,
    },
  ]);
  const [activeFileId, setActiveFileId] = useState<string | null>('file-benchy-sample');

  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // World Currency State (persisted to storage & OrcaSlicer)
  const [currencyCode, setCurrencyCode] = useState<string>(() => {
    const saved = initialSaved.currencyCode || safeGetItem('layercost_currency_code');
    return saved ? findCurrencyByCode(saved).code : 'USD';
  });
  const activeCurrency = useMemo(() => findCurrencyByCode(currencyCode), [currencyCode]);
  const currencySymbol = activeCurrency.symbol;

  const handleCurrencyChange = (nextCode: string) => {
    const resolved = findCurrencyByCode(nextCode);
    userModifiedRef.current = true;
    setCurrencyCode(resolved.code);
    safeSetItem('layercost_currency_code', resolved.code);
  };

  const popularCurrencies = useMemo(
    () =>
      POPULAR_CURRENCY_CODES.map((code) => WORLD_CURRENCIES.find((c) => c.code === code)).filter(
        (c): c is (typeof WORLD_CURRENCIES)[number] => Boolean(c)
      ),
    []
  );

  // Selected Presets & User Customizations
  const [selectedPrinterId, setSelectedPrinterId] = useState<string>(
    () => initialSaved.selectedPrinterId || 'bambu-x1c'
  );
  const [selectedElectricityId, setSelectedElectricityId] = useState<string>(
    () => initialSaved.selectedElectricityId || 'global-avg'
  );
  const [printerCustomized, setPrinterCustomized] = useState<boolean>(
    () => Boolean(initialSaved.printerCustomized)
  );
  const [printerOverrides, setPrinterOverrides] = useState<Record<string, PrinterOverrideSpec>>(
    () => initialSaved.printerOverrides || {}
  );
  const selectedPrinterIdRef = useRef(selectedPrinterId);
  const printerCustomizedRef = useRef(printerCustomized);
  const printerOverridesRef = useRef(printerOverrides);
  useEffect(() => {
    selectedPrinterIdRef.current = selectedPrinterId;
  }, [selectedPrinterId]);
  useEffect(() => {
    printerCustomizedRef.current = printerCustomized;
  }, [printerCustomized]);
  useEffect(() => {
    printerOverridesRef.current = printerOverrides;
  }, [printerOverrides]);

  // Active View Tab
  const [activeTab, setActiveTab] = useState<'calculator' | 'batch'>('calculator');

  // Quote Modals Open State
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState<boolean>(false);
  const [isAutoPrintQuote, setIsAutoPrintQuote] = useState<boolean>(false);
  const [isNewQuoteModalOpen, setIsNewQuoteModalOpen] = useState<boolean>(false);
  const [isOrcaPluginModalOpen, setIsOrcaPluginModalOpen] = useState<boolean>(false);

  // OrcaSlicer Native Plugin Bridge State
  const inOrcaSlicer = useMemo(() => isRunningInOrcaSlicer(), []);
  const orcaHydratedRef = useRef<boolean>(!inOrcaSlicer);
  const userModifiedRef = useRef<boolean>(false);
  const hasReceivedOrcaSliceRef = useRef<boolean>(false);

  const [isOrcaSlicing, setIsOrcaSlicing] = useState<boolean>(false);
  const [orcaAppendMode, setOrcaAppendMode] = useState<boolean>(false);
  const orcaAppendModeRef = useRef<boolean>(orcaAppendMode);
  useEffect(() => {
    orcaAppendModeRef.current = orcaAppendMode;
  }, [orcaAppendMode]);

  const [orcaSyncBanner, setOrcaSyncBanner] = useState<{
    title: string;
    subtitle: string;
    printerName?: string;
    slicerVersion?: string;
  } | null>(() =>
    inOrcaSlicer
      ? {
          title: 'Connected to OrcaSlicer Slicing Engine',
          subtitle: 'Slice any plate in Prepare/Preview to automatically pull G-code, print times, and filament spools.',
        }
      : null
  );

  // Active Client & Project Metadata for Quote
  const [clientName, setClientName] = useState<string>(() => {
    return initialSaved.clientName || safeGetItem('layercost_active_client') || 'Horizon Engineering Ltd';
  });
  const [projectName, setProjectName] = useState<string>(() => {
    return initialSaved.projectName || safeGetItem('layercost_active_project') || 'Custom Rapid Prototype Batch';
  });

  // Cost Parameters State (merged cleanly with any saved user edits)
  const [params, setParams] = useState<CostParameters>(() => {
    const sp = initialSaved.savedParams || {};
    return {
      filaments: [],
      filamentGrams: SAMPLE_GCODES[0].metadata.filamentGrams,
      spoolPrice: 22.00, // per 1kg roll
      spoolWeightGrams: 1000,
      extraPurgeGrams: 0,

      printHours: Math.round((SAMPLE_GCODES[0].metadata.printTimeSeconds / 3600) * 100) / 100,
      printerWatts: sp.printerWatts ?? 180,
      kwhRate: sp.kwhRate ?? 0.18, // Global commercial average tariff
      preheatKwh: sp.preheatKwh ?? 0.08,

      printerCost: sp.printerCost ?? 1199, // Bambu X1-Carbon
      printerLifespanHours: sp.printerLifespanHours ?? 4000,
      salvageValue: sp.salvageValue ?? 180,

      maintenanceHourlyRate: sp.maintenanceHourlyRate ?? 0.40, // per print hour
      prepConsumablesCost: sp.prepConsumablesCost ?? 0.50, // IPA, bed adhesive

      // 3D CAD Modeling & Client Review (Optional custom engineering)
      enableCadService: sp.enableCadService ?? false,
      cadModelingHours: sp.cadModelingHours ?? 1.5,
      cadReviewCycles: sp.cadReviewCycles ?? 1,
      cadReviewMinutesPerCycle: sp.cadReviewMinutesPerCycle ?? 30,
      cadHourlyRate: sp.cadHourlyRate ?? 65.0,

      // Slicing & Toolpath Generation
      slicingMins: sp.slicingMins ?? 10,
      setupMins: sp.setupMins ?? 5,
      removalMins: sp.removalMins ?? 4,
      postProcessingMins: sp.postProcessingMins ?? 8,
      qaInspectionMins: sp.qaInspectionMins ?? 5,
      packagingMins: sp.packagingMins ?? 5,
      laborHourlyRate: sp.laborHourlyRate ?? 28.0,

      failureRiskPercent: sp.failureRiskPercent ?? 10,

      enablePackaging: sp.enablePackaging ?? true,
      packagingCostPerUnit: sp.packagingCostPerUnit ?? 3.50,
      workshopOverheadPerPrint: sp.workshopOverheadPerPrint ?? 1.50,

      markupPercent: sp.markupPercent ?? 35,
      quantity: 1, // Multiplier for job batches
    };
  });

  // Persist user settings (filaments, electricity, printer, commercial params) to localStorage + OrcaSlicer storage
  useEffect(() => {
    if (!orcaHydratedRef.current && !userModifiedRef.current) return;

    const timer = window.setTimeout(() => {
      let customFilaments: CustomFilamentPreset[] | undefined;
      try {
        const raw = safeGetItem(CUSTOM_FILAMENTS_STORAGE_KEY);
        if (raw) customFilaments = JSON.parse(raw);
      } catch {
        // ignore
      }

      const { filaments: _ignoredFils, quantity: _ignoredQty, ...persistableParams } = params;
      const snapshot: LayerCostSavedSettings = {
        currencyCode,
        selectedPrinterId,
        selectedElectricityId,
        printerCustomized,
        printerOverrides,
        savedParams: persistableParams,
        filaments,
        filamentPricingPrefs,
        customFilaments,
        clientName,
        projectName,
      };
      saveSettingsToStorage(snapshot, inOrcaSlicer);
    }, 150);

    return () => window.clearTimeout(timer);
  }, [
    currencyCode,
    selectedPrinterId,
    selectedElectricityId,
    printerCustomized,
    printerOverrides,
    params,
    filaments,
    filamentPricingPrefs,
    clientName,
    projectName,
    inOrcaSlicer,
  ]);

  const handleFilamentsChange = (nextFilaments: FilamentEntry[]) => {
    userModifiedRef.current = true;
    const nextPrefs = buildFilamentPricingPrefs(nextFilaments, filamentPricingPrefsRef.current);
    filamentPricingPrefsRef.current = nextPrefs;
    safeSetItem(FILAMENT_PREFS_STORAGE_KEY, JSON.stringify(nextPrefs));
    setFilamentPricingPrefs(nextPrefs);
    setFilaments(nextFilaments);
  };

  const handleCustomLibraryChange = (library: CustomFilamentPreset[]) => {
    userModifiedRef.current = true;
    const { filaments: _ignoredFils, quantity: _ignoredQty, ...persistableParams } = params;
    saveSettingsToStorage(
      {
        currencyCode,
        selectedPrinterId,
        selectedElectricityId,
        printerCustomized,
        printerOverrides,
        savedParams: persistableParams,
        filaments,
        filamentPricingPrefs,
        customFilaments: library,
        clientName,
        projectName,
      },
      inOrcaSlicer
    );
  };

  const updatePrinterParam = (updates: Partial<CostParameters>) => {
    userModifiedRef.current = true;
    setPrinterCustomized(true);
    setParams((prev) => {
      const next = { ...prev, ...updates };
      setPrinterOverrides((prevMap) => ({
        ...prevMap,
        [selectedPrinterId]: {
          printerWatts: next.printerWatts,
          printerCost: next.printerCost,
          printerLifespanHours: next.printerLifespanHours,
          salvageValue: next.salvageValue,
          maintenanceHourlyRate: next.maintenanceHourlyRate,
          prepConsumablesCost: next.prepConsumablesCost,
        },
      }));
      return next;
    });
  };

  // Active file derived from queue
  const activeFile = files.find((f) => f.id === activeFileId) || files[0] || null;
  const metadata = activeFile?.metadata || null;

  // Track if user manually overrode printHours while queue files exist
  const [printHoursManualOverride, setPrintHoursManualOverride] = useState<boolean>(false);

  // Total machine print hours aggregated from all active files
  const effectivePrintHours = useMemo(() => {
    const active = files.filter((f) => f.enabled);
    if (active.length === 0) return 0;
    const hours = active.reduce(
      (sum, f) => sum + (f.metadata.printTimeSeconds / 3600) * f.quantity,
      0
    );
    return Math.round(hours * 100) / 100;
  }, [files]);

  // Carry over total machine time to Print Duration (Hours) whenever queue files change
  useEffect(() => {
    setPrintHoursManualOverride(false);
    setParams((prev) =>
      prev.printHours === effectivePrintHours ? prev : { ...prev, printHours: effectivePrintHours }
    );
  }, [files, effectivePrintHours]);

  // Total components count in the production batch
  const totalBatchUnits = useMemo(() => {
    const active = files.filter((f) => f.enabled);
    if (active.length === 0) return params.quantity;
    return active.reduce((sum, f) => sum + f.quantity, 0) * Math.max(1, params.quantity);
  }, [files, params.quantity]);

  // Effective params feeding the cost breakdown engine
  const effectiveParams: CostParameters = useMemo(() => {
    return {
      ...params,
      filaments,
      printHours:
        printHoursManualOverride || effectivePrintHours === 0
          ? params.printHours
          : effectivePrintHours,
    };
  }, [params, filaments, effectivePrintHours, printHoursManualOverride]);

  // Live Cost Breakdown
  const breakdown = useMemo(() => calculatePrintCosts(effectiveParams), [effectiveParams]);

  // Handle Preset Changes
  const handlePrinterSelect = (printerId: string) => {
    userModifiedRef.current = true;
    setSelectedPrinterId(printerId);
    setPrinterCustomized(true);
    const p = PRINTER_PRESETS.find((x) => x.id === printerId);
    if (!p) return;
    const savedOverride = printerOverrides[printerId];
    setParams((prev) => ({
      ...prev,
      printerWatts: savedOverride?.printerWatts ?? p.avgWatts,
      printerCost: savedOverride?.printerCost ?? p.purchasePrice,
      printerLifespanHours: savedOverride?.printerLifespanHours ?? p.lifespanHours,
      salvageValue: savedOverride?.salvageValue ?? prev.salvageValue,
      maintenanceHourlyRate: savedOverride?.maintenanceHourlyRate ?? p.hourlyMaintenance,
      prepConsumablesCost: savedOverride?.prepConsumablesCost ?? prev.prepConsumablesCost,
    }));
  };

  const handleElectricitySelect = (regionId: string) => {
    userModifiedRef.current = true;
    setSelectedElectricityId(regionId);
    const e = ELECTRICITY_PRESETS.find((x) => x.id === regionId);
    if (!e) return;
    setParams((prev) => ({
      ...prev,
      kwhRate: e.ratePerKwh,
    }));
  };

  // Subscribe to OrcaSlicer Plugin lifecycle & post-slice data bridge
  useEffect(() => {
    const unsubscribe = subscribeOrcaMessages((msg) => {
      if (msg.type === 'settings_loaded') {
        const s = (msg.settings || {}) as LayerCostSavedSettings;
        if (Object.keys(s).length > 0 && !userModifiedRef.current) {
          if (s.filamentPricingPrefs) {
            filamentPricingPrefsRef.current = s.filamentPricingPrefs;
            safeSetItem(FILAMENT_PREFS_STORAGE_KEY, JSON.stringify(s.filamentPricingPrefs));
            setFilamentPricingPrefs(s.filamentPricingPrefs);
          }
          if (s.customFilaments) {
            safeSetItem(CUSTOM_FILAMENTS_STORAGE_KEY, JSON.stringify(s.customFilaments));
          }
          if (s.currencyCode) {
            const resolved = findCurrencyByCode(s.currencyCode);
            setCurrencyCode(resolved.code);
            safeSetItem('layercost_currency_code', resolved.code);
          }
          if (s.selectedPrinterId) {
            selectedPrinterIdRef.current = s.selectedPrinterId;
            setSelectedPrinterId(s.selectedPrinterId);
          }
          if (s.selectedElectricityId) {
            setSelectedElectricityId(s.selectedElectricityId);
          }
          if (typeof s.printerCustomized === 'boolean') {
            printerCustomizedRef.current = s.printerCustomized;
            setPrinterCustomized(s.printerCustomized);
          }
          if (s.printerOverrides) {
            printerOverridesRef.current = s.printerOverrides;
            setPrinterOverrides(s.printerOverrides);
          }
          if (s.savedParams) {
            setParams((prev) => ({ ...prev, ...s.savedParams }));
          }
          if (s.filaments && s.filaments.length > 0 && !hasReceivedOrcaSliceRef.current) {
            setFilaments(s.filaments);
          }
          if (s.clientName) {
            setClientName(s.clientName);
            safeSetItem('layercost_active_client', s.clientName);
          }
          if (s.projectName) {
            setProjectName(s.projectName);
            safeSetItem('layercost_active_project', s.projectName);
          }
          saveSettingsToStorage(s, false);
          window.dispatchEvent(new CustomEvent('layercost-settings-hydrated', { detail: s }));
        }
        orcaHydratedRef.current = true;
        return;
      }

      if (msg.type === 'slicing_started') {
        setIsOrcaSlicing(true);
        setParseError(null);
        setOrcaSyncBanner({
          title: 'OrcaSlicer is slicing your build plate...',
          subtitle: 'Metrics, print time, and multi-filament weights will pull automatically upon completion.',
        });
        return;
      }

      if (msg.type === 'slicing_error') {
        setIsOrcaSlicing(false);
        setParseError(`OrcaSlicer reported a slicing error: ${msg.message}`);
        return;
      }

      if (msg.type === 'no_slice_yet') {
        hasReceivedOrcaSliceRef.current = true;
        setIsOrcaSlicing(false);
        const info = msg.hostInfo;
        setOrcaSyncBanner({
          title: 'Connected to OrcaSlicer · Waiting for Slice',
          subtitle: info?.objectCount
            ? `${info.objectCount} object(s) on build plate. Click Slice Plate in OrcaSlicer to pull job data.`
            : 'Load a model and slice any plate in OrcaSlicer to auto-populate costs.',
          printerName: info?.printerName,
        });
        return;
      }

      if (msg.type === 'slice_complete' || msg.type === 'gcode_data') {
        hasReceivedOrcaSliceRef.current = true;
        setIsOrcaSlicing(false);
        setParseError(null);

        const converted = convertOrcaPayloadToJob(msg.payload);
        if (converted.files.length > 0) {
          if (orcaAppendModeRef.current) {
            setFiles((prev) => [...prev, ...converted.files]);
          } else {
            setFiles(converted.files);
          }
          setActiveFileId(converted.files[converted.files.length - 1].id);
        }

        if (converted.filaments.length > 0) {
          if (orcaAppendModeRef.current) {
            setFilaments((prev) => {
              const merged = [...prev];
              converted.filaments.forEach((incoming) => {
                const existingIdx = merged.findIndex(
                  (m) => m.type.toUpperCase() === incoming.type.toUpperCase() && m.name === incoming.name
                );
                if (existingIdx >= 0) {
                  merged[existingIdx] = {
                    ...merged[existingIdx],
                    gramsUsed: Math.round((merged[existingIdx].gramsUsed + incoming.gramsUsed) * 10) / 10,
                    purgeGrams: Math.round(((merged[existingIdx].purgeGrams || 0) + (incoming.purgeGrams || 0)) * 10) / 10,
                  };
                } else {
                  merged.push(incoming);
                }
              });
              return merged;
            });
          } else {
            setFilaments(converted.filaments);
          }
        }

        if (converted.matchedPrinter && !printerCustomizedRef.current) {
          const mp = converted.matchedPrinter;
          const override = printerOverridesRef.current[mp.id];
          selectedPrinterIdRef.current = mp.id;
          setSelectedPrinterId(mp.id);
          setParams((prev) => ({
            ...prev,
            printerWatts: override?.printerWatts ?? mp.avgWatts,
            printerCost: override?.printerCost ?? mp.purchasePrice,
            printerLifespanHours: override?.printerLifespanHours ?? mp.lifespanHours,
            salvageValue: override?.salvageValue ?? prev.salvageValue,
            maintenanceHourlyRate: override?.maintenanceHourlyRate ?? mp.hourlyMaintenance,
            prepConsumablesCost: override?.prepConsumablesCost ?? prev.prepConsumablesCost,
          }));
        }

        if (converted.projectName) {
          setProjectName(converted.projectName);
        }

        const plateCount = converted.files.length;
        const totalSecs = converted.files.reduce((sum, f) => sum + f.metadata.printTimeSeconds, 0);
        const totalGrams = converted.files.reduce((sum, f) => sum + f.metadata.filamentGrams, 0);
        const primaryFile = converted.files[0];

        setOrcaSyncBanner({
          title:
            msg.payload.source === 'orcaslicer-simulator'
              ? `Simulated OrcaSlicer Multi-Plate Pull Complete (${plateCount} Plates)`
              : plateCount > 1
              ? `Pulled ${plateCount} Plates Directly from OrcaSlicer`
              : 'Pulled Directly from OrcaSlicer',
          subtitle:
            plateCount > 1
              ? `${plateCount} plates · ${formatSecondsToHms(totalSecs)} total print time · ${totalGrams.toFixed(1)}g across ${converted.filaments.length || 1} spool(s)`
              : primaryFile
              ? `${primaryFile.fileName} · ${primaryFile.metadata.printTimeFormatted} · ${primaryFile.metadata.filamentGrams}g across ${converted.filaments.length || 1} spool(s)`
              : 'Slice metrics synced directly from OrcaSlicer.',
          printerName: msg.payload.printerName || converted.matchedPrinter?.name,
          slicerVersion: msg.payload.slicerVersion,
        });
      }
    });

    let retryTimer: number | undefined;
    if (isRunningInOrcaSlicer()) {
      postToOrca({ type: 'ready' });
      retryTimer = window.setTimeout(() => {
        if (!hasReceivedOrcaSliceRef.current) {
          requestLatestSliceFromOrca();
        }
      }, 750);
    }

    return () => {
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      unsubscribe();
    };
  }, []);

  // Add a sample model to the job queue
  const handleAddSample = (sampleIndex: number) => {
    const s = SAMPLE_GCODES[sampleIndex];
    const newFileItem: GcodeFileItem = {
      id: `sample-${Date.now()}-${sampleIndex}`,
      fileName: s.metadata.fileName,
      metadata: s.metadata,
      quantity: 1,
      assignedFilamentId: filaments[0]?.id || 'fil-1',
      enabled: true,
    };
    setFiles((prev) => [...prev, newFileItem]);
    setActiveFileId(newFileItem.id);
    setParseError(null);
  };

  // Handle Multi-File Upload from Computer
  const handleFilesUpload = async (uploadedFiles: FileList | File[]) => {
    const fileArray = Array.from(uploadedFiles);
    if (fileArray.length === 0) return;

    setIsParsing(true);
    setParseError(null);

    try {
      const parsedResults = await Promise.all(
        fileArray.map(async (file) => {
          const parsed = await parseGcodeFile(file);
          const newItem: GcodeFileItem = {
            id: `file-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            fileName: file.name,
            metadata: parsed,
            quantity: 1,
            assignedFilamentId: filaments[0]?.id || 'fil-1',
            enabled: true,
          };
          return newItem;
        })
      );

      // Check if any parsed file contains multi-material comments from slicer
      const multiMaterialFile = parsedResults.find(
        (f) => f.metadata.multiFilaments && f.metadata.multiFilaments.length > 1
      );

      if (multiMaterialFile && multiMaterialFile.metadata.multiFilaments) {
        // Auto-configure filament slots matching the multi-material comment slots
        const newSlots: FilamentEntry[] = multiMaterialFile.metadata.multiFilaments.map(
          (m, idx) => ({
            id: `fil-auto-${idx + 1}-${Date.now()}`,
            name: `Slot ${m.slot} (${m.type || 'PLA'})`,
            type: m.type || 'PLA',
            spoolPrice: 22.00,
            spoolWeightGrams: 1000,
            gramsUsed: m.grams,
            purgeGrams: 0,
            colorHex: m.colorHex || (idx === 0 ? '#38bdf8' : idx === 1 ? '#f97316' : '#10b981'),
          })
        );
        setFilaments(newSlots);
      }

      setFiles((prev) => [...prev, ...parsedResults]);
      if (parsedResults.length > 0) {
        setActiveFileId(parsedResults[parsedResults.length - 1].id);
      }
    } catch (err) {
      console.error(err);
      setParseError('Failed to parse one or more G-code files. Please ensure files are valid G-code.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesUpload(e.dataTransfer.files);
    }
  };

  const handleToggleFile = (id: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, enabled: !f.enabled } : f))
    );
  };

  const handleChangeQuantity = (id: string, qty: number) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, quantity: Math.max(1, qty) } : f))
    );
  };

  const handleAssignFilament = (id: string, filamentId: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, assignedFilamentId: filamentId } : f))
    );
  };

  const handleRemoveFile = (id: string) => {
    setFiles((prev) => {
      const remaining = prev.filter((f) => f.id !== id);
      if (activeFileId === id && remaining.length > 0) {
        setActiveFileId(remaining[0].id);
      }
      return remaining;
    });
  };

  const handleTriggerUpload = () => {
    document.getElementById(fileInputId)?.click();
  };

  // Feature 1: Create New Quote (blanks print and filament data, sets client name)
  const handleCreateNewQuote = (newClient: string, newProject: string) => {
    // 1. Blank print files queue & selection
    setFiles([]);
    setActiveFileId(null);
    setParseError(null);

    // 2. Blank filament data to 0g
    const freshFilaments: FilamentEntry[] = [
      {
        id: `fil-1-${Date.now()}`,
        name: 'Primary Spool (PLA)',
        type: 'PLA',
        spoolPrice: 22.00,
        spoolWeightGrams: 1000,
        gramsUsed: 0,
        purgeGrams: 0,
        colorHex: '#38bdf8',
      },
    ];
    setFilaments(freshFilaments);

    // 3. Reset print hours and filament consumption
    setParams((prev) => ({
      ...prev,
      filamentGrams: 0,
      extraPurgeGrams: 0,
      printHours: 0,
      quantity: 1,
    }));

    // 4. Set client and project metadata
    userModifiedRef.current = true;
    setClientName(newClient);
    setProjectName(newProject || `Manufacturing Quote - ${newClient}`);
    safeSetItem('layercost_active_client', newClient);
    if (newProject) safeSetItem('layercost_active_project', newProject);
  };

  const currentPrinter = PRINTER_PRESETS.find((p) => p.id === selectedPrinterId) || PRINTER_PRESETS[0];

  return (
    <div className="min-h-screen bg-[#262628] text-[#ededed] flex flex-col font-sans selection:bg-[#00ae42] selection:text-white">
      {/* Top Bar Contract: OrcaSlicer dark titlebar (#1e1e20) with #00ae42 green accents */}
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2.5 px-5 py-2.5 border-b border-[#3f3f44] bg-[#1e1e20] shrink-0 sticky top-0 z-30">
        {/* Zone 1: Brand wordmark with OrcaSlicer green accent */}
        <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
          <div className="w-8 h-8 rounded bg-[#00ae42]/15 border border-[#00ae42]/40 flex items-center justify-center text-[#00c44b]">
            <Printer className="w-4 h-4" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold tracking-tight text-white">LayerCost</span>
          </div>
          <span className="text-xs text-zinc-400 hidden xl:inline ml-1 font-medium">· 3D Print Cost & Quoting Engine</span>
        </div>

        {/* Zone 2: Navigation tabs with OrcaSlicer #00ae42 active indicator */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-400">
          <button
            onClick={() => setActiveTab('calculator')}
            className={`transition-colors whitespace-nowrap shrink-0 py-1.5 cursor-pointer ${
              activeTab === 'calculator'
                ? 'text-[#00c44b] font-semibold border-b-2 border-[#00ae42]'
                : 'hover:text-zinc-200 border-b-2 border-transparent'
            }`}
          >
            Cost Breakdown
          </button>
          <button
            onClick={() => setActiveTab('batch')}
            className={`transition-colors whitespace-nowrap shrink-0 py-1.5 cursor-pointer ${
              activeTab === 'batch'
                ? 'text-[#00c44b] font-semibold border-b-2 border-[#00ae42]'
                : 'hover:text-zinc-200 border-b-2 border-transparent'
            }`}
          >
            Batch Pricing Table
          </button>
        </nav>

        {/* Zone 3: World Currency dropdown, OrcaSlicer Plugin & OrcaSlicer Green primary action */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {inOrcaSlicer ? (
            <button
              onClick={() => requestLatestSliceFromOrca()}
              className="px-3 py-1.5 text-xs font-semibold text-[#26b4b0] hover:text-white bg-[#262628] hover:bg-[#36363a] border border-[#26b4b0]/40 rounded transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 active:scale-95 cursor-pointer"
              title="Re-pull latest sliced G-code & filament metrics directly from OrcaSlicer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isOrcaSlicing ? 'animate-spin' : ''}`} />
              <span>Pull Slice</span>
            </button>
          ) : (
            <button
              onClick={() => setIsOrcaPluginModalOpen(true)}
              className="px-3 py-1.5 text-xs font-semibold text-[#26b4b0] hover:text-white bg-[#262628] hover:bg-[#36363a] border border-[#45454a] hover:border-[#26b4b0]/60 rounded transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 active:scale-95 cursor-pointer"
              title="Download standalone OrcaSlicer v2.5+ Python Plugin or simulate post-slice pull"
            >
              <Cpu className="w-3.5 h-3.5 text-[#26b4b0]" />
              <span>OrcaSlicer Plugin</span>
            </button>
          )}

          <button
            onClick={() => setIsNewQuoteModalOpen(true)}
            className="px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:text-white bg-[#2d2d30] hover:bg-[#36363a] border border-[#45454a] hover:border-[#5a5a62] rounded transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 active:scale-95 cursor-pointer"
            title="Create new quote: blanks print files and filament data, and sets client name"
          >
            <FilePlus className="w-3.5 h-3.5 text-[#00c44b]" />
            <span>+ New Quote</span>
          </button>

          <div
            className="flex items-center gap-1.5 bg-[#262628] border border-[#45454a] hover:border-[#00ae42]/60 focus-within:border-[#00ae42] rounded px-2 py-1 text-xs transition-colors"
            title={`Active Currency: ${activeCurrency.name} (${activeCurrency.code})`}
          >
            <Globe className="w-3.5 h-3.5 text-[#26b4b0] shrink-0" />
            <select
              aria-label="Select Currency"
              value={currencyCode}
              onChange={(e) => handleCurrencyChange(e.target.value)}
              className="bg-transparent text-zinc-100 font-mono text-xs font-medium focus:outline-hidden cursor-pointer max-w-[165px] pr-1"
            >
              <optgroup label="Popular Currencies" className="bg-[#1e1e20] text-zinc-100">
                {popularCurrencies.map((c) => (
                  <option key={`pop-${c.code}`} value={c.code} className="bg-[#1e1e20] text-zinc-100">
                    {c.code} ({c.symbol.trim()}) — {c.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="All World Currencies (ISO 4217)" className="bg-[#1e1e20] text-zinc-100">
                {WORLD_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code} className="bg-[#1e1e20] text-zinc-100">
                    {c.code} ({c.symbol.trim()}) — {c.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          <button
            onClick={() => {
              setIsAutoPrintQuote(true);
              setIsQuoteModalOpen(true);
            }}
            className="px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:text-white bg-[#2d2d30] hover:bg-[#36363a] border border-[#45454a] hover:border-[#5a5a62] rounded transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 active:scale-95 cursor-pointer"
            title="Export structured quotation as PDF via browser print (window.print())"
          >
            <Printer className="w-3.5 h-3.5 text-[#f58220]" />
            <span>Export PDF</span>
          </button>

          <button
            onClick={() => {
              setIsAutoPrintQuote(false);
              setIsQuoteModalOpen(true);
            }}
            className="px-4 py-1.5 text-xs font-semibold text-white bg-[#00ae42] hover:bg-[#00c44b] rounded transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 active:scale-95 cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Generate Tax Quote</span>
          </button>
        </div>
      </header>

      {/* Main Viewport Container */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-5">
        {/* Active Client Quote Header Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 px-4 rounded-md border border-[#3f3f44] bg-[#2d2d30]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded bg-[#00ae42]/15 border border-[#00ae42]/40 flex items-center justify-center text-[#00c44b] shrink-0">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#00c44b] font-mono">Active Quote</span>
                <span className="text-zinc-600">·</span>
                <span className="text-xs font-semibold text-white truncate">{clientName || 'Untitled Client'}</span>
              </div>
              <p className="text-xs text-zinc-400 truncate">
                {projectName} <span className="text-zinc-500">({files.length} {files.length === 1 ? 'file' : 'files'} · {filaments.length} {filaments.length === 1 ? 'spool' : 'spools'})</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            <button
              onClick={() => setIsNewQuoteModalOpen(true)}
              className="px-2.5 py-1 text-xs font-medium text-zinc-200 hover:text-white bg-[#36363a] hover:bg-[#424247] border border-[#4e4e54] rounded transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <FilePlus className="w-3.5 h-3.5 text-[#00c44b]" />
              <span>New Client Quote</span>
            </button>
          </div>
        </div>

        {/* OrcaSlicer Direct-Pull Bridge Banner (Shown inside OrcaSlicer or after slice pull) */}
        {orcaSyncBanner && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 px-4 rounded-md border border-[#00ae42]/50 bg-[#2d2d30]">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded bg-[#00ae42]/15 border border-[#00ae42]/40 flex items-center justify-center text-[#00c44b] shrink-0">
                <Cpu className={`w-4 h-4 ${isOrcaSlicing ? 'animate-pulse text-[#f58220]' : ''}`} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-white">{orcaSyncBanner.title}</span>
                  {orcaSyncBanner.slicerVersion && (
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#1e1e20] text-[#26b4b0] border border-[#45454a]">
                      {orcaSyncBanner.slicerVersion}
                    </span>
                  )}
                  {orcaSyncBanner.printerName && (
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#1e1e20] text-[#f58220] border border-[#45454a]">
                      {orcaSyncBanner.printerName}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-zinc-400 truncate mt-0.5">{orcaSyncBanner.subtitle}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="flex items-center bg-[#1e1e20] border border-[#45454a] rounded p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setOrcaAppendMode(false)}
                  className={`px-2 py-0.5 rounded-xs transition-colors cursor-pointer ${
                    !orcaAppendMode ? 'bg-[#00ae42]/20 text-[#00c44b] font-semibold' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  title="Replace active job when a new plate is sliced"
                >
                  Replace Job
                </button>
                <button
                  type="button"
                  onClick={() => setOrcaAppendMode(true)}
                  className={`px-2 py-0.5 rounded-xs transition-colors cursor-pointer ${
                    orcaAppendMode ? 'bg-[#f58220]/20 text-[#f58220] font-semibold' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  title="Append each newly sliced plate to multi-plate quote batch"
                >
                  Append Plate
                </button>
              </div>

              {inOrcaSlicer ? (
                <button
                  type="button"
                  onClick={() => requestLatestSliceFromOrca()}
                  className="px-2.5 py-1 text-xs font-semibold text-white bg-[#00ae42] hover:bg-[#00c44b] rounded transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isOrcaSlicing ? 'animate-spin' : ''}`} />
                  <span>Pull Latest Slice</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setOrcaSyncBanner(null)}
                  className="px-2 py-1 text-[11px] text-zinc-400 hover:text-white bg-[#36363a] rounded border border-[#4e4e54] cursor-pointer"
                >
                  Dismiss
                </button>
              )}
            </div>
          </div>
        )}

        {/* Top Hero Bar: G-code File Dropzone & Slicer Quick Load */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {/* File Upload Zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="lg:col-span-8 p-5 rounded-md border border-dashed border-[#4e4e54] bg-[#2d2d30] hover:bg-[#323236] hover:border-[#00ae42] transition-colors flex flex-col justify-between"
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded bg-[#00ae42]/15 border border-[#00ae42]/40 flex items-center justify-center text-[#00c44b] shrink-0">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white">
                    {files.length > 1
                      ? `Multi-File Batch Loaded (${files.length} G-code Files · ${totalBatchUnits} Plates)`
                      : activeFile
                      ? activeFile.fileName
                      : 'Drop Slicer G-code Files (Single or Multiple)'}
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Drag and drop one or multiple .gcode files at once. Parses OrcaSlicer, Bambu Studio, PrusaSlicer, Cura, Klipper & ideaMaker.
                  </p>
                </div>
              </div>

              <div>
                <input
                  id={fileInputId}
                  type="file"
                  multiple
                  accept=".gcode,.gco,.g"
                  onChange={(e) => e.target.files && handleFilesUpload(e.target.files)}
                  className="hidden"
                />
                <label
                  htmlFor={fileInputId}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#36363a] hover:bg-[#424247] rounded cursor-pointer transition-colors border border-[#4e4e54]"
                >
                  <FileCode className="w-4 h-4 text-[#00c44b]" />
                  <span>{isParsing ? 'Analyzing G-Code Files...' : 'Browse Computer (Multi-Select)'}</span>
                </label>
              </div>
            </div>

            {/* Active File Metadata Indicators */}
            {metadata && (
              <div className="mt-4 pt-3.5 border-t border-[#3f3f44] flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-mono text-zinc-300 tabular-nums">
                <div className="flex items-center gap-1.5 text-[#00c44b]">
                  <span className="text-zinc-500">Previewing:</span>
                  <span className="font-semibold truncate max-w-[200px]">{metadata.fileName}</span>
                  <span className="text-zinc-400">({metadata.slicer})</span>
                </div>
                <div className="text-zinc-600 hidden sm:inline">·</div>
                <div>
                  <span className="text-zinc-500">Time:</span>{' '}
                  <span className="font-semibold text-white">{metadata.printTimeFormatted}</span>
                </div>
                <div className="text-zinc-600 hidden sm:inline">·</div>
                <div>
                  <span className="text-zinc-500">Filament:</span>{' '}
                  <span className="font-semibold text-white">{metadata.filamentGrams}g</span>{' '}
                  <span className="text-zinc-500">({metadata.filamentMeters}m)</span>
                </div>
                <div className="text-zinc-600 hidden sm:inline">·</div>
                <div>
                  <span className="text-zinc-500">Layers:</span>{' '}
                  <span className="font-semibold text-white">{metadata.layerCount}</span>{' '}
                  <span className="text-zinc-500">(@{metadata.layerHeightMm}mm)</span>
                </div>
                {metadata.dimensions && (
                  <>
                    <div className="text-zinc-600 hidden sm:inline">·</div>
                    <div>
                      <span className="text-zinc-500">Dimensions:</span>{' '}
                      <span className="font-semibold text-white">
                        {metadata.dimensions.width}×{metadata.dimensions.depth}×{metadata.dimensions.height}mm
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}

            {parseError && (
              <div className="mt-3 p-2 bg-rose-950/40 border border-rose-800/60 rounded text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{parseError}</span>
              </div>
            )}
          </div>

          {/* Quick Add Sample Models to Queue */}
          <div className="lg:col-span-4 p-4 sm:p-5 rounded-md border border-[#3f3f44] bg-[#2d2d30] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-semibold tracking-wider text-zinc-400">
                  Instant Test Models
                </span>
                <span className="text-[11px] text-[#00c44b] font-medium">+ Add to Queue</span>
              </div>
              <div className="mt-3 space-y-2">
                {SAMPLE_GCODES.map((sample, idx) => {
                  const isAlreadyInQueue = files.some((f) => f.fileName === sample.metadata.fileName);
                  return (
                    <button
                      key={idx}
                      onClick={() => handleAddSample(idx)}
                      className="w-full text-left p-2.5 rounded border border-[#3a3a3f] bg-[#232325] text-zinc-300 hover:bg-[#36363a] hover:border-[#525259] text-xs transition-colors flex items-center justify-between cursor-pointer"
                      title="Add this model into the multi-file job queue"
                    >
                      <div className="truncate pr-2">
                        <div className="font-medium text-zinc-200 flex items-center gap-1.5">
                          <span>{sample.label}</span>
                          {isAlreadyInQueue && (
                            <span className="text-[9px] px-1 bg-[#1e1e20] text-[#00c44b] border border-[#00ae42]/40 rounded-xs">In queue</span>
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-400 truncate">{sample.desc}</div>
                      </div>
                      <Plus className="w-4 h-4 shrink-0 text-[#00c44b]" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Multi-File Job Queue Card */}
        <JobFilesQueue
          files={files}
          activeFileId={activeFileId}
          onSelectActiveFile={setActiveFileId}
          onToggleFile={handleToggleFile}
          onChangeQuantity={handleChangeQuantity}
          onAssignFilament={handleAssignFilament}
          onRemoveFile={handleRemoveFile}
          onAddSample={handleAddSample}
          onTriggerUpload={handleTriggerUpload}
          filaments={filaments}
          currencySymbol={currencySymbol}
        />

        {/* Navigation Tabs for Mobile / Quick Switch */}
        <div className="flex md:hidden items-center gap-1 p-1 bg-[#1e1e20] border border-[#3f3f44] rounded-md">
          <button
            onClick={() => setActiveTab('calculator')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-xs transition-colors cursor-pointer ${
              activeTab === 'calculator' ? 'bg-[#00ae42] text-white font-semibold' : 'text-zinc-400'
            }`}
          >
            Cost Breakdown
          </button>
          <button
            onClick={() => setActiveTab('batch')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-xs transition-colors cursor-pointer ${
              activeTab === 'batch' ? 'bg-[#00ae42] text-white font-semibold' : 'text-zinc-400'
            }`}
          >
            Batch Pricing
          </button>
        </div>

        {/* Tab Content: Batch Calculator */}
        {activeTab === 'batch' && (
          <div className="p-5 rounded-md border border-[#3f3f44] bg-[#2d2d30] space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-2">
              <div>
                <h3 className="text-base font-semibold text-white">Batch & Volume Economics</h3>
                <p className="text-xs text-zinc-400">
                  Shows how fixed slicing and machine prep labor amortize across larger production runs, reducing cost per plate.
                </p>
              </div>
              <div className="text-xs font-mono text-[#00c44b] tabular-nums">
                Current Batch: {params.quantity} {params.quantity === 1 ? 'batch run' : 'batch runs'} ({totalBatchUnits} {totalBatchUnits === 1 ? 'plate' : 'plates'} total)
              </div>
            </div>
            <BatchCalculator
              baseParams={effectiveParams}
              currentQuantity={params.quantity}
              onSelectQuantity={(qty) => setParams((prev) => ({ ...prev, quantity: qty }))}
              currencySymbol={currencySymbol}
            />
          </div>
        )}

        {/* Tab Content: Core Cost Pillars Calculator (Always visible or primary tab) */}
        {activeTab === 'calculator' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left 8 Columns: Parameter Inputs Across All 6 Cost Pillars */}
            <div className="lg:col-span-8 space-y-4">
              {/* Pillar 1: Multi-Filament & Material Manager */}
              <MultiFilamentManager
                filaments={filaments}
                onChangeFilaments={handleFilamentsChange}
                files={files}
                currencySymbol={currencySymbol}
                batchMultiplier={params.quantity}
                onCustomLibraryChange={handleCustomLibraryChange}
              />

              {/* Pillar 2: Electricity & Power Tariffs */}
              <div className="p-4 sm:p-5 rounded-md border border-[#3f3f44] bg-[#2d2d30] space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-[#3f3f44] pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[#f58220]" />
                    <h3 className="text-sm font-semibold text-white">2. Electricity, Utility & Backup Tariffs</h3>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <span className="text-[11px] text-zinc-400 shrink-0">Regional Tariff:</span>
                    <select
                      value={selectedElectricityId}
                      onChange={(e) => handleElectricitySelect(e.target.value)}
                      className="bg-[#1e1e20] border border-[#45454a] text-xs rounded px-2 py-1 text-zinc-200 w-full sm:w-auto focus:border-[#00ae42] focus:outline-hidden"
                    >
                      {ELECTRICITY_PRESETS.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.region} ({currencySymbol}{e.ratePerKwh}/kWh)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="block text-xs text-zinc-400">Print Duration (Hours)</label>
                      {effectivePrintHours > 0 && printHoursManualOverride && (
                        <button
                          type="button"
                          onClick={() => {
                            setPrintHoursManualOverride(false);
                            setParams((prev) => ({ ...prev, printHours: effectivePrintHours }));
                          }}
                          className="text-[10px] font-mono text-[#00c44b] hover:text-white underline underline-offset-2 cursor-pointer"
                          title="Reset Print Duration to match Queue Machine Time"
                        >
                          Sync ({effectivePrintHours}h)
                        </button>
                      )}
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={params.printHours}
                      onChange={(e) => {
                        const val = Math.max(0, parseFloat(e.target.value) || 0);
                        setPrintHoursManualOverride(effectivePrintHours > 0);
                        setParams((prev) => ({ ...prev, printHours: val }));
                      }}
                      className="w-full bg-[#1e1e20] border border-[#45454a] rounded px-3 py-2 text-sm text-white font-mono focus:border-[#00ae42] focus:outline-hidden tabular-nums"
                    />
                    <span className="text-[10px] text-zinc-500 mt-0.5 block">
                      {(() => {
                        const totalMins = Math.round((params.printHours || 0) * 60);
                        const h = Math.floor(totalMins / 60);
                        const m = totalMins % 60;
                        return `${h}h ${m}m`;
                      })()}
                      {effectivePrintHours > 0 && !printHoursManualOverride && (
                        <span className="text-[#00c44b] ml-1.5">· Synced from machine time</span>
                      )}
                      {effectivePrintHours > 0 && printHoursManualOverride && (
                        <span className="text-[#f58220] ml-1.5">· Manual override</span>
                      )}
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Avg. Printer Power (Watts)</label>
                    <input
                      type="number"
                      step="5"
                      value={params.printerWatts}
                      onChange={(e) => updatePrinterParam({ printerWatts: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-[#1e1e20] border border-[#45454a] rounded px-3 py-2 text-sm text-white font-mono focus:border-[#00ae42] focus:outline-hidden tabular-nums"
                    />
                    <span className="text-[10px] text-zinc-500 mt-0.5 block">Heated bed + hotend avg (120W–260W)</span>
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Tariff Rate ({currencySymbol}/kWh)</label>
                    <input
                      type="number"
                      step="0.05"
                      value={params.kwhRate}
                      onChange={(e) => {
                        userModifiedRef.current = true;
                        setParams((prev) => ({ ...prev, kwhRate: parseFloat(e.target.value) || 0 }));
                      }}
                      className="w-full bg-[#1e1e20] border border-[#45454a] rounded px-3 py-2 text-sm text-white font-mono focus:border-[#00ae42] focus:outline-hidden tabular-nums"
                    />
                    <span className="text-[10px] text-zinc-500 mt-0.5 block">Utility Grid / Commercial / Solar Inverter</span>
                  </div>
                </div>
              </div>

              {/* Pillar 3: Machine Depreciation & Wear Consumables */}
              <div className="p-4 sm:p-5 rounded-md border border-[#3f3f44] bg-[#2d2d30] space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-[#3f3f44] pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-xs bg-zinc-400" />
                    <h3 className="text-sm font-semibold text-white">3. Machine Depreciation & Wear Consumables</h3>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <span className="text-[11px] text-zinc-400 shrink-0">Printer Preset:</span>
                    <select
                      value={selectedPrinterId}
                      onChange={(e) => handlePrinterSelect(e.target.value)}
                      className="bg-[#1e1e20] border border-[#45454a] text-xs rounded px-2 py-1 text-zinc-200 w-full sm:w-auto focus:border-[#00ae42] focus:outline-hidden"
                    >
                      {PRINTER_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({currencySymbol}{p.purchasePrice.toLocaleString()})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Machine Purchase Price ({currencySymbol})</label>
                    <input
                      type="number"
                      value={params.printerCost}
                      onChange={(e) => updatePrinterParam({ printerCost: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-[#1e1e20] border border-[#45454a] rounded px-3 py-2 text-sm text-white font-mono focus:border-[#00ae42] focus:outline-hidden tabular-nums"
                    />
                    <span className="text-[10px] text-zinc-500 mt-0.5 block">Hardware retail capital investment</span>
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Expected Lifespan (Hours)</label>
                    <input
                      type="number"
                      step="500"
                      value={params.printerLifespanHours}
                      onChange={(e) => updatePrinterParam({ printerLifespanHours: parseFloat(e.target.value) || 1 })}
                      className="w-full bg-[#1e1e20] border border-[#45454a] rounded px-3 py-2 text-sm text-white font-mono focus:border-[#00ae42] focus:outline-hidden tabular-nums"
                    />
                    <span className="text-[10px] text-zinc-500 mt-0.5 block">Usually 3,000 to 5,000 hrs</span>
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Maintenance ({currencySymbol}/print hour)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={params.maintenanceHourlyRate}
                      onChange={(e) => updatePrinterParam({ maintenanceHourlyRate: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-[#1e1e20] border border-[#45454a] rounded px-3 py-2 text-sm text-white font-mono focus:border-[#00ae42] focus:outline-hidden tabular-nums"
                    />
                    <span className="text-[10px] text-zinc-500 mt-0.5 block">Nozzles, belts, PEI sheet, lube</span>
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Prep Consumables ({currencySymbol}/print)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={params.prepConsumablesCost}
                      onChange={(e) => updatePrinterParam({ prepConsumablesCost: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-[#1e1e20] border border-[#45454a] rounded px-3 py-2 text-sm text-white font-mono focus:border-[#00ae42] focus:outline-hidden tabular-nums"
                    />
                    <span className="text-[10px] text-zinc-500 mt-0.5 block">IPA alcohol, bed glue, wipes</span>
                  </div>
                </div>
              </div>

              {/* Optional 3D CAD Modeling & Client Review Section */}
              <div className={`p-4 sm:p-5 rounded-md border transition-colors ${
                params.enableCadService
                  ? 'border-[#00ae42] bg-[#2d2d30]'
                  : 'border-[#3f3f44] bg-[#2d2d30]'
              } space-y-4`}>
                <div className="flex flex-wrap justify-between items-center gap-3 border-b border-[#3f3f44] pb-3">
                  <div className="flex items-center gap-2">
                    <PencilRuler className={`w-4 h-4 ${params.enableCadService ? 'text-[#00c44b]' : 'text-zinc-400'}`} />
                    <div>
                      <h3 className="text-sm font-semibold text-white flex flex-wrap items-center gap-2">
                        <span>4. 3D CAD Modeling & Client Design Review</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1e1e20] text-[#f58220] border border-[#45454a] font-mono font-normal">
                          Engineering Service
                        </span>
                      </h3>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Charge for custom 3D parametric design, drafting, and client iteration/sign-off sessions.
                      </p>
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={params.enableCadService}
                      onChange={(e) => setParams({ ...params, enableCadService: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-[#1e1e20] border border-[#45454a] peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-zinc-200 after:rounded-full after:h-4.5 after:w-4.5 after:transition-all peer-checked:bg-[#00ae42] peer-checked:border-[#00ae42]"></div>
                    <span className="ml-3 text-xs font-medium text-zinc-300">
                      {params.enableCadService ? 'CAD Included' : 'Client Provided File'}
                    </span>
                  </label>
                </div>

                {params.enableCadService ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] text-zinc-300 mb-1 font-medium">
                          CAD Modeling Time (Hours)
                        </label>
                        <input
                          type="number"
                          step="0.25"
                          min="0"
                          value={params.cadModelingHours}
                          onChange={(e) => setParams({ ...params, cadModelingHours: Math.max(0, parseFloat(e.target.value) || 0) })}
                          className="w-full bg-[#1e1e20] border border-[#45454a] rounded px-3 py-2 text-xs text-white font-mono focus:border-[#00ae42] focus:outline-hidden tabular-nums"
                        />
                        <span className="text-[10px] text-zinc-500 mt-0.5 block">Fusion 360 / SolidWorks design</span>
                      </div>

                      <div>
                        <label className="block text-[11px] text-zinc-300 mb-1 font-medium">
                          Client Review Sessions
                        </label>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={params.cadReviewCycles}
                          onChange={(e) => setParams({ ...params, cadReviewCycles: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                          className="w-full bg-[#1e1e20] border border-[#45454a] rounded px-3 py-2 text-xs text-white font-mono focus:border-[#00ae42] focus:outline-hidden tabular-nums"
                        />
                        <span className="text-[10px] text-zinc-500 mt-0.5 block">Consultation & revision rounds</span>
                      </div>

                      <div>
                        <label className="block text-[11px] text-zinc-300 mb-1 font-medium">
                          Duration per Session (Mins)
                        </label>
                        <input
                          type="number"
                          step="5"
                          min="0"
                          value={params.cadReviewMinutesPerCycle}
                          onChange={(e) => setParams({ ...params, cadReviewMinutesPerCycle: Math.max(0, parseFloat(e.target.value) || 0) })}
                          className="w-full bg-[#1e1e20] border border-[#45454a] rounded px-3 py-2 text-xs text-white font-mono focus:border-[#00ae42] focus:outline-hidden tabular-nums"
                        />
                        <span className="text-[10px] text-zinc-500 mt-0.5 block">Online or in-person feedback</span>
                      </div>

                      <div>
                        <label className="block text-[11px] text-zinc-300 mb-1 font-medium">
                          CAD Hourly Rate ({currencySymbol}/hr)
                        </label>
                        <input
                          type="number"
                          step="25"
                          min="0"
                          value={params.cadHourlyRate}
                          onChange={(e) => setParams({ ...params, cadHourlyRate: Math.max(0, parseFloat(e.target.value) || 0) })}
                          className="w-full bg-[#1e1e20] border border-[#45454a] rounded px-3 py-2 text-xs text-white font-mono focus:border-[#00ae42] focus:outline-hidden tabular-nums"
                        />
                        <span className="text-[10px] text-zinc-500 mt-0.5 block">Typical commercial CAD engineering rate</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between p-3 rounded bg-[#232325] border border-[#00ae42]/40 text-xs">
                      <div className="flex items-center gap-4 text-zinc-300">
                        <span>
                          Modeling: <strong className="text-white font-mono tabular-nums">{currencySymbol}{breakdown.cadDesignCost.toFixed(2)}</strong> ({params.cadModelingHours}h)
                        </span>
                        <span className="text-zinc-600">·</span>
                        <span>
                          Review ({params.cadReviewCycles} × {params.cadReviewMinutesPerCycle}m): <strong className="text-white font-mono tabular-nums">{currencySymbol}{breakdown.cadReviewCost.toFixed(2)}</strong>
                        </span>
                      </div>
                      <div className="text-[#00c44b] font-mono font-semibold tabular-nums">
                        Total CAD Fee: {currencySymbol}{breakdown.cadTotalCost.toFixed(2)} (Billed once per model)
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded bg-[#232325] border border-[#3a3a3f] text-xs text-zinc-400 flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Client provided ready-to-slice 3D model (STL, 3MF, STEP). No 3D modeling fee is added.
                    </span>
                    <button
                      onClick={() => setParams({ ...params, enableCadService: true })}
                      className="text-xs text-[#00c44b] hover:text-white font-medium underline underline-offset-2 cursor-pointer"
                    >
                      Enable CAD Design Service
                    </button>
                  </div>
                )}
              </div>

              {/* Pillar 5: Slicing & Workshop Operator Labor */}
              <div className="p-4 sm:p-5 rounded-md border border-[#3f3f44] bg-[#2d2d30] space-y-4">
                <div className="flex flex-wrap justify-between items-center gap-2 border-b border-[#3f3f44] pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[#26b4b0]" />
                    <div>
                      <h3 className="text-sm font-semibold text-white">5. Slicing CAM & Workshop Operator Labor</h3>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Separated into fixed CAM toolpath slicing (once per job) and hands-on handling (per plate).
                      </p>
                    </div>
                  </div>
                  <div className="text-xs font-mono text-zinc-400 tabular-nums">
                    Slicing: <span className="text-white font-semibold">{params.slicingMins}m</span> | Hands-on:{' '}
                    <span className="text-white font-semibold">
                      {(params.setupMins + params.removalMins + params.postProcessingMins + (params.qaInspectionMins || 4) + (params.enablePackaging ? params.packagingMins : 0)) * params.quantity}m
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5">
                  <div className="p-2 rounded bg-[#232325] border border-[#26b4b0]/40">
                    <label className="block text-[11px] text-[#26b4b0] mb-1 font-medium">CAM Slicing (min)</label>
                    <input
                      type="number"
                      value={params.slicingMins}
                      onChange={(e) => setParams({ ...params, slicingMins: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-[#1e1e20] border border-[#45454a] rounded px-2 py-1.5 text-xs text-white font-mono focus:border-[#00ae42] focus:outline-hidden tabular-nums"
                    />
                    <span className="text-[9px] text-zinc-400 mt-0.5 block">Toolpath (once)</span>
                  </div>

                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Setup / Prep (min)</label>
                    <input
                      type="number"
                      value={params.setupMins}
                      onChange={(e) => setParams({ ...params, setupMins: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-[#1e1e20] border border-[#45454a] rounded px-2 py-1.5 text-xs text-white font-mono focus:border-[#00ae42] focus:outline-hidden tabular-nums"
                    />
                    <span className="text-[9px] text-zinc-500 mt-0.5 block">Bed prep/load</span>
                  </div>

                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Part Removal (min)</label>
                    <input
                      type="number"
                      value={params.removalMins}
                      onChange={(e) => setParams({ ...params, removalMins: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-[#1e1e20] border border-[#45454a] rounded px-2 py-1.5 text-xs text-white font-mono focus:border-[#00ae42] focus:outline-hidden tabular-nums"
                    />
                    <span className="text-[9px] text-zinc-500 mt-0.5 block">Detaching part</span>
                  </div>

                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Finishing (min)</label>
                    <input
                      type="number"
                      value={params.postProcessingMins}
                      onChange={(e) => setParams({ ...params, postProcessingMins: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-[#1e1e20] border border-[#45454a] rounded px-2 py-1.5 text-xs text-white font-mono focus:border-[#00ae42] focus:outline-hidden tabular-nums"
                    />
                    <span className="text-[9px] text-zinc-500 mt-0.5 block">Support cleanup</span>
                  </div>

                  <div className="p-2 rounded bg-[#232325] border border-[#00ae42]/40">
                    <label className="block text-[11px] text-[#00c44b] mb-1 font-medium">QA / Tolerance (min)</label>
                    <input
                      type="number"
                      value={params.qaInspectionMins}
                      onChange={(e) => setParams({ ...params, qaInspectionMins: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-[#1e1e20] border border-[#00ae42]/50 rounded px-2 py-1.5 text-xs text-white font-mono focus:border-[#00c44b] focus:outline-hidden tabular-nums"
                    />
                    <span className="text-[9px] text-[#00c44b] mt-0.5 block">Calipers & ISO check</span>
                  </div>

                  <div className={!params.enablePackaging ? 'opacity-50' : ''}>
                    <label className="block text-[11px] text-zinc-400 mb-1">
                      Packaging (min) {params.enablePackaging ? '' : '(Off)'}
                    </label>
                    <input
                      type="number"
                      disabled={!params.enablePackaging}
                      value={params.enablePackaging ? params.packagingMins : 0}
                      onChange={(e) => setParams({ ...params, packagingMins: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-[#1e1e20] border border-[#45454a] rounded px-2 py-1.5 text-xs text-white font-mono focus:border-[#00ae42] focus:outline-hidden disabled:bg-[#232325] disabled:text-zinc-500 tabular-nums"
                    />
                    <span className="text-[9px] text-zinc-500 mt-0.5 block">Boxing & label</span>
                  </div>

                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Operator Rate ({currencySymbol}/hr)</label>
                    <input
                      type="number"
                      step="10"
                      value={params.laborHourlyRate}
                      onChange={(e) => setParams({ ...params, laborHourlyRate: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-[#1e1e20] border border-[#45454a] rounded px-2 py-1.5 text-xs text-white font-mono focus:border-[#00ae42] focus:outline-hidden tabular-nums"
                    />
                    <span className="text-[9px] text-zinc-500 mt-0.5 block">Workshop wage</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between text-xs font-mono text-zinc-400 pt-1 tabular-nums">
                  <span>
                    CAM Slicing: <strong className="text-zinc-200">{currencySymbol}{breakdown.slicingCost.toFixed(2)}</strong> ({params.slicingMins}m)
                  </span>
                  <span>
                    Finishing: <strong className="text-zinc-200">{currencySymbol}{breakdown.postProcessingCost.toFixed(2)}</strong>
                  </span>
                  <span>
                    QA Inspection: <strong className="text-[#00c44b]">{currencySymbol}{breakdown.qaInspectionCost.toFixed(2)}</strong> ({breakdown.qaInspectionHours.toFixed(2)}h)
                  </span>
                  <span>
                    Packaging Labor: <strong className={params.enablePackaging ? 'text-zinc-200' : 'text-zinc-500'}>{params.enablePackaging ? `${currencySymbol}${breakdown.packagingLaborCost.toFixed(2)}` : `${currencySymbol}0.00 (Excluded)`}</strong>
                  </span>
                </div>
              </div>

              {/* Pillar 6: Scrap Risk Buffer */}
              <div className="p-4 sm:p-5 rounded-md border border-[#3f3f44] bg-[#2d2d30] space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-[#3f3f44] pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-xs bg-rose-500" />
                    <div>
                      <h3 className="text-sm font-semibold text-white">6. Scrap Risk Buffer</h3>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Failure & scrap loss protection against warped prints or bed detachment.
                      </p>
                    </div>
                  </div>
                  <div className="text-xs font-mono text-zinc-300 tabular-nums">
                    Buffer Allowance:{' '}
                    <span className="text-rose-400 font-semibold">
                      {currencySymbol}{breakdown.failureBufferCost.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Failure / Scrap Buffer (%)</label>
                  <input
                    type="number"
                    step="1"
                    value={params.failureRiskPercent}
                    onChange={(e) => setParams({ ...params, failureRiskPercent: parseFloat(e.target.value) || 0 })}
                    className="w-full sm:max-w-xs bg-[#1e1e20] border border-[#45454a] rounded px-3 py-2 text-sm text-white font-mono focus:border-[#00ae42] focus:outline-hidden tabular-nums"
                  />
                  <span className="text-[10px] text-zinc-500 mt-0.5 block">
                    Protects against warped prints & detachment (8-15% typical)
                  </span>
                </div>
              </div>

              {/* Pillar 7: Packaging & Overhead */}
              <div className="p-4 sm:p-5 rounded-md border border-[#3f3f44] bg-[#2d2d30] space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-[#3f3f44] pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[#f58220]" />
                    <div>
                      <h3 className="text-sm font-semibold text-white">7. Packaging & Overhead</h3>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Protective boxing, courier prep & workshop fixed overhead.
                      </p>
                    </div>
                  </div>

                  {/* Packaging Exclusion Toggle */}
                  <div className="flex items-center gap-2 bg-[#232325] px-3 py-1.5 rounded border border-[#3a3a3f]">
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={params.enablePackaging}
                        onChange={(e) => setParams({ ...params, enablePackaging: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-[#1e1e20] border border-[#45454a] peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-200 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#00ae42] peer-checked:border-[#00ae42]"></div>
                      <span className="ml-2.5 text-xs font-medium text-zinc-200">
                        {params.enablePackaging ? 'Include Packaging' : 'Exclude Packaging (Client Pickup)'}
                      </span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className={!params.enablePackaging ? 'opacity-60' : ''}>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs text-zinc-400">Packaging & Box ({currencySymbol}/plate)</label>
                      {!params.enablePackaging && (
                        <span className="text-[10px] font-mono text-[#f58220] font-medium">Excluded</span>
                      )}
                    </div>
                    <input
                      type="number"
                      step="2"
                      disabled={!params.enablePackaging}
                      value={params.enablePackaging ? params.packagingCostPerUnit : 0}
                      onChange={(e) => setParams({ ...params, packagingCostPerUnit: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-[#1e1e20] border border-[#45454a] rounded px-3 py-2 text-sm text-white font-mono focus:border-[#00ae42] focus:outline-hidden disabled:bg-[#232325] disabled:text-zinc-500 tabular-nums"
                    />
                    <span className="text-[10px] text-zinc-500 mt-0.5 block">
                      {params.enablePackaging
                        ? 'Protective shipping box, cushioning & pouch'
                        : 'Customer will collect unboxed in person'}
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Workshop Overhead ({currencySymbol}/print)</label>
                    <input
                      type="number"
                      step="2"
                      value={params.workshopOverheadPerPrint}
                      onChange={(e) =>
                        setParams({ ...params, workshopOverheadPerPrint: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full bg-[#1e1e20] border border-[#45454a] rounded px-3 py-2 text-sm text-white font-mono focus:border-[#00ae42] focus:outline-hidden tabular-nums"
                    />
                    <span className="text-[10px] text-zinc-500 mt-0.5 block">Shop space & backup power allocation</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right 4 Columns: Master Financial Card & Commercial Margin */}
            <div className="lg:col-span-4 space-y-4 sticky top-16">
              {/* Grand Total Quote Card */}
              <div className="p-5 rounded-md border border-[#00ae42]/50 bg-[#2d2d30] space-y-5">
                <div>
                  <span className="text-[11px] font-mono uppercase tracking-wider text-[#00c44b] font-semibold">
                    Total Commercial Price (excl. VAT)
                  </span>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="text-3xl font-extrabold text-white font-mono tabular-nums">
                      {currencySymbol}{breakdown.finalTotalPrice.toFixed(2)}
                    </span>
                    {totalBatchUnits > 1 && (
                      <span className="text-xs text-zinc-400 font-mono tabular-nums text-right">
                        {currencySymbol}{(breakdown.finalTotalPrice / totalBatchUnits).toFixed(2)} / plate
                        <span className="text-zinc-500 block text-[10px]">({totalBatchUnits} plates total)</span>
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-zinc-400 flex justify-between">
                    <span>Base Production Cost:</span>
                    <span className="font-mono text-zinc-200 font-semibold tabular-nums">
                      {currencySymbol}{breakdown.baseTotalCost.toFixed(2)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-zinc-400 flex justify-between">
                    <span>Net Margin / Profit:</span>
                    <span className="font-mono text-[#f58220] font-semibold tabular-nums">
                      +{currencySymbol}{breakdown.profitAmount.toFixed(2)} ({params.markupPercent}%)
                    </span>
                  </div>
                </div>

                {/* Batch Size & Margin Controls */}
                <div className="pt-4 border-t border-[#3f3f44] space-y-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <label className="text-xs text-zinc-300 block">Job Multiplier</label>
                      <span className="text-[10px] text-zinc-500">Repeats all active files</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setParams({ ...params, quantity: Math.max(1, params.quantity - 1) })}
                        className="w-6 h-6 rounded bg-[#36363a] border border-[#4e4e54] text-zinc-200 hover:bg-[#45454a] flex items-center justify-center text-xs cursor-pointer"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="1"
                        value={params.quantity}
                        onChange={(e) => setParams({ ...params, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                        className="w-14 text-center bg-[#1e1e20] border border-[#45454a] rounded py-0.5 text-xs font-mono text-white focus:border-[#00ae42] focus:outline-hidden tabular-nums"
                      />
                      <button
                        onClick={() => setParams({ ...params, quantity: params.quantity + 1 })}
                        className="w-6 h-6 rounded bg-[#36363a] border border-[#4e4e54] text-zinc-200 hover:bg-[#45454a] flex items-center justify-center text-xs cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-zinc-300 mb-1.5">
                      <span>Profit Markup Margin</span>
                      <span className="font-mono text-[#00c44b] font-semibold tabular-nums">{params.markupPercent}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={150}
                      step={5}
                      value={params.markupPercent}
                      onChange={(e) => setParams({ ...params, markupPercent: parseInt(e.target.value, 10) })}
                      className="w-full cursor-pointer"
                    />
                  </div>
                </div>

                {/* Itemized Quick Subtotals */}
                <div className="pt-4 border-t border-[#3f3f44] space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#00ae42]" />
                      Material ({filaments.length} spool{filaments.length > 1 ? 's' : ''})
                    </span>
                    <span className="text-zinc-200 tabular-nums">{currencySymbol}{breakdown.totalMaterialCost.toFixed(2)}</span>
                  </div>
                  {breakdown.filamentItemCosts && breakdown.filamentItemCosts.length > 1 && (
                    <div className="space-y-1 pl-3 text-[11px]">
                      {breakdown.filamentItemCosts.map((m) => (
                        <div key={m.id} className="flex justify-between text-zinc-400">
                          <span className="flex items-center gap-1.5 truncate">
                            {m.colorHex && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: m.colorHex }} />}
                            <span className="truncate">{m.name}</span>
                          </span>
                          <span className="text-zinc-300 tabular-nums shrink-0">{currencySymbol}{m.cost.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex justify-between text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#f58220]" />
                      Power ({(effectiveParams.printHours * Math.max(1, params.quantity)).toFixed(1)}h)
                    </span>
                    <span className="text-zinc-200 tabular-nums">{currencySymbol}{breakdown.electricityCost.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                      Depreciation
                    </span>
                    <span className="text-zinc-200 tabular-nums">{currencySymbol}{breakdown.depreciationCost.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      Maintenance & Wear
                    </span>
                    <span className="text-zinc-200 tabular-nums">
                      {currencySymbol}{(breakdown.maintenanceCost + breakdown.prepConsumablesCost).toFixed(2)}
                    </span>
                  </div>

                  {breakdown.hasCadService && (
                    <div className="flex justify-between text-[#f58220]">
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#f58220]" />
                        CAD Design & Review
                      </span>
                      <span className="text-amber-200 tabular-nums">
                        {currencySymbol}{breakdown.cadTotalCost.toFixed(2)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#26b4b0]" />
                      CAM Slicing Toolpath
                    </span>
                    <span className="text-zinc-200 tabular-nums">
                      {currencySymbol}{breakdown.slicingCost.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex justify-between text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#26b4b0]" />
                      Finishing Labor ({breakdown.postProcessingHours.toFixed(1)}h)
                    </span>
                    <span className="text-zinc-200 tabular-nums">
                      {currencySymbol}{(breakdown.workshopLaborCost - breakdown.qaInspectionCost - breakdown.packagingLaborCost).toFixed(2)}
                    </span>
                  </div>

                  <div className="flex justify-between text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#00c44b]" />
                      QA & Inspection ({breakdown.qaInspectionHours.toFixed(1)}h)
                    </span>
                    <span className="text-[#00c44b] tabular-nums">
                      {currencySymbol}{breakdown.qaInspectionCost.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex justify-between text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                      Failure Buffer ({params.failureRiskPercent}%)
                    </span>
                    <span className="text-zinc-200 tabular-nums">{currencySymbol}{breakdown.failureBufferCost.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
                      Protective Packaging
                    </span>
                    {params.enablePackaging ? (
                      <span className="text-zinc-200 tabular-nums">
                        {currencySymbol}{breakdown.totalPackagingCost.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-zinc-500 font-mono text-[11px]">
                        Excluded ({currencySymbol}0.00)
                      </span>
                    )}
                  </div>

                  <div className="flex justify-between text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                      Workshop Overhead
                    </span>
                    <span className="text-zinc-200 tabular-nums">
                      {currencySymbol}{breakdown.workshopOverheadCost.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    onClick={() => {
                      setIsAutoPrintQuote(false);
                      setIsQuoteModalOpen(true);
                    }}
                    className="flex-1 py-2 px-3 bg-[#36363a] hover:bg-[#424247] text-zinc-100 font-semibold text-xs rounded transition-colors flex items-center justify-center gap-1.5 border border-[#4e4e54] cursor-pointer active:scale-95"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-[#26b4b0]" />
                    <span>View Quote</span>
                  </button>

                  <button
                    onClick={() => {
                      setIsAutoPrintQuote(true);
                      setIsQuoteModalOpen(true);
                    }}
                    className="flex-1 py-2 px-3 bg-[#00ae42] hover:bg-[#00c44b] text-white font-bold text-xs rounded transition-colors flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
                    title="Export structured quotation as PDF document using window.print()"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Export as PDF</span>
                  </button>
                </div>
              </div>

              {/* Proportional Expense Distribution */}
              <div className="p-4 sm:p-5 rounded-md border border-[#3f3f44] bg-[#2d2d30]">
                <CostBreakdownChart
                  breakdown={breakdown}
                  quantity={params.quantity}
                  currencySymbol={currencySymbol}
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Quote Generator Modal */}
      <QuoteModal
        isOpen={isQuoteModalOpen}
        onClose={() => {
          setIsQuoteModalOpen(false);
          setIsAutoPrintQuote(false);
        }}
        params={effectiveParams}
        breakdown={breakdown}
        metadata={metadata}
        files={files}
        currencySymbol={currencySymbol}
        onTogglePackaging={(enabled) => setParams((prev) => ({ ...prev, enablePackaging: enabled }))}
        clientName={clientName}
        projectName={projectName}
        onClientNameChange={(name) => {
          userModifiedRef.current = true;
          setClientName(name);
          safeSetItem('layercost_active_client', name);
        }}
        onProjectNameChange={(name) => {
          userModifiedRef.current = true;
          setProjectName(name);
          safeSetItem('layercost_active_project', name);
        }}
        autoPrint={isAutoPrintQuote}
      />

      {/* New Quote Reset & Client Prompt Modal */}
      <NewQuoteModal
        isOpen={isNewQuoteModalOpen}
        onClose={() => setIsNewQuoteModalOpen(false)}
        onConfirm={handleCreateNewQuote}
        currentClientName={clientName}
        currentProjectName={projectName}
        currencySymbol={currencySymbol}
      />

      {/* OrcaSlicer Plugin Exporter & Bridge Modal */}
      <OrcaPluginModal
        isOpen={isOrcaPluginModalOpen}
        onClose={() => setIsOrcaPluginModalOpen(false)}
      />

      {/* Quiet Footer */}
      <footer className="mt-auto border-t border-[#3f3f44] bg-[#1e1e20] py-3.5 px-6 text-center text-xs text-zinc-500">
        <span>LayerCost 3D Print Cost Estimator · Commercial Additive Manufacturing Economics</span>
      </footer>
    </div>
  );
}
