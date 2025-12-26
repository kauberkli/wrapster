/**
 * Appwrite Migration Script: Products & Product Components
 *
 * This script creates the following tables:
 * 1. products - Master product list with SKU, barcode, name, type, and price
 * 2. product_components - Bundle recipe linking parent products to child products
 *
 * Usage:
 *   npx tsx scripts/migrate-products.ts
 *
 * Required environment variables:
 *   VITE_APPWRITE_ENDPOINT    - Appwrite server endpoint
 *   VITE_APPWRITE_PROJECT_ID  - Project ID
 *   VITE_APPWRITE_DATABASE_ID - Database ID
 *   APPWRITE_API_KEY          - Server API key with databases.write permission
 */

import 'dotenv/config'

import { Client, IndexType, Permission, Role, TablesDB } from 'node-appwrite'

// Configuration
const config = {
  endpoint: process.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1',
  projectId: process.env.VITE_APPWRITE_PROJECT_ID || '',
  apiKey: process.env.APPWRITE_API_KEY || '',
  databaseId: process.env.VITE_APPWRITE_DATABASE_ID || '',
}

// Table IDs (equivalent to collection IDs)
export const TABLES = {
  PRODUCTS: 'products',
  PRODUCT_COMPONENTS: 'product_components',
} as const

// Initialize Appwrite client
const client = new Client()
  .setEndpoint(config.endpoint)
  .setProject(config.projectId)
  .setKey(config.apiKey)

const tablesDB = new TablesDB(client)

// Helper function to wait (Appwrite needs time between column creations)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Helper to check if table exists
async function tableExists(tableId: string): Promise<boolean> {
  try {
    await tablesDB.getTable({
      databaseId: config.databaseId,
      tableId,
    })
    return true
  } catch {
    return false
  }
}

// Helper to check if column exists
async function columnExists(tableId: string, key: string): Promise<boolean> {
  try {
    await tablesDB.getColumn({
      databaseId: config.databaseId,
      tableId,
      key,
    })
    return true
  } catch {
    return false
  }
}

// Helper to check if index exists
async function indexExists(tableId: string, key: string): Promise<boolean> {
  try {
    await tablesDB.getIndex({
      databaseId: config.databaseId,
      tableId,
      key,
    })
    return true
  } catch {
    return false
  }
}

/**
 * Create the Products table
 */
async function createProductsTable() {
  console.log('\n--- Creating Products Table ---')

  // Create table if it doesn't exist
  if (await tableExists(TABLES.PRODUCTS)) {
    console.log('Table "products" already exists, skipping creation...')
  } else {
    await tablesDB.createTable({
      databaseId: config.databaseId,
      tableId: TABLES.PRODUCTS,
      name: 'Products',
      permissions: [
        Permission.read(Role.users()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ],
      rowSecurity: false,
      enabled: true,
    })
    console.log('Created table: products')
  }

  await sleep(500)

  // Create columns
  const columns = [
    {
      key: 'sku_code',
      create: () =>
        tablesDB.createStringColumn({
          databaseId: config.databaseId,
          tableId: TABLES.PRODUCTS,
          key: 'sku_code',
          size: 50,
          required: false, // SKU is optional
        }),
    },
    {
      key: 'barcode',
      create: () =>
        tablesDB.createStringColumn({
          databaseId: config.databaseId,
          tableId: TABLES.PRODUCTS,
          key: 'barcode',
          size: 100,
          required: true,
        }),
    },
    {
      key: 'name',
      create: () =>
        tablesDB.createStringColumn({
          databaseId: config.databaseId,
          tableId: TABLES.PRODUCTS,
          key: 'name',
          size: 255,
          required: false,
        }),
    },
    {
      key: 'type',
      create: () =>
        tablesDB.createEnumColumn({
          databaseId: config.databaseId,
          tableId: TABLES.PRODUCTS,
          key: 'type',
          elements: ['single', 'bundle'],
          required: false,
          xdefault: 'single',
        }),
    },
    {
      key: 'price',
      create: () =>
        tablesDB.createFloatColumn({
          databaseId: config.databaseId,
          tableId: TABLES.PRODUCTS,
          key: 'price',
          required: false,
          min: 0,
          max: 9999999999.99,
        }),
    },
  ]

  for (const col of columns) {
    if (await columnExists(TABLES.PRODUCTS, col.key)) {
      console.log(`Column "${col.key}" already exists, skipping...`)
    } else {
      await col.create()
      console.log(`Created column: ${col.key}`)
      await sleep(1000) // Wait for column to be ready
    }
  }

  // Create indexes
  const indexes = [
    {
      key: 'idx_sku_code',
      create: () =>
        tablesDB.createIndex({
          databaseId: config.databaseId,
          tableId: TABLES.PRODUCTS,
          key: 'idx_sku_code',
          type: IndexType.Key, // Key index since SKU is optional
          columns: ['sku_code'],
        }),
    },
    {
      key: 'idx_barcode',
      create: () =>
        tablesDB.createIndex({
          databaseId: config.databaseId,
          tableId: TABLES.PRODUCTS,
          key: 'idx_barcode',
          type: IndexType.Unique,
          columns: ['barcode'],
        }),
    },
    {
      key: 'idx_type',
      create: () =>
        tablesDB.createIndex({
          databaseId: config.databaseId,
          tableId: TABLES.PRODUCTS,
          key: 'idx_type',
          type: IndexType.Key,
          columns: ['type'],
        }),
    },
  ]

  for (const idx of indexes) {
    if (await indexExists(TABLES.PRODUCTS, idx.key)) {
      console.log(`Index "${idx.key}" already exists, skipping...`)
    } else {
      await idx.create()
      console.log(`Created index: ${idx.key}`)
      await sleep(1000)
    }
  }

  console.log('Products table setup complete!')
}

/**
 * Create the Product Components table (Bundle Recipe)
 */
async function createProductComponentsTable() {
  console.log('\n--- Creating Product Components Table ---')

  // Create table if it doesn't exist
  if (await tableExists(TABLES.PRODUCT_COMPONENTS)) {
    console.log('Table "product_components" already exists, skipping creation...')
  } else {
    await tablesDB.createTable({
      databaseId: config.databaseId,
      tableId: TABLES.PRODUCT_COMPONENTS,
      name: 'Product Components',
      permissions: [
        Permission.read(Role.users()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ],
      rowSecurity: false,
      enabled: true,
    })
    console.log('Created table: product_components')
  }

  await sleep(500)

  // Create columns
  const columns = [
    {
      key: 'parent_product_id',
      create: () =>
        tablesDB.createStringColumn({
          databaseId: config.databaseId,
          tableId: TABLES.PRODUCT_COMPONENTS,
          key: 'parent_product_id',
          size: 36, // Appwrite document ID length
          required: true,
        }),
    },
    {
      key: 'child_product_id',
      create: () =>
        tablesDB.createStringColumn({
          databaseId: config.databaseId,
          tableId: TABLES.PRODUCT_COMPONENTS,
          key: 'child_product_id',
          size: 36,
          required: true,
        }),
    },
    {
      key: 'quantity',
      create: () =>
        tablesDB.createIntegerColumn({
          databaseId: config.databaseId,
          tableId: TABLES.PRODUCT_COMPONENTS,
          key: 'quantity',
          required: false,
          min: 1,
          max: 999999,
          xdefault: 1,
        }),
    },
  ]

  for (const col of columns) {
    if (await columnExists(TABLES.PRODUCT_COMPONENTS, col.key)) {
      console.log(`Column "${col.key}" already exists, skipping...`)
    } else {
      await col.create()
      console.log(`Created column: ${col.key}`)
      await sleep(1000)
    }
  }

  // Create indexes for fast lookups
  const indexes = [
    {
      key: 'idx_parent_product',
      create: () =>
        tablesDB.createIndex({
          databaseId: config.databaseId,
          tableId: TABLES.PRODUCT_COMPONENTS,
          key: 'idx_parent_product',
          type: IndexType.Key,
          columns: ['parent_product_id'],
        }),
    },
    {
      key: 'idx_child_product',
      create: () =>
        tablesDB.createIndex({
          databaseId: config.databaseId,
          tableId: TABLES.PRODUCT_COMPONENTS,
          key: 'idx_child_product',
          type: IndexType.Key,
          columns: ['child_product_id'],
        }),
    },
    {
      key: 'idx_parent_child',
      create: () =>
        tablesDB.createIndex({
          databaseId: config.databaseId,
          tableId: TABLES.PRODUCT_COMPONENTS,
          key: 'idx_parent_child',
          type: IndexType.Unique,
          columns: ['parent_product_id', 'child_product_id'],
        }),
    },
  ]

  for (const idx of indexes) {
    if (await indexExists(TABLES.PRODUCT_COMPONENTS, idx.key)) {
      console.log(`Index "${idx.key}" already exists, skipping...`)
    } else {
      await idx.create()
      console.log(`Created index: ${idx.key}`)
      await sleep(1000)
    }
  }

  console.log('Product Components table setup complete!')
}

/**
 * Main migration function
 */
async function migrate() {
  console.log('='.repeat(50))
  console.log('Appwrite Migration: Products & Product Components')
  console.log('='.repeat(50))

  // Validate configuration
  if (!config.projectId) {
    console.error('Error: VITE_APPWRITE_PROJECT_ID is not set')
    process.exit(1)
  }
  if (!config.apiKey) {
    console.error('Error: APPWRITE_API_KEY is not set')
    process.exit(1)
  }
  if (!config.databaseId) {
    console.error('Error: VITE_APPWRITE_DATABASE_ID is not set')
    process.exit(1)
  }

  console.log(`\nEndpoint: ${config.endpoint}`)
  console.log(`Project: ${config.projectId}`)
  console.log(`Database: ${config.databaseId}`)

  try {
    // Verify database exists
    await tablesDB.get({ databaseId: config.databaseId })
    console.log('\nDatabase connection verified!')

    // Run migrations
    await createProductsTable()
    await createProductComponentsTable()

    console.log('\n' + '='.repeat(50))
    console.log('Migration completed successfully!')
    console.log('='.repeat(50))
  } catch (error) {
    console.error('\nMigration failed:', error)
    process.exit(1)
  }
}

// Run migration
migrate()
