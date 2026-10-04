import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function POST() {
  const cookieStore = cookies()
  cookieStore.delete('last_role')
  const res = NextResponse.json({ success: true, message: 'Role cookie cleared' })
  res.cookies.delete('last_role')
  return res
}

export async function GET(req: Request) {
  const cookieStore = cookies()
  cookieStore.delete('last_role')
  const res = NextResponse.redirect(new URL('/', req.url), 303)
  res.cookies.delete('last_role')
  return res
}
