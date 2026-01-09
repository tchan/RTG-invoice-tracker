import { NextRequest, NextResponse } from 'next/server';
import {
  getAllInvoices,
  deleteFile,
  replaceFile,
  mergeFile,
  getFileByFilename
} from '@/lib/database';
import { computeFileHash } from '@/lib/fileHash';
import { InvoiceRecord, ParsedInvoiceData } from '@/lib/invoiceTypes';

function serializeRecord(record: InvoiceRecord): InvoiceRecord {
  const serialized: InvoiceRecord = {};
  Object.keys(record).forEach(key => {
    const value = record[key];
    if (value instanceof Date) {
      serialized[key] = value.toISOString();
    } else {
      serialized[key] = value;
    }
  });
  return serialized;
}

export async function GET() {
  try {
    const { files, records, columns, totalAmount } = getAllInvoices();

    // Serialize dates in records
    const serializedRecords = records.map(serializeRecord);

    return NextResponse.json({
      files,
      records: serializedRecords,
      columns,
      totalAmount
    });
  } catch (error) {
    console.error('Error loading invoices:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load invoices' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { fileId } = await request.json();

    if (!fileId) {
      return NextResponse.json(
        { error: 'File ID is required' },
        { status: 400 }
      );
    }

    deleteFile(fileId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting file:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete file' },
      { status: 500 }
    );
  }
}

// Handle replace/merge operations for diff conflicts
export async function PUT(request: NextRequest) {
  try {
    const { action, fileId, filename, newData } = await request.json();

    if (!action || !fileId || !filename || !newData) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Deserialize dates in newData.records
    const deserializedData: ParsedInvoiceData = {
      records: newData.records.map((record: InvoiceRecord) => {
        const deserialized: InvoiceRecord = {};
        Object.keys(record).forEach(key => {
          const value = record[key];
          if (typeof value === 'string' && key.toLowerCase().includes('date')) {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
              deserialized[key] = date;
            } else {
              deserialized[key] = value;
            }
          } else {
            deserialized[key] = value;
          }
        });
        return deserialized;
      }),
      columns: newData.columns,
      totalAmount: newData.totalAmount
    };

    // Generate a new content hash for the updated data
    const contentHash = computeFileHash(
      new TextEncoder().encode(JSON.stringify(deserializedData))
    );

    let newFileId: number;

    if (action === 'replace') {
      newFileId = replaceFile(fileId, filename, contentHash, deserializedData);
    } else if (action === 'merge') {
      newFileId = mergeFile(fileId, filename, contentHash, deserializedData);
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "replace" or "merge"' },
        { status: 400 }
      );
    }

    // Return updated invoice list
    const { files, records, columns, totalAmount } = getAllInvoices();
    const serializedRecords = records.map(serializeRecord);

    return NextResponse.json({
      success: true,
      newFileId,
      files,
      records: serializedRecords,
      columns,
      totalAmount
    });
  } catch (error) {
    console.error('Error updating file:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update file' },
      { status: 500 }
    );
  }
}
