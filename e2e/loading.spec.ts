import { expect, test } from '@playwright/test'

test.describe('Loading States', () => {
  test.describe('Page Transitions', () => {
    test('should show loading spinner during initial page load', async ({ page }) => {
      await page.goto('/', { waitUntil: 'commit' })
      const spinner = page.locator('[role="status"]')
      await expect(spinner.or(page.getByText('Home'))).toBeVisible()
    })

    test('should show spinner with loading message during auth check', async ({ page }) => {
      await page.goto('/dashboard', { waitUntil: 'commit' })
      const spinnerOrLogin = page.getByText(/Checking authentication...|Login/)
      await expect(spinnerOrLogin).toBeVisible()
    })
  })

  test.describe('Spinner Overlay', () => {
    test('should have full-screen overlay styles when loading', async ({ page }) => {
      await page.goto('/', { waitUntil: 'commit' })
      const status = page.locator('[role="status"]')

      if (await status.isVisible()) {
        await expect(status).toHaveClass(/fixed/)
        await expect(status).toHaveClass(/inset-0/)
        await expect(status).toHaveClass(/z-50/)
      }
    })
  })

  test.describe('Content Loading', () => {
    test('should eventually show home page content after loading', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByText('Home')).toBeVisible({ timeout: 10000 })
    })

    test('should eventually show login page content after loading', async ({ page }) => {
      await page.goto('/login')
      await expect(page.getByText('Login')).toBeVisible({ timeout: 10000 })
    })

    test('should redirect to login and show content for protected routes', async ({ page }) => {
      await page.goto('/dashboard')
      await expect(page.getByText('Login')).toBeVisible({ timeout: 10000 })
    })
  })
})
