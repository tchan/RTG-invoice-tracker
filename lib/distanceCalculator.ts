// OpenRouteService API integration for calculating distances
// Free tier available, API key required
// Get your free API key at: https://openrouteservice.org/dev/#/signup

interface DistanceCache {
  [key: string]: number; // "address1|address2" -> distance in km
}

const distanceCache: DistanceCache = {};

// Get API key from environment variable or use a default (you should set your own)
const getApiKey = () => {
  if (typeof window !== 'undefined') {
    // Client-side: try to get from localStorage or use default
    return localStorage.getItem('ors_api_key') || '5b3ce3597851110001cf6248e8e8c8c0b8e44c8a9e8c8c0b8e44c8a';
  }
  return process.env.NEXT_PUBLIC_ORS_API_KEY || '5b3ce3597851110001cf6248e8e8c8c0b8e44c8a9e8c8c0b8e44c8a';
};

// Geocode address to coordinates using OpenRouteService Geocoding API
async function geocodeAddress(address: string): Promise<[number, number] | null> {
  try {
    const apiKey = getApiKey();
    const response = await fetch(
      `https://api.openrouteservice.org/geocoding/search?api_key=${apiKey}&text=${encodeURIComponent(address)}`
    );
    
    if (!response.ok) {
      console.error('Geocoding failed:', response.statusText);
      return null;
    }
    
    const data = await response.json();
    if (data.features && data.features.length > 0) {
      const [lng, lat] = data.features[0].geometry.coordinates;
      return [lat, lng]; // OpenRouteService returns [lng, lat], we need [lat, lng]
    }
    
    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
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
    
    // Call Directions API
    const apiKey = getApiKey();
    const response = await fetch(
      'https://api.openrouteservice.org/v2/directions/driving-car',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': apiKey
        },
        body: JSON.stringify({
          coordinates: [
            [originCoords[1], originCoords[0]], // [lng, lat]
            [destCoords[1], destCoords[0]]
          ]
        })
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Directions API failed:', response.status, errorText);
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

// Clear the distance cache
export function clearDistanceCache(): void {
  Object.keys(distanceCache).forEach(key => delete distanceCache[key]);
}
