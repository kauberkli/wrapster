/**
 * Clear Products Script
 * 
 * Deletes all product_components and products records.
 */

import 'dotenv/config'

import { Client, Databases, Query } from 'node-appwrite'

const config = {
  endpoint: process.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1',
  projectId: process.env.VITE_APPWRITE_PROJECT_ID || '',
  apiKey: process.env.APPWRITE_API_KEY || '',
  databaseId: process.env.VITE_APPWRITE_DATABASE_ID || '',
}

const client = new Client()
  .setEndpoint(config.endpoint)
  .setProject(config.projectId)
  .setKey(config.apiKey)

const databases = new Databases(client)

async function clearCollection(collectionId: string) {
  console.log(`Clearing ${collectionId}...`)
  let deleted = 0
  
  while (true) {
    const result = await databases.listDocuments(
      config.databaseId,
      collectionId,
      [Query.limit(100)]
    )
    
    if (result.documents.length === 0) break
    
    for (const doc of result.documents) {
      await databases.deleteDocument(config.databaseId, collectionId, doc.$id)
      deleted++
    }
    
    process.stdout.write(`\rDeleted ${deleted} records from ${collectionId}`)
  }
  
  console.log(`\nCompleted: ${deleted} records deleted from ${collectionId}`)
  return deleted
}

async function main() {
  console.log('='.repeat(50))
  console.log('Clearing Products Database')
  console.log('='.repeat(50))
  
  // Clear components first (foreign key dependency)
  await clearCollection('product_components')
  
  // Then clear products
  await clearCollection('products')
  
  console.log('\nAll records cleared!')
}

main().catch(console.error)
