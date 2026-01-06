import { InvoiceRecord } from '@/lib/invoiceTypes';
import { DayRoute, TripLeg, InvoiceWithDistance } from '@/types/addressTypes';
import { getHomeAddress, getClientAddress } from './addressStorage';
import { calculateDistanceMatrix, geocodeAddress } from './distanceCalculator';

export async function calculateRoutesForInvoices(
  invoices: InvoiceRecord[]
): Promise<InvoiceWithDistance[]> {
  const homeAddress = getHomeAddress();
  
  if (!homeAddress) {
    console.warn('Home address not set. Cannot calculate routes.');
    return invoices.map(inv => ({ ...inv, kilometers: 0 }));
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
    return invoices.map(inv => ({ ...inv, kilometers: 0 }));
  }
  
  // Find the Client Name column name
  const clientNameKey = invoices.length > 0
    ? Object.keys(invoices[0]).find(
        key => key.toLowerCase().includes('client name') || key.toLowerCase().includes('client')
      )
    : null;
  
  if (!clientNameKey) {
    console.warn('Client Name column not found');
    return invoices.map(inv => ({ ...inv, kilometers: 0 }));
  }
  
  // Group invoices by date
  const invoicesByDate = new Map<string, InvoiceRecord[]>();
  
  invoices.forEach((invoice, index) => {
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
  
  // Calculate routes for each day using Matrix API for efficiency
  const invoicesWithDistances: InvoiceWithDistance[] = [];
  
  for (const [dateKey, dayInvoices] of invoicesByDate.entries()) {
    console.log(`Calculating routes for ${dateKey}, ${dayInvoices.length} invoices`);
    
    // Build list of locations: [home, client1, client2, ..., clientN, home]
    // Also track which invoice index corresponds to which location
    const locations: [number, number][] = []; // [lng, lat] format for API
    const locationToInvoice: Map<number, { invoice: InvoiceRecord; clientName: string; clientAddress: string }> = new Map();
    const invoiceIndices: number[] = []; // Track original invoice indices
    
    // Add home as first location (index 0)
    const homeCoords = await geocodeAddress(homeAddress);
    if (!homeCoords) {
      console.error('Failed to geocode home address');
      // Add all invoices with 0 distance
      dayInvoices.forEach(inv => {
        invoicesWithDistances.push({ ...inv, kilometers: 0 });
      });
      continue;
    }
    locations.push([homeCoords[1], homeCoords[0]]); // [lng, lat]
    
    // Add client locations
    let locationIndex = 1;
    for (let i = 0; i < dayInvoices.length; i++) {
      const invoice = dayInvoices[i];
      const clientName = String(invoice[clientNameKey] || '').trim();
      const clientAddress = getClientAddress(clientName);
      
      if (!clientAddress) {
        console.warn(`No address found for client: ${clientName}`);
        // Will add invoice with 0 distance later
        continue;
      }
      
      const clientCoords = await geocodeAddress(clientAddress);
      if (!clientCoords) {
        console.warn(`Failed to geocode client address: ${clientAddress}`);
        continue;
      }
      
      locations.push([clientCoords[1], clientCoords[0]]); // [lng, lat]
      locationToInvoice.set(locationIndex, { invoice, clientName, clientAddress });
      invoiceIndices.push(i);
      locationIndex++;
    }
    
    // Add home again as last location for return trip
    locations.push([homeCoords[1], homeCoords[0]]);
    const homeIndex = locations.length - 1;
    
    if (locations.length < 3) {
      // Only home locations, no valid clients
      dayInvoices.forEach(inv => {
        invoicesWithDistances.push({ ...inv, kilometers: 0 });
      });
      continue;
    }
    
    // Calculate distance matrix for all locations
    const distanceMatrix = await calculateDistanceMatrix(locations);
    
    if (!distanceMatrix) {
      console.error('Failed to calculate distance matrix');
      dayInvoices.forEach(inv => {
        invoicesWithDistances.push({ ...inv, kilometers: 0 });
      });
      continue;
    }
    
    // Process invoices and calculate distances
    let currentLocationIndex = 0; // Start at home (index 0)
    
    for (let i = 0; i < dayInvoices.length; i++) {
      const invoice = dayInvoices[i];
      const clientName = String(invoice[clientNameKey] || '').trim();
      const clientAddress = getClientAddress(clientName);
      
      if (!clientAddress) {
        invoicesWithDistances.push({ ...invoice, kilometers: 0 });
        continue;
      }
      
      // Find the location index for this client
      let clientLocationIndex = -1;
      for (const [idx, info] of locationToInvoice.entries()) {
        if (info.clientName === clientName) {
          clientLocationIndex = idx;
          break;
        }
      }
      
      if (clientLocationIndex === -1) {
        invoicesWithDistances.push({ ...invoice, kilometers: 0 });
        continue;
      }
      
      // Calculate distance from current location to client
      let distance = 0;
      let tripLeg: TripLeg | undefined;
      
      if (distanceMatrix[currentLocationIndex] && distanceMatrix[currentLocationIndex][clientLocationIndex] !== undefined) {
        distance = distanceMatrix[currentLocationIndex][clientLocationIndex] / 1000; // Convert meters to km
        tripLeg = {
          from: currentLocationIndex === 0 ? homeAddress : locationToInvoice.get(currentLocationIndex)!.clientAddress,
          to: clientAddress,
          distance: distance,
          invoiceIndex: invoicesWithDistances.length
        };
      }
      
      // Check if this is the last valid invoice
      let isLastValidInvoice = true;
      for (let j = i + 1; j < dayInvoices.length; j++) {
        const nextClientName = String(dayInvoices[j][clientNameKey] || '').trim();
        if (getClientAddress(nextClientName)) {
          isLastValidInvoice = false;
          break;
        }
      }
      
      if (isLastValidInvoice) {
        // Add return trip to home
        if (distanceMatrix[clientLocationIndex] && distanceMatrix[clientLocationIndex][homeIndex] !== undefined) {
          const returnDistance = distanceMatrix[clientLocationIndex][homeIndex] / 1000; // Convert meters to km
          distance += returnDistance;
          if (tripLeg) {
            tripLeg = {
              ...tripLeg,
              distance: tripLeg.distance + returnDistance
            };
          } else {
            tripLeg = {
              from: clientAddress,
              to: homeAddress,
              distance: returnDistance,
              invoiceIndex: invoicesWithDistances.length
            };
          }
        }
      }
      
      // Update current location for next iteration
      currentLocationIndex = clientLocationIndex;
      
      invoicesWithDistances.push({
        ...invoice,
        kilometers: Math.round(distance * 10) / 10, // Round to 1 decimal place
        tripLeg
      });
    }
  }
  
  return invoicesWithDistances;
}
