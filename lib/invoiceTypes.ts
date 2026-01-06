export interface InvoiceRecord {
  [key: string]: string | number | Date | null | undefined;
  'Lesson Date'?: Date | string | null;
  'Client Name'?: string | null;
}

export interface ParsedInvoiceData {
  records: InvoiceRecord[];
  columns: string[];
}

export interface FilterState {
  lessonDate: Date | null;
  clientName: string | null;
}

