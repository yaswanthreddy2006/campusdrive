'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSession, signIn, signOut } from 'next-auth/react'
import {
  Bus,
  CreditCard,
  CheckCircle2,
  Activity,
  MapPin,
  RefreshCw,
  Search,
  ArrowLeft,
  FileText,
  Building2,
  ShieldCheck,
  Clock,
  Loader2,
  UserCheck,
  UserX,
  LogOut,
  ShieldAlert,
  Lock,
} from 'lucide-react'

interface AdminMetrics {
  totalCompletedRides: number
  dailyTotalRevenue: number
  totalActiveAutosOnDuty: number
  seatUtilizationPercent: number
  pendingDriversCount?: number
}

interface PendingDriver {
  id: string
  name: string
  email: string
  phone: string
  createdAt: string
  driverStatus: string
  vehicle?: {
    vehicleNumber: string
  }
}

interface FleetVehicle {
  id: string
  vehicleNumber: string
  capacity: number
  availableSeats: number
  isOnline: boolean
  currentLat: number | null
  currentLng: number | null
  lastGpsUpdate: string | null
  driver: {
    name: string
    email: string
    phone: string
  }
}

interface RideLog {
  id: string
  seatsBooked: number
  fareAmount: number
  paymentStatus: string
  status: string
  createdAt: string
  student: {
    name: string
    email: string
    registerNum: string | null
  }
  pickup: { name: string }
  drop: { name: string }
  vehicle: { vehicleNumber: string }
}

export default function AdminDashboardPage() {
  const { data: session, status: sessionStatus } = useSession()
  const [metrics, setMetrics] = useState<AdminMetrics>({
    totalCompletedRides: 0,
    dailyTotalRevenue: 0,
    totalActiveAutosOnDuty: 0,
    seatUtilizationPercent: 0,
    pendingDriversCount: 0,
  })

  const [fleet, setFleet] = useState<FleetVehicle[]>([])
  const [pendingDrivers, setPendingDrivers] = useState<PendingDriver[]>([])
  const [rideLogs, setRideLogs] = useState<RideLog[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [verifyingId, setVerifyingId] = useState<string | null>(null)

  const userEmail = session?.user?.email?.toLowerCase().trim()
  const isAdmin = userEmail === 'yaswanthputluru@gmail.com' || session?.user?.role === 'ADMIN'

  async function fetchAdminData() {
    if (!isAdmin) return
    try {
      setRefreshing(true)
      const res = await fetch('/api/admin/stats')
      const data = await res.json()

      if (data.metrics) {
        setMetrics(data.metrics)
      }
      if (data.liveFleet) {
        setFleet(data.liveFleet)
      }
      if (data.pendingDrivers) {
        setPendingDrivers(data.pendingDrivers)
      }
      if (data.rideLogs) {
        setRideLogs(data.rideLogs)
      }
    } catch (err) {
      console.error('Error loading admin analytics:', err)
    } finally {
      setRefreshing(false)
    }
  }

  async function handleVerifyDriver(driverId: string, action: 'APPROVE' | 'REJECT') {
    try {
      setVerifyingId(driverId)
      const res = await fetch('/api/admin/drivers/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId, action }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Driver verification failed.')
      }
      await fetchAdminData()
    } catch (err) {
      console.error('Error verifying driver:', err)
    } finally {
      setVerifyingId(null)
    }
  }

  useEffect(() => {
    if (isAdmin) {
      fetchAdminData()
      const interval = setInterval(fetchAdminData, 10000)
      return () => clearInterval(interval)
    }
  }, [isAdmin])

  const filteredLogs = rideLogs.filter(
    (log) =>
      log.student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.student.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.student.registerNum &&
        log.student.registerNum.toLowerCase().includes(searchQuery.toLowerCase())) ||
      log.pickup.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.drop.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // 1. Session Loading State
  if (sessionStatus === 'loading') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
          <p className="text-xs text-slate-400 font-mono">Verifying Administrator Session...</p>
        </div>
      </div>
    )
  }

  // 2. Unauthenticated State: Prompt Google Sign-In with yaswanthputluru@gmail.com
  if (sessionStatus === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative max-w-md w-full p-6 sm:p-8 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl space-y-6 text-center backdrop-blur-xl">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-inner">
            <Lock className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-xs font-semibold text-blue-400">
              <Building2 className="w-3.5 h-3.5" />
              KARE Operations Control
            </div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">Admin Sign-In Required</h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              Access to KARE Intra-Campus Shuttle Operations Control requires Google authentication using an authorized administrator account.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <button
              onClick={() => signIn('google', { callbackUrl: '/admin/dashboard', prompt: 'select_account' })}
              className="w-full p-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs sm:text-sm shadow-xl transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
            >
              <svg className="w-5 h-5 fill-current shrink-0" viewBox="0 0 24 24">
                <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.761H12.545z" />
              </svg>
              Sign In with Admin Google Account
            </button>

            <Link
              href="/"
              className="block w-full py-3 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              Return to Campus Shuttle Home
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // 3. Authenticated but Non-Admin Account State
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative max-w-md w-full p-6 sm:p-8 rounded-3xl bg-slate-900/90 border border-red-500/30 shadow-2xl space-y-6 text-center backdrop-blur-xl">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 shadow-inner">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-950/60 border border-red-500/30 text-xs font-semibold text-red-300">
              <Building2 className="w-3.5 h-3.5" />
              Access Restricted
            </div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">Admin Authorization Required</h1>
            <p className="text-xs text-slate-300 leading-relaxed">
              Logged in as <strong className="text-white font-mono">{userEmail}</strong>. This account does not have administrator privileges for Kalasalingam Operations Control.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <button
              onClick={() => signIn('google', { callbackUrl: '/admin/dashboard', prompt: 'select_account' })}
              className="w-full p-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold text-xs sm:text-sm shadow-xl transition-all flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Switch Account to Authorized Admin
            </button>

            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="w-full py-3 rounded-2xl bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-400 text-xs font-medium transition-colors flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-blue-500 selection:text-white">
      {/* Background ambient glows */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-gradient-to-b from-blue-600/15 via-indigo-600/5 to-transparent blur-3xl pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-slate-950/80 border-b border-slate-800/80 px-4 py-3 sm:px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-blue-500/40 text-slate-300 transition-colors"
              title="Home"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>

            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <span className="font-extrabold text-sm sm:text-base text-white tracking-tight">
                  KARE Operations Control
                </span>
                <span className="block text-[10px] text-blue-400 font-mono">
                  Administrative Analytics Console
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden md:flex flex-col text-right">
              <span className="text-xs font-bold text-white truncate">{session?.user?.name || 'Administrator'}</span>
              <span className="text-[10px] text-blue-400 font-mono truncate">{userEmail}</span>
            </div>

            <button
              id="refresh-admin-stats-btn"
              onClick={fetchAdminData}
              disabled={refreshing}
              className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-blue-500/40 text-slate-200 font-semibold text-xs transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-red-500/40 text-slate-300 hover:text-red-400 transition-colors"
              title="Sign Out Admin"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 py-6 sm:py-8 flex-1 w-full space-y-8">
        
        {/* Title */}
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-xs font-bold text-blue-400">
            <Activity className="w-3.5 h-3.5 text-blue-400" />
            Live KARE Campus Mobility Metrics
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Kalasalingam Shuttle Analytics Dashboard
          </h1>
        </div>

        {/* 4 Key Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Metric 1: Total Completed Rides */}
          <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-2">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>Total Completed Rides</span>
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-black text-white font-mono">
              {metrics.totalCompletedRides}
            </div>
            <p className="text-[11px] text-emerald-400 font-medium">
              Successful Student Drops
            </p>
          </div>

          {/* Metric 2: Daily Total Revenue */}
          <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-2">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>Daily Total Revenue</span>
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <CreditCard className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-black text-amber-400 font-mono">
              ₹{metrics.dailyTotalRevenue}
            </div>
            <p className="text-[11px] text-amber-300 font-medium">
              Collected via Cash & Driver UPI
            </p>
          </div>

          {/* Metric 3: Total Active Autos on Duty */}
          <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-2">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>Shuttles On Duty</span>
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <Bus className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-black text-white font-mono">
              {metrics.totalActiveAutosOnDuty}
            </div>
            <p className="text-[11px] text-blue-400 font-medium flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              Broadcasting Live GPS
            </p>
          </div>

          {/* Metric 4: Seat Utilization % */}
          <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-2">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>Seat Capacity Utilization</span>
              <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <Activity className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-black text-indigo-400 font-mono">
              {metrics.seatUtilizationPercent}%
            </div>
            {/* Progress Bar */}
            <div className="w-full h-1.5 rounded-full bg-slate-950 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, metrics.seatUtilizationPercent)}%` }}
              />
            </div>
          </div>

        </div>

        {/* Pending Driver Verification Table */}
        <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              Pending Driver Verification Approvals
            </h2>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold font-mono ${
              pendingDrivers.length > 0
                ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400 animate-pulse'
                : 'bg-slate-800 border border-slate-700 text-slate-400'
            }`}>
              {pendingDrivers.length} Driver(s) Pending Approval
            </span>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-xs min-w-[650px]">
              <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 whitespace-nowrap">Driver Name</th>
                  <th className="py-3 px-4 whitespace-nowrap">Mobile Number</th>
                  <th className="py-3 px-4 whitespace-nowrap">Assigned Vehicle</th>
                  <th className="py-3 px-4 whitespace-nowrap">Submitted Date</th>
                  <th className="py-3 px-4 whitespace-nowrap">Verification Status</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Admin Verification Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {pendingDrivers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-500">
                      No drivers currently waiting for verification approval.
                    </td>
                  </tr>
                ) : (
                  pendingDrivers.map((driver) => (
                    <tr key={driver.id} className="hover:bg-slate-850/50 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-white whitespace-nowrap">
                        {driver.name}
                        <div className="text-[10px] text-slate-400 font-mono font-normal">{driver.email}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-200 whitespace-nowrap">
                        {driver.phone}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-amber-400 whitespace-nowrap">
                        {driver.vehicle?.vehicleNumber || 'Unassigned'}
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 text-[10px] font-mono whitespace-nowrap">
                        {new Date(driver.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1 w-fit">
                          <Clock className="w-3 h-3 text-amber-400 animate-spin" />
                          PENDING VERIFICATION
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            id={`approve-driver-btn-${driver.id}`}
                            onClick={() => handleVerifyDriver(driver.id, 'APPROVE')}
                            disabled={verifyingId === driver.id}
                            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1 disabled:opacity-50"
                          >
                            {verifyingId === driver.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <UserCheck className="w-3.5 h-3.5" />
                            )}
                            Approve Driver
                          </button>

                          <button
                            id={`reject-driver-btn-${driver.id}`}
                            onClick={() => handleVerifyDriver(driver.id, 'REJECT')}
                            disabled={verifyingId === driver.id}
                            className="px-3 py-1.5 rounded-xl bg-slate-900 border border-red-500/30 hover:bg-red-950/60 text-red-300 font-bold text-xs transition-all flex items-center gap-1 disabled:opacity-50"
                          >
                            <UserX className="w-3.5 h-3.5 text-red-400" />
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Live Fleet Status Table */}
        <div className="p-4 sm:p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Bus className="w-4 h-4 text-amber-400" />
              Live Fleet Status
            </h2>
            <span className="text-xs font-semibold text-slate-400">
              {fleet.length} Shuttle(s) Registered
            </span>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-xs min-w-[650px]">
              <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 whitespace-nowrap">Vehicle No</th>
                  <th className="py-3 px-4 whitespace-nowrap">Driver Name</th>
                  <th className="py-3 px-4 whitespace-nowrap">Duty Status</th>
                  <th className="py-3 px-4 whitespace-nowrap">Live GPS Position</th>
                  <th className="py-3 px-4 whitespace-nowrap">Open Seats</th>
                  <th className="py-3 px-4 whitespace-nowrap">Last Update</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {fleet.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-500">
                      No vehicles found in fleet.
                    </td>
                  </tr>
                ) : (
                  fleet.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-850/50 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-white font-mono whitespace-nowrap">
                        {v.vehicleNumber}
                      </td>
                      <td className="py-3.5 px-4 text-slate-200 whitespace-nowrap">
                        <div className="font-semibold">{v.driver.name}</div>
                        <div className="text-[10px] text-slate-400">{v.driver.phone}</div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {v.isOnline ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-bold text-emerald-400">
                            ONLINE
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-semibold text-slate-400">
                            OFFLINE
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-300 text-[11px] whitespace-nowrap">
                        <MapPin className="w-3 h-3 text-blue-400 inline mr-1" />
                        {v.currentLat ? `${v.currentLat.toFixed(4)}, ${v.currentLng?.toFixed(4)}` : 'N/A'}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-amber-400 whitespace-nowrap">
                        {v.availableSeats} / {v.capacity}
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 text-[10px] whitespace-nowrap">
                        {v.lastGpsUpdate ? new Date(v.lastGpsUpdate).toLocaleTimeString() : 'N/A'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Comprehensive Ride Logs Table */}
        <div className="p-4 sm:p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-400" />
              Comprehensive Ride & Booking Logs
            </h2>

            {/* Filter Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filter by Student or Stop..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder-slate-600 outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-xs min-w-[700px]">
              <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 whitespace-nowrap">Student & Email</th>
                  <th className="py-3 px-4 whitespace-nowrap">Reg No</th>
                  <th className="py-3 px-4 whitespace-nowrap">Pickup ➔ Drop</th>
                  <th className="py-3 px-4 whitespace-nowrap">Seats</th>
                  <th className="py-3 px-4 whitespace-nowrap">Fare</th>
                  <th className="py-3 px-4 whitespace-nowrap">Payment</th>
                  <th className="py-3 px-4 whitespace-nowrap">Booking Status</th>
                  <th className="py-3 px-4 whitespace-nowrap">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-slate-500">
                      No matching booking logs found.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-850/50 transition-colors">
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-semibold text-slate-100">{log.student.name}</div>
                        <div className="text-[10px] text-blue-400 font-mono">{log.student.email}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-300 text-[11px] whitespace-nowrap">
                        {log.student.registerNum || 'KLU-STD'}
                      </td>
                      <td className="py-3.5 px-4 text-slate-200 whitespace-nowrap">
                        <span className="text-blue-400 font-semibold">{log.pickup.name}</span> ➔{' '}
                        <span className="text-emerald-400 font-semibold">{log.drop.name}</span>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-200 whitespace-nowrap">
                        {log.seatsBooked}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-amber-400 whitespace-nowrap">
                        ₹{log.fareAmount}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {log.paymentStatus === 'PAID' ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold text-[10px]">
                            PAID
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 font-bold text-[10px]">
                            PENDING
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            log.status === 'COMPLETED'
                              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                              : log.status === 'BOARDED'
                              ? 'bg-blue-500/10 border border-blue-500/30 text-blue-400'
                              : 'bg-slate-800 border border-slate-700 text-slate-300'
                          }`}
                        >
                          {log.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 text-[10px] font-mono whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/80 bg-slate-950 py-4 px-4 text-center text-xs text-slate-400">
        <p>© {new Date().getFullYear()} Kalasalingam Academy of Research and Education Admin Operations</p>
      </footer>
    </div>
  )
}
