import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { vehicleId: requestedVehicleId, seats, refillToFull } = body

    let vehicleId = requestedVehicleId

    // Try to get vehicle from driver session if not provided
    if (!vehicleId) {
      const cookieStore = cookies()
      const sessionCookie = cookieStore.get('driver_session')
      if (sessionCookie?.value) {
        try {
          const parsed = JSON.parse(sessionCookie.value)
          vehicleId = parsed.vehicleId
        } catch (err) {
          console.error('Failed to parse driver session:', err)
        }
      }
    }

    if (!vehicleId) {
      const driver = await prisma.user.findFirst({
        where: { role: 'DRIVER' },
        include: { vehicle: true },
      })
      if (driver?.vehicle) {
        vehicleId = driver.vehicle.id
      }
    }

    if (!vehicleId) {
      return NextResponse.json(
        { error: 'Vehicle not found or driver not identified.' },
        { status: 404 }
      )
    }

    const currentVehicle = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
    })

    if (!currentVehicle) {
      return NextResponse.json(
        { error: 'Vehicle record not found.' },
        { status: 404 }
      )
    }

    let newSeats = currentVehicle.capacity
    if (!refillToFull && seats !== undefined) {
      const parsedSeats = parseInt(String(seats), 10)
      if (isNaN(parsedSeats) || parsedSeats < 0) {
        return NextResponse.json(
          { error: 'Invalid seats count provided.' },
          { status: 400 }
        )
      }
      newSeats = Math.min(currentVehicle.capacity, Math.max(0, parsedSeats))
    }

    const updatedVehicle = await prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        availableSeats: newSeats,
      },
    })

    // Instant real-time broadcast to student map and booking selectors!
    const { broadcastRealtimeEvent } = await import('@/lib/realtime')
    broadcastRealtimeEvent('shuttles_gps', 'seats_updated', {
      vehicleId: updatedVehicle.id,
      availableSeats: updatedVehicle.availableSeats,
    })
    broadcastRealtimeEvent(`vehicle_${updatedVehicle.id}`, 'seats_updated', updatedVehicle)

    return NextResponse.json({
      success: true,
      message: `Shuttle seats updated! Current available seats: ${updatedVehicle.availableSeats}/${updatedVehicle.capacity}`,
      vehicle: updatedVehicle,
    })
  } catch (error: unknown) {
    console.error('Error updating vehicle seats:', error)
    const errorMsg = error instanceof Error ? error.message : 'Failed to update seats.'
    return NextResponse.json({ error: errorMsg }, { status: 500 })
  }
}
