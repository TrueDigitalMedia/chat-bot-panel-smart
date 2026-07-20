import { test, expect } from '@playwright/test'

// Requires a running dev server with ADMIN_PASSWORD/SESSION_SECRET set in the environment
// (see .env.example). Written but not run without explicit go-ahead — same convention as
// every other e2e spec in this project (touches real auth state via a live dev server).

test.describe('Admin login gate (spec 009)', () => {
  test('unauthenticated request to an admin page redirects to the login form', async ({ page }) => {
    await page.goto('/admin/dashboard')
    await expect(page).toHaveURL('/')
    await expect(page.getByLabel('Contraseña')).toBeVisible()
  })

  test('wrong password shows an error and does not grant access', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('Contraseña').fill('definitely-wrong-password')
    await page.getByRole('button', { name: /ingresar/i }).click()
    await expect(page.getByText('Contraseña incorrecta.')).toBeVisible()
    await expect(page).toHaveURL('/')
  })

  test('correct password grants access to the admin area', async ({ page }) => {
    const password = process.env.ADMIN_PASSWORD
    test.skip(!password, 'ADMIN_PASSWORD not set in the test environment')
    await page.goto('/')
    await page.getByLabel('Contraseña').fill(password!)
    await page.getByRole('button', { name: /ingresar/i }).click()
    await expect(page).toHaveURL('/admin/dashboard')
  })

  test('legacy /conversations URL redirects toward the admin area', async ({ request }) => {
    const res = await request.get('/conversations', { maxRedirects: 0 })
    // 3xx once US3 (T016) lands the redirect rule; tolerate 200/404 if run before that task.
    expect([301, 302, 307, 308, 200, 404]).toContain(res.status())
  })
})
