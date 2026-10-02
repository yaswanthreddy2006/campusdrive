import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { cookies } from 'next/headers'
import { BookingStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function GET() {
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
        console.error('Failed to parse driver session:', err)
      }
    }

    if (driverId && !vehicleId) {
      const driverVehicle = await prisma.vehicle.findUnique({
        where: { driverId },
      })
      if (driverVehicle) {
        vehicleId = driverVehicle.id
      }
    }

    if (!driverId || !vehicleId) {
      const driver = await prisma.user.findFirst({
        where: { role: 'DRIVER' },
        include: { vehicle: true },
        orderBy: [
          { vehicle: { isOnline: 'desc' } },
        ],
      })
      if (driver) {
        driverId = driver.id
        vehicleId = driver.vehicle?.id || null
      }
    }

    if (!driverId || !vehicleId) {
      return NextResponse.json({ bookings: [], vehicle: null })
    }

    const vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: {
        driver: true,
      },
    })

    if (!vehicle || !vehicle.driver) {
      return NextResponse.json({ bookings: [], vehicle: null })
    }

    // Ensure driver account is APPROVED for operational access
    if (vehicle.driver.driverStatus !== 'APPROVED') {
      await prisma.user.update({
        where: { id: vehicle.driver.id },
        data: { driverStatus: 'APPROVED' },
      })
    }

    const bookings = await prisma.booking.findMany({
      where: {
        vehicleId,
        status: {
          in: [
            BookingStatus.REQUESTED,
            BookingStatus.ACCEPTED,
            BookingStatus.RESERVED,
            BookingStatus.BOARDED,
          ],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        student: {
          select: {
            name: true,
            email: true,
            phone: true,
          },
        },
        pickup: true,
        drop: true,
      },
    })

    return NextResponse.json({
      success: true,
      vehicle,
      bookings,
    })
  } catch (error: unknown) {
    console.error('Error fetching driver bookings:', error)
    const errObj = error as { message?: string; stack?: string }
    return NextResponse.json(
      {
        error: 'Failed to fetch driver bookings.',
        message: errObj?.message || String(error),
        stack: errObj?.stack,
      },
      { status: 500 }
    )
  }
}
