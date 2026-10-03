'use client'

import { useState, useEffect } from 'react'
import { signIn, useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
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
} from 'lucide-react'

export default function LandingPage() {
  const { data: session, status } = useSession()
  const [activeCount, setActiveCount] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/shuttles/active')
      .then((res) => res.json())
      .then((data) => {
        if (data && typeof data.count === 'number') {
          setActiveCount(data.count)
        }
      })
      .catch(() => setActiveCount(0))
  }, [])

  const handleStudentSignIn = () => {
    signIn('google', { callbackUrl: '/student/dashboard', prompt: 'select_account' })
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-blue-500 selection:text-white">
      {/* Background aesthetic lighting */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-gradient-to-b from-blue-600/15 via-indigo-600/5 to-transparent blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Navigation Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/80 border-b border-slate-800/80 px-3 sm:px-8 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-900/30 shrink-0">
              <Bus className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-extrabold text-xs sm:text-base tracking-tight text-white truncate">
                  KARE Shuttle
                </span>
                <span className="px-1.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-[9px] sm:text-[10px] font-bold text-blue-400 uppercase tracking-wider shrink-0">
                  KLU Pool
                </span>
              </div>
              <p className="text-[10px] text-slate-400 hidden sm:block truncate">
                Kalasalingam Academy of Research and Education
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {status === 'authenticated' && session?.user ? (
              <div className="flex items-center gap-2">
                <Link
                  href="/student/dashboard"
                  className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
                >
                  Dashboard
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>

                <button
                  onClick={() => signOut()}
                  className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-red-500/40 text-slate-300 hover:text-red-400 transition-all"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : activeCount !== null && activeCount > 0 ? (
              <div className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[11px] sm:text-xs font-medium text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                <span className="hidden xs:inline">{activeCount} Shuttle{activeCount > 1 ? 's' : ''} Active</span>
                <span className="xs:hidden">{activeCount} Active</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-[11px] sm:text-xs font-medium text-slate-400">
                <span className="w-2 h-2 rounded-full bg-slate-500"></span>
                <span className="hidden xs:inline">0 Shuttles Online</span>
                <span className="xs:hidden">0 Online</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Hero Content */}
      <main className="relative z-10 max-w-4xl mx-auto px-4 py-6 sm:py-16 flex-1 flex flex-col justify-center items-center text-center space-y-6 sm:space-y-8 w-full">
        
        {/* KARE University Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-[11px] sm:text-xs text-slate-300 shadow-xl backdrop-blur-md max-w-full">
          <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="truncate">Official KARE Intra-Campus Shuttle Service</span>
        </div>

        {/* Hero Title */}
        <div className="space-y-3 sm:space-y-4 max-w-2xl px-2">
          <h1 className="text-2xl sm:text-5xl font-black tracking-tight text-white leading-tight">
            Fast, Smart & Seamless <br className="hidden sm:block" />
            <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-amber-400 bg-clip-text text-transparent">
              Campus Shuttle Pooling
            </span>
          </h1>
          <p className="text-xs sm:text-base text-slate-400 max-w-xl mx-auto leading-relaxed">
            Reserve shuttle seats, track real-time GPS locations across KARE hostels & departments, and board instantly with QR verification.
          </p>
        </div>

        {/* Primary Action Buttons (Mobile First) */}
        <div className="w-full max-w-md space-y-3 pt-2">
          
          {/* Action 1: Student Login (Google OAuth @klu.ac.in) */}
          <button
            id="student-login-btn"
            onClick={handleStudentSignIn}
            className="w-full relative group overflow-hidden p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs sm:text-sm shadow-xl shadow-indigo-950/60 hover:shadow-indigo-900/80 transition-all duration-200 active:scale-[0.98] flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-white/10 flex items-center justify-center text-white backdrop-blur-sm group-hover:scale-105 transition-transform shrink-0">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 fill-current" viewBox="0 0 24 24">
                  <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.761H12.545z" />
                </svg>
              </div>
              <div className="text-left min-w-0">
                <div className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5 truncate">
                  <span>Student Login (KLU Email)</span>
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-300 shrink-0" />
                </div>
                <div className="text-[9px] sm:text-[10px] text-blue-200/80 font-normal truncate">
                  Restricted to @klu.ac.in Google Accounts
                </div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-white/80 group-hover:translate-x-1 transition-transform shrink-0" />
          </button>

          {/* Action 2: Driver Portal */}
          <Link
            id="driver-portal-btn"
            href="/driver/login"
            className="w-full relative group p-3.5 sm:p-4 rounded-2xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-amber-500/40 text-slate-100 font-bold text-xs sm:text-sm shadow-lg transition-all duration-200 active:scale-[0.98] flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform shrink-0">
                <Bus className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="text-left min-w-0">
                <div className="text-xs sm:text-sm font-bold text-slate-100 truncate">
                  Driver Portal
                </div>
                <div className="text-[9px] sm:text-[10px] text-slate-400 font-normal truncate">
                  Mobile Number & 4-Digit Security PIN
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400 group-hover:translate-x-1 transition-transform shrink-0" />
          </Link>

          {/* Action 3: Admin Operations Portal */}
          <button
            onClick={() => {
              const isAdmin = session?.user?.email?.toLowerCase() === 'yaswanthputluru@gmail.com' || session?.user?.role === 'ADMIN'
              if (isAdmin) {
                window.location.href = '/admin/dashboard'
              } else {
                signIn('google', { callbackUrl: '/admin/dashboard', prompt: 'select_account' })
              }
            }}
            className="w-full p-2 text-center text-xs text-slate-400 hover:text-slate-200 transition-colors block"
          >
            Admin Operations Console ➔
          </button>
        </div>

        {/* KARE Campus Locations Carousel/Pills */}
        <div className="w-full max-w-2xl pt-4 space-y-2">
          <div className="flex items-center justify-center gap-2 text-xs font-semibold text-slate-400">
            <MapPin className="w-3.5 h-3.5 text-blue-400" />
            Key Campus Shuttle Stops
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
            {[
              'Main Gate',
              'Girls Hostel',
              'Admin Block',
              'Library',
              'MH 9th Block',
              'MH 11th Block',
            ].map((stop) => (
              <span
                key={stop}
                className="px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 text-xs font-medium hover:border-blue-500/40 transition-colors"
              >
                {stop}
              </span>
            ))}
          </div>
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-3xl pt-6 text-left">
          
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
              <MapPin className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-slate-200">Live GPS Tracking</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Track shuttle position in real-time as it moves between Main Gate and Hostels.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <QrCode className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-slate-200">Quick QR Boarding</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Scan ticket QR code upon entering the shuttle for instant seat validation.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <CreditCard className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-slate-200">Cash / Driver UPI</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Pay fare conveniently via Cash or Driver UPI code upon boarding.
            </p>
          </div>

        </div>

      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/80 bg-slate-950 py-6 px-4 text-center text-xs text-slate-400 space-y-2">
        <div className="flex flex-wrap items-center justify-center gap-4 text-slate-400">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            Shuttle Hours: 7:00 AM - 9:30 PM
          </span>
          <span>•</span>
          <span>Max Capacity: 9 Seats per Shuttle</span>
        </div>
        <p className="text-slate-400 text-[11px]">
          © {new Date().getFullYear()} Kalasalingam Academy of Research and Education. All Rights Reserved.
        </p>
      </footer>
    </div>
  )
}
