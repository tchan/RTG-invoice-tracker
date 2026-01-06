'use client';

import { FilterState } from '@/lib/invoiceTypes';
import { InvoiceRecord } from '@/lib/invoiceTypes';

interface InvoiceFiltersProps {
  invoices: InvoiceRecord[];
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
}

export default function InvoiceFilters({ invoices, filters, onFiltersChange }: InvoiceFiltersProps) {
  // Get unique client names from invoices
  const uniqueClientNames = Array.from(
    new Set(
      invoices
        .map(inv => {
          const clientNameKey = Object.keys(inv).find(
            key => key.toLowerCase().includes('client name') || key.toLowerCase().includes('client')
          );
          return clientNameKey ? String(inv[clientNameKey] || '') : '';
        })
        .filter(name => name.trim() !== '')
    )
  ).sort();

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const dateValue = e.target.value ? new Date(e.target.value) : null;
    onFiltersChange({ ...filters, lessonDate: dateValue });
  };

  const handleClientNameChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const clientName = e.target.value || null;
    onFiltersChange({ ...filters, clientName });
  };

  const clearFilters = () => {
    onFiltersChange({ lessonDate: null, clientName: null });
  };

  const hasActiveFilters = filters.lessonDate !== null || filters.clientName !== null;

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6">
      <div className="flex flex-col md:flex-row gap-4 items-end">
        <div className="flex-1">
          <label htmlFor="lesson-date" className="block text-sm font-medium text-gray-700 mb-1">
            Lesson Date
          </label>
          <input
            id="lesson-date"
            type="date"
            value={filters.lessonDate ? filters.lessonDate.toISOString().split('T')[0] : ''}
            onChange={handleDateChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div className="flex-1">
          <label htmlFor="client-name" className="block text-sm font-medium text-gray-700 mb-1">
            Client Name
          </label>
          <select
            id="client-name"
            value={filters.clientName || ''}
            onChange={handleClientNameChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Clients</option>
            {uniqueClientNames.map(name => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Clear Filters
          </button>
        )}
      </div>
    </div>
  );
}

