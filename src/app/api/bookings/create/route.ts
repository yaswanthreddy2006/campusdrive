import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import prisma from '@/lib/prisma'

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
    const { pickupId, dropId, seatsBooked = 1 } = body

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
      // 1. Query online vehicle on duty with sufficient available seats
      let vehicle = await tx.vehicle.findFirst({
        where: {
          isOnline: true,
          availableSeats: {
            gte: numSeats,
          },
        },
        orderBy: {
          availableSeats: 'desc',
        },
      })

      // If no online vehicle found in DB, seed/retrieve active demo vehicle
      if (!vehicle) {
        let defaultDriver = await tx.user.findFirst({
          where: { role: 'DRIVER' },
          include: { vehicle: true },
        })

        if (!defaultDriver) {
          defaultDriver = await tx.user.create({
            data: {
              name: 'Selvam (KARE Shuttle Driver)',
              email: 'driver.selvam@klu.ac.in',
              phone: '9876543210',
              pin: '1234',
              role: 'DRIVER',
              vehicle: {
                create: {
                  vehicleNumber: 'TN-58-KARE-01',
                  capacity: 9,
                  availableSeats: 9,
                  isOnline: true,
                },
              },
            },
            include: { vehicle: true },
          })
        }

        if (defaultDriver.vehicle) {
          vehicle = await tx.vehicle.update({
            where: { id: defaultDriver.vehicle.id },
            data: {
              isOnline: true,
              availableSeats: Math.max(defaultDriver.vehicle.availableSeats, numSeats),
            },
          })
        }
      }

      if (!vehicle || vehicle.availableSeats < numSeats) {
        throw new Error('No available seats found on active campus shuttles.')
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
          status: 'RESERVED',
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

      const qrCodeData = `KARE-SHUTTLE-BOOKING:${booking.id}:${studentId}:${numSeats}:${fareAmount}`

      return { booking, qrCodeData }
    }, { timeout: 10000 })

    return NextResponse.json({
      success: true,
      message: 'Shuttle seat reserved successfully!',
      booking: bookingResult.booking,
      qrCodeData: bookingResult.qrCodeData,
    })
  } catch (error: unknown) {
    console.error('Error creating booking:', error)
    const errorMsg = error instanceof Error ? error.message : 'Seat reservation failed.'
    return NextResponse.json({ error: errorMsg }, { status: 400 })
  }
}
