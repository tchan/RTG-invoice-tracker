import { NextRequest, NextResponse } from 'next/server';
import {
  getHomeAddressDb,
  setHomeAddressDb,
  getClientAddressDb,
  setClientAddressDb,
  getAllClientAddressesDb,
  removeClientAddressDb,
  setAllClientAddressesDb
} from '@/lib/database';

// GET - Get addresses
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const clientName = searchParams.get('clientName');

    if (type === 'home') {
      const address = getHomeAddressDb();
      return NextResponse.json({ address });
    }

    if (type === 'client' && clientName) {
      const address = getClientAddressDb(clientName);
      return NextResponse.json({ address });
    }

    if (type === 'all-clients') {
      const addresses = getAllClientAddressesDb();
      return NextResponse.json({ addresses });
    }

    // Return all addresses
    const homeAddress = getHomeAddressDb();
    const clientAddresses = getAllClientAddressesDb();
    return NextResponse.json({
      home: homeAddress,
      clients: clientAddresses
    });
  } catch (error) {
    console.error('Error getting addresses:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get addresses' },
      { status: 500 }
    );
  }
}

// POST - Set an address
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, clientName, address, addresses } = body;

    if (type === 'home') {
      if (!address) {
        return NextResponse.json({ error: 'Address is required' }, { status: 400 });
      }
      setHomeAddressDb(address);
      return NextResponse.json({ success: true });
    }

    if (type === 'client') {
      if (!clientName || !address) {
        return NextResponse.json({ error: 'Client name and address are required' }, { status: 400 });
      }
      setClientAddressDb(clientName, address);
      return NextResponse.json({ success: true });
    }

    if (type === 'all-clients') {
      if (!addresses || typeof addresses !== 'object') {
        return NextResponse.json({ error: 'Addresses object is required' }, { status: 400 });
      }
      setAllClientAddressesDb(addresses);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  } catch (error) {
    console.error('Error setting address:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to set address' },
      { status: 500 }
    );
  }
}

// DELETE - Remove a client address
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clientName = searchParams.get('clientName');

    if (!clientName) {
      return NextResponse.json({ error: 'Client name is required' }, { status: 400 });
    }

    removeClientAddressDb(clientName);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing address:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to remove address' },
      { status: 500 }
    );
  }
}
