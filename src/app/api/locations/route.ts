import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const DEFAULT_LOCATIONS = [
  { name: 'Main Gate', latitude: 9.5701, longitude: 77.6745 },
  { name: 'Girls Hostel', latitude: 9.5685, longitude: 77.6758 },
  { name: 'Admin Block', latitude: 9.5715, longitude: 77.6738 },
  { name: 'Library', latitude: 9.5722, longitude: 77.6742 },
  { name: '9th Block', latitude: 9.5692, longitude: 77.6765 },
  { name: '11th Block', latitude: 9.5688, longitude: 77.677 },
]

export async function GET() {
  try {
    let locations = await prisma.location.findMany({
      orderBy: { name: 'asc' },
    })

    // Auto-seed if database contains no locations
    if (locations.length === 0) {
      for (const loc of DEFAULT_LOCATIONS) {
        await prisma.location.upsert({
          where: { name: loc.name },
          update: {},
          create: loc,
        })
      }
      locations = await prisma.location.findMany({
        orderBy: { name: 'asc' },
      })
    }

    return NextResponse.json({
      success: true,
      locations,
    })
  } catch (error: unknown) {
    console.error('Error fetching locations:', error)
    return NextResponse.json(
      { error: 'Failed to fetch campus locations.' },
      { status: 500 }
    )
  }
}
