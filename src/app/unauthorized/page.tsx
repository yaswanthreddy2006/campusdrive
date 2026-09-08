'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { ShieldAlert, ArrowLeft, Building2, AlertTriangle, RefreshCw } from 'lucide-react'

function UnauthorizedContent() {
  const searchParams = useSearchParams()
  const reason = searchParams.get('reason')
  const error = searchParams.get('error')
  const attemptedEmail = searchParams.get('email')

  const isInvalidDomain = reason === 'invalid_domain'

  return (
    <div className="relative w-full max-w-md bg-slate-900/80 backdrop-blur-xl border border-red-500/30 rounded-3xl p-8 shadow-2xl shadow-red-950/50 text-center space-y-6">
      <div className="mx-auto w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 shadow-inner">
        <ShieldAlert className="w-8 h-8 animate-pulse" />
      </div>

      <div className="space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-950/60 border border-red-500/30 text-xs font-semibold text-red-300">
          <Building2 className="w-3.5 h-3.5" />
          {isInvalidDomain ? 'Domain Restricted' : 'Authentication Error'}
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">
          {isInvalidDomain ? 'Access Restricted' : 'Login Unsuccessful'}
        </h1>
        <p className="text-sm text-slate-300 leading-relaxed">
          {isInvalidDomain
            ? 'Only official Kalasalingam Academy student Google accounts (@klu.ac.in) are allowed to access the shuttle booking portal.'
            : 'An issue occurred during Google authentication. Please try signing in again with your @klu.ac.in account.'}
        </p>
      </div>

      {attemptedEmail && (
        <div className="p-3 rounded-2xl bg-red-950/40 border border-red-500/30 text-xs text-red-200 text-left space-y-1">
          <span className="font-semibold text-slate-300">Attempted Email:</span>
          <p className="font-mono text-red-300 font-bold truncate">{attemptedEmail}</p>
        </div>
      )}

      {error && !isInvalidDomain && (
        <div className="p-3 rounded-2xl bg-amber-950/40 border border-amber-500/30 text-xs text-amber-200 text-left space-y-1">
          <div className="font-semibold text-amber-300 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            NextAuth Error Code:
          </div>
          <p className="font-mono text-amber-200 font-bold">{error}</p>
        </div>
      )}

      <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 text-left text-xs space-y-2 text-slate-400">
        <div className="font-semibold text-slate-200 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          Required Login Account:
        </div>
        <p>
          Make sure to pick your student email ending in <code className="text-amber-400 font-mono px-1.5 py-0.5 bg-amber-950/40 rounded border border-amber-500/30">@klu.ac.in</code> when Google asks you to select an account.
        </p>
      </div>

      <div className="pt-2 space-y-2">
        <button
          onClick={() => signIn('google', { callbackUrl: '/student/dashboard', prompt: 'select_account' })}
          className="w-full inline-flex items-center justify-center gap-2 py-3 px-6 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-sm transition-all duration-200 shadow-lg shadow-indigo-900/30 hover:shadow-indigo-800/50 active:scale-[0.98]"
        >
          <RefreshCw className="w-4 h-4" />
          Try Login with @klu.ac.in Account
        </button>

        <Link
          href="/"
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-6 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-medium text-xs transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home Page
        </Link>
      </div>
    </div>
  )
}

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-red-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      <Suspense fallback={<div className="text-sm text-slate-400">Loading...</div>}>
        <UnauthorizedContent />
      </Suspense>
    </div>
  )
}
