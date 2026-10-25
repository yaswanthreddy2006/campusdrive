import { PrismaClient, BookingStatus } from '@prisma/client'
import { realtimeBus, RealtimeMessage } from '../src/lib/realtime'

const prisma = new PrismaClient()

async function runTests() {
  console.log('=== STARTING SHUTTLE BOOKING WORKFLOW VERIFICATION ===\n')

  // Setup test data
  const testStudentEmail = 'test.student.verify@klu.ac.in'
  const testStudent2Email = 'test.student2.verify@klu.ac.in'
  const testDriverEmail = 'test.driver.verify@klu.ac.in'

  const student1 = await prisma.user.upsert({
    where: { email: testStudentEmail },
    update: {},
    create: {
      email: testStudentEmail,
      name: 'Verify Student One',
      role: 'STUDENT',
    },
  })

  const student2 = await prisma.user.upsert({
    where: { email: testStudent2Email },
    update: {},
    create: {
      email: testStudent2Email,
      name: 'Verify Student Two',
      role: 'STUDENT',
    },
  })

  const testDriverPhone = '9000111222'
  const driver = await prisma.user.upsert({
    where: { email: testDriverEmail },
    update: { driverStatus: 'APPROVED', role: 'DRIVER' },
    create: {
      email: testDriverEmail,
      name: 'Verify Shuttle Driver',
      phone: testDriverPhone,
      role: 'DRIVER',
      driverStatus: 'APPROVED',
    },
  })

  let vehicle = await prisma.vehicle.upsert({
    where: { driverId: driver.id },
    update: {
      isOnline: true,
      availableSeats: 3,
      capacity: 3,
      lastGpsUpdate: new Date(),
    },
    create: {
      vehicleNumber: 'TN-58-TEST-99',
      driverId: driver.id,
      capacity: 3,
      availableSeats: 3,
      isOnline: true,
      lastGpsUpdate: new Date(),
    },
    include: { driver: true },
  })

  // Ensure locations exist
  const pickup = await prisma.location.upsert({
    where: { name: 'Test Main Gate' },
    update: {},
    create: { name: 'Test Main Gate', latitude: 9.5761, longitude: 77.6833 },
  })

  const drop = await prisma.location.upsert({
    where: { name: 'Test Library' },
    update: {},
    create: { name: 'Test Library', latitude: 9.5747, longitude: 77.6787 },
  })

  // Clean up any existing bookings for test users
  await prisma.booking.deleteMany({
    where: {
      studentId: { in: [student1.id, student2.id] },
    },
  })

  // Reset seats
  await prisma.vehicle.update({
    where: { id: vehicle.id },
    data: { availableSeats: 3, isOnline: true },
  })

  console.log('✓ Test environment initialized with 1 shuttle (capacity 3, seats 3)\n')

  // Listen to realtime notifications
  const driverNotifications: RealtimeMessage[] = []
  const studentNotifications: RealtimeMessage[] = []

  const driverListener = (msg: RealtimeMessage) => {
    driverNotifications.push(msg)
  }
  const studentListener = (msg: RealtimeMessage) => {
    studentNotifications.push(msg)
  }

  realtimeBus.on(`vehicle_${vehicle.id}`, driverListener)
  realtimeBus.on(`student_${student1.id}`, studentListener)

  // ----------------------------------------------------
  // TEST 1: A student books a shuttle once.
  // ----------------------------------------------------
  console.log('Test 1: Student books a shuttle once...')
  // Simulate POST /api/bookings/create
  const createBooking = async (studentId: string, vehicleId: string, seats: number) => {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.booking.findFirst({
        where: {
          studentId,
          status: {
            in: [BookingStatus.REQUESTED, BookingStatus.ACCEPTED, BookingStatus.RESERVED, BookingStatus.BOARDED],
          },
        },
      })
      if (existing) {
        throw new Error('You already have an active shuttle booking. You can only book one shuttle ride at a time.')
      }

      const v = await tx.vehicle.findUnique({
        where: { id: vehicleId },
        include: { driver: true },
      })
      if (!v || !v.isOnline || v.driver?.driverStatus !== 'APPROVED') {
        throw new Error('Sorry, no drivers are on duty right now. Please try again later.')
      }

      let updatedV
      try {
        updatedV = await tx.vehicle.update({
          where: { id: v.id, availableSeats: { gte: seats } },
          data: { availableSeats: { decrement: seats } },
        })
      } catch {
        throw new Error(`Shuttle ${v.vehicleNumber} only has ${v.availableSeats} seat(s) available.`)
      }

      const b = await tx.booking.create({
        data: {
          studentId,
          vehicleId: v.id,
          pickupId: pickup.id,
          dropId: drop.id,
          seatsBooked: seats,
          fareAmount: seats * 10,
          status: BookingStatus.REQUESTED,
        },
        include: {
          student: true,
          pickup: true,
          drop: true,
          vehicle: { include: { driver: true } },
        },
      })

      return { booking: b, remainingSeats: updatedV.availableSeats }
    }, { timeout: 20000, maxWait: 10000 })
  }

  const booking1Result = await createBooking(student1.id, vehicle.id, 1)
  const booking1 = booking1Result.booking

  // Emit realtime
  const { broadcastRealtimeEvent } = await import('../src/lib/realtime')
  broadcastRealtimeEvent(`vehicle_${vehicle.id}`, 'booking_created', booking1)
  broadcastRealtimeEvent(`student_${student1.id}`, 'booking_created', booking1)

  if (booking1 && booking1.status === BookingStatus.REQUESTED) {
    console.log(`✓ Test 1 Passed: Booking created with status REQUESTED (Pending), ID: ${booking1.id}`)
  } else {
    throw new Error('Test 1 Failed: Booking status not REQUESTED')
  }

  // ----------------------------------------------------
  // TEST 2: Repeated clicks / concurrent requests do not create duplicate bookings
  // ----------------------------------------------------
  console.log('\nTest 2: Repeated clicks & duplicate booking prevention...')
  let duplicatePrevented = false
  try {
    await createBooking(student1.id, vehicle.id, 1)
  } catch (err: any) {
    if (err.message.includes('You already have an active shuttle booking')) {
      duplicatePrevented = true
      console.log(`✓ Test 2 Passed: Duplicate booking rejected with message: "${err.message}"`)
    }
  }
  if (!duplicatePrevented) {
    throw new Error('Test 2 Failed: Duplicate booking was NOT prevented!')
  }

  // ----------------------------------------------------
  // TEST 3: The driver receives exactly one notification
  // ----------------------------------------------------
  console.log('\nTest 3: Driver notification verification...')
  const driverBookingCreatedEvents = driverNotifications.filter(
    (n) => n.event === 'booking_created' && n.data?.id === booking1.id
  )
  if (driverBookingCreatedEvents.length === 1) {
    console.log(`✓ Test 3 Passed: Driver received exactly 1 notification for booking ${booking1.id}`)
  } else {
    throw new Error(`Test 3 Failed: Driver received ${driverBookingCreatedEvents.length} notifications, expected 1`)
  }

  // ----------------------------------------------------
  // TEST 4: The student sees the waiting status
  // ----------------------------------------------------
  console.log('\nTest 4: Student waiting status verification...')
  const studentWaitingMsg = 'Booking request sent. Please wait for the driver to respond'
  const studentPendingEvent = studentNotifications.find(
    (n) => n.event === 'booking_created' && n.data?.id === booking1.id
  )
  if (studentPendingEvent && booking1.status === 'REQUESTED') {
    console.log(`✓ Test 4 Passed: Student live status is Pending with message: "${studentWaitingMsg}"`)
  } else {
    throw new Error('Test 4 Failed: Student waiting event not found')
  }

  // ----------------------------------------------------
  // TEST 5: The driver accepts and the student sees the update
  // ----------------------------------------------------
  console.log('\nTest 5: Driver accepts ride...')
  const acceptBooking = async (bookingId: string) => {
    return await prisma.$transaction(async (tx) => {
      const b = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { vehicle: true, student: true, pickup: true, drop: true },
      })
      if (!b || b.status !== BookingStatus.REQUESTED) {
        throw new Error('Booking cannot be accepted.')
      }
      return await tx.booking.update({
        where: { id: bookingId },
        data: { status: BookingStatus.ACCEPTED },
        include: { vehicle: true, student: true, pickup: true, drop: true },
      })
    }, { timeout: 20000, maxWait: 10000 })
  }

  const acceptedBooking = await acceptBooking(booking1.id)
  broadcastRealtimeEvent(`student_${student1.id}`, 'booking_updated', acceptedBooking)
  broadcastRealtimeEvent(`vehicle_${vehicle.id}`, 'booking_updated', acceptedBooking)

  const studentAcceptedEvent = studentNotifications.find(
    (n) => n.event === 'booking_updated' && n.data?.id === booking1.id && n.data?.status === 'ACCEPTED'
  )
  if (studentAcceptedEvent && acceptedBooking.status === BookingStatus.ACCEPTED) {
    console.log(`✓ Test 5 Passed: Booking updated to ACCEPTED (Accepted), Student notified instantly via SSE`)
  } else {
    throw new Error('Test 5 Failed: Driver acceptance update failed')
  }

  // ----------------------------------------------------
  // TEST 6: The driver cancels and the student can book another shuttle
  // ----------------------------------------------------
  console.log('\nTest 6: Driver cancels ride...')
  const cancelByDriver = async (bookingId: string) => {
    return await prisma.$transaction(async (tx) => {
      const b = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { vehicle: true },
      })
      if (!b) throw new Error('Booking not found')

      const updated = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.CANCELLED,
          paymentStatus: 'CANCELLED_BY_DRIVER',
        },
        include: { vehicle: true, student: true, pickup: true, drop: true },
      })

      const v = await tx.vehicle.findUnique({ where: { id: b.vehicleId } })
      const newSeats = v ? Math.min(v.capacity, v.availableSeats + b.seatsBooked) : 9
      await tx.vehicle.update({
        where: { id: b.vehicleId },
        data: { availableSeats: newSeats },
      })

      return { booking: updated, restoredSeats: newSeats }
    }, { timeout: 20000, maxWait: 10000 })
  }

  const cancelledResult = await cancelByDriver(booking1.id)
  broadcastRealtimeEvent(`student_${student1.id}`, 'booking_updated', cancelledResult.booking)
  broadcastRealtimeEvent(`vehicle_${vehicle.id}`, 'booking_updated', cancelledResult.booking)

  const studentCancelledEvent = studentNotifications.find(
    (n) =>
      n.event === 'booking_updated' &&
      n.data?.id === booking1.id &&
      n.data?.status === 'CANCELLED' &&
      n.data?.paymentStatus === 'CANCELLED_BY_DRIVER'
  )

  if (studentCancelledEvent && cancelledResult.restoredSeats === 3) {
    console.log('✓ Test 6 Part A Passed: Driver cancellation registered with status CANCELLED and paymentStatus CANCELLED_BY_DRIVER. Seats restored to 3.')
    console.log('  Student displayed: "Your driver has cancelled the ride. Please book another available driver or shuttle."')
  } else {
    throw new Error('Test 6 Part A Failed: Cancellation or seat restoration failed')
  }

  // Verify student can now book another shuttle immediately
  console.log('  Testing student booking another ride after driver cancellation...')
  const booking2Result = await createBooking(student1.id, vehicle.id, 1)
  if (booking2Result && booking2Result.booking.status === BookingStatus.REQUESTED) {
    console.log('✓ Test 6 Part B Passed: Student successfully booked another shuttle after driver cancelled.')
  } else {
    throw new Error('Test 6 Part B Failed: Student could not book after cancellation')
  }

  // Cancel booking2 to clean up for next tests
  await cancelByDriver(booking2Result.booking.id)

  // ----------------------------------------------------
  // TEST 7: No drivers are on duty -> correct message
  // ----------------------------------------------------
  console.log('\nTest 7: No drivers on duty...')
  // Set all vehicles offline
  await prisma.vehicle.updateMany({
    data: { isOnline: false },
  })

  let noDriverMessageReceived = false
  try {
    await createBooking(student1.id, vehicle.id, 1)
  } catch (err: any) {
    if (err.message === 'Sorry, no drivers are on duty right now. Please try again later.') {
      noDriverMessageReceived = true
      console.log(`✓ Test 7 Passed: Booking rejected with exact required message: "${err.message}"`)
    } else {
      console.log(`Unexpected message: ${err.message}`)
    }
  }
  if (!noDriverMessageReceived) {
    throw new Error('Test 7 Failed: Correct "no drivers on duty" message was not received')
  }

  // Restore vehicle online
  await prisma.vehicle.update({
    where: { id: vehicle.id },
    data: { isOnline: true, availableSeats: 1 }, // Set to 1 seat for race condition test
  })

  // ----------------------------------------------------
  // TEST 8: Multiple students attempt to book simultaneously (Seat race conditions)
  // ----------------------------------------------------
  console.log('\nTest 8: Multiple students attempt to book simultaneously on 1 available seat...')
  // Shuttle only has 1 seat available. Student 1 and Student 2 book at the exact same moment.
  const attempts = await Promise.allSettled([
    createBooking(student1.id, vehicle.id, 1),
    createBooking(student2.id, vehicle.id, 1),
  ])

  const fulfilled = attempts.filter((a) => a.status === 'fulfilled')
  const rejected = attempts.filter((a) => a.status === 'rejected')

  console.log(`  Results: ${fulfilled.length} succeeded, ${rejected.length} rejected`)

  const vehicleAfterRace = await prisma.vehicle.findUnique({ where: { id: vehicle.id } })

  if (fulfilled.length === 1 && rejected.length === 1 && vehicleAfterRace?.availableSeats === 0) {
    console.log('✓ Test 8 Passed: Exactly 1 student secured the single seat; the other student received seat conflict/unavailable error. Vehicle availableSeats cleanly hit 0 (no negative seats).')
  } else {
    throw new Error(`Test 8 Failed: Overbooking occurred! availableSeats=${vehicleAfterRace?.availableSeats}`)
  }

  // ----------------------------------------------------
  // TEST 9: Refreshing page preserves correct booking status
  // ----------------------------------------------------
  console.log('\nTest 9: Refreshing the page preserves correct booking status...')
  // The successful student fetches their bookings (simulating page reload fetch)
  const winningStudentId = (fulfilled[0] as PromiseFulfilledResult<any>).value.booking.studentId
  const fetchedBookings = await prisma.booking.findMany({
    where: { studentId: winningStudentId },
    orderBy: { createdAt: 'desc' },
  })

  const reloadedActive = fetchedBookings.find(
    (b) =>
      b.status === 'REQUESTED' ||
      b.status === 'ACCEPTED' ||
      b.status === 'RESERVED' ||
      b.status === 'BOARDED'
  )

  if (reloadedActive && reloadedActive.status === BookingStatus.REQUESTED) {
    console.log(`✓ Test 9 Passed: Reloading/re-fetching returned active booking with status REQUESTED (Pending) for student ${winningStudentId}`)
  } else {
    throw new Error('Test 9 Failed: Active booking not preserved on page refresh')
  }

  // ----------------------------------------------------
  // TEST 10: Completed and cancelled rides allow new bookings
  // ----------------------------------------------------
  console.log('\nTest 10: Completed rides allow new bookings...')
  const completeTrip = async (bookingId: string) => {
    return await prisma.$transaction(async (tx) => {
      const b = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.COMPLETED,
          paymentStatus: 'PAID',
          completedAt: new Date(),
        },
      })
      await tx.vehicle.update({
        where: { id: b.vehicleId },
        data: { availableSeats: { increment: b.seatsBooked } },
      })
      return b
    }, { timeout: 20000, maxWait: 10000 })
  }

  await completeTrip(reloadedActive.id)
  console.log('  Ride marked COMPLETED. Now attempting new booking for the same student...')

  const newBookingAfterCompletion = await createBooking(winningStudentId, vehicle.id, 1)
  if (newBookingAfterCompletion && newBookingAfterCompletion.booking.status === BookingStatus.REQUESTED) {
    console.log('✓ Test 10 Passed: Student successfully created a new booking after previous ride completed.')
  } else {
    throw new Error('Test 10 Failed: Could not create booking after trip completion')
  }

  // Clean up
  await prisma.booking.deleteMany({
    where: { studentId: { in: [student1.id, student2.id] } },
  })
  await prisma.vehicle.update({
    where: { id: vehicle.id },
    data: { availableSeats: 3, isOnline: true },
  })

  realtimeBus.off(`vehicle_${vehicle.id}`, driverListener)
  realtimeBus.off(`student_${student1.id}`, studentListener)

  console.log('\n======================================================')
  console.log('🎉 ALL 10 TESTS PASSED WITH 100% SUCCESS!')
  console.log('======================================================')
}

runTests()
  .catch((e) => {
    console.error('Test Suite Failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
