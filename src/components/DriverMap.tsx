'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  Bus,
  Navigation,
  Layers,
  Radio,
  RotateCcw,
  Crosshair,
  Loader2,
  AlertCircle,
} from 'lucide-react'

// Monkey patch Leaflet DomUtil.getPosition to prevent "Cannot read properties of undefined (reading '_leaflet_pos')"
if (typeof window !== 'undefined' && L && L.DomUtil) {
  const origGetPos = L.DomUtil.getPosition
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  L.DomUtil.getPosition = function (el: any) {
    if (!el) {
      return new L.Point(0, 0)
    }
    try {
      return origGetPos.call(this, el) || new L.Point(0, 0)
    } catch {
      return new L.Point(0, 0)
    }
  }
}

export interface ShuttleItem {
  id: string
  vehicleNumber: string
  availableSeats: number
  capacity: number
  currentLat: number | null
  currentLng: number | null
  driver: {
    name: string
    phone?: string
  }
}

export interface DriverMapProps {
  shuttles: ShuttleItem[]
  activeVehicleId?: string
  userLocation?: { lat: number; lng: number; accuracy?: number } | null
  onSelectShuttle?: (shuttle: ShuttleItem) => void
  onSelectStop?: (stopName: string) => void
  onRequestLocation?: () => void
}

// Exact KARE Campus Building Landmarks from Aerial Survey
export const CAMPUS_STOPS = [
  { name: 'Main Gate', lat: 9.5761, lng: 77.6833, icon: '🚪' },
  { name: 'Girls Hostel', lat: 9.5762, lng: 77.6814, icon: '🏢' },
  { name: 'Library', lat: 9.5747, lng: 77.6787, icon: '📚' },
  { name: 'Admin Block', lat: 9.5741, lng: 77.6760, icon: '🏛️' },
  { name: '8th Block', lat: 9.5750, lng: 77.6761, icon: '🏬' },
  { name: '9th Block', lat: 9.5743, lng: 77.6748, icon: '🏬' },
  { name: '7th Block', lat: 9.5738, lng: 77.6739, icon: '🏬' },
  { name: '11th Block', lat: 9.5732, lng: 77.6751, icon: '🏬' },
]

export default function DriverMap({
  shuttles,
  activeVehicleId,
  userLocation: propUserLocation,
  onSelectShuttle,
  onSelectStop,
  onRequestLocation,
}: DriverMapProps) {
  const mapRef = useRef<L.Map | null>(null)
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const shuttleMarkersRef = useRef<{ [key: string]: L.Marker }>({})
  const prevPositionsRef = useRef<{ [key: string]: { lat: number; lng: number } }>({})
  const animFramesRef = useRef<{ [key: string]: number }>({})
  const labelsLayerRef = useRef<L.TileLayer | null>(null)
  const lastPanCoordsRef = useRef<{ lat: number; lng: number } | null>(null)

  // Stable callback refs to prevent map unmount/re-initialization loops
  const onSelectStopRef = useRef(onSelectStop)
  useEffect(() => {
    onSelectStopRef.current = onSelectStop
  }, [onSelectStop])

  const onSelectShuttleRef = useRef(onSelectShuttle)
  useEffect(() => {
    onSelectShuttleRef.current = onSelectShuttle
  }, [onSelectShuttle])

  // User location marker and accuracy circle refs
  const userMarkerRef = useRef<L.Marker | null>(null)
  const userAccuracyCircleRef = useRef<L.Circle | null>(null)
  const watchPositionIdRef = useRef<number | null>(null)

  // Tracking state refs for event listeners
  // NOTE: isTracking defaults to false so the map does NOT move automatically and fight the user!
  const isTrackingRef = useRef<boolean>(false)
  const isManuallyDraggedRef = useRef<boolean>(false)
  const selectedShuttleIdRef = useRef<string | null>(null)

  // UI state
  const [isTracking, setIsTracking] = useState<boolean>(false)
  const [isManuallyDragged, setIsManuallyDragged] = useState<boolean>(false)
  const [showHybridLabels, setShowHybridLabels] = useState<boolean>(true)
  const [selectedShuttleId, setSelectedShuttleId] = useState<string | null>(activeVehicleId || null)
  const [lastTelemetryUpdate, setLastTelemetryUpdate] = useState<string>('Just now')

  // User Location State
  const [internalUserLocation, setInternalUserLocation] = useState<{
    lat: number
    lng: number
    accuracy?: number
  } | null>(null)
  const [isLocatingUser, setIsLocatingUser] = useState<boolean>(false)
  const [locationToast, setLocationToast] = useState<string | null>(null)
  const [showLocationBanner, setShowLocationBanner] = useState<boolean>(false)

  const activeUserLocation =
    propUserLocation ||
    internalUserLocation || {
      lat: 9.5748,
      lng: 77.6785,
      accuracy: 20,
      isDefault: true,
    }

  // Synchronize selectedShuttleId
  useEffect(() => {
    if (activeVehicleId) {
      setSelectedShuttleId(activeVehicleId)
      selectedShuttleIdRef.current = activeVehicleId
    } else if (!selectedShuttleIdRef.current && shuttles.length > 0) {
      setSelectedShuttleId(shuttles[0].id)
      selectedShuttleIdRef.current = shuttles[0].id
    }
  }, [activeVehicleId, shuttles])

  // Sync state with refs
  useEffect(() => {
    isTrackingRef.current = isTracking
  }, [isTracking])

  useEffect(() => {
    isManuallyDraggedRef.current = isManuallyDragged
  }, [isManuallyDragged])

  // Smooth position interpolation helper
  const animateMarkerPosition = useCallback(
    (
      shuttleId: string,
      marker: L.Marker,
      start: { lat: number; lng: number },
      target: { lat: number; lng: number },
      durationMs = 1200
    ) => {
      if (animFramesRef.current[shuttleId]) {
        cancelAnimationFrame(animFramesRef.current[shuttleId])
      }

      const startTime = performance.now()

      const step = (currentTime: number) => {
        const elapsed = currentTime - startTime
        const progress = Math.min(elapsed / durationMs, 1)

        // Ease-out cubic formula
        const ease = 1 - Math.pow(1 - progress, 3)

        const currentLat = start.lat + (target.lat - start.lat) * ease
        const currentLng = start.lng + (target.lng - start.lng) * ease

        marker.setLatLng([currentLat, currentLng])

        if (progress < 1) {
          animFramesRef.current[shuttleId] = requestAnimationFrame(step)
        } else {
          delete animFramesRef.current[shuttleId]
        }
      }

      animFramesRef.current[shuttleId] = requestAnimationFrame(step)
    },
    []
  )

  // Initialize Satellite Map centered directly on real college campus buildings
  // Empty dependency array ensures it initializes ONCE on mount and does NOT re-initialize on state changes!
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    // Center on true Kalasalingam Academy campus core (~9.5748° N, 77.6785° E)
    const map = L.map(mapContainerRef.current, {
      center: [9.5748, 77.6785],
      zoom: 16.5,
      zoomSnap: 0.25,
      zoomControl: false,
      attributionControl: false,
    })

    // 1. High-Resolution Esri World Imagery (Satellite Tiles)
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxNativeZoom: 19,
        maxZoom: 20,
        attribution:
          'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
      }
    ).addTo(map)

    // 2. Hybrid Label Overlay for Roads, Walkways & Landmark Names
    const hybridLabelsLayer = L.tileLayer(
      'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      {
        maxNativeZoom: 19,
        maxZoom: 20,
        opacity: 0.9,
      }
    ).addTo(map)
    labelsLayerRef.current = hybridLabelsLayer

    // Detect user manual interaction (dragging, zooming, touching) to immediately stop auto-pan
    const handleUserInteraction = () => {
      setIsManuallyDragged(true)
      isManuallyDraggedRef.current = true
      setIsTracking(false)
      isTrackingRef.current = false
    }

    map.on('dragstart', handleUserInteraction)
    map.on('zoomstart', handleUserInteraction)
    map.on('touchstart', handleUserInteraction)

    // Render All 8 High-Contrast Campus Landmark Badges
    CAMPUS_STOPS.forEach((stop) => {
      const stopIconHtml = `
        <div class="campus-stop-badge">
          <div class="stop-badge-content">
            <span class="stop-dot"></span>
            <span class="stop-icon">${stop.icon}</span>
            <span class="stop-name">${stop.name}</span>
          </div>
          <div class="stop-pointer"></div>
        </div>
      `

      const stopIcon = L.divIcon({
        className: 'custom-stop-marker-wrapper',
        html: stopIconHtml,
        iconSize: [120, 36],
        iconAnchor: [60, 36],
        popupAnchor: [0, -36],
      })

      const stopPopupContent = `
        <div class="stop-popup-card">
          <div class="stop-popup-header">
            <span>${stop.icon}</span>
            <h4>${stop.name}</h4>
          </div>
          <p class="stop-popup-sub">KARE Campus Designated Shuttle Pickup & Drop Point</p>
          <div class="stop-popup-gps">
            <span>GPS: ${stop.lat.toFixed(4)}°N, ${stop.lng.toFixed(4)}°E</span>
          </div>
        </div>
      `

      const marker = L.marker([stop.lat, stop.lng], { icon: stopIcon })
        .addTo(map)
        .bindPopup(stopPopupContent, {
          closeButton: false,
          offset: [0, -10],
          className: 'dark-glass-popup',
        })

      marker.on('click', () => {
        if (onSelectStopRef.current) onSelectStopRef.current(stop.name)
      })
    })

    mapRef.current = map

    return () => {
      if (watchPositionIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchPositionIdRef.current)
        watchPositionIdRef.current = null
      }
      Object.values(animFramesRef.current).forEach((frameId) => cancelAnimationFrame(frameId))
      animFramesRef.current = {}
      if (mapRef.current) {
        try {
          mapRef.current.stop()
          mapRef.current.off()
          mapRef.current.remove()
        } catch (e) {
          console.warn('Map cleanup error:', e)
        }
        mapRef.current = null
      }
    }
  }, [])

  // Locate Current User Device GPS & Start Live Watch
  const locateUser = useCallback(
    (centerMap = false) => {
      if (typeof window === 'undefined' || !navigator.geolocation) {
        setLocationToast('Geolocation not supported by device')
        setTimeout(() => setLocationToast(null), 3000)
        return
      }

      setIsLocatingUser(true)

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude
          const lng = pos.coords.longitude
          const accuracy = pos.coords.accuracy

          setInternalUserLocation({ lat, lng, accuracy })
          setIsLocatingUser(false)
          setShowLocationBanner(false)
          setLocationToast('Live GPS location active!')
          setTimeout(() => setLocationToast(null), 2500)

          if (centerMap && mapRef.current) {
            setIsManuallyDragged(true)
            isManuallyDraggedRef.current = true
            mapRef.current.flyTo([lat, lng], 17.5, { animate: true, duration: 1.0 })
          }

          // Start watching position continuously if not already started
          if (watchPositionIdRef.current === null) {
            watchPositionIdRef.current = navigator.geolocation.watchPosition(
              (p) => {
                setInternalUserLocation({
                  lat: p.coords.latitude,
                  lng: p.coords.longitude,
                  accuracy: p.coords.accuracy,
                })
              },
              (err) => console.warn('GPS watch error:', err),
              { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
            )
          }
        },
        (err) => {
          console.warn('Geolocation lookup notice:', err.message)
          setIsLocatingUser(false)
          setShowLocationBanner(true)
          setLocationToast('Please enable device location')
          setTimeout(() => setLocationToast(null), 3000)
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
      )
    },
    []
  )

  // Check initial permission status or trigger locate
  useEffect(() => {
    if (typeof window !== 'undefined' && 'permissions' in navigator) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((permissionStatus) => {
          if (permissionStatus.state === 'granted') {
            locateUser(false)
          } else if (permissionStatus.state === 'prompt') {
            setShowLocationBanner(true)
          }
        })
        .catch(() => {
          locateUser(false)
        })
    } else {
      locateUser(false)
    }
  }, [locateUser])

  // Render or Update User Location Marker (Student icon with pulsing radar waves)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !activeUserLocation) return

    const { lat, lng, accuracy } = activeUserLocation
    const isCampusDefault = Boolean((activeUserLocation as { isDefault?: boolean })?.isDefault)

    const userIconHtml = `
      <div class="user-marker-container">
        <!-- Concentric Pulsing Blue Waves -->
        <div class="user-radar-ring ring-1"></div>
        <div class="user-radar-ring ring-2"></div>

        <!-- Student Scholar Puck Disk with Crisp Graduation Cap & Silhouette SVG -->
        <div class="user-core-puck">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="student-svg">
            <path d="M22 10v6M2 10l10-5 10 5-10 5z" fill="rgba(255,255,255,0.25)"/>
            <path d="M6 12v5c3 3 9 3 12 0v-5"/>
            <circle cx="12" cy="13" r="2.5" fill="#ffffff"/>
          </svg>
        </div>

        <!-- Distinct "Student (You)" Badge -->
        <div class="user-badge-tag">
          <span class="user-live-indicator"></span>
          ${isCampusDefault ? 'Student' : 'Student (You)'}
        </div>
      </div>
    `

    const userIcon = L.divIcon({
      className: 'custom-user-marker-wrap',
      html: userIconHtml,
      iconSize: [60, 60],
      iconAnchor: [30, 30],
      popupAnchor: [0, -30],
    })

    const popupContent = `
      <div class="user-popup-card">
        <div class="user-popup-header">
          <span class="user-popup-indicator"></span>
          <strong>${isCampusDefault ? 'Student Campus Zone' : 'Your Live Location'}</strong>
        </div>
        <p class="user-popup-coords">${lat.toFixed(5)}°N, ${lng.toFixed(5)}°E</p>
        ${
          isCampusDefault
            ? '<p class="user-popup-acc text-amber-300">Default campus position • Click "My Location" to refine</p>'
            : accuracy
            ? `<p class="user-popup-acc">GPS Accuracy: ±${Math.round(accuracy)}m</p>`
            : ''
        }
      </div>
    `

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([lat, lng])
      userMarkerRef.current.setIcon(userIcon)
      userMarkerRef.current.setPopupContent(popupContent)
    } else {
      const marker = L.marker([lat, lng], { icon: userIcon, zIndexOffset: 1000 })
        .addTo(map)
        .bindPopup(popupContent, {
          closeButton: false,
          className: 'dark-glass-popup',
        })
      userMarkerRef.current = marker
    }

    if (accuracy && accuracy < 500) {
      if (userAccuracyCircleRef.current) {
        userAccuracyCircleRef.current.setLatLng([lat, lng])
        userAccuracyCircleRef.current.setRadius(accuracy)
      } else {
        const circle = L.circle([lat, lng], {
          radius: accuracy,
          color: '#38bdf8',
          weight: 1,
          opacity: 0.5,
          fillColor: '#0284c7',
          fillOpacity: 0.08,
        }).addTo(map)
        userAccuracyCircleRef.current = circle
      }
    }
  }, [activeUserLocation])

  // Toggle Hybrid Labels
  const toggleHybridLabels = () => {
    if (!mapRef.current || !labelsLayerRef.current) return

    if (showHybridLabels) {
      mapRef.current.removeLayer(labelsLayerRef.current)
      setShowHybridLabels(false)
    } else {
      labelsLayerRef.current.addTo(mapRef.current)
      setShowHybridLabels(true)
    }
  }

  // Helper to focus map view smoothly on driver's shuttle and open its live popup
  const focusDriver = useCallback(
    (shuttleId?: string) => {
      const targetShuttle =
        shuttles.find((s) => s.id === (shuttleId || selectedShuttleIdRef.current || activeVehicleId)) ||
        shuttles[0]

      if (targetShuttle && mapRef.current) {
        const lat = targetShuttle.currentLat ?? 9.5761
        const lng = targetShuttle.currentLng ?? 77.6833
        mapRef.current.flyTo([lat, lng], 17.5, { animate: true, duration: 1.0 })
        setSelectedShuttleId(targetShuttle.id)
        selectedShuttleIdRef.current = targetShuttle.id
        setIsTracking(true)
        isTrackingRef.current = true
        setIsManuallyDragged(false)
        isManuallyDraggedRef.current = false
        lastPanCoordsRef.current = { lat, lng }

        // Open marker popup
        const marker = shuttleMarkersRef.current[targetShuttle.id]
        if (marker) {
          setTimeout(() => {
            if (mapRef.current && marker) {
              marker.openPopup()
            }
          }, 500)
        }
      }
    },
    [shuttles, activeVehicleId]
  )

  // Toggle or Re-center Auto-Pan Live Tracking
  const handleRecenterOrToggle = (forceEnable = false) => {
    const nextTrackingState = forceEnable ? true : isManuallyDragged ? true : !isTracking
    setIsTracking(nextTrackingState)
    isTrackingRef.current = nextTrackingState
    setIsManuallyDragged(false)
    isManuallyDraggedRef.current = false

    if (nextTrackingState && mapRef.current) {
      const targetShuttle =
        shuttles.find((s) => s.id === (selectedShuttleIdRef.current || activeVehicleId)) ||
        shuttles[0]

      if (targetShuttle) {
        const lat = targetShuttle.currentLat ?? 9.5761
        const lng = targetShuttle.currentLng ?? 77.6833
        lastPanCoordsRef.current = { lat, lng }
        mapRef.current.panTo([lat, lng], { animate: true, duration: 1.0 })
      }
    }
  }

  // Update Live Shuttle Markers with Smooth Coordinate Transitions & Animated Radar Pulse
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const currentMarkers = shuttleMarkersRef.current
    const prevPositions = prevPositionsRef.current

    // Clean up inactive markers
    Object.keys(currentMarkers).forEach((shuttleId) => {
      if (!shuttles.some((s) => s.id === shuttleId)) {
        if (animFramesRef.current[shuttleId]) {
          cancelAnimationFrame(animFramesRef.current[shuttleId])
          delete animFramesRef.current[shuttleId]
        }
        currentMarkers[shuttleId].remove()
        delete currentMarkers[shuttleId]
        delete prevPositions[shuttleId]
      }
    })

    // Process active shuttles
    shuttles.forEach((shuttle) => {
      const targetLat = shuttle.currentLat ?? 9.5761
      const targetLng = shuttle.currentLng ?? 77.6833
      const isSelected = shuttle.id === (selectedShuttleId || activeVehicleId)

      const shuttleIconHtml = `
        <div class="shuttle-marker-container ${isSelected ? 'selected' : ''}">
          <!-- Radar Telemetry Pulse Waves -->
          <div class="radar-pulse-ring ring-1"></div>
          <div class="radar-pulse-ring ring-2"></div>
          
          <!-- Live Telemetry Broadcasting Beacon Dot -->
          <div class="telemetry-beacon">
            <span class="beacon-pulse"></span>
          </div>

          <!-- Vehicle Puck Disk with Dedicated Campus Auto/Shuttle SVG -->
          <div class="vehicle-puck">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="vehicle-svg">
              <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 2.8C2.1 10.8 2 11 2 11.2V16c0 .6.4 1 1 1h2" fill="rgba(255,255,255,0.2)"/>
              <circle cx="7" cy="17" r="2" fill="#ffffff" stroke="#0f172a" stroke-width="1.5"/>
              <path d="M9 17h6"/>
              <circle cx="17" cy="17" r="2" fill="#ffffff" stroke="#0f172a" stroke-width="1.5"/>
            </svg>
          </div>

          <!-- Vehicle Number Badge Tag -->
          <div class="vehicle-number-tag">
            <span class="status-dot"></span>
            ${shuttle.vehicleNumber}
          </div>
        </div>
      `

      const customIcon = L.divIcon({
        className: 'custom-shuttle-marker-wrap',
        html: shuttleIconHtml,
        iconSize: [64, 64],
        iconAnchor: [32, 32],
        popupAnchor: [0, -32],
      })

      const popupContent = `
        <div class="shuttle-popup-card">
          <div class="shuttle-popup-header">
            <div class="shuttle-title">
              <span class="icon">🚌</span>
              <div>
                <strong>${shuttle.vehicleNumber}</strong>
                <span class="status-live">LIVE GPS TELEMETRY</span>
              </div>
            </div>
            <span class="seats-pill">${shuttle.availableSeats}/${shuttle.capacity} Seats</span>
          </div>

          <div class="shuttle-popup-driver">
            <span>Driver:</span>
            <strong>${shuttle.driver.name}</strong>
            ${shuttle.driver.phone ? `<span class="driver-phone">(${shuttle.driver.phone})</span>` : ''}
          </div>

          <div class="shuttle-popup-coords">
            <span>Lat: ${targetLat.toFixed(5)}°</span> • <span>Lng: ${targetLng.toFixed(5)}°</span>
          </div>
        </div>
      `

      if (currentMarkers[shuttle.id]) {
        const marker = currentMarkers[shuttle.id]
        marker.setIcon(customIcon)
        marker.setPopupContent(popupContent)

        // Smooth coordinate transition
        const prev = prevPositions[shuttle.id]
        if (
          prev &&
          (Math.abs(prev.lat - targetLat) > 0.000005 || Math.abs(prev.lng - targetLng) > 0.000005)
        ) {
          animateMarkerPosition(shuttle.id, marker, prev, { lat: targetLat, lng: targetLng }, 1200)
        } else if (!prev) {
          marker.setLatLng([targetLat, targetLng])
        }

        prevPositions[shuttle.id] = { lat: targetLat, lng: targetLng }
      } else {
        const marker = L.marker([targetLat, targetLng], { icon: customIcon })
          .addTo(map)
          .bindPopup(popupContent, {
            closeButton: false,
            className: 'dark-glass-popup',
          })

        marker.on('click', () => {
          setSelectedShuttleId(shuttle.id)
          selectedShuttleIdRef.current = shuttle.id
          if (onSelectShuttleRef.current) onSelectShuttleRef.current(shuttle)
        })

        currentMarkers[shuttle.id] = marker
        prevPositions[shuttle.id] = { lat: targetLat, lng: targetLng }
      }
    })

    const now = new Date()
    setLastTelemetryUpdate(
      now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    )

    // Auto-Pan & Tracking Logic (ONLY when user explicitly enabled tracking AND NOT manually dragging)
    if (isTrackingRef.current && !isManuallyDraggedRef.current) {
      const trackedShuttle =
        shuttles.find((s) => s.id === (selectedShuttleIdRef.current || activeVehicleId)) ||
        shuttles[0]

      if (trackedShuttle && trackedShuttle.currentLat && trackedShuttle.currentLng) {
        const lat = trackedShuttle.currentLat
        const lng = trackedShuttle.currentLng
        const prev = lastPanCoordsRef.current

        // Only pan if vehicle has moved noticeably (more than 15 meters)
        if (!prev || Math.hypot(lat - prev.lat, lng - prev.lng) > 0.00015) {
          lastPanCoordsRef.current = { lat, lng }
          map.panTo([lat, lng], { animate: true, duration: 1.0 })
        }
      }
    }
  }, [shuttles, selectedShuttleId, activeVehicleId, animateMarkerPosition])

  // Instant Real-Time GPS updates via Server-Sent Events
  useEffect(() => {
    if (typeof window === 'undefined') return
    let es: EventSource | null = null

    try {
      es = new EventSource('/api/realtime?channel=shuttles_gps')

      es.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.event === 'shuttle_moved' && msg.data) {
            const updatedVehicle = msg.data
            const marker = shuttleMarkersRef.current[updatedVehicle.id]
            if (marker && updatedVehicle.currentLat && updatedVehicle.currentLng) {
              const prev = prevPositionsRef.current[updatedVehicle.id] || {
                lat: updatedVehicle.currentLat,
                lng: updatedVehicle.currentLng,
              }
              animateMarkerPosition(
                updatedVehicle.id,
                marker,
                prev,
                { lat: updatedVehicle.currentLat, lng: updatedVehicle.currentLng },
                1000
              )
              prevPositionsRef.current[updatedVehicle.id] = {
                lat: updatedVehicle.currentLat,
                lng: updatedVehicle.currentLng,
              }
              const now = new Date()
              setLastTelemetryUpdate(
                now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
              )
            }
          }
        } catch {
          // Keep stream resilient
        }
      }
    } catch (err) {
      console.warn('Realtime SSE notice:', err)
    }

    return () => {
      if (es) es.close()
    }
  }, [animateMarkerPosition])

  const trackedShuttle =
    shuttles.find((s) => s.id === (selectedShuttleId || activeVehicleId)) || shuttles[0]

  return (
    <div className="relative w-full h-[320px] xs:h-[360px] sm:h-[400px] lg:h-[440px] rounded-3xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950 select-none group">
      {/* Global CSS styles for leaflet animations, markers & dark popups */}
      <style jsx global>{`
        /* Radar pulse ring animations */
        @keyframes radar-pulse-wave {
          0% {
            transform: scale(0.65);
            opacity: 0.9;
          }
          60% {
            transform: scale(1.5);
            opacity: 0.35;
          }
          100% {
            transform: scale(2.2);
            opacity: 0;
          }
        }

        @keyframes beacon-ping {
          0% {
            transform: scale(0.9);
            opacity: 0.9;
          }
          70%, 100% {
            transform: scale(2.3);
            opacity: 0;
          }
        }

        /* Leaflet DivIcon Resets */
        .custom-user-marker-wrap,
        .custom-shuttle-marker-wrap,
        .campus-stop-marker-wrap,
        .leaflet-div-icon {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          overflow: visible !important;
        }

        /* User Location Marker ("Student (You)") */
        .user-marker-container {
          position: relative;
          width: 60px;
          height: 60px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        .user-radar-ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 2px solid #38bdf8;
          animation: radar-pulse-wave 2.2s cubic-bezier(0.15, 0.85, 0.35, 1) infinite;
          pointer-events: none;
        }

        .user-radar-ring.ring-2 {
          animation-delay: 0.9s;
          border-color: #0284c7;
        }

        .user-core-puck {
          position: relative;
          z-index: 4;
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: linear-gradient(135deg, #0284c7, #0369a1);
          border: 2.5px solid #ffffff;
          box-shadow: 0 0 18px rgba(56, 189, 248, 0.9), 0 4px 12px rgba(0, 0, 0, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #ffffff;
          transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .user-marker-container:hover .user-core-puck {
          transform: scale(1.1);
        }

        .student-svg {
          filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
        }

        .user-badge-tag {
          position: absolute;
          bottom: -10px;
          z-index: 5;
          background: rgba(11, 19, 43, 0.95);
          border: 1.5px solid #38bdf8;
          border-radius: 9999px;
          padding: 1.5px 8px;
          font-size: 9.5px;
          font-weight: 800;
          color: #38bdf8;
          white-space: nowrap;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.9);
          display: flex;
          align-items: center;
          gap: 4px;
          letter-spacing: 0.3px;
        }

        .user-live-indicator {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #38bdf8;
          box-shadow: 0 0 5px #38bdf8;
        }

        .user-popup-header {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 700;
          color: #ffffff;
        }

        .user-popup-indicator {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #38bdf8;
        }

        .user-popup-coords {
          font-size: 10px;
          color: #38bdf8;
          font-family: monospace;
          margin-top: 3px;
        }

        .user-popup-acc {
          font-size: 9px;
          color: #94a3b8;
          margin-top: 2px;
        }

        /* Campus Stop Landmark Badges */
        .campus-stop-badge {
          position: relative;
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          cursor: pointer;
          filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.9));
        }

        .stop-badge-content {
          background: rgba(11, 19, 43, 0.92);
          border: 1.5px solid #38bdf8;
          backdrop-filter: blur(8px);
          color: #f8fafc;
          padding: 4px 9px;
          border-radius: 9999px;
          font-size: 11px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 5px;
          white-space: nowrap;
          box-shadow: 0 0 12px rgba(56, 189, 248, 0.35);
          letter-spacing: 0.2px;
          transition: transform 0.2s ease, border-color 0.2s ease;
        }

        .campus-stop-badge:hover .stop-badge-content {
          border-color: #7dd3fc;
          transform: translateY(-2px);
          box-shadow: 0 0 16px rgba(56, 189, 248, 0.6);
        }

        .stop-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #38bdf8;
          box-shadow: 0 0 6px #38bdf8;
          flex-shrink: 0;
        }

        .stop-icon {
          font-size: 12px;
          line-height: 1;
        }

        .stop-name {
          color: #ffffff;
          text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
        }

        .stop-pointer {
          width: 0;
          height: 0;
          border-left: 5px solid transparent;
          border-right: 5px solid transparent;
          border-top: 6px solid #38bdf8;
          margin-top: -1px;
        }

        /* Shuttle Vehicle Marker */
        .shuttle-marker-container {
          position: relative;
          width: 64px;
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        .radar-pulse-ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 2px solid #f59e0b;
          animation: radar-pulse-wave 2s cubic-bezier(0.15, 0.85, 0.35, 1) infinite;
          pointer-events: none;
        }

        .radar-pulse-ring.ring-2 {
          animation-delay: 0.75s;
          border-color: #fbbf24;
        }

        .shuttle-marker-container.selected .radar-pulse-ring {
          border-color: #10b981;
        }

        .telemetry-beacon {
          position: absolute;
          top: 5px;
          right: 5px;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #10b981;
          border: 2px solid #0f172a;
          box-shadow: 0 0 8px #10b981;
          z-index: 10;
        }

        .beacon-pulse {
          position: absolute;
          inset: -2px;
          border-radius: 50%;
          background: #10b981;
          animation: beacon-ping 1.4s cubic-bezier(0, 0, 0.2, 1) infinite;
        }

        .vehicle-puck {
          position: relative;
          z-index: 4;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: linear-gradient(135deg, #f59e0b, #d97706);
          border: 2.5px solid #ffffff;
          box-shadow: 0 0 16px rgba(245, 158, 11, 0.7), 0 6px 14px rgba(0, 0, 0, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #ffffff;
          transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .shuttle-marker-container.selected .vehicle-puck {
          background: linear-gradient(135deg, #10b981, #059669);
          box-shadow: 0 0 20px rgba(16, 185, 129, 0.8), 0 6px 14px rgba(0, 0, 0, 0.8);
        }

        .shuttle-marker-container:hover .vehicle-puck {
          transform: scale(1.1);
        }

        .vehicle-svg {
          filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4));
        }

        .vehicle-number-tag {
          position: absolute;
          bottom: -8px;
          z-index: 5;
          background: rgba(11, 19, 43, 0.95);
          border: 1.5px solid #f59e0b;
          border-radius: 9999px;
          padding: 1px 8px;
          font-size: 9.5px;
          font-weight: 800;
          color: #fbbf24;
          white-space: nowrap;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.9);
          display: flex;
          align-items: center;
          gap: 4px;
          letter-spacing: 0.3px;
        }

        .shuttle-marker-container.selected .vehicle-number-tag {
          border-color: #10b981;
          color: #34d399;
        }

        .status-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 4px #10b981;
        }

        /* Dark Glass Leaflet Popup Overrides */
        .dark-glass-popup .leaflet-popup-content-wrapper {
          background: rgba(11, 19, 43, 0.94) !important;
          color: #f8fafc !important;
          border: 1px solid rgba(56, 189, 248, 0.35) !important;
          border-radius: 18px !important;
          box-shadow: 0 15px 30px -5px rgba(0, 0, 0, 0.8), 0 0 15px rgba(56, 189, 248, 0.2) !important;
          backdrop-filter: blur(14px) !important;
          padding: 4px !important;
        }

        .dark-glass-popup .leaflet-popup-tip {
          background: rgba(11, 19, 43, 0.94) !important;
          border: 1px solid rgba(56, 189, 248, 0.35) !important;
        }

        .dark-glass-popup .leaflet-popup-content {
          margin: 10px 12px !important;
          line-height: 1.4 !important;
        }

        .stop-popup-card {
          font-family: inherit;
        }

        .stop-popup-header {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          font-weight: 700;
          color: #ffffff;
        }

        .stop-popup-sub {
          font-size: 11px;
          color: #94a3b8;
          margin: 4px 0 6px 0;
        }

        .stop-popup-gps {
          font-size: 10px;
          color: #38bdf8;
          font-family: monospace;
          background: rgba(56, 189, 248, 0.1);
          padding: 2px 6px;
          border-radius: 6px;
          display: inline-block;
        }

        .shuttle-popup-card {
          font-family: inherit;
          min-width: 170px;
        }

        .shuttle-popup-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          padding-bottom: 6px;
          margin-bottom: 6px;
        }

        .shuttle-title {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .shuttle-title strong {
          font-size: 13px;
          color: #ffffff;
          display: block;
        }

        .status-live {
          font-size: 8px;
          color: #10b981;
          font-weight: 800;
          letter-spacing: 0.5px;
        }

        .seats-pill {
          background: rgba(16, 185, 129, 0.15);
          border: 1px solid #10b981;
          color: #34d399;
          font-size: 10px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 9999px;
          white-space: nowrap;
        }

        .shuttle-popup-driver {
          font-size: 11px;
          color: #cbd5e1;
          margin-bottom: 4px;
        }

        .driver-phone {
          color: #94a3b8;
          font-size: 10px;
        }

        .shuttle-popup-coords {
          font-size: 9px;
          color: #fbbf24;
          font-family: monospace;
        }
      `}</style>

      {/* Leaflet Map Div */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Location Access Prompt Overlay Banner */}
      {showLocationBanner && !activeUserLocation && (
        <div className="absolute top-12 inset-x-2.5 sm:top-14 sm:inset-x-4 z-[1001] p-3 rounded-2xl bg-slate-900/95 border border-amber-500/40 shadow-2xl backdrop-blur-md flex items-center justify-between gap-2.5 animate-fadeIn">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-[10px] sm:text-xs text-slate-200 truncate">
              Please turn on device location for live GPS campus tracking.
            </p>
          </div>
          <button
            onClick={() => {
              if (onRequestLocation) onRequestLocation()
              locateUser(true)
            }}
            className="px-2.5 py-1 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[10px] sm:text-xs shrink-0 transition-colors"
          >
            Turn On GPS
          </button>
        </div>
      )}

      {/* Toast Notification */}
      {locationToast && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[1002] px-3 py-1.5 rounded-full bg-slate-900/95 border border-blue-500/40 text-blue-300 text-[10px] font-semibold shadow-2xl backdrop-blur-md animate-fadeIn flex items-center gap-1.5 pointer-events-none">
          <Crosshair className="w-3 h-3 text-blue-400" />
          <span>{locationToast}</span>
        </div>
      )}

      {/* TOP FLOATING OVERLAY: CONTROLS & STATUS */}
      <div className="absolute top-2.5 inset-x-2.5 sm:top-3 sm:inset-x-3 z-[1000] flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        
        {/* Left: Satellite & Telemetry Badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-2xl bg-slate-950/85 border border-slate-800 backdrop-blur-md text-[10px] sm:text-[11px] font-semibold text-slate-200 shadow-xl pointer-events-auto">
          <span className="flex h-2 w-2 relative shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-blue-400 font-bold hidden xs:inline">KARE Satellite</span>
          <span className="text-slate-500 hidden xs:inline">•</span>
          <span className="text-slate-300 font-mono text-[9px] sm:text-[10px] truncate">
            {shuttles.length} Shuttle{shuttles.length !== 1 ? 's' : ''} Online
          </span>
        </div>

        {/* Right: Controls ("View Driver", "My Location", "Labels", "Track Driver" / "Re-center") */}
        <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
          
          {/* "View Driver" Button */}
          <button
            onClick={() => focusDriver()}
            title="Focus & View Live Driver on Satellite Map"
            className="px-2.5 py-1.5 rounded-2xl bg-amber-500/15 border border-amber-500/50 hover:bg-amber-500/25 text-amber-300 hover:text-amber-200 text-[10px] sm:text-[11px] font-bold flex items-center gap-1.5 transition-all shadow-xl backdrop-blur-md"
          >
            <Bus className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden xs:inline">View Driver</span>
          </button>

          {/* "My Location" Button */}
          <button
            onClick={() => {
              if (onRequestLocation) onRequestLocation()
              locateUser(true)
            }}
            disabled={isLocatingUser}
            title="Locate and Center on My Position"
            className="px-2.5 py-1.5 rounded-2xl bg-slate-950/85 border border-slate-800 hover:border-blue-500/50 hover:bg-slate-900 text-blue-400 hover:text-blue-300 text-[10px] sm:text-[11px] font-bold flex items-center gap-1.5 transition-all shadow-xl backdrop-blur-md disabled:opacity-50"
          >
            {isLocatingUser ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
            ) : (
              <Crosshair className="w-3.5 h-3.5" />
            )}
            <span className="hidden xs:inline">My Location</span>
          </button>

          {/* Hybrid Labels Toggle Button */}
          <button
            onClick={toggleHybridLabels}
            title={showHybridLabels ? 'Hide Landmark Labels' : 'Show Landmark Labels'}
            className={`px-2.5 py-1.5 rounded-2xl border text-[10px] sm:text-[11px] font-bold flex items-center gap-1.5 transition-all shadow-xl backdrop-blur-md ${
              showHybridLabels
                ? 'bg-blue-600/25 border-blue-500/50 text-blue-300 hover:bg-blue-600/35'
                : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Labels:</span>
            <span>{showHybridLabels ? 'ON' : 'OFF'}</span>
          </button>

          {/* Track Driver / Follow Shuttle Toggle Button */}
          {isManuallyDragged ? (
            <button
              onClick={() => handleRecenterOrToggle(true)}
              className="px-2.5 sm:px-3 py-1.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 border border-amber-400/50 text-slate-950 text-[10px] sm:text-[11px] font-extrabold flex items-center gap-1.5 transition-all shadow-xl shadow-amber-950/40 animate-pulse"
              title="Manual Pan Active. Click to Re-center & Follow Shuttle"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span>Re-center Driver</span>
            </button>
          ) : (
            <button
              onClick={() => handleRecenterOrToggle()}
              className={`px-2.5 sm:px-3 py-1.5 rounded-2xl border text-[10px] sm:text-[11px] font-extrabold flex items-center gap-1.5 transition-all shadow-xl backdrop-blur-md ${
                isTracking
                  ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300 hover:bg-emerald-500/30'
                  : 'bg-slate-950/85 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
              title={isTracking ? 'Auto-Follow Driver Active' : 'Enable Live Follow Driver'}
            >
              <Navigation
                className={`w-3.5 h-3.5 shrink-0 ${isTracking ? 'text-emerald-400 animate-pulse' : ''}`}
              />
              <span className="hidden xs:inline">Follow Driver</span>
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isTracking ? 'bg-emerald-400' : 'bg-slate-500'
                }`}
              />
            </button>
          )}
        </div>
      </div>

      {/* BOTTOM FLOATING OVERLAY: LIVE TELEMETRY DETAILS */}
      <div className="absolute bottom-2.5 inset-x-2.5 sm:bottom-3 sm:inset-x-3 z-[1000] flex items-center justify-between gap-2 pointer-events-none">
        
        {/* Tracked Shuttle Telemetry Card */}
        <div
          onClick={() => focusDriver()}
          title="Click to focus driver on map"
          className="px-3 py-2 rounded-2xl bg-slate-950/90 border border-slate-800 hover:border-amber-500/50 backdrop-blur-md shadow-2xl flex items-center gap-2.5 max-w-[calc(100%-10px)] pointer-events-auto cursor-pointer transition-all hover:bg-slate-900/90"
        >
          <div className="w-6 h-6 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 text-xs shrink-0 font-bold">
            🚌
          </div>

          <div className="min-w-0 flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-[11px] sm:text-xs text-white truncate">
                {trackedShuttle ? trackedShuttle.vehicleNumber : 'Searching Shuttles...'}
              </span>
              {trackedShuttle && (
                <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-emerald-500/15 text-emerald-400 font-mono font-bold shrink-0">
                  LIVE
                </span>
              )}
            </div>
            <p className="text-[9px] sm:text-[10px] text-slate-400 truncate">
              {trackedShuttle
                ? `Driver: ${trackedShuttle.driver.name} • ${trackedShuttle.availableSeats}/${trackedShuttle.capacity} Seats`
                : 'Connecting to campus telemetry feed...'}
            </p>
          </div>
        </div>

        {/* Status chip on desktop / large mobile */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800/80 text-[10px] text-slate-400 font-mono backdrop-blur-sm pointer-events-none">
          <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
          <span>Sync: {lastTelemetryUpdate}</span>
        </div>
      </div>
    </div>
  )
}
