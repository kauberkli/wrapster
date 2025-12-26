import type { Models } from 'appwrite'

/**
 * Packaging record document from Appwrite
 * Represents a waybill entry for a specific date
 */
export interface PackagingRecord extends Models.Document {
  packaging_date: string // YYYY-MM-DD format
  waybill_number: string
}

/**
 * Packaging item document from Appwrite
 * Represents a single product scan within a packaging record
 */
export interface PackagingItem extends Models.Document {
  packaging_record_id: string
  product_barcode: string
  scanned_at: string // ISO datetime
}

/**
 * Packaging record with its items expanded
 */
export interface PackagingRecordWithItems extends PackagingRecord {
  items: PackagingItem[]
}

/**
 * Input data for creating a new packaging record
 */
export type CreatePackagingRecordInput = {
  packaging_date: string
  waybill_number: string
}

/**
 * Input data for creating a packaging item
 */
export type CreatePackagingItemInput = {
  packaging_record_id: string
  product_barcode: string
  scanned_at?: string // Auto-set to current timestamp if not provided
}

/**
 * Collection IDs for Appwrite
 */
export const COLLECTIONS = {
  PACKAGING_RECORDS: 'packaging_records',
  PACKAGING_ITEMS: 'packaging_items',
} as const
