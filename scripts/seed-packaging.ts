/**
 * Packaging Seeder Script
 *
 * Generates packaging records from 2025-12-01 to today for testing purposes.
 *
 * Usage:
 *   npx tsx scripts/seed-packaging.ts
 *
 * Required environment variables:
 *   VITE_APPWRITE_ENDPOINT    - Appwrite server endpoint
 *   VITE_APPWRITE_PROJECT_ID  - Project ID
 *   VITE_APPWRITE_DATABASE_ID - Database ID
 *   APPWRITE_API_KEY          - Server API key with databases.write permission
 */

import 'dotenv/config'

import { Client, Databases, ID, Query, TablesDB } from 'node-appwrite'

// Configuration
const config = {
  endpoint: process.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1',
  projectId: process.env.VITE_APPWRITE_PROJECT_ID || '',
  apiKey: process.env.APPWRITE_API_KEY || '',
  databaseId: process.env.VITE_APPWRITE_DATABASE_ID || '',
}

const PACKAGING_RECORDS_TABLE = 'packaging_records'
const PACKAGING_ITEMS_TABLE = 'packaging_items'
const PRODUCTS_TABLE = 'products'
const BATCH_SIZE = 100
const DELAY_BETWEEN_BATCHES = 500

// Date range
const START_DATE = new Date('2025-12-01')
const END_DATE = new Date() // Today

// Initialize Appwrite client
const client = new Client()
  .setEndpoint(config.endpoint)
  .setProject(config.projectId)
  .setKey(config.apiKey)

const tablesDB = new TablesDB(client)
const databases = new Databases(client)

// Helper to get random element from array
function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// Helper to get random number in range
function randomNumber(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// Generate waybill number
function generateWaybill(dateStr: string, index: number): string {
  const prefixes = ['WB', 'SHP', 'PKG', 'DLV', 'ORD']
  const prefix = randomElement(prefixes)
  const datePart = dateStr.replace(/-/g, '')
  const sequence = String(index).padStart(4, '0')
  return `${prefix}-${datePart}-${sequence}`
}

// Format date to YYYY-MM-DD
function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Get all dates between start and end
function getDateRange(start: Date, end: Date): string[] {
  const dates: string[] = []
  const current = new Date(start)

  while (current <= end) {
    dates.push(formatDate(current))
    current.setDate(current.getDate() + 1)
  }

  return dates
}

// Sleep helper
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Progress bar helper
function printProgress(current: number, total: number, startTime: number, label = '') {
  const percent = Math.round((current / total) * 100)
  const elapsed = (Date.now() - startTime) / 1000
  const rate = current / elapsed
  const eta = Math.round((total - current) / rate)

  const barLength = 30
  const filledLength = Math.round((percent / 100) * barLength)
  const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength)

  process.stdout.write(
    `\r${label}[${bar}] ${percent}% | ${current}/${total} | ${rate.toFixed(1)}/s | ETA: ${eta}s`
  )
}

/**
 * Main seeder function
 */
async function seed() {
  console.log('='.repeat(60))
  console.log('Packaging Seeder - Generating Packaging Records')
  console.log('='.repeat(60))

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

  const dates = getDateRange(START_DATE, END_DATE)

  console.log(`\nEndpoint: ${config.endpoint}`)
  console.log(`Project: ${config.projectId}`)
  console.log(`Database: ${config.databaseId}`)
  console.log(`Date Range: ${formatDate(START_DATE)} to ${formatDate(END_DATE)}`)
  console.log(`Total Days: ${dates.length}`)
  console.log('')

  // Fetch product barcodes for items
  console.log('Fetching products for packaging items...')
  const productBarcodes: string[] = []
  let offset = 0
  const limit = 100

  while (productBarcodes.length < 500) {
    try {
      const result = await databases.listDocuments(
        config.databaseId,
        PRODUCTS_TABLE,
        [Query.limit(limit), Query.offset(offset)]
      )
      productBarcodes.push(...result.documents.map((d) => d.barcode as string))
      if (result.documents.length < limit) break
      offset += limit
    } catch (err) {
      console.error('Error fetching products:', err)
      break
    }
  }

  if (productBarcodes.length === 0) {
    console.error('No products found. Please run seed-products.ts first.')
    process.exit(1)
  }

  console.log(`Found ${productBarcodes.length} products to use\n`)

  const startTime = Date.now()
  let totalRecords = 0
  let totalItems = 0
  let recordsFailed = 0
  let itemsFailed = 0

  // Generate records for each date
  const recordRows: Array<{
    $id: string
    packaging_date: string
    waybill_number: string
  }> = []
  const itemRows: Array<{
    $id: string
    packaging_record_id: string
    product_barcode: string
    scanned_at: string
  }> = []

  console.log('Generating packaging data...')

  for (const dateStr of dates) {
    // Random number of records per day (3-15)
    const recordsPerDay = randomNumber(3, 15)

    for (let i = 0; i < recordsPerDay; i++) {
      const recordId = ID.unique()
      const waybill = generateWaybill(dateStr, i + 1)

      recordRows.push({
        $id: recordId,
        packaging_date: dateStr,
        waybill_number: waybill,
      })

      // Random number of items per record (1-8)
      const itemsPerRecord = randomNumber(1, 8)

      for (let j = 0; j < itemsPerRecord; j++) {
        const barcode = randomElement(productBarcodes)
        // Generate a timestamp for this item on the given date
        const hour = randomNumber(8, 18)
        const minute = randomNumber(0, 59)
        const second = randomNumber(0, 59)
        const scannedAt = `${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}.000Z`

        itemRows.push({
          $id: ID.unique(),
          packaging_record_id: recordId,
          product_barcode: barcode,
          scanned_at: scannedAt,
        })
      }
    }
  }

  console.log(`Generated ${recordRows.length} records with ${itemRows.length} items\n`)

  // Insert packaging records in batches
  console.log('Inserting packaging records...')
  const recordsStartTime = Date.now()

  for (let i = 0; i < recordRows.length; i += BATCH_SIZE) {
    const batch = recordRows.slice(i, i + BATCH_SIZE)

    try {
      await tablesDB.createRows({
        databaseId: config.databaseId,
        tableId: PACKAGING_RECORDS_TABLE,
        rows: batch,
      })
      totalRecords += batch.length
    } catch (err) {
      recordsFailed += batch.length
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      console.error(`\nRecords batch failed:`, errorMessage)
    }

    printProgress(i + batch.length, recordRows.length, recordsStartTime, 'Records: ')

    if (i + BATCH_SIZE < recordRows.length) {
      await sleep(DELAY_BETWEEN_BATCHES)
    }
  }

  console.log('\n')

  // Insert packaging items in batches
  console.log('Inserting packaging items...')
  const itemsStartTime = Date.now()

  for (let i = 0; i < itemRows.length; i += BATCH_SIZE) {
    const batch = itemRows.slice(i, i + BATCH_SIZE)

    try {
      await tablesDB.createRows({
        databaseId: config.databaseId,
        tableId: PACKAGING_ITEMS_TABLE,
        rows: batch,
      })
      totalItems += batch.length
    } catch (err) {
      itemsFailed += batch.length
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      console.error(`\nItems batch failed:`, errorMessage)
    }

    printProgress(i + batch.length, itemRows.length, itemsStartTime, 'Items: ')

    if (i + BATCH_SIZE < itemRows.length) {
      await sleep(DELAY_BETWEEN_BATCHES)
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2)

  console.log('\n\n' + '='.repeat(60))
  console.log('Packaging Seeding Complete!')
  console.log('='.repeat(60))
  console.log(`Records Created: ${totalRecords}`)
  console.log(`Records Failed: ${recordsFailed}`)
  console.log(`Items Created: ${totalItems}`)
  console.log(`Items Failed: ${itemsFailed}`)
  console.log(`Total Time: ${elapsed}s`)
  console.log(`Date Range: ${formatDate(START_DATE)} to ${formatDate(END_DATE)}`)
}

// Run seeder
seed().catch((error) => {
  console.error('\nSeeding failed:', error)
  process.exit(1)
})
