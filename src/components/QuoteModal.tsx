import React, { useState, useEffect } from 'react';
import { CostBreakdown, CostParameters, GcodeMetadata, GcodeFileItem } from '../types/calculator';
import { isRunningInOrcaSlicer, saveInvoiceViaOrca } from '../utils/orcaBridge';
import {
  Printer,
  Copy,
  Check,
  X,
  FileText,
  ShieldCheck,
  Download,
  Image as ImageIcon,
  Trash2,
  Box,
  FileDown,
  CreditCard,
  Building2,
  Sparkles,
  Edit3,
} from 'lucide-react';

interface QuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  params: CostParameters;
  breakdown: CostBreakdown;
  metadata: GcodeMetadata | null;
  files?: GcodeFileItem[];
  currencySymbol?: string;
  onTogglePackaging?: (enabled: boolean) => void;
  clientName?: string;
  projectName?: string;
  onClientNameChange?: (name: string) => void;
  onProjectNameChange?: (name: string) => void;
  autoPrint?: boolean;
}

export const QuoteModal: React.FC<QuoteModalProps> = ({
  isOpen,
  onClose,
  params,
  breakdown,
  metadata,
  files,
  currencySymbol = '$',
  onTogglePackaging,
  clientName: initialClientName = '',
  projectName: initialProjectName = '',
  onClientNameChange,
  onProjectNameChange,
  autoPrint = false,
}) => {
  const activeFiles = files && files.length > 0 ? files.filter((f) => f.enabled) : [];
  const totalBatchUnits = activeFiles.length > 0
    ? activeFiles.reduce((acc, f) => acc + f.quantity, 0)
    : params.quantity;

  const [businessName, setBusinessName] = useState(() => {
    return localStorage.getItem('layercost_business_name') || 'Apex Additive Solutions';
  });
  const [vatNumber, setVatNumber] = useState(() => {
    return localStorage.getItem('layercost_vat_number') || 'TAX-4890281942';
  });
  const [companyLogo, setCompanyLogo] = useState<string | null>(() => {
    return localStorage.getItem('layercost_company_logo') || null;
  });
  const [bankName, setBankName] = useState(() => {
    return localStorage.getItem('layercost_bank_name') || 'Commercial Business Bank';
  });
  const [accountNumber, setAccountNumber] = useState(() => {
    return localStorage.getItem('layercost_account_number') || '6289 4028 194';
  });
  const [accountType, setAccountType] = useState(() => {
    return localStorage.getItem('layercost_account_type') || 'Business Checking Account';
  });
  const [branchCode, setBranchCode] = useState(() => {
    return localStorage.getItem('layercost_branch_code') || '250655 / SWIFT';
  });
  const [isEditingBankDetails, setIsEditingBankDetails] = useState<boolean>(false);
  const [clientName, setClientName] = useState(initialClientName || 'Horizon Engineering & Product Design');
  const [projectName, setProjectName] = useState(() => {
    if (initialProjectName) return initialProjectName;
    if (activeFiles.length > 1) {
      return `Multi-Part Manufacturing Batch (${activeFiles.length} files, ${totalBatchUnits} parts)`;
    }
    return metadata?.fileName ? metadata.fileName.replace(/\.gcode$/i, '') : 'Rapid Prototype Component';
  });

  // Keep clientName & projectName in sync when props change
  React.useEffect(() => {
    if (initialClientName) {
      setClientName(initialClientName);
    }
  }, [initialClientName]);

  React.useEffect(() => {
    if (initialProjectName) {
      setProjectName(initialProjectName);
    }
  }, [initialProjectName]);

  const handleClientNameChange = (val: string) => {
    setClientName(val);
    onClientNameChange?.(val);
  };

  const handleProjectNameChange = (val: string) => {
    setProjectName(val);
    onProjectNameChange?.(val);
  };
  const [taxRate, setTaxRate] = useState<number>(15.0); // Standard VAT / Sales Tax (%)
  const [isClientView, setIsClientView] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [notes, setNotes] = useState(
    'Manufactured to industrial FDM specification. Inspected for dimensional tolerance conforming to ISO/ASTM 52900 standard. Worldwide tracked insured courier dispatch (2-3 business days).'
  );

  const [quoteNumber] = useState(() => `QT-${Math.floor(100000 + Math.random() * 900000)}`);
  const [downloadSuccess, setDownloadSuccess] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);

  /**
   * Export the generated quote summary as a structured, professional PDF document
   * using the window.print() browser API with optimized filename and print styling.
   */
  const exportQuoteAsPdf = () => {
    setIsExportingPdf(true);
    // Ensure customer-facing Client View is active for clean presentation
    setIsClientView(true);

    // Set document title so the browser print dialog defaults the saved PDF filename cleanly
    const originalTitle = document.title;
    const cleanClient = (clientName || 'Client').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanProject = (projectName || 'Quote').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const pdfFilename = `Quotation_${quoteNumber}_${cleanClient}_${cleanProject}`;
    document.title = pdfFilename;

    // Trigger window.print() after a brief tick to allow React render to complete
    setTimeout(() => {
      try {
        window.print();
      } catch (err) {
        console.warn('Native window.print() execution:', err);
      } finally {
        setTimeout(() => {
          document.title = originalTitle;
          setIsExportingPdf(false);
        }, 800);
      }
    }, 120);
  };

  // Keyboard shortcut Ctrl+P / Cmd+P while modal is active
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        exportQuoteAsPdf();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, quoteNumber, clientName, projectName]);

  // Handle autoPrint trigger if launched from Quick Export PDF
  useEffect(() => {
    if (isOpen && autoPrint) {
      exportQuoteAsPdf();
    }
  }, [isOpen, autoPrint]);

  // Logo upload handler
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('Please choose an image under 2MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        if (base64) {
          setCompanyLogo(base64);
          try {
            localStorage.setItem('layercost_company_logo', base64);
          } catch {
            // Storage quota fallback
          }
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveLogo = () => {
    setCompanyLogo(null);
    localStorage.removeItem('layercost_company_logo');
  };

  const handleBusinessNameChange = (val: string) => {
    setBusinessName(val);
    localStorage.setItem('layercost_business_name', val);
  };

  const handleVatNumberChange = (val: string) => {
    setVatNumber(val);
    localStorage.setItem('layercost_vat_number', val);
  };

  const handleBankNameChange = (val: string) => {
    setBankName(val);
    localStorage.setItem('layercost_bank_name', val);
  };

  const handleAccountNumberChange = (val: string) => {
    setAccountNumber(val);
    localStorage.setItem('layercost_account_number', val);
  };

  const handleAccountTypeChange = (val: string) => {
    setAccountType(val);
    localStorage.setItem('layercost_account_type', val);
  };

  const handleBranchCodeChange = (val: string) => {
    setBranchCode(val);
    localStorage.setItem('layercost_branch_code', val);
  };

  const currentDate = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const validUntilDate = new Date(Date.now() + 14 * 86400000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const subtotal = breakdown.finalTotalPrice;
  const taxAmount = subtotal * (taxRate / 100.0);
  const grandTotal = subtotal + taxAmount;

  const handleCopySummary = () => {
    const cadText = breakdown.hasCadService
      ? `
CAD 3D Modeling: ${params.cadModelingHours}h @ ${currencySymbol}${params.cadHourlyRate}/hr = ${currencySymbol}${breakdown.cadDesignCost.toFixed(2)}
Client Review Sessions: ${params.cadReviewCycles} round(s) (${params.cadReviewMinutesPerCycle}m each) = ${currencySymbol}${breakdown.cadReviewCost.toFixed(2)}
`
      : '';

    const filesText = activeFiles.length > 0
      ? `Files (${activeFiles.length} files, ${totalBatchUnits} units total):\n` +
        activeFiles.map((f) => `  - ${f.fileName} (Qty: ${f.quantity}, ${f.metadata.printTimeFormatted}, ${f.metadata.filamentGrams}g)`).join('\n') + '\n'
      : '';

    const materialsText = breakdown.filamentItemCosts && breakdown.filamentItemCosts.length > 0
      ? `Materials (${breakdown.filamentItemCosts.length} spool${breakdown.filamentItemCosts.length > 1 ? 's' : ''}):\n` +
        breakdown.filamentItemCosts.map((m) => `  - ${m.name} (${m.type}): ${m.totalGrams.toFixed(1)}g total = ${currencySymbol}${m.cost.toFixed(2)}`).join('\n') + '\n'
      : `Material: ${metadata?.filamentType || 'Engineering Thermoplastic'}\n`;

    const qaText = `Quality Assurance: Dimensional verification (${params.qaInspectionMins || 4}m/unit, ISO/ASTM 52900) = ${currencySymbol}${breakdown.qaInspectionCost.toFixed(2)}\n`;
    const packagingText = breakdown.enablePackaging
      ? `Packaging: Protective box & cushioning = ${currencySymbol}${breakdown.totalPackagingCost.toFixed(2)} (Tracked courier spec)\n`
      : `Packaging: Excluded (Client Workshop Collection / Unboxed)\n`;

    const text = `
=== 3D PRINTING SERVICE TAX QUOTATION ===
Quote #: ${quoteNumber}
Date: ${currentDate}
Valid Until: ${validUntilDate}
Provider: ${businessName} (VAT: ${vatNumber})
Client: ${clientName}
Project: ${projectName}
${cadText}
${filesText}${materialsText}Total Units: ${totalBatchUnits} unit(s)
Machine Time: ${params.printHours.toFixed(1)} hrs total
Slicing & Toolpath: ${params.slicingMins} mins
Post-Processing & Supports: ${params.postProcessingMins} mins/unit
${qaText}${packagingText}Unit Price (excl. VAT): ${currencySymbol}${(subtotal / Math.max(1, totalBatchUnits)).toFixed(2)}
Subtotal (excl. VAT): ${currencySymbol}${subtotal.toFixed(2)}
VAT (${taxRate}%): ${currencySymbol}${taxAmount.toFixed(2)}
TOTAL (incl. VAT): ${currencySymbol}${grandTotal.toFixed(2)}

Notes: ${notes}
==========================================
    `.trim();

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const generatePrintableHtml = () => {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Tax Quotation ${quoteNumber} - ${projectName}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      margin: 0;
      padding: 30px;
      color: #18181b;
      background: #ffffff;
      line-height: 1.5;
      font-size: 10pt;
    }
    @page {
      size: A4 portrait;
      margin: 15mm;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #18181b;
      padding-bottom: 16px;
      margin-bottom: 20px;
      gap: 20px;
    }
    .company-branding {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .company-logo-img {
      max-height: 56px;
      max-width: 140px;
      object-fit: contain;
      border-radius: 4px;
    }
    .company h1 {
      margin: 0 0 4px 0;
      font-size: 20px;
      color: #000000;
    }
    .company p {
      margin: 0;
      color: #3f3f46;
      font-size: 12px;
    }
    .meta {
      text-align: right;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
    }
    .quote-badge {
      font-size: 16px;
      font-weight: bold;
      color: #f97316;
      margin-bottom: 4px;
    }
    .grid-info {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      padding: 14px 0;
      border-bottom: 1px solid #e4e4e7;
      margin-bottom: 20px;
    }
    .info-block label {
      display: block;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #52525b;
      font-weight: 600;
      margin-bottom: 3px;
    }
    .info-block div {
      font-size: 13px;
      font-weight: 600;
      color: #000000;
    }
    .info-block span {
      display: block;
      font-size: 11px;
      color: #71717a;
      font-weight: normal;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th {
      text-align: left;
      padding: 10px 8px;
      border-bottom: 2px solid #d4d4d8;
      font-size: 11px;
      color: #52525b;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    td {
      padding: 12px 8px;
      border-bottom: 1px solid #f4f4f5;
      vertical-align: top;
      font-size: 10pt;
    }
    .mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .num {
      text-align: right;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      white-space: nowrap;
    }
    .center {
      text-align: center;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .item-title {
      font-weight: 600;
      color: #18181b;
      display: block;
      margin-bottom: 2px;
    }
    .item-desc {
      font-size: 11px;
      color: #71717a;
    }
    .tag {
      display: inline-block;
      font-size: 9px;
      background: #ecfdf5;
      color: #047857;
      border: 1px solid #a7f3d0;
      padding: 1px 6px;
      border-radius: 3px;
      margin-left: 6px;
      font-weight: 600;
    }
    .totals-area {
      display: flex;
      justify-content: flex-end;
      margin-top: 15px;
      padding-top: 15px;
      border-top: 1px solid #d4d4d8;
    }
    .totals-box {
      width: 280px;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 10pt;
      color: #52525b;
    }
    .grand-total {
      display: flex;
      justify-content: space-between;
      padding: 8px 0 4px 0;
      border-top: 2px solid #18181b;
      margin-top: 6px;
      font-size: 16px;
      font-weight: bold;
      color: #18181b;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .notes-box {
      margin-top: 30px;
      padding: 14px;
      border-radius: 6px;
      background: #fafafa;
      border: 1px solid #e4e4e7;
      font-size: 11px;
      color: #52525b;
    }
    .notes-title {
      font-weight: 600;
      color: #18181b;
      margin-bottom: 4px;
    }
    .footer {
      margin-top: 40px;
      text-align: center;
      font-size: 10px;
      color: #a1a1aa;
      border-top: 1px solid #f4f4f5;
      padding-top: 12px;
    }
    .action-bar {
      margin-bottom: 20px;
      padding: 12px;
      background: #f4f4f5;
      border-radius: 8px;
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .btn {
      background: #f97316;
      color: white;
      border: none;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 600;
      border-radius: 6px;
      cursor: pointer;
    }
    .btn:hover { background: #ea580c; }
    @media print {
      body { padding: 0; }
      .action-bar { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="action-bar">
    <button class="btn" onclick="window.print()">🖨️ Click Here to Print / Save PDF</button>
    <span style="font-size: 12px; color: #52525b;">Select "Save as PDF" destination in your browser print prompt.</span>
  </div>

  <div class="header">
    <div class="company-branding">
      ${companyLogo ? `<img src="${companyLogo}" alt="Company Logo" class="company-logo-img" />` : ''}
      <div class="company">
        <h1>${businessName}</h1>
        <p>Additive Manufacturing & Rapid Prototyping ${vatNumber ? `· VAT Reg No: ${vatNumber}` : ''}</p>
      </div>
    </div>
    <div class="meta">
      <div class="quote-badge">${quoteNumber}</div>
      <div>Issued: ${currentDate}</div>
      <div>Valid Until: ${validUntilDate}</div>
    </div>
  </div>

  <div class="grid-info">
    <div class="info-block">
      <label>Client / Recipient</label>
      <div>${clientName}</div>
    </div>
    <div class="info-block">
      <label>Project / Order Summary</label>
      <div>${projectName}</div>
      ${activeFiles.length > 0
        ? `<span>${activeFiles.length} file(s) · ${totalBatchUnits} total unit(s)</span>`
        : (metadata?.dimensions ? `<span>Dimensions: ${metadata.dimensions.width}×${metadata.dimensions.depth}×${metadata.dimensions.height} mm</span>` : '')
      }
    </div>
    ${activeFiles.length > 1 ? `
    <div class="info-block" style="grid-column: span 2; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px;">
      <label>G-Code Files & Components Roster (${activeFiles.length} Files · ${totalBatchUnits} Total Parts)</label>
      <div style="font-weight: normal; font-size: 11px; margin-top: 4px;">
        ${activeFiles.map((f) => `
          <div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px dashed #e2e8f0;">
            <span><strong>${f.fileName}</strong> (${f.metadata.printTimeFormatted}, ${f.metadata.filamentGrams}g/unit${f.metadata.dimensions ? ` · ${f.metadata.dimensions.width}×${f.metadata.dimensions.depth}×${f.metadata.dimensions.height}mm` : ''})</span>
            <span style="font-family: monospace; font-weight: 600;">Qty: ${f.quantity}</span>
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 52%;">Service Description</th>
        <th class="center" style="width: 10%;">Qty</th>
        <th class="num" style="width: 18%;">Rate / Unit</th>
        <th class="num" style="width: 20%;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${breakdown.hasCadService ? `
      <tr>
        <td>
          <span class="item-title">3D CAD Modeling & Engineering Design <span class="tag">CAD</span></span>
          <div class="item-desc">Parametric CAD modeling, dimensional engineering, mesh optimization (${params.cadModelingHours} hrs)</div>
        </td>
        <td class="center">1</td>
        <td class="num">${currencySymbol}${params.cadHourlyRate}/hr</td>
        <td class="num font-bold"><strong>${currencySymbol}${breakdown.cadDesignCost.toFixed(2)}</strong></td>
      </tr>
      <tr>
        <td>
          <span class="item-title">Client Design Review & Revision Sessions <span class="tag">REVISION</span></span>
          <div class="item-desc">${params.cadReviewCycles} client review cycle(s) (${params.cadReviewMinutesPerCycle} min/session) with feedback incorporation</div>
        </td>
        <td class="center">${params.cadReviewCycles}</td>
        <td class="num">${currencySymbol}${((params.cadReviewMinutesPerCycle / 60) * params.cadHourlyRate).toFixed(2)}</td>
        <td class="num font-bold"><strong>${currencySymbol}${breakdown.cadReviewCost.toFixed(2)}</strong></td>
      </tr>
      ` : ''}
      <tr>
        <td>
          <span class="item-title">CAM Slicing & Machine Toolpath Optimization</span>
          <div class="item-desc">Build orientation, infill engineering, support generation & G-code validation (${params.slicingMins} mins)</div>
        </td>
        <td class="center">1</td>
        <td class="num">${currencySymbol}${breakdown.slicingCost.toFixed(2)}</td>
        <td class="num font-bold"><strong>${currencySymbol}${breakdown.slicingCost.toFixed(2)}</strong></td>
      </tr>
      ${breakdown.filamentItemCosts && breakdown.filamentItemCosts.length > 1 ? `
        ${breakdown.filamentItemCosts.map((m) => `
        <tr>
          <td>
            <span class="item-title">Material: ${m.name} <span class="tag">${m.type}</span></span>
            <div class="item-desc">Net: ${m.gramsUsed.toFixed(1)}g${m.purgeGrams > 0 ? ` + Purge waste: ${m.purgeGrams.toFixed(1)}g` : ''} · Total: ${m.totalGrams.toFixed(1)}g consumption (@ ${currencySymbol}${m.spoolPrice}/${m.spoolWeightGrams}g spool)</div>
          </td>
          <td class="center">${m.totalGrams.toFixed(1)}g</td>
          <td class="num">${currencySymbol}${(m.cost / Math.max(1, totalBatchUnits)).toFixed(2)}</td>
          <td class="num font-bold"><strong>${currencySymbol}${m.cost.toFixed(2)}</strong></td>
        </tr>
        `).join('')}
      ` : ''}
      <tr>
        <td>
          <span class="item-title">Industrial FDM 3D Printing Production</span>
          <div class="item-desc">Additive manufacturing machine run (${(params.printHours).toFixed(1)} total machine hours${breakdown.filamentItemCosts && breakdown.filamentItemCosts.length === 1 ? ` · ${breakdown.filamentItemCosts[0].name} ${breakdown.filamentItemCosts[0].totalGrams.toFixed(1)}g` : ''})</div>
        </td>
        <td class="center">${totalBatchUnits}</td>
        <td class="num">${currencySymbol}${(((breakdown.filamentItemCosts && breakdown.filamentItemCosts.length > 1 ? 0 : breakdown.totalMaterialCost) + breakdown.totalMachineCost + breakdown.failureBufferCost + (breakdown.profitAmount * 0.7)) / Math.max(1, totalBatchUnits)).toFixed(2)}</td>
        <td class="num font-bold"><strong>${currencySymbol}${(((breakdown.filamentItemCosts && breakdown.filamentItemCosts.length > 1 ? 0 : breakdown.totalMaterialCost) + breakdown.totalMachineCost + breakdown.failureBufferCost + (breakdown.profitAmount * 0.7))).toFixed(2)}</strong></td>
      </tr>
      <tr>
        <td>
          <span class="item-title">Post-Processing & Support Removal</span>
          <div class="item-desc">Support detachment, surface cleanup, raft removal & thermal deburring (${params.postProcessingMins} mins/unit)</div>
        </td>
        <td class="center">${totalBatchUnits}</td>
        <td class="num">${currencySymbol}${((breakdown.postProcessingCost + breakdown.profitAmount * 0.1) / Math.max(1, totalBatchUnits)).toFixed(2)}</td>
        <td class="num font-bold"><strong>${currencySymbol}${(breakdown.postProcessingCost + breakdown.profitAmount * 0.1).toFixed(2)}</strong></td>
      </tr>
      <tr>
        <td>
          <span class="item-title">Quality Assurance & Dimensional Inspection <span class="tag">QA / QC</span></span>
          <div class="item-desc">Precision caliper & micrometer verification against 3D CAD model, layer adhesion check (ISO/ASTM 52900 standard, ${params.qaInspectionMins || 4} mins/unit)</div>
        </td>
        <td class="center">${totalBatchUnits}</td>
        <td class="num">${currencySymbol}${((breakdown.qaInspectionCost + breakdown.profitAmount * 0.08) / Math.max(1, totalBatchUnits)).toFixed(2)}</td>
        <td class="num font-bold"><strong>${currencySymbol}${(breakdown.qaInspectionCost + breakdown.profitAmount * 0.08).toFixed(2)}</strong></td>
      </tr>
      ${breakdown.enablePackaging ? `
      <tr>
        <td>
          <span class="item-title">Protective Packaging & Dispatch Preparation</span>
          <div class="item-desc">Moisture-barrier bag with desiccant, protective bubble wrap cushioning, and rigid corrugated box (tracked courier dispatch standard)</div>
        </td>
        <td class="center">${totalBatchUnits}</td>
        <td class="num">${currencySymbol}${((breakdown.totalPackagingCost + breakdown.workshopOverheadCost + breakdown.profitAmount * 0.12) / Math.max(1, totalBatchUnits)).toFixed(2)}</td>
        <td class="num font-bold"><strong>${currencySymbol}${(breakdown.totalPackagingCost + breakdown.workshopOverheadCost + breakdown.profitAmount * 0.12).toFixed(2)}</strong></td>
      </tr>
      ` : `
      <tr style="background-color: #f8fafc;">
        <td>
          <span class="item-title" style="color: #64748b;">Protective Packaging: Excluded (Workshop Collection)</span>
          <div class="item-desc">Packaging omitted per client request · direct workshop pick-up / customer-supplied container</div>
        </td>
        <td class="center" style="color: #64748b;">${totalBatchUnits}</td>
        <td class="num" style="color: #64748b;">${currencySymbol}0.00</td>
        <td class="num" style="color: #64748b;"><strong>${currencySymbol}0.00 (Excluded)</strong></td>
      </tr>
      `}
    </tbody>
  </table>

  <div class="totals-area">
    <div class="totals-box">
      <div class="total-row">
        <span>Subtotal (excl. VAT):</span>
        <span>${currencySymbol}${subtotal.toFixed(2)}</span>
      </div>
      <div class="total-row">
        <span>VAT (${taxRate}%):</span>
        <span>${currencySymbol}${taxAmount.toFixed(2)}</span>
      </div>
      <div class="grand-total">
        <span>Total (incl. VAT):</span>
        <span>${currencySymbol}${grandTotal.toFixed(2)}</span>
      </div>
      <div class="total-row" style="font-size: 11px; margin-top: 4px;">
        <span>Unit Price (incl. VAT):</span>
        <span>${currencySymbol}${(grandTotal / Math.max(1, totalBatchUnits)).toFixed(2)} / part</span>
      </div>
    </div>
  </div>

  <div class="notes-box">
    <div class="notes-title">Production Terms & Delivery:</div>
    <div>${notes}</div>
  </div>

  <div style="margin-top: 20px; padding: 14px; border-radius: 6px; background: #fafafa; border: 1px solid #e4e4e7; font-size: 11px;">
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
      <div>
        <div style="font-weight: 600; color: #18181b; margin-bottom: 6px;">Banking & EFT / Wire Details</div>
        <div style="font-family: ui-monospace, monospace; font-size: 11px; color: #52525b; line-height: 1.6;">
          <div>Bank: <strong style="color: #18181b;">${bankName}</strong></div>
          <div>Account Name: <strong style="color: #18181b;">${businessName}</strong></div>
          <div>Account Number: <strong style="color: #ea580c; font-size: 12px;">${accountNumber}</strong></div>
          <div>Account Type: <strong style="color: #18181b;">${accountType}</strong></div>
          <div>Branch / Routing Code: <strong style="color: #18181b;">${branchCode}</strong></div>
          <div>Payment Reference: <strong style="color: #ea580c;">${quoteNumber}</strong></div>
        </div>
      </div>
      <div>
        <div style="font-weight: 600; color: #18181b; margin-bottom: 6px;">Manufacturing & QA Guarantee</div>
        <p style="color: #52525b; font-size: 11px; margin: 0; line-height: 1.5;">
          Produced to ISO/ASTM 52900 dimensional specifications. 50% deposit required upon quotation approval to schedule print queue; balance payable upon QA verification prior to dispatch.
        </p>
      </div>
    </div>
  </div>

  <div class="footer">
    Commercial Quotation ${quoteNumber} · Issued by ${businessName} · LayerCost Additive Manufacturing Platform
  </div>
</body>
</html>`;
  };

  const handleDownloadInvoiceHtml = () => {
    const html = generatePrintableHtml();
    const filename = `Quotation_${quoteNumber}_${projectName.replace(/[^a-zA-Z0-9_-]/g, '_')}.html`;

    if (isRunningInOrcaSlicer()) {
      saveInvoiceViaOrca(filename, html);
    }

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 3000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 lg:p-6 bg-black/75 backdrop-blur-xs overflow-y-auto quote-modal-overlay">
      <div className="relative w-[96vw] sm:w-[94vw] max-w-[1440px] bg-[#2d2d30] border border-[#45454a] rounded-md shadow-2xl text-zinc-100 flex flex-col max-h-[94vh] quote-modal-dialog overflow-hidden">
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-[#3f3f44] bg-[#1e1e20] no-print">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#00c44b]" />
            <h2 className="text-base font-semibold text-white">Commercial Quotation Generator</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={exportQuoteAsPdf}
              disabled={isExportingPdf}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-[#00ae42] hover:bg-[#00c44b] rounded transition-colors flex items-center gap-1.5 active:scale-95 cursor-pointer disabled:opacity-60"
              title="Export structured quotation as PDF document using browser print dialog (Ctrl+P)"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{isExportingPdf ? 'Exporting...' : 'Export PDF'}</span>
            </button>

            <div className="flex items-center bg-[#262628] rounded p-0.5 text-xs border border-[#45454a]">
              <button
                onClick={() => setIsClientView(true)}
                className={`px-3 py-1 rounded-xs transition-colors cursor-pointer ${
                  isClientView ? 'bg-[#00ae42] text-white font-semibold' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Client View
              </button>
              <button
                onClick={() => setIsClientView(false)}
                className={`px-3 py-1 rounded-xs transition-colors cursor-pointer ${
                  !isClientView ? 'bg-[#00ae42] text-white font-semibold' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Internal Audit
              </button>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-zinc-400 hover:text-white rounded hover:bg-[#36363a] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Quotation Sheet */}
        <div className="p-6 overflow-y-auto space-y-6 printable-quote printable-quote-sheet">
          {/* Metadata Inputs (Editable in UI) */}
          <div className="bg-[#232325] p-3.5 rounded border border-[#3a3a3f] space-y-3 print:hidden no-print">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Business Name</label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => handleBusinessNameChange(e.target.value)}
                  className="w-full bg-[#1e1e20] border border-[#45454a] rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00ae42] focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">VAT Reg. Number</label>
                <input
                  type="text"
                  value={vatNumber}
                  onChange={(e) => handleVatNumberChange(e.target.value)}
                  placeholder="4890281942"
                  className="w-full bg-[#1e1e20] border border-[#45454a] rounded px-2.5 py-1.5 text-xs text-white font-mono focus:border-[#00ae42] focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Client / Customer</label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => handleClientNameChange(e.target.value)}
                  className="w-full bg-[#1e1e20] border border-[#45454a] rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00ae42] focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Project Name / Summary</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => handleProjectNameChange(e.target.value)}
                  placeholder="e.g. Custom Rapid Prototype Batch"
                  className="w-full bg-[#1e1e20] border border-[#45454a] rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00ae42] focus:outline-hidden"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Packaging Option</label>
                {onTogglePackaging ? (
                  <button
                    type="button"
                    onClick={() => onTogglePackaging(!params.enablePackaging)}
                    className={`w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-semibold border transition-all cursor-pointer ${
                      params.enablePackaging
                        ? 'bg-[#00ae42]/15 border-[#00ae42]/60 text-[#00c44b] hover:bg-[#00ae42]/25'
                        : 'bg-[#1e1e20] border-[#45454a] text-zinc-400 hover:text-white'
                    }`}
                    title={params.enablePackaging ? 'Click to exclude packaging (workshop collection)' : 'Click to include protective packaging'}
                  >
                    <Box className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{params.enablePackaging ? 'Box Included' : 'Exclude (Pickup)'}</span>
                  </button>
                ) : (
                  <div className="text-xs text-zinc-300 font-mono py-1.5 px-2 bg-[#1e1e20] rounded border border-[#45454a]">
                    {params.enablePackaging ? 'Box Included' : 'Excluded'}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">VAT Rate (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={taxRate}
                  onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#1e1e20] border border-[#45454a] rounded px-2.5 py-1.5 text-xs text-white font-mono focus:border-[#00ae42] focus:outline-hidden tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Company Logo</label>
                <div className="flex items-center gap-1.5">
                  <label className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-[#36363a] hover:bg-[#424247] border border-[#4e4e54] rounded text-xs text-zinc-200 cursor-pointer transition-colors truncate">
                    <ImageIcon className="w-3.5 h-3.5 text-[#26b4b0] shrink-0" />
                    <span className="truncate">{companyLogo ? 'Change Logo' : 'Upload Logo'}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml,image/webp"
                      onChange={handleLogoUpload}
                      className="sr-only"
                    />
                  </label>
                  {companyLogo && (
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      title="Remove logo"
                      className="p-1.5 bg-[#36363a] hover:bg-rose-900/60 border border-[#4e4e54] hover:border-rose-700 text-zinc-400 hover:text-rose-300 rounded transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Banking Details Bar & Editor Space */}
            <div className="pt-2.5 border-t border-[#3a3a3f]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
                  <span className="flex items-center gap-1.5 text-zinc-300 font-medium">
                    <CreditCard className="w-3.5 h-3.5 text-[#26b4b0]" />
                    <span>EFT Bank Details:</span>
                  </span>
                  <span>Bank: <strong className="text-zinc-200">{bankName}</strong></span>
                  <span className="text-zinc-600">·</span>
                  <span>Acc No: <strong className="text-[#f58220] font-mono font-bold tracking-wide">{accountNumber}</strong></span>
                  <span className="text-zinc-600">·</span>
                  <span>Branch: <strong className="text-zinc-200 font-mono">{branchCode}</strong></span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditingBankDetails(!isEditingBankDetails)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1.5 border cursor-pointer ${
                    isEditingBankDetails
                      ? 'bg-[#00ae42] text-white border-[#00ae42]'
                      : 'bg-[#36363a] hover:bg-[#424247] text-[#26b4b0] border-[#4e4e54] hover:text-white'
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{isEditingBankDetails ? 'Close Bank Editor' : 'Edit Bank Details & Acc No'}</span>
                </button>
              </div>

              {/* Dedicated Expandable Space to Edit Bank Details & Account Number */}
              {isEditingBankDetails && (
                <div className="mt-3 p-3 bg-[#1e1e20] rounded border border-[#45454a]">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#3a3a3f] text-xs font-semibold text-white">
                    <span className="flex items-center gap-1.5">
                      <CreditCard className="w-4 h-4 text-[#00c44b]" />
                      <span>Edit Official Bank & EFT Payment Details</span>
                    </span>
                    <span className="text-[11px] font-normal text-zinc-400">
                      Changes are auto-saved and reflected on the quote & PDF
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1">Bank Name</label>
                      <input
                        type="text"
                        value={bankName}
                        onChange={(e) => handleBankNameChange(e.target.value)}
                        placeholder="e.g. Commercial Business Bank"
                        className="w-full bg-[#262628] border border-[#45454a] rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00ae42] focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#f58220] font-medium mb-1">Account Number *</label>
                      <input
                        type="text"
                        value={accountNumber}
                        onChange={(e) => handleAccountNumberChange(e.target.value)}
                        placeholder="e.g. 6289 4028 194"
                        className="w-full bg-[#262628] border border-[#f58220]/70 rounded px-2.5 py-1.5 text-xs text-white font-mono font-bold tracking-wider focus:border-[#00ae42] focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1">Account Type</label>
                      <input
                        type="text"
                        value={accountType}
                        onChange={(e) => handleAccountTypeChange(e.target.value)}
                        placeholder="e.g. Business Checking Account"
                        className="w-full bg-[#262628] border border-[#45454a] rounded px-2.5 py-1.5 text-xs text-white focus:border-[#00ae42] focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1">Branch / Routing Code</label>
                      <input
                        type="text"
                        value={branchCode}
                        onChange={(e) => handleBranchCodeChange(e.target.value)}
                        placeholder="e.g. 250655 / SWIFT"
                        className="w-full bg-[#262628] border border-[#45454a] rounded px-2.5 py-1.5 text-xs text-white font-mono focus:border-[#00ae42] focus:outline-hidden"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quotation Header */}
          <div className="border border-[#3a3a3f] rounded p-5 bg-[#232325] print:border-zinc-300 print:bg-white print:text-black">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-4 border-b border-[#3a3a3f] print:border-zinc-300">
              <div className="flex items-center gap-4">
                {companyLogo && (
                  <div className="relative group shrink-0">
                    <img
                      src={companyLogo}
                      alt="Company Logo"
                      className="max-h-14 max-w-[140px] object-contain rounded bg-white/5 p-1 border border-[#45454a] print:border-none print:p-0"
                    />
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-rose-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[10px] print:hidden no-print"
                      title="Remove logo"
                    >
                      ×
                    </button>
                  </div>
                )}
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-white print:!text-black quote-business-name">{businessName}</h1>
                  <p className="text-xs text-zinc-400 print:text-zinc-600 mt-0.5">
                    Additive Manufacturing & Rapid Prototyping {vatNumber ? `· VAT No: ${vatNumber}` : ''}
                  </p>
                </div>
              </div>
              <div className="text-right sm:text-right font-mono text-xs text-zinc-400 print:text-zinc-600">
                <div className="text-sm font-semibold text-[#00c44b] print:text-black">{quoteNumber}</div>
                <div>Issued: {currentDate}</div>
                <div>Valid Until: {validUntilDate}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 py-4 text-xs border-b border-[#3a3a3f] print:border-zinc-300">
              <div>
                <span className="text-zinc-500 block uppercase tracking-wider text-[10px]">Client / Recipient</span>
                <span className="font-semibold text-white print:!text-black">{clientName}</span>
              </div>
              <div>
                <span className="text-zinc-500 block uppercase tracking-wider text-[10px]">Project / Order Summary</span>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => handleProjectNameChange(e.target.value)}
                  aria-label="Project Name or Summary"
                  className="w-full font-semibold text-white bg-transparent border border-transparent hover:border-[#45454a] focus:border-[#00ae42] focus:bg-[#1e1e20] rounded px-1.5 py-0.5 -ml-1.5 focus:outline-hidden transition-colors print:hidden"
                />
                <span className="hidden print:inline font-semibold text-black">{projectName}</span>
                <span className="text-zinc-400 print:text-zinc-600 block text-[11px]">
                  {activeFiles.length > 0 ? `${activeFiles.length} file(s) · ${totalBatchUnits} total parts` : (metadata?.dimensions ? `${metadata.dimensions.width}×${metadata.dimensions.depth}×${metadata.dimensions.height} mm` : '')}
                </span>
              </div>

              {activeFiles.length > 1 && (
                <div className="col-span-2 p-2.5 bg-[#1e1e20] rounded border border-[#3f3f44] print:border-zinc-300 print:bg-zinc-50 text-[11px]">
                  <div className="font-semibold text-zinc-300 print:text-black mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Box className="w-3.5 h-3.5 text-[#00c44b]" />
                      <span>G-Code File Roster ({activeFiles.length} files · {totalBatchUnits} parts total)</span>
                    </span>
                    <span className="font-mono text-[10px] text-[#26b4b0]">{params.printHours.toFixed(1)} machine hrs</span>
                  </div>
                  <div className="space-y-1 max-h-32 print:max-h-none overflow-y-auto print:overflow-visible font-mono text-zinc-400 print:text-zinc-600 pr-1">
                    {activeFiles.map((f) => (
                      <div key={f.id} className="flex justify-between items-center py-1 border-b border-[#3a3a3f] last:border-none">
                        <span className="truncate pr-2 font-sans text-zinc-200 print:text-black">{f.fileName}</span>
                        <span className="shrink-0 text-zinc-400 font-mono text-[10px]">
                          Qty: <strong className="text-white print:text-black">{f.quantity}</strong> ({f.metadata.printTimeFormatted}, {f.metadata.filamentGrams}g/ea)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Line Items Table */}
            <div className="py-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 print:border-zinc-300 text-zinc-400 print:text-zinc-600">
                    <th className="text-left py-2">Service Description</th>
                    <th className="text-center py-2">Qty</th>
                    <th className="text-right py-2">Rate / Unit</th>
                    <th className="text-right py-2">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 print:divide-zinc-200 font-mono">
                  {isClientView ? (
                    <>
                      {/* CAD 3D Modeling (If enabled) */}
                      {breakdown.hasCadService && (
                        <>
                          <tr>
                            <td className="py-3 text-left">
                              <span className="font-sans font-medium text-white print:text-black block flex items-center gap-1.5">
                                <span>3D CAD Modeling & Engineering Design</span>
                                <span className="text-[10px] px-1.5 py-0.5 bg-zinc-800 text-sky-400 rounded border border-zinc-700 print:bg-zinc-100 print:border-zinc-300 print:text-sky-800 font-medium">
                                  CAD
                                </span>
                              </span>
                              <span className="font-sans text-[11px] text-zinc-400 print:text-zinc-600">
                                Parametric CAD modeling, dimensional engineering, mesh optimization ({params.cadModelingHours} hrs)
                              </span>
                            </td>
                            <td className="py-3 text-center text-zinc-300 print:text-black">1</td>
                            <td className="py-3 text-right text-zinc-300 print:text-black tabular-nums">
                              {currencySymbol}{params.cadHourlyRate}/hr
                            </td>
                            <td className="py-3 text-right font-semibold text-white print:text-black tabular-nums">
                              {currencySymbol}{breakdown.cadDesignCost.toFixed(2)}
                            </td>
                          </tr>

                          <tr>
                            <td className="py-3 text-left">
                              <span className="font-sans font-medium text-white print:text-black block">
                                Client Design Review & Revision Sessions
                              </span>
                              <span className="font-sans text-[11px] text-zinc-400 print:text-zinc-600">
                                {params.cadReviewCycles} client review cycle(s) ({params.cadReviewMinutesPerCycle} min/session) with feedback incorporation
                              </span>
                            </td>
                            <td className="py-3 text-center text-zinc-300 print:text-black">{params.cadReviewCycles}</td>
                            <td className="py-3 text-right text-zinc-300 print:text-black tabular-nums">
                              {currencySymbol}{((params.cadReviewMinutesPerCycle / 60) * params.cadHourlyRate).toFixed(2)}
                            </td>
                            <td className="py-3 text-right font-semibold text-white print:text-black tabular-nums">
                              {currencySymbol}{breakdown.cadReviewCost.toFixed(2)}
                            </td>
                          </tr>
                        </>
                      )}

                      {/* Slicing & CAM Toolpath Generation */}
                      <tr>
                        <td className="py-3 text-left">
                          <span className="font-sans font-medium text-white print:text-black block">
                            CAM Slicing & Machine Toolpath Optimization
                          </span>
                          <span className="font-sans text-[11px] text-zinc-400 print:text-zinc-600">
                            Build orientation, infill engineering, support generation & G-code validation ({params.slicingMins} mins)
                          </span>
                        </td>
                        <td className="py-3 text-center text-zinc-300 print:text-black">1</td>
                        <td className="py-3 text-right text-zinc-300 print:text-black tabular-nums">
                          {currencySymbol}{breakdown.slicingCost.toFixed(2)}
                        </td>
                        <td className="py-3 text-right font-semibold text-white print:text-black tabular-nums">
                          {currencySymbol}{breakdown.slicingCost.toFixed(2)}
                        </td>
                      </tr>

                      {/* Multi-Filament Itemized Materials (If multi-filament) */}
                      {breakdown.filamentItemCosts && breakdown.filamentItemCosts.length > 1 && (
                        breakdown.filamentItemCosts.map((m) => (
                          <tr key={m.id}>
                            <td className="py-3 text-left">
                              <span className="font-sans font-medium text-white print:text-black flex items-center gap-2">
                                {m.colorHex && (
                                  <span
                                    className="w-2.5 h-2.5 rounded-full border border-white/20 shrink-0"
                                    style={{ backgroundColor: m.colorHex }}
                                  />
                                )}
                                <span>Material: {m.name}</span>
                                <span className="text-[10px] px-1.5 py-0.5 bg-zinc-800 text-sky-400 rounded border border-zinc-700 font-mono print:bg-zinc-100 print:border-zinc-300 print:text-zinc-800">
                                  {m.type}
                                </span>
                              </span>
                              <span className="font-sans text-[11px] text-zinc-400 print:text-zinc-600 block">
                                Net: {m.gramsUsed.toFixed(1)}g{m.purgeGrams > 0 ? ` + Purge waste: ${m.purgeGrams.toFixed(1)}g` : ''} · Total: {m.totalGrams.toFixed(1)}g spool consumption (@ {currencySymbol}{m.spoolPrice}/{m.spoolWeightGrams}g spool)
                              </span>
                            </td>
                            <td className="py-3 text-center text-zinc-300 print:text-black">{m.totalGrams.toFixed(1)}g</td>
                            <td className="py-3 text-right text-zinc-300 print:text-black tabular-nums">
                              {currencySymbol}{(m.cost / Math.max(1, totalBatchUnits)).toFixed(2)}
                            </td>
                            <td className="py-3 text-right font-semibold text-white print:text-black tabular-nums">
                              {currencySymbol}{m.cost.toFixed(2)}
                            </td>
                          </tr>
                        ))
                      )}

                      {/* 3D Printing Production Machine Time */}
                      <tr>
                        <td className="py-3 text-left">
                          <span className="font-sans font-medium text-white print:text-black block">
                            Industrial FDM 3D Printing Production
                          </span>
                          <span className="font-sans text-[11px] text-zinc-400 print:text-zinc-600">
                            Machine runtime ({params.printHours.toFixed(1)} total machine hours{(!breakdown.filamentItemCosts || breakdown.filamentItemCosts.length <= 1) ? ` · ${metadata?.filamentType || 'Thermoplastic'}` : ''}, {metadata?.layerHeightMm || 0.2}mm resolution)
                          </span>
                        </td>
                        <td className="py-3 text-center text-zinc-300 print:text-black">{totalBatchUnits}</td>
                        <td className="py-3 text-right text-zinc-300 print:text-black tabular-nums">
                          {currencySymbol}{(((breakdown.filamentItemCosts && breakdown.filamentItemCosts.length > 1 ? 0 : breakdown.totalMaterialCost) + breakdown.totalMachineCost + breakdown.failureBufferCost + (breakdown.profitAmount * 0.7)) / Math.max(1, totalBatchUnits)).toFixed(2)}
                        </td>
                        <td className="py-3 text-right font-semibold text-white print:text-black tabular-nums">
                          {currencySymbol}{(((breakdown.filamentItemCosts && breakdown.filamentItemCosts.length > 1 ? 0 : breakdown.totalMaterialCost) + breakdown.totalMachineCost + breakdown.failureBufferCost + (breakdown.profitAmount * 0.7))).toFixed(2)}
                        </td>
                      </tr>

                      {/* Post-Processing */}
                      <tr>
                        <td className="py-3 text-left">
                          <span className="font-sans font-medium text-white print:text-black block">
                            Post-Processing & Support Removal
                          </span>
                          <span className="font-sans text-[11px] text-zinc-400 print:text-zinc-600">
                            Support detachment, surface cleanup, raft removal & thermal deburring ({params.postProcessingMins} mins/unit)
                          </span>
                        </td>
                        <td className="py-3 text-center text-zinc-300 print:text-black">{totalBatchUnits}</td>
                        <td className="py-3 text-right text-zinc-300 print:text-black tabular-nums">
                          {currencySymbol}{((breakdown.postProcessingCost + breakdown.profitAmount * 0.1) / Math.max(1, totalBatchUnits)).toFixed(2)}
                        </td>
                        <td className="py-3 text-right font-semibold text-white print:text-black tabular-nums">
                          {currencySymbol}{(breakdown.postProcessingCost + breakdown.profitAmount * 0.1).toFixed(2)}
                        </td>
                      </tr>

                      {/* QA & Dimensional Verification */}
                      <tr>
                        <td className="py-3 text-left">
                          <span className="font-sans font-medium text-white print:text-black flex items-center gap-1.5">
                            <span>Quality Assurance & Dimensional Inspection</span>
                            <span className="tag-qa text-[10px] px-1.5 py-0.5 bg-emerald-950/60 text-emerald-300 rounded border border-emerald-800/60 print:bg-emerald-50 print:text-emerald-700 print:border-emerald-300 font-semibold tracking-wide">
                              QA / QC
                            </span>
                          </span>
                          <span className="font-sans text-[11px] text-zinc-400 print:text-zinc-600">
                            Precision caliper & micrometer verification against 3D CAD model, layer bonding check (ISO/ASTM 52900 spec, {params.qaInspectionMins || 4} mins/unit)
                          </span>
                        </td>
                        <td className="py-3 text-center text-zinc-300 print:text-black">{totalBatchUnits}</td>
                        <td className="py-3 text-right text-zinc-300 print:text-black tabular-nums">
                          {currencySymbol}{((breakdown.qaInspectionCost + breakdown.profitAmount * 0.08) / Math.max(1, totalBatchUnits)).toFixed(2)}
                        </td>
                        <td className="py-3 text-right font-semibold text-white print:text-black tabular-nums">
                          {currencySymbol}{(breakdown.qaInspectionCost + breakdown.profitAmount * 0.08).toFixed(2)}
                        </td>
                      </tr>

                      {/* Packaging */}
                      {breakdown.enablePackaging ? (
                        <tr>
                          <td className="py-3 text-left">
                            <span className="font-sans font-medium text-white print:text-black block">
                              Protective Packaging & Shipping Dispatch
                            </span>
                            <span className="font-sans text-[11px] text-zinc-400 print:text-zinc-600">
                              Moisture-barrier pouch with desiccant, protective bubble wrap cushioning, and rigid corrugated box (tracked courier dispatch standard)
                            </span>
                          </td>
                          <td className="py-3 text-center text-zinc-300 print:text-black">{totalBatchUnits}</td>
                          <td className="py-3 text-right text-zinc-300 print:text-black tabular-nums">
                            {currencySymbol}{((breakdown.totalPackagingCost + breakdown.workshopOverheadCost + breakdown.profitAmount * 0.12) / Math.max(1, totalBatchUnits)).toFixed(2)}
                          </td>
                          <td className="py-3 text-right font-semibold text-white print:text-black tabular-nums">
                            {currencySymbol}{(breakdown.totalPackagingCost + breakdown.workshopOverheadCost + breakdown.profitAmount * 0.12).toFixed(2)}
                          </td>
                        </tr>
                      ) : (
                        <tr className="bg-zinc-800/20">
                          <td className="py-3 text-left">
                            <span className="font-sans font-medium text-zinc-400 print:text-zinc-500 flex items-center gap-1.5">
                              <span>Protective Packaging: Excluded (Workshop Collection)</span>
                              <span className="text-[10px] px-1 py-0.2 bg-zinc-800 text-zinc-400 rounded border border-zinc-700">
                                Client Pickup
                              </span>
                            </span>
                            <span className="font-sans text-[11px] text-zinc-500 print:text-zinc-500">
                              Packaging omitted per customer request · direct workshop collection / customer-supplied container
                            </span>
                          </td>
                          <td className="py-3 text-center text-zinc-500 print:text-zinc-500">{totalBatchUnits}</td>
                          <td className="py-3 text-right text-zinc-500 print:text-zinc-500 tabular-nums">
                            {currencySymbol}0.00
                          </td>
                          <td className="py-3 text-right font-semibold text-zinc-400 print:text-zinc-500 tabular-nums">
                            {currencySymbol}0.00 (Excluded)
                          </td>
                        </tr>
                      )}
                    </>
                  ) : (
                    /* Internal Audit View */
                    <>
                      {breakdown.hasCadService && (
                        <>
                          <tr className="bg-zinc-800/40">
                            <td className="py-2.5 text-left font-sans text-sky-400">
                              CAD 3D Modeling ({params.cadModelingHours}h @ {currencySymbol}{params.cadHourlyRate}/hr)
                            </td>
                            <td className="py-2.5 text-center">1</td>
                            <td className="py-2.5 text-right tabular-nums">
                              {currencySymbol}{breakdown.cadDesignCost.toFixed(2)}
                            </td>
                            <td className="py-2.5 text-right tabular-nums text-sky-400">
                              {currencySymbol}{breakdown.cadDesignCost.toFixed(2)}
                            </td>
                          </tr>
                          <tr className="bg-zinc-800/40">
                            <td className="py-2.5 text-left font-sans text-sky-400">
                              Client Review & Revisions ({params.cadReviewCycles}x {params.cadReviewMinutesPerCycle}m)
                            </td>
                            <td className="py-2.5 text-center">{params.cadReviewCycles}</td>
                            <td className="py-2.5 text-right tabular-nums">
                              {currencySymbol}{breakdown.cadReviewCost.toFixed(2)}
                            </td>
                            <td className="py-2.5 text-right tabular-nums text-sky-400">
                              {currencySymbol}{breakdown.cadReviewCost.toFixed(2)}
                            </td>
                          </tr>
                        </>
                      )}
                      <tr>
                        <td className="py-2.5 text-left font-sans">
                          Slicing & Toolpath Generation ({params.slicingMins}m @ {currencySymbol}{params.laborHourlyRate}/hr)
                        </td>
                        <td className="py-2.5 text-center">1</td>
                        <td className="py-2.5 text-right tabular-nums">{currencySymbol}{breakdown.slicingCost.toFixed(2)}</td>
                        <td className="py-2.5 text-right tabular-nums">{currencySymbol}{breakdown.slicingCost.toFixed(2)}</td>
                      </tr>
                      {breakdown.filamentItemCosts && breakdown.filamentItemCosts.length > 1 ? (
                        breakdown.filamentItemCosts.map((m) => (
                          <tr key={m.id}>
                            <td className="py-2.5 text-left font-sans flex items-center gap-2">
                              {m.colorHex && (
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: m.colorHex }} />
                              )}
                              <span>Spool: {m.name} ({m.totalGrams.toFixed(1)}g @ {currencySymbol}{m.spoolPrice}/{m.spoolWeightGrams}g)</span>
                            </td>
                            <td className="py-2.5 text-center">{m.totalGrams.toFixed(1)}g</td>
                            <td className="py-2.5 text-right tabular-nums">
                              {currencySymbol}{(m.cost / Math.max(1, totalBatchUnits)).toFixed(2)}
                            </td>
                            <td className="py-2.5 text-right tabular-nums">{currencySymbol}{m.cost.toFixed(2)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="py-2.5 text-left font-sans">Raw Filament & Purge Waste</td>
                          <td className="py-2.5 text-center">{totalBatchUnits}</td>
                          <td className="py-2.5 text-right tabular-nums">
                            {currencySymbol}{(breakdown.totalMaterialCost / Math.max(1, totalBatchUnits)).toFixed(2)}
                          </td>
                          <td className="py-2.5 text-right tabular-nums">{currencySymbol}{breakdown.totalMaterialCost.toFixed(2)}</td>
                        </tr>
                      )}
                      <tr>
                        <td className="py-2.5 text-left font-sans">Power & Electricity ({params.printerWatts}W avg, {params.printHours.toFixed(1)}h)</td>
                        <td className="py-2.5 text-center">{totalBatchUnits}</td>
                        <td className="py-2.5 text-right tabular-nums">
                          {currencySymbol}{(breakdown.electricityCost / Math.max(1, totalBatchUnits)).toFixed(2)}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">{currencySymbol}{breakdown.electricityCost.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 text-left font-sans">Machine Depreciation (Amortized wear, {params.printHours.toFixed(1)}h)</td>
                        <td className="py-2.5 text-center">{totalBatchUnits}</td>
                        <td className="py-2.5 text-right tabular-nums">
                          {currencySymbol}{(breakdown.depreciationCost / Math.max(1, totalBatchUnits)).toFixed(2)}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">{currencySymbol}{breakdown.depreciationCost.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 text-left font-sans">Maintenance, Nozzle Wear & Consumables</td>
                        <td className="py-2.5 text-center">{totalBatchUnits}</td>
                        <td className="py-2.5 text-right tabular-nums">
                          {currencySymbol}{((breakdown.maintenanceCost + breakdown.prepConsumablesCost) / Math.max(1, totalBatchUnits)).toFixed(2)}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">
                          {currencySymbol}{(breakdown.maintenanceCost + breakdown.prepConsumablesCost).toFixed(2)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2.5 text-left font-sans">
                          Finishing & Support Removal ({params.postProcessingMins}m @ {currencySymbol}{params.laborHourlyRate}/hr)
                        </td>
                        <td className="py-2.5 text-center">{breakdown.postProcessingHours.toFixed(2)}h</td>
                        <td className="py-2.5 text-right tabular-nums">
                          {currencySymbol}{(breakdown.postProcessingCost / Math.max(1, totalBatchUnits)).toFixed(2)}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">{currencySymbol}{breakdown.postProcessingCost.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 text-left font-sans text-emerald-400 print:text-emerald-800 font-medium">
                          Quality Assurance & Tolerance Verification ({params.qaInspectionMins || 4}m @ {currencySymbol}{params.laborHourlyRate}/hr)
                        </td>
                        <td className="py-2.5 text-center text-emerald-400 print:text-emerald-800">{breakdown.qaInspectionHours.toFixed(2)}h</td>
                        <td className="py-2.5 text-right tabular-nums text-emerald-400 print:text-emerald-800">
                          {currencySymbol}{(breakdown.qaInspectionCost / Math.max(1, totalBatchUnits)).toFixed(2)}
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-emerald-400 print:text-emerald-800 font-semibold">{currencySymbol}{breakdown.qaInspectionCost.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 text-left font-sans">
                          {breakdown.enablePackaging ? (
                            <span>Packaging Materials & Box Packing ({params.packagingMins}m + {currencySymbol}{params.packagingCostPerUnit}/box)</span>
                          ) : (
                            <span className="text-zinc-500">Protective Packaging (Excluded for client collection)</span>
                          )}
                        </td>
                        <td className="py-2.5 text-center">{breakdown.enablePackaging ? totalBatchUnits : '-'}</td>
                        <td className="py-2.5 text-right tabular-nums">
                          {breakdown.enablePackaging ? `${currencySymbol}${(breakdown.totalPackagingCost / Math.max(1, totalBatchUnits)).toFixed(2)}` : `${currencySymbol}0.00`}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">
                          {breakdown.enablePackaging ? `${currencySymbol}${breakdown.totalPackagingCost.toFixed(2)}` : `${currencySymbol}0.00`}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2.5 text-left font-sans">Workshop Overhead Allocation ({currencySymbol}{params.workshopOverheadPerPrint}/unit)</td>
                        <td className="py-2.5 text-center">{totalBatchUnits}</td>
                        <td className="py-2.5 text-right tabular-nums">
                          {currencySymbol}{(breakdown.workshopOverheadCost / Math.max(1, totalBatchUnits)).toFixed(2)}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">{currencySymbol}{breakdown.workshopOverheadCost.toFixed(2)}</td>
                      </tr>
                      <tr className="text-sky-400 font-semibold">
                        <td className="py-2.5 text-left font-sans">Commercial Margin / Profit ({params.markupPercent}%)</td>
                        <td className="py-2.5 text-center">-</td>
                        <td className="py-2.5 text-right tabular-nums">
                          {currencySymbol}{(breakdown.profitAmount / Math.max(1, totalBatchUnits)).toFixed(2)}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">{currencySymbol}{breakdown.profitAmount.toFixed(2)}</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>

            {/* Totals Summary */}
            <div className="border-t border-zinc-800 print:border-zinc-300 pt-4 flex justify-end">
              <div className="w-64 space-y-2 text-xs font-mono">
                <div className="flex justify-between text-zinc-400 print:text-zinc-600">
                  <span>Subtotal (excl. VAT):</span>
                  <span className="text-white print:text-black">{currencySymbol}{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-zinc-400 print:text-zinc-600">
                  <span>VAT / Tax ({taxRate}%):</span>
                  <span className="text-white print:text-black">{currencySymbol}{taxAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-base font-bold text-emerald-400 print:text-black border-t border-zinc-800 print:border-zinc-300 pt-2">
                  <span>Total (incl. VAT):</span>
                  <span>{currencySymbol}{grandTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[11px] text-zinc-400 print:text-zinc-600 pt-1">
                  <span>Unit Price (incl. VAT):</span>
                  <span>{currencySymbol}{(grandTotal / Math.max(1, totalBatchUnits)).toFixed(2)} / part</span>
                </div>
              </div>
            </div>

            {/* Terms and Notes */}
            <div className="mt-6 pt-4 border-t border-[#3a3a3f] print:border-zinc-300 text-[11px] text-zinc-400 print:text-zinc-600 print-avoid-break">
              <div className="font-medium text-zinc-300 print:text-black mb-1">Production Terms & Delivery:</div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full bg-[#1e1e20] border border-[#45454a] rounded p-2 text-[11px] text-zinc-300 print:hidden focus:border-[#00ae42] focus:outline-hidden"
              />
              <div className="hidden print:block text-zinc-800 leading-relaxed font-sans">{notes}</div>
            </div>

            {/* EFT Banking Details & Order Terms (Structured for PDF export) */}
            <div className="mt-5 p-3.5 rounded border border-[#3a3a3f] print:border-zinc-300 bg-[#1e1e20] print:bg-zinc-100 text-[11px] print-avoid-break">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="font-semibold text-zinc-300 print:text-black flex items-center justify-between gap-1.5 mb-1.5">
                    <span className="flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-[#26b4b0] print:text-zinc-800" />
                      <span>Banking & EFT / Wire Details</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsEditingBankDetails(!isEditingBankDetails)}
                      className="text-[10px] text-[#26b4b0] hover:text-white print:hidden no-print flex items-center gap-1 cursor-pointer font-normal hover:underline"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>{isEditingBankDetails ? 'Save / Done' : 'Edit Bank Details'}</span>
                    </button>
                  </div>

                  {isEditingBankDetails ? (
                    <div className="space-y-2 p-2.5 bg-[#262628] rounded border border-[#45454a] print:hidden no-print">
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div>
                          <label className="block text-zinc-400 text-[9px] mb-0.5">Bank Name</label>
                          <input
                            type="text"
                            value={bankName}
                            onChange={(e) => handleBankNameChange(e.target.value)}
                            placeholder="e.g. Commercial Business Bank"
                            className="w-full bg-[#1e1e20] border border-[#45454a] rounded px-2 py-1 text-xs text-white focus:border-[#00ae42] focus:outline-hidden"
                          />
                        </div>
                        <div>
                          <label className="block text-[#f58220] text-[9px] font-medium mb-0.5">Account Number *</label>
                          <input
                            type="text"
                            value={accountNumber}
                            onChange={(e) => handleAccountNumberChange(e.target.value)}
                            placeholder="e.g. 6289 4028 194"
                            className="w-full bg-[#1e1e20] border border-[#f58220]/70 rounded px-2 py-1 text-xs text-white font-mono font-bold tracking-wider focus:border-[#00ae42] focus:outline-hidden"
                          />
                        </div>
                        <div>
                          <label className="block text-zinc-400 text-[9px] mb-0.5">Account Type</label>
                          <input
                            type="text"
                            value={accountType}
                            onChange={(e) => handleAccountTypeChange(e.target.value)}
                            placeholder="e.g. Business Checking Account"
                            className="w-full bg-[#1e1e20] border border-[#45454a] rounded px-2 py-1 text-xs text-white focus:border-[#00ae42] focus:outline-hidden"
                          />
                        </div>
                        <div>
                          <label className="block text-zinc-400 text-[9px] mb-0.5">Branch / Routing Code</label>
                          <input
                            type="text"
                            value={branchCode}
                            onChange={(e) => handleBranchCodeChange(e.target.value)}
                            placeholder="e.g. 250655 / SWIFT"
                            className="w-full bg-[#1e1e20] border border-[#45454a] rounded px-2 py-1 text-xs text-white font-mono focus:border-[#00ae42] focus:outline-hidden"
                          />
                        </div>
                      </div>
                      <div className="flex justify-between items-center pt-1 border-t border-[#3a3a3f] text-[9px] text-zinc-400">
                        <span>Auto-saved to storage</span>
                        <button
                          type="button"
                          onClick={() => setIsEditingBankDetails(false)}
                          className="px-2 py-0.5 bg-[#00ae42] hover:bg-[#00c44b] text-white rounded-xs text-[10px] font-semibold cursor-pointer"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-0.5 text-zinc-400 print:text-zinc-700 font-mono text-[10px]">
                      <div>Bank: <strong className="text-zinc-200 print:!text-black">{bankName}</strong></div>
                      <div>Account Name: <strong className="text-zinc-200 print:!text-black quote-business-name">{businessName}</strong></div>
                      <div>Account Number: <strong className="text-[#f58220] print:!text-black font-bold tracking-wide">{accountNumber}</strong></div>
                      <div>Account Type: <strong className="text-zinc-200 print:!text-black">{accountType}</strong></div>
                      <div>Branch / Routing: <strong className="text-zinc-200 print:!text-black">{branchCode}</strong></div>
                      <div>Payment Reference: <strong className="text-[#f58220] print:!text-black font-bold">{quoteNumber}</strong></div>
                    </div>
                  )}

                  {/* Clean text always shown on print even if editor is toggled open on screen */}
                  {isEditingBankDetails && (
                    <div className="hidden print:block space-y-0.5 text-zinc-700 font-mono text-[10px]">
                      <div>Bank: <strong className="text-black">{bankName}</strong></div>
                      <div>Account Name: <strong className="text-black quote-business-name">{businessName}</strong></div>
                      <div>Account Number: <strong className="text-black font-bold tracking-wide">{accountNumber}</strong></div>
                      <div>Account Type: <strong className="text-black">{accountType}</strong></div>
                      <div>Branch / Routing: <strong className="text-black">{branchCode}</strong></div>
                      <div>Payment Reference: <strong className="text-black font-bold">{quoteNumber}</strong></div>
                    </div>
                  )}
                </div>
                <div>
                  <div className="font-semibold text-zinc-300 print:text-black flex items-center gap-1.5 mb-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#00c44b] print:text-zinc-800" />
                    <span>Manufacturing & QA Guarantee</span>
                  </div>
                  <p className="text-[10px] text-zinc-400 print:text-zinc-700 leading-relaxed font-sans">
                    Produced to ISO/ASTM 52900 dimensional specifications. 50% deposit required upon quotation approval to schedule print queue; balance payable upon QA verification prior to dispatch.
                  </p>
                </div>
              </div>
            </div>

            {/* Client Acceptance Authorization Sign-off (Clean structured signature block for PDF) */}
            <div className="mt-6 pt-4 border-t border-[#3a3a3f] print:border-zinc-300 text-[11px] print-avoid-break">
              <div className="font-semibold text-zinc-300 print:text-black mb-3">
                Client Acceptance & Manufacturing Authorization:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-[11px]">
                <div className="space-y-2">
                  <div className="border-b border-[#4e4e54] print:border-zinc-400 h-8 flex items-end">
                    <span className="text-zinc-500 print:text-zinc-400 text-[10px] italic">Sign here to accept quote</span>
                  </div>
                  <span className="text-zinc-400 print:text-zinc-600 block text-[10px]">
                    Authorized Signature ({clientName})
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <div className="border-b border-[#4e4e54] print:border-zinc-400 h-8"></div>
                    <span className="text-zinc-400 print:text-zinc-600 block text-[10px]">Print Name</span>
                  </div>
                  <div className="space-y-2">
                    <div className="border-b border-[#4e4e54] print:border-zinc-400 h-8"></div>
                    <span className="text-zinc-400 print:text-zinc-600 block text-[10px]">Date</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Document Print Footer */}
            <div className="hidden print:block mt-6 pt-3 border-t border-zinc-200 text-center text-[9px] text-zinc-700 print:text-black font-mono print-avoid-break">
              Commercial Quotation {quoteNumber} · Issued by {businessName} · LayerCost Additive Manufacturing Platform
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-t border-[#3f3f44] bg-[#1e1e20] no-print">
          <div className="text-xs text-zinc-400 font-mono tabular-nums">
            {totalBatchUnits} unit(s) across {activeFiles.length || 1} file(s) · {params.printHours.toFixed(1)} machine hrs
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopySummary}
              className="px-3 py-1.5 text-xs font-medium text-zinc-200 hover:text-white bg-[#36363a] hover:bg-[#424247] rounded transition-colors flex items-center gap-1.5 border border-[#4e4e54] cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[#00c44b]" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Quote Text'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadInvoiceHtml}
              className="px-3 py-1.5 text-xs font-medium text-zinc-200 hover:text-white bg-[#36363a] hover:bg-[#424247] rounded transition-colors flex items-center gap-1.5 border border-[#4e4e54] cursor-pointer"
              title="Download standalone HTML quotation invoice file that opens and prints in any browser"
            >
              {downloadSuccess ? <Check className="w-3.5 h-3.5 text-[#00c44b]" /> : <Download className="w-3.5 h-3.5 text-[#26b4b0]" />}
              <span>{downloadSuccess ? 'Downloaded!' : 'Download Invoice (HTML)'}</span>
            </button>

            <button
              type="button"
              onClick={exportQuoteAsPdf}
              disabled={isExportingPdf}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-[#00ae42] hover:bg-[#00c44b] rounded transition-colors flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-60"
              title="Export structured quotation as PDF document using window.print() (Ctrl+P)"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{isExportingPdf ? 'Exporting PDF...' : 'Export as PDF'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
