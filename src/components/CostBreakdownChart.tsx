import React from 'react';
import { CostBreakdown } from '../types/calculator';

interface CostBreakdownChartProps {
  breakdown: CostBreakdown;
  quantity: number;
  currencySymbol?: string;
}

export const CostBreakdownChart: React.FC<CostBreakdownChartProps> = ({
  breakdown,
  quantity,
  currencySymbol = '$',
}) => {
  const p = breakdown.costPercentages;

  const categories = [
    { label: 'Material', cost: breakdown.totalMaterialCost, pct: p.material, color: 'bg-[#00ae42]', barCol: '#00ae42' },
    ...(breakdown.hasCadService ? [{ label: 'CAD & Client Review', cost: breakdown.cadTotalCost, pct: p.cad, color: 'bg-[#f58220]', barCol: '#f58220' }] : []),
    { label: 'Slicing & Prep', cost: breakdown.slicingCost + (breakdown.workshopLaborCost - breakdown.qaInspectionCost - breakdown.packagingLaborCost), pct: p.labor, color: 'bg-[#26b4b0]', barCol: '#26b4b0' },
    { label: 'QA & Inspection', cost: breakdown.qaInspectionCost, pct: p.qa, color: 'bg-[#00c44b]', barCol: '#00c44b' },
    { label: 'Depreciation', cost: breakdown.depreciationCost, pct: p.depreciation, color: 'bg-zinc-400', barCol: '#a1a1aa' },
    { label: 'Maintenance & Wear', cost: breakdown.maintenanceCost + breakdown.prepConsumablesCost, pct: p.maintenance, color: 'bg-amber-500', barCol: '#f59e0b' },
    { label: 'Electricity & Power', cost: breakdown.electricityCost, pct: p.electricity, color: 'bg-[#f58220]', barCol: '#f58220' },
    { label: 'Failure Buffer', cost: breakdown.failureBufferCost, pct: p.buffer, color: 'bg-rose-500', barCol: '#f43f5e' },
    ...(breakdown.enablePackaging && breakdown.totalPackagingCost > 0 ? [{ label: 'Packaging', cost: breakdown.totalPackagingCost, pct: p.packaging, color: 'bg-amber-600', barCol: '#d97706' }] : []),
    { label: 'Workshop Overhead', cost: breakdown.workshopOverheadCost, pct: p.overhead, color: 'bg-zinc-500', barCol: '#71717a' },
  ].filter((c) => c.pct > 0 || c.cost > 0);

  return (
    <div className="space-y-4">
      {/* Proportional Cost Distribution Bar */}
      <div>
        <div className="flex justify-between items-center text-xs text-zinc-400 mb-2">
          <span>Expense Distribution (% of Base Cost)</span>
          <span className="font-mono text-zinc-300 tabular-nums">Base Cost: {currencySymbol}{breakdown.baseTotalCost.toFixed(2)}</span>
        </div>
        <div className="w-full h-3.5 rounded overflow-hidden flex bg-[#1e1e20] border border-[#3f3f44]">
          {categories.map((c, idx) => (
            <div
              key={idx}
              style={{ width: `${Math.max(1.5, c.pct)}%`, backgroundColor: c.barCol }}
              className="h-full transition-all duration-300 relative group"
              title={`${c.label}: ${currencySymbol}${c.cost.toFixed(2)} (${c.pct}%)`}
            />
          ))}
        </div>
      </div>

      {/* Legend & Metric Matrix */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 pt-2">
        {categories.map((c, idx) => (
          <div
            key={idx}
            className="p-2.5 rounded border border-[#3a3a3f] bg-[#232325] hover:bg-[#2a2a2e] transition-colors"
          >
            <div className="flex items-center gap-1.5 text-xs text-zinc-400">
              <span className={`w-2 h-2 rounded-xs ${c.color}`} />
              <span className="truncate">{c.label}</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="font-mono text-base font-semibold text-white tabular-nums">
                {currencySymbol}{c.cost.toFixed(2)}
              </span>
              <span className="font-mono text-xs text-zinc-400 tabular-nums">
                {c.pct}%
              </span>
            </div>
            {quantity > 1 && (
              <div className="text-[11px] text-zinc-500 font-mono mt-0.5 tabular-nums">
                {currencySymbol}{(c.cost / quantity).toFixed(2)} / unit
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
