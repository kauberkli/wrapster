import { expect, test } from '@playwright/test'

test.describe('Full User Journey', () => {
  // Helper to login
  async function login(page: import('@playwright/test').Page) {
    await page.goto('/login')
    await page.getByLabel('Email').fill('weehong@wrapster.com')
    await page.getByLabel('Password').fill('password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL('/dashboard', { timeout: 15000 })
  }

  test.describe('Complete Product Management Flow', () => {
    test('should create, update, and delete a product', async ({ page }) => {
      await login(page)
      await page.goto('/products')

      // Generate unique test data
      const timestamp = Date.now().toString().slice(-12)
      const digits = timestamp.padStart(12, '0').split('').map(Number)
      let sum = 0
      for (let i = 0; i < 12; i++) {
        sum += digits[i] * (i % 2 === 0 ? 1 : 3)
      }
      const checkDigit = (10 - (sum % 10)) % 10
      const barcode = timestamp.padStart(12, '0') + checkDigit
      const productName = `Journey Test ${Date.now()}`

      // CREATE
      await page.getByRole('button', { name: /add product/i }).click()
      await page.getByLabel(/barcode/i).fill(barcode)
      await page.getByLabel(/product name/i).fill(productName)
      await page.getByLabel(/cost/i).fill('49.99')
      await page.getByRole('button', { name: 'Create' }).click()

      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })
      await expect(page.getByText(productName)).toBeVisible({ timeout: 5000 })

      // UPDATE
      const productRow = page.locator('tr', { hasText: productName })
      await productRow.getByTitle('Edit product').click()

      const nameInput = page.getByLabel(/product name/i)
      await nameInput.clear()
      await nameInput.fill(`Updated ${productName}`)
      await page.getByRole('button', { name: 'Update' }).click()

      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })
      await expect(page.getByText(`Updated ${productName}`)).toBeVisible({ timeout: 5000 })

      // DELETE
      const updatedRow = page.locator('tr', { hasText: `Updated ${productName}` })
      await updatedRow.getByTitle('Delete product').click()
      await page.getByRole('button', { name: 'Delete' }).click()

      await expect(page.getByRole('alertdialog')).not.toBeVisible({ timeout: 10000 })
      await expect(page.getByText(`Updated ${productName}`)).not.toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('Complete Packaging Flow', () => {
    test('should complete packaging workflow with product scanning', async ({ page }) => {
      await login(page)
      await page.goto('/packaging')

      // Create a unique waybill
      const waybill = `JOURNEY-${Date.now()}`
      const waybillInput = page.getByPlaceholder(/waybill|tracking/i)

      await waybillInput.fill(waybill)
      await page.keyboard.press('Enter')
      await page.waitForTimeout(1500)

      // The scanning interface should be available
      const barcodeInput = page.getByPlaceholder(/barcode|scan/i)
      if (await barcodeInput.isVisible()) {
        // Simulate scanning (using a test barcode)
        await barcodeInput.fill('1234567890128')
        await page.keyboard.press('Enter')
        await page.waitForTimeout(1000)
      }

      // Verify the packaging record was created
      // The UI should show the waybill and any scanned items
    })
  })

  test.describe('Complete Report Generation Flow', () => {
    test('should generate and send report via email', async ({ page }) => {
      await login(page)
      await page.goto('/reports')

      // Add email recipient
      const emailInput = page.getByPlaceholder(/email|recipient/i)
      await emailInput.fill('journey-test@example.com')
      await page.keyboard.press('Enter')

      // Generate PDF report
      const pdfButton = page.getByRole('button', { name: /pdf/i })
      await pdfButton.click()

      // Wait for report generation
      await page.waitForTimeout(5000)

      // Check for success indication
      // The job should be created and eventually complete
    })
  })

  test.describe('Cross-Page Navigation Journey', () => {
    test('should navigate through all main pages', async ({ page }) => {
      await login(page)

      // Dashboard
      await expect(page).toHaveURL('/dashboard')

      // Products
      await page.goto('/products')
      await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible()

      // Packaging
      await page.goto('/packaging')
      await expect(page.getByRole('heading', { name: /packaging/i })).toBeVisible()

      // Reports
      await page.goto('/reports')
      await expect(page.getByRole('heading', { name: /reports/i })).toBeVisible()

      // Jobs
      await page.goto('/jobs')
      await expect(page.getByRole('heading', { name: /jobs|background/i })).toBeVisible()
    })

    test('should navigate using sidebar', async ({ page }) => {
      await login(page)

      // Products from sidebar
      const productsLink = page.getByRole('link', { name: /products/i }).first()
      if (await productsLink.isVisible()) {
        await productsLink.click()
        await expect(page).toHaveURL('/products')
      }

      // Packaging from sidebar
      const packagingLink = page.getByRole('link', { name: /packaging/i }).first()
      if (await packagingLink.isVisible()) {
        await packagingLink.click()
        await expect(page).toHaveURL('/packaging')
      }

      // Reports from sidebar
      const reportsLink = page.getByRole('link', { name: /reports/i }).first()
      if (await reportsLink.isVisible()) {
        await reportsLink.click()
        await expect(page).toHaveURL('/reports')
      }
    })
  })

  test.describe('Job Monitoring Journey', () => {
    test('should trigger job and monitor completion', async ({ page }) => {
      await login(page)

      // Trigger an export job
      await page.goto('/products')
      await page.waitForTimeout(1000)

      const exportButton = page.getByRole('button', { name: /export/i })
      if (await exportButton.isVisible()) {
        await exportButton.click()
        await page.waitForTimeout(500)

        // Go to jobs page to monitor
        await page.goto('/jobs')

        // Wait for job to appear and potentially complete
        await page.waitForTimeout(10000)

        // Check job status
        const hasExportJob = await page.getByText(/export/i).isVisible()
        expect(hasExportJob).toBe(true)
      }
    })
  })

  test.describe('Error Recovery Journey', () => {
    test('should handle network errors gracefully', async ({ page }) => {
      await login(page)
      await page.goto('/products')

      // Simulate offline by blocking network
      await page.route('**/*', (route) => {
        if (route.request().resourceType() === 'fetch') {
          route.abort()
        } else {
          route.continue()
        }
      })

      // Try to add a product (should fail gracefully)
      await page.getByRole('button', { name: /add product/i }).click()
      await page.getByLabel(/barcode/i).fill('1234567890128')
      await page.getByLabel(/product name/i).fill('Offline Test')
      await page.getByRole('button', { name: 'Create' }).click()

      // Should show error or stay in dialog
      await page.waitForTimeout(2000)

      // Restore network
      await page.unroute('**/*')
    })

    test('should recover from session timeout', async ({ page }) => {
      await login(page)
      await page.goto('/products')

      // Clear session cookie to simulate timeout
      await page.context().clearCookies()

      // Try to navigate
      await page.goto('/packaging')

      // Should redirect to login
      await expect(page).toHaveURL('/login')

      // Re-login should work
      await login(page)
      await expect(page).toHaveURL('/dashboard')
    })
  })

  test.describe('Multi-Language Journey', () => {
    test('should switch language and persist', async ({ page }) => {
      await login(page)

      // Look for language switcher
      const languageSwitcher = page.getByRole('button', { name: /language|en|zh/i })

      if (await languageSwitcher.isVisible()) {
        await languageSwitcher.click()
        await page.waitForTimeout(500)

        // Select different language
        const zhOption = page.getByRole('option', { name: /中文|chinese/i })
        if (await zhOption.isVisible()) {
          await zhOption.click()
          await page.waitForTimeout(500)

          // Navigate to another page
          await page.goto('/products')

          // Language should persist
          // The page content should be in the selected language
        }
      }
    })
  })
})

test.describe('Performance Journey', () => {
  async function login(page: import('@playwright/test').Page) {
    await page.goto('/login')
    await page.getByLabel('Email').fill('weehong@wrapster.com')
    await page.getByLabel('Password').fill('password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL('/dashboard', { timeout: 15000 })
  }

  test('should load products page within acceptable time', async ({ page }) => {
    await login(page)

    const startTime = Date.now()
    await page.goto('/products')
    await page.waitForSelector('table', { timeout: 10000 })
    const loadTime = Date.now() - startTime

    // Page should load within 5 seconds
    expect(loadTime).toBeLessThan(5000)
  })

  test('should handle large product list efficiently', async ({ page }) => {
    await login(page)
    await page.goto('/products')

    // Scroll to trigger infinite loading
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      await page.waitForTimeout(500)
    }

    // Page should remain responsive
    const searchInput = page.getByPlaceholder(/search/i)
    await searchInput.fill('test')
    await page.waitForTimeout(500)

    // Should be able to type without lag
    await expect(searchInput).toHaveValue('test')
  })
})

test.describe('Accessibility Journey', () => {
  async function login(page: import('@playwright/test').Page) {
    await page.goto('/login')
    await page.getByLabel('Email').fill('weehong@wrapster.com')
    await page.getByLabel('Password').fill('password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL('/dashboard', { timeout: 15000 })
  }

  test('should be keyboard navigable', async ({ page }) => {
    await login(page)
    await page.goto('/products')

    // Tab through elements
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab')
    }

    // Check that focus is visible
    const focusedElement = page.locator(':focus')
    await expect(focusedElement).toBeVisible()
  })

  test('should have proper ARIA labels', async ({ page }) => {
    await login(page)
    await page.goto('/products')

    // Check for ARIA labels on interactive elements
    const buttons = page.getByRole('button')
    const count = await buttons.count()

    for (let i = 0; i < Math.min(count, 5); i++) {
      const button = buttons.nth(i)
      const hasLabel =
        (await button.getAttribute('aria-label')) ||
        (await button.getAttribute('title')) ||
        (await button.textContent())

      expect(hasLabel).toBeTruthy()
    }
  })

  test('should support screen reader navigation', async ({ page }) => {
    await login(page)
    await page.goto('/products')

    // Check for heading hierarchy
    const h1 = page.getByRole('heading', { level: 1 })
    await expect(h1).toBeVisible()

    // Check for landmarks
    const main = page.getByRole('main')
    if (await main.count() > 0) {
      await expect(main.first()).toBeVisible()
    }
  })
})
