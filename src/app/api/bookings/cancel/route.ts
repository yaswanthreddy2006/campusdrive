import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { BookingStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { bookingId } = await req.json()

    if (!bookingId) {
      return NextResponse.json(
        { error: 'Booking ID is required.' },
        { status: 400 }
      )
    }

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

      // If booking was not rejected or completed, restore seats
      if (booking.status !== BookingStatus.REJECTED) {
        const vehicle = await tx.vehicle.findUnique({
          where: { id: booking.vehicleId },
        })

        if (vehicle) {
          const newAvailableSeats = Math.min(
            vehicle.capacity,
            vehicle.availableSeats + booking.seatsBooked
          )
          await tx.vehicle.update({
            where: { id: vehicle.id },
            data: {
              availableSeats: newAvailableSeats,
            },
          })
        }
      }

      return updatedBooking
    })

    // Instant real-time broadcast to student and driver!
    const { broadcastRealtimeEvent } = await import('@/lib/realtime')
    broadcastRealtimeEvent(`student_${result.studentId}`, 'booking_updated', result)
    broadcastRealtimeEvent(`vehicle_${result.vehicleId}`, 'booking_updated', result)

    return NextResponse.json({
      success: true,
      message: 'Booking cancelled successfully.',
      booking: result,
    })
  } catch (error: unknown) {
    console.error('Error cancelling booking:', error)
    const errorMsg = error instanceof Error ? error.message : 'Failed to cancel booking.'
    return NextResponse.json({ error: errorMsg }, { status: 400 })
  }
}
