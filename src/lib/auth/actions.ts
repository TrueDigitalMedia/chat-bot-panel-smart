'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { env } from '@/lib/env'
import { createSessionCookie, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from './session'

export interface LoginState {
  error?: string
}

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const password = formData.get('password')
  const ok =
    typeof password === 'string' && Boolean(env.ADMIN_PASSWORD) && password === env.ADMIN_PASSWORD

  console.info(JSON.stringify({ event: 'admin_login_attempt', success: ok }))

  if (!ok || !env.SESSION_SECRET) {
    return { error: 'Contraseña incorrecta.' }
  }

  const cookieValue = await createSessionCookie(env.SESSION_SECRET)
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  })

  redirect('/admin/dashboard')
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE_NAME)
  redirect('/')
}
