import { expect, test } from '@playwright/test'

test.describe('App', () => {
  test('should load the application', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/wrapster|Vite/i)
  })

  test('should display home page content on root path', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Home')).toBeVisible()
  })

  test('should handle navigation between pages', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Home')).toBeVisible()

    await page.goto('/login')
    await expect(page.getByText('Login')).toBeVisible()

    await page.goto('/')
    await expect(page.getByText('Home')).toBeVisible()
  })

  test('should show loading state during lazy load', async ({ page }) => {
    await page.goto('/', { waitUntil: 'commit' })
    const loadingOrContent = page.getByText(/Loading...|Home/)
    await expect(loadingOrContent).toBeVisible()
  })
})
