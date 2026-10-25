import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { phone, pin, mpin } = await req.json()

    if (!phone) {
      return NextResponse.json(
        { error: 'Mobile number is required.' },
        { status: 400 }
      )
    }

    const cleanPhone = phone.replace(/\D/g, '').slice(-10)

    if (cleanPhone.length < 10) {
      return NextResponse.json(
        { error: 'Please enter a valid 10-digit mobile number.' },
        { status: 400 }
      )
    }

    const inputPin = (mpin || pin || '').trim()

    if (!inputPin || inputPin.length !== 4) {
      return NextResponse.json(
        { error: 'Please enter your 4-digit M-PIN.' },
        { status: 400 }
      )
    }

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

    // Auto-seed demo driver in test mode if 9876543210 and 1234
    if (!driver && cleanPhone === '9876543210' && inputPin === '1234') {
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
      return NextResponse.json(
        {
          error: `No driver account found with mobile number ${cleanPhone}. Please register as a new driver first.`,
          notRegistered: true,
        },
        { status: 404 }
      )
    }

    // Verify 4-digit M-PIN
    if (driver.pin !== inputPin) {
      return NextResponse.json(
        { error: 'Incorrect 4-digit M-PIN. Please try again.' },
        { status: 401 }
      )
    }

    // Check Admin Approval Status
    const driverStatus = driver.driverStatus || 'PENDING'

    if (driverStatus === 'PENDING') {
      return NextResponse.json(
        {
          error: 'Your driver account is pending Admin approval. Please wait until campus operations approves your registration.',
          driverStatus: 'PENDING',
          driver: {
            name: driver.name,
            phone: driver.phone,
            vehicleNumber: driver.vehicle?.vehicleNumber,
          },
        },
        { status: 403 }
      )
    }

    if (driverStatus === 'REJECTED') {
      return NextResponse.json(
        {
          error: 'Your driver registration was rejected by the administrator. Please contact KARE operations.',
          driverStatus: 'REJECTED',
        },
        { status: 403 }
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
    const driverPayload = {
      id: driver.id,
      name: driver.name,
      phone: driver.phone,
      role: driver.role,
      driverStatus,
      vehicleId: driver.vehicle?.id || null,
      vehicleNumber: driver.vehicle?.vehicleNumber || null,
    }

    const response = NextResponse.json({
      success: true,
      message: 'Driver authenticated successfully.',
      driver: driverPayload,
    })

    response.cookies.set('driver_session', JSON.stringify(driverPayload), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    })

    response.cookies.set('last_role', 'driver', {
      path: '/',
      maxAge: 31536000, // 1 year
      expires: new Date(Date.now() + 31536000 * 1000),
      sameSite: 'lax',
    })

    return response
  } catch (error: unknown) {
    console.error('Driver login API error:', error)
    return NextResponse.json(
      { error: 'Internal server error during driver login.' },
      { status: 500 }
    )
  }
}
