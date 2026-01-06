'use client';

import { useState, useEffect } from 'react';
import FileUpload from '@/components/FileUpload';
import InvoiceTable from '@/components/InvoiceTable';
import InvoiceFilters from '@/components/InvoiceFilters';
import { InvoiceRecord, ParsedInvoiceData, FilterState } from '@/lib/invoiceTypes';
import { combineInvoiceData } from '@/lib/excelParser';

export default function Home() {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    lessonDate: null,
    clientName: null,
  });
  const [error, setError] = useState<string | null>(null);

  // Load data from sessionStorage on mount
  useEffect(() => {
    const storedData = sessionStorage.getItem('invoiceData');
    if (storedData) {
      try {
        const parsed: ParsedInvoiceData = JSON.parse(storedData);
        // Convert date strings back to Date objects
        const processedRecords = parsed.records.map(record => {
          const processed: InvoiceRecord = {};
          Object.keys(record).forEach(key => {
            const value = record[key];
            // Check if it's a date string (ISO format)
            if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T/)) {
              processed[key] = new Date(value);
            } else {
              processed[key] = value;
            }
          });
          return processed;
        });
        setInvoices(processedRecords);
        setColumns(parsed.columns);
      } catch (err) {
        console.error('Failed to load data from sessionStorage:', err);
      }
    }
  }, []);

  const handleFilesSelected = async (files: File[]) => {
    console.log('handleFilesSelected called with', files.length, 'files');
    
    if (files.length === 0) {
      console.warn('No files provided');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      console.log('Creating FormData and uploading files...');
      const formData = new FormData();
      files.forEach((file, index) => {
        console.log(`Adding file ${index + 1}:`, file.name, file.size, 'bytes');
        formData.append('files', file);
      });

      console.log('Sending request to /api/upload');
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      console.log('Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Upload failed:', errorData);
        throw new Error(errorData.error || 'Failed to upload files');
      }

      console.log('Parsing response JSON...');
      const newData: ParsedInvoiceData = await response.json();
      console.log('=== UPLOAD DATA RECEIVED ===');
      console.log('Records:', newData.records.length, '| Columns:', newData.columns.length);
      console.log('Columns:', newData.columns);
      
      // Log first few records with their raw date values
      if (newData.records.length > 0) {
        console.log('\n=== FIRST 3 RECORDS (RAW DATA) ===');
        newData.records.slice(0, 3).forEach((record, idx) => {
          console.log(`Record ${idx + 1}:`, record);
          // Find date column
          const dateKey = Object.keys(record).find(
            key => key.toLowerCase().includes('lesson date') || key.toLowerCase().includes('date')
          );
          if (dateKey) {
            console.log(`  ${dateKey}:`, record[dateKey], '(type:', typeof record[dateKey], ')');
          }
        });
      }
      
      // Convert date strings back to Date objects for new data
      const processedNewRecords = newData.records.map((record, recordIndex) => {
        const processed: InvoiceRecord = {};
        Object.keys(record).forEach(key => {
          const value = record[key];
          // Check if it's a date string (ISO format)
          if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T/)) {
            const dateObj = new Date(value);
            // Log date parsing for Lesson Date column (first few records)
            if (recordIndex < 5 && (key.toLowerCase().includes('lesson date') || key.toLowerCase().includes('date'))) {
              console.log(`Record ${recordIndex + 1}, ${key}:`, {
                originalString: value,
                parsedDate: dateObj.toLocaleDateString('en-GB'), // DD/MM/YYYY format
                isoString: dateObj.toISOString(),
                day: dateObj.getDate(),
                month: dateObj.getMonth() + 1,
                year: dateObj.getFullYear()
              });
            }
            processed[key] = dateObj;
          } else {
            processed[key] = value;
          }
        });
        return processed;
      });
      
      // Log sample of first record
      if (processedNewRecords.length > 0) {
        console.log('Sample processed record (first record):', processedNewRecords[0]);
        const lessonDateKey = Object.keys(processedNewRecords[0]).find(
          key => key.toLowerCase().includes('lesson date') || key.toLowerCase().includes('date')
        );
        if (lessonDateKey) {
          const dateValue = processedNewRecords[0][lessonDateKey];
          if (dateValue instanceof Date) {
            console.log(`First record ${lessonDateKey}:`, {
              dateObject: dateValue,
              display: dateValue.toLocaleDateString('en-GB'),
              day: dateValue.getDate(),
              month: dateValue.getMonth() + 1,
              year: dateValue.getFullYear()
            });
          }
        }
      }

      // Combine with existing data
      const existingData: ParsedInvoiceData = {
        records: invoices,
        columns: columns
      };
      
      const newDataForCombining: ParsedInvoiceData = {
        records: processedNewRecords,
        columns: newData.columns
      };

      // Combine new data with existing data
      const combinedData = combineInvoiceData([existingData, newDataForCombining]);
      
      console.log('Combined data:', combinedData.records.length, 'total records,', combinedData.columns.length, 'columns');

      // Convert dates to ISO strings for sessionStorage
      const dataForStorage: ParsedInvoiceData = {
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
        columns: combinedData.columns
      };

      setInvoices(combinedData.records);
      setColumns(combinedData.columns);

      // Save combined data to sessionStorage
      sessionStorage.setItem('invoiceData', JSON.stringify(dataForStorage));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while uploading files');
      console.error('Upload error:', err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleClearData = () => {
    setInvoices([]);
    setColumns([]);
    setFilters({ lessonDate: null, clientName: null });
    sessionStorage.removeItem('invoiceData');
  };

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">RTG Invoice Tracker</h1>
          <p className="text-gray-600">
            Upload multiple Excel invoice spreadsheets and view them combined with filtering options.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            <p className="font-medium">Error:</p>
            <p>{error}</p>
          </div>
        )}

        <div className="mb-6">
          <FileUpload onFilesSelected={handleFilesSelected} isUploading={isUploading} />
        </div>

        {invoices.length > 0 && (
          <>
            <div className="mb-4 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">Invoice Data</h2>
              <button
                onClick={handleClearData}
                className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                Clear Data
              </button>
            </div>

            <InvoiceFilters
              invoices={invoices}
              filters={filters}
              onFiltersChange={setFilters}
            />

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <InvoiceTable invoices={invoices} columns={columns} filters={filters} />
            </div>
          </>
        )}

        {invoices.length === 0 && !isUploading && (
          <div className="text-center py-12 text-gray-500">
            <p>No invoices loaded. Upload Excel files to get started.</p>
          </div>
        )}
      </div>
    </main>
  );
}

