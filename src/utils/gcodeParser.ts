import { GcodeMetadata } from '../types/calculator';

/**
 * Robust G-code parser supporting Cura, PrusaSlicer, Bambu Studio, OrcaSlicer,
 * SuperSlicer, IdeaMaker, Simplify3D, and generic RepRap/Klipper G-code.
 */
export async function parseGcodeFile(file: File): Promise<GcodeMetadata> {
  const fileSizeBytes = file.size;
  const fileName = file.name;

  // To handle large files (e.g. 50MB - 200MB) without memory exhaustion,
  // we read the first 256KB and last 256KB for metadata comments,
  // and sample a chunk from the middle for toolpath visualization if needed.
  const headerSlice = await readFileSlice(file, 0, Math.min(fileSizeBytes, 262144));
  let footerSlice = '';
  if (fileSizeBytes > 262144) {
    const footerStart = Math.max(0, fileSizeBytes - 262144);
    footerSlice = await readFileSlice(file, footerStart, fileSizeBytes);
  }

  const combinedHeaderFooter = headerSlice + '\n' + footerSlice;

  // Extract Slicer Origin
  let slicer = 'Generic G-Code';
  if (/BambuStudio/i.test(combinedHeaderFooter)) {
    const match = combinedHeaderFooter.match(/BambuStudio\s+([\w\.\-]+)/i);
    slicer = match ? `Bambu Studio ${match[1]}` : 'Bambu Studio';
  } else if (/OrcaSlicer/i.test(combinedHeaderFooter)) {
    const match = combinedHeaderFooter.match(/OrcaSlicer\s+([\w\.\-]+)/i);
    slicer = match ? `OrcaSlicer ${match[1]}` : 'OrcaSlicer';
  } else if (/PrusaSlicer/i.test(combinedHeaderFooter)) {
    const match = combinedHeaderFooter.match(/PrusaSlicer\s+([\w\.\-]+)/i);
    slicer = match ? `PrusaSlicer ${match[1]}` : 'PrusaSlicer';
  } else if (/SuperSlicer/i.test(combinedHeaderFooter)) {
    const match = combinedHeaderFooter.match(/SuperSlicer\s+([\w\.\-]+)/i);
    slicer = match ? `SuperSlicer ${match[1]}` : 'SuperSlicer';
  } else if (/Cura_SteamEngine/i.test(combinedHeaderFooter) || /Cura/i.test(combinedHeaderFooter)) {
    const match = combinedHeaderFooter.match(/Cura_SteamEngine\s+([\w\.\-]+)/i) || combinedHeaderFooter.match(/UltiMaker\s+Cura\s+([\w\.\-]+)/i);
    slicer = match ? `UltiMaker Cura ${match[1]}` : 'UltiMaker Cura';
  } else if (/Simplify3D/i.test(combinedHeaderFooter)) {
    const match = combinedHeaderFooter.match(/Simplify3D\(R\)\s+Software\s+Version\s+([\w\.\-]+)/i);
    slicer = match ? `Simplify3D ${match[1]}` : 'Simplify3D';
  } else if (/ideaMaker/i.test(combinedHeaderFooter)) {
    slicer = 'Raise3D ideaMaker';
  }

  // 1. Parse Print Time
  let printTimeSeconds = 0;

  // Cura format: ;TIME:1234
  const curaTimeMatch = combinedHeaderFooter.match(/;TIME:(\d+)/i);
  if (curaTimeMatch) {
    printTimeSeconds = parseInt(curaTimeMatch[1], 10);
  }

  // Prusa / Orca / Bambu format:
  // ; estimated printing time (normal mode) = 1h 23m 45s
  // ; estimated printing time = 1h 23m 45s
  // ; total estimated time: 1h 23m 45s
  if (!printTimeSeconds) {
    const timeRegexes = [
      /;\s*(?:estimated printing time(?: \(normal mode\))?|total estimated time)\s*(?:=|:)\s*([^\r\n]+)/i,
      /;\s*Build time:\s*([^\r\n]+)/i,
      /;\s*Print Time:\s*([^\r\n]+)/i,
    ];

    for (const rx of timeRegexes) {
      const match = combinedHeaderFooter.match(rx);
      if (match) {
        const raw = match[1].trim();
        printTimeSeconds = parseTimeStringToSeconds(raw);
        if (printTimeSeconds > 0) break;
      }
    }
  }

  // 2. Parse Filament Usage (Grams, Meters, Volume)
  let filamentGrams = 0;
  let filamentMeters = 0;
  let filamentVolumeCm3 = 0;
  let filamentType: string | undefined;

  // Prusa/Orca/Bambu: ; filament used [g] = 12.34 or ; filament used [g] = 12.34, 4.56 or ; total filament used [g] = 12.34
  let multiFilaments: { slot: number; grams: number; type?: string; colorHex?: string }[] | undefined;
  
  // Extract filament types array (e.g. ; filament_type = PLA;PETG;PVA or PLA, PETG)
  const typesMatch = combinedHeaderFooter.match(/;\s*filament_type\s*=\s*([^\r\n]+)/i);
  const typesList = typesMatch ? typesMatch[1].split(/[,;]/).map(s => s.trim().toUpperCase()).filter(Boolean) : [];
  if (typesList.length > 0) {
    filamentType = typesList[0];
  }

  // Extract filament colors array (e.g. ; filament_colour = #FF8000;#000000)
  const colorsMatch = combinedHeaderFooter.match(/;\s*filament_colou?r\s*=\s*([^\r\n]+)/i);
  const colorsList = colorsMatch ? colorsMatch[1].split(/[,;]/).map(s => s.trim()).filter(Boolean) : [];

  const multiGramsMatch = combinedHeaderFooter.match(/;\s*(?:filament used \[g\]|total filament used \[g\])\s*=\s*([0-9\.,\s]+)/i);
  if (multiGramsMatch) {
    const rawGrams = multiGramsMatch[1].split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
    if (rawGrams.length > 1) {
      multiFilaments = rawGrams.map((grams, idx) => ({
        slot: idx + 1,
        grams: Math.round(grams * 10) / 10,
        type: typesList[idx] || (typesList[0] || 'PLA'),
        colorHex: colorsList[idx] || undefined,
      }));
      filamentGrams = rawGrams.reduce((a, b) => a + b, 0);
    } else if (rawGrams.length === 1) {
      filamentGrams = rawGrams[0];
    }
  }

  // Prusa/Orca: ; filament used [cm3] = 10.4
  const totalVolMatch = combinedHeaderFooter.match(/;\s*(?:total )?filament used \[cm3\]\s*=\s*([\d\.]+)/i);
  if (totalVolMatch) {
    filamentVolumeCm3 = parseFloat(totalVolMatch[1]);
  }

  // Prusa/Orca: ; filament used [mm] = 4500 or [m] = 4.5
  const mmMatch = combinedHeaderFooter.match(/;\s*(?:total )?filament used \[mm\]\s*=\s*([\d\.]+)/i);
  const mMatch = combinedHeaderFooter.match(/;\s*(?:total )?filament used \[m\]\s*=\s*([\d\.]+)/i);
  if (mMatch) {
    filamentMeters = parseFloat(mMatch[1]);
  } else if (mmMatch) {
    filamentMeters = parseFloat(mmMatch[1]) / 1000.0;
  }

  // Cura format: ;Filament used: 3.45m or ;Filament used: 3.45m, 0.00m
  const curaFilamentMatch = combinedHeaderFooter.match(/;Filament used:\s*([\d\.,\s]+)m/i);
  if (curaFilamentMatch && filamentMeters === 0) {
    const rawValues = curaFilamentMatch[1].split(',').map((s) => parseFloat(s.trim()) || 0);
    filamentMeters = rawValues.reduce((a, b) => a + b, 0);
  }

  // If meters known but grams unknown: approximate for standard 1.75mm PLA (volume = pi * r^2 * length = ~2.405 cm3/m; at 1.24g/cm3 = ~2.98g/m)
  if (filamentGrams === 0 && filamentMeters > 0) {
    filamentVolumeCm3 = filamentMeters * 2.405;
    filamentGrams = filamentVolumeCm3 * 1.24;
  } else if (filamentVolumeCm3 === 0 && filamentGrams > 0) {
    filamentVolumeCm3 = filamentGrams / 1.24;
    filamentMeters = filamentVolumeCm3 / 2.405;
  }

  // 3. Layer Count and Layer Height
  let layerCount = 0;
  let layerHeightMm = 0.2;

  const layerCountMatch =
    combinedHeaderFooter.match(/;LAYER_COUNT:(\d+)/i) ||
    combinedHeaderFooter.match(/; total layer number:\s*(\d+)/i) ||
    combinedHeaderFooter.match(/; total layers:\s*(\d+)/i);
  if (layerCountMatch) {
    layerCount = parseInt(layerCountMatch[1], 10);
  }

  const layerHeightMatch =
    combinedHeaderFooter.match(/;Layer height:\s*([\d\.]+)/i) ||
    combinedHeaderFooter.match(/; layer_height\s*=\s*([\d\.]+)/i);
  if (layerHeightMatch) {
    layerHeightMm = parseFloat(layerHeightMatch[1]);
  }

  // 4. Temperatures & Filament Type
  let bedTempC: number | undefined;
  let nozzleTempC: number | undefined;

  const bedMatch = combinedHeaderFooter.match(/;\s*(?:bed_temperature|first_layer_bed_temperature)\s*=\s*(\d+)/i);
  if (bedMatch) bedTempC = parseInt(bedMatch[1], 10);

  const nozzleMatch = combinedHeaderFooter.match(/;\s*(?:temperature|first_layer_temperature|nozzle_temperature)\s*=\s*(\d+)/i);
  if (nozzleMatch) nozzleTempC = parseInt(nozzleMatch[1], 10);

  if (!filamentType) {
    const singleTypeMatch = combinedHeaderFooter.match(/;\s*filament_type\s*=\s*([A-Za-z0-9_\-]+)/i);
    if (singleTypeMatch) filamentType = singleTypeMatch[1].toUpperCase();
  }

  // 5. Bounding Box & Dimensions Extraction
  // Parse G-code coordinates from sample slice to compute bounds, layer count, and extrusion
  const sampleText = await readFileSlice(file, 0, Math.min(fileSizeBytes, 1048576));
  const { dimensions, fallbackLayers, fallbackExtrusionMm } = extractDimensionsAndStats(sampleText);

  if (layerCount === 0 && fallbackLayers > 0) {
    layerCount = fallbackLayers;
  }

  // If filament usage was not found in comments, estimate from fallback extrusion
  if (filamentGrams === 0 && fallbackExtrusionMm > 0) {
    // Extruded length (scaled up if sample was partial)
    const scaleFactor = fileSizeBytes > 1048576 ? fileSizeBytes / 1048576 : 1.0;
    const estMeters = (fallbackExtrusionMm / 1000.0) * scaleFactor;
    filamentMeters = estMeters;
    filamentVolumeCm3 = estMeters * 2.405;
    filamentGrams = filamentVolumeCm3 * 1.24;
  }

  // Fallback print time estimate if completely missing
  if (printTimeSeconds === 0) {
    if (filamentGrams > 0) {
      // Rough average of 25g/hour on standard prints
      printTimeSeconds = Math.round((filamentGrams / 25.0) * 3600);
    } else if (layerCount > 0) {
      printTimeSeconds = layerCount * 45; // ~45s per layer
    } else {
      printTimeSeconds = 3600; // default 1h
    }
  }

  return {
    fileName,
    fileSizeBytes,
    slicer,
    printTimeSeconds,
    printTimeFormatted: formatSecondsToHms(printTimeSeconds),
    filamentGrams: Math.round(filamentGrams * 10) / 10,
    filamentMeters: Math.round(filamentMeters * 10) / 10,
    filamentVolumeCm3: Math.round(filamentVolumeCm3 * 10) / 10,
    layerCount: Math.max(1, layerCount),
    layerHeightMm,
    bedTempC,
    nozzleTempC,
    filamentType,
    dimensions,
    multiFilaments,
  };
}

function parseTimeStringToSeconds(str: string): number {
  let seconds = 0;
  // Match patterns like "1d 2h 3m 4s", "3h 45m", "45m 12s", "1200s", "01:23:45"
  const colonMatch = str.match(/(\d{1,2}):(\d{2}):(\d{2})/);
  if (colonMatch) {
    return parseInt(colonMatch[1], 10) * 3600 + parseInt(colonMatch[2], 10) * 60 + parseInt(colonMatch[3], 10);
  }

  const d = (str.match(/(\d+)\s*d/i) || [0, 0])[1];
  const h = (str.match(/(\d+)\s*h/i) || [0, 0])[1];
  const m = (str.match(/(\d+)\s*m(?:in)?/i) || [0, 0])[1];
  const s = (str.match(/(\d+)\s*s(?:ec)?/i) || [0, 0])[1];

  seconds =
    (parseInt(d as string, 10) || 0) * 86400 +
    (parseInt(h as string, 10) || 0) * 3600 +
    (parseInt(m as string, 10) || 0) * 60 +
    (parseInt(s as string, 10) || 0);

  if (seconds === 0) {
    const rawNum = parseFloat(str);
    if (!isNaN(rawNum) && rawNum > 0) {
      seconds = Math.round(rawNum);
    }
  }

  return seconds;
}

export function formatSecondsToHms(totalSecs: number): string {
  const d = Math.floor(totalSecs / 86400);
  const h = Math.floor((totalSecs % 86400) / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = Math.floor(totalSecs % 60);

  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0 || d > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  parts.push(`${s.toString().padStart(2, '0')}s`);

  return parts.join(' ');
}

function extractDimensionsAndStats(text: string): {
  dimensions: GcodeMetadata['dimensions'];
  fallbackLayers: number;
  fallbackExtrusionMm: number;
} {
  let minX = Infinity,
    maxX = -Infinity;
  let minY = Infinity,
    maxY = -Infinity;
  let minZ = Infinity,
    maxZ = -Infinity;

  let currentX = 0,
    currentY = 0,
    currentZ = 0;
  let lastE = 0;
  let totalExtrudedE = 0;
  let layerIndex = 0;
  let lastLayerZ = -1;

  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith(';')) continue;

    if (line.startsWith('G0') || line.startsWith('G1')) {
      const xMatch = line.match(/X([\d\.\-]+)/);
      const yMatch = line.match(/Y([\d\.\-]+)/);
      const zMatch = line.match(/Z([\d\.\-]+)/);
      const eMatch = line.match(/E([\d\.\-]+)/);

      if (xMatch) currentX = parseFloat(xMatch[1]);
      if (yMatch) currentY = parseFloat(yMatch[1]);
      if (zMatch) {
        currentZ = parseFloat(zMatch[1]);
        if (currentZ !== lastLayerZ && currentZ > 0) {
          layerIndex++;
          lastLayerZ = currentZ;
        }
      }

      if (eMatch) {
        const eVal = parseFloat(eMatch[1]);
        if (eVal > lastE) {
          totalExtrudedE += eVal - lastE;
        }
        lastE = eVal;
      }

      // Update bounds for valid positive coordinates
      if (currentX !== 0 && currentY !== 0) {
        if (currentX < minX) minX = currentX;
        if (currentX > maxX) maxX = currentX;
        if (currentY < minY) minY = currentY;
        if (currentY > maxY) maxY = currentY;
        if (currentZ < minZ) minZ = currentZ;
        if (currentZ > maxZ) maxZ = currentZ;
      }
    } else if (line.startsWith('G92') && line.includes('E0')) {
      lastE = 0;
    }
  }

  const validBounds =
    minX !== Infinity && maxX !== -Infinity && minY !== Infinity && maxY !== -Infinity;

  const dimensions = validBounds
    ? {
        width: Math.max(1, Math.round((maxX - minX) * 10) / 10),
        depth: Math.max(1, Math.round((maxY - minY) * 10) / 10),
        height: Math.max(0.2, Math.round(((maxZ !== -Infinity ? maxZ : 20) - (minZ !== Infinity ? minZ : 0)) * 10) / 10),
        minX: Math.round(minX * 10) / 10,
        maxX: Math.round(maxX * 10) / 10,
        minY: Math.round(minY * 10) / 10,
        maxY: Math.round(maxY * 10) / 10,
        minZ: Math.round((minZ !== Infinity ? minZ : 0) * 10) / 10,
        maxZ: Math.round((maxZ !== -Infinity ? maxZ : 20) * 10) / 10,
      }
    : {
        width: 60,
        depth: 60,
        height: 40,
        minX: 98,
        maxX: 158,
        minY: 98,
        maxY: 158,
        minZ: 0,
        maxZ: 40,
      };

  return {
    dimensions,
    fallbackLayers: Math.max(1, layerIndex),
    fallbackExtrusionMm: totalExtrudedE,
  };
}

function readFileSlice(file: File, start: number, end: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const slice = file.slice(start, end);
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(slice);
  });
}
