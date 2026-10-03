import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import prisma from '@/lib/prisma'
import { broadcastRealtimeEvent } from '@/lib/realtime'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    let vehicleId: string | null = null
    let driverId: string | null = null

    // 1. Try reading body if present (e.g. from sendBeacon)
    try {
      const text = await req.text()
      if (text) {
        try {
          const parsed = JSON.parse(text)
          if (parsed.vehicleId) vehicleId = parsed.vehicleId
          if (parsed.driverId) driverId = parsed.driverId
        } catch {
          // If body is raw vehicleId string
          if (text.startsWith('cmu') || text.length > 10) {
            vehicleId = text.trim()
          }
        }
      }
    } catch {
      // Body reading optional
    }

    // 2. Try reading session cookie
    if (!vehicleId && !driverId) {
      const cookieStore = cookies()
      const sessionCookie = cookieStore.get('driver_session')
      if (sessionCookie?.value) {
        try {
          const parsed = JSON.parse(sessionCookie.value)
          driverId = parsed.id
          vehicleId = parsed.vehicleId
        } catch {
          // Session cookie parsing fallback
        }
      }
    }

    if (vehicleId || driverId) {
      let vehicle = null
      if (vehicleId) {
        vehicle = await prisma.vehicle.findUnique({
          where: { id: vehicleId },
          include: { driver: true },
        })
      }
      if (!vehicle && driverId) {
        vehicle = await prisma.vehicle.findUnique({
          where: { driverId },
          include: { driver: true },
        })
      }

      if (vehicle) {
        const updatedVehicle = await prisma.vehicle.update({
          where: { id: vehicle.id },
          data: {
            isOnline: false,
            lastGpsUpdate: new Date(),
          },
          include: {
            driver: {
              select: {
                name: true,
                phone: true,
              },
            },
          },
        })

        broadcastRealtimeEvent('shuttles_gps', 'shuttle_moved', updatedVehicle)
        broadcastRealtimeEvent('shuttles_gps', 'duty_status_changed', {
          vehicleId: updatedVehicle.id,
          isOnline: false,
          vehicle: updatedVehicle,
        })
        broadcastRealtimeEvent(`vehicle_${updatedVehicle.id}`, 'shuttle_moved', updatedVehicle)

        return NextResponse.json({ success: true, vehicleId: updatedVehicle.id, isOnline: false })
      }
    }

    return NextResponse.json({ success: false, error: 'Vehicle not identified.' }, { status: 400 })
  } catch (error) {
    console.error('Error setting driver offline via beacon:', error)
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}
