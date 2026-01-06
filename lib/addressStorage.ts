import { AddressMapping } from '@/types/addressTypes';

const HOME_ADDRESS_KEY = 'rtg_home_address';
const CLIENT_ADDRESSES_KEY = 'rtg_client_addresses';

export function getHomeAddress(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(HOME_ADDRESS_KEY);
}

export function setHomeAddress(address: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(HOME_ADDRESS_KEY, address);
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
}

export function setClientAddresses(addresses: AddressMapping): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CLIENT_ADDRESSES_KEY, JSON.stringify(addresses));
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
}
