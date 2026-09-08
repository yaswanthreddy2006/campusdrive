import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { bookingId, vehicleId } = await req.json()

    if (!bookingId) {
      return NextResponse.json(
        { error: 'Booking ID is required for boarding verification.' },
        { status: 400 }
      )
    }

    // Clean vehicle ID from raw scanned QR string if needed
    let cleanVehicleId = vehicleId || ''
    if (cleanVehicleId.startsWith('KARE-VEHICLE:')) {
      cleanVehicleId = cleanVehicleId.replace('KARE-VEHICLE:', '').trim()
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        vehicle: true,
      },
    })

    if (!booking) {
      return NextResponse.json(
        { error: 'Booking record not found.' },
        { status: 404 }
      )
    }

    // Check if vehicleId matches assigned vehicle
    if (cleanVehicleId && booking.vehicleId !== cleanVehicleId) {
      return NextResponse.json(
        {
          error: `Scanned QR belongs to vehicle ${cleanVehicleId}, but your ticket is reserved for shuttle ${booking.vehicle.vehicleNumber}.`,
        },
        { status: 400 }
      )
    }

    // Update status to BOARDED with boardedAt timestamp
    const updatedBooking = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: 'BOARDED',
        boardedAt: new Date(),
      },
      include: {
        pickup: true,
        drop: true,
        vehicle: {
          include: {
            driver: true,
          },
        },
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Boarding Confirmed! Driver notified.',
      booking: updatedBooking,
    })
  } catch (error: unknown) {
    console.error('Error confirming boarding:', error)
    return NextResponse.json(
      { error: 'Failed to verify boarding.' },
      { status: 500 }
    )
  }
}
