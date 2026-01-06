import { InvoiceRecord } from '@/lib/invoiceTypes';
import { DayRoute, TripLeg, InvoiceWithDistance } from '@/types/addressTypes';
import { getHomeAddress, getClientAddress } from './addressStorage';
import { calculateDistance } from './distanceCalculator';

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
  
  // Calculate routes for each day
  const invoicesWithDistances: InvoiceWithDistance[] = [];
  
  for (const [dateKey, dayInvoices] of invoicesByDate.entries()) {
    console.log(`Calculating routes for ${dateKey}, ${dayInvoices.length} invoices`);
    
    // Process each invoice in order
    // Track the last valid address we visited (for routing between clients)
    let lastValidAddress: string | null = homeAddress;
    
    for (let i = 0; i < dayInvoices.length; i++) {
      const invoice = dayInvoices[i];
      const clientName = String(invoice[clientNameKey] || '').trim();
      const clientAddress = getClientAddress(clientName);
      
      if (!clientAddress) {
        console.warn(`No address found for client: ${clientName}`);
        invoicesWithDistances.push({ ...invoice, kilometers: 0 });
        continue; // Skip this invoice but keep lastValidAddress
      }
      
      let distance = 0;
      let tripLeg: TripLeg | undefined;
      
      // Calculate distance from last valid address to current client
      if (lastValidAddress) {
        const dist = await calculateDistance(lastValidAddress, clientAddress);
        if (dist !== null) {
          distance = dist;
          tripLeg = {
            from: lastValidAddress,
            to: clientAddress,
            distance: dist,
            invoiceIndex: invoicesWithDistances.length
          };
        }
      }
      
      // Check if this is the last invoice of the day (with valid address)
      // Find if there are any more invoices with valid addresses after this one
      let isLastValidInvoice = true;
      for (let j = i + 1; j < dayInvoices.length; j++) {
        const nextClientName = String(dayInvoices[j][clientNameKey] || '').trim();
        if (getClientAddress(nextClientName)) {
          isLastValidInvoice = false;
          break;
        }
      }
      
      if (isLastValidInvoice) {
        // Last trip: client → home
        const dist = await calculateDistance(clientAddress, homeAddress);
        if (dist !== null) {
          distance += dist;
          // Update tripLeg to include return trip
          if (tripLeg) {
            tripLeg = {
              ...tripLeg,
              distance: tripLeg.distance + dist
            };
          } else {
            tripLeg = {
              from: clientAddress,
              to: homeAddress,
              distance: dist,
              invoiceIndex: invoicesWithDistances.length
            };
          }
        }
      }
      
      // Update lastValidAddress for next iteration
      lastValidAddress = clientAddress;
      
      invoicesWithDistances.push({
        ...invoice,
        kilometers: Math.round(distance * 10) / 10, // Round to 1 decimal place
        tripLeg
      });
    }
  }
  
  return invoicesWithDistances;
}
