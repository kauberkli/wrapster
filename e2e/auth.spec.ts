import { expect, test } from '@playwright/test'

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.clear()
    })
  })

  test.describe('Unauthenticated User', () => {
    test('should be able to access public home page', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByText('Home')).toBeVisible()
    })

    test('should be able to access public login page', async ({ page }) => {
      await page.goto('/login')
      await expect(page.getByText('Login')).toBeVisible()
    })

    test('should be redirected when trying to access protected dashboard', async ({ page }) => {
      await page.goto('/dashboard')
      await expect(page).toHaveURL('/login')
      await expect(page.getByText('Login')).toBeVisible()
    })
  })

  test.describe('Authenticated User', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/')
      await page.evaluate(() => {
        localStorage.setItem('token', 'test-token')
      })
    })

    test('should be able to access public home page', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByText('Home')).toBeVisible()
    })

    test('should be able to access public login page', async ({ page }) => {
      await page.goto('/login')
      await expect(page.getByText('Login')).toBeVisible()
    })

    test('should be able to access protected dashboard', async ({ page }) => {
      await page.goto('/dashboard')
      await expect(page.getByText('Dashboard')).toBeVisible()
      await expect(page).toHaveURL('/dashboard')
    })
  })

  test.describe('Token Management', () => {
    test('should lose access to dashboard after token removal', async ({ page }) => {
      await page.goto('/')
      await page.evaluate(() => {
        localStorage.setItem('token', 'test-token')
      })
      await page.goto('/dashboard')
      await expect(page.getByText('Dashboard')).toBeVisible()

      await page.evaluate(() => {
        localStorage.removeItem('token')
      })
      await page.goto('/dashboard')
      await expect(page).toHaveURL('/login')
      await expect(page.getByText('Login')).toBeVisible()
    })

    test('should gain access to dashboard after token is set', async ({ page }) => {
      await page.goto('/dashboard')
      await expect(page).toHaveURL('/login')

      await page.evaluate(() => {
        localStorage.setItem('token', 'test-token')
      })
      await page.goto('/dashboard')
      await expect(page.getByText('Dashboard')).toBeVisible()
    })
  })
})
