// Routing and road distance calculation utility
// Uses OSRM (Open Source Routing Machine) for road distance & travel time,
// with graceful fallback to calibrated Haversine road formula when network/offline.

export interface RouteInfo {
  distanceMeters: number
  durationSeconds: number
  isRoadRoute: boolean
  isApproximate: boolean
}

// In-memory cache for road routes to avoid redundant network calls: "lat1,lng1->lat2,lng2"
const routeCache = new Map<string, { info: RouteInfo; timestamp: number }>()
const CACHE_TTL_MS = 60 * 1000 // 60 seconds

// Haversine straight-line distance in meters
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c)
}

/**
 * Calculates road distance and estimated travel time using OSRM routing service.
 * Falls back to Haversine with a 1.25x road factor when OSRM is unreachable.
 * If liveGpsAvailable is false, marks the route as approximate.
 */
export async function calculateRoadDistance(
  driverLat: number,
  driverLng: number,
  destLat: number,
  destLng: number,
  liveGpsAvailable: boolean = true
): Promise<RouteInfo> {
  const cacheKey = `${driverLat.toFixed(4)},${driverLng.toFixed(4)}->${destLat.toFixed(4)},${destLng.toFixed(4)}`
  const cached = routeCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return {
      ...cached.info,
      isApproximate: !liveGpsAvailable || cached.info.isApproximate,
    }
  }

  // Attempt OSRM road routing with 2.5s timeout
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    const timeoutId = controller ? setTimeout(() => controller.abort(), 2500) : null

    const url = `https://router.project-osrm.org/route/v1/driving/${driverLng},${driverLat};${destLng},${destLat}?overview=false`
    const res = await fetch(url, {
      signal: controller?.signal,
    })

    if (timeoutId) clearTimeout(timeoutId)

    if (res.ok) {
      const data = await res.json()
      if (data.code === 'Ok' && Array.isArray(data.routes) && data.routes.length > 0) {
        const route = data.routes[0]
        const result: RouteInfo = {
          distanceMeters: Math.round(route.distance),
          durationSeconds: Math.round(route.duration),
          isRoadRoute: true,
          isApproximate: !liveGpsAvailable,
        }
        routeCache.set(cacheKey, { info: result, timestamp: Date.now() })
        return result
      }
    }
  } catch {
    // Graceful fallback below on network error, CORS, or timeout
  }

  // Fallback: Haversine distance with campus road factor (1.25x) and average speed 20 km/h (~5.5 m/s)
  const straightLine = haversineMeters(driverLat, driverLng, destLat, destLng)
  const roadDistance = Math.round(straightLine * 1.25)
  const durationSec = Math.max(30, Math.round(roadDistance / 5.5))

  const fallbackResult: RouteInfo = {
    distanceMeters: roadDistance,
    durationSeconds: durationSec,
    isRoadRoute: false,
    isApproximate: true, // Tagged approximate since straight-line road approximation was used
  }

  routeCache.set(cacheKey, { info: fallbackResult, timestamp: Date.now() })
  return fallbackResult
}

/**
 * Format distance and ETA nicely for the UI
 */
export function formatDistanceAndEta(info: RouteInfo): {
  distanceText: string
  etaText: string
  badgeText: string
  isApproximate: boolean
} {
  const isApprox = info.isApproximate
  const distMeters = info.distanceMeters

  let distanceText: string
  if (distMeters < 1000) {
    distanceText = `${distMeters} m`
  } else {
    distanceText = `${(distMeters / 1000).toFixed(1)} km`
  }

  if (isApprox) {
    distanceText = `~${distanceText} (approx)`
  }

  const mins = Math.max(1, Math.ceil(info.durationSeconds / 60))
  const etaText = `~${mins} min${mins > 1 ? 's' : ''}`

  let badgeText = ''
  if (info.isRoadRoute && !isApprox) {
    badgeText = 'Road route'
  } else {
    badgeText = 'Approx. distance'
  }

  return {
    distanceText,
    etaText,
    badgeText,
    isApproximate: isApprox,
  }
}
