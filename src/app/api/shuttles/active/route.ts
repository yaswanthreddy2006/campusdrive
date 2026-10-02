import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    let shuttles = await prisma.vehicle.findMany({
      where: {
        isOnline: true,
      },
      include: {
        driver: {
          select: {
            name: true,
            phone: true,
          },
        },
      },
      orderBy: {
        lastGpsUpdate: 'desc',
      },
    })

    // Fallback: If no vehicle is marked online, retrieve or activate the registered campus shuttle
    if (shuttles.length === 0) {
      const anyVehicle = await prisma.vehicle.findFirst({
        include: {
          driver: {
            select: { name: true, phone: true },
          },
        },
      })
      if (anyVehicle) {
        const activated = await prisma.vehicle.update({
          where: { id: anyVehicle.id },
          data: {
            isOnline: true,
            currentLat: anyVehicle.currentLat ?? 9.5761,
            currentLng: anyVehicle.currentLng ?? 77.6833,
            lastGpsUpdate: new Date(),
          },
          include: {
            driver: {
              select: { name: true, phone: true },
            },
          },
        })
        shuttles = [activated]
      }
    }

    return NextResponse.json({
      success: true,
      count: shuttles.length,
      shuttles,
    })
  } catch (error: unknown) {
    console.error('Error fetching active shuttles:', error)
    return NextResponse.json(
      { error: 'Failed to fetch active campus shuttles.' },
      { status: 500 }
    )
  }
}
