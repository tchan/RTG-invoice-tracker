'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import FileUpload from '@/components/FileUpload';
import InvoiceTable from '@/components/InvoiceTable';
import InvoiceFilters from '@/components/InvoiceFilters';
import ClientAddressManager from '@/components/ClientAddressManager';
import { InvoiceRecord, ParsedInvoiceData, FilterState } from '@/lib/invoiceTypes';
import { calculateRoutesForInvoices } from '@/lib/routePlanner';
import { getHomeAddress, getClientAddress, loadAddressesFromDb } from '@/lib/addressStorage';
import { calculateDistance } from '@/lib/distanceCalculator';
import { UploadResponse } from './api/upload/route';
import { DiffResult } from '@/lib/database';
import * as XLSX from 'xlsx';

interface DiffModalState {
  isOpen: boolean;
  filename: string;
  existingFileId: number;
  diff: DiffResult;
  newData: ParsedInvoiceData;
}

export default function Home() {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [invoicesWithDistances, setInvoicesWithDistances] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCalculatingDistances, setIsCalculatingDistances] = useState(false);
  const [showAddressManager, setShowAddressManager] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    lessonDate: null,
    clientName: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<string[]>([]);
  const [diffModal, setDiffModal] = useState<DiffModalState | null>(null);

  // Load data from database on mount
  useEffect(() => {
    const initializeData = async () => {
      // Load addresses from database first (to populate localStorage)
      await loadAddressesFromDb();
      // Then load invoices
      await loadInvoicesFromDatabase();
    };
    initializeData();
  }, []);

  const loadInvoicesFromDatabase = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/invoices');
      if (!response.ok) {
        throw new Error('Failed to load invoices');
      }

      const data = await response.json();

      if (data.records && data.records.length > 0) {
        // Convert date strings back to Date objects
        const processedRecords = data.records.map((record: InvoiceRecord) => {
          const processed: InvoiceRecord = {};
          Object.keys(record).forEach(key => {
            const value = record[key];
            if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T/)) {
              processed[key] = new Date(value);
            } else {
              processed[key] = value;
            }
          });
          return processed;
        });

        setInvoices(processedRecords);
        setColumns(data.columns || []);
        setTotalAmount(data.totalAmount || 0);

        // Calculate distances if home address is set
        const homeAddress = getHomeAddress();
        if (homeAddress && processedRecords.length > 0) {
          setIsCalculatingDistances(true);
          try {
            const invoicesWithKm = await calculateRoutesForInvoices(processedRecords);
            setInvoicesWithDistances(invoicesWithKm);
          } catch (err) {
            console.error('Error calculating distances:', err);
            setInvoicesWithDistances(processedRecords.map((inv: InvoiceRecord) => ({ ...inv, kilometers: 0 })));
          } finally {
            setIsCalculatingDistances(false);
          }
        } else {
          setInvoicesWithDistances(processedRecords.map((inv: InvoiceRecord) => ({ ...inv, kilometers: 0 })));
        }
      }
    } catch (err) {
      console.error('Failed to load invoices from database:', err);
      setError('Failed to load saved invoices');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFilesSelected = async (files: File[]) => {
    if (files.length === 0) return;

    setIsUploading(true);
    setError(null);
    setNotifications([]);

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

      const { results } = await response.json() as { results: UploadResponse[] };

      const newNotifications: string[] = [];
      let hasNewData = false;

      for (const result of results) {
        if (result.status === 'duplicate') {
          newNotifications.push(result.message || 'Duplicate file detected');
        } else if (result.status === 'diff' && result.diffInfo) {
          // Show diff modal for this file
          setDiffModal({
            isOpen: true,
            filename: result.diffInfo.filename,
            existingFileId: result.diffInfo.existingFileId,
            diff: result.diffInfo.diff,
            newData: result.diffInfo.newData
          });
        } else if (result.status === 'success') {
          newNotifications.push(result.message || 'File uploaded successfully');
          hasNewData = true;
        }
      }

      setNotifications(newNotifications);

      // Reload data from database if any new files were added
      if (hasNewData) {
        await loadInvoicesFromDatabase();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while uploading files');
      console.error('Upload error:', err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDiffAction = async (action: 'replace' | 'merge' | 'cancel') => {
    if (!diffModal) return;

    if (action === 'cancel') {
      setDiffModal(null);
      return;
    }

    try {
      const response = await fetch('/api/invoices', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          fileId: diffModal.existingFileId,
          filename: diffModal.filename,
          newData: diffModal.newData
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update file');
      }

      setDiffModal(null);
      setNotifications([`File "${diffModal.filename}" ${action === 'replace' ? 'replaced' : 'merged'} successfully`]);
      await loadInvoicesFromDatabase();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update file');
    }
  };

  const handleClearData = async () => {
    if (!confirm('Are you sure you want to clear all invoice data? This cannot be undone.')) {
      return;
    }

    try {
      // Get all files and delete them
      const response = await fetch('/api/invoices');
      const data = await response.json();

      for (const file of data.files || []) {
        await fetch('/api/invoices', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId: file.id }),
        });
      }

      setInvoices([]);
      setInvoicesWithDistances([]);
      setColumns([]);
      setTotalAmount(0);
      setFilters({ lessonDate: null, clientName: null });
      setNotifications(['All data cleared']);
    } catch (err) {
      setError('Failed to clear data');
    }
  };

  const formatRecordForDisplay = (record: InvoiceRecord): string => {
    const date = record['Lesson Date'];
    const client = record['Client Name'];
    const dateStr = date instanceof Date ? date.toLocaleDateString() : String(date || 'N/A');
    return `${dateStr} - ${client || 'Unknown'}`;
  };

  const handleExportToExcel = () => {
    const dataToExport = invoicesWithDistances.length > 0 ? invoicesWithDistances : invoices;

    if (dataToExport.length === 0) {
      setError('No data to export');
      return;
    }

    // Prepare data for export - convert dates and include kilometers
    const exportData = dataToExport.map(record => {
      const exportRecord: Record<string, unknown> = {};

      // Add all columns
      columns.forEach(col => {
        const value = record[col];
        if (value instanceof Date) {
          exportRecord[col] = value.toLocaleDateString('en-AU');
        } else {
          exportRecord[col] = value;
        }
      });

      // Add kilometers column
      exportRecord['Kilometers'] = record.kilometers || 0;

      return exportRecord;
    });

    // Create worksheet
    const worksheet = XLSX.utils.json_to_sheet(exportData);

    // Create workbook
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Invoices');

    // Generate filename with date
    const today = new Date().toISOString().split('T')[0];
    const filename = `invoices_export_${today}.xlsx`;

    // Download file
    XLSX.writeFile(workbook, filename);

    setNotifications([`Exported ${exportData.length} records to ${filename}`]);
  };

  const handleRefreshDistance = async (invoiceIndex: number) => {
    const invoice = invoicesWithDistances[invoiceIndex];
    if (!invoice) {
      return;
    }

    const homeAddress = getHomeAddress();
    if (!homeAddress) {
      setError('Home address not set. Please set it in Manage Addresses.');
      return;
    }

    // Find client name from the invoice
    const clientNameKey = Object.keys(invoice).find(
      key => key.toLowerCase().includes('client name') || key.toLowerCase().includes('client')
    );
    if (!clientNameKey) {
      setError('Could not find client name in invoice');
      return;
    }

    const clientName = String(invoice[clientNameKey] || '').trim();
    const clientAddress = getClientAddress(clientName);

    if (!clientAddress) {
      setError(`No address set for client: ${clientName}. Please set it in Manage Addresses.`);
      return;
    }

    setNotifications([`Refreshing distance for ${clientName}...`]);

    try {
      // Calculate distance from home to client (skip cache to force fresh calculation)
      const distanceToClient = await calculateDistance(homeAddress, clientAddress, true);
      // Calculate distance from client back to home (skip cache to force fresh calculation)
      const distanceToHome = await calculateDistance(clientAddress, homeAddress, true);

      let totalDistance = 0;
      if (distanceToClient !== null) {
        totalDistance += distanceToClient;
      }
      if (distanceToHome !== null) {
        totalDistance += distanceToHome;
      }

      const kilometers = Math.round(totalDistance * 10) / 10;

      // Save to database if we have a record ID
      const dbId = (invoice as any)._dbId;
      if (dbId && kilometers > 0) {
        try {
          await fetch('/api/invoices/kilometers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recordId: dbId, kilometers })
          });
        } catch (saveErr) {
          console.error('Error saving kilometers to database:', saveErr);
        }
      }

      // Update the invoice with the new distance
      const updatedInvoices = [...invoicesWithDistances];
      updatedInvoices[invoiceIndex] = {
        ...invoice,
        kilometers
      };
      setInvoicesWithDistances(updatedInvoices);

      if (totalDistance > 0) {
        setNotifications([`Distance updated for ${clientName}: ${totalDistance.toFixed(1)} km`]);
      } else {
        setError(`Failed to calculate distance for ${clientName}. Check the console for details.`);
      }
    } catch (err) {
      console.error('Error refreshing distance:', err);
      setError(`Failed to refresh distance: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">RTG Invoice Tracker</h1>
              <p className="text-gray-600">
                Upload multiple Excel invoice spreadsheets and view them combined with filtering options.
              </p>
            </div>
            <Link
              href="/settings"
              className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Settings
            </Link>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium">Error:</p>
                <p>{error}</p>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-red-500 hover:text-red-700"
              >
                &times;
              </button>
            </div>
          </div>
        )}

        {notifications.length > 0 && (
          <div className="mb-6 space-y-2">
            {notifications.map((notification, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-lg flex justify-between items-center ${
                  notification.includes('already uploaded')
                    ? 'bg-yellow-50 border border-yellow-200 text-yellow-700'
                    : 'bg-green-50 border border-green-200 text-green-700'
                }`}
              >
                <p>{notification}</p>
                <button
                  onClick={() => setNotifications(notifications.filter((_, i) => i !== idx))}
                  className="ml-4 text-current opacity-50 hover:opacity-100"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mb-6">
          <FileUpload onFilesSelected={handleFilesSelected} isUploading={isUploading} />
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-gray-500">
            <p>Loading saved invoices...</p>
          </div>
        ) : invoices.length > 0 ? (
          <>
            <div className="mb-4 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Invoice Data</h2>
                <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-md flex gap-6">
                  <p className="text-xl font-bold text-green-700">
                    Total Amount: ${totalAmount.toFixed(2)}
                  </p>
                  {invoicesWithDistances.length > 0 && (
                    <p className="text-xl font-bold text-blue-700">
                      Total Kilometers: {invoicesWithDistances.reduce((sum, inv) => sum + (inv.kilometers || 0), 0).toFixed(1)} km
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleExportToExcel}
                  className="px-4 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                >
                  Export to Excel
                </button>
                <button
                  onClick={() => setShowAddressManager(true)}
                  className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Manage Addresses
                </button>
                <button
                  onClick={handleClearData}
                  className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                  Clear Data
                </button>
              </div>
            </div>

            <InvoiceFilters
              invoices={invoices}
              filters={filters}
              onFiltersChange={setFilters}
            />

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              {isCalculatingDistances && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="text-sm text-blue-700">Calculating distances...</p>
                </div>
              )}
              <InvoiceTable
                invoices={invoicesWithDistances.length > 0 ? invoicesWithDistances : invoices}
                columns={columns}
                filters={filters}
                showKilometers={invoicesWithDistances.length > 0}
                onRefreshDistance={handleRefreshDistance}
              />
            </div>
          </>
        ) : (
          <div className="text-center py-12 text-gray-500">
            <p>No invoices loaded. Upload Excel files to get started.</p>
          </div>
        )}

        <ClientAddressManager
          invoices={invoices}
          isOpen={showAddressManager}
          onClose={() => setShowAddressManager(false)}
        />

        {/* Diff Modal */}
        {diffModal?.isOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">
                  File Changes Detected
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  The file "{diffModal.filename}" has different content than the previously uploaded version.
                </p>
              </div>

              <div className="p-6 overflow-y-auto max-h-[50vh]">
                <div className="space-y-4">
                  {diffModal.diff.added.length > 0 && (
                    <div>
                      <h3 className="font-medium text-green-700 mb-2">
                        New Records ({diffModal.diff.added.length})
                      </h3>
                      <ul className="text-sm text-gray-600 space-y-1 pl-4">
                        {diffModal.diff.added.slice(0, 5).map((record, idx) => (
                          <li key={idx} className="text-green-600">
                            + {formatRecordForDisplay(record)}
                          </li>
                        ))}
                        {diffModal.diff.added.length > 5 && (
                          <li className="text-gray-500">
                            ... and {diffModal.diff.added.length - 5} more
                          </li>
                        )}
                      </ul>
                    </div>
                  )}

                  {diffModal.diff.removed.length > 0 && (
                    <div>
                      <h3 className="font-medium text-red-700 mb-2">
                        Removed Records ({diffModal.diff.removed.length})
                      </h3>
                      <ul className="text-sm text-gray-600 space-y-1 pl-4">
                        {diffModal.diff.removed.slice(0, 5).map((record, idx) => (
                          <li key={idx} className="text-red-600">
                            - {formatRecordForDisplay(record)}
                          </li>
                        ))}
                        {diffModal.diff.removed.length > 5 && (
                          <li className="text-gray-500">
                            ... and {diffModal.diff.removed.length - 5} more
                          </li>
                        )}
                      </ul>
                    </div>
                  )}

                  {diffModal.diff.modified.length > 0 && (
                    <div>
                      <h3 className="font-medium text-yellow-700 mb-2">
                        Modified Records ({diffModal.diff.modified.length})
                      </h3>
                      <ul className="text-sm text-gray-600 space-y-1 pl-4">
                        {diffModal.diff.modified.slice(0, 5).map((mod, idx) => (
                          <li key={idx} className="text-yellow-600">
                            ~ {formatRecordForDisplay(mod.new)}
                          </li>
                        ))}
                        {diffModal.diff.modified.length > 5 && (
                          <li className="text-gray-500">
                            ... and {diffModal.diff.modified.length - 5} more
                          </li>
                        )}
                      </ul>
                    </div>
                  )}

                  {diffModal.diff.unchanged > 0 && (
                    <p className="text-sm text-gray-500">
                      {diffModal.diff.unchanged} records unchanged
                    </p>
                  )}
                </div>
              </div>

              <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
                <button
                  onClick={() => handleDiffAction('cancel')}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDiffAction('merge')}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  Merge (Add New Only)
                </button>
                <button
                  onClick={() => handleDiffAction('replace')}
                  className="px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700"
                >
                  Replace All
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
