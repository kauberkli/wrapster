import { databaseService, Query } from './database'
import { packagingCacheService } from './packaging-cache'
import { productService } from './products'
import { auditLogService, getAuditUserContext } from './audit-log'
import { functions } from './config'
import { getTodayDate } from '@/lib/utils'

import type {
  CreatePackagingItemInput,
  CreatePackagingRecordInput,
  PackagingItem,
  PackagingRecord,
  PackagingRecordWithItems,
  PackagingRecordWithProducts,
  PackagingItemWithProduct,
} from '@/types/packaging'
import { COLLECTIONS } from '@/types/packaging'
import type { Product } from '@/types/product'

// Function IDs - configurable via environment variables
const CREATE_FUNCTION_ID = import.meta.env.VITE_APPWRITE_CREATE_PACKAGING_FUNCTION_ID || 'create-packaging'
const UPDATE_FUNCTION_ID = import.meta.env.VITE_APPWRITE_UPDATE_PACKAGING_FUNCTION_ID || 'update-packaging'
const DELETE_FUNCTION_ID = import.meta.env.VITE_APPWRITE_DELETE_PACKAGING_FUNCTION_ID || 'delete-packaging'

export const packagingRecordService = {
  /**
   * Create a new packaging record
   */
  async create(data: CreatePackagingRecordInput): Promise<PackagingRecord> {
    try {
      const record = await databaseService.createDocument<PackagingRecord>(
        COLLECTIONS.PACKAGING_RECORDS,
        {
          packaging_date: data.packaging_date,
          waybill_number: data.waybill_number,
        }
      )

      auditLogService.log('packaging_record_create', 'packaging_record', {
        resource_id: record.$id,
        action_details: {
          packaging_date: data.packaging_date,
          waybill_number: data.waybill_number,
        },
      }).catch(console.error)

      return record
    } catch (error) {
      auditLogService.log('packaging_record_create', 'packaging_record', {
        action_details: data,
        status: 'failure',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      }).catch(console.error)
      throw error
    }
  },

  /**
   * Create a packaging record with all its items in a single operation
   * This is optimized to minimize API calls:
   * - 1 API call for record creation
   * - N API calls for items (in parallel, no individual audit logs)
   * - 1 audit log for the entire operation
   */
  async createWithItems(
    data: CreatePackagingRecordInput,
    items: Array<{ product_barcode: string; product_name?: string; scanned_at?: string }>
  ): Promise<{ record: PackagingRecord; items: PackagingItem[] }> {
    try {
      // Create the packaging record
      const record = await databaseService.createDocument<PackagingRecord>(
        COLLECTIONS.PACKAGING_RECORDS,
        {
          packaging_date: data.packaging_date,
          waybill_number: data.waybill_number,
        }
      )

      // Create all items in parallel (without individual audit logs)
      const createdItems = await Promise.all(
        items.map((item) =>
          databaseService.createDocument<PackagingItem>(COLLECTIONS.PACKAGING_ITEMS, {
            packaging_record_id: record.$id,
            product_barcode: item.product_barcode,
            scanned_at: item.scanned_at ?? new Date().toISOString(),
          })
        )
      )

      // Log a single audit entry for the entire operation
      auditLogService
        .log('packaging_record_create', 'packaging_record', {
          resource_id: record.$id,
          action_details: {
            packaging_date: data.packaging_date,
            waybill_number: data.waybill_number,
            item_count: items.length,
            items: items.map((i) => ({
              barcode: i.product_barcode,
              name: i.product_name,
            })),
          },
        })
        .catch(console.error)

      return { record, items: createdItems }
    } catch (error) {
      auditLogService
        .log('packaging_record_create', 'packaging_record', {
          action_details: {
            ...data,
            item_count: items.length,
          },
          status: 'failure',
          error_message: error instanceof Error ? error.message : 'Unknown error',
        })
        .catch(console.error)
      throw error
    }
  },

  /**
   * Create a packaging record with all items via Appwrite Function
   * This uses the Server SDK (no rate limits) for bulk operations
   *
   * @param data - Packaging record data (date, waybill)
   * @param items - Array of items to create
   * @param stockUpdates - Array of stock updates to apply
   * @returns Created record and items
   */
  async createWithItemsViaFunction(
    data: CreatePackagingRecordInput,
    items: Array<{ product_barcode: string; product_name?: string; scanned_at?: string }>,
    stockUpdates?: Array<{ product_id: string; deduct_amount: number }>
  ): Promise<{ record: PackagingRecord; items: PackagingItem[]; stockUpdateSuccess: boolean }> {
    const userContext = getAuditUserContext()

    const payload = {
      packaging_date: data.packaging_date,
      waybill_number: data.waybill_number,
      items,
      stock_updates: stockUpdates || [],
      user_id: userContext?.user_id || '',
      user_email: userContext?.user_email,
      session_id: userContext?.session_id,
    }

    try {
      const execution = await functions.createExecution(
        CREATE_FUNCTION_ID,
        JSON.stringify(payload),
        false // synchronous execution
      )

      // Parse the response
      const response = JSON.parse(execution.responseBody)

      if (!response.success) {
        throw new Error(response.error || 'Function execution failed')
      }

      // Map the response to our types
      // Use type assertion since function returns minimal data
      const record = {
        $id: response.record.$id,
        $collectionId: COLLECTIONS.PACKAGING_RECORDS,
        $databaseId: '',
        $createdAt: response.record.$createdAt,
        $updatedAt: response.record.$createdAt,
        $permissions: [],
        packaging_date: response.record.packaging_date,
        waybill_number: response.record.waybill_number,
      } as unknown as PackagingRecord

      const createdItems: PackagingItem[] = response.items.map(
        (item: { $id: string; packaging_record_id: string; product_barcode: string; scanned_at: string }) =>
          ({
            $id: item.$id,
            $collectionId: COLLECTIONS.PACKAGING_ITEMS,
            $databaseId: '',
            $createdAt: item.scanned_at,
            $updatedAt: item.scanned_at,
            $permissions: [],
            packaging_record_id: item.packaging_record_id,
            product_barcode: item.product_barcode,
            scanned_at: item.scanned_at,
          }) as unknown as PackagingItem
      )

      return {
        record,
        items: createdItems,
        stockUpdateSuccess: response.stock_updates?.success ?? true,
      }
    } catch (error) {
      console.error('Function execution error:', error)
      throw error
    }
  },

  /**
   * Update a packaging record via Appwrite Function
   * This uses the Server SDK (no rate limits) for bulk operations
   *
   * @param recordId - The ID of the record to update
   * @param data - Optional waybill update
   * @param items - Optional items to replace existing items
   * @returns Updated record and items
   */
  async updateViaFunction(
    recordId: string,
    data?: { waybill_number: string },
    items?: Array<{ product_barcode: string; product_name?: string; scanned_at?: string }>
  ): Promise<{ record: PackagingRecord; items: PackagingItem[] }> {
    const userContext = getAuditUserContext()

    const payload: Record<string, unknown> = {
      record_id: recordId,
      user_id: userContext?.user_id || '',
      user_email: userContext?.user_email,
      session_id: userContext?.session_id,
    }

    if (data?.waybill_number !== undefined) {
      payload.waybill_number = data.waybill_number
    }

    if (items !== undefined) {
      payload.items = items
    }

    try {
      const execution = await functions.createExecution(
        UPDATE_FUNCTION_ID,
        JSON.stringify(payload),
        false // synchronous execution
      )

      // Parse the response
      const response = JSON.parse(execution.responseBody)

      if (!response.success) {
        throw new Error(response.error || 'Function execution failed')
      }

      // Map the response to our types
      const record = {
        $id: response.record.$id,
        $collectionId: COLLECTIONS.PACKAGING_RECORDS,
        $databaseId: '',
        $createdAt: response.record.$createdAt,
        $updatedAt: response.record.$updatedAt,
        $permissions: [],
        packaging_date: response.record.packaging_date,
        waybill_number: response.record.waybill_number,
      } as unknown as PackagingRecord

      const updatedItems: PackagingItem[] = (response.items || []).map(
        (item: { $id: string; packaging_record_id: string; product_barcode: string; scanned_at: string }) =>
          ({
            $id: item.$id,
            $collectionId: COLLECTIONS.PACKAGING_ITEMS,
            $databaseId: '',
            $createdAt: item.scanned_at,
            $updatedAt: item.scanned_at,
            $permissions: [],
            packaging_record_id: item.packaging_record_id,
            product_barcode: item.product_barcode,
            scanned_at: item.scanned_at,
          }) as unknown as PackagingItem
      )

      return { record, items: updatedItems }
    } catch (error) {
      console.error('Function execution error:', error)
      throw error
    }
  },

  /**
   * Delete a packaging record via Appwrite Function
   * This uses the Server SDK (no rate limits) and handles stock restoration
   *
   * @param recordId - The ID of the record to delete
   * @param restoreStock - Whether to restore stock (default: true)
   * @returns Deletion result with stock restore info
   */
  async deleteViaFunction(
    recordId: string,
    restoreStock = true
  ): Promise<{ success: boolean; itemsDeleted: number; stockRestoreSuccess: boolean }> {
    const userContext = getAuditUserContext()

    const payload = {
      record_id: recordId,
      restore_stock: restoreStock,
      user_id: userContext?.user_id || '',
      user_email: userContext?.user_email,
      session_id: userContext?.session_id,
    }

    try {
      const execution = await functions.createExecution(
        DELETE_FUNCTION_ID,
        JSON.stringify(payload),
        false // synchronous execution
      )

      // Parse the response
      const response = JSON.parse(execution.responseBody)

      if (!response.success) {
        throw new Error(response.error || 'Function execution failed')
      }

      return {
        success: true,
        itemsDeleted: response.deleted?.items_count || 0,
        stockRestoreSuccess: response.stock_restore?.success ?? true,
      }
    } catch (error) {
      console.error('Function execution error:', error)
      throw error
    }
  },

  /**
   * Get a packaging record by ID
   */
  async getById(recordId: string): Promise<PackagingRecord> {
    const record = await databaseService.getDocument<PackagingRecord>(
      COLLECTIONS.PACKAGING_RECORDS,
      recordId
    )

    auditLogService.log('packaging_record_view', 'packaging_record', {
      resource_id: recordId,
      action_details: {
        packaging_date: record.packaging_date,
        waybill_number: record.waybill_number,
      },
    }).catch(console.error)

    return record
  },

  /**
   * Check if a waybill exists for a specific date
   */
  async getByDateAndWaybill(
    date: string,
    waybill: string
  ): Promise<PackagingRecord | null> {
    const result = await databaseService.listDocuments<PackagingRecord>(
      COLLECTIONS.PACKAGING_RECORDS,
      [
        Query.equal('packaging_date', date),
        Query.equal('waybill_number', waybill),
        Query.limit(1),
      ]
    )
    return result.documents[0] ?? null
  },

  /**
   * List all packaging records for a specific date (direct database query)
   * Use getPackagingByDate for cache-aside pattern
   */
  async listByDate(date: string): Promise<PackagingRecordWithItems[]> {
    const result = await databaseService.listDocuments<PackagingRecord>(
      COLLECTIONS.PACKAGING_RECORDS,
      [Query.equal('packaging_date', date), Query.orderDesc('$createdAt')]
    )

    // Fetch items for each record
    const recordsWithItems = await Promise.all(
      result.documents.map(async (record) => {
        const items = await packagingItemService.listByRecordId(record.$id)
        return {
          ...record,
          items,
        }
      })
    )

    auditLogService.log('packaging_list_by_date', 'packaging_record', {
      action_details: {
        date,
        recordCount: recordsWithItems.length,
        totalItems: recordsWithItems.reduce((sum, r) => sum + r.items.length, 0),
      },
    }).catch(console.error)

    return recordsWithItems
  },

  /**
   * Enrich packaging records with product names and bundle components
   * Uses batch fetching for efficiency
   */
  async enrichWithProducts(
    records: PackagingRecordWithItems[]
  ): Promise<PackagingRecordWithProducts[]> {
    // Collect all unique barcodes
    const allBarcodes = new Set<string>()
    for (const record of records) {
      for (const item of record.items) {
        allBarcodes.add(item.product_barcode)
      }
    }

    // Batch fetch all products
    const productMap = new Map<string, Product>()
    const barcodeArray = Array.from(allBarcodes)

    // Fetch products in batches of 50
    for (let i = 0; i < barcodeArray.length; i += 50) {
      const batch = barcodeArray.slice(i, i + 50)
      const result = await productService.list({
        barcodes: batch,
        limit: 50,
      })
      for (const product of result.documents) {
        productMap.set(product.barcode, product)
      }
    }

    // Fetch bundle components for all bundle products
    const bundleProducts = Array.from(productMap.values()).filter(
      (p) => p.type === 'bundle'
    )
    const bundleComponentsMap = new Map<
      string,
      Array<{ barcode: string; productName: string; quantity: number }>
    >()

    for (const bundle of bundleProducts) {
      try {
        const withComponents = await productService.getWithComponents(bundle.$id)
        if (withComponents.components && withComponents.components.length > 0) {
          bundleComponentsMap.set(
            bundle.barcode,
            withComponents.components.map((comp) => ({
              barcode: comp.product.barcode,
              productName: comp.product.name,
              quantity: comp.quantity,
            }))
          )
        }
      } catch {
        // Skip if components can't be fetched
      }
    }

    // Enrich records with product info
    return records.map((record) => ({
      ...record,
      items: record.items.map((item): PackagingItemWithProduct => {
        const product = productMap.get(item.product_barcode)
        return {
          ...item,
          product_name: product?.name ?? 'Unknown Product',
          is_bundle: product?.type === 'bundle',
          bundle_components: bundleComponentsMap.get(item.product_barcode),
        }
      }),
    }))
  },

  /**
   * Refresh the cache for a specific date
   * Fetches fresh data from database and updates the cache
   * Used after modifications to historical records
   */
  async refreshCache(date: string): Promise<void> {
    const today = getTodayDate()
    // Don't cache today's data
    if (date === today) {
      return
    }

    try {
      console.log(`[Packaging] Refreshing cache for ${date}`)
      // Invalidate existing cache
      await packagingCacheService.invalidate(date)

      // Fetch fresh data from database
      const records = await this.listByDate(date)
      const enrichedRecords = await this.enrichWithProducts(records)

      // Set new cache
      await packagingCacheService.set(date, enrichedRecords)
      console.log(`[Packaging] Cache refreshed for ${date} with ${enrichedRecords.length} records`)

      auditLogService
        .log('packaging_cache_refresh', 'packaging_record', {
          action_details: {
            date,
            recordCount: enrichedRecords.length,
          },
        })
        .catch(console.error)
    } catch (error) {
      console.error(`[Packaging] Failed to refresh cache for ${date}:`, error)
      // Don't throw - cache refresh failure shouldn't break the operation
    }
  },

  /**
   * Get packaging records by date with cache-aside pattern
   * - For today: Query database directly for real-time data
   * - For past dates: Check cache first, fallback to database and update cache
   * Returns records with product names and bundle info included
   */
  async getPackagingByDate(date: string): Promise<PackagingRecordWithProducts[]> {
    const today = getTodayDate()
    console.log(`[Packaging] getPackagingByDate called for: ${date}, today is: ${today}`)

    // For today's date, always fetch from database for real-time editing
    if (date === today) {
      console.log(`[Packaging] Fetching TODAY from database (no cache)`)
      const records = await this.listByDate(date)
      const enrichedRecords = await this.enrichWithProducts(records)

      auditLogService.log('packaging_view_by_date', 'packaging_record', {
        action_details: {
          date,
          recordCount: enrichedRecords.length,
          source: 'database',
        },
      }).catch(console.error)

      return enrichedRecords
    }

    // For historical dates, try cache first
    console.log(`[Packaging] Historical date - checking cache...`)
    const cachedData = await packagingCacheService.get(date)
    if (cachedData !== null) {
      console.log(`[Packaging] Cache HIT! Returning ${cachedData.length} records`)
      auditLogService.log('packaging_view_by_date', 'packaging_record', {
        action_details: {
          date,
          recordCount: cachedData.length,
          source: 'cache',
        },
      }).catch(console.error)

      return cachedData
    }

    // Cache miss: fetch from database and enrich with product info
    console.log(`[Packaging] Cache MISS - fetching from database...`)
    const records = await this.listByDate(date)
    const enrichedRecords = await this.enrichWithProducts(records)

    // Store in cache for future requests (async, don't wait)
    console.log(`[Packaging] Storing ${enrichedRecords.length} records in cache...`)
    packagingCacheService.set(date, enrichedRecords).catch((error) => {
      console.error('Failed to update packaging cache:', error)
    })

    auditLogService.log('packaging_view_by_date', 'packaging_record', {
      action_details: {
        date,
        recordCount: enrichedRecords.length,
        source: 'database_cache_miss',
      },
    }).catch(console.error)

    return enrichedRecords
  },

  /**
   * Get a packaging record with all its items
   */
  async getWithItems(recordId: string): Promise<PackagingRecordWithItems> {
    const record = await this.getById(recordId)
    const items = await packagingItemService.listByRecordId(recordId)
    return {
      ...record,
      items,
    }
  },

  /**
   * Update a packaging record (waybill number)
   */
  async update(
    recordId: string,
    data: { waybill_number: string }
  ): Promise<PackagingRecord> {
    try {
      // Get original record for audit
      const original = await databaseService.getDocument<PackagingRecord>(
        COLLECTIONS.PACKAGING_RECORDS,
        recordId
      )

      const record = await databaseService.updateDocument<PackagingRecord>(
        COLLECTIONS.PACKAGING_RECORDS,
        recordId,
        data
      )

      // Refresh cache for this date (invalidate + re-create with fresh data)
      await this.refreshCache(record.packaging_date)

      auditLogService
        .log('packaging_record_update', 'packaging_record', {
          resource_id: recordId,
          action_details: {
            packaging_date: record.packaging_date,
            old_waybill_number: original.waybill_number,
            new_waybill_number: data.waybill_number,
          },
        })
        .catch(console.error)

      return record
    } catch (error) {
      auditLogService
        .log('packaging_record_update', 'packaging_record', {
          resource_id: recordId,
          action_details: data,
          status: 'failure',
          error_message: error instanceof Error ? error.message : 'Unknown error',
        })
        .catch(console.error)
      throw error
    }
  },

  /**
   * Update packaging items for a record (replace all items)
   * This handles adding/removing items by replacing the entire item list
   * Optimized to use parallel operations and a single audit log
   */
  async updateItems(
    recordId: string,
    items: Array<{ product_barcode: string; scanned_at?: string }>
  ): Promise<PackagingItem[]> {
    try {
      // Get the record to find its date
      const record = await databaseService.getDocument<PackagingRecord>(
        COLLECTIONS.PACKAGING_RECORDS,
        recordId
      )

      // Get existing items for audit
      const existingItems = await packagingItemService.listByRecordId(recordId)

      // Delete all existing items in parallel
      await Promise.all(
        existingItems.map((item) =>
          databaseService.deleteDocument(COLLECTIONS.PACKAGING_ITEMS, item.$id)
        )
      )

      // Create new items in parallel
      const newItems = await Promise.all(
        items.map((item) =>
          databaseService.createDocument<PackagingItem>(COLLECTIONS.PACKAGING_ITEMS, {
            packaging_record_id: recordId,
            product_barcode: item.product_barcode,
            scanned_at: item.scanned_at ?? new Date().toISOString(),
          })
        )
      )

      // Refresh cache for this date (invalidate + re-create with fresh data)
      await this.refreshCache(record.packaging_date)

      // Single audit log for the entire operation
      auditLogService
        .log('packaging_items_update', 'packaging_item', {
          resource_id: recordId,
          action_details: {
            packaging_date: record.packaging_date,
            old_item_count: existingItems.length,
            new_item_count: items.length,
            old_items: existingItems.map((i) => i.product_barcode),
            new_items: items.map((i) => i.product_barcode),
          },
        })
        .catch(console.error)

      return newItems
    } catch (error) {
      auditLogService
        .log('packaging_items_update', 'packaging_item', {
          resource_id: recordId,
          status: 'failure',
          error_message: error instanceof Error ? error.message : 'Unknown error',
        })
        .catch(console.error)
      throw error
    }
  },

  /**
   * Delete a packaging record and all its items
   * Optimized to use parallel deletion
   */
  async delete(recordId: string): Promise<void> {
    try {
      // Get record details before deletion for audit and cache refresh
      let recordDetails: Record<string, unknown> = {}
      let packagingDate: string | null = null
      try {
        const record = await databaseService.getDocument<PackagingRecord>(
          COLLECTIONS.PACKAGING_RECORDS,
          recordId
        )
        recordDetails = {
          packaging_date: record.packaging_date,
          waybill_number: record.waybill_number,
        }
        packagingDate = record.packaging_date
      } catch {
        // Record may not exist, continue with deletion
      }

      // First, delete all items for this record in parallel
      const items = await packagingItemService.listByRecordId(recordId)
      await Promise.all(
        items.map((item) =>
          databaseService.deleteDocument(COLLECTIONS.PACKAGING_ITEMS, item.$id)
        )
      )

      // Delete the record
      await databaseService.deleteDocument(COLLECTIONS.PACKAGING_RECORDS, recordId)

      // Refresh cache for this date (invalidate + re-create with fresh data)
      if (packagingDate) {
        await this.refreshCache(packagingDate)
      }

      // Single audit log for the entire deletion
      auditLogService.log('packaging_record_delete', 'packaging_record', {
        resource_id: recordId,
        action_details: {
          ...recordDetails,
          itemsDeleted: items.length,
        },
      }).catch(console.error)
    } catch (error) {
      auditLogService.log('packaging_record_delete', 'packaging_record', {
        resource_id: recordId,
        status: 'failure',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      }).catch(console.error)
      throw error
    }
  },
}

export const packagingItemService = {
  /**
   * Create a new packaging item
   */
  async create(data: CreatePackagingItemInput): Promise<PackagingItem> {
    try {
      const item = await databaseService.createDocument<PackagingItem>(
        COLLECTIONS.PACKAGING_ITEMS,
        {
          packaging_record_id: data.packaging_record_id,
          product_barcode: data.product_barcode,
          scanned_at: data.scanned_at ?? new Date().toISOString(),
        }
      )

      auditLogService.log('packaging_item_scan', 'packaging_item', {
        resource_id: item.$id,
        action_details: {
          packaging_record_id: data.packaging_record_id,
          product_barcode: data.product_barcode,
        },
      }).catch(console.error)

      return item
    } catch (error) {
      auditLogService.log('packaging_item_scan', 'packaging_item', {
        action_details: data,
        status: 'failure',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      }).catch(console.error)
      throw error
    }
  },

  /**
   * Get all items for a packaging record
   */
  async listByRecordId(recordId: string): Promise<PackagingItem[]> {
    const result = await databaseService.listDocuments<PackagingItem>(
      COLLECTIONS.PACKAGING_ITEMS,
      [
        Query.equal('packaging_record_id', recordId),
        Query.orderDesc('scanned_at'),
      ]
    )
    return result.documents
  },

  /**
   * Delete a packaging item
   */
  async delete(itemId: string): Promise<void> {
    try {
      // Get item details before deletion for audit
      let itemDetails: Record<string, unknown> = {}
      try {
        const item = await databaseService.getDocument<PackagingItem>(
          COLLECTIONS.PACKAGING_ITEMS,
          itemId
        )
        itemDetails = {
          packaging_record_id: item.packaging_record_id,
          product_barcode: item.product_barcode,
        }
      } catch {
        // Item may not exist, continue with deletion
      }

      await databaseService.deleteDocument(COLLECTIONS.PACKAGING_ITEMS, itemId)

      auditLogService.log('packaging_item_remove', 'packaging_item', {
        resource_id: itemId,
        action_details: itemDetails,
      }).catch(console.error)
    } catch (error) {
      auditLogService.log('packaging_item_remove', 'packaging_item', {
        resource_id: itemId,
        status: 'failure',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      }).catch(console.error)
      throw error
    }
  },
}
