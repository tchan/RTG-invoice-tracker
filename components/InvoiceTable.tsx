'use client';

import { InvoiceRecord, FilterState } from '@/lib/invoiceTypes';
import { useState, useMemo } from 'react';

interface InvoiceTableProps {
  invoices: InvoiceRecord[];
  columns: string[];
  filters: FilterState;
}

export default function InvoiceTable({ invoices, columns, filters }: InvoiceTableProps) {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Filter to only show Lesson Date and Client Name columns
  const displayColumns = useMemo(() => {
    return columns.filter(col => {
      const lower = col.toLowerCase();
      return lower.includes('lesson date') || 
             (lower.includes('date') && !lower.includes('time')) ||
             lower.includes('client name') || 
             lower.includes('client');
    });
  }, [columns]);

  // Filter invoices based on filters
  const filteredInvoices = useMemo(() => {
    return invoices.filter(invoice => {
      // Filter by Lesson Date
      if (filters.lessonDate) {
        const lessonDateKey = Object.keys(invoice).find(
          key => key.toLowerCase().includes('lesson date') || key.toLowerCase().includes('date')
        );
        if (lessonDateKey) {
          const invoiceDate = invoice[lessonDateKey];
          if (invoiceDate) {
            const date = invoiceDate instanceof Date 
              ? invoiceDate 
              : new Date(invoiceDate as string);
            const filterDate = filters.lessonDate;
            
            // Compare dates (ignoring time)
            const invoiceDateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
            const filterDateOnly = new Date(filterDate.getFullYear(), filterDate.getMonth(), filterDate.getDate());
            
            if (invoiceDateOnly.getTime() !== filterDateOnly.getTime()) {
              return false;
            }
          } else {
            return false;
          }
        }
      }

      // Filter by Client Name
      if (filters.clientName) {
        const clientNameKey = Object.keys(invoice).find(
          key => key.toLowerCase().includes('client name') || key.toLowerCase().includes('client')
        );
        if (clientNameKey) {
          const invoiceClientName = String(invoice[clientNameKey] || '').trim();
          if (invoiceClientName !== filters.clientName) {
            return false;
          }
        } else {
          return false;
        }
      }

      return true;
    });
  }, [invoices, filters]);

  // Sort invoices
  const sortedInvoices = useMemo(() => {
    if (!sortColumn) return filteredInvoices;

    return [...filteredInvoices].sort((a, b) => {
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];

      // Handle null/undefined values
      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;

      // Handle dates
      if (aValue instanceof Date || bValue instanceof Date) {
        const aDate = aValue instanceof Date ? aValue : new Date(aValue as string);
        const bDate = bValue instanceof Date ? bValue : new Date(bValue as string);
        const comparison = aDate.getTime() - bDate.getTime();
        return sortDirection === 'asc' ? comparison : -comparison;
      }

      // Handle numbers
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      }

      // Handle strings
      const aStr = String(aValue).toLowerCase();
      const bStr = String(bValue).toLowerCase();
      const comparison = aStr.localeCompare(bStr);
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredInvoices, sortColumn, sortDirection]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) {
      return value.toLocaleDateString();
    }
    if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T/)) {
      // ISO date string
      return new Date(value).toLocaleDateString();
    }
    return String(value);
  };

  if (displayColumns.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No data to display. Please upload Excel files.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="mb-4 text-sm text-gray-600">
        Showing {sortedInvoices.length} of {invoices.length} invoices
      </div>
      <table className="min-w-full divide-y divide-gray-200 border border-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {displayColumns.map(column => (
              <th
                key={column}
                onClick={() => handleSort(column)}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 bg-blue-50"
              >
                <div className="flex items-center gap-2">
                  {column}
                  {sortColumn === column && (
                    <span className="text-blue-600">
                      {sortDirection === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {sortedInvoices.length === 0 ? (
            <tr>
              <td colSpan={displayColumns.length} className="px-6 py-4 text-center text-gray-500">
                No invoices match the current filters.
              </td>
            </tr>
          ) : (
            sortedInvoices.map((invoice, index) => {
              return (
                <tr key={index} className="hover:bg-gray-50">
                  {displayColumns.map(column => {
                    // Try to find the value - exact match, then case-insensitive, then partial match
                    let value = invoice[column];
                    
                    if (value === undefined || value === null) {
                      // Try case-insensitive exact match
                      const exactMatch = Object.keys(invoice).find(
                        key => key.toLowerCase().trim() === column.toLowerCase().trim()
                      );
                      if (exactMatch) {
                        value = invoice[exactMatch];
                      } else {
                        // Try partial match for Lesson Date and Client Name
                        const lowerColumn = column.toLowerCase();
                        if (lowerColumn.includes('lesson date') || lowerColumn.includes('date')) {
                          const dateKey = Object.keys(invoice).find(
                            key => key.toLowerCase().includes('lesson date') || 
                                   (key.toLowerCase().includes('date') && !key.toLowerCase().includes('time'))
                          );
                          if (dateKey) value = invoice[dateKey];
                        } else if (lowerColumn.includes('client name') || lowerColumn.includes('client')) {
                          const clientKey = Object.keys(invoice).find(
                            key => key.toLowerCase().includes('client name') || key.toLowerCase().includes('client')
                          );
                          if (clientKey) value = invoice[clientKey];
                        }
                      }
                    }
                    
                    return (
                      <td
                        key={column}
                        className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium"
                      >
                        {formatValue(value)}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

