import { NextRequest, NextResponse } from 'next/server';
import {
  getCachedDistance,
  setCachedDistance,
  getAllCachedDistances,
  clearDistanceCacheDb
} from '@/lib/database';

// GET - Check if a distance is cached
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const origin = searchParams.get('origin');
    const destination = searchParams.get('destination');

    // If no params, return all cached distances
    if (!origin && !destination) {
      const allCached = getAllCachedDistances();
      return NextResponse.json({ cached: allCached });
    }

    if (!origin || !destination) {
      return NextResponse.json(
        { error: 'Both origin and destination are required' },
        { status: 400 }
      );
    }

    console.log('Distance cache lookup:', { origin, destination });
    const cachedDistance = getCachedDistance(origin, destination);
    console.log('Distance cache result:', cachedDistance);

    if (cachedDistance !== null) {
      return NextResponse.json({
        cached: true,
        distance_km: cachedDistance
      });
    }

    return NextResponse.json({ cached: false });
  } catch (error) {
    console.error('Error checking distance cache:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check cache' },
      { status: 500 }
    );
  }
}

// POST - Save a distance to cache
export async function POST(request: NextRequest) {
  try {
    const { origin, destination, distance_km } = await request.json();

    if (!origin || !destination || distance_km === undefined) {
      return NextResponse.json(
        { error: 'origin, destination, and distance_km are required' },
        { status: 400 }
      );
    }

    console.log('Saving distance to cache:', { origin, destination, distance_km });
    setCachedDistance(origin, destination, distance_km);
    console.log('Distance saved to cache successfully');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving to distance cache:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save to cache' },
      { status: 500 }
    );
  }
}

// DELETE - Clear the distance cache
export async function DELETE() {
  try {
    clearDistanceCacheDb();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error clearing distance cache:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to clear cache' },
      { status: 500 }
    );
  }
}
