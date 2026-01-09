import { NextRequest, NextResponse } from 'next/server';
import { updateInvoiceKilometers, updateMultipleInvoiceKilometers } from '@/lib/database';

// POST - Update kilometers for invoice record(s)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Single update
    if (body.recordId !== undefined && body.kilometers !== undefined) {
      updateInvoiceKilometers(body.recordId, body.kilometers);
      return NextResponse.json({ success: true });
    }

    // Batch update
    if (Array.isArray(body.updates)) {
      updateMultipleInvoiceKilometers(body.updates);
      return NextResponse.json({ success: true, count: body.updates.length });
    }

    return NextResponse.json(
      { error: 'Invalid request. Provide recordId and kilometers, or an updates array.' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error updating kilometers:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update kilometers' },
      { status: 500 }
    );
  }
}
