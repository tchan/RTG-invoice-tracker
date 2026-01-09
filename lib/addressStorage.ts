import { AddressMapping } from '@/types/addressTypes';

const HOME_ADDRESS_KEY = 'rtg_home_address';
const CLIENT_ADDRESSES_KEY = 'rtg_client_addresses';

// Helper to get base URL for API calls
function getBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return '';
}

// Sync home address to database
async function syncHomeAddressToDb(address: string): Promise<void> {
  try {
    await fetch(`${getBaseUrl()}/api/addresses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'home', address })
    });
  } catch (error) {
    console.error('Error syncing home address to database:', error);
  }
}

// Sync client address to database
async function syncClientAddressToDb(clientName: string, address: string): Promise<void> {
  try {
    await fetch(`${getBaseUrl()}/api/addresses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'client', clientName, address })
    });
  } catch (error) {
    console.error('Error syncing client address to database:', error);
  }
}

// Sync all client addresses to database
async function syncAllClientAddressesToDb(addresses: AddressMapping): Promise<void> {
  try {
    await fetch(`${getBaseUrl()}/api/addresses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'all-clients', addresses })
    });
  } catch (error) {
    console.error('Error syncing client addresses to database:', error);
  }
}

// Remove client address from database
async function removeClientAddressFromDb(clientName: string): Promise<void> {
  try {
    await fetch(`${getBaseUrl()}/api/addresses?clientName=${encodeURIComponent(clientName)}`, {
      method: 'DELETE'
    });
  } catch (error) {
    console.error('Error removing client address from database:', error);
  }
}

// Load addresses from database and sync to localStorage
export async function loadAddressesFromDb(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const response = await fetch(`${getBaseUrl()}/api/addresses`);
    if (!response.ok) return;

    const data = await response.json();

    if (data.home) {
      localStorage.setItem(HOME_ADDRESS_KEY, data.home);
    }

    if (data.clients && Object.keys(data.clients).length > 0) {
      localStorage.setItem(CLIENT_ADDRESSES_KEY, JSON.stringify(data.clients));
    }

    console.log('Addresses loaded from database');
  } catch (error) {
    console.error('Error loading addresses from database:', error);
  }
}

export function getHomeAddress(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(HOME_ADDRESS_KEY);
}

export function setHomeAddress(address: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(HOME_ADDRESS_KEY, address);
  // Sync to database
  syncHomeAddressToDb(address);
}

export function getClientAddresses(): AddressMapping {
  if (typeof window === 'undefined') return {};
  const stored = localStorage.getItem(CLIENT_ADDRESSES_KEY);
  return stored ? JSON.parse(stored) : {};
}

export function setClientAddress(clientName: string, address: string): void {
  if (typeof window === 'undefined') return;
  const addresses = getClientAddresses();
  addresses[clientName] = address;
  localStorage.setItem(CLIENT_ADDRESSES_KEY, JSON.stringify(addresses));
  // Sync to database
  syncClientAddressToDb(clientName, address);
}

export function setClientAddresses(addresses: AddressMapping): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CLIENT_ADDRESSES_KEY, JSON.stringify(addresses));
  // Sync to database
  syncAllClientAddressesToDb(addresses);
}

export function getClientAddress(clientName: string): string | null {
  const addresses = getClientAddresses();
  return addresses[clientName] || null;
}

export function removeClientAddress(clientName: string): void {
  if (typeof window === 'undefined') return;
  const addresses = getClientAddresses();
  delete addresses[clientName];
  localStorage.setItem(CLIENT_ADDRESSES_KEY, JSON.stringify(addresses));
  // Sync to database
  removeClientAddressFromDb(clientName);
}
