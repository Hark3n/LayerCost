import { CostParameters, CostBreakdown } from '../types/calculator';

export function calculatePrintCosts(params: CostParameters): CostBreakdown {
  const qty = Math.max(1, params.quantity || 1);

  // 1. Material Costs (Supports multiple filaments / spools or single fallback)
  let totalMaterialCost = 0;
  let filamentCostTotal = 0;
  let purgeCostTotal = 0;
  const filamentItemCosts: import('../types/calculator').FilamentCostItem[] = [];

  if (params.filaments && params.filaments.length > 0) {
    for (const fil of params.filaments) {
      const spoolWeight = Math.max(1, fil.spoolWeightGrams || 1000);
      const grams = Math.max(0, fil.gramsUsed || 0);
      const purge = Math.max(0, fil.purgeGrams || 0);
      const price = Math.max(0, fil.spoolPrice || 0);

      const fCost = (grams / spoolWeight) * price * qty;
      const pCost = (purge / spoolWeight) * price * qty;
      const slotTotal = fCost + pCost;

      filamentCostTotal += fCost;
      purgeCostTotal += pCost;
      totalMaterialCost += slotTotal;

      filamentItemCosts.push({
        id: fil.id,
        name: fil.name || 'Filament',
        type: fil.type || 'PLA',
        gramsUsed: grams * qty,
        purgeGrams: purge * qty,
        totalGrams: (grams + purge) * qty,
        cost: slotTotal,
        spoolPrice: price,
        spoolWeightGrams: spoolWeight,
        colorHex: fil.colorHex,
      });
    }
  } else {
    // Fallback single material
    const spoolWeight = Math.max(1, params.spoolWeightGrams || 1000);
    const filamentCostSingle = ((params.filamentGrams || 0) / spoolWeight) * (params.spoolPrice || 0);
    const purgeCostSingle = ((params.extraPurgeGrams || 0) / spoolWeight) * (params.spoolPrice || 0);
    filamentCostTotal = filamentCostSingle * qty;
    purgeCostTotal = purgeCostSingle * qty;
    totalMaterialCost = filamentCostTotal + purgeCostTotal;

    filamentItemCosts.push({
      id: 'default',
      name: 'Primary Filament',
      type: 'PLA',
      gramsUsed: (params.filamentGrams || 0) * qty,
      purgeGrams: (params.extraPurgeGrams || 0) * qty,
      totalGrams: ((params.filamentGrams || 0) + (params.extraPurgeGrams || 0)) * qty,
      cost: totalMaterialCost,
      spoolPrice: params.spoolPrice || 0,
      spoolWeightGrams: spoolWeight,
      colorHex: '#f97316',
    });
  }

  // 2. Electricity Costs
  const printHours = (params.printHours || 0) * qty;
  const runningKwh = ((params.printerWatts || 0) / 1000.0) * printHours;
  // Preheat surge occurs per print run (if 1 run per batch, or 1 per piece depending on setup)
  const preheatKwhTotal = (params.preheatKwh || 0.08) * qty;
  const totalKwh = runningKwh + preheatKwhTotal;
  const electricityCost = totalKwh * (params.kwhRate || 0);

  // 3. Machine Depreciation
  const netDepreciableValue = Math.max(0, (params.printerCost || 0) - (params.salvageValue || 0));
  const lifespan = Math.max(1, params.printerLifespanHours || 3000);
  const hourlyDepreciation = netDepreciableValue / lifespan;
  const depreciationCost = hourlyDepreciation * printHours;

  // 4. Maintenance & Consumables
  const machineWearCost = (params.maintenanceHourlyRate || 0) * printHours;
  const prepConsumablesCost = (params.prepConsumablesCost || 0) * qty;
  const maintenanceCost = machineWearCost;

  // 5. CAD Modeling & Client Review (Custom Engineering - Billed Once Per Project)
  const hasCadService = !!params.enableCadService;
  const cadModelingHours = hasCadService ? Math.max(0, params.cadModelingHours || 0) : 0;
  const cadReviewCycles = hasCadService ? Math.max(0, params.cadReviewCycles || 0) : 0;
  const cadReviewMinsPerCycle = hasCadService ? Math.max(0, params.cadReviewMinutesPerCycle || 0) : 0;
  const cadReviewHours = (cadReviewCycles * cadReviewMinsPerCycle) / 60.0;
  const cadTotalHours = cadModelingHours + cadReviewHours;
  const cadRate = params.cadHourlyRate || 450;
  const cadDesignCost = cadModelingHours * cadRate;
  const cadReviewCost = cadReviewHours * cadRate;
  const cadTotalCost = cadDesignCost + cadReviewCost;

  // 6. Slicing, QA, Post-Processing & Workshop Labor
  const slicingHours = Math.max(0, params.slicingMins || 0) / 60.0;
  const slicingCost = slicingHours * (params.laborHourlyRate || 0);

  // Check packaging toggle
  const enablePackaging = params.enablePackaging !== false;

  // Labor breakdown per unit
  const setupMins = Math.max(0, params.setupMins || 0);
  const removalMins = Math.max(0, params.removalMins || 0);
  const postProcessingMins = Math.max(0, params.postProcessingMins || 0);
  const qaInspectionMins = Math.max(0, params.qaInspectionMins !== undefined ? params.qaInspectionMins : 4);
  const packagingMins = enablePackaging ? Math.max(0, params.packagingMins || 0) : 0;

  const rate = params.laborHourlyRate || 0;

  // Dedicated QA inspection labor
  const qaInspectionHours = (qaInspectionMins * qty) / 60.0;
  const qaInspectionCost = qaInspectionHours * rate;

  // Dedicated post-processing & support removal labor
  const postProcessingHours = (postProcessingMins * qty) / 60.0;
  const postProcessingCost = postProcessingHours * rate;

  // Dedicated packaging labor (0 if packaging is excluded)
  const packagingLaborHours = (packagingMins * qty) / 60.0;
  const packagingLaborCost = packagingLaborHours * rate;

  // Setup and removal labor
  const setupRemovalHours = ((setupMins + removalMins) * qty) / 60.0;
  const setupRemovalCost = setupRemovalHours * rate;

  // Total workshop labor (setup + removal + finishing + QA + packaging labor)
  const workshopLaborHours = setupRemovalHours + postProcessingHours + qaInspectionHours + packagingLaborHours;
  const workshopLaborCost = workshopLaborHours * rate;

  const totalLaborHours = cadTotalHours + slicingHours + workshopLaborHours;
  const totalLaborCost = cadTotalCost + slicingCost + workshopLaborCost;

  // 7. Packaging & Workshop Overhead
  // Packaging material cost is 0 if packaging is excluded
  const packagingCost = enablePackaging ? (params.packagingCostPerUnit || 0) * qty : 0;
  const totalPackagingCost = packagingCost + packagingLaborCost;
  const workshopOverheadCost = (params.workshopOverheadPerPrint || 0) * qty;

  // 8. Scrap / Print Failure Risk Buffer
  // The buffer covers the risk of spoiled material, power, and machine wear when a print fails
  const failureRiskRatio = (params.failureRiskPercent || 0) / 100.0;
  const riskBearingCosts = totalMaterialCost + electricityCost + depreciationCost + machineWearCost;
  const failureBufferCost = riskBearingCosts * failureRiskRatio;

  // 9. Base Direct Cost & Base Total
  const subtotalDirectCost =
    totalMaterialCost +
    electricityCost +
    depreciationCost +
    maintenanceCost +
    prepConsumablesCost +
    totalLaborCost +
    packagingCost +
    workshopOverheadCost;

  const baseTotalCost = subtotalDirectCost + failureBufferCost;
  const baseUnitCost = baseTotalCost / qty;

  // 10. Profit & Commercial Markup
  const markupRatio = (params.markupPercent || 0) / 100.0;
  const profitAmount = baseTotalCost * markupRatio;
  const finalTotalPrice = baseTotalCost + profitAmount;
  const finalUnitPrice = finalTotalPrice / qty;

  // Percentages for chart visualization
  const safeTotal = baseTotalCost > 0 ? baseTotalCost : 1;
  const costPercentages = {
    material: Math.round((totalMaterialCost / safeTotal) * 1000) / 10,
    cad: Math.round((cadTotalCost / safeTotal) * 1000) / 10,
    labor: Math.round(((slicingCost + setupRemovalCost + postProcessingCost) / safeTotal) * 1000) / 10,
    qa: Math.round((qaInspectionCost / safeTotal) * 1000) / 10,
    packaging: Math.round((totalPackagingCost / safeTotal) * 1000) / 10,
    electricity: Math.round((electricityCost / safeTotal) * 1000) / 10,
    depreciation: Math.round((depreciationCost / safeTotal) * 1000) / 10,
    maintenance: Math.round(((maintenanceCost + prepConsumablesCost) / safeTotal) * 1000) / 10,
    buffer: Math.round((failureBufferCost / safeTotal) * 1000) / 10,
    overhead: Math.round((workshopOverheadCost / safeTotal) * 1000) / 10,
  };

  return {
    filamentCost: filamentCostTotal,
    purgeCost: purgeCostTotal,
    totalMaterialCost,
    filamentItemCosts,
    electricityCost,
    depreciationCost,
    maintenanceCost,
    prepConsumablesCost,
    totalMachineCost: depreciationCost + maintenanceCost + prepConsumablesCost + electricityCost,

    // CAD
    hasCadService,
    cadModelingHours,
    cadReviewHours,
    cadTotalHours,
    cadDesignCost,
    cadReviewCost,
    cadTotalCost,

    // Slicing & Workshop
    slicingHours,
    slicingCost,
    workshopLaborHours,
    workshopLaborCost,

    // Distinct QA & Finishing & Packaging Labor
    qaInspectionHours,
    qaInspectionCost,
    postProcessingHours,
    postProcessingCost,
    packagingLaborHours,
    packagingLaborCost,

    totalLaborHours,
    totalLaborCost,
    laborHours: totalLaborHours,
    laborCost: totalLaborCost,

    // Packaging & Overhead
    enablePackaging,
    packagingCost,
    totalPackagingCost,
    workshopOverheadCost,
    subtotalDirectCost,
    failureBufferCost,
    baseTotalCost,
    baseUnitCost,
    profitAmount,
    finalTotalPrice,
    finalUnitPrice,
    costPercentages,
  };
}
