import * as XLSX from 'xlsx';
import { InvoiceRecord, ParsedInvoiceData } from './invoiceTypes';

export function parseExcelFile(file: File): Promise<ParsedInvoiceData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Get the first sheet
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to JSON with header row
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
          header: 1,
          defval: null,
          raw: false 
        }) as any[][];
        
        if (jsonData.length === 0) {
          resolve({ records: [], columns: [] });
          return;
        }
        
        // First row is headers
        const headers = jsonData[0].map((h: any) => String(h || '').trim());
        const records: InvoiceRecord[] = [];
        
        // Process data rows
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          const record: InvoiceRecord = {};
          
          headers.forEach((header, index) => {
            let value = row[index];
            
            // Handle Lesson Date column specially
            if (header.toLowerCase().includes('lesson date') || header.toLowerCase().includes('date')) {
              if (value) {
                // Try to parse as date
                const dateValue = parseDate(value);
                record[header] = dateValue;
              } else {
                record[header] = null;
              }
            } else {
              // For other columns, keep as string or number
              record[header] = value !== undefined && value !== null ? value : null;
            }
          });
          
          // Only add non-empty rows
          if (Object.values(record).some(v => v !== null && v !== undefined && v !== '')) {
            records.push(record);
          }
        }
        
        resolve({ records, columns: headers });
      } catch (error) {
        reject(new Error(`Failed to parse Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsArrayBuffer(file);
  });
}

function parseDate(value: any): Date | string | null {
  if (!value) return null;
  
  // If it's already a Date object
  if (value instanceof Date) {
    return value;
  }
  
  // If it's a number (Excel date serial number)
  if (typeof value === 'number') {
    // Excel dates are days since 1900-01-01
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    return date;
  }
  
  // Try to parse as string date
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  
  // Return as string if can't parse
  return String(value);
}

export function parseExcelBuffer(buffer: ArrayBuffer): ParsedInvoiceData {
  try {
    const data = new Uint8Array(buffer);
    const workbook = XLSX.read(data, { type: 'array' });
    
    // Get the first sheet
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    // Convert to JSON with header row
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
      header: 1,
      defval: null,
      raw: false 
    }) as any[][];
    
    if (jsonData.length === 0) {
      return { records: [], columns: [] };
    }
    
    // First row is headers
    const headers = jsonData[0].map((h: any) => String(h || '').trim());
    const records: InvoiceRecord[] = [];
    
    // Process data rows
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      const record: InvoiceRecord = {};
      
      headers.forEach((header, index) => {
        let value = row[index];
        
        // Handle Lesson Date column specially
        if (header.toLowerCase().includes('lesson date') || header.toLowerCase().includes('date')) {
          if (value) {
            // Try to parse as date
            const dateValue = parseDate(value);
            record[header] = dateValue;
          } else {
            record[header] = null;
          }
        } else {
          // For other columns, keep as string or number
          record[header] = value !== undefined && value !== null ? value : null;
        }
      });
      
      // Only add non-empty rows
      if (Object.values(record).some(v => v !== null && v !== undefined && v !== '')) {
        records.push(record);
      }
    }
    
    return { records, columns: headers };
  } catch (error) {
    throw new Error(`Failed to parse Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function combineInvoiceData(dataArrays: ParsedInvoiceData[]): ParsedInvoiceData {
  if (dataArrays.length === 0) {
    return { records: [], columns: [] };
  }
  
  // Get all unique columns from all files
  const allColumns = new Set<string>();
  dataArrays.forEach(data => {
    data.columns.forEach(col => allColumns.add(col));
  });
  
  const combinedColumns = Array.from(allColumns);
  const combinedRecords: InvoiceRecord[] = [];
  
  // Combine all records
  dataArrays.forEach(data => {
    data.records.forEach(record => {
      const combinedRecord: InvoiceRecord = {};
      combinedColumns.forEach(col => {
        combinedRecord[col] = record[col] ?? null;
      });
      combinedRecords.push(combinedRecord);
    });
  });
  
  return {
    records: combinedRecords,
    columns: combinedColumns
  };
}

