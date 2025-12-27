import { databaseService, Query } from './database'

import type {
  CreateProductComponentInput,
  CreateProductInput,
  Product,
  ProductComponent,
  ProductWithComponents,
  UpdateProductInput,
} from '@/types/product'
import { COLLECTIONS } from '@/types/product'

export const productService = {
  /**
   * Create a new product
   */
  async create(data: CreateProductInput): Promise<Product> {
    return databaseService.createDocument<Product>(COLLECTIONS.PRODUCTS, {
      sku_code: data.sku_code ?? null,
      barcode: data.barcode,
      name: data.name,
      type: data.type ?? 'single',
      cost: data.cost ?? 0,
      stock_quantity: data.stock_quantity ?? 0,
    })
  },

  /**
   * Get a product by ID
   */
  async getById(productId: string): Promise<Product> {
    return databaseService.getDocument<Product>(COLLECTIONS.PRODUCTS, productId)
  },

  /**
   * Get a product by barcode (for scanning)
   */
  async getByBarcode(barcode: string): Promise<Product | null> {
    const result = await databaseService.listDocuments<Product>(
      COLLECTIONS.PRODUCTS,
      [Query.equal('barcode', barcode), Query.limit(1)]
    )
    return result.documents[0] ?? null
  },

  /**
   * Get a product by SKU code
   */
  async getBySku(skuCode: string): Promise<Product | null> {
    const result = await databaseService.listDocuments<Product>(
      COLLECTIONS.PRODUCTS,
      [Query.equal('sku_code', skuCode), Query.limit(1)]
    )
    return result.documents[0] ?? null
  },

  /**
   * List all products with optional filters
   */
  async list(options?: {
    type?: 'single' | 'bundle'
    limit?: number
    offset?: number
    search?: string
  }): Promise<{ documents: Product[]; total: number }> {
    const queries: string[] = []

    if (options?.type) {
      queries.push(Query.equal('type', options.type))
    }
    if (options?.search) {
      // Search across barcode, name, and sku_code using OR
      queries.push(
        Query.or([
          Query.contains('barcode', options.search),
          Query.contains('name', options.search),
          Query.contains('sku_code', options.search),
        ])
      )
    }
    if (options?.limit) {
      queries.push(Query.limit(options.limit))
    }
    if (options?.offset) {
      queries.push(Query.offset(options.offset))
    }

    return databaseService.listDocuments<Product>(COLLECTIONS.PRODUCTS, queries)
  },

  /**
   * Update a product
   */
  async update(productId: string, data: UpdateProductInput): Promise<Product> {
    return databaseService.updateDocument<Product>(
      COLLECTIONS.PRODUCTS,
      productId,
      data
    )
  },

  /**
   * Delete a product and its components
   */
  async delete(productId: string): Promise<void> {
    // First, delete any components where this product is a parent or child
    const parentComponents = await databaseService.listDocuments<ProductComponent>(
      COLLECTIONS.PRODUCT_COMPONENTS,
      [Query.equal('parent_product_id', productId)]
    )
    const childComponents = await databaseService.listDocuments<ProductComponent>(
      COLLECTIONS.PRODUCT_COMPONENTS,
      [Query.equal('child_product_id', productId)]
    )

    // Delete all related components
    for (const component of [
      ...parentComponents.documents,
      ...childComponents.documents,
    ]) {
      await databaseService.deleteDocument(
        COLLECTIONS.PRODUCT_COMPONENTS,
        component.$id
      )
    }

    // Delete the product
    await databaseService.deleteDocument(COLLECTIONS.PRODUCTS, productId)
  },

  /**
   * Get a product with its components (for bundles)
   */
  async getWithComponents(productId: string): Promise<ProductWithComponents> {
    const product = await this.getById(productId)

    if (product.type !== 'bundle') {
      return product
    }

    const componentsResult =
      await databaseService.listDocuments<ProductComponent>(
        COLLECTIONS.PRODUCT_COMPONENTS,
        [Query.equal('parent_product_id', productId)]
      )

    const components = await Promise.all(
      componentsResult.documents.map(async (component) => ({
        product: await this.getById(component.child_product_id),
        quantity: component.quantity,
      }))
    )

    return {
      ...product,
      components,
    }
  },

  /**
   * Update stock quantity for a product
   */
  async updateStock(productId: string, newQuantity: number): Promise<Product> {
    return databaseService.updateDocument<Product>(
      COLLECTIONS.PRODUCTS,
      productId,
      { stock_quantity: Math.max(0, newQuantity) }
    )
  },

  /**
   * Calculate stock requirements for a list of packaging items
   * Returns a map of product ID to required quantity
   */
  async calculateStockRequirements(
    items: Array<{
      product_barcode: string
      is_bundle?: boolean
      bundle_components?: Array<{
        product: Product
        quantity: number
      }>
    }>
  ): Promise<Map<string, { product: Product; required: number }>> {
    const requirements = new Map<string, { product: Product; required: number }>()

    for (const item of items) {
      if (item.is_bundle && item.bundle_components) {
        // For bundles, deduct from each component
        for (const component of item.bundle_components) {
          const productId = component.product.$id
          const existing = requirements.get(productId)
          if (existing) {
            existing.required += component.quantity
          } else {
            requirements.set(productId, {
              product: component.product,
              required: component.quantity,
            })
          }
        }
      } else {
        // For single products, deduct 1
        const product = await this.getByBarcode(item.product_barcode)
        if (product) {
          const existing = requirements.get(product.$id)
          if (existing) {
            existing.required += 1
          } else {
            requirements.set(product.$id, { product, required: 1 })
          }
        }
      }
    }

    return requirements
  },

  /**
   * Validate that there is sufficient stock for packaging
   */
  async validateStockForPackaging(
    items: Array<{
      product_barcode: string
      is_bundle?: boolean
      bundle_components?: Array<{
        product: Product
        quantity: number
      }>
    }>
  ): Promise<{
    valid: boolean
    insufficientStock: Array<{
      barcode: string
      name: string
      required: number
      available: number
    }>
  }> {
    const requirements = await this.calculateStockRequirements(items)
    const insufficientStock: Array<{
      barcode: string
      name: string
      required: number
      available: number
    }> = []

    for (const [, { product, required }] of requirements) {
      // Re-fetch product to get latest stock (in case of concurrent updates)
      const latestProduct = await this.getById(product.$id)
      if (latestProduct.stock_quantity < required) {
        insufficientStock.push({
          barcode: latestProduct.barcode,
          name: latestProduct.name,
          required,
          available: latestProduct.stock_quantity,
        })
      }
    }

    return {
      valid: insufficientStock.length === 0,
      insufficientStock,
    }
  },

  /**
   * Deduct stock for packaging items
   * Should be called after packaging record is successfully created
   */
  async deductStockForPackaging(
    items: Array<{
      product_barcode: string
      is_bundle?: boolean
      bundle_components?: Array<{
        product: Product
        quantity: number
      }>
    }>
  ): Promise<{ success: boolean; errors: string[] }> {
    const requirements = await this.calculateStockRequirements(items)
    const errors: string[] = []
    const updatedProducts: Array<{ productId: string; previousStock: number }> = []

    for (const [productId, { product, required }] of requirements) {
      try {
        const latestProduct = await this.getById(productId)
        const newStock = latestProduct.stock_quantity - required

        if (newStock < 0) {
          errors.push(`Insufficient stock for ${product.name}: required ${required}, available ${latestProduct.stock_quantity}`)
          continue
        }

        updatedProducts.push({ productId, previousStock: latestProduct.stock_quantity })
        await this.updateStock(productId, newStock)
      } catch (error) {
        errors.push(`Failed to update stock for ${product.name}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    // If there were errors, attempt to rollback successful updates
    if (errors.length > 0) {
      for (const { productId, previousStock } of updatedProducts) {
        try {
          await this.updateStock(productId, previousStock)
        } catch {
          // Log but don't throw - we're already in error recovery
          console.error(`Failed to rollback stock for product ${productId}`)
        }
      }
    }

    return { success: errors.length === 0, errors }
  },

  /**
   * Restore stock when a packaging record is deleted
   */
  async restoreStockForPackaging(
    items: Array<{
      product_barcode: string
      is_bundle?: boolean
      bundle_components?: Array<{
        product: Product
        quantity: number
      }>
    }>
  ): Promise<{ success: boolean; errors: string[] }> {
    const requirements = await this.calculateStockRequirements(items)
    const errors: string[] = []

    for (const [productId, { product, required }] of requirements) {
      try {
        const latestProduct = await this.getById(productId)
        const newStock = latestProduct.stock_quantity + required
        await this.updateStock(productId, newStock)
      } catch (error) {
        errors.push(`Failed to restore stock for ${product.name}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    return { success: errors.length === 0, errors }
  },
}

export const productComponentService = {
  /**
   * Add a component to a bundle
   */
  async create(data: CreateProductComponentInput): Promise<ProductComponent> {
    return databaseService.createDocument<ProductComponent>(
      COLLECTIONS.PRODUCT_COMPONENTS,
      {
        parent_product_id: data.parent_product_id,
        child_product_id: data.child_product_id,
        quantity: data.quantity ?? 1,
      }
    )
  },

  /**
   * Get components for a bundle
   */
  async getByParentId(parentProductId: string): Promise<ProductComponent[]> {
    const result = await databaseService.listDocuments<ProductComponent>(
      COLLECTIONS.PRODUCT_COMPONENTS,
      [Query.equal('parent_product_id', parentProductId)]
    )
    return result.documents
  },

  /**
   * Get bundles that contain a specific product
   */
  async getByChildId(childProductId: string): Promise<ProductComponent[]> {
    const result = await databaseService.listDocuments<ProductComponent>(
      COLLECTIONS.PRODUCT_COMPONENTS,
      [Query.equal('child_product_id', childProductId)]
    )
    return result.documents
  },

  /**
   * Update component quantity
   */
  async updateQuantity(
    componentId: string,
    quantity: number
  ): Promise<ProductComponent> {
    return databaseService.updateDocument<ProductComponent>(
      COLLECTIONS.PRODUCT_COMPONENTS,
      componentId,
      { quantity }
    )
  },

  /**
   * Remove a component from a bundle
   */
  async delete(componentId: string): Promise<void> {
    await databaseService.deleteDocument(
      COLLECTIONS.PRODUCT_COMPONENTS,
      componentId
    )
  },

  /**
   * Remove all components from a bundle
   * @param parentProductId - The parent bundle product ID
   * @param delayMs - Optional delay between delete operations to avoid rate limiting
   */
  async deleteAllForParent(parentProductId: string, delayMs = 0): Promise<void> {
    const components = await this.getByParentId(parentProductId)
    for (const component of components) {
      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
      await databaseService.deleteDocument(
        COLLECTIONS.PRODUCT_COMPONENTS,
        component.$id
      )
    }
  },
}
