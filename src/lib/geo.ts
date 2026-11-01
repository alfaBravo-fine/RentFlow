/**
 * Geolocation & Coordinate Validation Utilities for RentFlow GIS
 * Guarantees strict MapLibre GL coordinate safety:
 * - Latitude must be in [-90, 90]
 * - Longitude must be in [-180, 180]
 * - MapLibre takes [lng, lat] tuples
 */

export interface ValidCoordinates {
  lat: number;
  lng: number;
}

export function isValidLatitude(lat: number): boolean {
  return typeof lat === 'number' && !isNaN(lat) && lat >= -90 && lat <= 90;
}

export function isValidLongitude(lng: number): boolean {
  return typeof lng === 'number' && !isNaN(lng) && lng >= -180 && lng <= 180;
}

/**
 * Parses and sanitizes raw coordinate inputs.
 * Automatically recovers from commonly swapped lat/lng inputs (e.g. lat = -122.4, lng = 37.7).
 * Clamps minor boundary overshoots to [-90, 90] and [-180, 180].
 */
export function sanitizeCoordinates(
  rawLat: unknown,
  rawLng: unknown
): ValidCoordinates | null {
  if (rawLat === null || rawLat === undefined || rawLng === null || rawLng === undefined) {
    return null;
  }
  if (rawLat === '' || rawLng === '') {
    return null;
  }

  let lat = typeof rawLat === 'string' ? parseFloat(rawLat) : Number(rawLat);
  let lng = typeof rawLng === 'string' ? parseFloat(rawLng) : Number(rawLng);

  if (isNaN(lat) || isNaN(lng) || !isFinite(lat) || !isFinite(lng)) {
    return null;
  }

  // Auto-detect swapped lat/lng:
  // Latitudes can never exceed 90 or be below -90. If lat is outside [-90, 90]
  // but lng is within [-90, 90], the coordinates were almost certainly swapped.
  if ((lat < -90 || lat > 90) && (lng >= -90 && lng <= 90)) {
    const temp = lat;
    lat = lng;
    lng = temp;
  }

  // Double check and clamp to valid geodetic ranges
  if (lat < -90) lat = -90;
  if (lat > 90) lat = 90;
  if (lng < -180) lng = -180;
  if (lng > 180) lng = 180;

  return { lat, lng };
}

/**
 * Formats coordinates for MapLibre GL API calls which expect [lng, lat] (longitude first).
 * Returns null if coordinates cannot be safely parsed.
 */
export function safeLngLatTuple(
  rawLat: unknown,
  rawLng: unknown
): [number, number] | null {
  const coords = sanitizeCoordinates(rawLat, rawLng);
  if (!coords) return null;
  return [coords.lng, coords.lat];
}
