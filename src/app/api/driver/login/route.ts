import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { cookies } from 'next/headers'

export async function POST(req: Request) {
  try {
    const { phone, pin } = await req.json()

    if (!phone || !pin) {
      return NextResponse.json(
        { error: 'Mobile number and 4-digit PIN are required.' },
        { status: 400 }
      )
    }

    const cleanPhone = phone.trim()
    const cleanPin = pin.trim()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let driver: any = await prisma.user.findFirst({
      where: {
        phone: cleanPhone,
        role: 'DRIVER',
      },
      include: {
        vehicle: true,
      },
    })

    // In development/test mode, auto-seed demo driver if phone is 9876543210 and PIN is 1234
    if (!driver && cleanPhone === '9876543210' && cleanPin === '1234') {
      driver = await prisma.user.create({
        data: {
          name: 'Selvam (KARE Shuttle Driver)',
          email: 'driver.selvam@klu.ac.in',
          phone: '9876543210',
          pin: '1234',
          role: 'DRIVER',
          driverStatus: 'APPROVED',
          vehicle: {
            create: {
              vehicleNumber: 'TN-58-KARE-01',
              capacity: 9,
              availableSeats: 9,
              isOnline: false,
            },
          },
        },
        include: {
          vehicle: true,
        },
      })
    }

    if (!driver) {
      // Auto-create new driver with PENDING verification status upon first login attempt
      const driverEmail = `driver.${cleanPhone}@klu.ac.in`
      const vehicleNo = `TN-58-KARE-${cleanPhone.slice(-2)}`
      driver = await prisma.user.create({
        data: {
          name: `Driver (${cleanPhone.slice(-4)})`,
          email: driverEmail,
          phone: cleanPhone,
          pin: cleanPin,
          role: 'DRIVER',
          driverStatus: 'PENDING',
          vehicle: {
            create: {
              vehicleNumber: vehicleNo,
              capacity: 9,
              availableSeats: 9,
              isOnline: false,
            },
          },
        },
        include: {
          vehicle: true,
        },
      })
    } else if (driver.pin !== cleanPin) {
      return NextResponse.json(
        { error: 'Invalid 4-digit PIN. Please try again.' },
        { status: 401 }
      )
    }

    // Ensure vehicle always starts OFF DUTY upon login until driver explicitly toggles it on
    if (driver.vehicle?.id || driver.id) {
      await prisma.vehicle.updateMany({
        where: driver.vehicle?.id ? { id: driver.vehicle.id } : { driverId: driver.id },
        data: { isOnline: false },
      })
    }

    // Set Driver Session Cookie
    const driverStatus = driver.driverStatus || 'APPROVED'
    const driverPayload = {
      id: driver.id,
      name: driver.name,
      phone: driver.phone,
      role: driver.role,
      driverStatus,
      vehicleId: driver.vehicle?.id || null,
      vehicleNumber: driver.vehicle?.vehicleNumber || null,
    }

    const cookieStore = cookies()
    cookieStore.set('driver_session', JSON.stringify(driverPayload), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    })

    return NextResponse.json({
      success: true,
      message: 'Driver authenticated successfully.',
      driver: driverPayload,
    })
  } catch (error: unknown) {
    console.error('Driver login API error:', error)
    return NextResponse.json(
      { error: 'Internal server error during driver login.' },
      { status: 500 }
    )
  }
}
