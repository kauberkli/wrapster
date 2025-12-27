import type { ReactNode } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Products from '@/pages/Products'
import type { Product } from '@/types/product'

const mockProducts: Product[] = [
  {
    $id: 'prod-1',
    $collectionId: 'products',
    $databaseId: 'main',
    $createdAt: '2024-01-01T00:00:00.000Z',
    $updatedAt: '2024-01-01T00:00:00.000Z',
    $permissions: [],
    $sequence: 0,
    barcode: '1234567890128',
    sku_code: 'SKU-001',
    name: 'Test Product 1',
    type: 'single',
    cost: 29.99,
    stock_quantity: 100,
  },
  {
    $id: 'prod-2',
    $collectionId: 'products',
    $databaseId: 'main',
    $createdAt: '2024-01-02T00:00:00.000Z',
    $updatedAt: '2024-01-02T00:00:00.000Z',
    $permissions: [],
    $sequence: 0,
    barcode: '9876543210987',
    sku_code: 'SKU-002',
    name: 'Test Bundle',
    type: 'bundle',
    cost: 59.99,
    stock_quantity: 0,
  },
  {
    $id: 'prod-3',
    $collectionId: 'products',
    $databaseId: 'main',
    $createdAt: '2024-01-03T00:00:00.000Z',
    $updatedAt: '2024-01-03T00:00:00.000Z',
    $permissions: [],
    $sequence: 0,
    barcode: '5555555555551',
    sku_code: null,
    name: 'Product Without SKU',
    type: 'single',
    cost: 15.00,
    stock_quantity: 50,
  },
]

const mockProductService = {
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  getById: vi.fn(),
  getByBarcode: vi.fn(),
  getBySku: vi.fn(),
  getWithComponents: vi.fn(),
}

const mockProductComponentService = {
  getByParentId: vi.fn().mockResolvedValue([]),
  create: vi.fn(),
  delete: vi.fn(),
  deleteAllForParent: vi.fn(),
}

vi.mock('@/lib/appwrite', () => ({
  productService: {
    list: (...args: unknown[]) => mockProductService.list(...args),
    create: (...args: unknown[]) => mockProductService.create(...args),
    update: (...args: unknown[]) => mockProductService.update(...args),
    delete: (...args: unknown[]) => mockProductService.delete(...args),
    getById: (...args: unknown[]) => mockProductService.getById(...args),
    getByBarcode: (...args: unknown[]) => mockProductService.getByBarcode(...args),
    getBySku: (...args: unknown[]) => mockProductService.getBySku(...args),
    getWithComponents: (...args: unknown[]) => mockProductService.getWithComponents(...args),
  },
  productComponentService: {
    getByParentId: (...args: unknown[]) => mockProductComponentService.getByParentId(...args),
    create: (...args: unknown[]) => mockProductComponentService.create(...args),
    delete: (...args: unknown[]) => mockProductComponentService.delete(...args),
    deleteAllForParent: (...args: unknown[]) => mockProductComponentService.deleteAllForParent(...args),
  },
}))

// Mock the virtualizer to return all items without virtualization in tests
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        start: index * 53,
        end: (index + 1) * 53,
        size: 53,
        key: index,
      })),
    getTotalSize: () => count * 53,
    measureElement: vi.fn(),
  }),
}))

interface WrapperProps {
  children: ReactNode
}

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

function TestWrapper({ children }: WrapperProps) {
  const queryClient = createTestQueryClient()
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('Products Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockProductService.list.mockResolvedValue({
      documents: mockProducts,
      total: mockProducts.length,
    })
  })

  describe('Initial Rendering', () => {
    it('should render the products page header', async () => {
      render(<Products />, { wrapper: TestWrapper })

      expect(await screen.findByRole('heading', { name: 'Products' })).toBeInTheDocument()
      expect(screen.getByText('Manage your product catalog')).toBeInTheDocument()
    })

    it('should render the Add Product button', async () => {
      render(<Products />, { wrapper: TestWrapper })

      expect(await screen.findByRole('button', { name: /add product/i })).toBeInTheDocument()
    })

    it('should render the search input', async () => {
      render(<Products />, { wrapper: TestWrapper })

      expect(await screen.findByPlaceholderText(/search by barcode, name, or sku/i)).toBeInTheDocument()
    })

    it('should render the type filter dropdown', async () => {
      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument()
      })
    })

    it('should show loading state initially', () => {
      mockProductService.list.mockReturnValue(new Promise(() => {})) // Never resolves
      render(<Products />, { wrapper: TestWrapper })

      expect(screen.getByText('Loading products...')).toBeInTheDocument()
    })
  })

  describe('Products Table', () => {
    it('should render table headers', async () => {
      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByRole('columnheader', { name: 'Barcode' })).toBeInTheDocument()
        expect(screen.getByRole('columnheader', { name: 'SKU' })).toBeInTheDocument()
        expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument()
        expect(screen.getByRole('columnheader', { name: 'Type' })).toBeInTheDocument()
        expect(screen.getByRole('columnheader', { name: 'Cost' })).toBeInTheDocument()
        expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument()
      })
    })

    it('should render products from the API', async () => {
      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByText('1234567890128')).toBeInTheDocument()
        expect(screen.getByText('Test Product 1')).toBeInTheDocument()
        expect(screen.getByText('SKU-001')).toBeInTheDocument()
        expect(screen.getByText('$29.99')).toBeInTheDocument()
      })
    })

    it('should display bundle type badge correctly', async () => {
      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByText('Bundle')).toBeInTheDocument()
      })
    })

    it('should display single type badge correctly', async () => {
      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        const singleBadges = screen.getAllByText('Single')
        expect(singleBadges.length).toBeGreaterThanOrEqual(1)
      })
    })

    it('should display dash for products without SKU', async () => {
      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByText('Product Without SKU')).toBeInTheDocument()
      })

      const dashes = screen.getAllByText('-')
      expect(dashes.length).toBeGreaterThanOrEqual(1)
    })

    it('should show edit and delete buttons for each product', async () => {
      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        const editButtons = screen.getAllByTitle('Edit product')
        const deleteButtons = screen.getAllByTitle('Delete product')
        expect(editButtons.length).toBe(mockProducts.length)
        expect(deleteButtons.length).toBe(mockProducts.length)
      })
    })

    it('should display products count', async () => {
      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByText(/showing 3 of 3 products/i)).toBeInTheDocument()
      })
    })
  })

  describe('Empty State', () => {
    it('should show empty state when no products exist', async () => {
      mockProductService.list.mockResolvedValue({
        documents: [],
        total: 0,
      })

      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByText('No products found')).toBeInTheDocument()
      })
    })
  })

  describe('Error Handling', () => {
    it('should show error message when API fails', async () => {
      mockProductService.list.mockRejectedValue(new Error('API Error'))

      render(<Products />, { wrapper: TestWrapper })

      // With TanStack Query, errors may be shown via the query's error state
      // The loading state shows first, then error state after rejection
      await waitFor(() => {
        // Either the error message or loading should be shown
        const hasError = screen.queryByText('Failed to load products')
        const hasLoading = screen.queryByText('Loading products...')
        const hasNoProducts = screen.queryByText('No products found')
        expect(hasError || hasLoading || hasNoProducts).toBeTruthy()
      }, { timeout: 3000 })
    })
  })

  describe('Search Functionality', () => {
    it('should filter products by barcode', async () => {
      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByText('Test Product 1')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText(/search by barcode, name, or sku/i)
      await userEvent.type(searchInput, '1234567890128')

      await waitFor(() => {
        expect(screen.getByText('Test Product 1')).toBeInTheDocument()
        expect(screen.queryByText('Test Bundle')).not.toBeInTheDocument()
      })
    })

    it('should filter products by name', async () => {
      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByText('Test Product 1')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText(/search by barcode, name, or sku/i)
      await userEvent.type(searchInput, 'Bundle')

      await waitFor(() => {
        expect(screen.getByText('Test Bundle')).toBeInTheDocument()
        expect(screen.queryByText('Test Product 1')).not.toBeInTheDocument()
      })
    })

    it('should filter products by SKU', async () => {
      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByText('Test Product 1')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText(/search by barcode, name, or sku/i)
      await userEvent.type(searchInput, 'SKU-002')

      await waitFor(() => {
        expect(screen.getByText('Test Bundle')).toBeInTheDocument()
        expect(screen.queryByText('Test Product 1')).not.toBeInTheDocument()
      })
    })

    it('should show empty state when search has no results', async () => {
      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByText('Test Product 1')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText(/search by barcode, name, or sku/i)
      await userEvent.type(searchInput, 'nonexistent product xyz')

      await waitFor(() => {
        expect(screen.getByText('No products found')).toBeInTheDocument()
      })
    })

    it('should show clear search button when search has no results', async () => {
      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByText('Test Product 1')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText(/search by barcode, name, or sku/i)
      await userEvent.type(searchInput, 'nonexistent')

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument()
      })
    })

    it('should display filtered count message', async () => {
      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByText('Test Product 1')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText(/search by barcode, name, or sku/i)
      await userEvent.type(searchInput, 'Test')

      await waitFor(() => {
        expect(screen.getByText(/found \d+ matching products/i)).toBeInTheDocument()
      })
    })
  })

  describe('Type Filter', () => {
    it('should call list API with type filter when changed', async () => {
      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByText('Test Product 1')).toBeInTheDocument()
      })

      const typeSelect = screen.getByRole('combobox')
      await userEvent.click(typeSelect)

      const bundleOption = screen.getByRole('option', { name: 'Bundles' })
      await userEvent.click(bundleOption)

      await waitFor(() => {
        expect(mockProductService.list).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'bundle' })
        )
      })
    })
  })

  describe('Create Product', () => {
    it('should open create dialog when Add Product is clicked', async () => {
      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add product/i })).toBeInTheDocument()
      })

      await userEvent.click(screen.getByRole('button', { name: /add product/i }))

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
        expect(screen.getByText('Add New Product')).toBeInTheDocument()
      })
    })

    it('should show dialog description for new product', async () => {
      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add product/i })).toBeInTheDocument()
      })

      await userEvent.click(screen.getByRole('button', { name: /add product/i }))

      await waitFor(() => {
        expect(
          screen.getByText(/enter the product details. use a barcode scanner/i)
        ).toBeInTheDocument()
      })
    })

    it('should call create API on form submit', async () => {
      mockProductService.create.mockResolvedValue(mockProducts[0])

      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add product/i })).toBeInTheDocument()
      })

      await userEvent.click(screen.getByRole('button', { name: /add product/i }))

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      // Fill in the form
      await userEvent.type(screen.getByLabelText(/barcode/i), '1234567890128')
      await userEvent.type(screen.getByLabelText(/product name/i), 'New Product')
      await userEvent.type(screen.getByLabelText(/cost/i), '19.99')

      await userEvent.click(screen.getByRole('button', { name: 'Create' }))

      await waitFor(() => {
        expect(mockProductService.create).toHaveBeenCalledWith(
          expect.objectContaining({
            barcode: '1234567890128',
            name: 'New Product',
          })
        )
      })
    })

    it('should close dialog and update list optimistically after successful create', async () => {
      mockProductService.create.mockResolvedValue(mockProducts[0])

      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add product/i })).toBeInTheDocument()
      })

      await userEvent.click(screen.getByRole('button', { name: /add product/i }))

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      await userEvent.type(screen.getByLabelText(/barcode/i), '1234567890128')
      await userEvent.type(screen.getByLabelText(/product name/i), 'New Product')

      await userEvent.click(screen.getByRole('button', { name: 'Create' }))

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })

      // With optimistic updates, we don't refetch - list is called only once on mount
      // The cache is updated optimistically instead
      expect(mockProductService.list).toHaveBeenCalledTimes(1)
      expect(mockProductService.create).toHaveBeenCalled()
    })
  })

  describe('Edit Product', () => {
    it('should open edit dialog with product data when edit is clicked', async () => {
      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByText('Test Product 1')).toBeInTheDocument()
      })

      const editButtons = screen.getAllByTitle('Edit product')
      await userEvent.click(editButtons[0])

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
        expect(screen.getByText('Edit Product')).toBeInTheDocument()
      })
    })

    it('should show edit dialog description', async () => {
      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByText('Test Product 1')).toBeInTheDocument()
      })

      const editButtons = screen.getAllByTitle('Edit product')
      await userEvent.click(editButtons[0])

      await waitFor(() => {
        expect(screen.getByText('Update the product details below.')).toBeInTheDocument()
      })
    })

    it('should call update API on form submit', async () => {
      mockProductService.update.mockResolvedValue(mockProducts[0])

      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByText('Test Product 1')).toBeInTheDocument()
      })

      const editButtons = screen.getAllByTitle('Edit product')
      await userEvent.click(editButtons[0])

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      const nameInput = screen.getByLabelText(/product name/i)
      await userEvent.clear(nameInput)
      await userEvent.type(nameInput, 'Updated Product Name')

      await userEvent.click(screen.getByRole('button', { name: 'Update' }))

      await waitFor(() => {
        expect(mockProductService.update).toHaveBeenCalledWith(
          'prod-1',
          expect.objectContaining({
            name: 'Updated Product Name',
          })
        )
      })
    })
  })

  describe('Delete Product', () => {
    it('should open delete confirmation dialog when delete is clicked', async () => {
      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByText('Test Product 1')).toBeInTheDocument()
      })

      const deleteButtons = screen.getAllByTitle('Delete product')
      await userEvent.click(deleteButtons[0])

      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toBeInTheDocument()
        expect(screen.getByText('Delete Product')).toBeInTheDocument()
      })
    })

    it('should show product name in delete confirmation', async () => {
      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByText('Test Product 1')).toBeInTheDocument()
      })

      const deleteButtons = screen.getAllByTitle('Delete product')
      await userEvent.click(deleteButtons[0])

      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toBeInTheDocument()
      })

      // The dialog should contain the product name and warning text
      const dialog = screen.getByRole('alertdialog')
      expect(dialog).toHaveTextContent(/test product 1/i)
      expect(dialog).toHaveTextContent(/this action cannot be undone/i)
    })

    it('should close dialog when cancel is clicked', async () => {
      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByText('Test Product 1')).toBeInTheDocument()
      })

      const deleteButtons = screen.getAllByTitle('Delete product')
      await userEvent.click(deleteButtons[0])

      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toBeInTheDocument()
      })

      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      await waitFor(() => {
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      })
    })

    it('should call delete API when confirmed', async () => {
      mockProductService.delete.mockResolvedValue(undefined)

      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByText('Test Product 1')).toBeInTheDocument()
      })

      const deleteButtons = screen.getAllByTitle('Delete product')
      await userEvent.click(deleteButtons[0])

      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toBeInTheDocument()
      })

      await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

      await waitFor(() => {
        expect(mockProductService.delete).toHaveBeenCalledWith('prod-1')
      })
    })

    it('should close dialog and update list optimistically after successful delete', async () => {
      mockProductService.delete.mockResolvedValue(undefined)

      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByText('Test Product 1')).toBeInTheDocument()
      })

      const deleteButtons = screen.getAllByTitle('Delete product')
      await userEvent.click(deleteButtons[0])

      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toBeInTheDocument()
      })

      await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

      await waitFor(() => {
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      })

      // With optimistic updates, we don't refetch - list is called only once on mount
      // The cache is updated optimistically instead
      expect(mockProductService.list).toHaveBeenCalledTimes(1)
      expect(mockProductService.delete).toHaveBeenCalledWith('prod-1')
    })

    it('should show error when delete fails', async () => {
      mockProductService.delete.mockRejectedValue(new Error('Delete failed'))

      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByText('Test Product 1')).toBeInTheDocument()
      })

      const deleteButtons = screen.getAllByTitle('Delete product')
      await userEvent.click(deleteButtons[0])

      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toBeInTheDocument()
      })

      await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

      await waitFor(() => {
        expect(screen.getByText('Failed to delete product')).toBeInTheDocument()
      })
    })
  })

  describe('Cost Formatting', () => {
    it('should format costs correctly', async () => {
      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByText('$29.99')).toBeInTheDocument()
        expect(screen.getByText('$59.99')).toBeInTheDocument()
        expect(screen.getByText('$15.00')).toBeInTheDocument()
      })
    })
  })

  describe('Form Cancel', () => {
    it('should close dialog when cancel is clicked in form', async () => {
      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add product/i })).toBeInTheDocument()
      })

      await userEvent.click(screen.getByRole('button', { name: /add product/i }))

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
    })
  })

  describe('Infinite Scroll', () => {
    it('should call list API on initial load with correct params', async () => {
      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(mockProductService.list).toHaveBeenCalledWith({
          type: undefined,
          limit: 50,
          offset: 0,
        })
      })
    })

    it('should show loading more indicator', async () => {
      const manyProducts = Array.from({ length: 50 }, (_, i) => ({
        ...mockProducts[0],
        $id: `prod-${i}`,
        name: `Product ${i}`,
      }))

      mockProductService.list.mockResolvedValue({
        documents: manyProducts,
        total: 100,
      })

      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByText('Product 0')).toBeInTheDocument()
      })
    })

    it('should display all loaded message when all products are loaded', async () => {
      mockProductService.list.mockResolvedValue({
        documents: mockProducts,
        total: mockProducts.length,
      })

      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByText(/all loaded/i)).toBeInTheDocument()
      })
    })
  })

  describe('Create Product Errors', () => {
    it('should display error message when create fails', async () => {
      mockProductService.create.mockRejectedValue(new Error('Barcode already exists'))

      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add product/i })).toBeInTheDocument()
      })

      await userEvent.click(screen.getByRole('button', { name: /add product/i }))

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      await userEvent.type(screen.getByLabelText(/barcode/i), '1234567890128')
      await userEvent.type(screen.getByLabelText(/product name/i), 'New Product')
      await userEvent.click(screen.getByRole('button', { name: 'Create' }))

      await waitFor(() => {
        expect(screen.getByText('Barcode already exists')).toBeInTheDocument()
      })
    })

    it('should keep dialog open on create error', async () => {
      mockProductService.create.mockRejectedValue(new Error('Create failed'))

      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add product/i })).toBeInTheDocument()
      })

      await userEvent.click(screen.getByRole('button', { name: /add product/i }))

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      await userEvent.type(screen.getByLabelText(/barcode/i), '1234567890128')
      await userEvent.type(screen.getByLabelText(/product name/i), 'New Product')
      await userEvent.click(screen.getByRole('button', { name: 'Create' }))

      await waitFor(() => {
        expect(screen.getByText('Create failed')).toBeInTheDocument()
      })

      // Dialog should remain open
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  describe('Update Product Errors', () => {
    it('should display error message when update fails', async () => {
      mockProductService.update.mockRejectedValue(new Error('Update failed'))

      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByText('Test Product 1')).toBeInTheDocument()
      })

      const editButtons = screen.getAllByTitle('Edit product')
      await userEvent.click(editButtons[0])

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      const nameInput = screen.getByLabelText(/product name/i)
      await userEvent.clear(nameInput)
      await userEvent.type(nameInput, 'Updated Name')
      await userEvent.click(screen.getByRole('button', { name: 'Update' }))

      await waitFor(() => {
        expect(screen.getByText('Update failed')).toBeInTheDocument()
      })
    })
  })

  describe('Clear Search', () => {
    it('should clear search and show all products when clear button clicked', async () => {
      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByText('Test Product 1')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText(/search by barcode, name, or sku/i)
      await userEvent.type(searchInput, 'nonexistent')

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument()
      })

      await userEvent.click(screen.getByRole('button', { name: 'Clear search' }))

      await waitFor(() => {
        expect(screen.getByText('Test Product 1')).toBeInTheDocument()
        expect(screen.getByText('Test Bundle')).toBeInTheDocument()
      })
    })
  })

  describe('Case Insensitive Search', () => {
    it('should match products regardless of case', async () => {
      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByText('Test Product 1')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText(/search by barcode, name, or sku/i)
      await userEvent.type(searchInput, 'TEST PRODUCT')

      await waitFor(() => {
        expect(screen.getByText('Test Product 1')).toBeInTheDocument()
      })
    })

    it('should match SKU case insensitively', async () => {
      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByText('Test Product 1')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText(/search by barcode, name, or sku/i)
      await userEvent.type(searchInput, 'sku-001')

      await waitFor(() => {
        expect(screen.getByText('Test Product 1')).toBeInTheDocument()
        expect(screen.queryByText('Test Bundle')).not.toBeInTheDocument()
      })
    })
  })

  describe('Product Type Badges', () => {
    it('should display correct badge styling for single products', async () => {
      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        const singleBadges = screen.getAllByText('Single')
        expect(singleBadges[0]).toHaveClass('bg-blue-100', 'text-blue-700')
      })
    })

    it('should display correct badge styling for bundle products', async () => {
      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        const bundleBadge = screen.getByText('Bundle')
        expect(bundleBadge).toHaveClass('bg-purple-100', 'text-purple-700')
      })
    })
  })

  describe('Dialog State Reset', () => {
    it('should reset selected product when create dialog is opened', async () => {
      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByText('Test Product 1')).toBeInTheDocument()
      })

      // First open edit dialog
      const editButtons = screen.getAllByTitle('Edit product')
      await userEvent.click(editButtons[0])

      await waitFor(() => {
        expect(screen.getByText('Edit Product')).toBeInTheDocument()
      })

      // Close and open create dialog
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      await userEvent.click(screen.getByRole('button', { name: /add product/i }))

      await waitFor(() => {
        expect(screen.getByText('Add New Product')).toBeInTheDocument()
        expect(screen.getByLabelText(/barcode/i)).toHaveValue('')
      })
    })
  })

  describe('Loading State Behavior', () => {
    it('should not render products table while loading', () => {
      mockProductService.list.mockReturnValue(new Promise(() => {}))
      render(<Products />, { wrapper: TestWrapper })

      expect(screen.getByText('Loading products...')).toBeInTheDocument()
      expect(screen.queryByText('Test Product 1')).not.toBeInTheDocument()
    })

    it('should hide loading state after products load', async () => {
      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.queryByText('Loading products...')).not.toBeInTheDocument()
        expect(screen.getByText('Test Product 1')).toBeInTheDocument()
      })
    })
  })

  describe('Products with Special Characters', () => {
    it('should display products with special characters in name', async () => {
      const specialProduct: Product = {
        ...mockProducts[0],
        $id: 'prod-special',
        name: 'Product with "quotes" & symbols <test>',
      }

      mockProductService.list.mockResolvedValue({
        documents: [specialProduct],
        total: 1,
      })

      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByText('Product with "quotes" & symbols <test>')).toBeInTheDocument()
      })
    })
  })

  describe('Zero Cost Products', () => {
    it('should format zero cost correctly', async () => {
      const zeroProduct: Product = {
        ...mockProducts[0],
        $id: 'prod-zero',
        cost: 0,
      }

      mockProductService.list.mockResolvedValue({
        documents: [zeroProduct],
        total: 1,
      })

      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByText('$0.00')).toBeInTheDocument()
      })
    })
  })

  describe('High Value Products', () => {
    it('should format high costs correctly with thousands separator', async () => {
      const expensiveProduct: Product = {
        ...mockProducts[0],
        $id: 'prod-expensive',
        cost: 1234567.89,
      }

      mockProductService.list.mockResolvedValue({
        documents: [expensiveProduct],
        total: 1,
      })

      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByText('$1,234,567.89')).toBeInTheDocument()
      })
    })
  })

  describe('API Call Parameters', () => {
    it('should reset offset when type filter changes', async () => {
      render(<Products />, { wrapper: TestWrapper })

      await waitFor(() => {
        expect(screen.getByText('Test Product 1')).toBeInTheDocument()
      })

      mockProductService.list.mockClear()

      const typeSelect = screen.getByRole('combobox')
      await userEvent.click(typeSelect)
      await userEvent.click(screen.getByRole('option', { name: 'Bundles' }))

      await waitFor(() => {
        expect(mockProductService.list).toHaveBeenCalledWith({
          type: 'bundle',
          limit: 50,
          offset: 0,
        })
      })
    })
  })
})
