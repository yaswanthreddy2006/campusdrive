'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Bus,
  Phone,
  KeyRound,
  ArrowLeft,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  RefreshCw,
  User,
  Clock,
  Car,
  ChevronRight,
  Sparkles,
} from 'lucide-react'
import { ConfirmationResult, RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth'
import { auth } from '@/lib/firebase'

export default function DriverAuthPage() {
  const router = useRouter()
  // view: 'login' | 'register'
  const [view, setView] = useState<'login' | 'register'>('login')

  // Register steps: 1: 'phone' -> 2: 'otp' -> 3: 'vehicle_pin' -> 4: 'pending_screen'
  const [registerStep, setRegisterStep] = useState<'phone' | 'otp' | 'vehicle_pin' | 'pending_screen'>('phone')

  // Form states
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [mpin, setMpin] = useState('')
  const [confirmMpin, setConfirmMpin] = useState('')
  const [vehicleName, setVehicleName] = useState('')
  const [vehicleNumber, setVehicleNumber] = useState('')

  // Login form state
  const [loginPhone, setLoginPhone] = useState('')
  const [loginMpin, setLoginMpin] = useState('')

  // UI state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [resendTimer, setResendTimer] = useState(0)

  // Pending approval info
  const [pendingInfo, setPendingInfo] = useState<{
    name?: string
    phone?: string
    vehicleNumber?: string
  } | null>(null)

  // Firebase state
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null)
  const [firebaseIdToken, setFirebaseIdToken] = useState<string | null>(null)
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null)

  // Countdown timer for resend OTP
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1)
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [resendTimer])

  // Cleanup recaptcha on unmount
  useEffect(() => {
    return () => {
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear()
        } catch {
          // Ignore
        }
        recaptchaVerifierRef.current = null
      }
    }
  }, [])

  const initRecaptcha = () => {
    if (!recaptchaVerifierRef.current) {
      recaptchaVerifierRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
        callback: () => {
          // reCAPTCHA solved
        },
        'expired-callback': () => {
          setError('reCAPTCHA expired. Please try sending OTP again.')
        },
      })
    }
    return recaptchaVerifierRef.current
  }

  // ==========================================
  // 1. LOGIN WITH M-PIN
  // ==========================================
  const handleMpinLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    const cleanDigits = loginPhone.replace(/\D/g, '')
    if (cleanDigits.length < 10) {
      setError('Please enter your registered 10-digit mobile number.')
      return
    }

    if (!loginMpin || loginMpin.length !== 4) {
      setError('Please enter your 4-digit M-PIN.')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/driver/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: cleanDigits.slice(-10),
          mpin: loginMpin,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.driverStatus === 'PENDING') {
          setPendingInfo({
            name: data.driver?.name || 'Driver',
            phone: cleanDigits.slice(-10),
            vehicleNumber: data.driver?.vehicleNumber || 'Assigned Shuttle',
          })
        }
        throw new Error(data.error || 'Authentication failed.')
      }

      if (data.driver?.vehicleId && typeof window !== 'undefined') {
        sessionStorage.setItem('driver_tab_vehicle_id', data.driver.vehicleId)
      }

      setSuccess('M-PIN verified! Accessing Driver Console...')
      setTimeout(() => {
        router.push('/driver/dashboard')
      }, 1000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed. Please check credentials.')
    } finally {
      setLoading(false)
    }
  }

  // ==========================================
  // 2. REGISTRATION STEP 1: SEND OTP
  // ==========================================
  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!name.trim()) {
      setError('Please enter driver full name.')
      return
    }

    const cleanDigits = phone.replace(/\D/g, '')
    if (cleanDigits.length < 10) {
      setError('Please enter a valid 10-digit mobile number.')
      return
    }

    setLoading(true)

    try {
      const appVerifier = initRecaptcha()
      const formattedPhone = cleanDigits.startsWith('91') && cleanDigits.length === 12
        ? `+${cleanDigits}`
        : `+91${cleanDigits.slice(-10)}`

      const confirmation = await signInWithPhoneNumber(auth, formattedPhone, appVerifier)
      setConfirmationResult(confirmation)
      setRegisterStep('otp')
      setResendTimer(60)
      setSuccess(`Verification OTP sent to ${formattedPhone}!`)
    } catch (err: unknown) {
      console.error('Firebase SMS error:', err)
      const msg = err instanceof Error ? err.message : 'Failed to send OTP.'
      if (msg.includes('auth/operation-not-allowed')) {
        setError('Phone auth region not allowed or disabled. Please enable India (+91) in Firebase Console.')
      } else if (msg.includes('auth/invalid-phone-number')) {
        setError('Invalid mobile number format.')
      } else {
        setError(msg)
      }

      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear()
        } catch {
          // Ignore
        }
        recaptchaVerifierRef.current = null
      }
    } finally {
      setLoading(false)
    }
  }

  // ==========================================
  // 3. REGISTRATION STEP 2: VERIFY OTP
  // ==========================================
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!otp || otp.length !== 6) {
      setError('Please enter the 6-digit OTP code.')
      return
    }

    if (!confirmationResult) {
      setError('OTP session expired. Please request a new code.')
      setRegisterStep('phone')
      return
    }

    setLoading(true)

    try {
      const userCredential = await confirmationResult.confirm(otp)
      const token = await userCredential.user.getIdToken()
      setFirebaseIdToken(token)

      setSuccess('Phone number verified! Now configure your Vehicle and M-PIN.')
      setRegisterStep('vehicle_pin')
    } catch (err: unknown) {
      console.error('OTP error:', err)
      setError('Incorrect OTP code. Please enter the valid code received on your phone.')
    } finally {
      setLoading(false)
    }
  }

  // ==========================================
  // 4. REGISTRATION STEP 3: VEHICLE & M-PIN
  // ==========================================
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!vehicleNumber.trim()) {
      setError('Please enter vehicle number (e.g. TN-58-KARE-01).')
      return
    }

    if (!mpin || mpin.length !== 4) {
      setError('Please set a 4-digit M-PIN.')
      return
    }

    if (mpin !== confirmMpin) {
      setError('M-PIN and Confirm M-PIN do not match.')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/driver/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.replace(/\D/g, '').slice(-10),
          idToken: firebaseIdToken,
          vehicleName: vehicleName.trim() || 'KARE Campus Shuttle',
          vehicleNumber: vehicleNumber.trim().toUpperCase(),
          mpin,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit registration.')
      }

      setPendingInfo({
        name: name.trim(),
        phone: phone.replace(/\D/g, '').slice(-10),
        vehicleNumber: data.driver?.vehicleNumber || vehicleNumber.trim().toUpperCase(),
      })

      setSuccess('Registration submitted! Awaiting KARE Admin approval.')
      setRegisterStep('pending_screen')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Check Approval Status
  const checkApprovalStatus = async (checkPhone: string) => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`/api/driver/status?phone=${encodeURIComponent(checkPhone)}`)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Could not fetch status.')
      }

      if (data.driverStatus === 'APPROVED') {
        setSuccess('🎉 Congratulations! Your driver account has been APPROVED by Admin! You can now log in.')
        setLoginPhone(checkPhone)
        setView('login')
        setPendingInfo(null)
      } else if (data.driverStatus === 'PENDING') {
        setError('Status: Still PENDING Admin Approval. Please check again later or contact Campus Ops.')
      } else if (data.driverStatus === 'REJECTED') {
        setError('Status: REJECTED by Administration. Please contact Operations Control.')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not check status.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-3 sm:p-4 overflow-x-hidden relative">
      {/* Background glow effects */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Invisible Firebase Recaptcha Container */}
      <div id="recaptcha-container" />

      <div className="relative w-full max-w-md bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-5 sm:p-8 shadow-2xl space-y-5 sm:space-y-6">
        
        {/* Header with Back button */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Home
          </Link>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-xs font-semibold text-amber-400">
            <Bus className="w-3.5 h-3.5" />
            KARE Driver Portal
          </div>
        </div>

        {/* Title */}
        <div className="text-center space-y-1.5">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
            <Bus className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {view === 'login' ? 'Driver Login' : 'Driver Registration'}
          </h1>
          <p className="text-xs text-slate-400">
            {view === 'login'
              ? 'Enter your mobile number & 4-digit M-PIN to begin duty.'
              : 'Register your vehicle & mobile number to join campus fleet.'}
          </p>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="grid grid-cols-2 p-1 bg-slate-950/80 border border-slate-800 rounded-2xl text-xs font-medium">
          <button
            type="button"
            onClick={() => {
              setView('login')
              setError(null)
              setSuccess(null)
            }}
            className={`py-2 rounded-xl transition-all flex items-center justify-center gap-2 ${
              view === 'login'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            M-PIN Login
          </button>
          <button
            type="button"
            onClick={() => {
              setView('register')
              setRegisterStep('phone')
              setError(null)
              setSuccess(null)
            }}
            className={`py-2 rounded-xl transition-all flex items-center justify-center gap-2 ${
              view === 'register'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            New Driver Register
          </button>
        </div>

        {/* Error and Success Alerts */}
        {error && (
          <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-red-950/60 border border-red-500/40 text-red-300 text-xs">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        {/* ========================================================= */}
        {/* VIEW 1: M-PIN LOGIN                                      */}
        {/* ========================================================= */}
        {view === 'login' && (
          <div className="space-y-4">
            {/* If Account Pending Approval Banner */}
            {pendingInfo && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-400">
                  <Clock className="w-4 h-4" />
                  <span>Awaiting Admin Approval</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Driver: <strong>{pendingInfo.name}</strong> ({pendingInfo.phone})
                  <br />
                  Vehicle: <strong>{pendingInfo.vehicleNumber}</strong>
                </p>
                <div className="pt-1 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => checkApprovalStatus(pendingInfo.phone || loginPhone)}
                    disabled={loading}
                    className="px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-[11px] flex items-center gap-1.5 hover:bg-amber-400 transition-colors"
                  >
                    <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                    Check Approval Status
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleMpinLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Registered Mobile Number
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-3.5 flex items-center gap-1.5 pointer-events-none text-slate-400 text-xs font-semibold">
                    <Phone className="w-3.5 h-3.5 text-amber-500" />
                    <span>+91</span>
                    <span className="text-slate-700">|</span>
                  </div>
                  <input
                    id="driver-login-phone"
                    type="tel"
                    maxLength={10}
                    placeholder="98765 43210"
                    value={loginPhone}
                    onChange={(e) => setLoginPhone(e.target.value.replace(/\D/g, ''))}
                    className="w-full pl-20 pr-4 py-3 rounded-2xl bg-slate-950 border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-sm text-slate-100 placeholder-slate-600 outline-none transition-all font-mono tracking-wider"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  4-Digit M-PIN
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    id="driver-login-mpin"
                    type="password"
                    maxLength={4}
                    placeholder="••••"
                    value={loginMpin}
                    onChange={(e) => setLoginMpin(e.target.value.replace(/\D/g, ''))}
                    className="w-full pl-10 pr-4 py-3 rounded-2xl bg-slate-950 border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-sm text-slate-100 placeholder-slate-600 outline-none font-mono tracking-widest transition-all text-center text-lg"
                    required
                  />
                </div>
              </div>

              <button
                id="driver-mpin-submit-btn"
                type="submit"
                disabled={loading || loginPhone.length < 10 || loginMpin.length !== 4}
                className="w-full mt-2 py-3 px-6 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold text-sm transition-all duration-200 shadow-lg shadow-amber-950/50 hover:shadow-amber-900/60 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Authenticating M-PIN...
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    Log In with M-PIN
                  </>
                )}
              </button>
            </form>

            {/* Quick link to Register */}
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setView('register')
                  setRegisterStep('phone')
                  setError(null)
                  setSuccess(null)
                }}
                className="text-xs text-amber-400 hover:text-amber-300 hover:underline font-semibold"
              >
                New Driver? Register & Verify Phone ➔
              </button>
            </div>

            {/* Demo Credentials Box */}
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 text-slate-400 text-xs space-y-1.5">
              <div className="font-semibold text-amber-400 flex items-center justify-between">
                <span>Approved Demo Driver Account:</span>
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded">
                  APPROVED
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span>
                  Mobile: <code className="text-slate-200 font-mono">9876543210</code>
                </span>
                <span>
                  M-PIN: <code className="text-slate-200 font-mono">1234</code>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* VIEW 2: NEW DRIVER REGISTRATION FLOW                     */}
        {/* ========================================================= */}
        {view === 'register' && (
          <div className="space-y-4">
            
            {/* Step Progress indicator */}
            <div className="flex items-center justify-between px-2 text-[10px] text-slate-400">
              <span className={registerStep === 'phone' ? 'text-amber-400 font-bold' : ''}>
                1. Name & Phone
              </span>
              <ChevronRight className="w-3 h-3 text-slate-600" />
              <span className={registerStep === 'otp' ? 'text-amber-400 font-bold' : ''}>
                2. OTP Verify
              </span>
              <ChevronRight className="w-3 h-3 text-slate-600" />
              <span className={registerStep === 'vehicle_pin' ? 'text-amber-400 font-bold' : ''}>
                3. Vehicle & M-PIN
              </span>
            </div>

            {/* ---------------------------------------------------- */}
            {/* STEP 1: Full Name & Mobile Number                    */}
            {/* ---------------------------------------------------- */}
            {registerStep === 'phone' && (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-300">
                    Driver Full Name
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <User className="w-4 h-4" />
                    </div>
                    <input
                      id="driver-register-name"
                      type="text"
                      placeholder="e.g. K. Ramanathan"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-2xl bg-slate-950 border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-sm text-slate-100 placeholder-slate-600 outline-none transition-all"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-300">
                    Mobile Number
                  </label>
                  <div className="relative flex items-center">
                    <div className="absolute left-3.5 flex items-center gap-1.5 pointer-events-none text-slate-400 text-xs font-semibold">
                      <Phone className="w-3.5 h-3.5 text-amber-500" />
                      <span>+91</span>
                      <span className="text-slate-700">|</span>
                    </div>
                    <input
                      id="driver-register-phone"
                      type="tel"
                      maxLength={10}
                      placeholder="98765 43210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                      className="w-full pl-20 pr-4 py-3 rounded-2xl bg-slate-950 border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-sm text-slate-100 placeholder-slate-600 outline-none transition-all font-mono tracking-wider"
                      required
                    />
                  </div>
                  <p className="text-[11px] text-slate-500">
                    We will send a 6-digit OTP code to verify this phone number.
                  </p>
                </div>

                <button
                  id="driver-send-otp-btn"
                  type="submit"
                  disabled={loading || !name.trim() || phone.length < 10}
                  className="w-full mt-2 py-3 px-6 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold text-sm transition-all duration-200 shadow-lg shadow-amber-950/50 hover:shadow-amber-900/60 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending OTP SMS...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      Next: Send OTP (SMS)
                    </>
                  )}
                </button>
              </form>
            )}

            {/* ---------------------------------------------------- */}
            {/* STEP 2: OTP Verification                             */}
            {/* ---------------------------------------------------- */}
            {registerStep === 'otp' && (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-medium text-slate-300">
                      Enter 6-Digit OTP Code
                    </label>
                    <button
                      type="button"
                      onClick={() => setRegisterStep('phone')}
                      className="text-[11px] text-amber-400 hover:underline"
                    >
                      Change (+91 {phone})
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="driver-otp-input"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="••••••"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      className="w-full py-3.5 rounded-2xl bg-slate-950 border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-slate-100 placeholder-slate-600 outline-none font-mono tracking-[0.5em] transition-all text-center text-xl font-bold"
                      autoFocus
                      required
                    />
                  </div>
                </div>

                <button
                  id="driver-verify-otp-btn"
                  type="submit"
                  disabled={loading || otp.length !== 6}
                  className="w-full py-3 px-6 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold text-sm transition-all duration-200 shadow-lg shadow-amber-950/50 hover:shadow-amber-900/60 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Verifying OTP...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      Verify OTP & Continue
                    </>
                  )}
                </button>

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => handleSendOtp()}
                    disabled={loading || resendTimer > 0}
                    className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-amber-400 disabled:opacity-50 disabled:hover:text-slate-400 transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    {resendTimer > 0 ? `Resend OTP in ${resendTimer}s` : 'Resend OTP'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setRegisterStep('phone')}
                    className="text-xs text-slate-400 hover:text-slate-200"
                  >
                    Back to Mobile
                  </button>
                </div>
              </form>
            )}

            {/* ---------------------------------------------------- */}
            {/* STEP 3: Vehicle Info & Set 4-Digit M-PIN            */}
            {/* ---------------------------------------------------- */}
            {registerStep === 'vehicle_pin' && (
              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                <div className="p-3 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Phone (+91 {phone}) verified! Now save vehicle & M-PIN.</span>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-300">
                    Vehicle Name / Model (Optional)
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <Bus className="w-4 h-4" />
                    </div>
                    <input
                      id="driver-vehicle-name"
                      type="text"
                      placeholder="e.g. KARE Campus Shuttle 02 / Force Traveller"
                      value={vehicleName}
                      onChange={(e) => setVehicleName(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-xs text-slate-100 placeholder-slate-600 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-300">
                    Vehicle Registration Number *
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <Car className="w-4 h-4" />
                    </div>
                    <input
                      id="driver-vehicle-number"
                      type="text"
                      placeholder="e.g. TN-58-KARE-02"
                      value={vehicleNumber}
                      onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                      className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-xs text-slate-100 placeholder-slate-600 outline-none transition-all font-mono uppercase"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-300">
                      Set 4-Digit M-PIN *
                    </label>
                    <input
                      id="driver-set-mpin"
                      type="password"
                      maxLength={4}
                      placeholder="••••"
                      value={mpin}
                      onChange={(e) => setMpin(e.target.value.replace(/\D/g, ''))}
                      className="w-full py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-slate-100 placeholder-slate-600 outline-none font-mono tracking-widest transition-all text-center text-base"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-300">
                      Confirm M-PIN *
                    </label>
                    <input
                      id="driver-confirm-mpin"
                      type="password"
                      maxLength={4}
                      placeholder="••••"
                      value={confirmMpin}
                      onChange={(e) => setConfirmMpin(e.target.value.replace(/\D/g, ''))}
                      className="w-full py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-slate-100 placeholder-slate-600 outline-none font-mono tracking-widest transition-all text-center text-base"
                      required
                    />
                  </div>
                </div>
                <p className="text-[11px] text-slate-400">
                  This 4-digit M-PIN will be used for all future logins.
                </p>

                <button
                  id="driver-submit-register-btn"
                  type="submit"
                  disabled={loading || !vehicleNumber.trim() || mpin.length !== 4 || mpin !== confirmMpin}
                  className="w-full py-3 px-6 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold text-sm transition-all duration-200 shadow-lg shadow-amber-950/50 hover:shadow-amber-900/60 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving Registration...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Submit for Admin Approval
                    </>
                  )}
                </button>
              </form>
            )}

            {/* ---------------------------------------------------- */}
            {/* STEP 4: Awaiting Admin Approval Screen               */}
            {/* ---------------------------------------------------- */}
            {registerStep === 'pending_screen' && (
              <div className="space-y-4 text-center">
                <div className="mx-auto w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
                  <Clock className="w-8 h-8 animate-pulse" />
                </div>

                <div className="space-y-1">
                  <h2 className="text-xl font-bold text-white">Registration Submitted!</h2>
                  <p className="text-xs text-amber-400 font-semibold uppercase tracking-wider">
                    Status: PENDING ADMIN APPROVAL
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 text-left text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Driver Name:</span>
                    <span className="font-semibold text-white">{pendingInfo?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Mobile Number:</span>
                    <span className="font-mono text-white">+91 {pendingInfo?.phone}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Assigned Vehicle:</span>
                    <span className="font-mono text-amber-400 font-bold">{pendingInfo?.vehicleNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Security M-PIN:</span>
                    <span className="font-mono text-emerald-400 font-semibold">Saved (4 Digits)</span>
                  </div>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed">
                  Your profile has been submitted to Kalasalingam Shuttle Operations. Once the administrator approves your account, you can log in immediately using your Phone & M-PIN.
                </p>

                <div className="pt-2 space-y-2">
                  <button
                    type="button"
                    onClick={() => checkApprovalStatus(pendingInfo?.phone || phone)}
                    disabled={loading}
                    className="w-full py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all flex items-center justify-center gap-2"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    Check Approval Status
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setView('login')
                      setLoginPhone(pendingInfo?.phone || phone)
                      setError(null)
                      setSuccess(null)
                    }}
                    className="w-full py-2.5 rounded-2xl bg-slate-950 border border-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition-all"
                  >
                    Go to M-PIN Login
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
