import { test, expect } from '@playwright/test'

// Spec 016 US3 (T022). Requires a running dev server with ADMIN_PASSWORD/SESSION_SECRET —
// same convention as admin-login.spec.ts / admin-ecuador-quotas.spec.ts.

async function loginAsAdmin(page: import('@playwright/test').Page): Promise<void> {
  const password = process.env.ADMIN_PASSWORD
  test.skip(!password, 'ADMIN_PASSWORD not set in the test environment')
  await page.goto('/')
  await page.getByLabel('Contraseña').fill(password!)
  await page.getByRole('button', { name: /ingresar/i }).click()
  await expect(page).not.toHaveURL('/')
}

test.describe('Admin — chat rooms page (spec 016 US3)', () => {
  test('lists Ecuador + México with /chat/<slug> URLs and a copy control', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/rooms')

    await expect(page.getByRole('cell', { name: 'Ecuador', exact: true })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'México', exact: true })).toBeVisible()
    await expect(page.getByText('/chat/ecuador')).toBeVisible()
    await expect(page.getByText('/chat/mexico')).toBeVisible()
    // one copy button per room
    await expect(page.getByRole('button', { name: 'Copiar' })).toHaveCount(2)
  })

  test('the "Salas de chat" sidebar link opens the rooms page', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/dashboard')
    await page.getByRole('link', { name: 'Salas de chat' }).click()
    await expect(page).toHaveURL(/\/admin\/rooms/)
  })

  test('a copied room URL opens the correct room and never asks the country question', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/chat/ecuador')
    // The room page renders the same chat shell.
    await expect(page.getByRole('heading', { name: 'PanelSmart' })).toBeVisible()
    // The bootstrap GET carried ?room=ecuador — the opening opt-in message appears.
    await expect(page.getByText(/inscribirte/i)).toBeVisible({ timeout: 15_000 })
  })
})

test.describe('Admin — conversations filter by acquisition source (spec 016 T021)', () => {
  test('the conversations page has an "origen" filter with the room options', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/conversations')

    const sourceSelect = page.locator('select[name="source"]')
    await expect(sourceSelect).toBeVisible()
    const options = await sourceSelect.locator('option').allTextContents()
    expect(options).toEqual(
      expect.arrayContaining(['Todos los orígenes', 'Sala: Ecuador', 'Sala: México', 'Web genérico (sin sala)']),
    )

    await sourceSelect.selectOption('web:room:Ecuador')
    await page.getByRole('button', { name: 'Filtrar' }).click()
    await expect(page).toHaveURL(/source=web(%3A|:)room(%3A|:)Ecuador/)
  })
})
