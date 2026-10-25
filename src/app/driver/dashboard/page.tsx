'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import {
  Bus,
  MapPin,
  Users,
  Power,
  Navigation,
  LogOut,
  CheckCircle2,
  Clock,
  CreditCard,
  QrCode,
  ShieldAlert,
  RefreshCw,
  AlertCircle,
  Building2,
  Bell,
  Sparkles,
  Check,
  X,
  Phone,
  Loader2,
  ArrowUpDown,
} from 'lucide-react'
import { calculateRoadDistance, formatDistanceAndEta, RouteInfo } from '@/lib/routing'

const PaymentModal = dynamic(() => import('@/components/PaymentModal'), { ssr: false })
const RefillSeatsModal = dynamic(() => import('@/components/RefillSeatsModal'), { ssr: false })

interface VehicleData {
  id: string
  vehicleNumber: string
  capacity: number
  availableSeats: number
  isOnline: boolean
  currentLat: number | null
  currentLng: number | null
  driver: {
    name: string
    phone: string
  }
}

interface BookingData {
  id: string
  seatsBooked: number
  fareAmount: number
  paymentMethod: string
  paymentStatus: string
  status: string
  createdAt: string
  student: {
    name: string
    email: string
    phone: string
  }
  pickup: {
    name: string
    latitude?: number
    longitude?: number
  }
  drop: {
    name: string
    latitude?: number
    longitude?: number
  }
}

const KARE_SIMULATED_WAYPOINTS = [
  { lat: 9.5761, lng: 77.6833, stop: 'Main Gate' },
  { lat: 9.5762, lng: 77.6814, stop: 'Girls Hostel' },
  { lat: 9.5747, lng: 77.6787, stop: 'Library' },
  { lat: 9.5741, lng: 77.6760, stop: 'Admin Block' },
  { lat: 9.5750, lng: 77.6761, stop: '8th Block' },
  { lat: 9.5743, lng: 77.6748, stop: '9th Block' },
  { lat: 9.5738, lng: 77.6739, stop: '7th Block' },
  { lat: 9.5732, lng: 77.6751, stop: '11th Block' },
]

export default function DriverDashboardPage() {
  const router = useRouter()
  const [isOnDuty, setIsOnDuty] = useState(false)
  const [togglingDuty, setTogglingDuty] = useState(false)
  const [isSimulatingGps, setIsSimulatingGps] = useState(false)
  const [waypointIndex, setWaypointIndex] = useState(0)
  const [locationPromptNeeded, setLocationPromptNeeded] = useState(false)

  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number }>({
    lat: 9.5761,
    lng: 77.6833,
  })

  const [vehicle, setVehicle] = useState<VehicleData | null>(null)
  const [bookings, setBookings] = useState<BookingData[]>([])
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [driverVerificationStatus, setDriverVerificationStatus] = useState<'APPROVED' | 'PENDING' | 'REJECTED'>('APPROVED')

  const [selectedBookingForPayment, setSelectedBookingForPayment] = useState<BookingData | null>(null)
  const [completingTrip, setCompletingTrip] = useState(false)
  const [showRefillModal, setShowRefillModal] = useState(false)
  const [finishedRideStudentName, setFinishedRideStudentName] = useState<string | undefined>(undefined)
  const [respondingBookingId, setRespondingBookingId] = useState<string | null>(null)
  const [boardingBookingId, setBoardingBookingId] = useState<string | null>(null)

  type SortOption = 'NEAREST_FIRST' | 'EARLIEST_FIRST' | 'NEAREST_WITH_TIME_TIEBREAKER'
  const [sortOption, setSortOption] = useState<SortOption>('NEAREST_FIRST')
  const [routeDistances, setRouteDistances] = useState<Record<string, RouteInfo>>({})

  const watchIdRef = useRef<number | null>(null)
  const simIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null)
  const notifiedBookingIdsRef = useRef<Set<string>>(new Set())
  const initialBookingsLoadedRef = useRef(false)
  const isOnDutyRef = useRef(isOnDuty)
  const vehicleIdRef = useRef<string | null>(null)

  const stopBroadcasting = useCallback(() => {
    if (simIntervalRef.current) {
      clearInterval(simIntervalRef.current)
      simIntervalRef.current = null
    }
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current)
      heartbeatRef.current = null
    }
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setIsSimulatingGps(false)
  }, [])

  // Kill all intervals and watchers on component unmount
  useEffect(() => {
    return () => {
      stopBroadcasting()
    }
  }, [stopBroadcasting])

  useEffect(() => {
    isOnDutyRef.current = isOnDuty
  }, [isOnDuty])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('driver_tab_vehicle_id')
      if (stored) vehicleIdRef.current = stored
    }
  }, [])

  useEffect(() => {
    if (vehicle?.id) {
      vehicleIdRef.current = vehicle.id
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('driver_tab_vehicle_id', vehicle.id)
      }
    }
  }, [vehicle?.id])

  // Web Audio chime for incoming student booking requests
  const playNotificationAlert = useCallback(() => {
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!AudioContextClass) return
      const ctx = new AudioContextClass()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(659.25, ctx.currentTime) // E5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12) // A5
      gain.gain.setValueAtTime(0.25, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.35)
    } catch {
      // Audio autoplay restrictions handled gracefully
    }
  }, [])

  // Send GPS location to server (Only when ON DUTY)
  const broadcastLocation = useCallback(async (lat: number, lng: number) => {
    // HARD GUARD: If the driver is off duty, completely discard any background GPS broadcast!
    if (!isOnDutyRef.current) {
      return
    }
    try {
      const activeVehicleId = vehicleIdRef.current || (typeof window !== 'undefined' ? sessionStorage.getItem('driver_tab_vehicle_id') : null)
      const res = await fetch('/api/driver/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId: activeVehicleId,
          latitude: lat,
          longitude: lng,
        }),
      })
      const data = await res.json()
      if (res.status === 403 && data.driverStatus) {
        setDriverVerificationStatus(data.driverStatus)
        return
      }
      if (data.vehicle) {
        setVehicle(data.vehicle)
      }
    } catch (err) {
      console.error('Error broadcasting GPS:', err)
    }
  }, [])

  // Fetch driver assigned vehicle and bookings
  const fetchDriverData = useCallback(async () => {
    try {
      const tabVehicleId = typeof window !== 'undefined' ? sessionStorage.getItem('driver_tab_vehicle_id') : null
      const url = tabVehicleId ? `/api/driver/bookings?vehicleId=${tabVehicleId}` : '/api/driver/bookings'
      const res = await fetch(url)
      if (res.status === 401) {
        router.push('/driver/login')
        return
      }
      const data = await res.json()

      if (res.status === 403 && data.driverStatus) {
        setDriverVerificationStatus(data.driverStatus)
        if (data.vehicle) setVehicle(data.vehicle)
        setBookings([])
        return
      }

      if (res.ok) {
        setDriverVerificationStatus('APPROVED')
      }

      if (data.vehicle) {
        setVehicle(data.vehicle)
        vehicleIdRef.current = data.vehicle.id
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('driver_tab_vehicle_id', data.vehicle.id)
        }

        // STRICT RULE: Only driver can toggle on duty. Never automatically flip duty switch to ON.
        // If driver is currently OFF DUTY in this session, ensure vehicle in DB is not showing online.
        if (!isOnDutyRef.current && data.vehicle.isOnline) {
          fetch('/api/driver/duty', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vehicleId: data.vehicle.id, isOnline: false }),
          }).catch(() => {})
        }

        if (data.vehicle.currentLat && data.vehicle.currentLng) {
          setCurrentCoords({
            lat: data.vehicle.currentLat,
            lng: data.vehicle.currentLng,
          })
        }
      }
      if (data.bookings) {
        setBookings(data.bookings)
        if (!initialBookingsLoadedRef.current) {
          initialBookingsLoadedRef.current = true
          // Seed existing requested bookings so initial load does not trigger false alerts
          data.bookings.forEach((b: BookingData) => {
            if (b.status === 'REQUESTED') {
              notifiedBookingIdsRef.current.add(b.id)
            }
          })
        }
      }
    } catch (err) {
      console.error('Error fetching driver data:', err)
    }
  }, [router])

  useEffect(() => {
    fetchDriverData()
    // Relaxed fallback sync (12s) while real-time SSE pushes instant updates (< 20ms)
    const interval = setInterval(fetchDriverData, 12000)
    return () => clearInterval(interval)
  }, [fetchDriverData])

  // Real-Time SSE Listener for Instant Student Requests & Updates
  useEffect(() => {
    if (typeof window === 'undefined') return
    const vehicleChannel = vehicle?.id ? `vehicle_${vehicle.id}` : null
    const channels = vehicleChannel ? `${vehicleChannel},shuttles_gps` : 'shuttles_gps'

    let es: EventSource | null = null
    try {
      es = new EventSource(`/api/realtime?channels=${channels}`)

      es.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.event === 'booking_created' && msg.data) {
            const newBooking: BookingData = msg.data
            setBookings((prev) => {
              if (prev.some((b) => b.id === newBooking.id)) return prev
              return [newBooking, ...prev]
            })
            // Notify driver exactly once per booking
            if (!notifiedBookingIdsRef.current.has(newBooking.id)) {
              notifiedBookingIdsRef.current.add(newBooking.id)
              playNotificationAlert()
              setStatusMsg(`New booking request from ${newBooking.student?.name || 'Student'}!`)
            }
          } else if (msg.event === 'booking_updated' && msg.data) {
            const updated: BookingData = msg.data
            setBookings((prev) =>
              prev.map((b) => (b.id === updated.id ? { ...b, ...updated } : b))
            )
          } else if (msg.event === 'seats_updated' && msg.data) {
            if (msg.data.vehicleId === vehicle?.id && typeof msg.data.availableSeats === 'number') {
              setVehicle((prev) =>
                prev ? { ...prev, availableSeats: msg.data.availableSeats } : prev
              )
            }
          }
        } catch {
          // Resilient stream handling
        }
      }
    } catch (err) {
      console.warn('Driver SSE listener notice:', err)
    }

    return () => {
      if (es) es.close()
    }
  }, [vehicle?.id, playNotificationAlert])

  // Handle On Duty Toggle
  const toggleDuty = async () => {
    if (togglingDuty) return
    const nextState = !isOnDuty
    setTogglingDuty(true)

    // Immediate optimistic update so switch changes instantly
    setIsOnDuty(nextState)
    isOnDutyRef.current = nextState
    setVehicle((prev) => (prev ? { ...prev, isOnline: nextState } : prev))

    const activeVehicleId = vehicleIdRef.current || (typeof window !== 'undefined' ? sessionStorage.getItem('driver_tab_vehicle_id') : null)

    try {
      if (nextState) {
        setStatusMsg('On Duty active! Shuttle is online and accepting student requests.')
        setLocationPromptNeeded(false)
        await Promise.all([
          fetch('/api/driver/location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              vehicleId: activeVehicleId,
              isOnline: true,
              latitude: currentCoords.lat,
              longitude: currentCoords.lng,
            }),
          }),
          fetch('/api/driver/duty', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              vehicleId: activeVehicleId,
              isOnline: true,
              latitude: currentCoords.lat,
              longitude: currentCoords.lng,
            }),
          }),
        ])

        // Asynchronously check / acquire high-accuracy live device GPS
        if (!isSimulatingGps && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              if (!isOnDutyRef.current) return
              const lat = pos.coords.latitude
              const lng = pos.coords.longitude
              setCurrentCoords({ lat, lng })
              setLocationPromptNeeded(false)
              setStatusMsg('On Duty active! Broadcasting real-time device GPS.')
              broadcastLocation(lat, lng)
            },
            (err) => {
              console.warn('Location permission info:', err.message)
              // Driver remains on duty with campus coordinates
              setStatusMsg('On Duty active with campus base GPS. Turn on device location for live movement.')
              setLocationPromptNeeded(true)
            },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
          )
        }
      } else {
        stopBroadcasting()
        setLocationPromptNeeded(false)
        setStatusMsg('Off Duty. Location broadcasting stopped. Shuttle is offline.')
        await Promise.all([
          fetch('/api/driver/location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              vehicleId: activeVehicleId,
              isOnline: false,
            }),
          }),
          fetch('/api/driver/duty', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              vehicleId: activeVehicleId,
              isOnline: false,
            }),
          }),
        ])
      }
    } catch (err) {
      console.error('Error toggling duty status:', err)
      setStatusMsg('Failed to update duty status on server. Please retry.')
    } finally {
      setTogglingDuty(false)
    }
  }

  // Real Geolocation watchPosition
  useEffect(() => {
    if (isOnDuty && !isSimulatingGps && 'geolocation' in navigator) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          if (!isOnDutyRef.current) return
          const newLat = pos.coords.latitude
          const newLng = pos.coords.longitude
          setCurrentCoords({ lat: newLat, lng: newLng })
          broadcastLocation(newLat, newLng)
        },
        (err) => {
          console.warn('Geolocation access error, falling back to simulated GPS:', err)
          setIsSimulatingGps(true)
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
      )
    }

    return () => {
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation?.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [isOnDuty, isSimulatingGps, broadcastLocation])

  // Simulated GPS Movement along KARE Waypoints
  useEffect(() => {
    if (simIntervalRef.current) {
      clearInterval(simIntervalRef.current)
      simIntervalRef.current = null
    }

    if (isOnDuty && isSimulatingGps) {
      simIntervalRef.current = setInterval(() => {
        if (!isOnDutyRef.current) {
          if (simIntervalRef.current) {
            clearInterval(simIntervalRef.current)
            simIntervalRef.current = null
          }
          return
        }
        setWaypointIndex((prevIdx) => {
          const nextIdx = (prevIdx + 1) % KARE_SIMULATED_WAYPOINTS.length
          const wp = KARE_SIMULATED_WAYPOINTS[nextIdx]
          setCurrentCoords({ lat: wp.lat, lng: wp.lng })
          broadcastLocation(wp.lat, wp.lng)
          return nextIdx
        })
      }, 5000)
    }

    return () => {
      if (simIntervalRef.current) {
        clearInterval(simIntervalRef.current)
        simIntervalRef.current = null
      }
    }
  }, [isOnDuty, isSimulatingGps, broadcastLocation])

  // Periodic heartbeat while ON DUTY to keep lastGpsUpdate fresh on server
  useEffect(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current)
      heartbeatRef.current = null
    }

    if (!isOnDuty) return

    heartbeatRef.current = setInterval(() => {
      if (!isOnDutyRef.current) {
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current)
          heartbeatRef.current = null
        }
        return
      }
      broadcastLocation(currentCoords.lat, currentCoords.lng)
    }, 10000)

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current)
        heartbeatRef.current = null
      }
    }
  }, [isOnDuty, currentCoords.lat, currentCoords.lng, broadcastLocation])

  // Broadcast offline beacon if driver closes browser or navigates away
  useEffect(() => {
    const handleUnload = () => {
      if (isOnDuty && vehicle?.id && typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon('/api/driver/offline', JSON.stringify({ vehicleId: vehicle.id }))
      }
    }

    window.addEventListener('beforeunload', handleUnload)
    window.addEventListener('pagehide', handleUnload)
    return () => {
      window.removeEventListener('beforeunload', handleUnload)
      window.removeEventListener('pagehide', handleUnload)
    }
  }, [isOnDuty, vehicle?.id])

  const handleLogout = async () => {
    try {
      setIsOnDuty(false)
      isOnDutyRef.current = false
      stopBroadcasting()
      const targetVehicleId = vehicleIdRef.current || vehicle?.id || (typeof window !== 'undefined' ? sessionStorage.getItem('driver_tab_vehicle_id') : null)
      if (targetVehicleId) {
        await fetch('/api/driver/duty', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vehicleId: targetVehicleId, isOnline: false }),
        }).catch(() => {})
      }
      await fetch('/api/driver/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId: targetVehicleId }),
      })
    } catch (err) {
      console.error('Error during logout:', err)
    } finally {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('driver_tab_vehicle_id')
      }
      router.push('/driver/login')
    }
  }

  // Handle Driver Approve / Reject / Cancel of booking request (Instant Optimistic Update)
  const handleRespondBooking = async (bookingId: string, action: 'APPROVE' | 'REJECT' | 'CANCEL') => {
    setRespondingBookingId(bookingId)

    // OPTIMISTIC UPDATE: update local state in 0ms!
    const targetBooking = bookings.find((b) => b.id === bookingId)
    const newStatus = action === 'APPROVE' ? 'ACCEPTED' : 'CANCELLED'
    setBookings((prev) =>
      prev.map((b) =>
        b.id === bookingId
          ? {
              ...b,
              status: newStatus,
              paymentStatus: action !== 'APPROVE' ? 'CANCELLED_BY_DRIVER' : b.paymentStatus,
            }
          : b
      )
    )
    if ((action === 'REJECT' || action === 'CANCEL') && targetBooking) {
      setVehicle((prev) =>
        prev
          ? {
              ...prev,
              availableSeats: Math.min(prev.capacity, prev.availableSeats + targetBooking.seatsBooked),
            }
          : prev
      )
    }

    try {
      const res = await fetch('/api/bookings/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, action }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || `Failed to ${action.toLowerCase()} request.`)
      }
      setStatusMsg(data.message)
    } catch (err: unknown) {
      // Revert optimistic update on failure
      if (targetBooking) {
        setBookings((prev) =>
          prev.map((b) => (b.id === bookingId ? targetBooking : b))
        )
      }
      setStatusMsg(err instanceof Error ? err.message : 'Error updating request.')
    } finally {
      setRespondingBookingId(null)
    }
  }

  // Complete Trip & Prompt Driver to Refill Seats
  const handleConfirmPaymentAndComplete = async () => {
    if (!selectedBookingForPayment) return

    setCompletingTrip(true)
    const passengerName = selectedBookingForPayment.student.name

    try {
      const res = await fetch('/api/bookings/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: selectedBookingForPayment.id }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to complete trip.')
      }

      setStatusMsg(data.message || 'Trip completed!')
      setSelectedBookingForPayment(null)
      await fetchDriverData()

      // Ask driver after finishing ride to refill or adjust seats
      setFinishedRideStudentName(passengerName)
      setShowRefillModal(true)
    } catch (err: unknown) {
      setStatusMsg(err instanceof Error ? err.message : 'Trip completion failed.')
    } finally {
      setCompletingTrip(false)
    }
  }

  // Real-time calculation of road distances to student pickup locations as driver moves
  useEffect(() => {
    let isMounted = true
    const computeDistances = async () => {
      const isLive = isOnDuty && !locationPromptNeeded
      const newDistances: Record<string, RouteInfo> = {}

      await Promise.all(
        bookings.map(async (b) => {
          if (b.pickup?.latitude && b.pickup?.longitude) {
            const info = await calculateRoadDistance(
              currentCoords.lat,
              currentCoords.lng,
              b.pickup.latitude,
              b.pickup.longitude,
              isLive
            )
            newDistances[b.id] = info
          }
        })
      )

      if (isMounted) {
        setRouteDistances((prev) => ({ ...prev, ...newDistances }))
      }
    }

    computeDistances()
    return () => {
      isMounted = false
    }
  }, [currentCoords.lat, currentCoords.lng, bookings, isOnDuty, locationPromptNeeded])

  // Sorting helper supporting:
  // 1. Nearest pickup first (default)
  // 2. Earliest booking first
  // 3. Nearest pickup with booking time as tie-breaker
  const sortBookingsList = useCallback(
    (list: BookingData[]) => {
      return [...list].sort((a, b) => {
        const infoA = routeDistances[a.id]
        const infoB = routeDistances[b.id]
        const distA = infoA?.distanceMeters ?? 999999
        const distB = infoB?.distanceMeters ?? 999999
        const timeA = new Date(a.createdAt).getTime()
        const timeB = new Date(b.createdAt).getTime()

        if (sortOption === 'EARLIEST_FIRST') {
          return timeA - timeB
        }

        if (sortOption === 'NEAREST_FIRST') {
          if (distA !== distB) {
            return distA - distB
          }
          return timeA - timeB
        }

        // NEAREST_WITH_TIME_TIEBREAKER:
        // Prioritize nearest pickup; if distance difference is <= 50m, prioritize earlier booking
        if (Math.abs(distA - distB) <= 50) {
          return timeA - timeB
        }
        return distA - distB
      })
    },
    [routeDistances, sortOption]
  )

  // Direct Boarding confirmation by Driver
  const handleBoardPassenger = async (bookingId: string) => {
    setBoardingBookingId(bookingId)
    try {
      const activeVehicleId = vehicleIdRef.current || vehicle?.id
      const res = await fetch('/api/bookings/board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, vehicleId: activeVehicleId }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to confirm boarding.')
      }
      setStatusMsg('Passenger boarded successfully!')
      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, status: 'BOARDED' } : b))
      )
    } catch (err: unknown) {
      setStatusMsg(err instanceof Error ? err.message : 'Boarding verification failed.')
    } finally {
      setBoardingBookingId(null)
    }
  }

  // Format booking timestamp
  const formatBookingTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr)
      const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      const diffMins = Math.floor((Date.now() - date.getTime()) / 60000)
      let rel = 'Just now'
      if (diffMins >= 1 && diffMins < 60) rel = `${diffMins}m ago`
      else if (diffMins >= 60) rel = `${Math.floor(diffMins / 60)}h ago`
      return `${time} (${rel})`
    } catch {
      return 'Recent'
    }
  }

  // Partition bookings into REQUESTED (needs driver action), ACCEPTED/RESERVED (pending boarding), and BOARDED
  const requestedBookings = bookings.filter((b) => b.status === 'REQUESTED')
  const reservedBookings = bookings.filter((b) => b.status === 'ACCEPTED' || b.status === 'RESERVED')
  const boardedBookings = bookings.filter((b) => b.status === 'BOARDED')

  // Sorted views according to driver's chosen sorting option
  const sortedRequestedBookings = sortBookingsList(requestedBookings)
  const sortedReservedBookings = sortBookingsList(reservedBookings)

  const groupedBoardedByDrop = boardedBookings.reduce((acc, booking) => {
    const dropName = booking.drop.name
    if (!acc[dropName]) {
      acc[dropName] = []
    }
    acc[dropName].push(booking)
    return acc
  }, {} as { [key: string]: BookingData[] })

  const vehicleNo = vehicle?.vehicleNumber || 'TN-58-KARE-01'
  const availableSeats = vehicle?.availableSeats ?? 9
  const capacity = vehicle?.capacity ?? 9

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-amber-500 selection:text-slate-950">
      {/* Background ambient lighting */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-5xl h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-slate-950/80 border-b border-slate-800/80 px-3 sm:px-8 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Bus className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <span className="font-extrabold text-xs sm:text-sm text-white tracking-tight truncate block">
                KARE Driver Portal
              </span>
              <span className="block text-[9px] sm:text-[10px] text-amber-400 font-mono truncate">
                {vehicleNo}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <Link
              href="/driver/qr"
              className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 text-amber-400 font-semibold text-xs transition-colors flex items-center gap-1.5"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Shuttle QR</span>
            </Link>

            <button
              onClick={handleLogout}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-red-500/40 text-slate-300 hover:text-red-400 transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="relative z-10 max-w-xl lg:max-w-6xl mx-auto px-3 sm:px-6 py-6 sm:py-8 flex-1 w-full space-y-6">

        {/* PENDING Verification Screen */}
        {driverVerificationStatus === 'PENDING' && (
          <div className="max-w-xl mx-auto p-6 sm:p-8 rounded-3xl bg-slate-900/90 backdrop-blur-xl border border-amber-500/30 shadow-2xl space-y-6 text-center animate-fadeIn">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
              <Clock className="w-8 h-8 animate-spin" />
            </div>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-xs font-semibold text-amber-400">
                <Building2 className="w-3.5 h-3.5" />
                Administrative Verification Pending
              </div>
              <h2 className="text-xl font-extrabold text-white tracking-tight">
                Driver Account Awaiting Verification
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                Your driver registration has been submitted to Kalasalingam Operations Control. An administrator must verify and approve your account before you can operate campus shuttles or view passenger bookings.
              </p>
            </div>

            {vehicle && (
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-left text-xs space-y-2 font-mono">
                <div className="flex justify-between text-slate-400">
                  <span>Driver Name:</span>
                  <span className="text-white font-bold">{vehicle.driver.name}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Mobile Contact:</span>
                  <span className="text-slate-200">{vehicle.driver.phone}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Assigned Vehicle:</span>
                  <span className="text-amber-400 font-bold">{vehicle.vehicleNumber}</span>
                </div>
              </div>
            )}

            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs text-left space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                Access Protection Active
              </div>
              <p className="text-[11px] text-amber-200/80 leading-relaxed">
                Passenger bookings, GPS broadcasting, and shift controls are protected and hidden until your account status is updated to APPROVED.
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-2">
              <button
                onClick={fetchDriverData}
                className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold text-xs shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Check Approval Status
              </button>

              <button
                onClick={handleLogout}
                className="w-full py-3 px-4 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-medium text-xs transition-colors flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>
        )}

        {/* REJECTED Verification Screen */}
        {driverVerificationStatus === 'REJECTED' && (
          <div className="max-w-xl mx-auto p-6 sm:p-8 rounded-3xl bg-slate-900/90 backdrop-blur-xl border border-red-500/30 shadow-2xl space-y-6 text-center animate-fadeIn">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 shadow-inner">
              <ShieldAlert className="w-8 h-8 animate-pulse" />
            </div>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-950/60 border border-red-500/30 text-xs font-semibold text-red-300">
                <Building2 className="w-3.5 h-3.5" />
                Verification Rejected
              </div>
              <h2 className="text-xl font-extrabold text-white tracking-tight">
                Driver Access Restricted
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                Your shuttle driver registration request was reviewed and rejected by Kalasalingam Operations Control.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-left text-xs space-y-1 text-slate-400">
              <span className="font-semibold text-slate-200">Next Steps:</span>
              <p>
                If you believe this is an error, please contact the campus transport department with your registered mobile number.
              </p>
            </div>

            <button
              onClick={handleLogout}
              className="w-full py-3 px-4 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-medium text-xs transition-colors flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        )}

        {/* APPROVED Driver Portal Grid */}
        {driverVerificationStatus === 'APPROVED' && (
          <div className="lg:grid lg:grid-cols-12 lg:gap-6 lg:items-start space-y-6 lg:space-y-0">

            {/* Left Column: Shift Status & Seat Capacity */}
            <div className="lg:col-span-5 space-y-6">
              {/* On-Duty Toggle Card */}
              <div className="p-4 sm:p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Shift Status
                    </span>
                    <h1 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                      {isOnDuty ? (
                        <span className="text-emerald-400 flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
                          ON DUTY
                        </span>
                      ) : (
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-slate-500"></span>
                          OFF DUTY / OFFLINE
                        </span>
                      )}
                    </h1>
                    <p className="text-[11px] text-slate-400">
                      {isOnDuty
                        ? 'Broadcasting live to students & accepting ride bookings'
                        : 'Offline • Shuttle is hidden and not bookable by students'}
                    </p>
                  </div>

                  <button
                    id="duty-toggle-switch"
                    onClick={toggleDuty}
                    disabled={togglingDuty}
                    aria-label={isOnDuty ? 'Switch to Off Duty' : 'Switch to On Duty'}
                    className={`w-16 h-9 rounded-full p-1 transition-all duration-300 flex items-center shrink-0 cursor-pointer ${
                      isOnDuty
                        ? 'bg-emerald-500 justify-end shadow-lg shadow-emerald-500/30'
                        : 'bg-slate-800 justify-start hover:bg-slate-700'
                    } ${togglingDuty ? 'opacity-70 cursor-wait' : ''}`}
                  >
                    <div className="w-7 h-7 rounded-full bg-white shadow-md flex items-center justify-center text-slate-900 font-bold">
                      {togglingDuty ? (
                        <Loader2 className="w-4 h-4 animate-spin text-slate-800" />
                      ) : (
                        <Power className={`w-4 h-4 ${isOnDuty ? 'text-emerald-600' : 'text-slate-600'}`} />
                      )}
                    </div>
                  </button>
                </div>

                {locationPromptNeeded && (
                  <div className="p-3.5 rounded-2xl bg-amber-950/80 border border-amber-500/50 text-xs text-amber-200 flex flex-col gap-2 animate-fadeIn">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span className="font-semibold text-white">Device Location is Turned Off</span>
                    </div>
                    <p className="text-[11px] text-amber-300/80 leading-relaxed">
                      Please allow browser location permissions to broadcast your live GPS shuttle position to students.
                    </p>
                    <button
                      type="button"
                      onClick={toggleDuty}
                      className="w-full py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      Allow & Turn On GPS
                    </button>
                  </div>
                )}

                {statusMsg && !locationPromptNeeded && (
                  <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{statusMsg}</span>
                  </div>
                )}

                {/* GPS Mode Selector */}
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs gap-2">
                  <span className="text-slate-400 flex items-center gap-1 shrink-0">
                    <Navigation className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    GPS Mode:
                  </span>
                  <button
                    onClick={() => setIsSimulatingGps(!isSimulatingGps)}
                    className="px-2.5 py-1 rounded-xl bg-slate-950 border border-slate-800 text-amber-400 font-semibold hover:border-amber-500/40 transition-colors text-[11px] truncate"
                  >
                    {isSimulatingGps ? 'KARE Campus Auto-Motion' : 'Device Browser GPS'}
                  </button>
                </div>

                {/* Live Coordinates Display */}
                <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-400 flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
                  <span>Lat: {currentCoords.lat.toFixed(4)}, Lng: {currentCoords.lng.toFixed(4)}</span>
                  <span className="text-amber-400 font-sans font-semibold shrink-0">
                    Stop: {KARE_SIMULATED_WAYPOINTS[waypointIndex]?.stop || 'Main Gate'}
                  </span>
                </div>
              </div>

              {/* Real-time Seat Availability Card */}
              <div className="p-4 sm:p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-amber-400 shrink-0" />
                    <span className="font-bold text-sm text-white">Shuttle Seat Capacity</span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-xs font-mono font-bold text-amber-400 shrink-0">
                    {availableSeats} / {capacity} Open
                  </span>
                </div>

                <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-950 border border-slate-800 gap-2">
                  <div className="space-y-0.5 min-w-0">
                    <span className="text-xs font-semibold text-slate-200 block truncate">
                      Available Passenger Seats
                    </span>
                    <p className="text-[11px] text-slate-400 leading-tight">
                      Auto-updated upon seat reservations & trip completions
                    </p>
                  </div>
                  <div className="text-2xl font-black font-mono text-amber-400 shrink-0">
                    {availableSeats} <span className="text-xs text-slate-500 font-normal">/ {capacity}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setFinishedRideStudentName(undefined)
                    setShowRefillModal(true)
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 font-bold text-xs transition-colors flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Refill / Adjust Open Seats</span>
                </button>
              </div>
            </div>

            {/* Right Column: Passengers & Reservations */}
            <div className="lg:col-span-7 space-y-6">

              {/* Sorting Options Bar */}
              <div className="p-3.5 sm:p-4 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-bold text-white">
                  <ArrowUpDown className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Sort Student Pickups By:</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    id="sort-nearest-first-btn"
                    type="button"
                    onClick={() => setSortOption('NEAREST_FIRST')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      sortOption === 'NEAREST_FIRST'
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-950/40'
                        : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    📍 Nearest Pickup (Default)
                  </button>
                  <button
                    id="sort-earliest-first-btn"
                    type="button"
                    onClick={() => setSortOption('EARLIEST_FIRST')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      sortOption === 'EARLIEST_FIRST'
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-950/40'
                        : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    ⏱️ Earliest Booking First
                  </button>
                  <button
                    id="sort-nearest-tiebreaker-btn"
                    type="button"
                    onClick={() => setSortOption('NEAREST_WITH_TIME_TIEBREAKER')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      sortOption === 'NEAREST_WITH_TIME_TIEBREAKER'
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-950/40'
                        : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    ⚡ Nearest + Time Tie-Breaker
                  </button>
                </div>
              </div>

              {/* INCOMING BOOKING REQUESTS (Approve / Reject) */}
              {requestedBookings.length > 0 && (
                <div className="p-4 sm:p-5 rounded-3xl bg-amber-500/10 border-2 border-amber-500 shadow-2xl shadow-amber-500/20 space-y-3">
                  <div className="flex items-center justify-between border-b border-amber-500/30 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                      </span>
                      <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
                        <Bell className="w-4 h-4 text-amber-400 animate-bounce" />
                        <span>Incoming Ride Requests ({requestedBookings.length})</span>
                      </h2>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black text-[10px] uppercase tracking-wide">
                      Approval Required
                    </span>
                  </div>

                  <div className="space-y-3">
                    {sortedRequestedBookings.map((req) => {
                      const distInfo = routeDistances[req.id]
                      const formatted = distInfo ? formatDistanceAndEta(distInfo) : null

                      return (
                        <div
                          key={req.id}
                          className="p-3.5 sm:p-4 rounded-2xl bg-slate-900 border border-amber-500/40 space-y-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-bold text-sm text-white">{req.student?.name || 'Student'}</p>
                                <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold text-amber-400 uppercase">
                                  Pending
                                </span>
                              </div>
                              {req.student?.phone && (
                                <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                                  <Phone className="w-3 h-3 text-slate-500" />
                                  {req.student.phone}
                                </p>
                              )}
                            </div>
                            <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-lg">
                              {req.seatsBooked} Seat(s) • ₹{req.fareAmount}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                            <div>
                              <span className="text-[10px] text-slate-500 block">Pickup Location</span>
                              <span className="font-semibold text-blue-400 block truncate">{req.pickup.name}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-500 block">Drop Location</span>
                              <span className="font-semibold text-emerald-400 block truncate">{req.drop.name}</span>
                            </div>
                          </div>

                          {/* Live Road Distance & Booking Time Info */}
                          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400 flex-wrap pt-1 border-t border-slate-800/60">
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                              <span>Booked: <strong className="text-slate-200">{formatBookingTime(req.createdAt)}</strong></span>
                            </div>

                            {formatted ? (
                              <div className="flex items-center gap-1 font-mono">
                                <Navigation className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                <span className="text-blue-300 font-bold">{formatted.distanceText}</span>
                                <span className="text-slate-400">({formatted.etaText})</span>
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                                  {formatted.badgeText}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-500 text-[10px]">Calculating road route...</span>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <button
                              id={`approve-btn-${req.id}`}
                              onClick={() => handleRespondBooking(req.id, 'APPROVE')}
                              disabled={respondingBookingId === req.id}
                              className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-xs shadow-md transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                              <Check className="w-4 h-4" />
                              <span>{respondingBookingId === req.id ? 'Approving...' : 'Approve'}</span>
                            </button>
                            <button
                              id={`reject-btn-${req.id}`}
                              onClick={() => handleRespondBooking(req.id, 'REJECT')}
                              disabled={respondingBookingId === req.id}
                              className="py-2.5 px-3 rounded-xl bg-red-950/80 hover:bg-red-900 border border-red-500/40 text-red-200 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                              <X className="w-4 h-4" />
                              <span>{respondingBookingId === req.id ? 'Rejecting...' : 'Reject'}</span>
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* RESERVED Student Pickups List (Pending Pickup / Awaiting Boarding) */}
              <div className="p-4 sm:p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-400 shrink-0" />
                    Pending Pickup Reservations ({reservedBookings.length})
                  </h2>
                  <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">
                    {sortOption === 'NEAREST_FIRST' ? 'Sorted by Nearest Pickup' : sortOption === 'EARLIEST_FIRST' ? 'Sorted by Earliest Booking' : 'Nearest with Time Tie-Breaker'}
                  </span>
                </div>

                {reservedBookings.length === 0 ? (
                  <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800 text-center space-y-1">
                    <Clock className="w-5 h-5 text-slate-600 mx-auto" />
                    <p className="text-xs text-slate-400">
                      No pending pickup reservations.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sortedReservedBookings.map((booking) => {
                      const distInfo = routeDistances[booking.id]
                      const formatted = distInfo ? formatDistanceAndEta(distInfo) : null

                      return (
                        <div
                          key={booking.id}
                          className="p-3.5 sm:p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5 min-w-0"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-xs text-white truncate">
                                  {booking.student?.name || 'Student'}
                                </span>
                                <span className="px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-[10px] font-bold text-blue-400 uppercase shrink-0">
                                  Accepted
                                </span>
                              </div>
                              {booking.student?.phone && (
                                <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                                  <Phone className="w-3 h-3 text-slate-500" />
                                  {booking.student.phone}
                                </p>
                              )}
                            </div>

                            <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-lg shrink-0">
                              {booking.seatsBooked} Seat(s) • ₹{booking.fareAmount}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 xs:grid-cols-2 gap-2 text-xs text-slate-300">
                            <div className="min-w-0">
                              <span className="text-[10px] text-slate-500 block">Pickup Stop</span>
                              <span className="font-semibold text-blue-400 block truncate">{booking.pickup.name}</span>
                            </div>
                            <div className="min-w-0">
                              <span className="text-[10px] text-slate-500 block">Drop Stop</span>
                              <span className="font-semibold text-emerald-400 block truncate">{booking.drop.name}</span>
                            </div>
                          </div>

                          {/* Live Road Distance & Booking Time Info */}
                          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400 flex-wrap pt-1 border-t border-slate-800/80">
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                              <span>Booked: <strong className="text-slate-200">{formatBookingTime(booking.createdAt)}</strong></span>
                            </div>

                            {formatted ? (
                              <div className="flex items-center gap-1 font-mono">
                                <Navigation className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                <span className="text-blue-300 font-bold">{formatted.distanceText}</span>
                                <span className="text-slate-400">({formatted.etaText})</span>
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                                  {formatted.badgeText}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-500 text-[10px]">Calculating road route...</span>
                            )}
                          </div>

                          {/* Action Buttons: Board Passenger & Cancel Ride */}
                          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/80">
                            <button
                              id={`board-passenger-btn-${booking.id}`}
                              onClick={() => handleBoardPassenger(booking.id)}
                              disabled={boardingBookingId === booking.id || respondingBookingId === booking.id}
                              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs transition-all flex items-center gap-1.5 shadow-md shadow-blue-950/40 disabled:opacity-50"
                              title="Confirm passenger has boarded the shuttle"
                            >
                              {boardingBookingId === booking.id ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>Boarding...</span>
                                </>
                              ) : (
                                <>
                                  <Bus className="w-3.5 h-3.5" />
                                  <span>Board Passenger</span>
                                </>
                              )}
                            </button>

                            <button
                              id={`cancel-reservation-btn-${booking.id}`}
                              onClick={() => handleRespondBooking(booking.id, 'CANCEL')}
                              disabled={respondingBookingId === booking.id || boardingBookingId === booking.id}
                              className="px-3 py-1.5 rounded-xl bg-red-950/80 hover:bg-red-900 border border-red-500/40 text-red-200 font-bold text-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
                              title="Cancel only this student's reservation"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>{respondingBookingId === booking.id ? 'Cancelling...' : 'Cancel Ride'}</span>
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* BOARDED Passengers Grouped by Drop Location */}
              <div className="p-4 sm:p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
                    On-Board Passengers ({boardedBookings.length})
                  </h2>
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 shrink-0">
                    Pickup in Progress / Ready for Drop
                  </span>
                </div>

                {Object.keys(groupedBoardedByDrop).length === 0 ? (
                  <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800 text-center space-y-1">
                    <Clock className="w-5 h-5 text-slate-600 mx-auto" />
                    <p className="text-xs text-slate-400">
                      No passengers currently boarded on shuttle.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(groupedBoardedByDrop).map(([dropName, passengerList]) => (
                      <div
                        key={dropName}
                        className="p-3.5 sm:p-4 rounded-2xl bg-slate-950 border border-emerald-500/30 space-y-3"
                      >
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <span className="font-bold text-xs text-emerald-400 flex items-center gap-1.5 truncate">
                            <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span className="truncate">Drop Stop: {dropName}</span>
                          </span>
                          <span className="text-[10px] text-slate-400 shrink-0">
                            {passengerList.length} Booking(s)
                          </span>
                        </div>

                        <div className="space-y-2">
                          {passengerList.map((passenger) => (
                            <div
                              key={passenger.id}
                              className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row gap-2.5 sm:items-center sm:justify-between text-xs min-w-0"
                            >
                              <div className="space-y-0.5 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold text-slate-100 truncate">
                                    {passenger.student?.name || 'Student'}
                                  </p>
                                  <span className="px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-400 text-[9px] font-bold uppercase">
                                    On-Board
                                  </span>
                                </div>
                                <p className="text-[10px] text-slate-400 truncate">
                                  Pickup: {passenger.pickup.name} • {passenger.seatsBooked} Seat(s) • Booked {formatBookingTime(passenger.createdAt)}
                                </p>
                                <p className="text-[10px] font-mono text-amber-400">
                                  Collect Fare: ₹{passenger.fareAmount}
                                </p>
                              </div>

                              <button
                                id={`drop-complete-btn-${passenger.id}`}
                                onClick={() => setSelectedBookingForPayment(passenger)}
                                className="w-full sm:w-auto px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1 shrink-0"
                              >
                                <CreditCard className="w-3.5 h-3.5" />
                                <span>Drop Completed</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {/* Fare Collection Confirmation Modal */}
        {selectedBookingForPayment && (
          <PaymentModal
            booking={selectedBookingForPayment}
            onConfirm={handleConfirmPaymentAndComplete}
            onCancel={() => setSelectedBookingForPayment(null)}
            submitting={completingTrip}
          />
        )}

        {/* Refill Seats Prompt Modal (After Ride Finished or Manual) */}
        {showRefillModal && (
          <RefillSeatsModal
            vehicleId={vehicle?.id}
            currentSeats={availableSeats}
            capacity={capacity}
            passengerName={finishedRideStudentName}
            onClose={() => {
              setShowRefillModal(false)
              setFinishedRideStudentName(undefined)
            }}
            onSeatsUpdated={(newCount) => {
              if (vehicle) {
                setVehicle({ ...vehicle, availableSeats: newCount })
              }
              setStatusMsg(`Seats successfully updated to ${newCount}!`)
              fetchDriverData()
            }}
          />
        )}

      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/80 bg-slate-950 py-4 px-4 text-center text-xs text-slate-400">
        <p>© {new Date().getFullYear()} KARE Intra-Campus Shuttle Driver Portal</p>
      </footer>
    </div>
  )
}
