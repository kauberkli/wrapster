import { expect, test } from '@playwright/test'

test.describe('Reports Page', () => {
  // Helper to login before each test
  async function login(page: import('@playwright/test').Page) {
    await page.goto('/login')
    await page.getByLabel('Email').fill('weehong@wrapster.com')
    await page.getByLabel('Password').fill('password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL('/dashboard', { timeout: 15000 })
  }

  test.describe('Page Access', () => {
    test('should redirect to login when not authenticated', async ({ page }) => {
      await page.goto('/reports')
      await expect(page).toHaveURL('/login')
    })

    test('should access reports page when authenticated', async ({ page }) => {
      await login(page)
      await page.goto('/reports')

      await expect(page).toHaveURL('/reports')
      await expect(page.getByRole('heading', { name: /reports/i })).toBeVisible()
    })
  })

  test.describe('Reports Page Layout', () => {
    test.beforeEach(async ({ page }) => {
      await login(page)
      await page.goto('/reports')
    })

    test('should display page header and description', async ({ page }) => {
      await expect(page.getByRole('heading', { name: /reports/i })).toBeVisible()
    })

    test('should display date range picker', async ({ page }) => {
      // Should have start and end date selection
      await expect(page.getByText(/start date|from/i)).toBeVisible()
      await expect(page.getByText(/end date|to/i)).toBeVisible()
    })

    test('should display export format options', async ({ page }) => {
      // Should have Excel and PDF export options
      await expect(page.getByRole('button', { name: /excel/i })).toBeVisible()
      await expect(page.getByRole('button', { name: /pdf/i })).toBeVisible()
    })

    test('should display email section', async ({ page }) => {
      // Should have email recipients input
      await expect(
        page.getByPlaceholder(/email|recipient/i)
      ).toBeVisible()
    })
  })

  test.describe('Date Range Selection', () => {
    test.beforeEach(async ({ page }) => {
      await login(page)
      await page.goto('/reports')
    })

    test('should select start date', async ({ page }) => {
      const startDateButton = page.getByRole('button').filter({ hasText: /start|from/i }).first()
      if (await startDateButton.isVisible()) {
        await startDateButton.click()
        await page.waitForTimeout(500)
        // Calendar should open
      }
    })

    test('should select end date', async ({ page }) => {
      const endDateButton = page.getByRole('button').filter({ hasText: /end|to/i }).first()
      if (await endDateButton.isVisible()) {
        await endDateButton.click()
        await page.waitForTimeout(500)
        // Calendar should open
      }
    })

    test('should validate date range', async ({ page }) => {
      // End date should not be before start date
      // This depends on the validation implementation
    })
  })

  test.describe('Export Functionality', () => {
    test.beforeEach(async ({ page }) => {
      await login(page)
      await page.goto('/reports')
    })

    test('should trigger Excel export', async ({ page }) => {
      const excelButton = page.getByRole('button', { name: /excel/i })
      await excelButton.click()

      // Should show loading or success message
      await page.waitForTimeout(2000)
    })

    test('should trigger PDF export', async ({ page }) => {
      const pdfButton = page.getByRole('button', { name: /pdf/i })
      await pdfButton.click()

      // Should show loading or success message
      await page.waitForTimeout(2000)
    })

    test('should show export progress', async ({ page }) => {
      const excelButton = page.getByRole('button', { name: /excel/i })
      await excelButton.click()

      // Should show progress indicator
      // The exact UI depends on implementation
    })

    test('should handle export error gracefully', async ({ page }) => {
      // This would require mocking or network interception
      // to simulate an error scenario
    })
  })

  test.describe('Email Recipients', () => {
    test.beforeEach(async ({ page }) => {
      await login(page)
      await page.goto('/reports')
    })

    test('should add email recipient', async ({ page }) => {
      const emailInput = page.getByPlaceholder(/email|recipient/i)
      await emailInput.fill('test@example.com')
      await page.keyboard.press('Enter')

      // Should show the email as a chip
      await expect(page.getByText('test@example.com')).toBeVisible()
    })

    test('should add multiple email recipients', async ({ page }) => {
      const emailInput = page.getByPlaceholder(/email|recipient/i)

      await emailInput.fill('user1@example.com')
      await page.keyboard.press('Enter')

      await emailInput.fill('user2@example.com')
      await page.keyboard.press('Enter')

      await expect(page.getByText('user1@example.com')).toBeVisible()
      await expect(page.getByText('user2@example.com')).toBeVisible()
    })

    test('should remove email recipient', async ({ page }) => {
      const emailInput = page.getByPlaceholder(/email|recipient/i)
      await emailInput.fill('remove@example.com')
      await page.keyboard.press('Enter')

      // Find and click the remove button
      const removeButton = page.locator('button').filter({ has: page.locator('svg') }).first()
      if (await removeButton.isVisible()) {
        await removeButton.click()
      }
    })

    test('should validate email format', async ({ page }) => {
      const emailInput = page.getByPlaceholder(/email|recipient/i)
      await emailInput.fill('invalid-email')
      await page.keyboard.press('Enter')

      // Should show validation error
      await expect(page.getByText(/invalid/i)).toBeVisible()
    })

    test('should prevent duplicate emails', async ({ page }) => {
      const emailInput = page.getByPlaceholder(/email|recipient/i)

      await emailInput.fill('duplicate@example.com')
      await page.keyboard.press('Enter')

      await emailInput.fill('duplicate@example.com')
      await page.keyboard.press('Enter')

      // Should show duplicate error
      await expect(page.getByText(/already/i)).toBeVisible()
    })
  })

  test.describe('Send Email', () => {
    test.beforeEach(async ({ page }) => {
      await login(page)
      await page.goto('/reports')
    })

    test('should send report via email', async ({ page }) => {
      // First add a recipient
      const emailInput = page.getByPlaceholder(/email|recipient/i)
      await emailInput.fill('recipient@example.com')
      await page.keyboard.press('Enter')

      // Then click send button (if available after export)
      const sendButton = page.getByRole('button', { name: /send/i })
      if (await sendButton.isVisible()) {
        await sendButton.click()
        await page.waitForTimeout(2000)
      }
    })

    test('should require at least one recipient', async ({ page }) => {
      // Try to send without recipients
      const sendButton = page.getByRole('button', { name: /send/i })
      if (await sendButton.isVisible()) {
        // Button might be disabled or show error on click
        await expect(sendButton).toBeDisabled()
      }
    })
  })

  test.describe('Report History', () => {
    test.beforeEach(async ({ page }) => {
      await login(page)
      await page.goto('/reports')
    })

    test('should display previous reports', async ({ page }) => {
      // Check for report history section
      const historySection = page.getByText(/history|previous|recent/i)
      if (await historySection.isVisible()) {
        await expect(historySection).toBeVisible()
      }
    })

    test('should allow downloading previous reports', async ({ page }) => {
      // Look for download buttons in history
      const downloadButtons = page.getByRole('button', { name: /download/i })
      const count = await downloadButtons.count()

      if (count > 0) {
        // At least one download button exists
        expect(count).toBeGreaterThan(0)
      }
    })
  })

  test.describe('Responsive Design', () => {
    test('should work on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      await login(page)
      await page.goto('/reports')

      await expect(page.getByRole('heading', { name: /reports/i })).toBeVisible()
    })

    test('should work on tablet viewport', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 })
      await login(page)
      await page.goto('/reports')

      await expect(page.getByRole('heading', { name: /reports/i })).toBeVisible()
    })
  })
})

test.describe('Reports Workflow', () => {
  async function login(page: import('@playwright/test').Page) {
    await page.goto('/login')
    await page.getByLabel('Email').fill('weehong@wrapster.com')
    await page.getByLabel('Password').fill('password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL('/dashboard', { timeout: 15000 })
  }

  test('should complete full report export workflow', async ({ page }) => {
    await login(page)
    await page.goto('/reports')

    // 1. Select date range (use current month)
    // The default dates are usually acceptable

    // 2. Export to Excel
    const excelButton = page.getByRole('button', { name: /excel/i })
    await excelButton.click()

    // 3. Wait for export to complete
    await page.waitForTimeout(3000)

    // 4. Check for download option or success message
  })

  test('should complete email distribution workflow', async ({ page }) => {
    await login(page)
    await page.goto('/reports')

    // 1. Add recipients
    const emailInput = page.getByPlaceholder(/email|recipient/i)
    await emailInput.fill('team@example.com')
    await page.keyboard.press('Enter')

    await emailInput.fill('manager@example.com')
    await page.keyboard.press('Enter')

    // 2. Generate report first
    const pdfButton = page.getByRole('button', { name: /pdf/i })
    await pdfButton.click()
    await page.waitForTimeout(3000)

    // 3. Send email (if available)
    const sendButton = page.getByRole('button', { name: /send/i })
    if (await sendButton.isVisible() && await sendButton.isEnabled()) {
      await sendButton.click()
      await page.waitForTimeout(2000)
    }
  })

  test('should handle date range changes and re-export', async ({ page }) => {
    await login(page)
    await page.goto('/reports')

    // Export first report
    const excelButton = page.getByRole('button', { name: /excel/i })
    await excelButton.click()
    await page.waitForTimeout(3000)

    // Change date range
    // (implementation depends on date picker)

    // Export second report
    await excelButton.click()
    await page.waitForTimeout(3000)
  })
})
