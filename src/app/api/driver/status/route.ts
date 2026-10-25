import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const phone = searchParams.get('phone')

    if (!phone) {
      return NextResponse.json(
        { error: 'Phone number parameter is required.' },
        { status: 400 }
      )
    }

    const cleanPhone = phone.replace(/\D/g, '').slice(-10)

    const driver = await prisma.user.findFirst({
      where: {
        phone: cleanPhone,
        role: 'DRIVER',
      },
      include: {
        vehicle: true,
      },
    })

    if (!driver) {
      return NextResponse.json(
        { found: false, message: 'Driver not found.' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      found: true,
      id: driver.id,
      name: driver.name,
      phone: driver.phone,
      driverStatus: driver.driverStatus || 'PENDING',
      vehicleNumber: driver.vehicle?.vehicleNumber || null,
      isOnline: driver.vehicle?.isOnline || false,
    })
  } catch (error: unknown) {
    console.error('Error checking driver status:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve driver status.' },
      { status: 500 }
    )
  }
}
