import { beforeEach, describe, expect, it, vi } from 'vitest'

import { productService, productComponentService } from '@/lib/appwrite/products'
import { COLLECTIONS } from '@/types/product'
import type { Product, ProductComponent } from '@/types/product'

const mockDatabaseService = {
  createDocument: vi.fn(),
  getDocument: vi.fn(),
  listDocuments: vi.fn(),
  updateDocument: vi.fn(),
  deleteDocument: vi.fn(),
}

vi.mock('@/lib/appwrite/database', () => ({
  databaseService: {
    createDocument: (...args: unknown[]) => mockDatabaseService.createDocument(...args),
    getDocument: (...args: unknown[]) => mockDatabaseService.getDocument(...args),
    listDocuments: (...args: unknown[]) => mockDatabaseService.listDocuments(...args),
    updateDocument: (...args: unknown[]) => mockDatabaseService.updateDocument(...args),
    deleteDocument: (...args: unknown[]) => mockDatabaseService.deleteDocument(...args),
  },
  Query: {
    equal: (field: string, value: string) => `equal("${field}", "${value}")`,
    search: (field: string, value: string) => `search("${field}", "${value}")`,
    limit: (value: number) => `limit(${value})`,
    offset: (value: number) => `offset(${value})`,
  },
}))

const mockProduct: Product = {
  $id: 'prod-1',
  $collectionId: 'products',
  $databaseId: 'main',
  $createdAt: '2024-01-01T00:00:00.000Z',
  $updatedAt: '2024-01-01T00:00:00.000Z',
  $permissions: [],
  $sequence: 0,
  barcode: '1234567890128',
  sku_code: 'SKU-001',
  name: 'Test Product',
  type: 'single',
  cost: 29.99,
  stock_quantity: 100,
}

const mockBundleProduct: Product = {
  ...mockProduct,
  $id: 'prod-bundle',
  type: 'bundle',
  name: 'Test Bundle',
}

const mockComponent: ProductComponent = {
  $id: 'comp-1',
  $collectionId: 'product_components',
  $databaseId: 'main',
  $createdAt: '2024-01-01T00:00:00.000Z',
  $updatedAt: '2024-01-01T00:00:00.000Z',
  $permissions: [],
  $sequence: 0,
  parent_product_id: 'prod-bundle',
  child_product_id: 'prod-1',
  quantity: 2,
}

describe('productService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('create', () => {
    it('should create a product with required fields', async () => {
      mockDatabaseService.createDocument.mockResolvedValue(mockProduct)

      const result = await productService.create({
        barcode: '1234567890128',
        name: 'Test Product',
      })

      expect(mockDatabaseService.createDocument).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCTS,
        {
          sku_code: null,
          barcode: '1234567890128',
          name: 'Test Product',
          type: 'single',
          cost: 0,
        }
      )
      expect(result).toEqual(mockProduct)
    })

    it('should create a product with all fields', async () => {
      mockDatabaseService.createDocument.mockResolvedValue(mockProduct)

      await productService.create({
        barcode: '1234567890128',
        sku_code: 'SKU-001',
        name: 'Test Product',
        type: 'bundle',
        cost: 29.99,
      })

      expect(mockDatabaseService.createDocument).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCTS,
        {
          sku_code: 'SKU-001',
          barcode: '1234567890128',
          name: 'Test Product',
          type: 'bundle',
          cost: 29.99,
        }
      )
    })

    it('should default type to single', async () => {
      mockDatabaseService.createDocument.mockResolvedValue(mockProduct)

      await productService.create({
        barcode: '1234567890128',
        name: 'Test Product',
      })

      expect(mockDatabaseService.createDocument).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCTS,
        expect.objectContaining({
          type: 'single',
        })
      )
    })

    it('should default cost to 0', async () => {
      mockDatabaseService.createDocument.mockResolvedValue(mockProduct)

      await productService.create({
        barcode: '1234567890128',
        name: 'Test Product',
      })

      expect(mockDatabaseService.createDocument).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCTS,
        expect.objectContaining({
          cost: 0,
        })
      )
    })
  })

  describe('getById', () => {
    it('should get a product by ID', async () => {
      mockDatabaseService.getDocument.mockResolvedValue(mockProduct)

      const result = await productService.getById('prod-1')

      expect(mockDatabaseService.getDocument).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCTS,
        'prod-1'
      )
      expect(result).toEqual(mockProduct)
    })
  })

  describe('getByBarcode', () => {
    it('should return product when barcode exists', async () => {
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [mockProduct],
        total: 1,
      })

      const result = await productService.getByBarcode('1234567890128')

      expect(mockDatabaseService.listDocuments).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCTS,
        [
          'equal("barcode", "1234567890128")',
          'limit(1)',
        ]
      )
      expect(result).toEqual(mockProduct)
    })

    it('should return null when barcode does not exist', async () => {
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [],
        total: 0,
      })

      const result = await productService.getByBarcode('nonexistent')

      expect(result).toBeNull()
    })
  })

  describe('getBySku', () => {
    it('should return product when SKU exists', async () => {
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [mockProduct],
        total: 1,
      })

      const result = await productService.getBySku('SKU-001')

      expect(mockDatabaseService.listDocuments).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCTS,
        [
          'equal("sku_code", "SKU-001")',
          'limit(1)',
        ]
      )
      expect(result).toEqual(mockProduct)
    })

    it('should return null when SKU does not exist', async () => {
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [],
        total: 0,
      })

      const result = await productService.getBySku('NONEXISTENT')

      expect(result).toBeNull()
    })
  })

  describe('list', () => {
    it('should list all products without filters', async () => {
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [mockProduct],
        total: 1,
      })

      const result = await productService.list()

      expect(mockDatabaseService.listDocuments).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCTS,
        []
      )
      expect(result.documents).toEqual([mockProduct])
      expect(result.total).toBe(1)
    })

    it('should filter by type', async () => {
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [mockBundleProduct],
        total: 1,
      })

      await productService.list({ type: 'bundle' })

      expect(mockDatabaseService.listDocuments).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCTS,
        expect.arrayContaining(['equal("type", "bundle")'])
      )
    })

    it('should apply search filter', async () => {
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [mockProduct],
        total: 1,
      })

      await productService.list({ search: 'Test' })

      expect(mockDatabaseService.listDocuments).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCTS,
        expect.arrayContaining(['search("name", "Test")'])
      )
    })

    it('should apply limit', async () => {
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [mockProduct],
        total: 1,
      })

      await productService.list({ limit: 50 })

      expect(mockDatabaseService.listDocuments).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCTS,
        expect.arrayContaining(['limit(50)'])
      )
    })

    it('should apply offset', async () => {
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [mockProduct],
        total: 1,
      })

      await productService.list({ offset: 100 })

      expect(mockDatabaseService.listDocuments).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCTS,
        expect.arrayContaining(['offset(100)'])
      )
    })

    it('should combine multiple filters', async () => {
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [],
        total: 0,
      })

      await productService.list({
        type: 'single',
        search: 'Test',
        limit: 25,
        offset: 50,
      })

      expect(mockDatabaseService.listDocuments).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCTS,
        expect.arrayContaining([
          'equal("type", "single")',
          'search("name", "Test")',
          'limit(25)',
          'offset(50)',
        ])
      )
    })
  })

  describe('update', () => {
    it('should update a product', async () => {
      const updatedProduct = { ...mockProduct, name: 'Updated Name' }
      mockDatabaseService.updateDocument.mockResolvedValue(updatedProduct)

      const result = await productService.update('prod-1', { name: 'Updated Name' })

      expect(mockDatabaseService.updateDocument).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCTS,
        'prod-1',
        { name: 'Updated Name' }
      )
      expect(result.name).toBe('Updated Name')
    })

    it('should update multiple fields', async () => {
      const updatedProduct = { ...mockProduct, name: 'New Name', cost: 39.99 }
      mockDatabaseService.updateDocument.mockResolvedValue(updatedProduct)

      await productService.update('prod-1', {
        name: 'New Name',
        cost: 39.99,
      })

      expect(mockDatabaseService.updateDocument).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCTS,
        'prod-1',
        { name: 'New Name', cost: 39.99 }
      )
    })
  })

  describe('delete', () => {
    it('should delete product and its components', async () => {
      mockDatabaseService.listDocuments
        .mockResolvedValueOnce({ documents: [mockComponent], total: 1 }) // parent components
        .mockResolvedValueOnce({ documents: [], total: 0 }) // child components
      mockDatabaseService.deleteDocument.mockResolvedValue({})

      await productService.delete('prod-bundle')

      // Should query for both parent and child components
      expect(mockDatabaseService.listDocuments).toHaveBeenCalledTimes(2)
      expect(mockDatabaseService.listDocuments).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCT_COMPONENTS,
        ['equal("parent_product_id", "prod-bundle")']
      )
      expect(mockDatabaseService.listDocuments).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCT_COMPONENTS,
        ['equal("child_product_id", "prod-bundle")']
      )

      // Should delete component first, then product
      expect(mockDatabaseService.deleteDocument).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCT_COMPONENTS,
        'comp-1'
      )
      expect(mockDatabaseService.deleteDocument).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCTS,
        'prod-bundle'
      )
    })

    it('should delete product without components', async () => {
      mockDatabaseService.listDocuments
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 })
      mockDatabaseService.deleteDocument.mockResolvedValue({})

      await productService.delete('prod-1')

      expect(mockDatabaseService.deleteDocument).toHaveBeenCalledTimes(1)
      expect(mockDatabaseService.deleteDocument).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCTS,
        'prod-1'
      )
    })
  })

  describe('getWithComponents', () => {
    it('should return single product without components', async () => {
      mockDatabaseService.getDocument.mockResolvedValue(mockProduct)

      const result = await productService.getWithComponents('prod-1')

      expect(result).toEqual(mockProduct)
      expect(result.components).toBeUndefined()
    })

    it('should return bundle with components', async () => {
      const childProduct = { ...mockProduct, $id: 'child-1', name: 'Child Product' }
      mockDatabaseService.getDocument
        .mockResolvedValueOnce(mockBundleProduct) // First call for parent
        .mockResolvedValueOnce(childProduct) // Second call for child
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [mockComponent],
        total: 1,
      })

      const result = await productService.getWithComponents('prod-bundle')

      expect(result.type).toBe('bundle')
      expect(result.components).toBeDefined()
      expect(result.components).toHaveLength(1)
      expect(result.components![0].product).toEqual(childProduct)
      expect(result.components![0].quantity).toBe(2)
    })

    it('should return bundle with empty components array if no components', async () => {
      mockDatabaseService.getDocument.mockResolvedValue(mockBundleProduct)
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [],
        total: 0,
      })

      const result = await productService.getWithComponents('prod-bundle')

      expect(result.type).toBe('bundle')
      expect(result.components).toEqual([])
    })
  })
})

describe('productComponentService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('create', () => {
    it('should create a component with required fields', async () => {
      mockDatabaseService.createDocument.mockResolvedValue(mockComponent)

      const result = await productComponentService.create({
        parent_product_id: 'prod-bundle',
        child_product_id: 'prod-1',
      })

      expect(mockDatabaseService.createDocument).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCT_COMPONENTS,
        {
          parent_product_id: 'prod-bundle',
          child_product_id: 'prod-1',
          quantity: 1,
        }
      )
      expect(result).toEqual(mockComponent)
    })

    it('should create a component with custom quantity', async () => {
      mockDatabaseService.createDocument.mockResolvedValue(mockComponent)

      await productComponentService.create({
        parent_product_id: 'prod-bundle',
        child_product_id: 'prod-1',
        quantity: 5,
      })

      expect(mockDatabaseService.createDocument).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCT_COMPONENTS,
        expect.objectContaining({
          quantity: 5,
        })
      )
    })
  })

  describe('getByParentId', () => {
    it('should get components by parent ID', async () => {
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [mockComponent],
        total: 1,
      })

      const result = await productComponentService.getByParentId('prod-bundle')

      expect(mockDatabaseService.listDocuments).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCT_COMPONENTS,
        ['equal("parent_product_id", "prod-bundle")']
      )
      expect(result).toEqual([mockComponent])
    })

    it('should return empty array when no components', async () => {
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [],
        total: 0,
      })

      const result = await productComponentService.getByParentId('prod-no-components')

      expect(result).toEqual([])
    })
  })

  describe('getByChildId', () => {
    it('should get bundles containing a product', async () => {
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [mockComponent],
        total: 1,
      })

      const result = await productComponentService.getByChildId('prod-1')

      expect(mockDatabaseService.listDocuments).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCT_COMPONENTS,
        ['equal("child_product_id", "prod-1")']
      )
      expect(result).toEqual([mockComponent])
    })
  })

  describe('updateQuantity', () => {
    it('should update component quantity', async () => {
      const updatedComponent = { ...mockComponent, quantity: 10 }
      mockDatabaseService.updateDocument.mockResolvedValue(updatedComponent)

      const result = await productComponentService.updateQuantity('comp-1', 10)

      expect(mockDatabaseService.updateDocument).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCT_COMPONENTS,
        'comp-1',
        { quantity: 10 }
      )
      expect(result.quantity).toBe(10)
    })
  })

  describe('delete', () => {
    it('should delete a component', async () => {
      mockDatabaseService.deleteDocument.mockResolvedValue({})

      await productComponentService.delete('comp-1')

      expect(mockDatabaseService.deleteDocument).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCT_COMPONENTS,
        'comp-1'
      )
    })
  })

  describe('deleteAllForParent', () => {
    it('should delete all components for a parent', async () => {
      const components = [
        mockComponent,
        { ...mockComponent, $id: 'comp-2' },
        { ...mockComponent, $id: 'comp-3' },
      ]
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: components,
        total: 3,
      })
      mockDatabaseService.deleteDocument.mockResolvedValue({})

      await productComponentService.deleteAllForParent('prod-bundle')

      expect(mockDatabaseService.deleteDocument).toHaveBeenCalledTimes(3)
      expect(mockDatabaseService.deleteDocument).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCT_COMPONENTS,
        'comp-1'
      )
      expect(mockDatabaseService.deleteDocument).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCT_COMPONENTS,
        'comp-2'
      )
      expect(mockDatabaseService.deleteDocument).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCT_COMPONENTS,
        'comp-3'
      )
    })

    it('should handle parent with no components', async () => {
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [],
        total: 0,
      })

      await productComponentService.deleteAllForParent('prod-no-components')

      expect(mockDatabaseService.deleteDocument).not.toHaveBeenCalled()
    })
  })
})

describe('productService edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('create with edge values', () => {
    it('should create a product with zero cost', async () => {
      const productWithZeroCost = { ...mockProduct, cost: 0 }
      mockDatabaseService.createDocument.mockResolvedValue(productWithZeroCost)

      const result = await productService.create({
        barcode: '1234567890128',
        name: 'Free Product',
        cost: 0,
      })

      expect(mockDatabaseService.createDocument).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCTS,
        expect.objectContaining({
          cost: 0,
        })
      )
      expect(result.cost).toBe(0)
    })

    it('should create a product with null sku_code when not provided', async () => {
      mockDatabaseService.createDocument.mockResolvedValue(mockProduct)

      await productService.create({
        barcode: '1234567890128',
        name: 'No SKU Product',
      })

      expect(mockDatabaseService.createDocument).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCTS,
        expect.objectContaining({
          sku_code: null,
        })
      )
    })

    it('should create a product with very long name', async () => {
      const longName = 'A'.repeat(500)
      const productWithLongName = { ...mockProduct, name: longName }
      mockDatabaseService.createDocument.mockResolvedValue(productWithLongName)

      await productService.create({
        barcode: '1234567890128',
        name: longName,
      })

      expect(mockDatabaseService.createDocument).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCTS,
        expect.objectContaining({
          name: longName,
        })
      )
    })

    it('should create a product with special characters in name', async () => {
      const specialName = 'Product "Test" & <Special> 100%'
      const productWithSpecialName = { ...mockProduct, name: specialName }
      mockDatabaseService.createDocument.mockResolvedValue(productWithSpecialName)

      await productService.create({
        barcode: '1234567890128',
        name: specialName,
      })

      expect(mockDatabaseService.createDocument).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCTS,
        expect.objectContaining({
          name: specialName,
        })
      )
    })

    it('should create a product with high cost value', async () => {
      const highCostProduct = { ...mockProduct, cost: 999999.99 }
      mockDatabaseService.createDocument.mockResolvedValue(highCostProduct)

      await productService.create({
        barcode: '1234567890128',
        name: 'Expensive Product',
        cost: 999999.99,
      })

      expect(mockDatabaseService.createDocument).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCTS,
        expect.objectContaining({
          cost: 999999.99,
        })
      )
    })
  })

  describe('list with pagination edge cases', () => {
    it('should handle large offset values', async () => {
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [],
        total: 100,
      })

      await productService.list({ offset: 1000, limit: 50 })

      expect(mockDatabaseService.listDocuments).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCTS,
        expect.arrayContaining(['offset(1000)', 'limit(50)'])
      )
    })

    it('should handle zero limit', async () => {
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [],
        total: 0,
      })

      await productService.list({ limit: 0 })

      // limit(0) should not be added to queries
      expect(mockDatabaseService.listDocuments).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCTS,
        []
      )
    })

    it('should handle zero offset', async () => {
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [],
        total: 0,
      })

      await productService.list({ offset: 0 })

      // offset(0) should not be added to queries
      expect(mockDatabaseService.listDocuments).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCTS,
        []
      )
    })
  })

  describe('update with partial data', () => {
    it('should update only name field', async () => {
      const updatedProduct = { ...mockProduct, name: 'New Name' }
      mockDatabaseService.updateDocument.mockResolvedValue(updatedProduct)

      await productService.update('prod-1', { name: 'New Name' })

      expect(mockDatabaseService.updateDocument).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCTS,
        'prod-1',
        { name: 'New Name' }
      )
    })

    it('should update only cost field', async () => {
      const updatedProduct = { ...mockProduct, cost: 49.99 }
      mockDatabaseService.updateDocument.mockResolvedValue(updatedProduct)

      await productService.update('prod-1', { cost: 49.99 })

      expect(mockDatabaseService.updateDocument).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCTS,
        'prod-1',
        { cost: 49.99 }
      )
    })

    it('should update only type field', async () => {
      const updatedProduct = { ...mockProduct, type: 'bundle' as const }
      mockDatabaseService.updateDocument.mockResolvedValue(updatedProduct)

      await productService.update('prod-1', { type: 'bundle' })

      expect(mockDatabaseService.updateDocument).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCTS,
        'prod-1',
        { type: 'bundle' }
      )
    })

    it('should update sku_code to a new value', async () => {
      const updatedProduct = { ...mockProduct, sku_code: 'NEW-SKU' }
      mockDatabaseService.updateDocument.mockResolvedValue(updatedProduct)

      await productService.update('prod-1', { sku_code: 'NEW-SKU' })

      expect(mockDatabaseService.updateDocument).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCTS,
        'prod-1',
        { sku_code: 'NEW-SKU' }
      )
    })
  })

  describe('delete with components in both directions', () => {
    it('should delete product that is both parent and child in components', async () => {
      const parentComponent = { ...mockComponent, $id: 'parent-comp' }
      const childComponent = { ...mockComponent, $id: 'child-comp' }

      mockDatabaseService.listDocuments
        .mockResolvedValueOnce({ documents: [parentComponent], total: 1 })
        .mockResolvedValueOnce({ documents: [childComponent], total: 1 })
      mockDatabaseService.deleteDocument.mockResolvedValue({})

      await productService.delete('prod-multi')

      expect(mockDatabaseService.deleteDocument).toHaveBeenCalledTimes(3)
      expect(mockDatabaseService.deleteDocument).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCT_COMPONENTS,
        'parent-comp'
      )
      expect(mockDatabaseService.deleteDocument).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCT_COMPONENTS,
        'child-comp'
      )
      expect(mockDatabaseService.deleteDocument).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCTS,
        'prod-multi'
      )
    })
  })

  describe('getWithComponents with multiple components', () => {
    it('should return bundle with multiple components', async () => {
      const childProduct1 = { ...mockProduct, $id: 'child-1', name: 'Child 1' }
      const childProduct2 = { ...mockProduct, $id: 'child-2', name: 'Child 2' }
      const childProduct3 = { ...mockProduct, $id: 'child-3', name: 'Child 3' }

      const components: ProductComponent[] = [
        { ...mockComponent, $id: 'comp-1', child_product_id: 'child-1', quantity: 1 },
        { ...mockComponent, $id: 'comp-2', child_product_id: 'child-2', quantity: 2 },
        { ...mockComponent, $id: 'comp-3', child_product_id: 'child-3', quantity: 3 },
      ]

      mockDatabaseService.getDocument
        .mockResolvedValueOnce(mockBundleProduct)
        .mockResolvedValueOnce(childProduct1)
        .mockResolvedValueOnce(childProduct2)
        .mockResolvedValueOnce(childProduct3)

      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: components,
        total: 3,
      })

      const result = await productService.getWithComponents('prod-bundle')

      expect(result.type).toBe('bundle')
      expect(result.components).toHaveLength(3)
      expect(result.components![0].product.name).toBe('Child 1')
      expect(result.components![0].quantity).toBe(1)
      expect(result.components![1].product.name).toBe('Child 2')
      expect(result.components![1].quantity).toBe(2)
      expect(result.components![2].product.name).toBe('Child 3')
      expect(result.components![2].quantity).toBe(3)
    })
  })

  describe('search functionality', () => {
    it('should search with empty string', async () => {
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [mockProduct],
        total: 1,
      })

      await productService.list({ search: '' })

      // Empty search should not add search query
      expect(mockDatabaseService.listDocuments).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCTS,
        []
      )
    })

    it('should search with special characters', async () => {
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [],
        total: 0,
      })

      await productService.list({ search: 'Product "Test"' })

      expect(mockDatabaseService.listDocuments).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCTS,
        expect.arrayContaining(['search("name", "Product "Test"")'])
      )
    })
  })
})

describe('productComponentService edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('create with different quantities', () => {
    it('should create component with quantity 1 by default', async () => {
      mockDatabaseService.createDocument.mockResolvedValue(mockComponent)

      await productComponentService.create({
        parent_product_id: 'parent',
        child_product_id: 'child',
      })

      expect(mockDatabaseService.createDocument).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCT_COMPONENTS,
        expect.objectContaining({
          quantity: 1,
        })
      )
    })

    it('should create component with large quantity', async () => {
      const largeQuantityComponent = { ...mockComponent, quantity: 1000 }
      mockDatabaseService.createDocument.mockResolvedValue(largeQuantityComponent)

      await productComponentService.create({
        parent_product_id: 'parent',
        child_product_id: 'child',
        quantity: 1000,
      })

      expect(mockDatabaseService.createDocument).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCT_COMPONENTS,
        expect.objectContaining({
          quantity: 1000,
        })
      )
    })
  })

  describe('updateQuantity edge cases', () => {
    it('should update quantity to 1', async () => {
      const updatedComponent = { ...mockComponent, quantity: 1 }
      mockDatabaseService.updateDocument.mockResolvedValue(updatedComponent)

      const result = await productComponentService.updateQuantity('comp-1', 1)

      expect(mockDatabaseService.updateDocument).toHaveBeenCalledWith(
        COLLECTIONS.PRODUCT_COMPONENTS,
        'comp-1',
        { quantity: 1 }
      )
      expect(result.quantity).toBe(1)
    })

    it('should update quantity to a large number', async () => {
      const updatedComponent = { ...mockComponent, quantity: 9999 }
      mockDatabaseService.updateDocument.mockResolvedValue(updatedComponent)

      const result = await productComponentService.updateQuantity('comp-1', 9999)

      expect(result.quantity).toBe(9999)
    })
  })

  describe('getByParentId with many components', () => {
    it('should return multiple components for a parent', async () => {
      const manyComponents = Array.from({ length: 10 }, (_, i) => ({
        ...mockComponent,
        $id: `comp-${i}`,
        child_product_id: `child-${i}`,
        quantity: i + 1,
      }))

      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: manyComponents,
        total: 10,
      })

      const result = await productComponentService.getByParentId('prod-bundle')

      expect(result).toHaveLength(10)
      expect(result[0].quantity).toBe(1)
      expect(result[9].quantity).toBe(10)
    })
  })

  describe('getByChildId edge cases', () => {
    it('should find product in multiple bundles', async () => {
      const multipleParentComponents = [
        { ...mockComponent, $id: 'comp-1', parent_product_id: 'bundle-1' },
        { ...mockComponent, $id: 'comp-2', parent_product_id: 'bundle-2' },
        { ...mockComponent, $id: 'comp-3', parent_product_id: 'bundle-3' },
      ]

      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: multipleParentComponents,
        total: 3,
      })

      const result = await productComponentService.getByChildId('prod-1')

      expect(result).toHaveLength(3)
      expect(result.map((c) => c.parent_product_id)).toEqual([
        'bundle-1',
        'bundle-2',
        'bundle-3',
      ])
    })
  })
})
