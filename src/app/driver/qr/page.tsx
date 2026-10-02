'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Bus, ArrowLeft, Printer, Copy, CheckCircle2, Link2, Loader2, Sparkles } from 'lucide-react'

interface DriverVehicle {
  id: string
  vehicleNumber: string
  capacity: number
  driver: {
    name: string
    phone: string
  }
}

export default function DriverQRPage() {
  const [vehicle, setVehicle] = useState<DriverVehicle | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [copiedType, setCopiedType] = useState<string | null>(null)
  const [driverStatus, setDriverStatus] = useState<'APPROVED' | 'PENDING' | 'REJECTED'>('APPROVED')

  useEffect(() => {
    async function loadDriverVehicle() {
      try {
        setIsLoading(true)
        // 1. Attempt to load driver's assigned vehicle from driver session
        const res = await fetch('/api/driver/bookings')
        const data = await res.json()
        if (res.status === 403 && data.driverStatus) {
          setDriverStatus(data.driverStatus)
          setIsLoading(false)
          return
        }

        if (data.vehicle) {
          setVehicle(data.vehicle)
          setIsLoading(false)
          return
        }

        // 2. Fallback to active registered campus shuttles if direct session query didn't populate
        const shuttlesRes = await fetch('/api/shuttles/active')
        const shuttlesData = await shuttlesRes.json()
        if (shuttlesData.shuttles && shuttlesData.shuttles.length > 0) {
          const firstShuttle = shuttlesData.shuttles[0]
          setVehicle({
            id: firstShuttle.id,
            vehicleNumber: firstShuttle.vehicleNumber,
            capacity: firstShuttle.capacity || 9,
            driver: {
              name: firstShuttle.driver?.name || 'KARE Shuttle Driver',
              phone: firstShuttle.driver?.phone || 'Campus Shuttle Helpdesk',
            },
          })
        }
      } catch (err) {
        console.error('Error loading driver vehicle:', err)
      } finally {
        setIsLoading(false)
      }
    }
    loadDriverVehicle()
  }, [])

  const vehicleId = vehicle?.id || ''
  const vehicleNo = vehicle?.vehicleNumber || 'TN-58-KARE-90'
  const driverName = vehicle?.driver?.name || 'Selvam (Driver)'

  const qrPayload = vehicleId ? `KARE-VEHICLE:${vehicleId}` : `KARE-VEHICLE:${vehicleNo}`
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&color=0f172a&data=${encodeURIComponent(
    qrPayload
  )}`

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text)
    setCopiedType(type)
    setTimeout(() => setCopiedType(null), 2500)
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-3 sm:p-8 overflow-x-hidden">
      {/* Top Header */}
      <header className="max-w-xl mx-auto w-full flex items-center justify-between pb-4 sm:pb-6">
        <Link
          href="/driver/dashboard"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Driver Console
        </Link>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-xs font-semibold text-amber-400">
          <Bus className="w-3.5 h-3.5" />
          Shuttle QR Boarding Pass
        </div>
      </header>

      {/* Main QR Card */}
      <main className="max-w-md mx-auto w-full space-y-6 text-center">
        {isLoading ? (
          <div className="p-8 sm:p-12 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl space-y-3 flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
            <p className="text-xs text-slate-400 font-medium">Loading Shuttle QR Pass...</p>
          </div>
        ) : driverStatus !== 'APPROVED' ? (
          <div className="p-6 sm:p-8 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 mx-auto flex items-center justify-center text-amber-400">
              <Bus className="w-6 h-6" />
            </div>
            <h1 className="text-lg font-bold text-white">QR Pass Access Restricted</h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              Shuttle boarding QR verification pass is locked because your driver account status is{' '}
              <strong className="text-amber-400">{driverStatus}</strong>.
            </p>
            <Link
              href="/driver/dashboard"
              className="inline-block py-2.5 px-5 rounded-2xl bg-slate-850 border border-slate-800 text-slate-200 font-semibold text-xs transition-colors"
            >
              Return to Driver Portal
            </Link>
          </div>
        ) : (
          <>
            <div className="p-4 sm:p-8 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl space-y-5 sm:space-y-6 print:bg-white print:text-black print:border-black">
              <div className="space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 mx-auto flex items-center justify-center text-amber-400 shadow-inner">
                  <Bus className="w-6 h-6" />
                </div>
                <h1 className="text-lg sm:text-xl font-extrabold text-white print:text-black tracking-tight">
                  Shuttle Boarding Verification QR
                </h1>
                <p className="text-xs text-slate-400 print:text-gray-600">
                  Mount this QR code near the entrance door of Shuttle{' '}
                  <strong className="text-amber-400 print:text-black">{vehicleNo}</strong>
                </p>
              </div>

              {/* QR Box Visual */}
              <div className="p-4 sm:p-6 bg-white rounded-3xl border-4 border-amber-500 shadow-2xl inline-block mx-auto max-w-full">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-full flex justify-between items-center text-[11px] text-slate-900 font-black tracking-wider border-b border-slate-200 pb-1">
                    <span>KARE SHUTTLE</span>
                    <span className="text-amber-600">{vehicleNo}</span>
                  </div>

                  {/* Scannable Real QR Image */}
                  <div className="w-52 h-52 sm:w-60 sm:h-60 rounded-xl overflow-hidden flex items-center justify-center bg-white p-1">
                    <img
                      src={qrImageUrl}
                      alt={`QR Code for ${vehicleNo}`}
                      className="w-full h-full object-contain"
                      loading="eager"
                    />
                  </div>

                  <div className="w-full text-[9px] text-slate-600 font-mono tracking-tighter truncate border-t border-slate-200 pt-1">
                    PAYLOAD: {qrPayload}
                  </div>
                </div>
              </div>

              <div className="space-y-1 text-xs text-slate-300 print:text-black">
                <p className="font-bold text-sm text-white print:text-black">{vehicleNo}</p>
                <p className="text-slate-400 print:text-gray-600">Driver: {driverName}</p>
                <span className="inline-block mt-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-semibold text-[11px]">
                  Verified Shuttle Boarding Pass
                </span>
              </div>
            </div>

            {/* Action Buttons & Fast Copy Suite */}
            <div className="space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleCopy(qrPayload, 'payload')}
                  className="py-3 px-4 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-semibold text-xs transition-all flex items-center justify-center gap-2"
                >
                  {copiedType === 'payload' ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Payload Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-amber-400" />
                      Copy QR Payload
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      `${typeof window !== 'undefined' ? window.location.origin : ''}/driver/qr?vehicleId=${vehicleId}`,
                      'link'
                    )
                  }
                  className="py-3 px-4 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-semibold text-xs transition-all flex items-center justify-center gap-2"
                >
                  {copiedType === 'link' ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Link Copied!
                    </>
                  ) : (
                    <>
                      <Link2 className="w-4 h-4 text-blue-400" />
                      Copy Verification Link
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleCopy(vehicleNo, 'vehicleno')}
                  className="py-3 px-4 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-semibold text-xs transition-all flex items-center justify-center gap-2"
                >
                  {copiedType === 'vehicleno' ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Vehicle No Copied!
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                      Copy Shuttle No: {vehicleNo}
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handlePrint}
                  className="py-3 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold text-xs shadow-lg transition-all flex items-center justify-center gap-2"
                >
                  <Printer className="w-4 h-4" />
                  Print QR Badge
                </button>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-xl mx-auto w-full text-center text-xs text-slate-500 pt-6">
        © {new Date().getFullYear()} Kalasalingam Academy Shuttle Boarding Verification
      </footer>
    </div>
  )
}
