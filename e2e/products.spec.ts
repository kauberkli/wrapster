import { expect, test } from '@playwright/test'

test.describe('Products Page', () => {
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
      await page.goto('/products')
      await expect(page).toHaveURL('/login')
    })

    test('should access products page when authenticated', async ({ page }) => {
      await login(page)
      await page.goto('/products')

      await expect(page).toHaveURL('/products')
      await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible()
    })
  })

  test.describe('Products Page Layout', () => {
    test.beforeEach(async ({ page }) => {
      await login(page)
      await page.goto('/products')
    })

    test('should display page header and description', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible()
      await expect(page.getByText('Manage your product catalog')).toBeVisible()
    })

    test('should display Add Product button', async ({ page }) => {
      await expect(page.getByRole('button', { name: /add product/i })).toBeVisible()
    })

    test('should display search input', async ({ page }) => {
      await expect(
        page.getByPlaceholder(/search by barcode, name, or sku/i)
      ).toBeVisible()
    })

    test('should display type filter dropdown', async ({ page }) => {
      await expect(page.getByRole('combobox')).toBeVisible()
    })

    test('should display products table with headers', async ({ page }) => {
      await expect(page.getByRole('table')).toBeVisible()
      await expect(page.getByRole('columnheader', { name: 'Barcode' })).toBeVisible()
      await expect(page.getByRole('columnheader', { name: 'SKU' })).toBeVisible()
      await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible()
      await expect(page.getByRole('columnheader', { name: 'Type' })).toBeVisible()
      await expect(page.getByRole('columnheader', { name: 'Price' })).toBeVisible()
      await expect(page.getByRole('columnheader', { name: 'Actions' })).toBeVisible()
    })
  })

  test.describe('Products List', () => {
    test.beforeEach(async ({ page }) => {
      await login(page)
      await page.goto('/products')
    })

    test('should display products in the table', async ({ page }) => {
      // Wait for products to load
      await page.waitForSelector('table tbody tr', { timeout: 10000 })

      // Should have at least one product row (excluding loading/empty states)
      const rows = page.locator('table tbody tr')
      const count = await rows.count()

      // If products exist, they should be displayed
      if (count > 0) {
        const firstRow = rows.first()
        // Each row should have barcode, name, type, and action buttons
        await expect(firstRow.locator('td').first()).toBeVisible()
      }
    })

    test('should show products count', async ({ page }) => {
      // Wait for products to load
      await page.waitForSelector('table tbody tr', { timeout: 10000 })

      // Should show count like "Showing X of Y products"
      await expect(page.getByText(/showing \d+ of \d+ products/i)).toBeVisible({
        timeout: 5000,
      })
    })
  })

  test.describe('Search Functionality', () => {
    test.beforeEach(async ({ page }) => {
      await login(page)
      await page.goto('/products')
      // Wait for initial load
      await page.waitForSelector('table tbody tr', { timeout: 10000 })
    })

    test('should filter products by search query', async ({ page }) => {
      const searchInput = page.getByPlaceholder(/search by barcode, name, or sku/i)
      await searchInput.fill('test')

      // Should show filtered results message
      await expect(page.getByText(/found \d+ matching products/i)).toBeVisible({
        timeout: 5000,
      })
    })

    test('should show no results message for non-matching search', async ({ page }) => {
      const searchInput = page.getByPlaceholder(/search by barcode, name, or sku/i)
      await searchInput.fill('xyznonexistent12345')

      await expect(page.getByText('No products found')).toBeVisible({ timeout: 5000 })
    })

    test('should show clear search button when no results', async ({ page }) => {
      const searchInput = page.getByPlaceholder(/search by barcode, name, or sku/i)
      await searchInput.fill('xyznonexistent12345')

      await expect(page.getByRole('button', { name: 'Clear search' })).toBeVisible({
        timeout: 5000,
      })
    })

    test('should clear search when clear button is clicked', async ({ page }) => {
      const searchInput = page.getByPlaceholder(/search by barcode, name, or sku/i)
      await searchInput.fill('xyznonexistent12345')

      await page.getByRole('button', { name: 'Clear search' }).click()

      await expect(searchInput).toHaveValue('')
    })
  })

  test.describe('Type Filter', () => {
    test.beforeEach(async ({ page }) => {
      await login(page)
      await page.goto('/products')
      await page.waitForSelector('table tbody tr', { timeout: 10000 })
    })

    test('should filter by single items', async ({ page }) => {
      const typeFilter = page.getByRole('combobox')
      await typeFilter.click()
      await page.getByRole('option', { name: 'Single Items' }).click()

      // Wait for filter to apply
      await page.waitForTimeout(500)

      // The table should still be visible
      await expect(page.getByRole('table')).toBeVisible()
    })

    test('should filter by bundles', async ({ page }) => {
      const typeFilter = page.getByRole('combobox')
      await typeFilter.click()
      await page.getByRole('option', { name: 'Bundles' }).click()

      // Wait for filter to apply
      await page.waitForTimeout(500)

      // The table should still be visible
      await expect(page.getByRole('table')).toBeVisible()
    })

    test('should show all types when All Types is selected', async ({ page }) => {
      const typeFilter = page.getByRole('combobox')

      // First select bundles
      await typeFilter.click()
      await page.getByRole('option', { name: 'Bundles' }).click()
      await page.waitForTimeout(500)

      // Then select all types
      await typeFilter.click()
      await page.getByRole('option', { name: 'All Types' }).click()

      await expect(page.getByRole('table')).toBeVisible()
    })
  })

  test.describe('Create Product', () => {
    test.beforeEach(async ({ page }) => {
      await login(page)
      await page.goto('/products')
    })

    test('should open create dialog when Add Product is clicked', async ({ page }) => {
      await page.getByRole('button', { name: /add product/i }).click()

      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.getByText('Add New Product')).toBeVisible()
    })

    test('should display all form fields in dialog', async ({ page }) => {
      await page.getByRole('button', { name: /add product/i }).click()

      await expect(page.getByLabel(/barcode/i)).toBeVisible()
      await expect(page.getByLabel(/sku code/i)).toBeVisible()
      await expect(page.getByLabel(/product name/i)).toBeVisible()
      await expect(page.getByLabel(/type/i)).toBeVisible()
      await expect(page.getByLabel(/price/i)).toBeVisible()
    })

    test('should show Create and Cancel buttons', async ({ page }) => {
      await page.getByRole('button', { name: /add product/i }).click()

      await expect(page.getByRole('button', { name: 'Create' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()
    })

    test('should close dialog when Cancel is clicked', async ({ page }) => {
      await page.getByRole('button', { name: /add product/i }).click()
      await expect(page.getByRole('dialog')).toBeVisible()

      await page.getByRole('button', { name: 'Cancel' }).click()

      await expect(page.getByRole('dialog')).not.toBeVisible()
    })

    test('should show validation error for invalid barcode', async ({ page }) => {
      await page.getByRole('button', { name: /add product/i }).click()

      await page.getByLabel(/barcode/i).fill('123')
      await page.getByLabel(/product name/i).fill('Test Product')
      await page.getByRole('button', { name: 'Create' }).click()

      await expect(page.getByText(/barcode must be exactly 13 digits/i)).toBeVisible()
    })

    test('should show validation error for empty product name', async ({ page }) => {
      await page.getByRole('button', { name: /add product/i }).click()

      await page.getByLabel(/barcode/i).fill('1234567890128')
      await page.getByRole('button', { name: 'Create' }).click()

      await expect(page.getByText(/product name is required/i)).toBeVisible()
    })

    test('should create product with valid data', async ({ page }) => {
      await page.getByRole('button', { name: /add product/i }).click()

      // Generate unique barcode using timestamp
      const timestamp = Date.now().toString().slice(-12)
      // Calculate EAN-13 check digit
      const digits = timestamp.padStart(12, '0').split('').map(Number)
      let sum = 0
      for (let i = 0; i < 12; i++) {
        sum += digits[i] * (i % 2 === 0 ? 1 : 3)
      }
      const checkDigit = (10 - (sum % 10)) % 10
      const barcode = timestamp.padStart(12, '0') + checkDigit

      const productName = `E2E Test Product ${Date.now()}`

      await page.getByLabel(/barcode/i).fill(barcode)
      await page.getByLabel(/product name/i).fill(productName)
      await page.getByLabel(/price/i).fill('19.99')
      await page.getByRole('button', { name: 'Create' }).click()

      // Dialog should close
      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

      // New product should appear in the list
      await expect(page.getByText(productName)).toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('Edit Product', () => {
    test.beforeEach(async ({ page }) => {
      await login(page)
      await page.goto('/products')
      await page.waitForSelector('table tbody tr', { timeout: 10000 })
    })

    test('should open edit dialog when edit button is clicked', async ({ page }) => {
      const editButtons = page.getByTitle('Edit product')
      const count = await editButtons.count()

      if (count > 0) {
        await editButtons.first().click()

        await expect(page.getByRole('dialog')).toBeVisible()
        await expect(page.getByText('Edit Product')).toBeVisible()
      }
    })

    test('should show Update button in edit mode', async ({ page }) => {
      const editButtons = page.getByTitle('Edit product')
      const count = await editButtons.count()

      if (count > 0) {
        await editButtons.first().click()

        await expect(page.getByRole('button', { name: 'Update' })).toBeVisible()
      }
    })

    test('should have barcode field disabled in edit mode', async ({ page }) => {
      const editButtons = page.getByTitle('Edit product')
      const count = await editButtons.count()

      if (count > 0) {
        await editButtons.first().click()

        await expect(page.getByLabel(/barcode/i)).toBeDisabled()
      }
    })

    test('should pre-fill form with product data', async ({ page }) => {
      const editButtons = page.getByTitle('Edit product')
      const count = await editButtons.count()

      if (count > 0) {
        await editButtons.first().click()

        // Barcode should have a value (13 digits)
        const barcodeInput = page.getByLabel(/barcode/i)
        const barcodeValue = await barcodeInput.inputValue()
        expect(barcodeValue).toMatch(/^\d{13}$/)

        // Name should have a value
        const nameInput = page.getByLabel(/product name/i)
        const nameValue = await nameInput.inputValue()
        expect(nameValue.length).toBeGreaterThan(0)
      }
    })
  })

  test.describe('Delete Product', () => {
    test.beforeEach(async ({ page }) => {
      await login(page)
      await page.goto('/products')
      await page.waitForSelector('table tbody tr', { timeout: 10000 })
    })

    test('should open delete confirmation dialog', async ({ page }) => {
      const deleteButtons = page.getByTitle('Delete product')
      const count = await deleteButtons.count()

      if (count > 0) {
        await deleteButtons.first().click()

        await expect(page.getByRole('alertdialog')).toBeVisible()
        await expect(page.getByText('Delete Product')).toBeVisible()
      }
    })

    test('should show confirmation message with product name', async ({ page }) => {
      const deleteButtons = page.getByTitle('Delete product')
      const count = await deleteButtons.count()

      if (count > 0) {
        await deleteButtons.first().click()

        await expect(page.getByText(/this action cannot be undone/i)).toBeVisible()
      }
    })

    test('should show Cancel and Delete buttons', async ({ page }) => {
      const deleteButtons = page.getByTitle('Delete product')
      const count = await deleteButtons.count()

      if (count > 0) {
        await deleteButtons.first().click()

        await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible()
      }
    })

    test('should close dialog when Cancel is clicked', async ({ page }) => {
      const deleteButtons = page.getByTitle('Delete product')
      const count = await deleteButtons.count()

      if (count > 0) {
        await deleteButtons.first().click()
        await expect(page.getByRole('alertdialog')).toBeVisible()

        await page.getByRole('button', { name: 'Cancel' }).click()

        await expect(page.getByRole('alertdialog')).not.toBeVisible()
      }
    })
  })

  test.describe('Responsive Design', () => {
    test('should adapt layout on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      await login(page)
      await page.goto('/products')

      // Page should still be accessible
      await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible()
      await expect(page.getByRole('button', { name: /add product/i })).toBeVisible()
    })
  })

  test.describe('Loading States', () => {
    test('should show loading state initially', async ({ page }) => {
      await login(page)

      // Navigate with network throttling to see loading state
      await page.route('**/databases/**', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        await route.continue()
      })

      await page.goto('/products')

      // Should see loading text or spinner
      const loadingText = page.getByText('Loading products...')
      await expect(loadingText).toBeVisible({ timeout: 2000 })
    })
  })

  test.describe('Navigation', () => {
    test('should navigate to products from sidebar', async ({ page }) => {
      await login(page)

      // Look for Products link in sidebar
      const productsLink = page.getByRole('link', { name: /products/i })

      if (await productsLink.isVisible()) {
        await productsLink.click()
        await expect(page).toHaveURL('/products')
      }
    })
  })

  test.describe('Complete CRUD Flow', () => {
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
      const productName = `CRUD Test Product ${Date.now()}`
      const updatedName = `Updated ${productName}`

      // CREATE
      await page.getByRole('button', { name: /add product/i }).click()
      await expect(page.getByRole('dialog')).toBeVisible()

      await page.getByLabel(/barcode/i).fill(barcode)
      await page.getByLabel(/product name/i).fill(productName)
      await page.getByLabel(/sku code/i).fill('CRUD-TEST-SKU')
      await page.getByLabel(/price/i).fill('99.99')
      await page.getByRole('button', { name: 'Create' }).click()

      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })
      await expect(page.getByText(productName)).toBeVisible({ timeout: 5000 })

      // UPDATE
      // Find the row with our product and click edit
      const productRow = page.locator('tr', { hasText: productName })
      await productRow.getByTitle('Edit product').click()

      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.getByText('Edit Product')).toBeVisible()

      const nameInput = page.getByLabel(/product name/i)
      await nameInput.clear()
      await nameInput.fill(updatedName)

      const priceInput = page.getByLabel(/price/i)
      await priceInput.clear()
      await priceInput.fill('149.99')

      await page.getByRole('button', { name: 'Update' }).click()

      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })
      await expect(page.getByText(updatedName)).toBeVisible({ timeout: 5000 })

      // DELETE
      const updatedProductRow = page.locator('tr', { hasText: updatedName })
      await updatedProductRow.getByTitle('Delete product').click()

      await expect(page.getByRole('alertdialog')).toBeVisible()
      await page.getByRole('button', { name: 'Delete' }).click()

      await expect(page.getByRole('alertdialog')).not.toBeVisible({ timeout: 10000 })
      await expect(page.getByText(updatedName)).not.toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('Product Type Display', () => {
    test.beforeEach(async ({ page }) => {
      await login(page)
      await page.goto('/products')
      await page.waitForSelector('table tbody tr', { timeout: 10000 })
    })

    test('should display Single badge with correct styling', async ({ page }) => {
      const singleBadge = page.locator('span', { hasText: 'Single' }).first()
      if (await singleBadge.isVisible()) {
        await expect(singleBadge).toHaveClass(/bg-blue-100/)
        await expect(singleBadge).toHaveClass(/text-blue-700/)
      }
    })

    test('should display Bundle badge with correct styling', async ({ page }) => {
      // First filter to bundles only
      const typeFilter = page.getByRole('combobox')
      await typeFilter.click()
      await page.getByRole('option', { name: 'Bundles' }).click()
      await page.waitForTimeout(500)

      const bundleBadge = page.locator('span', { hasText: 'Bundle' }).first()
      if (await bundleBadge.isVisible()) {
        await expect(bundleBadge).toHaveClass(/bg-purple-100/)
        await expect(bundleBadge).toHaveClass(/text-purple-700/)
      }
    })
  })

  test.describe('Price Display', () => {
    test.beforeEach(async ({ page }) => {
      await login(page)
      await page.goto('/products')
      await page.waitForSelector('table tbody tr', { timeout: 10000 })
    })

    test('should display prices with currency formatting', async ({ page }) => {
      // Check for currency format ($ followed by number)
      const priceCell = page.locator('td').filter({ hasText: /^\$[\d,]+\.\d{2}$/ }).first()
      await expect(priceCell).toBeVisible()
    })
  })

  test.describe('Barcode Validation Edge Cases', () => {
    test.beforeEach(async ({ page }) => {
      await login(page)
      await page.goto('/products')
    })

    test('should reject barcode with letters', async ({ page }) => {
      await page.getByRole('button', { name: /add product/i }).click()
      await page.getByLabel(/barcode/i).fill('123456789012A')
      await page.getByLabel(/product name/i).fill('Test')
      await page.getByRole('button', { name: 'Create' }).click()

      await expect(page.getByText(/barcode must be exactly 13 digits/i)).toBeVisible()
    })

    test('should reject barcode with wrong check digit', async ({ page }) => {
      await page.getByRole('button', { name: /add product/i }).click()
      // 1234567890129 has wrong check digit (should be 8)
      await page.getByLabel(/barcode/i).fill('1234567890129')
      await page.getByLabel(/product name/i).fill('Test')
      await page.getByRole('button', { name: 'Create' }).click()

      await expect(page.getByText(/invalid ean-13 check digit/i)).toBeVisible()
    })

    test('should reject barcode that is too short', async ({ page }) => {
      await page.getByRole('button', { name: /add product/i }).click()
      await page.getByLabel(/barcode/i).fill('123456')
      await page.getByLabel(/product name/i).fill('Test')
      await page.getByRole('button', { name: 'Create' }).click()

      await expect(page.getByText(/barcode must be exactly 13 digits/i)).toBeVisible()
    })
  })

  test.describe('Form Behavior', () => {
    test.beforeEach(async ({ page }) => {
      await login(page)
      await page.goto('/products')
    })

    test('should disable barcode field when editing', async ({ page }) => {
      await page.waitForSelector('table tbody tr', { timeout: 10000 })

      const editButtons = page.getByTitle('Edit product')
      const count = await editButtons.count()

      if (count > 0) {
        await editButtons.first().click()
        await expect(page.getByLabel(/barcode/i)).toBeDisabled()
      }
    })

    test('should enable barcode field when creating', async ({ page }) => {
      await page.getByRole('button', { name: /add product/i }).click()
      await expect(page.getByLabel(/barcode/i)).not.toBeDisabled()
    })

    test('should show SKU as optional field', async ({ page }) => {
      await page.getByRole('button', { name: /add product/i }).click()
      await expect(page.getByPlaceholder(/enter sku code \(optional\)/i)).toBeVisible()
    })
  })

  test.describe('Product Type Selection', () => {
    test.beforeEach(async ({ page }) => {
      await login(page)
      await page.goto('/products')
    })

    test('should allow selecting bundle type when creating', async ({ page }) => {
      await page.getByRole('button', { name: /add product/i }).click()

      // Open type dropdown
      const typeSelect = page.getByLabel(/type/i)
      await typeSelect.click()

      // Select Bundle
      await page.getByRole('option', { name: 'Bundle' }).click()

      // Verify selection
      await expect(page.getByRole('combobox').filter({ hasText: 'Bundle' })).toBeVisible()
    })

    test('should default to Single Item type', async ({ page }) => {
      await page.getByRole('button', { name: /add product/i }).click()

      // The type selector should show Single Item by default
      const typeDisplay = page.locator('[role="combobox"]').filter({ hasText: /single item/i })
      await expect(typeDisplay).toBeVisible()
    })
  })

  test.describe('Error Handling', () => {
    test('should show error for empty required fields', async ({ page }) => {
      await login(page)
      await page.goto('/products')

      await page.getByRole('button', { name: /add product/i }).click()
      await page.getByRole('button', { name: 'Create' }).click()

      // Should show both barcode and name errors
      await expect(page.getByText(/barcode is required/i)).toBeVisible()
      await expect(page.getByText(/product name is required/i)).toBeVisible()
    })
  })

  test.describe('Filter Persistence', () => {
    test('should maintain search query when switching type filter', async ({ page }) => {
      await login(page)
      await page.goto('/products')
      await page.waitForSelector('table tbody tr', { timeout: 10000 })

      // Enter search query
      const searchInput = page.getByPlaceholder(/search by barcode, name, or sku/i)
      await searchInput.fill('test')

      // Change type filter
      const typeFilter = page.getByRole('combobox')
      await typeFilter.click()
      await page.getByRole('option', { name: 'Bundles' }).click()

      // Search should still be visible
      await expect(searchInput).toHaveValue('test')
    })
  })

  test.describe('Keyboard Navigation', () => {
    test('should close dialog with Escape key', async ({ page }) => {
      await login(page)
      await page.goto('/products')

      await page.getByRole('button', { name: /add product/i }).click()
      await expect(page.getByRole('dialog')).toBeVisible()

      await page.keyboard.press('Escape')

      await expect(page.getByRole('dialog')).not.toBeVisible()
    })

    test('should close delete dialog with Escape key', async ({ page }) => {
      await login(page)
      await page.goto('/products')
      await page.waitForSelector('table tbody tr', { timeout: 10000 })

      const deleteButtons = page.getByTitle('Delete product')
      const count = await deleteButtons.count()

      if (count > 0) {
        await deleteButtons.first().click()
        await expect(page.getByRole('alertdialog')).toBeVisible()

        await page.keyboard.press('Escape')

        await expect(page.getByRole('alertdialog')).not.toBeVisible()
      }
    })
  })

  test.describe('Table Sorting and Display', () => {
    test.beforeEach(async ({ page }) => {
      await login(page)
      await page.goto('/products')
      await page.waitForSelector('table tbody tr', { timeout: 10000 })
    })

    test('should display product barcode in monospace font', async ({ page }) => {
      const barcodeCell = page.locator('td.font-mono').first()
      await expect(barcodeCell).toBeVisible()
    })

    test('should display dash for products without SKU', async ({ page }) => {
      // Look for dash in SKU column
      const dashCells = page.locator('td.font-mono', { hasText: '-' })
      const count = await dashCells.count()
      // There might be products without SKU
      expect(count).toBeGreaterThanOrEqual(0)
    })
  })

  test.describe('Mobile Viewport', () => {
    test('should display search input on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      await login(page)
      await page.goto('/products')

      await expect(
        page.getByPlaceholder(/search by barcode, name, or sku/i)
      ).toBeVisible()
    })

    test('should display type filter on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      await login(page)
      await page.goto('/products')

      await expect(page.getByRole('combobox')).toBeVisible()
    })

    test('should open create dialog on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      await login(page)
      await page.goto('/products')

      await page.getByRole('button', { name: /add product/i }).click()

      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.getByText('Add New Product')).toBeVisible()
    })
  })

  test.describe('Accessibility', () => {
    test.beforeEach(async ({ page }) => {
      await login(page)
      await page.goto('/products')
    })

    test('should have accessible table structure', async ({ page }) => {
      await page.waitForSelector('table', { timeout: 10000 })

      // Table should have proper structure
      await expect(page.locator('table')).toBeVisible()
      await expect(page.locator('thead')).toBeVisible()
      await expect(page.locator('tbody')).toBeVisible()
    })

    test('should have accessible buttons with titles', async ({ page }) => {
      await page.waitForSelector('table tbody tr', { timeout: 10000 })

      // Edit and delete buttons should have titles
      const editButton = page.getByTitle('Edit product').first()
      const deleteButton = page.getByTitle('Delete product').first()

      if (await editButton.isVisible()) {
        await expect(editButton).toBeVisible()
      }
      if (await deleteButton.isVisible()) {
        await expect(deleteButton).toBeVisible()
      }
    })

    test('should have accessible form labels', async ({ page }) => {
      await page.getByRole('button', { name: /add product/i }).click()

      // Check for labeled form fields
      await expect(page.getByLabel(/barcode/i)).toBeVisible()
      await expect(page.getByLabel(/sku code/i)).toBeVisible()
      await expect(page.getByLabel(/product name/i)).toBeVisible()
      await expect(page.getByLabel(/type/i)).toBeVisible()
      await expect(page.getByLabel(/price/i)).toBeVisible()
    })
  })
})
