import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const shuttles = await prisma.vehicle.findMany({
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
