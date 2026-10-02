import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const KARE_CAMPUS_LOCATIONS = [
  { name: 'Main Gate', latitude: 9.5761, longitude: 77.6833 },
  { name: 'Girls Hostel', latitude: 9.5762, longitude: 77.6814 },
  { name: 'Library', latitude: 9.5747, longitude: 77.6787 },
  { name: 'Admin Block', latitude: 9.5741, longitude: 77.6760 },
  { name: '8th Block', latitude: 9.5750, longitude: 77.6761 },
  { name: '9th Block', latitude: 9.5743, longitude: 77.6748 },
  { name: '7th Block', latitude: 9.5738, longitude: 77.6739 },
  { name: '11th Block', latitude: 9.5732, longitude: 77.6751 },
]

export async function GET() {
  try {
    let locations = await prisma.location.findMany({
      orderBy: { name: 'asc' },
    })

    if (locations.length === 0) {
      for (const loc of KARE_CAMPUS_LOCATIONS) {
        await prisma.location.upsert({
          where: { name: loc.name },
          update: { latitude: loc.latitude, longitude: loc.longitude },
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
