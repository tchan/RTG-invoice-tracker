import * as XLSX from 'xlsx';
import { InvoiceRecord, ParsedInvoiceData } from './invoiceTypes';

export function parseExcelFile(file: File): Promise<ParsedInvoiceData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const result = e.target?.result;
        if (!(result instanceof ArrayBuffer)) {
          reject(new Error('Failed to read file as ArrayBuffer'));
          return;
        }
        const parsed = parseExcelBuffer(result);
        resolve(parsed);
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
    const trimmed = value.trim();
    
    // Check for DD/MM/YYYY or DD-MM-YYYY format (always parse as day/month/year)
    // This must be checked FIRST before any other parsing
    const ddmmyyyyPattern = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/;
    const match = trimmed.match(ddmmyyyyPattern);
    
    if (match) {
      const firstPart = parseInt(match[1], 10);
      const secondPart = parseInt(match[2], 10);
      const year = parseInt(match[3], 10);
      
      // Always interpret as DD/MM/YYYY (first part = day, second part = month)
      // Even if it could be MM/DD, we treat it as DD/MM
      const day = firstPart;
      const month = secondPart;
      
      // Validate month range
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const date = new Date(year, month - 1, day);
        // Verify the date is valid (handles cases like 31/02)
        if (!isNaN(date.getTime()) && date.getDate() === day && date.getMonth() === month - 1) {
          return date;
        }
      }
    }
    
    // Check for YYYY-MM-DD or YYYY/MM/DD format (ISO format)
    const yyyymmddPattern = /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/;
    const isoMatch = trimmed.match(yyyymmddPattern);
    
    if (isoMatch) {
      const year = parseInt(isoMatch[1], 10);
      const month = parseInt(isoMatch[2], 10);
      const day = parseInt(isoMatch[3], 10);
      const date = new Date(year, month - 1, day);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
    
    // Don't use standard Date parsing as fallback - it interprets as MM/DD/YYYY
    // If we can't parse it explicitly, return as string
  }
  
  // Return as string if can't parse
  return String(value);
}

function isValidDate(value: any): boolean {
  if (value === null || value === undefined) return false;
  
  // If it's already a Date object
  if (value instanceof Date) {
    return !isNaN(value.getTime());
  }
  
  // If it's a number (Excel date serial number)
  if (typeof value === 'number') {
    // Excel dates are days since 1900-01-01
    // Valid Excel dates are typically between 1 (Jan 1, 1900) and ~50000 (year 2037+)
    if (value < 1 || value > 100000) return false;
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    return !isNaN(date.getTime());
  }
  
  // Try to parse as string date
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return false;
    
    // Try standard Date parsing
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return true;
    }
    
    // Try common date formats that Excel might use
    // DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY, etc.
    const datePatterns = [
      /^\d{1,2}\/\d{1,2}\/\d{4}$/,  // DD/MM/YYYY or MM/DD/YYYY
      /^\d{1,2}-\d{1,2}-\d{4}$/,    // DD-MM-YYYY or MM-DD-YYYY
      /^\d{4}-\d{1,2}-\d{1,2}$/,    // YYYY-MM-DD
      /^\d{4}\/\d{1,2}\/\d{1,2}$/,  // YYYY/MM/DD
    ];
    
    if (datePatterns.some(pattern => pattern.test(trimmed))) {
      // Try parsing with different assumptions
      const parts = trimmed.split(/[\/\-]/);
      if (parts.length === 3) {
        // Try YYYY-MM-DD first (ISO format)
        if (parts[0].length === 4) {
          const testDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
          if (!isNaN(testDate.getTime())) return true;
        }
        // Try DD/MM/YYYY or MM/DD/YYYY
        const testDate1 = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        const testDate2 = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
        if (!isNaN(testDate1.getTime()) || !isNaN(testDate2.getTime())) {
          return true;
        }
      }
    }
  }
  
  return false;
}

export function parseExcelBuffer(buffer: ArrayBuffer): ParsedInvoiceData {
  try {
    const data = new Uint8Array(buffer);
    const workbook = XLSX.read(data, { type: 'array' });
    
    // Get the first sheet
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    // Read as array to access specific rows
    // Use raw: true to get raw values, then we'll parse dates ourselves
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
      header: 1,
      defval: null,
      raw: true,  // Get raw values so we can parse dates ourselves as DD/MM/YYYY
      blankrows: true // Keep blank rows to maintain row numbers
    }) as any[][];
    
    if (jsonData.length === 0) {
      console.log('Excel file is empty');
      return { records: [], columns: [] };
    }
    
    // Auto-detect header row by looking for "Lesson Date" or "Client Name"
    let headerRowIndex = -1;
    const searchTerms = ['lesson date', 'client name'];
    
    // First try row 10 (index 9) as specified
    if (jsonData.length > 9) {
      const row10 = jsonData[9];
      const row10Text = row10.map((cell: any) => String(cell || '').toLowerCase().trim()).join(' ');
      if (searchTerms.some(term => row10Text.includes(term))) {
        headerRowIndex = 9;
      }
    }
    
    // If not found at row 10, search from row 5 to row 15
    if (headerRowIndex === -1) {
      for (let i = 4; i < Math.min(15, jsonData.length); i++) {
        const row = jsonData[i];
        const rowText = row.map((cell: any) => String(cell || '').toLowerCase().trim()).join(' ');
        if (searchTerms.some(term => rowText.includes(term))) {
          headerRowIndex = i;
          break;
        }
      }
    }
    
    if (headerRowIndex === -1) {
      console.log('Could not find header row. First 15 rows:', jsonData.slice(0, 15));
      throw new Error('Could not find header row with "Lesson Date" or "Client Name". Please ensure the column headers are present.');
    }
    
    // Extract headers from the detected row
    const headerRow = jsonData[headerRowIndex];
    const headers = headerRow.map((h: any) => String(h || '').trim()).filter((h: string) => h !== '');
    
    console.log(`Found headers at row ${headerRowIndex + 1}:`, headers);
    
    if (headers.length === 0) {
      console.log('No headers found in row', headerRowIndex + 1);
      return { records: [], columns: [] };
    }
    
    const records: InvoiceRecord[] = [];
    
    // Process data rows starting from the row after headers
    for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      
      // Check Column A (first column, index 0) - must be a valid date
      const columnAValue = row[0];
      const isValid = isValidDate(columnAValue);
      
      // Debug: log the raw value and how it's being parsed
      if (i < headerRowIndex + 5) { // Only log first few rows to avoid spam
        console.log(`Row ${i + 1}, Column A raw value:`, columnAValue, 'Type:', typeof columnAValue);
        if (typeof columnAValue === 'number') {
          const excelEpoch = new Date(1899, 11, 30);
          const dateFromSerial = new Date(excelEpoch.getTime() + columnAValue * 86400000);
          console.log(`  -> Excel serial ${columnAValue} converts to:`, dateFromSerial.toLocaleDateString());
        }
      }
      
      if (!isValid) {
        // Skip this row if Column A is not a valid date
        console.log(`Skipping row ${i + 1} - Column A is not a valid date`);
        continue;
      }
      
      const record: InvoiceRecord = {};
      
      headers.forEach((header, index) => {
        let value = row[index];
        
        // Handle Lesson Date column specially
        if (header.toLowerCase().includes('lesson date') || 
            (header.toLowerCase().includes('date') && !header.toLowerCase().includes('time'))) {
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
      
      // Only add non-empty rows (skip rows that are completely empty or only have totals)
      const hasData = Object.values(record).some(v => v !== null && v !== undefined && v !== '');
      // Also skip rows that look like totals rows (e.g., contain "Total" or "Totals" in first column)
      const isTotalsRow = record[headers[0]] && String(record[headers[0]]).toLowerCase().includes('total');
      
      if (hasData && !isTotalsRow) {
        records.push(record);
      }
    }
    
    console.log(`Parsed ${records.length} records with ${headers.length} columns`);
    
    return { records, columns: headers };
  } catch (error) {
    console.error('Parse error:', error);
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

