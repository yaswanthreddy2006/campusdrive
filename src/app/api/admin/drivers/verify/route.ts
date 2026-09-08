import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'

export async function POST(req: Request) {
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
    const { driverId, action } = await req.json()

    if (!driverId || !action) {
      return NextResponse.json(
        { error: 'Driver ID and action (APPROVE or REJECT) are required.' },
        { status: 400 }
      )
    }

    if (action !== 'APPROVE' && action !== 'REJECT') {
      return NextResponse.json(
        { error: 'Invalid action. Action must be APPROVE or REJECT.' },
        { status: 400 }
      )
    }

    const targetStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED'

    const updatedDriver = await prisma.user.update({
      where: { id: driverId },
      data: {
        driverStatus: targetStatus,
      } as any,
      include: {
        vehicle: true,
      },
    })

    return NextResponse.json({
      success: true,
      message: `Driver ${updatedDriver.name} has been ${targetStatus.toLowerCase()}.`,
      driver: updatedDriver,
    })
  } catch (error: unknown) {
    console.error('Error verifying driver:', error)
    return NextResponse.json(
      { error: 'Failed to update driver verification status.' },
      { status: 500 }
    )
  }
}
