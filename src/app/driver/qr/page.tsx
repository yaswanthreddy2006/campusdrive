'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Bus, QrCode, ArrowLeft, Printer, Copy, CheckCircle2 } from 'lucide-react'

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
  const [copied, setCopied] = useState(false)
  const [driverStatus, setDriverStatus] = useState<'APPROVED' | 'PENDING' | 'REJECTED'>('APPROVED')

  useEffect(() => {
    async function loadDriverVehicle() {
      try {
        const res = await fetch('/api/driver/bookings')
        const data = await res.json()
        if (res.status === 403 && data.driverStatus) {
          setDriverStatus(data.driverStatus)
          return
        }
        if (data.vehicle) {
          setVehicle(data.vehicle)
        }
      } catch (err) {
        console.error('Error loading driver vehicle:', err)
      }
    }
    loadDriverVehicle()
  }, [])

  const vehicleId = vehicle?.id || 'demo-vehicle-id-12345'
  const vehicleNo = vehicle?.vehicleNumber || 'TN-58-KARE-01'
  const driverName = vehicle?.driver?.name || 'Selvam (Driver)'

  const qrPayload = `KARE-VEHICLE:${vehicleId}`

  const copyPayload = () => {
    navigator.clipboard.writeText(qrPayload)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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
        {driverStatus !== 'APPROVED' ? (
          <div className="p-6 sm:p-8 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 mx-auto flex items-center justify-center text-amber-400">
              <Bus className="w-6 h-6" />
            </div>
            <h1 className="text-lg font-bold text-white">QR Pass Access Restricted</h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              Shuttle boarding QR verification pass is locked because your driver account status is <strong className="text-amber-400">{driverStatus}</strong>.
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
                  Mount this QR code near the entrance door of Shuttle <strong className="text-amber-400 print:text-black">{vehicleNo}</strong>
                </p>
              </div>

              {/* QR Box Visual */}
              <div className="p-3 sm:p-6 bg-white rounded-3xl border-4 border-amber-500 shadow-xl inline-block mx-auto max-w-full">
                <div className="w-40 h-40 xs:w-48 xs:h-48 sm:w-56 sm:h-56 bg-slate-950 rounded-2xl p-3 sm:p-4 flex flex-col justify-between items-center text-center text-white font-mono space-y-1 sm:space-y-2">
                  <div className="w-full flex justify-between items-center text-[9px] sm:text-[10px] text-amber-400 font-bold border-b border-slate-800 pb-1">
                    <span>KARE SHUTTLE</span>
                    <span>{vehicleNo}</span>
                  </div>

                  <QrCode className="w-20 h-20 xs:w-24 xs:h-24 sm:w-28 sm:h-28 text-amber-400 animate-pulse my-auto" />

                  <div className="w-full text-[8px] sm:text-[9px] text-slate-400 font-mono tracking-tighter truncate border-t border-slate-800 pt-1">
                    PAYLOAD: {qrPayload}
                  </div>
                </div>
              </div>

              <div className="space-y-1 text-xs text-slate-300 print:text-black">
                <p className="font-bold text-sm text-white print:text-black">{vehicleNo}</p>
                <p className="text-slate-400 print:text-gray-600">Driver: {driverName}</p>
                <span className="inline-block mt-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-semibold text-[11px]">
                  Static Boarding Code
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <button
                onClick={copyPayload}
                className="w-full py-3 px-4 rounded-2xl bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-200 font-semibold text-xs transition-all flex items-center justify-center gap-2"
              >
                {copied ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    QR Payload Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-amber-400" />
                    Copy QR Payload ({vehicleId})
                  </>
                )}
              </button>

              <button
                onClick={handlePrint}
                className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold text-xs shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" />
                Print Vehicle QR Badge
              </button>
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
