'use client';

import { useState, useEffect } from 'react';
import { 
  getClientAddresses, 
  setClientAddress, 
  setClientAddresses,
  getClientAddress 
} from '@/lib/addressStorage';
import { AddressMapping } from '@/types/addressTypes';
import { InvoiceRecord } from '@/lib/invoiceTypes';

interface ClientAddressManagerProps {
  invoices: InvoiceRecord[];
  isOpen: boolean;
  onClose: () => void;
}

export default function ClientAddressManager({ invoices, isOpen, onClose }: ClientAddressManagerProps) {
  const [addresses, setAddresses] = useState<AddressMapping>({});
  const [saved, setSaved] = useState(false);

  // Get unique client names from invoices
  const getUniqueClients = (): string[] => {
    const clientNameKey = invoices.length > 0
      ? Object.keys(invoices[0]).find(
          key => key.toLowerCase().includes('client name') || key.toLowerCase().includes('client')
        )
      : null;
    
    if (!clientNameKey) return [];
    
    const clients = new Set<string>();
    invoices.forEach(invoice => {
      const clientName = String(invoice[clientNameKey] || '').trim();
      if (clientName) {
        clients.add(clientName);
      }
    });
    
    return Array.from(clients).sort();
  };

  useEffect(() => {
    if (isOpen) {
      const savedAddresses = getClientAddresses();
      setAddresses(savedAddresses);
    }
  }, [isOpen]);

  const handleAddressChange = (clientName: string, address: string) => {
    setAddresses(prev => ({
      ...prev,
      [clientName]: address
    }));
  };

  const handleSave = () => {
    setClientAddresses(addresses);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const uniqueClients = getUniqueClients();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Manage Client Addresses</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
          >
            ×
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6">
          <p className="text-sm text-gray-600 mb-6">
            Enter addresses for each client. These addresses will be used to calculate driving distances.
          </p>
          
          {uniqueClients.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No clients found. Upload invoice files first.</p>
          ) : (
            <div className="space-y-4">
              {uniqueClients.map(clientName => (
                <div key={clientName} className="border border-gray-200 rounded-lg p-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {clientName}
                  </label>
                  <input
                    type="text"
                    value={addresses[clientName] || ''}
                    onChange={(e) => handleAddressChange(clientName, e.target.value)}
                    placeholder="Enter client address"
                    className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
          <div>
            {saved && (
              <span className="text-sm text-green-600 font-medium">✓ Addresses saved!</span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              Save All Addresses
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
