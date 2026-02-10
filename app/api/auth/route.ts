import { NextRequest, NextResponse } from 'next/server'

const AUTH_COOKIE = 'cet-auth'
const AUTH_TOKEN = 'authenticated'

export async function POST(request: NextRequest) {
  const { password } = await request.json()
  const appPassword = process.env.APP_PASSWORD || 'tracker2026'

  if (password === appPassword) {
    const response = NextResponse.json({ success: true })
    response.cookies.set(AUTH_COOKIE, AUTH_TOKEN, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    })
    return response
  }

  return NextResponse.json({ success: false, error: 'Incorrect password' }, { status: 401 })
}

export async function DELETE() {
  const response = NextResponse.json({ success: true })
  response.cookies.set(AUTH_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return response
}
