'use client'

import { useEffect, useRef, useState } from 'react'
import { Html5QrcodeScanner } from 'html5-qrcode'
import { Camera, X, Sparkles } from 'lucide-react'

interface QrScannerProps {
  onScanSuccess: (scannedText: string) => void
  onClose: () => void
  expectedVehicleId?: string
}

export default function QrScanner({
  onScanSuccess,
  onClose,
  expectedVehicleId,
}: QrScannerProps) {
  const [manualInput, setManualInput] = useState('')
  const [scannerError, setScannerError] = useState<string | null>(null)
  const scannerRef = useRef<Html5QrcodeScanner | null>(null)

  useEffect(() => {
    const scannerId = 'reader-container'
    
    // Initialize html5-qrcode camera scanner
    try {
      const scanner = new Html5QrcodeScanner(
        scannerId,
        {
          fps: 10,
          qrbox: { width: 220, height: 220 },
          aspectRatio: 1.0,
          showTorchButtonIfSupported: true,
        },
        /* verbose= */ false
      )

      scanner.render(
        (decodedText) => {
          console.log('QR Code scanned successfully:', decodedText)
          scanner.clear()
          onScanSuccess(decodedText)
        },
        () => {
          // Frame scan callback
        }
      )

      scannerRef.current = scanner
    } catch (err) {
      console.warn('Unable to start HTML5 camera scanner:', err)
      setScannerError('Camera access unavailable or blocked. You can use Quick Simulation below.')
    }

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch((e) => console.error('Failed to clear scanner:', e))
      }
    }
  }, [onScanSuccess])

  const handleSimulateScan = () => {
    const payload = manualInput.trim() || `KARE-VEHICLE:${expectedVehicleId || 'demo-vehicle-id'}`
    onScanSuccess(payload)
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto custom-scrollbar">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 sm:space-y-5 animate-fadeIn max-h-[90vh] overflow-y-auto custom-scrollbar my-auto">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="text-center space-y-1">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/30 mx-auto flex items-center justify-center text-blue-400">
            <Camera className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">Scan Vehicle QR Code</h3>
          <p className="text-xs text-slate-400">
            Point your device camera at the Shuttle door QR code to confirm boarding.
          </p>
        </div>

        {/* Camera Container for html5-qrcode */}
        <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 p-2 min-h-[260px] flex items-center justify-center">
          <div id="reader-container" className="w-full text-slate-200 text-xs text-center" />
          {scannerError && (
            <p className="text-xs text-amber-400 px-4 text-center">{scannerError}</p>
          )}
        </div>

        {/* Simulation / Manual Override Box for Dev Testing */}
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-amber-400">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Quick Boarding Simulator:
            </span>
            <span className="text-[10px] text-slate-500 font-mono">Dev Test</span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder={`KARE-VEHICLE:${expectedVehicleId || 'id'}`}
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-100 placeholder-slate-600 outline-none focus:border-amber-500 font-mono"
            />
            <button
              onClick={handleSimulateScan}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shrink-0 transition-colors"
            >
              Simulate Scan
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
