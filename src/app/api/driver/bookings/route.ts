import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { cookies } from 'next/headers'

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

    // Server-side authorization check: Only APPROVED drivers can access bookings
    const driverStatus = vehicle.driver.driverStatus || 'APPROVED'
    if (driverStatus !== 'APPROVED') {
      return NextResponse.json(
        {
          error: `Driver account status is ${driverStatus}. Access denied until administrative verification.`,
          driverStatus,
          vehicle: {
            id: vehicle.id,
            vehicleNumber: vehicle.vehicleNumber,
            capacity: vehicle.capacity,
            availableSeats: vehicle.availableSeats,
            isOnline: vehicle.isOnline,
            driver: {
              name: vehicle.driver.name,
              phone: vehicle.driver.phone,
            },
          },
          bookings: [],
        },
        { status: 403 }
      )
    }

    const bookings = await prisma.booking.findMany({
      where: {
        vehicleId,
        status: {
          in: ['RESERVED', 'BOARDED'],
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
    return NextResponse.json(
      { error: 'Failed to fetch driver bookings.' },
      { status: 500 }
    )
  }
}
