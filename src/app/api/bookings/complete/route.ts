import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { bookingId } = await req.json()

    if (!bookingId) {
      return NextResponse.json(
        { error: 'Booking ID is required for trip completion.' },
        { status: 400 }
      )
    }

    // Execute atomic transaction for trip completion & seat restoration
    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          vehicle: true,
        },
      })

      if (!booking) {
        throw new Error('Booking record not found.')
      }

      // Update booking status to COMPLETED, paymentStatus to PAID
      const updatedBooking = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: 'COMPLETED',
          paymentStatus: 'PAID',
          completedAt: new Date(),
        },
        include: {
          pickup: true,
          drop: true,
          student: true,
        },
      })

      // Calculate restored seats (capping at vehicle capacity)
      const currentVehicle = await tx.vehicle.findUnique({
        where: { id: booking.vehicleId },
      })

      const newAvailableSeats = currentVehicle
        ? Math.min(
            currentVehicle.capacity,
            currentVehicle.availableSeats + booking.seatsBooked
          )
        : 9

      const updatedVehicle = await tx.vehicle.update({
        where: { id: booking.vehicleId },
        data: {
          availableSeats: newAvailableSeats,
        },
      })

      return { booking: updatedBooking, vehicle: updatedVehicle }
    }, { timeout: 10000 })

    return NextResponse.json({
      success: true,
      message: `Trip completed for ${result.booking.student.name}. Payment collected and ${result.booking.seatsBooked} seat(s) restored to shuttle!`,
      booking: result.booking,
      availableSeats: result.vehicle.availableSeats,
    })
  } catch (error: unknown) {
    console.error('Error completing trip:', error)
    const errorMsg = error instanceof Error ? error.message : 'Trip completion failed.'
    return NextResponse.json({ error: errorMsg }, { status: 400 })
  }
}
