import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { env } from '@/lib/env'
import { verifySessionCookie, SESSION_COOKIE_NAME } from '@/lib/auth/session'
import { LoginForm } from './login-form'

export default async function LoginPage() {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value
  const hasValidSession = env.SESSION_SECRET
    ? await verifySessionCookie(env.SESSION_SECRET, sessionCookie)
    : false

  if (hasValidSession) {
    redirect('/admin/dashboard')
  }

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <LoginForm />
    </div>
  )
}
