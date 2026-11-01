import * as XLSX from 'xlsx';

export interface SheetData {
  name: string;
  data: Record<string, any>[];
}

/**
 * Generates and downloads a real multi-sheet Excel .xlsx file using SheetJS
 */
export function exportToXLSX(fileName: string, sheets: SheetData[]) {
  const wb = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const ws = XLSX.utils.json_to_sheet(sheet.data);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.substring(0, 31)); // 31 char max
  }

  XLSX.writeFile(wb, fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`);
}
