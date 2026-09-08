'use client'

import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import {
  Bus,
  MapPin,
  Users,
  CreditCard,
  QrCode,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  LogOut,
  ArrowRight,
  Sparkles,
  Ticket,
  ChevronDown,
  Camera,
  X,
} from 'lucide-react'
import { ShuttleItem } from '@/components/DriverMap'

const DriverMap = dynamic(() => import('@/components/DriverMap'), { ssr: false })
const QrScanner = dynamic(() => import('@/components/QrScanner'), { ssr: false })

interface LocationItem {
  id: string
  name: string
  latitude: number
  longitude: number
}

interface BookingItem {
  id: string
  vehicleId: string
  seatsBooked: number
  fareAmount: number
  paymentMethod: string
  paymentStatus: string
  status: string
  createdAt: string
  pickup: LocationItem
  drop: LocationItem
  vehicle: {
    id: string
    vehicleNumber: string
    driver: {
      name: string
      phone: string
    }
  }
}

export default function StudentDashboardPage() {
  const { data: session, status: authStatus } = useSession()

  const [locations, setLocations] = useState<LocationItem[]>([])
  const [pickupId, setPickupId] = useState<string>('')
  const [dropId, setDropId] = useState<string>('')
  const [seatsBooked, setSeatsBooked] = useState<number>(1)

  const [loadingLocations, setLoadingLocations] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const [activeBooking, setActiveBooking] = useState<BookingItem | null>(null)
  const [pastBookings, setPastBookings] = useState<BookingItem[]>([])
  const [showQRModal, setShowQRModal] = useState(false)

  const [showScannerModal, setShowScannerModal] = useState(false)
  const [boardingConfirmedMsg, setBoardingConfirmedMsg] = useState<string | null>(null)

  const [activeShuttles, setActiveShuttles] = useState<ShuttleItem[]>([])

  // Fetch campus locations
  useEffect(() => {
    async function loadLocations() {
      try {
        const res = await fetch('/api/locations')
        const data = await res.json()
        if (data.locations && data.locations.length > 0) {
          setLocations(data.locations)
          setPickupId(data.locations[0].id)
          if (data.locations.length > 1) {
            setDropId(data.locations[1].id)
          }
        }
      } catch (err) {
        console.error('Failed to load locations:', err)
      } finally {
        setLoadingLocations(false)
      }
    }

    loadLocations()
    fetchStudentBookings()
    fetchActiveShuttles()

    // 5-second polling interval for live shuttle GPS updates
    const interval = setInterval(() => {
      fetchActiveShuttles()
      fetchStudentBookings()
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  // Fetch active shuttles for map
  async function fetchActiveShuttles() {
    try {
      const res = await fetch('/api/shuttles/active')
      const data = await res.json()
      if (data.shuttles) {
        setActiveShuttles(data.shuttles)
      }
    } catch (err) {
      console.error('Failed to fetch active shuttles:', err)
    }
  }

  // Fetch student bookings
  async function fetchStudentBookings() {
    try {
      const res = await fetch('/api/bookings/student')
      const data = await res.json()
      if (data.bookings && data.bookings.length > 0) {
        const active = data.bookings.find(
          (b: BookingItem) => b.status === 'RESERVED' || b.status === 'BOARDED'
        )
        setActiveBooking(active || null)
        setPastBookings(data.bookings.filter((b: BookingItem) => b.id !== active?.id))
      }
    } catch (err) {
      console.error('Failed to fetch bookings:', err)
    }
  }

  const isSameLocation = pickupId !== '' && pickupId === dropId
  const totalFare = seatsBooked * 10

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccessMsg(null)

    if (isSameLocation) {
      setError('Pickup and Drop-off locations cannot be the same stop.')
      return
    }

    setSubmitting(true)

    try {
      const res = await fetch('/api/bookings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pickupId, dropId, seatsBooked }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Seat reservation failed.')
      }

      setSuccessMsg('Seat reserved successfully! Show your QR code to the shuttle driver.')
      setActiveBooking(data.booking)
      fetchStudentBookings()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Reservation failed.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleQrScanSuccess = async (scannedText: string) => {
    setShowScannerModal(false)
    if (!activeBooking) return

    try {
      const res = await fetch('/api/bookings/board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: activeBooking.id,
          vehicleId: scannedText,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Boarding verification failed.')
      }

      setBoardingConfirmedMsg(data.message || 'Boarding Confirmed! Driver notified.')
      setActiveBooking(data.booking)
      fetchStudentBookings()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Boarding verification failed.')
    }
  }

  const studentName = session?.user?.name || 'KLU Student'
  const studentEmail = session?.user?.email || 'student@klu.ac.in'

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-blue-500 selection:text-white">
      {/* Background ambient glows */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-5xl h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 right-0 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-slate-950/80 border-b border-slate-800/80 px-3 sm:px-8 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          <Link href="/" className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shrink-0">
              <Bus className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <span className="font-extrabold text-xs sm:text-sm text-white tracking-tight truncate block">
                KARE Shuttle Pool
              </span>
              <span className="block text-[9px] sm:text-[10px] text-blue-400 font-mono truncate">
                Student Portal
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-2.5 shrink-0">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-xs font-semibold text-slate-200">{studentName}</span>
              <span className="text-[10px] text-slate-400 font-mono">{studentEmail}</span>
            </div>

            {authStatus === 'authenticated' && (
              <button
                onClick={() => signOut()}
                className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-red-500/40 text-slate-300 hover:text-red-400 transition-colors"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="relative z-10 max-w-xl lg:max-w-6xl mx-auto px-3 sm:px-6 py-6 sm:py-8 flex-1 w-full space-y-6">
        
        {/* Welcome Greeting Card */}
        <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-blue-950/60 via-slate-900 to-indigo-950/60 border border-blue-500/20 shadow-xl backdrop-blur-md flex items-center justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-[10px] font-bold text-blue-400">
              <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
              <span>Welcome to KARE Commute</span>
            </div>
            <h1 className="text-base sm:text-xl font-bold text-white tracking-tight truncate">
              Hello, {studentName.split(' ')[0]} 👋
            </h1>
            <p className="text-xs text-slate-400">
              Book shuttle seats & track live GPS on Kalasalingam campus.
            </p>
          </div>
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
            <Bus className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        </div>

        {/* Boarding Confirmed Banner Modal */}
        {boardingConfirmedMsg && (
          <div className="p-4 rounded-3xl bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 text-xs shadow-2xl flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                <CheckCircle2 className="w-6 h-6 animate-bounce" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-white">Boarding Confirmed!</h4>
                <p className="text-[11px] text-emerald-300">Driver notified. Have a safe campus ride!</p>
              </div>
            </div>
            <button
              onClick={() => setBoardingConfirmedMsg(null)}
              className="p-1 rounded-lg bg-emerald-900/60 hover:bg-emerald-800 text-emerald-200 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 2-Column Responsive Desktop Grid */}
        <div className="lg:grid lg:grid-cols-12 lg:gap-6 lg:items-start space-y-6 lg:space-y-0">
          
          {/* Left Column: Map & Active Ticket */}
          <div className="lg:col-span-7 space-y-6">
            {/* Live GPS Shuttle Campus Map */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  Live Campus Shuttle Tracking
                </h2>
                <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  Updated every 5s
                </span>
              </div>

              <DriverMap shuttles={activeShuttles} />
            </div>

            {/* Active Ticket Banner */}
            {activeBooking && (
              <div className="p-4 sm:p-5 rounded-3xl bg-slate-900/90 border border-emerald-500/40 shadow-2xl shadow-emerald-950/30 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Ticket className="w-5 h-5 text-emerald-400 shrink-0" />
                    <span className="font-bold text-sm text-white">Active Shuttle Ticket</span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-xs font-bold text-emerald-400 uppercase tracking-wider shrink-0">
                    {activeBooking.status}
                  </span>
                </div>

                <div className="grid grid-cols-1 xs:grid-cols-2 gap-3 text-xs">
                  <div className="space-y-0.5 min-w-0">
                    <span className="text-slate-400">Pickup Stop</span>
                    <p className="font-semibold text-slate-200 flex items-center gap-1 truncate">
                      <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span className="truncate">{activeBooking.pickup.name}</span>
                    </p>
                  </div>

                  <div className="space-y-0.5 min-w-0">
                    <span className="text-slate-400">Drop Stop</span>
                    <p className="font-semibold text-slate-200 flex items-center gap-1 truncate">
                      <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="truncate">{activeBooking.drop.name}</span>
                    </p>
                  </div>

                  <div className="space-y-0.5 min-w-0">
                    <span className="text-slate-400">Shuttle & Driver</span>
                    <p className="font-semibold text-slate-200 truncate">
                      {activeBooking.vehicle.vehicleNumber} ({activeBooking.vehicle.driver.name.split(' ')[0]})
                    </p>
                  </div>

                  <div className="space-y-0.5 min-w-0">
                    <span className="text-slate-400">Seats / Fare</span>
                    <p className="font-semibold text-amber-400 truncate">
                      {activeBooking.seatsBooked} Seat(s) • ₹{activeBooking.fareAmount}
                    </p>
                  </div>
                </div>

                {/* Scan Vehicle QR to Board Button (For RESERVED Tickets) */}
                {activeBooking.status === 'RESERVED' && (
                  <button
                    id="scan-vehicle-qr-btn"
                    onClick={() => setShowScannerModal(true)}
                    className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold text-xs shadow-lg transition-all flex items-center justify-center gap-2"
                  >
                    <Camera className="w-4 h-4" />
                    Scan Vehicle QR to Board
                  </button>
                )}

                <button
                  onClick={() => setShowQRModal(!showQRModal)}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-300 font-semibold text-xs transition-all flex items-center justify-center gap-2"
                >
                  <QrCode className="w-4 h-4" />
                  {showQRModal ? 'Hide Digital Ticket QR' : 'Show Boarding Pass QR Code'}
                </button>

                {/* QR Code Digital Pass */}
                {showQRModal && (
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center space-y-2 animate-fadeIn">
                    <div className="mx-auto w-36 h-36 sm:w-40 sm:h-40 bg-white p-3 rounded-xl flex items-center justify-center shadow-inner">
                      <div className="w-full h-full border-4 border-slate-950 rounded bg-slate-950 p-2 text-white font-mono text-[9px] flex flex-col justify-between items-center text-center overflow-hidden">
                        <QrCode className="w-16 h-16 sm:w-20 sm:h-20 text-blue-400" />
                        <span className="text-[8px] text-slate-400 tracking-tighter truncate w-full">
                          TICKET #{activeBooking.id.slice(-8).toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Present this QR code to Driver upon entering shuttle <strong className="text-white">{activeBooking.vehicle.vehicleNumber}</strong>
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Reservation Form & History */}
          <div className="lg:col-span-5 space-y-6">
            {/* Ride Booking Card */}
            <div className="p-4 sm:p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl space-y-5">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  <Bus className="w-4 h-4 text-blue-400 shrink-0" />
                  Reserve Shuttle Seats
                </h2>
                <span className="text-[11px] font-medium text-slate-400">
                  ₹10 / seat
                </span>
              </div>

              {error && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-red-950/60 border border-red-500/40 text-red-300 text-xs">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {successMsg && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{successMsg}</span>
                </div>
              )}

              <form onSubmit={handleBookingSubmit} className="space-y-4">
                
                {/* Pickup Location Selector */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    Pickup Location
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-blue-400">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <select
                      id="pickup-location-select"
                      value={pickupId}
                      onChange={(e) => setPickupId(e.target.value)}
                      className="w-full pl-10 pr-8 py-3 rounded-2xl bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs sm:text-sm text-slate-100 outline-none appearance-none transition-all cursor-pointer"
                      disabled={loadingLocations}
                    >
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-500">
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                {/* Drop-off Location Selector */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    Drop-off Location
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-emerald-400">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <select
                      id="drop-location-select"
                      value={dropId}
                      onChange={(e) => setDropId(e.target.value)}
                      className={`w-full pl-10 pr-8 py-3 rounded-2xl bg-slate-950 border ${
                        isSameLocation
                          ? 'border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                          : 'border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
                      } text-xs sm:text-sm text-slate-100 outline-none appearance-none transition-all cursor-pointer`}
                      disabled={loadingLocations}
                    >
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-500">
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>

                  {/* Dynamic Validation Alert */}
                  {isSameLocation && (
                    <p className="text-[11px] text-red-400 font-medium pt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      Drop-off location cannot be identical to Pickup stop.
                    </p>
                  )}
                </div>

                {/* Seat Selector (Counter 1 to 3) */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    Number of Seats (Max 3)
                  </label>
                  <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                      <Users className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Seats Booked:</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setSeatsBooked(Math.max(1, seatsBooked - 1))}
                        disabled={seatsBooked <= 1}
                        className="w-8 h-8 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 font-bold flex items-center justify-center disabled:opacity-30 transition-all"
                      >
                        -
                      </button>
                      <span className="w-6 text-center font-bold text-base text-amber-400 font-mono">
                        {seatsBooked}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSeatsBooked(Math.min(3, seatsBooked + 1))}
                        disabled={seatsBooked >= 3}
                        className="w-8 h-8 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 font-bold flex items-center justify-center disabled:opacity-30 transition-all"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                {/* Dynamic Fare Calculation Box */}
                <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center justify-between text-xs">
                  <span className="text-slate-400">Total Estimated Fare:</span>
                  <span className="text-base font-extrabold text-amber-400 font-mono">
                    ₹{totalFare} <span className="text-[10px] text-slate-400 font-normal">({seatsBooked} × ₹10)</span>
                  </span>
                </div>

                {/* MVP Payment Notice Banner */}
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4 text-amber-400 shrink-0" />
                    Payment Method: Cash or Driver UPI
                  </div>
                  <p className="text-[11px] text-amber-200/80 leading-relaxed">
                    Pay <strong className="text-amber-400 font-semibold">₹{totalFare}</strong> directly to Driver via Cash or UPI (GPay/PhonePe) upon arrival.
                  </p>
                </div>

                {/* Submit Button */}
                <button
                  id="confirm-booking-btn"
                  type="submit"
                  disabled={submitting || isSameLocation || loadingLocations}
                  className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs sm:text-sm transition-all duration-200 shadow-xl shadow-indigo-950/50 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Reserving Seat...
                    </>
                  ) : (
                    <>
                      <span>Confirm Seat Reservation</span>
                      <ArrowRight className="w-4 h-4 shrink-0" />
                    </>
                  )}
                </button>

              </form>
            </div>

            {/* Past Recent Bookings List */}
            {pastBookings.length > 0 && (
              <div className="p-4 sm:p-5 rounded-3xl bg-slate-900/60 border border-slate-800 space-y-3">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Recent Booking History
                </h3>
                <div className="space-y-2">
                  {pastBookings.slice(0, 3).map((b) => (
                    <div
                      key={b.id}
                      className="p-3 rounded-2xl bg-slate-950 border border-slate-800/80 flex items-center justify-between gap-2 text-xs min-w-0"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <p className="font-semibold text-slate-200 truncate">
                          {b.pickup.name} ➔ {b.drop.name}
                        </p>
                        <p className="text-[10px] text-slate-400 font-mono truncate">
                          {new Date(b.createdAt).toLocaleDateString()} • {b.seatsBooked} Seat(s)
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-mono font-bold text-amber-400">₹{b.fareAmount}</span>
                        <span className="block text-[10px] text-slate-400 capitalize">{b.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Camera QR Scanner Modal */}
        {showScannerModal && (
          <QrScanner
            expectedVehicleId={activeBooking?.vehicleId || 'demo-vehicle-id'}
            onScanSuccess={handleQrScanSuccess}
            onClose={() => setShowScannerModal(false)}
          />
        )}

      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/80 bg-slate-950 py-4 px-4 text-center text-xs text-slate-400">
        <p>© {new Date().getFullYear()} Kalasalingam Academy Campus Shuttle Service</p>
      </footer>
    </div>
  )
}
