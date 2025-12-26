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
      price: data.price ?? 0,
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
      queries.push(Query.search('name', options.search))
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
