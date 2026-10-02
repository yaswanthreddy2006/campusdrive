import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Exact KARE Campus building coordinates matching the aerial campus map
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

export async function POST() {
  try {
    const results = []

    // Upsert all 8 exact college building locations
    for (const loc of KARE_CAMPUS_LOCATIONS) {
      const location = await prisma.location.upsert({
        where: { name: loc.name },
        update: { latitude: loc.latitude, longitude: loc.longitude },
        create: loc,
      })
      results.push(location)
    }

    return NextResponse.json({
      success: true,
      message: 'KARE campus building locations updated successfully to exact aerial coordinates.',
      count: results.length,
      locations: results,
    })
  } catch (error: unknown) {
    console.error('Error seeding campus locations:', error)
    return NextResponse.json(
      { error: 'Failed to update campus locations.' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return POST()
}
