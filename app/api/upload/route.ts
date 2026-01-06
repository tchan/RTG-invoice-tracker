import { NextRequest, NextResponse } from 'next/server';
import { parseExcelBuffer, combineInvoiceData } from '@/lib/excelParser';
import { ParsedInvoiceData } from '@/lib/invoiceTypes';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    
    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      );
    }
    
    // Parse all Excel files
    const parsePromises = files.map(async (file) => {
      const arrayBuffer = await file.arrayBuffer();
      return parseExcelBuffer(arrayBuffer);
    });
    const parsedDataArrays = await Promise.all(parsePromises);
    
    // Log parsing results for debugging
    console.log('Parsed files:', parsedDataArrays.map((data, idx) => ({
      fileIndex: idx,
      columns: data.columns,
      recordCount: data.records.length
    })));
    
    // Combine all data
    const combinedData = combineInvoiceData(parsedDataArrays);
    
    console.log('Combined data:', {
      totalColumns: combinedData.columns.length,
      totalRecords: combinedData.records.length,
      columns: combinedData.columns
    });
    
    // Convert dates to ISO strings for JSON serialization
    const serializedData: ParsedInvoiceData = {
      records: combinedData.records.map(record => {
        const serialized: any = {};
        Object.keys(record).forEach(key => {
          const value = record[key];
          if (value instanceof Date) {
            serialized[key] = value.toISOString();
          } else {
            serialized[key] = value;
          }
        });
        return serialized;
      }),
      columns: combinedData.columns,
      totalAmount: combinedData.totalAmount
    };
    
    return NextResponse.json(serializedData);
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process files' },
      { status: 500 }
    );
  }
}

