import React from 'react';
import { CostParameters } from '../types/calculator';
import { calculatePrintCosts } from '../utils/costEngine';

interface BatchCalculatorProps {
  baseParams: CostParameters;
  currentQuantity: number;
  onSelectQuantity: (qty: number) => void;
  currencySymbol?: string;
}

export const BatchCalculator: React.FC<BatchCalculatorProps> = ({
  baseParams,
  currentQuantity,
  onSelectQuantity,
  currencySymbol = 'R',
}) => {
  const tiers = [1, 5, 10, 25, 50, 100];

  const batchResults = tiers.map((qty) => {
    const res = calculatePrintCosts({ ...baseParams, quantity: qty });
    const singleRes = calculatePrintCosts({ ...baseParams, quantity: 1 });
    const savingsPercent =
      singleRes.finalUnitPrice > 0
        ? Math.round(((singleRes.finalUnitPrice - res.finalUnitPrice) / singleRes.finalUnitPrice) * 100)
        : 0;

    return {
      qty,
      unitCost: res.baseUnitCost,
      unitPrice: res.finalUnitPrice,
      totalPrice: res.finalTotalPrice,
      totalHours: (baseParams.printHours * qty).toFixed(1),
      savingsPercent,
    };
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse text-xs">
        <thead>
          <tr className="border-b border-[#3f3f44] text-zinc-400 bg-[#232325]">
            <th className="py-2.5 px-3 font-medium">Quantity</th>
            <th className="py-2.5 px-3 font-medium">Print Time</th>
            <th className="py-2.5 px-3 font-medium">Unit Cost (Base)</th>
            <th className="py-2.5 px-3 font-medium">Unit Quote (With Markup)</th>
            <th className="py-2.5 px-3 font-medium">Total Batch Price</th>
            <th className="py-2.5 px-3 font-medium">Volume Savings</th>
            <th className="py-2.5 px-3 text-right font-medium">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#3a3a3f] font-mono">
          {batchResults.map((tier) => {
            const isSelected = tier.qty === currentQuantity;
            return (
              <tr
                key={tier.qty}
                className={`transition-colors ${
                  isSelected ? 'bg-[#00ae42]/10 text-zinc-100' : 'hover:bg-[#36363a]/60 text-zinc-300'
                }`}
              >
                <td className="py-3 px-3 font-semibold flex items-center gap-1.5">
                  <span className="text-white tabular-nums">{tier.qty} {tier.qty === 1 ? 'part' : 'parts'}</span>
                  {isSelected && (
                    <span className="text-[10px] text-[#00c44b] font-sans font-medium px-1.5 py-0.2 bg-[#00ae42]/15 rounded border border-[#00ae42]/40">
                      Active
                    </span>
                  )}
                </td>
                <td className="py-3 px-3 text-zinc-400 tabular-nums">{tier.totalHours} hrs</td>
                <td className="py-3 px-3 tabular-nums text-zinc-400">{currencySymbol}{tier.unitCost.toFixed(2)}</td>
                <td className="py-3 px-3 font-bold tabular-nums text-[#26b4b0]">{currencySymbol}{tier.unitPrice.toFixed(2)}</td>
                <td className="py-3 px-3 tabular-nums text-white font-semibold">{currencySymbol}{tier.totalPrice.toFixed(2)}</td>
                <td className="py-3 px-3 tabular-nums">
                  {tier.savingsPercent > 0 ? (
                    <span className="text-[#f58220] font-medium">-{tier.savingsPercent}% / part</span>
                  ) : (
                    <span className="text-zinc-500">Baseline</span>
                  )}
                </td>
                <td className="py-3 px-3 text-right">
                  <button
                    onClick={() => onSelectQuantity(tier.qty)}
                    className={`px-2.5 py-1 text-[11px] font-sans font-medium rounded transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#00ae42] hover:bg-[#00c44b] text-white font-semibold'
                        : 'bg-[#36363a] text-zinc-300 hover:bg-[#45454a] hover:text-white border border-[#4e4e54]'
                    }`}
                  >
                    Apply Qty
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
