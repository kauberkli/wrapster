import { databaseService, Query } from './database'

import type {
  CreatePackagingItemInput,
  CreatePackagingRecordInput,
  PackagingItem,
  PackagingRecord,
  PackagingRecordWithItems,
} from '@/types/packaging'
import { COLLECTIONS } from '@/types/packaging'

export const packagingRecordService = {
  /**
   * Create a new packaging record
   */
  async create(data: CreatePackagingRecordInput): Promise<PackagingRecord> {
    return databaseService.createDocument<PackagingRecord>(
      COLLECTIONS.PACKAGING_RECORDS,
      {
        packaging_date: data.packaging_date,
        waybill_number: data.waybill_number,
      }
    )
  },

  /**
   * Get a packaging record by ID
   */
  async getById(recordId: string): Promise<PackagingRecord> {
    return databaseService.getDocument<PackagingRecord>(
      COLLECTIONS.PACKAGING_RECORDS,
      recordId
    )
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
   * List all packaging records for a specific date
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

    return recordsWithItems
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
   * Delete a packaging record and all its items
   */
  async delete(recordId: string): Promise<void> {
    // First, delete all items for this record
    const items = await packagingItemService.listByRecordId(recordId)
    for (const item of items) {
      await databaseService.deleteDocument(COLLECTIONS.PACKAGING_ITEMS, item.$id)
    }

    // Delete the record
    await databaseService.deleteDocument(COLLECTIONS.PACKAGING_RECORDS, recordId)
  },
}

export const packagingItemService = {
  /**
   * Create a new packaging item
   */
  async create(data: CreatePackagingItemInput): Promise<PackagingItem> {
    return databaseService.createDocument<PackagingItem>(
      COLLECTIONS.PACKAGING_ITEMS,
      {
        packaging_record_id: data.packaging_record_id,
        product_barcode: data.product_barcode,
        scanned_at: data.scanned_at ?? new Date().toISOString(),
      }
    )
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
    await databaseService.deleteDocument(COLLECTIONS.PACKAGING_ITEMS, itemId)
  },
}
