/**
 * Appwrite Migration Script: Packaging Records & Items
 *
 * This script creates the following tables:
 * 1. packaging_records - Waybill tracking with date (unique per date)
 * 2. packaging_items - Individual product scans linked to packaging records
 *
 * Usage:
 *   npx tsx scripts/migrate-packaging.ts
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
  PACKAGING_RECORDS: 'packaging_records',
  PACKAGING_ITEMS: 'packaging_items',
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
          size: 10, // YYYY-MM-DD format
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
      await sleep(1000) // Wait for column to be ready
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
          size: 36, // Appwrite document ID length
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

  // Create indexes for fast lookups
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
 * Main migration function
 */
async function migrate() {
  console.log('='.repeat(50))
  console.log('Appwrite Migration: Packaging Records & Items')
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
    await createPackagingRecordsTable()
    await createPackagingItemsTable()

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
