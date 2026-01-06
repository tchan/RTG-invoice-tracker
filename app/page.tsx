'use client';

import { useState, useEffect } from 'react';
import FileUpload from '@/components/FileUpload';
import InvoiceTable from '@/components/InvoiceTable';
import InvoiceFilters from '@/components/InvoiceFilters';
import { InvoiceRecord, ParsedInvoiceData, FilterState } from '@/lib/invoiceTypes';

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
    if (files.length === 0) return;

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      files.forEach(file => {
        formData.append('files', file);
      });

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload files');
      }

      const data: ParsedInvoiceData = await response.json();
      
      // Convert date strings back to Date objects
      const processedRecords = data.records.map(record => {
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
      setColumns(data.columns);

      // Save to sessionStorage
      sessionStorage.setItem('invoiceData', JSON.stringify(data));
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

