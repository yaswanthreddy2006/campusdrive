import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { cookies } from 'next/headers'
import { BookingStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const queryVehicleId = searchParams.get('vehicleId')

    const cookieStore = cookies()
    const sessionCookie = cookieStore.get('driver_session')

    let driverId: string | null = null
    let vehicleId: string | null = queryVehicleId || null

    if (sessionCookie?.value) {
      try {
        const parsed = JSON.parse(sessionCookie.value)
        driverId = parsed.id
        if (!vehicleId) {
          vehicleId = parsed.vehicleId
        }
      } catch (err) {
        console.error('Failed to parse driver session:', err)
      }
    }

    if (!driverId && !queryVehicleId) {
      return NextResponse.json(
        { error: 'Unauthorized. Driver session required.' },
        { status: 401 }
      )
    }

    if (!vehicleId && driverId) {
      const driverVehicle = await prisma.vehicle.findUnique({
        where: { driverId },
      })
      if (driverVehicle) {
        vehicleId = driverVehicle.id
      }
    }

    if (!vehicleId) {
      return NextResponse.json(
        { error: 'Driver vehicle not found.' },
        { status: 404 }
      )
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
