import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { adminAuth } from '@/lib/firebaseAdmin'

export async function POST(req: Request) {
  try {
    const { name, phone, idToken, vehicleName, vehicleNumber, mpin } = await req.json()

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'Driver full name is required.' },
        { status: 400 }
      )
    }

    if (!phone) {
      return NextResponse.json(
        { error: 'Mobile number is required.' },
        { status: 400 }
      )
    }

    const cleanPhone = phone.replace(/\D/g, '').slice(-10)
    if (cleanPhone.length < 10) {
      return NextResponse.json(
        { error: 'Please provide a valid 10-digit mobile number.' },
        { status: 400 }
      )
    }

    const cleanPin = (mpin || '').trim()
    if (!cleanPin || cleanPin.length !== 4 || !/^\d{4}$/.test(cleanPin)) {
      return NextResponse.json(
        { error: 'M-PIN must be exactly 4 digits.' },
        { status: 400 }
      )
    }

    if (!vehicleNumber || !vehicleNumber.trim()) {
      return NextResponse.json(
        { error: 'Vehicle number (e.g., TN-58-KARE-01) is required.' },
        { status: 400 }
      )
    }

    // Verify Firebase token if provided
    if (idToken) {
      try {
        const decodedToken = await adminAuth.verifyIdToken(idToken)
        const verifiedPhone = decodedToken.phone_number?.replace(/\D/g, '') || ''
        if (!verifiedPhone.endsWith(cleanPhone)) {
          return NextResponse.json(
            { error: 'Verified phone does not match entered phone number.' },
            { status: 401 }
          )
        }
      } catch (tokenErr) {
        console.error('Firebase token verification error during registration:', tokenErr)
        return NextResponse.json(
          { error: 'Invalid or expired OTP session. Please verify phone again.' },
          { status: 401 }
        )
      }
    }

    const formattedVehicleNo = vehicleName?.trim()
      ? `${vehicleName.trim()} (${vehicleNumber.trim().toUpperCase()})`
      : vehicleNumber.trim().toUpperCase()

    const driverEmail = `driver.${cleanPhone}@klu.ac.in`

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ phone: cleanPhone }, { email: driverEmail }],
      },
      include: {
        vehicle: true,
      },
    })

    let driverUser

    if (existingUser) {
      // Update existing driver profile
      driverUser = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          name: name.trim(),
          phone: cleanPhone,
          pin: cleanPin,
          role: 'DRIVER',
          driverStatus: 'PENDING',
        },
      })

      // Update or create vehicle
      if (existingUser.vehicle) {
        await prisma.vehicle.update({
          where: { id: existingUser.vehicle.id },
          data: {
            vehicleNumber: formattedVehicleNo,
            isOnline: false,
          },
        })
      } else {
        await prisma.vehicle.create({
          data: {
            vehicleNumber: formattedVehicleNo,
            driverId: existingUser.id,
            capacity: 9,
            availableSeats: 9,
            isOnline: false,
          },
        })
      }
    } else {
      // Create new driver with vehicle
      driverUser = await prisma.user.create({
        data: {
          name: name.trim(),
          email: driverEmail,
          phone: cleanPhone,
          pin: cleanPin,
          role: 'DRIVER',
          driverStatus: 'PENDING',
          vehicle: {
            create: {
              vehicleNumber: formattedVehicleNo,
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

    return NextResponse.json({
      success: true,
      message: 'Registration submitted successfully! Awaiting Admin approval.',
      driver: {
        id: driverUser.id,
        name: driverUser.name,
        phone: driverUser.phone,
        driverStatus: 'PENDING',
        vehicleNumber: formattedVehicleNo,
      },
    })
  } catch (error: unknown) {
    console.error('Driver registration error:', error)
    return NextResponse.json(
      { error: 'Failed to complete driver registration. Please try again.' },
      { status: 500 }
    )
  }
}
