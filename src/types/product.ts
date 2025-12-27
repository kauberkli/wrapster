import type { Models } from 'appwrite'

/**
 * Product type: single item or bundle containing multiple items
 */
export type ProductType = 'single' | 'bundle'

/**
 * Product document from Appwrite
 */
export interface Product extends Models.Document {
  sku_code: string | null // Optional SKU code
  barcode: string
  name: string
  type: ProductType
  cost: number
  stock_quantity: number // Available stock (only tracked for single products, bundles use 0)
}

/**
 * Product component (bundle recipe) document from Appwrite
 * Links a parent product (bundle) to its child products
 */
export interface ProductComponent extends Models.Document {
  parent_product_id: string
  child_product_id: string
  quantity: number
}

/**
 * Product with its components expanded (for bundles)
 */
export interface ProductWithComponents extends Product {
  components?: Array<{
    product: Product
    quantity: number
  }>
}

/**
 * Input data for creating a new product
 */
export type CreateProductInput = {
  sku_code?: string
  barcode: string
  name: string
  type?: ProductType
  cost?: number
  stock_quantity?: number // Defaults to 0
}

/**
 * Input data for updating a product
 */
export type UpdateProductInput = Partial<CreateProductInput>

/**
 * Input data for creating a product component
 */
export type CreateProductComponentInput = {
  parent_product_id: string
  child_product_id: string
  quantity?: number
}

/**
 * Collection IDs for Appwrite
 */
export const COLLECTIONS = {
  PRODUCTS: 'products',
  PRODUCT_COMPONENTS: 'product_components',
} as const
