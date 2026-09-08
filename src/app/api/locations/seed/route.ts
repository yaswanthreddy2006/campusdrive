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

export async function POST() {
  try {
    const results = []

    for (const loc of DEFAULT_LOCATIONS) {
      const location = await prisma.location.upsert({
        where: { name: loc.name },
        update: { latitude: loc.latitude, longitude: loc.longitude },
        create: loc,
      })
      results.push(location)
    }

    return NextResponse.json({
      success: true,
      message: 'KARE campus locations seeded successfully.',
      count: results.length,
      locations: results,
    })
  } catch (error: unknown) {
    console.error('Error seeding locations:', error)
    return NextResponse.json(
      { error: 'Failed to seed campus locations.' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return POST()
}
