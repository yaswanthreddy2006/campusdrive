import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    let studentId = (session?.user as { id?: string })?.id

    if (!studentId && session?.user?.email) {
      const dbUser = await prisma.user.findUnique({
        where: { email: session.user.email.toLowerCase() },
      })
      if (dbUser) {
        studentId = dbUser.id
      }
    }

    if (!studentId) {
      // Fallback demo student
      const demoStudent = await prisma.user.findUnique({
        where: { email: 'student.demo@klu.ac.in' },
      })
      studentId = demoStudent?.id
    }

    if (!studentId) {
      return NextResponse.json({ bookings: [] })
    }

    const bookings = await prisma.booking.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        pickup: true,
        drop: true,
        vehicle: {
          include: {
            driver: true,
          },
        },
      },
    })

    return NextResponse.json({
      success: true,
      bookings,
    })
  } catch (error: unknown) {
    console.error('Error fetching student bookings:', error)
    return NextResponse.json(
      { error: 'Failed to fetch student bookings.' },
      { status: 500 }
    )
  }
}
