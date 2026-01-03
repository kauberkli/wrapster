/**
 * Script to reset the packaging cache
 *
 * This script:
 * 1. Deletes the packaging_cache collection
 * 2. Recreates it with the proper schema
 * 3. Runs the cache warmup to populate fresh data
 *
 * Usage:
 *   npx tsx scripts/reset-packaging-cache.ts
 */

import dotenv from 'dotenv'

dotenv.config()
dotenv.config({ path: '.env.local' })

import { Client, Databases, ID, Query } from 'node-appwrite'

const config = {
  endpoint: process.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1',
  projectId: process.env.VITE_APPWRITE_PROJECT_ID || '',
  apiKey: process.env.APPWRITE_API_KEY || '',
  databaseId: process.env.VITE_APPWRITE_DATABASE_ID || '',
}

const COLLECTION_ID = 'packaging_cache'

const client = new Client()
  .setEndpoint(config.endpoint)
  .setProject(config.projectId)
  .setKey(config.apiKey)

const databases = new Databases(client)

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function deleteCollection(): Promise<void> {
  console.log('Deleting packaging_cache collection...')
  try {
    await databases.deleteCollection(config.databaseId, COLLECTION_ID)
    console.log('✓ Collection deleted')
  } catch (error: unknown) {
    const err = error as { code?: number; message?: string }
    if (err.code === 404) {
      console.log('✓ Collection does not exist, skipping delete')
    } else {
      throw error
    }
  }
}

async function createCollection(): Promise<void> {
  console.log('Creating packaging_cache collection...')

  await databases.createCollection(
    config.databaseId,
    COLLECTION_ID,
    'Packaging Cache',
    [
      'read("users")',
      'create("users")',
      'update("users")',
      'delete("users")',
    ]
  )
  console.log('✓ Collection created')

  console.log('Adding attributes...')

  // cache_date - string, required, size 10
  await databases.createStringAttribute(
    config.databaseId,
    COLLECTION_ID,
    'cache_date',
    10,
    true
  )
  console.log('  ✓ cache_date')

  // data - string, required, size 16MB
  await databases.createStringAttribute(
    config.databaseId,
    COLLECTION_ID,
    'data',
    16777216,
    true
  )
  console.log('  ✓ data')

  // cached_at - datetime, required
  await databases.createDatetimeAttribute(
    config.databaseId,
    COLLECTION_ID,
    'cached_at',
    true
  )
  console.log('  ✓ cached_at')

  // Wait for attributes to be available
  console.log('Waiting for attributes to be available...')
  await delay(5000)

  console.log('Adding index...')
  await databases.createIndex(
    config.databaseId,
    COLLECTION_ID,
    'idx_cache_date',
    'unique',
    ['cache_date']
  )
  console.log('  ✓ idx_cache_date')

  // Wait for index to be available
  await delay(2000)
}

// === Cache Warmup Logic (from cache-all-packaging.ts) ===

const COLLECTIONS = {
  PACKAGING_RECORDS: 'packaging_records',
  PACKAGING_ITEMS: 'packaging_items',
  PACKAGING_CACHE: 'packaging_cache',
  PRODUCTS: 'products',
  PRODUCT_COMPONENTS: 'product_components',
} as const

const API_DELAY = 50

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0]
}

interface PackagingRecord {
  $id: string
  $createdAt: string
  $updatedAt: string
  packaging_date: string
  waybill_number: string
}

interface PackagingItem {
  $id: string
  $createdAt: string
  $updatedAt: string
  packaging_record_id: string
  product_barcode: string
  scanned_at: string
}

interface Product {
  $id: string
  barcode: string
  name: string
  type: 'single' | 'bundle'
}

interface BundleComponentInfo {
  barcode: string
  productName: string
  quantity: number
}

interface PackagingItemWithProduct extends PackagingItem {
  product_name: string
  is_bundle?: boolean
  bundle_components?: BundleComponentInfo[]
}

interface PackagingRecordWithProducts extends PackagingRecord {
  items: PackagingItemWithProduct[]
}

async function getAllUniqueDates(): Promise<string[]> {
  console.log('Fetching all unique packaging dates...')

  const allDates = new Set<string>()
  let offset = 0
  const limit = 100

  while (true) {
    const result = await databases.listDocuments(
      config.databaseId,
      COLLECTIONS.PACKAGING_RECORDS,
      [
        Query.orderAsc('packaging_date'),
        Query.limit(limit),
        Query.offset(offset),
      ]
    )

    for (const doc of result.documents) {
      allDates.add(doc.packaging_date as string)
    }

    if (result.documents.length < limit) break
    offset += limit
    await delay(API_DELAY)
  }

  const today = getTodayDate()
  const historicalDates = Array.from(allDates)
    .filter(date => date !== today)
    .sort()

  return historicalDates
}

async function fetchPackagingRecordsByDate(dateString: string): Promise<PackagingRecordWithProducts[]> {
  const allRecords: PackagingRecord[] = []
  let offset = 0
  const limit = 100

  while (true) {
    const result = await databases.listDocuments(
      config.databaseId,
      COLLECTIONS.PACKAGING_RECORDS,
      [
        Query.equal('packaging_date', dateString),
        Query.orderDesc('$createdAt'),
        Query.limit(limit),
        Query.offset(offset),
      ]
    )

    for (const doc of result.documents) {
      allRecords.push({
        $id: doc.$id,
        $createdAt: doc.$createdAt,
        $updatedAt: doc.$updatedAt,
        packaging_date: doc.packaging_date as string,
        waybill_number: doc.waybill_number as string,
      })
    }

    if (result.documents.length < limit) break
    offset += limit
    await delay(API_DELAY)
  }

  const allItems: PackagingItem[] = []
  for (const record of allRecords) {
    const itemsResult = await databases.listDocuments(
      config.databaseId,
      COLLECTIONS.PACKAGING_ITEMS,
      [
        Query.equal('packaging_record_id', record.$id),
        Query.orderDesc('scanned_at'),
        Query.limit(500), // Override Appwrite's default limit of 25
      ]
    )

    for (const item of itemsResult.documents) {
      allItems.push({
        $id: item.$id,
        $createdAt: item.$createdAt,
        $updatedAt: item.$updatedAt,
        packaging_record_id: item.packaging_record_id as string,
        product_barcode: item.product_barcode as string,
        scanned_at: item.scanned_at as string,
      })
    }
    await delay(API_DELAY)
  }

  const uniqueBarcodes = [...new Set(allItems.map(item => item.product_barcode))]
  const productMap = new Map<string, Product>()

  for (let i = 0; i < uniqueBarcodes.length; i += 50) {
    const batch = uniqueBarcodes.slice(i, i + 50)
    const result = await databases.listDocuments(
      config.databaseId,
      COLLECTIONS.PRODUCTS,
      [Query.equal('barcode', batch), Query.limit(50)]
    )
    for (const doc of result.documents) {
      productMap.set(doc.barcode as string, {
        $id: doc.$id,
        barcode: doc.barcode as string,
        name: doc.name as string,
        type: doc.type as 'single' | 'bundle',
      })
    }
    await delay(API_DELAY)
  }

  const bundleProducts = Array.from(productMap.values()).filter(p => p.type === 'bundle')
  const bundleComponentsMap = new Map<string, BundleComponentInfo[]>()

  for (const bundle of bundleProducts) {
    try {
      const componentsResult = await databases.listDocuments(
        config.databaseId,
        COLLECTIONS.PRODUCT_COMPONENTS,
        [Query.equal('parent_product_id', bundle.$id)]
      )

      const components: BundleComponentInfo[] = []
      for (const comp of componentsResult.documents) {
        const childProductId = comp.child_product_id as string
        const quantity = comp.quantity as number

        const childProduct = await databases.getDocument(
          config.databaseId,
          COLLECTIONS.PRODUCTS,
          childProductId
        )

        components.push({
          barcode: childProduct.barcode as string,
          productName: childProduct.name as string,
          quantity,
        })
        await delay(API_DELAY)
      }

      if (components.length > 0) {
        bundleComponentsMap.set(bundle.barcode, components)
      }
    } catch {
      // Skip if components can't be fetched
    }
  }

  const recordsWithProducts: PackagingRecordWithProducts[] = allRecords.map(record => {
    const recordItems = allItems.filter(item => item.packaging_record_id === record.$id)
    const enrichedItems: PackagingItemWithProduct[] = recordItems.map(item => {
      const product = productMap.get(item.product_barcode)
      return {
        ...item,
        product_name: product?.name ?? 'Unknown Product',
        is_bundle: product?.type === 'bundle',
        bundle_components: bundleComponentsMap.get(item.product_barcode),
      }
    })

    return {
      ...record,
      items: enrichedItems,
    }
  })

  return recordsWithProducts
}

async function cachePackagingData(dateString: string, data: PackagingRecordWithProducts[]): Promise<void> {
  const cacheData = {
    cache_date: dateString,
    data: JSON.stringify(data),
    cached_at: new Date().toISOString(),
  }

  await databases.createDocument(
    config.databaseId,
    COLLECTIONS.PACKAGING_CACHE,
    ID.unique(),
    cacheData
  )
}

async function warmupCache(): Promise<void> {
  console.log('\n--- Cache Warmup ---')
  console.log(`Today: ${getTodayDate()} (will be skipped)\n`)

  const dates = await getAllUniqueDates()

  if (dates.length === 0) {
    console.log('No historical packaging data found to cache.')
    return
  }

  console.log(`Found ${dates.length} historical date(s) to cache:`)
  console.log(dates.join(', '))
  console.log('')

  let successCount = 0
  let totalRecords = 0
  let totalItems = 0

  for (let i = 0; i < dates.length; i++) {
    const dateString = dates[i]
    process.stdout.write(`[${i + 1}/${dates.length}] Caching ${dateString}... `)

    try {
      const records = await fetchPackagingRecordsByDate(dateString)
      const itemCount = records.reduce((sum, r) => sum + r.items.length, 0)

      await cachePackagingData(dateString, records)

      console.log(`✓ ${records.length} records, ${itemCount} items`)
      successCount++
      totalRecords += records.length
      totalItems += itemCount
    } catch (error) {
      console.log(`✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    await delay(100)
  }

  console.log('\n--- Summary ---')
  console.log(`  Dates cached: ${successCount}/${dates.length}`)
  console.log(`  Total records: ${totalRecords}`)
  console.log(`  Total items: ${totalItems}`)
}

async function main() {
  console.log('='.repeat(50))
  console.log('Reset Packaging Cache')
  console.log('='.repeat(50))

  if (!config.projectId || !config.apiKey || !config.databaseId) {
    console.error('Error: Missing required environment variables')
    console.error('  VITE_APPWRITE_PROJECT_ID')
    console.error('  APPWRITE_API_KEY')
    console.error('  VITE_APPWRITE_DATABASE_ID')
    process.exit(1)
  }

  console.log(`\nEndpoint: ${config.endpoint}`)
  console.log(`Project: ${config.projectId}`)
  console.log(`Database: ${config.databaseId}\n`)

  try {
    // Step 1: Delete collection
    await deleteCollection()

    // Step 2: Recreate collection
    await createCollection()

    // Step 3: Warmup cache
    await warmupCache()

    console.log('\n' + '='.repeat(50))
    console.log('Cache reset completed!')
    console.log('='.repeat(50))

  } catch (error) {
    console.error('\nError:', error)
    process.exit(1)
  }
}

main()
