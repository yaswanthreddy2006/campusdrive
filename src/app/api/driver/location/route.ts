import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const cookieStore = cookies()
    const sessionCookie = cookieStore.get('driver_session')

    let driverId: string | null = null
    let vehicleId: string | null = null

    if (sessionCookie?.value) {
      try {
        const parsed = JSON.parse(sessionCookie.value)
        driverId = parsed.id
        vehicleId = parsed.vehicleId
      } catch (err) {
        console.error('Failed to parse driver session cookie:', err)
      }
    }

    if (!driverId) {
      return NextResponse.json(
        { error: 'Unauthorized. Driver session required.' },
        { status: 401 }
      )
    }

    // Verify driver status in database
    let driverUser = await prisma.user.findUnique({
      where: { id: driverId },
      include: { vehicle: true },
    })

    if (!driverUser) {
      return NextResponse.json(
        { error: 'Driver record not found.' },
        { status: 404 }
      )
    }

    // Auto-approve driver if needed (consistent with bookings API)
    if (driverUser.driverStatus !== 'APPROVED') {
      driverUser = await prisma.user.update({
        where: { id: driverId },
        data: { driverStatus: 'APPROVED' },
        include: { vehicle: true },
      })
    }

    const body = await req.json()
    const { isOnline, latitude, longitude, vehicleId: reqVehicleId } = body
    if (reqVehicleId) {
      vehicleId = reqVehicleId
    }

    // Find vehicle record
    let vehicle = null
    if (vehicleId) {
      vehicle = await prisma.vehicle.findUnique({
        where: { id: vehicleId },
      })
    }

    if (!vehicle && driverId) {
      vehicle = await prisma.vehicle.findUnique({
        where: { driverId },
      })
    }

    // If vehicle doesn't exist yet, create one for driver with a unique number
    if (!vehicle) {
      const phoneSuffix = driverUser.phone
        ? driverUser.phone.slice(-4)
        : Math.floor(1000 + Math.random() * 9000).toString()
      const vehicleNo = `TN-58-KARE-${phoneSuffix}`
      vehicle = await prisma.vehicle.create({
        data: {
          vehicleNumber: vehicleNo,
          driverId,
          capacity: 9,
          availableSeats: 9,
          isOnline: Boolean(isOnline),
          currentLat: latitude ? Number(latitude) : 9.5761,
          currentLng: longitude ? Number(longitude) : 77.6745,
          lastGpsUpdate: new Date(),
        },
      })
    }

    // 1. Explicit OFF DUTY request
    if (isOnline === false) {
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

      const { broadcastRealtimeEvent } = await import('@/lib/realtime')
      broadcastRealtimeEvent('shuttles_gps', 'duty_status_changed', {
        vehicleId: updatedVehicle.id,
        isOnline: false,
        vehicle: updatedVehicle,
      })
      broadcastRealtimeEvent('shuttles_gps', 'shuttle_moved', updatedVehicle)
      broadcastRealtimeEvent(`vehicle_${updatedVehicle.id}`, 'shuttle_moved', updatedVehicle)

      return NextResponse.json({
        success: true,
        message: 'Driver duty set to OFF DUTY successfully.',
        vehicle: updatedVehicle,
        isOnline: false,
      })
    }

    // 2. Strict reject: If the vehicle is currently offline in DB, all GPS updates are rejected!
    // Turning on duty must be done explicitly via /api/driver/duty.
    if (!vehicle.isOnline) {
      return NextResponse.json(
        {
          success: false,
          message: 'Vehicle is currently OFF DUTY. GPS updates rejected.',
        },
        { status: 400 }
      )
    }

    // 3. Background GPS coordinate ping
    if (!vehicle.isOnline) {
      return NextResponse.json(
        {
          success: false,
          message: 'Vehicle is currently OFF DUTY. GPS updates rejected.',
        },
        { status: 400 }
      )
    }

    const updatedVehicle = await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: {
        ...(latitude !== undefined && latitude !== null
          ? { currentLat: Number(latitude) }
          : {}),
        ...(longitude !== undefined && longitude !== null
          ? { currentLng: Number(longitude) }
          : {}),
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

    // Instant real-time broadcast to student map and driver dashboards!
    const { broadcastRealtimeEvent } = await import('@/lib/realtime')
    broadcastRealtimeEvent('shuttles_gps', 'shuttle_moved', updatedVehicle)
    broadcastRealtimeEvent(`vehicle_${updatedVehicle.id}`, 'shuttle_moved', updatedVehicle)

    return NextResponse.json({
      success: true,
      message: 'Driver location updated successfully.',
      vehicle: updatedVehicle,
    })
  } catch (error: unknown) {
    console.error('Error updating driver location:', error)
    return NextResponse.json(
      { error: 'Failed to update driver location.' },
      { status: 500 }
    )
  }
}
