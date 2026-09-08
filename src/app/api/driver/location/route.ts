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

    // Fallback: lookup driver in DB by phone or role
    if (!driverId) {
      const driver = await prisma.user.findFirst({
        where: { role: 'DRIVER' },
        include: { vehicle: true },
      })
      if (driver) {
        driverId = driver.id
        vehicleId = driver.vehicle?.id || null
      }
    }

    if (!driverId) {
      return NextResponse.json(
        { error: 'Unauthorized. Driver session required.' },
        { status: 401 }
      )
    }

    // Verify driver status in database
    const driverUser = await prisma.user.findUnique({
      where: { id: driverId },
    })

    const driverStatus = driverUser?.driverStatus || 'APPROVED'
    if (driverStatus !== 'APPROVED') {
      return NextResponse.json(
        {
          error: `Driver account is ${driverStatus}. Duty and GPS updates are disabled until verification.`,
          driverStatus,
        },
        { status: 403 }
      )
    }

    const { isOnline, latitude, longitude } = await req.json()

    // If vehicle doesn't exist yet, create one for driver
    if (!vehicleId) {
      const newVehicle = await prisma.vehicle.create({
        data: {
          vehicleNumber: 'TN-58-KARE-01',
          driverId,
          capacity: 9,
          availableSeats: 9,
          isOnline: Boolean(isOnline),
          currentLat: latitude ? Number(latitude) : 9.5701,
          currentLng: longitude ? Number(longitude) : 77.6745,
          lastGpsUpdate: new Date(),
        },
      })
      vehicleId = newVehicle.id
    }

    const updatedVehicle = await prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        isOnline: Boolean(isOnline),
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

    return NextResponse.json({
      success: true,
      message: 'Driver location and duty status updated successfully.',
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
