import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import LandingHero from '@/components/LandingHero'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const cookieStore = cookies()
  const driverSession = cookieStore.get('driver_session')?.value
  const session = await getServerSession(authOptions)
  const lastRole = cookieStore.get('last_role')?.value

  const hasStudentSession = Boolean(session?.user)
  let hasDriverSession = false

  if (driverSession) {
    try {
      const parsed = JSON.parse(driverSession)
      if (parsed?.id) {
        hasDriverSession = true
      }
    } catch {
      hasDriverSession = false
    }
  }

  // Dual-role awareness: if both active sessions exist, prioritize last_role
  if (hasStudentSession && hasDriverSession) {
    if (lastRole === 'driver') {
      redirect('/driver/dashboard')
    } else {
      redirect('/student/dashboard')
    }
  } else if (hasStudentSession) {
    // If an active student session exists -> immediately redirect to /student/dashboard
    redirect('/student/dashboard')
  } else if (hasDriverSession) {
    // If an active driver_session cookie exists -> immediately redirect to /driver/dashboard
    redirect('/driver/dashboard')
  }

  return <LandingHero lastRole={lastRole} />
}
