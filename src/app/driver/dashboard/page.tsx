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
} from 'lucide-react'

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
  pickup: { name: string }
  drop: { name: string }
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

  const watchIdRef = useRef<number | null>(null)
  const prevRequestedCountRef = useRef(0)

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

  // Send GPS location to server
  const broadcastLocation = useCallback(async (lat: number, lng: number, onlineStatus: boolean) => {
    try {
      const res = await fetch('/api/driver/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isOnline: onlineStatus,
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
      const res = await fetch('/api/driver/bookings')
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
        setIsOnDuty(data.vehicle.isOnline)
        if (data.vehicle.currentLat && data.vehicle.currentLng) {
          setCurrentCoords({
            lat: data.vehicle.currentLat,
            lng: data.vehicle.currentLng,
          })
        }
      }
      if (data.bookings) {
        setBookings(data.bookings)
      }
    } catch (err) {
      console.error('Error fetching driver data:', err)
    }
  }, [])

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
            playNotificationAlert()
            setStatusMsg(`New booking request from ${newBooking.student?.name || 'Student'}!`)
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
    const nextState = !isOnDuty

    if (nextState) {
      if (!isSimulatingGps && 'geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = pos.coords.latitude
            const lng = pos.coords.longitude
            setCurrentCoords({ lat, lng })
            setIsOnDuty(true)
            setLocationPromptNeeded(false)
            setStatusMsg('On Duty active! Broadcasting real-time device GPS.')
            broadcastLocation(lat, lng, true)
          },
          (err) => {
            console.warn('Location permission needed:', err)
            setLocationPromptNeeded(true)
            setStatusMsg('Location is required. Please turn on device GPS.')
          },
          { enableHighAccuracy: true, timeout: 8000 }
        )
        return
      }

      setIsOnDuty(true)
      setStatusMsg('On Duty active! Broadcasting real-time GPS coordinates.')
      broadcastLocation(currentCoords.lat, currentCoords.lng, true)
    } else {
      setIsOnDuty(false)
      setLocationPromptNeeded(false)
      setStatusMsg('Off Duty. Location broadcasting stopped.')
      broadcastLocation(currentCoords.lat, currentCoords.lng, false)
      if (watchIdRef.current !== null) {
        navigator.geolocation?.clearWatch(watchIdRef.current)
      }
    }
  }

  // Real Geolocation watchPosition
  useEffect(() => {
    if (isOnDuty && !isSimulatingGps && 'geolocation' in navigator) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const newLat = pos.coords.latitude
          const newLng = pos.coords.longitude
          setCurrentCoords({ lat: newLat, lng: newLng })
          broadcastLocation(newLat, newLng, true)
        },
        (err) => {
          console.warn('Geolocation access error, falling back to simulated GPS:', err)
          setIsSimulatingGps(true)
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
      )
    }

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation?.clearWatch(watchIdRef.current)
      }
    }
  }, [isOnDuty, isSimulatingGps, broadcastLocation])

  // Simulated GPS Movement along KARE Waypoints
  useEffect(() => {
    let simInterval: NodeJS.Timeout | null = null

    if (isOnDuty && isSimulatingGps) {
      simInterval = setInterval(() => {
        setWaypointIndex((prevIdx) => {
          const nextIdx = (prevIdx + 1) % KARE_SIMULATED_WAYPOINTS.length
          const wp = KARE_SIMULATED_WAYPOINTS[nextIdx]
          setCurrentCoords({ lat: wp.lat, lng: wp.lng })
          broadcastLocation(wp.lat, wp.lng, true)
          return nextIdx
        })
      }, 5000)
    }

    return () => {
      if (simInterval) clearInterval(simInterval)
    }
  }, [isOnDuty, isSimulatingGps, broadcastLocation])

  // Play audio chime and trigger alert when new booking requests arrive
  useEffect(() => {
    const currentRequested = bookings.filter((b) => b.status === 'REQUESTED').length
    if (currentRequested > prevRequestedCountRef.current) {
      playNotificationAlert()
    }
    prevRequestedCountRef.current = currentRequested
  }, [bookings, playNotificationAlert])

  const handleLogout = async () => {
    await fetch('/api/driver/logout', { method: 'POST' })
    router.push('/driver/login')
  }

  // Handle Driver Approve / Reject of incoming student booking request (Instant Optimistic Update)
  const handleRespondBooking = async (bookingId: string, action: 'APPROVE' | 'REJECT') => {
    setRespondingBookingId(bookingId)

    // OPTIMISTIC UPDATE: update local state in 0ms!
    const targetBooking = bookings.find((b) => b.id === bookingId)
    const newStatus = action === 'APPROVE' ? 'ACCEPTED' : 'REJECTED'
    setBookings((prev) =>
      prev.map((b) => (b.id === bookingId ? { ...b, status: newStatus } : b))
    )
    if (action === 'REJECT' && targetBooking) {
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

  // Partition bookings into REQUESTED (needs driver action), ACCEPTED/RESERVED (pending boarding), and BOARDED
  const requestedBookings = bookings.filter((b) => b.status === 'REQUESTED')
  const reservedBookings = bookings.filter((b) => b.status === 'ACCEPTED' || b.status === 'RESERVED')
  const boardedBookings = bookings.filter((b) => b.status === 'BOARDED')

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
                        <span className="text-slate-400">OFF DUTY</span>
                      )}
                    </h1>
                  </div>

                  <button
                    id="duty-toggle-switch"
                    onClick={toggleDuty}
                    className={`w-16 h-9 rounded-full p-1 transition-colors duration-300 flex items-center shrink-0 ${isOnDuty ? 'bg-emerald-500 justify-end' : 'bg-slate-800 justify-start'
                      }`}
                  >
                    <div className="w-7 h-7 rounded-full bg-white shadow-md flex items-center justify-center text-slate-900 font-bold">
                      <Power className="w-4 h-4" />
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
                    {requestedBookings.map((req) => (
                      <div
                        key={req.id}
                        className="p-3.5 sm:p-4 rounded-2xl bg-slate-900 border border-amber-500/40 space-y-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="font-bold text-sm text-white">{req.student?.name || 'Student'}</p>
                            {req.student?.phone && (
                              <p className="text-[11px] text-slate-400 flex items-center gap-1">
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
                    ))}
                  </div>
                </div>
              )}

              {/* BOARDED Passengers Grouped by Drop Location */}
              <div className="p-4 sm:p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
                    On-Board Passengers ({boardedBookings.length})
                  </h2>
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 shrink-0">
                    Ready for Drop
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
                                <p className="font-semibold text-slate-100 truncate">
                                  {passenger.student?.name || 'Student'}
                                </p>
                                <p className="text-[10px] text-slate-400 truncate">
                                  Pickup: {passenger.pickup.name} • {passenger.seatsBooked} Seat(s)
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

              {/* RESERVED Student Pickups List */}
              <div className="p-4 sm:p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-400 shrink-0" />
                    Pending Pickup Reservations ({reservedBookings.length})
                  </h2>
                  <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">Awaiting Boarding Scan</span>
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
                    {reservedBookings.map((booking) => (
                      <div
                        key={booking.id}
                        className="p-3.5 sm:p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 min-w-0"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-xs text-white truncate">
                            {booking.student?.name || 'Student'}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-[10px] font-bold text-blue-400 uppercase shrink-0">
                            {booking.status}
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

                        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px] gap-2">
                          <span className="text-slate-400 truncate">
                            Seats: <strong className="text-amber-400 font-mono">{booking.seatsBooked}</strong> • Fare: <strong className="text-amber-400 font-mono">₹{booking.fareAmount}</strong>
                          </span>
                          <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-300 shrink-0">
                            Cash / Driver UPI
                          </span>
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
