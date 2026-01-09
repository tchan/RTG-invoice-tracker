// OpenRouteService API integration for calculating distances
// Free tier available, API key required
// Get your free API key at: https://openrouteservice.org/dev/#/signup
// After signing up, you'll get a free API key with generous rate limits

interface DistanceCache {
  [key: string]: number; // "address1|address2" -> distance in km
}

// In-memory cache for current session (fast lookups)
const distanceCache: DistanceCache = {};

// Rate limiting: OpenRouteService free tier allows 40 requests/minute
// We'll add a delay between API calls to avoid hitting rate limits
const API_DELAY_MS = 1500; // 1.5 seconds between API calls (safe margin)
let lastApiCallTime = 0;

async function rateLimitedDelay(): Promise<void> {
  const now = Date.now();
  const timeSinceLastCall = now - lastApiCallTime;

  if (timeSinceLastCall < API_DELAY_MS) {
    const waitTime = API_DELAY_MS - timeSinceLastCall;
    console.log(`Rate limiting: waiting ${waitTime}ms before next API call`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  lastApiCallTime = Date.now();
}

// Retry helper with exponential backoff
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 3
): Promise<Response> {
  let lastError: Error | null = null;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      lastResponse = response;

      // If rate limited (429), wait and retry
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '5', 10);
        const waitTime = Math.max(retryAfter * 1000, (attempt + 1) * 2000);
        console.log(`Rate limited (429). Waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const waitTime = (attempt + 1) * 2000; // 2s, 4s, 6s
      console.log(`API call failed. Retrying in ${waitTime}ms (attempt ${attempt + 1}/${maxRetries}):`, lastError.message);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  // If we got a response but it was 429 after all retries, return it
  // so the caller can handle the error appropriately
  if (lastResponse) {
    return lastResponse;
  }

  throw lastError || new Error('Max retries exceeded');
}

// Check database cache via API
async function checkDbCache(origin: string, destination: string): Promise<number | null> {
  try {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const params = new URLSearchParams({ origin, destination });
    console.log('Checking database cache for:', { origin, destination });
    const response = await fetch(`${baseUrl}/api/distance-cache?${params}`);

    if (!response.ok) {
      console.error('Database cache check failed:', response.status, response.statusText);
      return null;
    }

    const data = await response.json();
    console.log('Database cache response:', data);
    if (data.cached && data.distance_km !== undefined) {
      return data.distance_km;
    }
    return null;
  } catch (error) {
    console.error('Error checking database cache:', error);
    return null;
  }
}

// Save to database cache via API
async function saveToDbCache(origin: string, destination: string, distanceKm: number): Promise<void> {
  try {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    console.log('Saving to database cache:', { origin, destination, distance_km: distanceKm });
    const response = await fetch(`${baseUrl}/api/distance-cache`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin, destination, distance_km: distanceKm })
    });
    if (!response.ok) {
      console.error('Failed to save to database cache:', response.status, response.statusText);
    } else {
      console.log('Successfully saved distance to database cache');
    }
  } catch (error) {
    console.error('Error saving to database cache:', error);
  }
}

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
    // Rate limit API calls
    await rateLimitedDelay();

    // Use absolute URL to ensure we hit the correct endpoint
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${baseUrl}/api/geocode`;
    console.log('Geocoding address:', address);
    console.log('Calling geocode API:', url);

    // Use POST request with structured address format and retry logic
    const response = await fetchWithRetry(url, {
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
  destination: string,
  skipCache: boolean = false
): Promise<number | null> {
  // If origin and destination are the same, return 0
  const normalizedOrigin = origin.trim().toLowerCase();
  const normalizedDest = destination.trim().toLowerCase();
  if (normalizedOrigin === normalizedDest) {
    console.log('Origin and destination are the same, returning 0 km');
    // Cache in memory
    const cacheKey = `${origin}|${destination}`;
    distanceCache[cacheKey] = 0;
    // Save to database cache
    await saveToDbCache(origin, destination, 0);
    return 0;
  }

  // Check in-memory cache first (fastest)
  const cacheKey = `${origin}|${destination}`;
  const reverseCacheKey = `${destination}|${origin}`;

  if (!skipCache) {
    if (distanceCache[cacheKey]) {
      console.log('Distance found in memory cache:', origin, '->', destination);
      return distanceCache[cacheKey];
    }
    if (distanceCache[reverseCacheKey]) {
      console.log('Distance found in memory cache (reverse):', origin, '->', destination);
      return distanceCache[reverseCacheKey]; // Distance is same both ways
    }

    // Check database cache (persisted across restarts)
    const dbCachedDistance = await checkDbCache(origin, destination);
    if (dbCachedDistance !== null) {
      console.log('Distance found in database cache:', origin, '->', destination, '=', dbCachedDistance, 'km');
      // Also store in memory cache for faster subsequent lookups
      distanceCache[cacheKey] = dbCachedDistance;
      return dbCachedDistance;
    }
  } else {
    console.log('Skipping cache, forcing fresh API call for:', origin, '->', destination);
  }

  try {
    // Geocode addresses sequentially to respect rate limits
    const originCoords = await geocodeAddress(origin);
    if (!originCoords) {
      console.error('Failed to geocode origin address:', origin);
      return null;
    }

    const destCoords = await geocodeAddress(destination);
    if (!destCoords) {
      console.error('Failed to geocode destination address:', destination);
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

    // Rate limit the directions API call
    await rateLimitedDelay();

    // Use absolute URL to ensure we hit the correct endpoint
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${baseUrl}/api/directions`;
    console.log('Calling directions API (not cached):', origin, '->', destination);

    const response = await fetchWithRetry(url, {
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

      // Cache in memory
      distanceCache[cacheKey] = distanceInKm;

      // Also save to database for persistence
      await saveToDbCache(origin, destination, distanceInKm);
      console.log('Distance calculated and cached:', origin, '->', destination, '=', distanceInKm, 'km');

      return distanceInKm;
    }

    console.error('DISTANCE CALCULATION FAILED - No routes in response:', {
      origin,
      destination,
      responseData: data
    });
    return null;
  } catch (error) {
    console.error('DISTANCE CALCULATION FAILED - Exception:', {
      origin,
      destination,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
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
    // Rate limit the matrix API call
    await rateLimitedDelay();

    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${baseUrl}/api/matrix`;

    console.log('Calling matrix API for', locations.length, 'locations');

    const response = await fetchWithRetry(url, {
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

// Clear the distance cache (both memory and database)
export async function clearDistanceCache(): Promise<void> {
  // Clear in-memory cache
  Object.keys(distanceCache).forEach(key => delete distanceCache[key]);

  // Clear database cache
  try {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    await fetch(`${baseUrl}/api/distance-cache`, { method: 'DELETE' });
    console.log('Distance cache cleared (memory and database)');
  } catch (error) {
    console.error('Error clearing database cache:', error);
  }
}
