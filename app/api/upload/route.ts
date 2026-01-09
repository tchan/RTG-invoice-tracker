import { NextRequest, NextResponse } from 'next/server';
import { parseExcelBuffer } from '@/lib/excelParser';
import { ParsedInvoiceData, InvoiceRecord } from '@/lib/invoiceTypes';
import { computeFileHash } from '@/lib/fileHash';
import {
  getFileByHash,
  getFileByFilename,
  saveInvoiceData,
  compareFileData,
  DiffResult
} from '@/lib/database';

export interface UploadResponse {
  status: 'success' | 'duplicate' | 'diff';
  data?: ParsedInvoiceData;
  message?: string;
  duplicateInfo?: {
    filename: string;
    uploadedAt: string;
  };
  diffInfo?: {
    filename: string;
    existingFileId: number;
    diff: DiffResult;
    newData: ParsedInvoiceData;
  };
}

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

function serializeData(data: ParsedInvoiceData): ParsedInvoiceData {
  return {
    records: data.records.map(serializeRecord),
    columns: data.columns,
    totalAmount: data.totalAmount
  };
}

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

    // Process each file individually
    const responses: UploadResponse[] = [];

    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const contentHash = computeFileHash(arrayBuffer);

      // Check if this exact file has been uploaded before
      const existingByHash = getFileByHash(contentHash);
      if (existingByHash) {
        responses.push({
          status: 'duplicate',
          message: `File "${file.name}" was already uploaded on ${new Date(existingByHash.uploaded_at).toLocaleDateString()}`,
          duplicateInfo: {
            filename: existingByHash.filename,
            uploadedAt: existingByHash.uploaded_at
          }
        });
        continue;
      }

      // Parse the Excel file
      const parsedData = parseExcelBuffer(arrayBuffer);
      parsedData.fileName = file.name;

      // Check if a file with the same name exists (but different content)
      const existingByName = getFileByFilename(file.name);
      if (existingByName) {
        // File with same name but different content - show diff
        const diff = compareFileData(existingByName.id, parsedData);

        if (diff.added.length > 0 || diff.removed.length > 0 || diff.modified.length > 0) {
          responses.push({
            status: 'diff',
            message: `File "${file.name}" has different content than the previously uploaded version`,
            diffInfo: {
              filename: file.name,
              existingFileId: existingByName.id,
              diff: {
                added: diff.added.map(serializeRecord),
                removed: diff.removed.map(serializeRecord),
                modified: diff.modified.map(m => ({
                  old: serializeRecord(m.old),
                  new: serializeRecord(m.new)
                })),
                unchanged: diff.unchanged
              },
              newData: serializeData(parsedData)
            }
          });
          continue;
        }
      }

      // New file - save to database
      saveInvoiceData(file.name, contentHash, parsedData);

      responses.push({
        status: 'success',
        data: serializeData(parsedData),
        message: `File "${file.name}" uploaded successfully`
      });
    }

    // Log results
    console.log('Upload results:', responses.map(r => ({
      status: r.status,
      message: r.message
    })));

    return NextResponse.json({ results: responses });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process files' },
      { status: 500 }
    );
  }
}
