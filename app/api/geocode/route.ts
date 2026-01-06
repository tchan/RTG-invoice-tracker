import { NextRequest, NextResponse } from 'next/server';

// Parse address string into structured format for better geocoding accuracy
function parseAddress(address: string): { query?: string; address?: string; locality?: string; region?: string; postalcode?: string; country?: string } {
  const trimmed = address.trim();
  
  // Try to extract structured components from common Australian address format
  // Format: "Street Address, Suburb State Postcode, Country"
  // Example: "57 Arunta Crescent, Clarinda VIC 3169, Australia"
  
  const parts = trimmed.split(',').map(p => p.trim());
  
  if (parts.length >= 3) {
    // Has street, suburb/state/postcode, country
    const street = parts[0];
    const suburbStatePostcode = parts[1];
    const country = parts[2] || 'Australia';
    
    // Try to extract postcode and state from middle part
    // Pattern: "Suburb STATE Postcode" or "Suburb Postcode"
    const postcodeMatch = suburbStatePostcode.match(/(\d{4})$/);
    const postcode = postcodeMatch ? postcodeMatch[1] : undefined;
    
    // Extract state (VIC, NSW, QLD, etc.)
    const stateMatch = suburbStatePostcode.match(/\b(VIC|NSW|QLD|SA|WA|TAS|NT|ACT)\b/i);
    const state = stateMatch ? stateMatch[1].toUpperCase() : undefined;
    
    // Extract suburb (everything before state/postcode)
    const suburb = suburbStatePostcode
      .replace(/\b(VIC|NSW|QLD|SA|WA|TAS|NT|ACT)\b/gi, '')
      .replace(/\d{4}$/, '')
      .trim();
    
    return {
      address: street,
      locality: suburb || undefined,
      region: state || undefined,
      postalcode: postcode || undefined,
      country: country
    };
  } else if (parts.length === 2) {
    // Has street, suburb/state/postcode
    const street = parts[0];
    const suburbStatePostcode = parts[1];
    
    const postcodeMatch = suburbStatePostcode.match(/(\d{4})$/);
    const postcode = postcodeMatch ? postcodeMatch[1] : undefined;
    
    const stateMatch = suburbStatePostcode.match(/\b(VIC|NSW|QLD|SA|WA|TAS|NT|ACT)\b/i);
    const state = stateMatch ? stateMatch[1].toUpperCase() : undefined;
    
    const suburb = suburbStatePostcode
      .replace(/\b(VIC|NSW|QLD|SA|WA|TAS|NT|ACT)\b/gi, '')
      .replace(/\d{4}$/, '')
      .trim();
    
    return {
      address: street,
      locality: suburb || undefined,
      region: state || undefined,
      postalcode: postcode || undefined,
      country: 'Australia'
    };
  }
  
  // Fallback to free-text query
  return { query: trimmed };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const address = searchParams.get('address');
  const apiKey = searchParams.get('apiKey');

  if (!address || !apiKey) {
    return NextResponse.json(
      { error: 'Address and API key are required' },
      { status: 400 }
    );
  }

  return geocodeAddress(address, apiKey);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address, apiKey } = body;

    if (!address || !apiKey) {
      return NextResponse.json(
        { error: 'Address and API key are required' },
        { status: 400 }
      );
    }

    return geocodeAddress(address, apiKey);
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }
}

async function geocodeAddress(address: string, apiKey: string) {
  try {
    // Validate input
    if (!address || typeof address !== 'string') {
      console.error('Invalid address parameter:', address);
      return NextResponse.json(
        { error: 'Address must be a non-empty string' },
        { status: 400 }
      );
    }
    
    const trimmedAddress = address.trim();
    if (trimmedAddress.length === 0) {
      console.error('Empty address provided for geocoding');
      return NextResponse.json(
        { error: 'Address cannot be empty' },
        { status: 400 }
      );
    }
    
    console.log('Geocoding address:', trimmedAddress);
    console.log('Address length:', trimmedAddress.length);
    
    // Parse address into structured format (for optional structured components)
    const structuredAddress = parseAddress(trimmedAddress);
    console.log('Parsed structured address:', structuredAddress);
    
    // Use OpenRouteService Geocoding API
    // Try different endpoint formats - the API might use a different path
    // Option 1: /geocode/search (current)
    // Option 2: /v2/geocoding/search (if versioned)
    // Option 3: /geocoding/search (alternative path)
    let geocodeUrl = 'https://api.openrouteservice.org/geocode/search';
    
    // Based on the error mentioning Pelias engine, this might be the correct endpoint
    // But let's try the current one first and see the full error
    
    // Build request - try JSON format first
    const requestBody = {
      text: trimmedAddress
    };
    
    console.log('Geocoding request body:', JSON.stringify(requestBody, null, 2));
    console.log('Text parameter:', trimmedAddress);
    console.log('Text parameter length:', trimmedAddress.length);
    
    const bodyString = JSON.stringify(requestBody);
    console.log('Request body (stringified):', bodyString);
    
    // Try POST with JSON body and Authorization header
    let response = await fetch(geocodeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey
      },
      body: bodyString
    });
    
    // If that fails, try with the text in the URL as a query parameter (GET request)
    if (!response.ok) {
      console.log('POST with JSON failed, trying GET with query parameters');
      const getUrl = `https://api.openrouteservice.org/geocode/search?api_key=${encodeURIComponent(apiKey)}&text=${encodeURIComponent(trimmedAddress)}`;
      response = await fetch(getUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
    }
    
    console.log('Response status:', response.status);
    console.log('Response statusText:', response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouteService geocoding failed:', {
        status: response.status,
        statusText: response.statusText,
        address: address,
        error: errorText
      });
      return NextResponse.json(
        { error: `Geocoding failed: ${response.statusText}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('OpenRouteService geocoding response:', {
      hasFeatures: !!data.features,
      featureCount: data.features?.length || 0,
      address: address
    });
    
    if (!data.features || data.features.length === 0) {
      console.warn('No geocoding results found for address:', address);
      return NextResponse.json(
        { error: 'No results found for this address', features: [] },
        { status: 404 }
      );
    }
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Geocoding error:', {
      error: error instanceof Error ? error.message : String(error),
      address: address
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Geocoding failed' },
      { status: 500 }
    );
  }
}

