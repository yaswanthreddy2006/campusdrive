'use client'

import { useState, useEffect } from 'react'
import { signIn, useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Bus,
  ShieldCheck,
  MapPin,
  QrCode,
  CreditCard,
  ChevronRight,
  Sparkles,
  LogOut,
  ArrowRight,
  Clock,
  Users,
  Zap,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react'

const CAMPUS_STOPS = [
  'Main Gate',
  'Girls Hostel',
  'Admin Block',
  'Library',
  'MH 9th Block',
  'MH 11th Block',
]

interface LandingHeroProps {
  lastRole?: 'student' | 'driver' | string | null
}

export default function LandingHero({ lastRole }: LandingHeroProps) {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [activeCount, setActiveCount] = useState<number | null>(null)
  const [isWithinHours, setIsWithinHours] = useState<boolean>(true)
  const [clearingRole, setClearingRole] = useState(false)

  useEffect(() => {
    // Fetch active shuttles with safe array/count resolution
    fetch('/api/shuttles/active')
      .then((res) => res.json())
      .then((data) => {
        const count = Array.isArray(data)
          ? data.length
          : typeof data?.count === 'number'
          ? data.count
          : data?.shuttles?.length || 0
        setActiveCount(count)
      })
      .catch(() => setActiveCount(0))

    // Determine operating hours between 7:00 AM and 9:30 PM IST
    const checkOperatingHours = () => {
      const now = new Date()
      const utc = now.getTime() + now.getTimezoneOffset() * 60000
      const istDate = new Date(utc + 3600000 * 5.5) // IST is UTC + 5:30
      const istMinutes = istDate.getHours() * 60 + istDate.getMinutes()
      // 7:00 AM = 420 mins, 9:30 PM = 21 * 60 + 30 = 1290 mins
      setIsWithinHours(istMinutes >= 7 * 60 && istMinutes <= 21 * 60 + 30)
    }

    checkOperatingHours()
    const timer = setInterval(checkOperatingHours, 30000)
    return () => clearInterval(timer)
  }, [])

  const handleStudentSignIn = () => {
    signIn('google', { callbackUrl: '/student/dashboard', prompt: 'select_account' })
  }

  const handleClearRole = async () => {
    setClearingRole(true)
    try {
      if (typeof document !== 'undefined') {
        document.cookie = 'last_role=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT'
      }
      await fetch('/api/auth/clear-role', {
        method: 'POST',
        headers: { Accept: 'application/json' },
      })
      router.refresh()
      window.location.href = '/'
    } catch (err) {
      console.error('Error clearing role:', err)
      window.location.href = '/'
    } finally {
      setClearingRole(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-blue-500 selection:text-white overflow-x-hidden">
      {/* Background aesthetic lighting */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-gradient-to-b from-blue-600/15 via-violet-600/10 to-transparent blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 right-0 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header Navigation */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/80 border-b border-slate-800/80 px-4 sm:px-8 py-3.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          {/* Logo icon + CampusDrive Go with subtitle */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-violet-950/50 shrink-0">
              <Bus className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="font-extrabold text-base sm:text-lg tracking-tight text-white block truncate">
                CampusDrive Go
              </span>
              <p className="text-[13px] text-slate-300 truncate max-w-[200px] xs:max-w-[280px] sm:max-w-none">
                Kalasalingam Academy of Research and Education
              </p>
            </div>
          </div>

          {/* Header Nav State */}
          <div className="flex items-center gap-2 shrink-0">
            {status === 'authenticated' && session?.user ? (
              <div className="flex items-center gap-2">
                <Link
                  href="/student/dashboard"
                  className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs sm:text-sm shadow-md transition-all flex items-center gap-1.5"
                >
                  <span>Dashboard</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>

                <button
                  onClick={() => signOut()}
                  aria-label="Log out"
                  title="Log out"
                  className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-red-500/40 text-slate-300 hover:text-red-400 transition-all"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Link
                href="/api/auth/signin"
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs sm:text-sm shadow-md shadow-blue-900/40 transition-all active:scale-[0.98]"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main Hero Section */}
      <main className="relative z-10 max-w-4xl mx-auto px-4 py-8 sm:py-16 flex-1 flex flex-col justify-center items-center text-center space-y-6 sm:space-y-8 w-full">
        {/* Badges Row */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 max-w-full">
          {/* Hero Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-[13px] text-slate-300 shadow-xl backdrop-blur-md">
            <Sparkles className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="truncate">Student-built campus shuttle for KARE</span>
          </div>

          {/* Live Shuttle Status Pill */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-[13px] font-medium text-slate-300 shadow-xl backdrop-blur-md">
            {activeCount !== null && activeCount > 0 ? (
              <>
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </span>
                <span className="text-emerald-300 font-semibold">
                  {activeCount} {activeCount === 1 ? 'shuttle' : 'shuttles'} online
                </span>
              </>
            ) : isWithinHours ? (
              <>
                <span className="inline-flex rounded-full h-2.5 w-2.5 bg-amber-400 shrink-0" />
                <span className="text-amber-300 font-medium">No shuttle nearby right now</span>
              </>
            ) : (
              <>
                <span className="inline-flex rounded-full h-2.5 w-2.5 bg-slate-500 shrink-0" />
                <span className="text-slate-300 font-medium">Service resumes at 7:00 AM</span>
              </>
            )}
          </div>
        </div>

        {/* Hero Headline & Subtext */}
        <div className="space-y-3 sm:space-y-4 max-w-2xl px-2">
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-white leading-tight">
            Book your campus shuttle in{' '}
            <span className="bg-gradient-to-r from-blue-500 to-violet-500 bg-clip-text text-transparent">
              seconds
            </span>
          </h1>
          <p className="text-[13px] sm:text-base text-slate-300 max-w-xl mx-auto leading-relaxed">
            Reserve seats, track live shuttle movement across campus hostels & departments, and board seamlessly with instant QR verification.
          </p>
        </div>

        {/* Three Responsive Info Chips */}
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-[13px] sm:text-sm text-slate-300 shadow-sm backdrop-blur-sm">
            <Clock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span>7:00 AM - 9:30 PM</span>
          </div>
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-[13px] sm:text-sm text-slate-300 shadow-sm backdrop-blur-sm">
            <Users className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>9 seats per shuttle</span>
          </div>
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-[13px] sm:text-sm text-slate-300 shadow-sm backdrop-blur-sm">
            <CreditCard className="w-3.5 h-3.5 text-violet-400 shrink-0" />
            <span>Pay by cash or UPI</span>
          </div>
        </div>

        {/* Role-Aware Action Buttons Section */}
        <div className="w-full max-w-md space-y-3 pt-2">
          {/* CASE 1: Student is the last active role */}
          {lastRole === 'student' && (
            <div className="space-y-3">
              {/* Primary Student Login CTA */}
              <button
                id="student-login-btn"
                onClick={handleStudentSignIn}
                className="w-full relative group overflow-hidden p-4 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-bold text-sm shadow-xl shadow-violet-950/60 transition-all duration-200 active:scale-[0.98] flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white backdrop-blur-sm group-hover:scale-105 transition-transform shrink-0">
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                      <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.761H12.545z" />
                    </svg>
                  </div>
                  <div className="text-left min-w-0">
                    <div className="text-sm sm:text-base font-bold text-white flex items-center gap-1.5 truncate">
                      <span>Student Login (KLU Email)</span>
                      <ShieldCheck className="w-4 h-4 text-blue-200 shrink-0" />
                    </div>
                    <div className="text-[13px] text-blue-100/90 font-normal truncate">
                      Restricted to @klu.ac.in Google Accounts
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-white/90 group-hover:translate-x-1 transition-transform shrink-0" />
              </button>

              {/* Subtle Driver Link */}
              <div className="pt-1 text-center">
                <Link
                  id="driver-portal-btn"
                  href="/driver/login"
                  className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-slate-400 hover:text-blue-400 transition-colors py-1 group font-medium"
                >
                  <span>I&apos;m a driver</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </div>
          )}

          {/* CASE 2: Driver is the last active role */}
          {lastRole === 'driver' && (
            <div className="space-y-3">
              {/* Primary Driver Portal CTA */}
              <Link
                id="driver-portal-btn"
                href="/driver/login"
                className="w-full relative group overflow-hidden p-4 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-bold text-sm shadow-xl shadow-violet-950/60 transition-all duration-200 active:scale-[0.98] flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white backdrop-blur-sm group-hover:scale-105 transition-transform shrink-0">
                    <Bus className="w-5 h-5" />
                  </div>
                  <div className="text-left min-w-0">
                    <div className="text-sm sm:text-base font-bold text-white flex items-center gap-1.5 truncate">
                      <span>Driver Portal</span>
                      <ShieldCheck className="w-4 h-4 text-blue-200 shrink-0" />
                    </div>
                    <div className="text-[13px] text-blue-100/90 font-normal truncate">
                      Mobile Number & 4-Digit Security PIN
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-white/90 group-hover:translate-x-1 transition-transform shrink-0" />
              </Link>

              {/* Subtle Student Link */}
              <div className="pt-1 text-center">
                <Link
                  id="student-login-btn"
                  href="/student/dashboard"
                  className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-slate-400 hover:text-blue-400 transition-colors py-1 group font-medium"
                >
                  <span>I&apos;m a student</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </div>
          )}

          {/* CASE 3: No role cookie exists -> Render both buttons */}
          {!lastRole && (
            <div className="space-y-3">
              {/* Primary CTA: Student Login (KLU Email) */}
              <button
                id="student-login-btn"
                onClick={handleStudentSignIn}
                className="w-full relative group overflow-hidden p-4 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-bold text-sm shadow-xl shadow-violet-950/60 transition-all duration-200 active:scale-[0.98] flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white backdrop-blur-sm group-hover:scale-105 transition-transform shrink-0">
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                      <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.761H12.545z" />
                    </svg>
                  </div>
                  <div className="text-left min-w-0">
                    <div className="text-sm sm:text-base font-bold text-white flex items-center gap-1.5 truncate">
                      <span>Student Login (KLU Email)</span>
                      <ShieldCheck className="w-4 h-4 text-blue-200 shrink-0" />
                    </div>
                    <div className="text-[13px] text-blue-100/90 font-normal truncate">
                      Restricted to @klu.ac.in Google Accounts
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-white/90 group-hover:translate-x-1 transition-transform shrink-0" />
              </button>

              {/* Secondary CTA: Driver Portal */}
              <Link
                id="driver-portal-btn"
                href="/driver/login"
                className="w-full relative group p-3.5 sm:p-4 rounded-2xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-violet-500/40 text-slate-100 font-bold text-sm shadow-lg transition-all duration-200 active:scale-[0.98] flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/30 flex items-center justify-center text-violet-400 group-hover:scale-105 transition-transform shrink-0">
                    <Bus className="w-5 h-5" />
                  </div>
                  <div className="text-left min-w-0">
                    <div className="text-sm sm:text-base font-bold text-slate-100 truncate">
                      Driver Portal
                    </div>
                    <div className="text-[13px] text-slate-300 font-normal truncate">
                      Mobile Number & 4-Digit Security PIN
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-400 group-hover:translate-x-1 transition-transform shrink-0" />
              </Link>
            </div>
          )}
        </div>

        {/* How It Works - 3-Step Row */}
        <div className="w-full max-w-3xl pt-6 space-y-4">
          <div className="text-center space-y-1">
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">How It Works</h2>
            <p className="text-[13px] sm:text-sm text-slate-300">Fast, convenient campus shuttle rides in three steps</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-left">
            {/* Step 1 */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/80 border border-slate-800/80 space-y-2 hover:border-blue-500/40 transition-colors shadow-sm">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Step 1
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-bold text-white">Login with KLU email</h3>
              <p className="text-[13px] text-slate-300 leading-relaxed">
                Sign in with your official university Google account for instant access.
              </p>
            </div>

            {/* Step 2 */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/80 border border-slate-800/80 space-y-2 hover:border-indigo-500/40 transition-colors shadow-sm">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <MapPin className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  Step 2
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-bold text-white">Pick your stop</h3>
              <p className="text-[13px] text-slate-300 leading-relaxed">
                Choose your pickup point and check live approaching shuttle locations.
              </p>
            </div>

            {/* Step 3 */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/80 border border-slate-800/80 space-y-2 hover:border-violet-500/40 transition-colors shadow-sm">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
                  <QrCode className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-400 border border-violet-500/20">
                  Step 3
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-bold text-white">Show your QR to board</h3>
              <p className="text-[13px] text-slate-300 leading-relaxed">
                Display your digital ticket QR to the driver for quick verification.
              </p>
            </div>
          </div>
        </div>

        {/* Retain 3 Feature Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 w-full max-w-3xl text-left">
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/50 border border-slate-800/80 space-y-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
              <Zap className="w-4 h-4" />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-slate-100">Zero Wait Time</h3>
            <p className="text-[13px] text-slate-300 leading-relaxed">
              Track shuttle position in real-time as it moves between Main Gate and Hostels.
            </p>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/50 border border-slate-800/80 space-y-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-slate-100">Verified Campus Riders</h3>
            <p className="text-[13px] text-slate-300 leading-relaxed">
              Safe, trusted campus transit authenticated via institutional university accounts.
            </p>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/50 border border-slate-800/80 space-y-2">
            <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-400">
              <QrCode className="w-4 h-4" />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-slate-100">Fast Boarding</h3>
            <p className="text-[13px] text-slate-300 leading-relaxed">
              Scan your digital QR pass upon entering for immediate seat confirmation.
            </p>
          </div>
        </div>

        {/* Campus Stops Chips */}
        <div className="w-full max-w-2xl pt-2 space-y-2.5">
          <div className="flex items-center justify-center gap-2 text-xs sm:text-sm font-semibold text-slate-300">
            <MapPin className="w-3.5 h-3.5 text-blue-400" />
            <span>Key Campus Shuttle Stops</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {CAMPUS_STOPS.map((stop) => (
              <span
                key={stop}
                className="px-3.5 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-300 text-[13px] sm:text-sm font-medium shadow-sm"
              >
                {stop}
              </span>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/80 bg-slate-950 py-8 px-4 text-center space-y-3.5">
        {/* Support Contact Line */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[13px] sm:text-sm text-slate-300">
          <span className="text-slate-400 font-medium">Support:</span>
          <a
            href="mailto:support@campusdrive.go"
            className="text-slate-300 hover:text-blue-400 transition-colors underline-offset-4 hover:underline"
          >
            support@campusdrive.go
          </a>
          <span className="text-slate-500 hidden sm:inline">•</span>
          <a
            href="https://wa.me/919876543210"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-300 hover:text-emerald-400 transition-colors underline-offset-4 hover:underline"
          >
            WhatsApp: +91 98765 43210
          </a>
        </div>

        {/* Switch Role Action */}
        <div className="flex items-center justify-center gap-3">
          <button
            id="switch-role-btn"
            onClick={handleClearRole}
            disabled={clearingRole}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-400 transition-colors underline-offset-4 hover:underline cursor-pointer disabled:opacity-50"
            title="Switch your default role"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${clearingRole ? 'animate-spin text-blue-400' : ''}`} />
            <span>
              {lastRole
                ? `Switch role (active: ${lastRole === 'student' ? 'Student' : 'Driver'})`
                : 'Switch role'}
            </span>
          </button>
        </div>

        {/* Admin Operations Console */}
        <div>
          <Link
            href="/admin/dashboard"
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors underline-offset-4 hover:underline"
          >
            Admin Operations Console ➔
          </Link>
        </div>

        {/* Copyright */}
        <p className="text-[13px] text-slate-400">
          © 2026 CampusDrive Go. All rights reserved.
        </p>
      </footer>
    </div>
  )
}
