import { expect, test } from '@playwright/test'

test.describe('Login', () => {
  test.beforeEach(async ({ page }) => {
    // Clear any existing session
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.context().clearCookies()
  })

  test('should display login page', async ({ page }) => {
    await page.goto('/login')

    await expect(page.getByText('Login')).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  })

  test('should show error with invalid credentials', async ({ page }) => {
    await page.goto('/login')

    await page.getByLabel('Email').fill('invalid@example.com')
    await page.getByLabel('Password').fill('wrongpassword')
    await page.getByRole('button', { name: 'Sign in' }).click()

    // Wait for error message container to appear
    await expect(page.locator('.bg-destructive\\/15')).toBeVisible({
      timeout: 10000,
    })
  })

  test('should login successfully and redirect to dashboard', async ({
    page,
  }) => {
    await page.goto('/login')

    await page.getByLabel('Email').fill('weehong@wrapster.com')
    await page.getByLabel('Password').fill('password')
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page).toHaveURL('/dashboard', { timeout: 15000 })
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  })

  test('should redirect to login when accessing protected route', async ({
    page,
  }) => {
    await page.goto('/dashboard')

    await expect(page).toHaveURL('/login')
  })
})
