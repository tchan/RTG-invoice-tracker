export interface InvoiceRecord {
  [key: string]: string | number | Date | null | undefined;
  'Lesson Date'?: Date | string | null;
  'Client Name'?: string | null;
}

export interface ParsedInvoiceData {
  records: InvoiceRecord[];
  columns: string[];
  totalAmount?: number; // Sum of J2:J3 values
  fileName?: string; // Optional filename for tracking
}

export interface FilterState {
  lessonDate: Date | null;
  clientName: string | null;
}

