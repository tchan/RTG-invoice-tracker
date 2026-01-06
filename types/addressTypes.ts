export interface AddressMapping {
  [clientName: string]: string; // client name -> address
}

export interface TripLeg {
  from: string;
  to: string;
  distance: number; // in kilometers
  invoiceIndex: number; // which invoice row this leg belongs to
}

export interface DayRoute {
  date: Date;
  trips: TripLeg[];
  totalKilometers: number;
}

export interface InvoiceWithDistance extends Record<string, any> {
  kilometers?: number;
  tripLeg?: TripLeg;
}
