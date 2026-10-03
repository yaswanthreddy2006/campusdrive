import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Heartbeat Staleness Watchdog (Telemetry Reaper):
    // If no GPS/heartbeat received in the last 15 seconds,
    // automatically drop vehicle to offline status in database.
    const STALE_CUTOFF_MS = 15 * 1000
    const staleCutoff = new Date(Date.now() - STALE_CUTOFF_MS)

    await prisma.vehicle.updateMany({
      where: {
        isOnline: true,
        OR: [
          { lastGpsUpdate: { lt: staleCutoff } },
          { lastGpsUpdate: null },
        ],
      },
      data: {
        isOnline: false,
      },
    })

    // Query ONLY vehicles matching: isOnline: true, lastGpsUpdate within 15s, and driver APPROVED
    const shuttles = await prisma.vehicle.findMany({
      where: {
        isOnline: true,
        lastGpsUpdate: {
          gte: staleCutoff,
        },
        driver: {
          driverStatus: 'APPROVED',
        },
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
      shuttles: shuttles || [],
    })
  } catch (error: unknown) {
    console.error('Error fetching active shuttles:', error)
    return NextResponse.json(
      { error: 'Failed to fetch active campus shuttles.' },
      { status: 500 }
    )
  }
}
