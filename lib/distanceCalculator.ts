// OpenRouteService API integration for calculating distances
// Free tier available, API key required
// Get your free API key at: https://openrouteservice.org/dev/#/signup
// After signing up, you'll get a free API key with generous rate limits

interface DistanceCache {
  [key: string]: number; // "address1|address2" -> distance in km
}

const distanceCache: DistanceCache = {};

const ORS_API_KEY_STORAGE_KEY = 'rtg_ors_api_key';

// Get API key from localStorage or environment variable
// Users should set their own API key in Settings
export function getOrsApiKey(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(ORS_API_KEY_STORAGE_KEY);
  }
  return process.env.NEXT_PUBLIC_ORS_API_KEY || null;
}

export function setOrsApiKey(apiKey: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(ORS_API_KEY_STORAGE_KEY, apiKey);
  }
}

const getApiKey = (): string | null => {
  return getOrsApiKey();
};

// Geocode address to coordinates using OpenRouteService Geocoding API
// Uses Next.js API route to avoid CORS issues
export async function geocodeAddress(address: string): Promise<[number, number] | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error('OpenRouteService API key not set. Please set it in Settings.');
    return null;
  }
  
  if (!address || address.trim() === '') {
    console.error('Empty address provided for geocoding');
    return null;
  }
  
  try {
    // Use absolute URL to ensure we hit the correct endpoint
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${baseUrl}/api/geocode`;
    console.log('Geocoding address:', address);
    console.log('Calling geocode API:', url);
    
    // Use POST request with structured address format
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        address: address,
        apiKey: apiKey
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Geocoding failed:', {
        status: response.status,
        statusText: response.statusText,
        address: address,
        error: errorData
      });
      return null;
    }
    
    const data = await response.json();
    console.log('Geocoding response:', {
      hasFeatures: !!data.features,
      featureCount: data.features?.length || 0,
      address: address
    });
    
    if (data.features && data.features.length > 0) {
      const [lng, lat] = data.features[0].geometry.coordinates;
      console.log('Geocoded coordinates:', { lat, lng, address });
      return [lat, lng]; // OpenRouteService returns [lng, lat], we need [lat, lng]
    }
    
    console.warn('No features found in geocoding response for address:', address);
    return null;
  } catch (error) {
    console.error('Geocoding error:', {
      error: error instanceof Error ? error.message : String(error),
      address: address
    });
    return null;
  }
}

// Calculate distance between two addresses using OpenRouteService Directions API
export async function calculateDistance(
  origin: string,
  destination: string
): Promise<number | null> {
  // Check cache first
  const cacheKey = `${origin}|${destination}`;
  const reverseCacheKey = `${destination}|${origin}`;
  
  if (distanceCache[cacheKey]) {
    return distanceCache[cacheKey];
  }
  if (distanceCache[reverseCacheKey]) {
    return distanceCache[reverseCacheKey]; // Distance is same both ways
  }
  
  try {
    // Geocode both addresses
    const [originCoords, destCoords] = await Promise.all([
      geocodeAddress(origin),
      geocodeAddress(destination)
    ]);
    
    if (!originCoords || !destCoords) {
      console.error('Failed to geocode addresses:', { origin, destination });
      return null;
    }
    
    // Call Directions API via Next.js API route to avoid CORS issues
    const apiKey = getApiKey();
    if (!apiKey) {
      console.error('OpenRouteService API key not set. Please set it in Settings.');
      return null;
    }
    
    const requestBody = {
      coordinates: [
        [originCoords[1], originCoords[0]], // [lng, lat]
        [destCoords[1], destCoords[0]]
      ],
      apiKey: apiKey
    };
    
    // Use absolute URL to ensure we hit the correct endpoint
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${baseUrl}/api/directions`;
    console.log('Calling directions API:', url);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Directions API failed:', response.status, response.statusText, errorData);
      return null;
    }
    
    const data = await response.json();
    
    if (data.routes && data.routes.length > 0) {
      // Distance is in meters, convert to kilometers
      const distanceInMeters = data.routes[0].summary.distance;
      const distanceInKm = distanceInMeters / 1000;
      
      // Cache the result
      distanceCache[cacheKey] = distanceInKm;
      
      return distanceInKm;
    }
    
    return null;
  } catch (error) {
    console.error('Distance calculation error:', error);
    return null;
  }
}

// Calculate distance matrix for multiple locations using Matrix API
// This is more efficient than calculating individual distances
export async function calculateDistanceMatrix(
  locations: [number, number][] // Array of [lng, lat] coordinates
): Promise<number[][] | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error('OpenRouteService API key not set. Please set it in Settings.');
    return null;
  }
  
  if (locations.length < 2) {
    console.error('Need at least 2 locations for matrix calculation');
    return null;
  }
  
  try {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${baseUrl}/api/matrix`;
    
    console.log('Calling matrix API for', locations.length, 'locations');
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        locations: locations,
        apiKey: apiKey,
        profile: 'driving-car'
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Matrix API failed:', response.status, response.statusText, errorData);
      return null;
    }
    
    const data = await response.json();
    
    if (data.distances && Array.isArray(data.distances)) {
      // distances[i][j] = distance in meters from location i to location j
      return data.distances;
    }
    
    return null;
  } catch (error) {
    console.error('Matrix calculation error:', error);
    return null;
  }
}

// Clear the distance cache
export function clearDistanceCache(): void {
  Object.keys(distanceCache).forEach(key => delete distanceCache[key]);
}
