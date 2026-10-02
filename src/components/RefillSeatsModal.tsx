'use client'

import { useState } from 'react'
import { Users, Check, X, Plus, Minus, Sparkles, RefreshCw } from 'lucide-react'

interface RefillSeatsModalProps {
  vehicleId?: string
  currentSeats: number
  capacity: number
  passengerName?: string
  onClose: () => void
  onSeatsUpdated: (newSeats: number) => void
}

export default function RefillSeatsModal({
  vehicleId,
  currentSeats,
  capacity,
  passengerName,
  onClose,
  onSeatsUpdated,
}: RefillSeatsModalProps) {
  const [selectedSeats, setSelectedSeats] = useState<number>(currentSeats)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const handleUpdate = async (seatsToSet: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/driver/seats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId,
          seats: seatsToSet,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update available seats.')
      }

      onSeatsUpdated(data.vehicle?.availableSeats ?? seatsToSet)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update seats.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-md bg-slate-900 border border-amber-500/30 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-5 animate-fadeIn my-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={loading}
          className="absolute top-4 right-4 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="text-center space-y-1.5">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 mx-auto flex items-center justify-center text-amber-400">
            <Users className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">
            {passengerName ? 'Ride Finished! Refill Seats?' : 'Refill Shuttle Seats'}
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            {passengerName ? (
              <>
                Drop completed for <strong className="text-white">{passengerName}</strong>. Do you want to refill or adjust the available seats for new students?
              </>
            ) : (
              'Adjust the number of open seats currently available for students to book.'
            )}
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs text-center">
            {error}
          </div>
        )}

        {/* Current Seat Adjuster */}
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Available Seats Selection</span>
            <span className="font-mono text-amber-400 font-semibold">Max Capacity: {capacity}</span>
          </div>

          <div className="flex items-center justify-center gap-4 py-2">
            <button
              type="button"
              onClick={() => setSelectedSeats((prev) => Math.max(0, prev - 1))}
              disabled={selectedSeats <= 0 || loading}
              className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 flex items-center justify-center text-white transition-colors"
            >
              <Minus className="w-4 h-4" />
            </button>

            <div className="text-center min-w-[80px]">
              <span className="text-3xl font-black font-mono text-amber-400">
                {selectedSeats}
              </span>
              <span className="block text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                Available Seats
              </span>
            </div>

            <button
              type="button"
              onClick={() => setSelectedSeats((prev) => Math.min(capacity, prev + 1))}
              disabled={selectedSeats >= capacity || loading}
              className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 flex items-center justify-center text-white transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-1">
          {/* Quick Refill to Full */}
          <button
            type="button"
            onClick={() => handleUpdate(capacity)}
            disabled={loading}
            className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-black text-xs shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            Refill to Full Capacity ({capacity} Seats)
          </button>

          {/* Confirm Selected Custom Seats */}
          <button
            type="button"
            onClick={() => handleUpdate(selectedSeats)}
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4 text-emerald-400" />
            )}
            Set to {selectedSeats} Available Seat(s)
          </button>

          {/* Dismiss / Keep Current */}
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 font-medium text-xs transition-colors"
          >
            Keep Current ({currentSeats} seats) & Close
          </button>
        </div>
      </div>
    </div>
  )
}
