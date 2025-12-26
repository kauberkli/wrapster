/**
 * Appwrite Database Reset Script
 *
 * This script truncates all data from all tables in the database.
 * Tables affected:
 * 1. product_components - Bundle recipes (deleted first due to FK reference)
 * 2. products - Master product list
 * 3. packaging_items - Individual scans (deleted first due to FK reference)
 * 4. packaging_records - Waybill tracking
 *
 * Usage:
 *   npx tsx scripts/reset-database.ts
 *   npx tsx scripts/reset-database.ts --force  # Skip confirmation prompt
 *
 * Required environment variables:
 *   VITE_APPWRITE_ENDPOINT    - Appwrite server endpoint
 *   VITE_APPWRITE_PROJECT_ID  - Project ID
 *   VITE_APPWRITE_DATABASE_ID - Database ID
 *   APPWRITE_API_KEY          - Server API key with databases.write permission
 */

import 'dotenv/config'
import * as readline from 'readline'

import { Client, Databases, Query } from 'node-appwrite'

// Configuration
const config = {
  endpoint: process.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1',
  projectId: process.env.VITE_APPWRITE_PROJECT_ID || '',
  apiKey: process.env.APPWRITE_API_KEY || '',
  databaseId: process.env.VITE_APPWRITE_DATABASE_ID || '',
}

// All table IDs in deletion order (child tables first)
const TABLES = [
  'product_components', // Delete first (references products)
  'packaging_items', // Delete first (references packaging_records)
  'products',
  'packaging_records',
] as const

// Initialize Appwrite client
const client = new Client()
  .setEndpoint(config.endpoint)
  .setProject(config.projectId)
  .setKey(config.apiKey)

const databases = new Databases(client)

// Batch size for document deletion
const BATCH_SIZE = 100

/**
 * Prompt user for confirmation
 */
async function confirmReset(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(
      '\n⚠️  WARNING: This will DELETE ALL DATA from all tables!\n' +
        'Type "DELETE ALL DATA" to confirm: ',
      (answer) => {
        rl.close()
        resolve(answer === 'DELETE ALL DATA')
      }
    )
  })
}

/**
 * Get total document count for a table
 */
async function getDocumentCount(tableId: string): Promise<number> {
  try {
    const response = await databases.listDocuments(config.databaseId, tableId, [
      Query.limit(1),
    ])
    return response.total
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 404) {
      console.log(`  Table "${tableId}" does not exist, skipping...`)
      return 0
    }
    throw error
  }
}

/**
 * Delete all documents from a table in batches
 */
async function truncateTable(tableId: string): Promise<number> {
  console.log(`\n--- Truncating table: ${tableId} ---`)

  const totalCount = await getDocumentCount(tableId)
  if (totalCount === 0) {
    console.log(`  No documents to delete`)
    return 0
  }

  console.log(`  Found ${totalCount} documents to delete`)

  let deletedCount = 0
  let hasMore = true

  while (hasMore) {
    // Always fetch from the beginning since we're deleting
    const response = await databases.listDocuments(config.databaseId, tableId, [
      Query.limit(BATCH_SIZE),
    ])

    if (response.documents.length === 0) {
      hasMore = false
      break
    }

    // Delete documents in parallel for better performance
    const deletePromises = response.documents.map((doc) =>
      databases.deleteDocument(config.databaseId, tableId, doc.$id)
    )

    await Promise.all(deletePromises)
    deletedCount += response.documents.length

    // Progress indicator
    const progress = Math.round((deletedCount / totalCount) * 100)
    process.stdout.write(`\r  Deleted ${deletedCount}/${totalCount} (${progress}%)`)

    // Check if there are more documents
    hasMore = response.documents.length === BATCH_SIZE
  }

  console.log(`\n  ✓ Deleted ${deletedCount} documents from ${tableId}`)
  return deletedCount
}

/**
 * Main reset function
 */
async function reset() {
  console.log('='.repeat(50))
  console.log('Appwrite Database Reset: Truncate All Tables')
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
  console.log(`Tables to truncate: ${TABLES.join(', ')}`)

  // Check for --force flag
  const forceMode = process.argv.includes('--force')

  if (!forceMode) {
    const confirmed = await confirmReset()
    if (!confirmed) {
      console.log('\n❌ Reset cancelled.')
      process.exit(0)
    }
  } else {
    console.log('\n⚠️  Running in force mode, skipping confirmation...')
  }

  try {
    // Verify database connection
    await databases.get(config.databaseId)
    console.log('\nDatabase connection verified!')

    // Track total deleted
    let totalDeleted = 0

    // Truncate each table in order
    for (const tableId of TABLES) {
      const deleted = await truncateTable(tableId)
      totalDeleted += deleted
    }

    console.log('\n' + '='.repeat(50))
    console.log(`✓ Database reset completed!`)
    console.log(`  Total documents deleted: ${totalDeleted}`)
    console.log('='.repeat(50))
  } catch (error) {
    console.error('\n❌ Reset failed:', error)
    process.exit(1)
  }
}

// Run reset
reset()
