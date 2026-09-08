import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    const userEmail = session?.user?.email?.toLowerCase().trim()
    const userRole = session?.user?.role

    if (!session || (!userEmail || (userEmail !== 'yaswanthputluru@gmail.com' && userRole !== 'ADMIN'))) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin credentials (yaswanthputluru@gmail.com) required.' },
        { status: 401 }
      )
    }
    // 1. Total Completed Rides
    const totalCompletedRides = await prisma.booking.count({
      where: { status: 'COMPLETED' },
    })

    // 2. Daily Total Revenue Collected (₹)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const dailyRevenueResult = await prisma.booking.aggregate({
      where: {
        paymentStatus: 'PAID',
        createdAt: { gte: today },
      },
      _sum: {
        fareAmount: true,
      },
    })
    const dailyTotalRevenue = dailyRevenueResult._sum.fareAmount || 0

    // 3. Total Active Autos on Duty
    const totalActiveAutosOnDuty = await prisma.vehicle.count({
      where: { isOnline: true },
    })

    // 4. Overall Campus Seat Capacity Utilization %
    const activeVehicles = await prisma.vehicle.findMany({
      where: { isOnline: true },
    })

    let totalCapacity = 0
    let totalOccupiedSeats = 0

    activeVehicles.forEach((v) => {
      totalCapacity += v.capacity
      totalOccupiedSeats += Math.max(0, v.capacity - v.availableSeats)
    })

    const seatUtilizationPercent =
      totalCapacity > 0 ? Math.round((totalOccupiedSeats / totalCapacity) * 100) : 0

    // 5. Live Fleet Status
    const liveFleet = await prisma.vehicle.findMany({
      orderBy: { isOnline: 'desc' },
      include: {
        driver: {
          select: {
            name: true,
            email: true,
            phone: true,
          },
        },
      },
    })

    // 6. Comprehensive Ride Logs Table
    const rideLogs = await prisma.booking.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        student: {
          select: {
            name: true,
            email: true,
            registerNum: true,
          },
        },
        pickup: true,
        drop: true,
        vehicle: {
          select: {
            vehicleNumber: true,
          },
        },
      },
    })

    // 7. Pending Drivers awaiting verification
    const pendingDrivers = await prisma.user.findMany({
      where: {
        role: 'DRIVER',
        driverStatus: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
      include: {
        vehicle: true,
      },
    })

    return NextResponse.json({
      success: true,
      metrics: {
        totalCompletedRides,
        dailyTotalRevenue,
        totalActiveAutosOnDuty,
        seatUtilizationPercent,
        pendingDriversCount: pendingDrivers.length,
      },
      liveFleet,
      pendingDrivers,
      rideLogs,
    })
  } catch (error: unknown) {
    console.error('Error fetching admin stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch admin analytics data.' },
      { status: 500 }
    )
  }
}
