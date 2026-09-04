import { test, expect } from '@playwright/test'

// Spec 014 US5 (T043) — Independent Test: "In /admin/quotas select Ecuador → Ecuador
// regions + NSE levels offered; create a target + cap; /admin/leads filters by Ecuador
// and its regions." ("/admin/leads" in the spec text is this repo's /admin/dashboard —
// there is no separate /admin/leads route.)
//
// Requires a running dev server with ADMIN_PASSWORD/SESSION_SECRET set — same convention
// as admin-login.spec.ts.

async function loginAsAdmin(page: import('@playwright/test').Page): Promise<void> {
  const password = process.env.ADMIN_PASSWORD
  test.skip(!password, 'ADMIN_PASSWORD not set in the test environment')
  await page.goto('/')
  await page.getByLabel('Contraseña').fill(password!)
  await page.getByRole('button', { name: /ingresar/i }).click()
  await expect(page).not.toHaveURL('/')
}

test.describe('Admin quota screen — Ecuador (spec 014 US5)', () => {
  test('selecting Ecuador offers the 12 Ecuador regions and the AB/C/D-E NSE levels, and creates a target', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/quotas')

    // The "new quota target" row's country/region/dimension selects (new-quota-target-row.tsx).
    const newRow = page.locator('tbody tr').first()
    await newRow.locator('select').nth(0).selectOption('Ecuador')

    const regionSelect = newRow.locator('select').nth(1)
    const regionOptions = await regionSelect.locator('option').allTextContents()
    // The 12 known Ecuador NSE regions (ECUADOR_REGIONS, ecuador-nse-catalog.ts) plus the
    // placeholder "Región…" option.
    expect(regionOptions.filter((o) => o !== 'Región…').length).toBe(12)
    expect(regionOptions).toContain('Cuenca')
    expect(regionOptions).toContain('Guayaquil Norte')
    // No CAM region name should leak into Ecuador's list.
    expect(regionOptions).not.toContain('Centro I')

    await regionSelect.selectOption('Cuenca')
    await newRow.locator('select').nth(2).selectOption('nse')

    const valueSelect = newRow.locator('select').nth(3)
    const valueOptions = await valueSelect.locator('option').allTextContents()
    expect(valueOptions.filter((o) => o !== 'Valor…')).toEqual(['AB', 'C', 'D/E'])
    // No CAM "Nivel N" value should leak into Ecuador's NSE dimension options.
    expect(valueOptions.some((o) => o.startsWith('Nivel'))).toBe(false)

    await valueSelect.selectOption('AB')
    await newRow.locator('input[type="number"]').fill('15')
    await newRow.getByRole('button', { name: 'Agregar' }).click()

    // The new row appears in the table once created.
    await expect(page.getByRole('cell', { name: 'Ecuador', exact: true }).first()).toBeVisible()
  })

  test('creating a region cap for Ecuador offers the Ecuador region list', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/quotas')

    const capSection = page.locator('#region-caps')
    await expect(capSection).toBeVisible()

    const newCapRow = capSection.locator('tbody tr').last()
    await newCapRow.locator('select').nth(0).selectOption('Ecuador')
    const regionOptions = await newCapRow.locator('select').nth(1).locator('option').allTextContents()
    expect(regionOptions).toContain('Guayaquil Sur')
  })
})

test.describe('Admin dashboard — filter by Ecuador (spec 014 US5)', () => {
  test('the country filter offers Ecuador, and selecting it offers Ecuador regions', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/dashboard')

    const filtersForm = page.locator('form').first()
    const countryOptions = await filtersForm.locator('select').nth(0).locator('option').allTextContents()
    expect(countryOptions).toContain('Ecuador')

    await filtersForm.locator('select').nth(0).selectOption('Ecuador')
    await expect(page).toHaveURL(/country=Ecuador/)

    const regionOptions = await filtersForm.locator('select').nth(1).locator('option').allTextContents()
    expect(regionOptions).toContain('Quito Norte')
  })
})
