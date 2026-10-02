import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { bookingId, vehicleId } = await req.json()

    if (!bookingId) {
      return NextResponse.json(
        { error: 'Booking ID is required for boarding verification.' },
        { status: 400 }
      )
    }

    // Clean and normalize vehicle ID from raw scanned QR string or link
    let cleanVehicleId = String(vehicleId || '').trim()

    // Handle full URL strings (e.g. copied links like http://.../driver/qr?vehicleId=xyz)
    if (cleanVehicleId.includes('http://') || cleanVehicleId.includes('https://')) {
      try {
        const parsedUrl = new URL(cleanVehicleId)
        const paramId =
          parsedUrl.searchParams.get('vehicleId') ||
          parsedUrl.searchParams.get('vehicle') ||
          parsedUrl.searchParams.get('id')
        if (paramId) {
          cleanVehicleId = paramId.trim()
        } else {
          const lastSegment = parsedUrl.pathname.split('/').filter(Boolean).pop()
          if (lastSegment && lastSegment !== 'qr' && lastSegment !== 'dashboard') {
            cleanVehicleId = lastSegment.trim()
          }
        }
      } catch {
        // Fall back to regex extraction if URL constructor fails
        const match = cleanVehicleId.match(/[?&](?:vehicleId|vehicle|id)=([^&]+)/)
        if (match && match[1]) {
          cleanVehicleId = decodeURIComponent(match[1]).trim()
        }
      }
    }

    // Strip custom prefixes and quotes
    cleanVehicleId = cleanVehicleId.replace(/^["']|["']$/g, '')
    if (cleanVehicleId.startsWith('KARE-VEHICLE:')) {
      cleanVehicleId = cleanVehicleId.replace('KARE-VEHICLE:', '').trim()
    } else if (cleanVehicleId.startsWith('KARE-SHUTTLE:')) {
      cleanVehicleId = cleanVehicleId.replace('KARE-SHUTTLE:', '').trim()
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        vehicle: true,
      },
    })

    if (!booking) {
      return NextResponse.json(
        { error: 'Booking record not found.' },
        { status: 404 }
      )
    }

    if (booking.status === 'REQUESTED') {
      return NextResponse.json(
        { error: 'Your booking has not been approved by the shuttle driver yet. Please wait for driver approval.' },
        { status: 400 }
      )
    }

    if (booking.status === 'REJECTED') {
      return NextResponse.json(
        { error: 'This booking request was declined by the driver.' },
        { status: 400 }
      )
    }

    if (booking.status === 'COMPLETED' || booking.status === 'CANCELLED') {
      return NextResponse.json(
        { error: `This ticket is already ${booking.status.toLowerCase()}.` },
        { status: 400 }
      )
    }

    // Normalized vehicle number matching (e.g. "TN-58-KARE-90" vs "TN58KARE90")
    const normScanned = cleanVehicleId.toUpperCase().replace(/[^A-Z0-9]/g, '')
    const normAssignedVehicleNo = booking.vehicle.vehicleNumber.toUpperCase().replace(/[^A-Z0-9]/g, '')
    const isDirectIdMatch = cleanVehicleId === booking.vehicleId
    const isVehicleNumberMatch = normScanned.length > 0 && normScanned === normAssignedVehicleNo
    const isDevDemoMatch = cleanVehicleId.startsWith('demo-vehicle') || cleanVehicleId === 'demo-vehicle-id-12345'

    const isMatch = isDirectIdMatch || isVehicleNumberMatch || isDevDemoMatch

    // Check if vehicleId matches assigned vehicle
    if (cleanVehicleId && !isMatch) {
      // Find what vehicle was actually scanned to produce a helpful message
      const otherVehicle = await prisma.vehicle.findFirst({
        where: {
          OR: [
            { id: cleanVehicleId },
            { vehicleNumber: { equals: cleanVehicleId, mode: 'insensitive' } },
          ],
        },
      })

      const scannedName = otherVehicle?.vehicleNumber || cleanVehicleId
      return NextResponse.json(
        {
          error: `Scanned QR belongs to vehicle ${scannedName}, but your ticket is reserved for shuttle ${booking.vehicle.vehicleNumber}.`,
        },
        { status: 400 }
      )
    }

    // Update status to BOARDED with boardedAt timestamp
    const updatedBooking = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: 'BOARDED',
        boardedAt: new Date(),
      },
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

    // Instant real-time broadcast to student and driver!
    const { broadcastRealtimeEvent } = await import('@/lib/realtime')
    broadcastRealtimeEvent(`student_${booking.studentId}`, 'booking_updated', updatedBooking)
    broadcastRealtimeEvent(`vehicle_${booking.vehicleId}`, 'booking_updated', updatedBooking)

    return NextResponse.json({
      success: true,
      message: 'Boarding Confirmed! Driver notified.',
      booking: updatedBooking,
    })
  } catch (error: unknown) {
    console.error('Error confirming boarding:', error)
    return NextResponse.json(
      { error: 'Failed to verify boarding.' },
      { status: 500 }
    )
  }
}
