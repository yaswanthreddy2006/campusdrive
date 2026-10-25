import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { BookingStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { bookingId, cancelledBy } = await req.json()

    if (!bookingId) {
      return NextResponse.json(
        { error: 'Booking ID is required.' },
        { status: 400 }
      )
    }

    const isCancelledByDriver = cancelledBy === 'DRIVER'

    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { vehicle: true },
      })

      if (!booking) {
        throw new Error('Booking not found.')
      }

      if (booking.status === BookingStatus.COMPLETED || booking.status === BookingStatus.CANCELLED) {
        throw new Error(`Booking cannot be cancelled because it is already ${booking.status.toLowerCase()}.`)
      }

      const updatedBooking = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.CANCELLED,
          paymentStatus: isCancelledByDriver ? 'CANCELLED_BY_DRIVER' : 'CANCELLED_BY_STUDENT',
        },
        include: {
          pickup: true,
          drop: true,
          student: true,
          vehicle: {
            include: {
              driver: true,
            },
          },
        },
      })

      let remainingSeats = booking.vehicle?.availableSeats ?? 9
      // If booking was not rejected or completed, restore seats
      if (booking.status !== BookingStatus.REJECTED) {
        const vehicle = await tx.vehicle.findUnique({
          where: { id: booking.vehicleId },
        })

        if (vehicle) {
          remainingSeats = Math.min(
            vehicle.capacity,
            vehicle.availableSeats + booking.seatsBooked
          )
          await tx.vehicle.update({
            where: { id: vehicle.id },
            data: {
              availableSeats: remainingSeats,
            },
          })
        }
      }

      return { booking: updatedBooking, remainingSeats }
    })

    // Instant real-time broadcast to student, driver, and global GPS monitor!
    const { broadcastRealtimeEvent } = await import('@/lib/realtime')
    broadcastRealtimeEvent(`student_${result.booking.studentId}`, 'booking_updated', result.booking)
    broadcastRealtimeEvent(`vehicle_${result.booking.vehicleId}`, 'booking_updated', result.booking)
    broadcastRealtimeEvent('shuttles_gps', 'seats_updated', {
      vehicleId: result.booking.vehicleId,
      availableSeats: result.remainingSeats,
    })

    return NextResponse.json({
      success: true,
      message: isCancelledByDriver
        ? 'Ride cancelled by driver successfully.'
        : 'Booking cancelled successfully.',
      booking: result.booking,
      availableSeats: result.remainingSeats,
    })
  } catch (error: unknown) {
    console.error('Error cancelling booking:', error)
    const errorMsg = error instanceof Error ? error.message : 'Failed to cancel booking.'
    return NextResponse.json({ error: errorMsg }, { status: 400 })
  }
}
