import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { locations, apiKey, profile = 'driving-car' } = body;

    if (!locations || !Array.isArray(locations) || locations.length < 2) {
      return NextResponse.json(
        { error: 'Invalid locations. Expected array of at least 2 coordinate pairs' },
        { status: 400 }
      );
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key is required' },
        { status: 400 }
      );
    }

    const response = await fetch(
      `https://api.openrouteservice.org/v2/matrix/${profile}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': apiKey
        },
        body: JSON.stringify({
          locations: locations,
          metrics: ['distance', 'duration']
          // Note: Matrix API always returns distances in meters, regardless of units parameter
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Matrix API failed: ${response.statusText}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Matrix error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Matrix calculation failed' },
      { status: 500 }
    );
  }
}

