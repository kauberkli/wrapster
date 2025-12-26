/**
 * Product Seeder Script
 *
 * Generates 10,000 product records for testing purposes.
 *
 * Usage:
 *   npx tsx scripts/seed-products.ts
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

const TABLE_ID = 'products'
const COMPONENTS_TABLE_ID = 'product_components'
const TOTAL_PRODUCTS = 10000
const BATCH_SIZE = 100 // Number of rows per batch insert
const DELAY_BETWEEN_BATCHES = 500 // ms delay between batches to avoid rate limiting

// Initialize Appwrite client
const client = new Client()
  .setEndpoint(config.endpoint)
  .setProject(config.projectId)
  .setKey(config.apiKey)

const tablesDB = new TablesDB(client)
const databases = new Databases(client)

// Product name prefixes and suffixes for generating realistic names
const adjectives = [
  'Premium', 'Classic', 'Deluxe', 'Essential', 'Professional', 'Ultimate',
  'Basic', 'Advanced', 'Elite', 'Standard', 'Supreme', 'Compact', 'Portable',
  'Heavy-Duty', 'Lightweight', 'Eco-Friendly', 'Organic', 'Natural', 'Smart',
  'Wireless', 'Digital', 'Vintage', 'Modern', 'Luxury', 'Budget'
]

const categories = [
  'Widget', 'Gadget', 'Tool', 'Device', 'Kit', 'Set', 'Pack', 'Bundle',
  'Accessory', 'Component', 'Module', 'Unit', 'System', 'Equipment', 'Gear',
  'Supply', 'Material', 'Part', 'Item', 'Product'
]

const variants = [
  'Pro', 'Plus', 'Max', 'Mini', 'Lite', 'XL', 'XXL', 'S', 'M', 'L',
  'V1', 'V2', 'V3', '2.0', '3.0', 'SE', 'LE', 'GT', 'X', 'Z',
  'Alpha', 'Beta', 'Gamma', 'Delta', 'Omega'
]

const colors = [
  'Red', 'Blue', 'Green', 'Black', 'White', 'Silver', 'Gold', 'Gray',
  'Navy', 'Orange', 'Purple', 'Pink', 'Brown', 'Teal', 'Coral'
]

// Helper to get random element from array
function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// Helper to generate random number in range
function randomNumber(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// Helper to generate random price (0.99 to 9999.99)
function randomPrice(): number {
  const base = Math.random() * 9999
  return Math.round(base * 100) / 100
}

// Calculate EAN-13 check digit
function calculateEAN13CheckDigit(first12: string): number {
  const digits = first12.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += digits[i] * (i % 2 === 0 ? 1 : 3)
  }
  return (10 - (sum % 10)) % 10
}

// Generate a valid EAN-13 barcode
function generateBarcode(index: number): string {
  const prefix = '590' // Country code prefix
  const manufacturer = String(randomNumber(10000, 99999))
  const product = String(index).padStart(4, '0')
  const first12 = `${prefix}${manufacturer}${product}`.slice(0, 12)
  const checkDigit = calculateEAN13CheckDigit(first12)
  return `${first12}${checkDigit}`
}

// Generate a SKU code
function generateSku(index: number): string | null {
  // 70% chance of having a SKU
  if (Math.random() > 0.7) return null

  const prefix = randomElement(['SKU', 'PRD', 'ITM', 'ART', 'REF'])
  const category = randomElement(['A', 'B', 'C', 'D', 'E', 'F'])
  const number = String(index).padStart(6, '0')
  return `${prefix}-${category}${number}`
}

// Generate a product name
function generateName(): string {
  const includeColor = Math.random() > 0.5
  const includeVariant = Math.random() > 0.5

  let name = `${randomElement(adjectives)} ${randomElement(categories)}`

  if (includeColor) {
    name += ` ${randomElement(colors)}`
  }

  if (includeVariant) {
    name += ` ${randomElement(variants)}`
  }

  return name
}

// Generate a single product with $id for batch insert
function generateProduct(index: number) {
  return {
    $id: ID.unique(),
    barcode: generateBarcode(index),
    sku_code: generateSku(index),
    name: generateName(),
    type: Math.random() > 0.9 ? 'bundle' : 'single', // 10% bundles
    price: randomPrice(),
  }
}

// Sleep helper
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Progress bar helper
function printProgress(current: number, total: number, startTime: number) {
  const percent = Math.round((current / total) * 100)
  const elapsed = (Date.now() - startTime) / 1000
  const rate = current / elapsed
  const eta = Math.round((total - current) / rate)

  const barLength = 30
  const filledLength = Math.round((percent / 100) * barLength)
  const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength)

  process.stdout.write(
    `\r[${bar}] ${percent}% | ${current}/${total} | ${rate.toFixed(1)}/s | ETA: ${eta}s`
  )
}

/**
 * Main seeder function
 */
async function seed() {
  console.log('='.repeat(50))
  console.log('Product Seeder - Generating 10,000 Products')
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
  console.log(`Total Products: ${TOTAL_PRODUCTS}`)
  console.log(`Batch Size: ${BATCH_SIZE}`)
  console.log('')

  const startTime = Date.now()
  let created = 0
  let failed = 0

  try {
    // Process in batches using bulk insert
    for (let i = 0; i < TOTAL_PRODUCTS; i += BATCH_SIZE) {
      const batchSize = Math.min(BATCH_SIZE, TOTAL_PRODUCTS - i)
      const rows: object[] = []

      // Generate batch of products
      for (let j = 0; j < batchSize; j++) {
        const index = i + j
        rows.push(generateProduct(index))
      }

      try {
        // Bulk insert using createRows
        await tablesDB.createRows({
          databaseId: config.databaseId,
          tableId: TABLE_ID,
          rows,
        })
        created += batchSize
      } catch (err) {
        failed += batchSize
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        console.error(`\nBatch ${i / BATCH_SIZE + 1} failed:`, errorMessage)
      }

      // Print progress
      printProgress(created + failed, TOTAL_PRODUCTS, startTime)

      // Delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < TOTAL_PRODUCTS) {
        await sleep(DELAY_BETWEEN_BATCHES)
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2)

    console.log('\n\n' + '='.repeat(50))
    console.log('Products Seeding Complete!')
    console.log('='.repeat(50))
    console.log(`Created: ${created}`)
    console.log(`Failed: ${failed}`)
    console.log(`Time: ${elapsed}s`)
    console.log(`Rate: ${(created / parseFloat(elapsed)).toFixed(1)} products/s`)

    // Seed bundle components
    await seedBundleComponents()

  } catch (error) {
    console.error('\nSeeding failed:', error)
    process.exit(1)
  }
}

/**
 * Seed bundle components - adds 2-5 single items to each bundle product
 */
async function seedBundleComponents() {
  console.log('\n' + '='.repeat(50))
  console.log('Seeding Bundle Components')
  console.log('='.repeat(50))

  try {
    // Fetch all bundle products
    console.log('\nFetching bundle products...')
    const bundleProducts: { $id: string }[] = []
    let offset = 0
    const limit = 100

    while (true) {
      const result = await databases.listDocuments(
        config.databaseId,
        TABLE_ID,
        [Query.equal('type', 'bundle'), Query.limit(limit), Query.offset(offset)]
      )
      bundleProducts.push(...result.documents.map(d => ({ $id: d.$id })))
      if (result.documents.length < limit) break
      offset += limit
    }

    console.log(`Found ${bundleProducts.length} bundle products`)

    // Fetch all single products
    console.log('Fetching single products...')
    const singleProducts: { $id: string }[] = []
    offset = 0

    while (true) {
      const result = await databases.listDocuments(
        config.databaseId,
        TABLE_ID,
        [Query.equal('type', 'single'), Query.limit(limit), Query.offset(offset)]
      )
      singleProducts.push(...result.documents.map(d => ({ $id: d.$id })))
      if (result.documents.length < limit) break
      offset += limit
    }

    console.log(`Found ${singleProducts.length} single products`)

    if (singleProducts.length === 0) {
      console.log('No single products found, skipping bundle components')
      return
    }

    // Create components for each bundle
    const componentStartTime = Date.now()
    let componentsCreated = 0
    let componentsFailed = 0
    let componentRows: object[] = []

    const flushComponents = async () => {
      if (componentRows.length === 0) return

      // Take only first 100 items
      const batch = componentRows.slice(0, BATCH_SIZE)
      componentRows = componentRows.slice(BATCH_SIZE)

      try {
        await tablesDB.createRows({
          databaseId: config.databaseId,
          tableId: COMPONENTS_TABLE_ID,
          rows: batch,
        })
        componentsCreated += batch.length
      } catch (err) {
        componentsFailed += batch.length
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        console.error(`\nComponent batch failed:`, errorMessage)
      }
      await sleep(DELAY_BETWEEN_BATCHES)
    }

    for (let i = 0; i < bundleProducts.length; i++) {
      const bundle = bundleProducts[i]
      const numItems = randomNumber(2, 5)

      // Randomly select unique single products
      const selectedIndices = new Set<number>()
      while (selectedIndices.size < Math.min(numItems, singleProducts.length)) {
        selectedIndices.add(randomNumber(0, singleProducts.length - 1))
      }

      for (const idx of selectedIndices) {
        componentRows.push({
          $id: ID.unique(),
          parent_product_id: bundle.$id,
          child_product_id: singleProducts[idx].$id,
          quantity: 1,
        })
      }

      // Flush when we have enough
      while (componentRows.length >= BATCH_SIZE) {
        await flushComponents()
        printProgress(i + 1, bundleProducts.length, componentStartTime)
      }
    }

    // Insert remaining components
    while (componentRows.length > 0) {
      await flushComponents()
    }

    const componentElapsed = ((Date.now() - componentStartTime) / 1000).toFixed(2)

    console.log('\n\n' + '='.repeat(50))
    console.log('Bundle Components Seeding Complete!')
    console.log('='.repeat(50))
    console.log(`Bundles Processed: ${bundleProducts.length}`)
    console.log(`Components Created: ${componentsCreated}`)
    console.log(`Components Failed: ${componentsFailed}`)
    console.log(`Time: ${componentElapsed}s`)

  } catch (error) {
    console.error('Error seeding bundle components:', error)
  }
}

// Run seeder
seed()
