'use client'

import { CreditCard, CheckCircle2, X, Loader2, User } from 'lucide-react'

interface PaymentModalBooking {
  id: string
  seatsBooked: number
  fareAmount: number
  paymentMethod: string
  student: {
    name: string
    phone?: string
  }
  pickup: { name: string }
  drop: { name: string }
}

interface PaymentModalProps {
  booking: PaymentModalBooking
  onConfirm: () => void
  onCancel: () => void
  submitting: boolean
}

export default function PaymentModal({
  booking,
  onConfirm,
  onCancel,
  submitting,
}: PaymentModalProps) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto custom-scrollbar">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 sm:space-y-5 animate-fadeIn max-h-[90vh] overflow-y-auto custom-scrollbar my-auto">
        
        {/* Close Button */}
        <button
          onClick={onCancel}
          disabled={submitting}
          className="absolute top-4 right-4 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="text-center space-y-1">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 mx-auto flex items-center justify-center text-amber-400">
            <CreditCard className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">Fare Collection Confirmation</h3>
          <p className="text-xs text-slate-400">
            Verify payment from passenger before marking trip completed.
          </p>
        </div>

        {/* Booking Details Card */}
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-slate-400 flex items-center gap-1.5 font-semibold">
              <User className="w-3.5 h-3.5 text-blue-400" />
              Passenger:
            </span>
            <span className="font-bold text-white text-sm">{booking.student.name}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-slate-300">
            <div>
              <span className="text-[10px] text-slate-500 block">Route</span>
              <span className="font-semibold">{booking.pickup.name} ➔ {booking.drop.name}</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-500 block">Seats Reserved</span>
              <span className="font-bold text-amber-400 font-mono text-sm">{booking.seatsBooked} Seat(s)</span>
            </div>
          </div>
        </div>

        {/* Prominent Payment Notice Box */}
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 space-y-2 text-center">
          <div className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">
            Required Payment Action
          </div>
          <div className="text-xl font-black text-amber-400 font-mono">
            Collect ₹{booking.fareAmount}
          </div>
          <p className="text-xs text-amber-200/90 leading-relaxed">
            Collect <strong className="text-amber-400 font-bold">₹{booking.fareAmount}</strong> from{' '}
            <strong className="text-white font-bold">{booking.student.name}</strong> via Cash or Driver UPI GPay/PhonePe QR code.
          </p>
        </div>

        {/* Actions */}
        <div className="space-y-2 pt-1">
          <button
            id="confirm-payment-complete-btn"
            onClick={onConfirm}
            disabled={submitting}
            className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-extrabold text-sm transition-all shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Updating Status & Restoring Seats...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Payment Received & Complete Drop
              </>
            )}
          </button>

          <button
            onClick={onCancel}
            disabled={submitting}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-400 font-semibold text-xs transition-colors"
          >
            Cancel
          </button>
        </div>

      </div>
    </div>
  )
}
