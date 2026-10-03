import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { cookies } from 'next/headers'
import { broadcastRealtimeEvent } from '@/lib/realtime'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const cookieStore = cookies()
    const sessionCookie = cookieStore.get('driver_session')

    let sessionDriverId: string | null = null
    let sessionVehicleId: string | null = null

    if (sessionCookie?.value) {
      try {
        const parsed = JSON.parse(sessionCookie.value)
        sessionDriverId = parsed.id
        sessionVehicleId = parsed.vehicleId
      } catch (err) {
        console.error('Failed to parse driver session:', err)
      }
    }

    const body = await req.json()
    const { isOnline, vehicleId: reqVehicleId, latitude, longitude } = body
    const targetVehicleId = reqVehicleId || sessionVehicleId

    let vehicle = null
    if (targetVehicleId) {
      vehicle = await prisma.vehicle.findUnique({
        where: { id: targetVehicleId },
        include: {
          driver: {
            select: { name: true, phone: true },
          },
        },
      })
    }

    if (!vehicle && sessionDriverId) {
      vehicle = await prisma.vehicle.findUnique({
        where: { driverId: sessionDriverId },
        include: {
          driver: {
            select: { name: true, phone: true },
          },
        },
      })
    }

    if (!vehicle) {
      return NextResponse.json(
        { error: 'Vehicle not found or driver unauthorized.' },
        { status: 404 }
      )
    }

    const nextOnline = Boolean(isOnline)

    const updatedVehicle = await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: {
        isOnline: nextOnline,
        lastGpsUpdate: new Date(),
        ...(latitude !== undefined && latitude !== null
          ? { currentLat: Number(latitude) }
          : {}),
        ...(longitude !== undefined && longitude !== null
          ? { currentLng: Number(longitude) }
          : {}),
      },
      include: {
        driver: {
          select: { name: true, phone: true },
        },
      },
    })

    // Broadcast instant duty status change event to student map, active shuttles, and driver screens
    broadcastRealtimeEvent('shuttles_gps', 'duty_status_changed', {
      vehicleId: updatedVehicle.id,
      isOnline: updatedVehicle.isOnline,
      vehicle: updatedVehicle,
    })
    broadcastRealtimeEvent('shuttles_gps', 'shuttle_moved', updatedVehicle)
    broadcastRealtimeEvent(`vehicle_${updatedVehicle.id}`, 'shuttle_moved', updatedVehicle)

    return NextResponse.json({
      success: true,
      vehicle: updatedVehicle,
      isOnline: updatedVehicle.isOnline,
      message: `Driver duty set to ${updatedVehicle.isOnline ? 'ON DUTY' : 'OFF DUTY'} successfully.`,
    })
  } catch (error: unknown) {
    console.error('Error updating driver duty:', error)
    return NextResponse.json(
      { error: 'Failed to update driver duty status.' },
      { status: 500 }
    )
  }
}
