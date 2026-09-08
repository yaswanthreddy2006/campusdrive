'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

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

interface DriverMapProps {
  shuttles: ShuttleItem[]
}

const CAMPUS_STOPS = [
  { name: 'Main Gate', lat: 9.5701, lng: 77.6745 },
  { name: 'Girls Hostel', lat: 9.5685, lng: 77.6758 },
  { name: 'Admin Block', lat: 9.5715, lng: 77.6738 },
  { name: 'Library', lat: 9.5722, lng: 77.6742 },
  { name: 'MH 9th Block', lat: 9.5692, lng: 77.6765 },
  { name: 'MH 11th Block', lat: 9.5688, lng: 77.677 },
]

export default function DriverMap({ shuttles }: DriverMapProps) {
  const mapRef = useRef<L.Map | null>(null)
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const shuttleMarkersRef = useRef<{ [key: string]: L.Marker }>({})

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    // Center on Kalasalingam Academy of Research and Education campus
    const map = L.map(mapContainerRef.current, {
      center: [9.5701, 77.6745],
      zoom: 16,
      zoomControl: true,
    })

    // OpenStreetMap Tile Layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | KARE Shuttle Pool',
    }).addTo(map)

    // Render Campus Stop Markers
    CAMPUS_STOPS.forEach((stop) => {
      const stopIcon = L.divIcon({
        className: 'custom-stop-icon',
        html: `
          <div style="background-color:#1e293b; color:#38bdf8; border: 2px solid #0284c7; padding: 4px 8px; border-radius: 12px; font-weight: bold; font-size: 11px; white-space: nowrap; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5); display: flex; align-items: center; gap: 4px;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background-color: #38bdf8;"></span>
            ${stop.name}
          </div>
        `,
        iconSize: [100, 30],
        iconAnchor: [50, 15],
      })

      L.marker([stop.lat, stop.lng], { icon: stopIcon })
        .addTo(map)
        .bindPopup(`<b>KARE Campus Stop:</b> ${stop.name}`)
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Update Live Shuttle Markers
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const currentMarkers = shuttleMarkersRef.current

    shuttles.forEach((shuttle) => {
      const lat = shuttle.currentLat ?? 9.5701
      const lng = shuttle.currentLng ?? 77.6745

      const shuttleIconHtml = `
        <div style="position: relative; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; width: 44px; height: 44px; background-color: rgba(245, 158, 11, 0.3); border-radius: 50%; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="background: linear-gradient(135deg, #f59e0b, #d97706); color: #090d16; border: 2px solid #ffffff; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 15px -3px rgba(245, 158, 11, 0.5); font-weight: 900; font-size: 14px;">
            🚌
          </div>
        </div>
      `

      const customIcon = L.divIcon({
        className: 'custom-shuttle-marker',
        html: shuttleIconHtml,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      })

      const popupContent = `
        <div style="font-family: sans-serif; padding: 4px; text-align: left;">
          <div style="display: flex; align-items: center; gap: 6px; font-weight: bold; font-size: 13px; color: #0f172a;">
            🚌 ${shuttle.vehicleNumber}
          </div>
          <div style="font-size: 11px; color: #475569; margin-top: 2px;">
            Driver: <b>${shuttle.driver.name}</b>
          </div>
          <div style="display: inline-block; margin-top: 6px; padding: 2px 8px; background-color: #ecfdf5; border: 1px solid #10b981; color: #047857; font-weight: bold; font-size: 10px; border-radius: 9999px;">
            ${shuttle.availableSeats}/${shuttle.capacity} Seats Available
          </div>
        </div>
      `

      if (currentMarkers[shuttle.id]) {
        currentMarkers[shuttle.id].setLatLng([lat, lng])
        currentMarkers[shuttle.id].setPopupContent(popupContent)
      } else {
        const marker = L.marker([lat, lng], { icon: customIcon })
          .addTo(map)
          .bindPopup(popupContent)

        currentMarkers[shuttle.id] = marker
      }
    })
  }, [shuttles])

  return (
    <div className="relative w-full h-[280px] xs:h-[320px] sm:h-[380px] lg:h-[420px] rounded-3xl overflow-hidden border border-slate-800 shadow-2xl">
      <div ref={mapContainerRef} className="w-full h-full z-10" />

      {/* Map Legend Badge Overlay */}
      <div className="absolute bottom-3 left-3 z-20 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-2xl bg-slate-950/90 border border-slate-800 backdrop-blur-md text-[10px] sm:text-[11px] font-semibold text-slate-300 flex items-center gap-1.5 sm:gap-2 max-w-[calc(100%-24px)] pointer-events-none">
        <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0"></span>
        <span className="truncate">KARE Live GPS Campus Map</span>
      </div>
    </div>
  )
}
