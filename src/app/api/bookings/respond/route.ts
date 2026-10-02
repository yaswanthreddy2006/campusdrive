import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { BookingStatus } from '@prisma/client'
import { broadcastRealtimeEvent } from '@/lib/realtime'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { bookingId, action } = await req.json()

    if (!bookingId || !action) {
      return NextResponse.json(
        { error: 'Booking ID and action (APPROVE/REJECT) are required.' },
        { status: 400 }
      )
    }

    const normalizedAction = String(action).toUpperCase()
    if (normalizedAction !== 'APPROVE' && normalizedAction !== 'ACCEPT' && normalizedAction !== 'REJECT') {
      return NextResponse.json(
        { error: 'Action must be APPROVE or REJECT.' },
        { status: 400 }
      )
    }

    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          student: true,
          pickup: true,
          drop: true,
          vehicle: true,
        },
      })

      if (!booking) {
        throw new Error('Booking record not found.')
      }

      if (booking.status !== BookingStatus.REQUESTED) {
        throw new Error(`Booking is already ${booking.status.toLowerCase()} and cannot be updated.`)
      }

      if (normalizedAction === 'APPROVE' || normalizedAction === 'ACCEPT') {
        const updatedBooking = await tx.booking.update({
          where: { id: bookingId },
          data: {
            status: BookingStatus.ACCEPTED,
          },
          include: {
            student: true,
            pickup: true,
            drop: true,
            vehicle: {
              include: {
                driver: true,
              },
            },
          },
        })

        return {
          booking: updatedBooking,
          message: `Booking approved for ${booking.student.name || 'Student'}. Waiting for boarding.`,
          availableSeats: booking.vehicle.availableSeats,
        }
      } else {
        // REJECT action: Restore seats to the vehicle
        const updatedBooking = await tx.booking.update({
          where: { id: bookingId },
          data: {
            status: BookingStatus.REJECTED,
          },
          include: {
            student: true,
            pickup: true,
            drop: true,
            vehicle: {
              include: {
                driver: true,
              },
            },
          },
        })

        const vehicle = await tx.vehicle.findUnique({
          where: { id: booking.vehicleId },
        })

        let newAvailableSeats = 9
        if (vehicle) {
          newAvailableSeats = Math.min(
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

        return {
          booking: updatedBooking,
          message: `Booking request rejected. ${booking.seatsBooked} seat(s) restored.`,
          availableSeats: newAvailableSeats,
        }
      }
    })

    // Instant real-time broadcast to student and driver channels!
    broadcastRealtimeEvent(`student_${result.booking.studentId}`, 'booking_updated', result.booking)
    broadcastRealtimeEvent(`vehicle_${result.booking.vehicleId}`, 'booking_updated', result.booking)
    if (normalizedAction === 'REJECT') {
      broadcastRealtimeEvent('shuttles_gps', 'seats_updated', {
        vehicleId: result.booking.vehicleId,
        availableSeats: result.availableSeats,
      })
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      booking: result.booking,
    })
  } catch (error: unknown) {
    console.error('Error responding to booking:', error)
    const errorMsg = error instanceof Error ? error.message : 'Failed to update booking status.'
    return NextResponse.json({ error: errorMsg }, { status: 400 })
  }
}
