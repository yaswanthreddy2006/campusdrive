'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Html5QrcodeScanner } from 'html5-qrcode'
import {
  Camera,
  X,
  Sparkles,
  ClipboardPaste,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Bus,
} from 'lucide-react'

interface QrScannerProps {
  onScanSuccess: (scannedText: string) => void
  onClose: () => void
  expectedVehicleId?: string
  expectedVehicleNumber?: string
}

export default function QrScanner({
  onScanSuccess,
  onClose,
  expectedVehicleId,
  expectedVehicleNumber,
}: QrScannerProps) {
  const [manualInput, setManualInput] = useState('')
  const [scannerError, setScannerError] = useState<string | null>(null)
  const [pasteNotice, setPasteNotice] = useState<string | null>(null)
  const [cameraActive, setCameraActive] = useState<boolean>(false)
  const scannerRef = useRef<Html5QrcodeScanner | null>(null)

  const handleScanSubmit = useCallback(
    (rawText: string) => {
      let cleaned = rawText.trim()
      if (!cleaned) return

      // If user pasted a full URL (e.g. copied from driver QR page link)
      if (cleaned.includes('http://') || cleaned.includes('https://')) {
        try {
          const url = new URL(cleaned)
          const p =
            url.searchParams.get('vehicleId') ||
            url.searchParams.get('vehicle') ||
            url.searchParams.get('id')
          if (p) {
            cleaned = `KARE-VEHICLE:${p}`
          }
        } catch {
          // Keep raw
        }
      }

      onScanSuccess(cleaned)
    },
    [onScanSuccess]
  )

  useEffect(() => {
    const scannerId = 'reader-container'
    setCameraActive(true)

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
          scanner.clear().catch(() => {})
          handleScanSubmit(decodedText)
        },
        () => {
          // Frame callback
        }
      )

      scannerRef.current = scanner
    } catch (err) {
      console.warn('Unable to start HTML5 camera scanner:', err)
      setCameraActive(false)
      setScannerError('Camera access unavailable or blocked on this device. You can paste the link/code below.')
    }

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch((e) => console.error('Failed to clear scanner:', e))
      }
    }
  }, [handleScanSubmit])

  const handlePasteClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText()
        if (text) {
          setManualInput(text.trim())
          setPasteNotice('Pasted from clipboard!')
          setTimeout(() => setPasteNotice(null), 2000)
          return
        }
      }
      setPasteNotice('Please press Ctrl+V to paste into the input.')
      setTimeout(() => setPasteNotice(null), 2500)
    } catch {
      setPasteNotice('Clipboard permission required. Please paste manually.')
      setTimeout(() => setPasteNotice(null), 2500)
    }
  }

  const handleQuickVerify = () => {
    const payload = manualInput.trim() || (expectedVehicleId ? `KARE-VEHICLE:${expectedVehicleId}` : 'demo-vehicle-id')
    handleScanSubmit(payload)
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto custom-scrollbar">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 sm:space-y-5 animate-fadeIn max-h-[92vh] overflow-y-auto custom-scrollbar my-auto">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          title="Close Scanner"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="text-center space-y-1.5 pt-1">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/30 mx-auto flex items-center justify-center text-blue-400">
            <Camera className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white tracking-tight">Scan Vehicle Boarding QR</h3>
          <p className="text-xs text-slate-400">
            Point your device camera at the Shuttle door QR code or paste the verification link below.
          </p>
        </div>

        {/* Camera Container for html5-qrcode */}
        <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 p-2 min-h-[220px] flex items-center justify-center">
          <div id="reader-container" className="w-full text-slate-200 text-xs text-center" />
          {scannerError && (
            <div className="p-3 text-center space-y-2">
              <AlertCircle className="w-6 h-6 text-amber-400 mx-auto" />
              <p className="text-xs text-amber-300">{scannerError}</p>
            </div>
          )}
        </div>

        {/* Enhanced Link / Payload Verification Box */}
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-amber-400">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Direct Verification & Copy-Paste:
            </span>
            {pasteNotice ? (
              <span className="text-[10px] text-emerald-400 font-mono animate-fadeIn flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                {pasteNotice}
              </span>
            ) : (
              <span className="text-[10px] text-slate-500 font-mono">Instant verify</span>
            )}
          </div>

          <div className="space-y-2">
            <div className="relative">
              <input
                type="text"
                placeholder={
                  expectedVehicleId
                    ? `Paste link or KARE-VEHICLE:${expectedVehicleId}`
                    : 'Paste QR code, copied link, or shuttle number'
                }
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleQuickVerify()
                }}
                className="w-full pl-3 pr-24 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-100 placeholder-slate-600 outline-none focus:border-amber-500 font-mono"
              />
              <button
                type="button"
                onClick={handlePasteClipboard}
                className="absolute right-1.5 top-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold transition-colors flex items-center gap-1"
                title="Paste from clipboard"
              >
                <ClipboardPaste className="w-3 h-3 text-amber-400" />
                Paste
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleQuickVerify}
                className="flex-1 py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/10"
              >
                <CheckCircle2 className="w-4 h-4" />
                Verify Boarding Now
              </button>

              {(expectedVehicleId || expectedVehicleNumber) && (
                <button
                  type="button"
                  onClick={() => {
                    handleScanSubmit(`KARE-VEHICLE:${expectedVehicleId || expectedVehicleNumber}`)
                  }}
                  className="py-2.5 px-3 rounded-xl bg-slate-850 hover:bg-slate-800 border border-slate-800 text-emerald-400 font-semibold text-xs transition-colors flex items-center gap-1 shrink-0"
                  title="Auto-fill with reserved ticket shuttle"
                >
                  <Bus className="w-3.5 h-3.5" />
                  {expectedVehicleNumber || 'Reserved Shuttle'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
