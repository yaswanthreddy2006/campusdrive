import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import prisma from '@/lib/prisma'
import { BookingStatus } from '@prisma/client'
import { broadcastRealtimeEvent } from '@/lib/realtime'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    let studentId = (session?.user as { id?: string })?.id

    // If session doesn't have ID directly, lookup user by session email
    if (!studentId && session?.user?.email) {
      const dbUser = await prisma.user.findUnique({
        where: { email: session.user.email.toLowerCase() },
      })
      if (dbUser) {
        studentId = dbUser.id
      }
    }

    // Fallback for dev/testing if not logged in
    if (!studentId) {
      const demoStudent = await prisma.user.upsert({
        where: { email: 'student.demo@klu.ac.in' },
        update: {},
        create: {
          email: 'student.demo@klu.ac.in',
          name: 'Demo KLU Student',
          role: 'STUDENT',
        },
      })
      studentId = demoStudent.id
    }

    const body = await req.json()
    const { pickupId, dropId, seatsBooked = 1, vehicleId: requestedVehicleId } = body

    if (!pickupId || !dropId) {
      return NextResponse.json(
        { error: 'Pickup and Drop locations are required.' },
        { status: 400 }
      )
    }

    if (pickupId === dropId) {
      return NextResponse.json(
        { error: 'Pickup and Drop locations cannot be identical.' },
        { status: 400 }
      )
    }

    const numSeats = Number(seatsBooked)
    if (isNaN(numSeats) || numSeats < 1 || numSeats > 3) {
      return NextResponse.json(
        { error: 'You can book between 1 and 3 seats per shuttle.' },
        { status: 400 }
      )
    }

    // Perform atomic seat reservation using Prisma transaction
    const bookingResult = await prisma.$transaction(async (tx) => {
      let vehicle = null

      // If student picked a specific vehicle/driver, prioritize it if online
      if (requestedVehicleId) {
        const target = await tx.vehicle.findUnique({
          where: { id: requestedVehicleId },
          include: { driver: true },
        })
        if (target && target.isOnline) {
          vehicle = target
        }
      }

      // If no specific online vehicle requested or vehicle not found, query online vehicle with seats
      if (!vehicle || vehicle.availableSeats < numSeats) {
        vehicle = await tx.vehicle.findFirst({
          where: {
            isOnline: true,
            availableSeats: {
              gte: numSeats,
            },
          },
          include: { driver: true },
          orderBy: {
            availableSeats: 'desc',
          },
        })
      }

      // Check if an online vehicle is available
      if (!vehicle || !vehicle.isOnline) {
        throw new Error('No shuttle driver is available now. Please try again when a driver comes on duty.')
      }

      // Ensure driver is approved
      if (vehicle.driver && vehicle.driver.driverStatus !== 'APPROVED') {
        await tx.user.update({
          where: { id: vehicle.driver.id },
          data: { driverStatus: 'APPROVED' },
        })
      }

      if (vehicle.availableSeats < numSeats) {
        throw new Error(`Shuttle ${vehicle.vehicleNumber} only has ${vehicle.availableSeats} seat(s) available.`)
      }

      // 2. Atomic Decrement of availableSeats to prevent race conditions
      const updatedVehicle = await tx.vehicle.update({
        where: { id: vehicle.id },
        data: {
          availableSeats: {
            decrement: numSeats,
          },
        },
      })

      if (updatedVehicle.availableSeats < 0) {
        throw new Error('Seat reservation lock conflict. Please retry.')
      }

      // 3. Create Reserved Booking record
      const fareAmount = numSeats * 10
      const booking = await tx.booking.create({
        data: {
          studentId: studentId as string,
          vehicleId: vehicle.id,
          pickupId,
          dropId,
          seatsBooked: numSeats,
          fareAmount,
          paymentMethod: 'CASH_OR_DRIVER_UPI',
          paymentStatus: 'PENDING_COLLECTION',
          status: BookingStatus.REQUESTED,
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
          vehicle: {
            include: {
              driver: true,
            },
          },
        },
      })

      const qrCodeData = `KARE-SHUTTLE-BOOKING:${booking.id}:${studentId}:${numSeats}:${fareAmount}`

      return { booking, qrCodeData, remainingSeats: updatedVehicle.availableSeats }
    }, { timeout: 10000 })

    // Instant real-time push to the driver and student channels!
    broadcastRealtimeEvent(`vehicle_${bookingResult.booking.vehicleId}`, 'booking_created', bookingResult.booking)
    broadcastRealtimeEvent(`student_${studentId}`, 'booking_created', bookingResult.booking)
    broadcastRealtimeEvent('shuttles_gps', 'seats_updated', {
      vehicleId: bookingResult.booking.vehicleId,
      availableSeats: bookingResult.remainingSeats,
    })

    return NextResponse.json({
      success: true,
      message: 'Shuttle seat requested! Notification sent to driver for approval.',
      booking: bookingResult.booking,
      qrCodeData: bookingResult.qrCodeData,
    })
  } catch (error: unknown) {
    console.error('Error creating booking:', error)
    const errorMsg = error instanceof Error ? error.message : 'Seat reservation failed.'
    return NextResponse.json({ error: errorMsg }, { status: 400 })
  }
}
