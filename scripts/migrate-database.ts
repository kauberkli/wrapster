/**
 * Appwrite Database Migration Script
 *
 * This script creates all tables in the database:
 * 1. products - Master product list with SKU, barcode, name, type, and price
 * 2. product_components - Bundle recipe linking parent products to child products
 * 3. packaging_records - Waybill tracking with date (unique per date)
 * 4. packaging_items - Individual product scans linked to packaging records
 * 5. import_jobs - Tracking async import/export jobs
 *
 * Usage:
 *   npx tsx scripts/migrate-database.ts
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

// Table IDs
export const TABLES = {
  PRODUCTS: 'products',
  PRODUCT_COMPONENTS: 'product_components',
  PACKAGING_RECORDS: 'packaging_records',
  PACKAGING_ITEMS: 'packaging_items',
  IMPORT_JOBS: 'import_jobs',
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
          required: false,
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
      await sleep(1000)
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
          type: IndexType.Key,
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
          size: 36,
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

  // Create indexes
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
 * Create the Packaging Records table
 */
async function createPackagingRecordsTable() {
  console.log('\n--- Creating Packaging Records Table ---')

  // Create table if it doesn't exist
  if (await tableExists(TABLES.PACKAGING_RECORDS)) {
    console.log('Table "packaging_records" already exists, skipping creation...')
  } else {
    await tablesDB.createTable({
      databaseId: config.databaseId,
      tableId: TABLES.PACKAGING_RECORDS,
      name: 'Packaging Records',
      permissions: [
        Permission.read(Role.users()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ],
      rowSecurity: false,
      enabled: true,
    })
    console.log('Created table: packaging_records')
  }

  await sleep(500)

  // Create columns
  const columns = [
    {
      key: 'packaging_date',
      create: () =>
        tablesDB.createStringColumn({
          databaseId: config.databaseId,
          tableId: TABLES.PACKAGING_RECORDS,
          key: 'packaging_date',
          size: 10,
          required: true,
        }),
    },
    {
      key: 'waybill_number',
      create: () =>
        tablesDB.createStringColumn({
          databaseId: config.databaseId,
          tableId: TABLES.PACKAGING_RECORDS,
          key: 'waybill_number',
          size: 100,
          required: true,
        }),
    },
  ]

  for (const col of columns) {
    if (await columnExists(TABLES.PACKAGING_RECORDS, col.key)) {
      console.log(`Column "${col.key}" already exists, skipping...`)
    } else {
      await col.create()
      console.log(`Created column: ${col.key}`)
      await sleep(1000)
    }
  }

  // Create indexes
  const indexes = [
    {
      key: 'idx_packaging_date',
      create: () =>
        tablesDB.createIndex({
          databaseId: config.databaseId,
          tableId: TABLES.PACKAGING_RECORDS,
          key: 'idx_packaging_date',
          type: IndexType.Key,
          columns: ['packaging_date'],
        }),
    },
    {
      key: 'idx_waybill_number',
      create: () =>
        tablesDB.createIndex({
          databaseId: config.databaseId,
          tableId: TABLES.PACKAGING_RECORDS,
          key: 'idx_waybill_number',
          type: IndexType.Key,
          columns: ['waybill_number'],
        }),
    },
    {
      key: 'idx_date_waybill',
      create: () =>
        tablesDB.createIndex({
          databaseId: config.databaseId,
          tableId: TABLES.PACKAGING_RECORDS,
          key: 'idx_date_waybill',
          type: IndexType.Unique,
          columns: ['packaging_date', 'waybill_number'],
        }),
    },
  ]

  for (const idx of indexes) {
    if (await indexExists(TABLES.PACKAGING_RECORDS, idx.key)) {
      console.log(`Index "${idx.key}" already exists, skipping...`)
    } else {
      await idx.create()
      console.log(`Created index: ${idx.key}`)
      await sleep(1000)
    }
  }

  console.log('Packaging Records table setup complete!')
}

/**
 * Create the Packaging Items table
 */
async function createPackagingItemsTable() {
  console.log('\n--- Creating Packaging Items Table ---')

  // Create table if it doesn't exist
  if (await tableExists(TABLES.PACKAGING_ITEMS)) {
    console.log('Table "packaging_items" already exists, skipping creation...')
  } else {
    await tablesDB.createTable({
      databaseId: config.databaseId,
      tableId: TABLES.PACKAGING_ITEMS,
      name: 'Packaging Items',
      permissions: [
        Permission.read(Role.users()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ],
      rowSecurity: false,
      enabled: true,
    })
    console.log('Created table: packaging_items')
  }

  await sleep(500)

  // Create columns
  const columns = [
    {
      key: 'packaging_record_id',
      create: () =>
        tablesDB.createStringColumn({
          databaseId: config.databaseId,
          tableId: TABLES.PACKAGING_ITEMS,
          key: 'packaging_record_id',
          size: 36,
          required: true,
        }),
    },
    {
      key: 'product_barcode',
      create: () =>
        tablesDB.createStringColumn({
          databaseId: config.databaseId,
          tableId: TABLES.PACKAGING_ITEMS,
          key: 'product_barcode',
          size: 100,
          required: true,
        }),
    },
    {
      key: 'scanned_at',
      create: () =>
        tablesDB.createDatetimeColumn({
          databaseId: config.databaseId,
          tableId: TABLES.PACKAGING_ITEMS,
          key: 'scanned_at',
          required: true,
        }),
    },
  ]

  for (const col of columns) {
    if (await columnExists(TABLES.PACKAGING_ITEMS, col.key)) {
      console.log(`Column "${col.key}" already exists, skipping...`)
    } else {
      await col.create()
      console.log(`Created column: ${col.key}`)
      await sleep(1000)
    }
  }

  // Create indexes
  const indexes = [
    {
      key: 'idx_packaging_record',
      create: () =>
        tablesDB.createIndex({
          databaseId: config.databaseId,
          tableId: TABLES.PACKAGING_ITEMS,
          key: 'idx_packaging_record',
          type: IndexType.Key,
          columns: ['packaging_record_id'],
        }),
    },
    {
      key: 'idx_product_barcode',
      create: () =>
        tablesDB.createIndex({
          databaseId: config.databaseId,
          tableId: TABLES.PACKAGING_ITEMS,
          key: 'idx_product_barcode',
          type: IndexType.Key,
          columns: ['product_barcode'],
        }),
    },
  ]

  for (const idx of indexes) {
    if (await indexExists(TABLES.PACKAGING_ITEMS, idx.key)) {
      console.log(`Index "${idx.key}" already exists, skipping...`)
    } else {
      await idx.create()
      console.log(`Created index: ${idx.key}`)
      await sleep(1000)
    }
  }

  console.log('Packaging Items table setup complete!')
}

/**
 * Create the Import Jobs table
 */
async function createImportJobsTable() {
  console.log('\n--- Creating Import Jobs Table ---')

  // Create table if it doesn't exist
  if (await tableExists(TABLES.IMPORT_JOBS)) {
    console.log('Table "import_jobs" already exists, skipping creation...')
  } else {
    await tablesDB.createTable({
      databaseId: config.databaseId,
      tableId: TABLES.IMPORT_JOBS,
      name: 'Import Jobs',
      permissions: [
        Permission.read(Role.users()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ],
      rowSecurity: false,
      enabled: true,
    })
    console.log('Created table: import_jobs')
  }

  await sleep(500)

  // Create columns
  const columns = [
    {
      key: 'user_id',
      create: () =>
        tablesDB.createStringColumn({
          databaseId: config.databaseId,
          tableId: TABLES.IMPORT_JOBS,
          key: 'user_id',
          size: 36,
          required: true,
        }),
    },
    {
      key: 'action',
      create: () =>
        tablesDB.createEnumColumn({
          databaseId: config.databaseId,
          tableId: TABLES.IMPORT_JOBS,
          key: 'action',
          elements: ['import', 'export'],
          required: true,
        }),
    },
    {
      key: 'status',
      create: () =>
        tablesDB.createEnumColumn({
          databaseId: config.databaseId,
          tableId: TABLES.IMPORT_JOBS,
          key: 'status',
          elements: ['pending', 'processing', 'completed', 'failed'],
          required: false,
          xdefault: 'pending',
        }),
    },
    {
      key: 'file_id',
      create: () =>
        tablesDB.createStringColumn({
          databaseId: config.databaseId,
          tableId: TABLES.IMPORT_JOBS,
          key: 'file_id',
          size: 36,
          required: false,
        }),
    },
    {
      key: 'result_file_id',
      create: () =>
        tablesDB.createStringColumn({
          databaseId: config.databaseId,
          tableId: TABLES.IMPORT_JOBS,
          key: 'result_file_id',
          size: 36,
          required: false,
        }),
    },
    {
      key: 'filters',
      create: () =>
        tablesDB.createStringColumn({
          databaseId: config.databaseId,
          tableId: TABLES.IMPORT_JOBS,
          key: 'filters',
          size: 1000,
          required: false,
        }),
    },
    {
      key: 'stats',
      create: () =>
        tablesDB.createStringColumn({
          databaseId: config.databaseId,
          tableId: TABLES.IMPORT_JOBS,
          key: 'stats',
          size: 1000,
          required: false,
        }),
    },
    {
      key: 'error',
      create: () =>
        tablesDB.createStringColumn({
          databaseId: config.databaseId,
          tableId: TABLES.IMPORT_JOBS,
          key: 'error',
          size: 2000,
          required: false,
        }),
    },
    {
      key: 'created_at',
      create: () =>
        tablesDB.createDatetimeColumn({
          databaseId: config.databaseId,
          tableId: TABLES.IMPORT_JOBS,
          key: 'created_at',
          required: true,
        }),
    },
    {
      key: 'completed_at',
      create: () =>
        tablesDB.createDatetimeColumn({
          databaseId: config.databaseId,
          tableId: TABLES.IMPORT_JOBS,
          key: 'completed_at',
          required: false,
        }),
    },
  ]

  for (const col of columns) {
    if (await columnExists(TABLES.IMPORT_JOBS, col.key)) {
      console.log(`Column "${col.key}" already exists, skipping...`)
    } else {
      await col.create()
      console.log(`Created column: ${col.key}`)
      await sleep(1000)
    }
  }

  // Create indexes
  const indexes = [
    {
      key: 'idx_user_id',
      create: () =>
        tablesDB.createIndex({
          databaseId: config.databaseId,
          tableId: TABLES.IMPORT_JOBS,
          key: 'idx_user_id',
          type: IndexType.Key,
          columns: ['user_id'],
        }),
    },
    {
      key: 'idx_status',
      create: () =>
        tablesDB.createIndex({
          databaseId: config.databaseId,
          tableId: TABLES.IMPORT_JOBS,
          key: 'idx_status',
          type: IndexType.Key,
          columns: ['status'],
        }),
    },
    {
      key: 'idx_action',
      create: () =>
        tablesDB.createIndex({
          databaseId: config.databaseId,
          tableId: TABLES.IMPORT_JOBS,
          key: 'idx_action',
          type: IndexType.Key,
          columns: ['action'],
        }),
    },
    {
      key: 'idx_user_status',
      create: () =>
        tablesDB.createIndex({
          databaseId: config.databaseId,
          tableId: TABLES.IMPORT_JOBS,
          key: 'idx_user_status',
          type: IndexType.Key,
          columns: ['user_id', 'status'],
        }),
    },
  ]

  for (const idx of indexes) {
    if (await indexExists(TABLES.IMPORT_JOBS, idx.key)) {
      console.log(`Index "${idx.key}" already exists, skipping...`)
    } else {
      await idx.create()
      console.log(`Created index: ${idx.key}`)
      await sleep(1000)
    }
  }

  console.log('Import Jobs table setup complete!')
}

/**
 * Main migration function
 */
async function migrate() {
  console.log('='.repeat(50))
  console.log('Appwrite Database Migration')
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

  const tables = Object.values(TABLES)
  console.log(`\nTables to create: ${tables.join(', ')}`)

  try {
    // Verify database exists
    await tablesDB.get({ databaseId: config.databaseId })
    console.log('\nDatabase connection verified!')

    // Run all migrations
    await createProductsTable()
    await createProductComponentsTable()
    await createPackagingRecordsTable()
    await createPackagingItemsTable()
    await createImportJobsTable()

    console.log('\n' + '='.repeat(50))
    console.log('Migration completed successfully!')
    console.log(`Created/verified ${tables.length} tables`)
    console.log('='.repeat(50))
  } catch (error) {
    console.error('\nMigration failed:', error)
    process.exit(1)
  }
}

// Run migration
migrate()
