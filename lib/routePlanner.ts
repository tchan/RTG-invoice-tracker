import { InvoiceRecord } from '@/lib/invoiceTypes';
import { TripLeg, InvoiceWithDistance } from '@/types/addressTypes';
import { getHomeAddress, getClientAddress } from './addressStorage';
import { calculateDistance } from './distanceCalculator';

// Save kilometers to database via API
async function saveKilometersToDb(recordId: number, kilometers: number): Promise<void> {
  try {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    await fetch(`${baseUrl}/api/invoices/kilometers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recordId, kilometers })
    });
  } catch (error) {
    console.error('Error saving kilometers to database:', error);
  }
}

export async function calculateRoutesForInvoices(
  invoices: InvoiceRecord[]
): Promise<InvoiceWithDistance[]> {
  const homeAddress = getHomeAddress();

  if (!homeAddress) {
    console.warn('Home address not set. Cannot calculate routes.');
    return invoices.map(inv => ({ ...inv, kilometers: (inv as any).kilometers || 0 }));
  }

  // Find the Lesson Date column name
  const lessonDateKey = invoices.length > 0
    ? Object.keys(invoices[0]).find(
        key => key.toLowerCase().includes('lesson date') ||
               (key.toLowerCase().includes('date') && !key.toLowerCase().includes('time'))
      )
    : null;

  if (!lessonDateKey) {
    console.warn('Lesson Date column not found');
    return invoices.map(inv => ({ ...inv, kilometers: (inv as any).kilometers || 0 }));
  }

  // Find the Client Name column name
  const clientNameKey = invoices.length > 0
    ? Object.keys(invoices[0]).find(
        key => key.toLowerCase().includes('client name') || key.toLowerCase().includes('client')
      )
    : null;

  if (!clientNameKey) {
    console.warn('Client Name column not found');
    return invoices.map(inv => ({ ...inv, kilometers: (inv as any).kilometers || 0 }));
  }

  // Group invoices by date
  const invoicesByDate = new Map<string, InvoiceRecord[]>();

  invoices.forEach((invoice) => {
    const dateValue = invoice[lessonDateKey];
    if (!dateValue) return;

    let dateKey: string;
    if (dateValue instanceof Date) {
      dateKey = dateValue.toISOString().split('T')[0];
    } else if (typeof dateValue === 'string') {
      const date = new Date(dateValue);
      dateKey = date.toISOString().split('T')[0];
    } else {
      return;
    }

    if (!invoicesByDate.has(dateKey)) {
      invoicesByDate.set(dateKey, []);
    }
    invoicesByDate.get(dateKey)!.push(invoice);
  });

  // Calculate routes for each day
  const invoicesWithDistances: InvoiceWithDistance[] = [];

  for (const [dateKey, dayInvoices] of invoicesByDate.entries()) {
    console.log(`Processing routes for ${dateKey}, ${dayInvoices.length} invoices`);

    // Build ordered list of valid clients for this day
    const validClients: { invoice: InvoiceRecord; clientName: string; clientAddress: string }[] = [];

    for (const invoice of dayInvoices) {
      const clientName = String(invoice[clientNameKey] || '').trim();
      const clientAddress = getClientAddress(clientName);

      // Check if kilometers already exists in the database
      const existingKm = (invoice as any).kilometers;
      if (existingKm !== undefined && existingKm !== null && existingKm > 0) {
        console.log(`Using stored kilometers for ${clientName}: ${existingKm} km`);
        invoicesWithDistances.push({ ...invoice, kilometers: existingKm });
        continue;
      }

      if (clientAddress) {
        validClients.push({ invoice, clientName, clientAddress });
      } else {
        // No address for this client, add with 0 km
        invoicesWithDistances.push({ ...invoice, kilometers: 0 });
      }
    }

    if (validClients.length === 0) {
      continue;
    }

    // Calculate distances for the route: home -> client1 -> client2 -> ... -> home
    let previousAddress = homeAddress;

    for (let i = 0; i < validClients.length; i++) {
      const { invoice, clientName, clientAddress } = validClients[i];
      const isLastClient = i === validClients.length - 1;

      let totalDistance = 0;
      let tripLeg: TripLeg | undefined;

      try {
        // Distance from previous location to this client
        const distanceToClient = await calculateDistance(previousAddress, clientAddress);

        if (distanceToClient !== null) {
          totalDistance += distanceToClient;
          tripLeg = {
            from: previousAddress,
            to: clientAddress,
            distance: distanceToClient,
            invoiceIndex: invoicesWithDistances.length
          };
        }

        // If this is the last client, add return trip to home
        if (isLastClient) {
          const distanceToHome = await calculateDistance(clientAddress, homeAddress);
          if (distanceToHome !== null) {
            totalDistance += distanceToHome;
            if (tripLeg) {
              tripLeg.distance += distanceToHome;
            }
          }
        }

        // Update previous address for next iteration
        previousAddress = clientAddress;

        const kilometers = Math.round(totalDistance * 10) / 10;

        // Save to database if we have a record ID
        const dbId = (invoice as any)._dbId;
        if (dbId && kilometers > 0) {
          console.log(`Saving kilometers to database for ${clientName}: ${kilometers} km`);
          await saveKilometersToDb(dbId, kilometers);
        }

        invoicesWithDistances.push({
          ...invoice,
          kilometers,
          tripLeg
        });

        if (totalDistance > 0) {
          console.log(`Calculated distance for ${clientName}: ${kilometers} km`);
        } else {
          console.warn(`Failed to calculate distance for ${clientName}`);
        }
      } catch (error) {
        console.error(`Error calculating distance for ${clientName}:`, error);
        invoicesWithDistances.push({ ...invoice, kilometers: 0 });
        // Still update previous address to maintain route continuity
        previousAddress = clientAddress;
      }
    }
  }

  return invoicesWithDistances;
}
