'use client';

import { useState, useEffect } from 'react';
import { getHomeAddress, setHomeAddress } from '@/lib/addressStorage';
import { getOrsApiKey, setOrsApiKey } from '@/lib/distanceCalculator';
import Link from 'next/link';

export default function SettingsPage() {
  const [homeAddress, setHomeAddressState] = useState<string>('');
  const [apiKey, setApiKeyState] = useState<string>('');
  const [saved, setSaved] = useState(false);
  const [apiKeySaved, setApiKeySaved] = useState(false);

  useEffect(() => {
    const savedAddress = getHomeAddress();
    if (savedAddress) {
      setHomeAddressState(savedAddress);
    }
    const savedApiKey = getOrsApiKey();
    if (savedApiKey) {
      setApiKeyState(savedApiKey);
    }
  }, []);

  const handleSave = () => {
    if (homeAddress.trim()) {
      setHomeAddress(homeAddress.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  };

  const handleSaveApiKey = () => {
    if (apiKey.trim()) {
      setOrsApiKey(apiKey.trim());
      setApiKeySaved(true);
      setTimeout(() => setApiKeySaved(false), 3000);
    }
  };

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
            <Link
              href="/"
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
            >
              Back to Invoices
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Home Address</h2>
          <p className="text-sm text-gray-600 mb-4">
            Enter your home address. This will be used as the starting and ending point for calculating kilometers driven to clients.
          </p>
          
          <div className="space-y-4">
            <div>
              <label htmlFor="home-address" className="block text-sm font-medium text-gray-700 mb-2">
                Address
              </label>
              <input
                id="home-address"
                type="text"
                value={homeAddress}
                onChange={(e) => setHomeAddressState(e.target.value)}
                placeholder="e.g., 57 Arunta Crescent, Clarinda, VIC 3169, Australia"
                className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div className="flex items-center gap-4">
              <button
                onClick={handleSave}
                className="px-6 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Save Address
              </button>
              
              {saved && (
                <span className="text-sm text-green-600 font-medium">✓ Address saved!</span>
              )}
            </div>
            
            {homeAddress && (
              <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-md">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Current address:</span> {homeAddress}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">OpenRouteService API Key</h2>
          <p className="text-sm text-gray-600 mb-4">
            A free API key is required to calculate distances. Sign up at{' '}
            <a 
              href="https://openrouteservice.org/dev/#/signup" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              openrouteservice.org
            </a>
            {' '}to get your free API key. The free tier includes generous rate limits.
          </p>
          
          <div className="space-y-4">
            <div>
              <label htmlFor="api-key" className="block text-sm font-medium text-gray-700 mb-2">
                API Key
              </label>
              <input
                id="api-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKeyState(e.target.value)}
                placeholder="Enter your OpenRouteService API key"
                className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div className="flex items-center gap-4">
              <button
                onClick={handleSaveApiKey}
                className="px-6 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Save API Key
              </button>
              
              {apiKeySaved && (
                <span className="text-sm text-green-600 font-medium">✓ API key saved!</span>
              )}
            </div>
            
            {apiKey && (
              <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-md">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">API key is set.</span> {apiKey.length > 0 ? `(${apiKey.substring(0, 8)}...)` : ''}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Client Addresses</h2>
          <p className="text-sm text-gray-600 mb-4">
            Manage client addresses from the main invoice page. Client addresses are linked to client names and used to calculate driving distances.
          </p>
          <Link
            href="/"
            className="inline-block px-4 py-2 bg-gray-600 text-white font-medium rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
          >
            Go to Invoice Page
          </Link>
        </div>
      </div>
    </main>
  );
}
