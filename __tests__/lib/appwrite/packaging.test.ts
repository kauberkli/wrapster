import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  packagingRecordService,
  packagingItemService,
} from '@/lib/appwrite/packaging'
import { COLLECTIONS } from '@/types/packaging'
import type { PackagingRecord, PackagingItem } from '@/types/packaging'

const mockDatabaseService = {
  createDocument: vi.fn(),
  getDocument: vi.fn(),
  listDocuments: vi.fn(),
  updateDocument: vi.fn(),
  deleteDocument: vi.fn(),
}

vi.mock('@/lib/appwrite/database', () => ({
  databaseService: {
    createDocument: (...args: unknown[]) => mockDatabaseService.createDocument(...args),
    getDocument: (...args: unknown[]) => mockDatabaseService.getDocument(...args),
    listDocuments: (...args: unknown[]) => mockDatabaseService.listDocuments(...args),
    updateDocument: (...args: unknown[]) => mockDatabaseService.updateDocument(...args),
    deleteDocument: (...args: unknown[]) => mockDatabaseService.deleteDocument(...args),
  },
  Query: {
    equal: (field: string, value: string) => `equal("${field}", "${value}")`,
    limit: (value: number) => `limit(${value})`,
    orderDesc: (field: string) => `orderDesc("${field}")`,
  },
}))

const mockPackagingRecord: PackagingRecord = {
  $id: 'record-1',
  $collectionId: 'packaging_records',
  $databaseId: 'main',
  $createdAt: '2024-01-15T10:00:00.000Z',
  $updatedAt: '2024-01-15T10:00:00.000Z',
  $permissions: [],
  $sequence: 0,
  packaging_date: '2024-01-15',
  waybill_number: 'WB-12345',
}

const mockPackagingItem: PackagingItem = {
  $id: 'item-1',
  $collectionId: 'packaging_items',
  $databaseId: 'main',
  $createdAt: '2024-01-15T10:05:00.000Z',
  $updatedAt: '2024-01-15T10:05:00.000Z',
  $permissions: [],
  $sequence: 0,
  packaging_record_id: 'record-1',
  product_barcode: '1234567890128',
  scanned_at: '2024-01-15T10:05:00.000Z',
}

describe('packagingRecordService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('create', () => {
    it('should create a packaging record', async () => {
      mockDatabaseService.createDocument.mockResolvedValue(mockPackagingRecord)

      const result = await packagingRecordService.create({
        packaging_date: '2024-01-15',
        waybill_number: 'WB-12345',
      })

      expect(mockDatabaseService.createDocument).toHaveBeenCalledWith(
        COLLECTIONS.PACKAGING_RECORDS,
        {
          packaging_date: '2024-01-15',
          waybill_number: 'WB-12345',
        }
      )
      expect(result).toEqual(mockPackagingRecord)
    })

    it('should create record with different date formats', async () => {
      mockDatabaseService.createDocument.mockResolvedValue(mockPackagingRecord)

      await packagingRecordService.create({
        packaging_date: '2024-12-31',
        waybill_number: 'WB-99999',
      })

      expect(mockDatabaseService.createDocument).toHaveBeenCalledWith(
        COLLECTIONS.PACKAGING_RECORDS,
        expect.objectContaining({
          packaging_date: '2024-12-31',
        })
      )
    })

    it('should handle waybill with special characters', async () => {
      mockDatabaseService.createDocument.mockResolvedValue(mockPackagingRecord)

      await packagingRecordService.create({
        packaging_date: '2024-01-15',
        waybill_number: 'WB-12345/A-001',
      })

      expect(mockDatabaseService.createDocument).toHaveBeenCalledWith(
        COLLECTIONS.PACKAGING_RECORDS,
        expect.objectContaining({
          waybill_number: 'WB-12345/A-001',
        })
      )
    })
  })

  describe('getById', () => {
    it('should get packaging record by ID', async () => {
      mockDatabaseService.getDocument.mockResolvedValue(mockPackagingRecord)

      const result = await packagingRecordService.getById('record-1')

      expect(mockDatabaseService.getDocument).toHaveBeenCalledWith(
        COLLECTIONS.PACKAGING_RECORDS,
        'record-1'
      )
      expect(result).toEqual(mockPackagingRecord)
    })

    it('should throw error for non-existent record', async () => {
      mockDatabaseService.getDocument.mockRejectedValue(new Error('Document not found'))

      await expect(packagingRecordService.getById('non-existent')).rejects.toThrow(
        'Document not found'
      )
    })
  })

  describe('getByDateAndWaybill', () => {
    it('should find record by date and waybill', async () => {
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [mockPackagingRecord],
        total: 1,
      })

      const result = await packagingRecordService.getByDateAndWaybill(
        '2024-01-15',
        'WB-12345'
      )

      expect(mockDatabaseService.listDocuments).toHaveBeenCalledWith(
        COLLECTIONS.PACKAGING_RECORDS,
        [
          'equal("packaging_date", "2024-01-15")',
          'equal("waybill_number", "WB-12345")',
          'limit(1)',
        ]
      )
      expect(result).toEqual(mockPackagingRecord)
    })

    it('should return null when no record found', async () => {
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [],
        total: 0,
      })

      const result = await packagingRecordService.getByDateAndWaybill(
        '2024-01-15',
        'WB-99999'
      )

      expect(result).toBeNull()
    })

    it('should return first match when multiple exist', async () => {
      const secondRecord = { ...mockPackagingRecord, $id: 'record-2' }
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [mockPackagingRecord, secondRecord],
        total: 2,
      })

      const result = await packagingRecordService.getByDateAndWaybill(
        '2024-01-15',
        'WB-12345'
      )

      expect(result).toEqual(mockPackagingRecord)
    })
  })

  describe('listByDate', () => {
    it('should list all records for a date with items', async () => {
      mockDatabaseService.listDocuments
        .mockResolvedValueOnce({
          documents: [mockPackagingRecord],
          total: 1,
        })
        .mockResolvedValueOnce({
          documents: [mockPackagingItem],
          total: 1,
        })

      const result = await packagingRecordService.listByDate('2024-01-15')

      expect(result).toHaveLength(1)
      expect(result[0].items).toHaveLength(1)
      expect(result[0].items[0]).toEqual(mockPackagingItem)
    })

    it('should return empty array when no records for date', async () => {
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [],
        total: 0,
      })

      const result = await packagingRecordService.listByDate('2024-01-20')

      expect(result).toEqual([])
    })

    it('should fetch items for each record', async () => {
      const records = [
        mockPackagingRecord,
        { ...mockPackagingRecord, $id: 'record-2' },
      ]
      mockDatabaseService.listDocuments
        .mockResolvedValueOnce({ documents: records, total: 2 })
        .mockResolvedValueOnce({ documents: [mockPackagingItem], total: 1 })
        .mockResolvedValueOnce({
          documents: [{ ...mockPackagingItem, $id: 'item-2' }],
          total: 1,
        })

      const result = await packagingRecordService.listByDate('2024-01-15')

      expect(result).toHaveLength(2)
      expect(result[0].items).toHaveLength(1)
      expect(result[1].items).toHaveLength(1)
    })
  })

  describe('getWithItems', () => {
    it('should get record with its items', async () => {
      mockDatabaseService.getDocument.mockResolvedValue(mockPackagingRecord)
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [mockPackagingItem],
        total: 1,
      })

      const result = await packagingRecordService.getWithItems('record-1')

      expect(result.packaging_date).toBe('2024-01-15')
      expect(result.items).toHaveLength(1)
      expect(result.items[0].product_barcode).toBe('1234567890128')
    })

    it('should return record with empty items array', async () => {
      mockDatabaseService.getDocument.mockResolvedValue(mockPackagingRecord)
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [],
        total: 0,
      })

      const result = await packagingRecordService.getWithItems('record-1')

      expect(result.items).toEqual([])
    })

    it('should throw error for non-existent record', async () => {
      mockDatabaseService.getDocument.mockRejectedValue(new Error('Not found'))

      await expect(
        packagingRecordService.getWithItems('non-existent')
      ).rejects.toThrow('Not found')
    })
  })

  describe('delete', () => {
    it('should delete record and all its items', async () => {
      const items = [
        mockPackagingItem,
        { ...mockPackagingItem, $id: 'item-2' },
      ]
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: items,
        total: 2,
      })
      mockDatabaseService.deleteDocument.mockResolvedValue({})

      await packagingRecordService.delete('record-1')

      // Should delete each item
      expect(mockDatabaseService.deleteDocument).toHaveBeenCalledWith(
        COLLECTIONS.PACKAGING_ITEMS,
        'item-1'
      )
      expect(mockDatabaseService.deleteDocument).toHaveBeenCalledWith(
        COLLECTIONS.PACKAGING_ITEMS,
        'item-2'
      )
      // Should delete the record
      expect(mockDatabaseService.deleteDocument).toHaveBeenCalledWith(
        COLLECTIONS.PACKAGING_RECORDS,
        'record-1'
      )
    })

    it('should delete record without items', async () => {
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [],
        total: 0,
      })
      mockDatabaseService.deleteDocument.mockResolvedValue({})

      await packagingRecordService.delete('record-1')

      expect(mockDatabaseService.deleteDocument).toHaveBeenCalledTimes(1)
      expect(mockDatabaseService.deleteDocument).toHaveBeenCalledWith(
        COLLECTIONS.PACKAGING_RECORDS,
        'record-1'
      )
    })

    it('should delete items in order before record', async () => {
      const deleteOrder: string[] = []
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [mockPackagingItem],
        total: 1,
      })
      mockDatabaseService.deleteDocument.mockImplementation((_collection, id) => {
        deleteOrder.push(id)
        return Promise.resolve({})
      })

      await packagingRecordService.delete('record-1')

      expect(deleteOrder).toEqual(['item-1', 'record-1'])
    })
  })
})

describe('packagingItemService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('create', () => {
    it('should create a packaging item with scanned_at', async () => {
      mockDatabaseService.createDocument.mockResolvedValue(mockPackagingItem)

      const result = await packagingItemService.create({
        packaging_record_id: 'record-1',
        product_barcode: '1234567890128',
        scanned_at: '2024-01-15T10:05:00.000Z',
      })

      expect(mockDatabaseService.createDocument).toHaveBeenCalledWith(
        COLLECTIONS.PACKAGING_ITEMS,
        {
          packaging_record_id: 'record-1',
          product_barcode: '1234567890128',
          scanned_at: '2024-01-15T10:05:00.000Z',
        }
      )
      expect(result).toEqual(mockPackagingItem)
    })

    it('should use current time when scanned_at not provided', async () => {
      const mockDate = new Date('2024-01-15T12:00:00.000Z')
      vi.spyOn(global, 'Date').mockImplementation(() => mockDate as unknown as Date)

      mockDatabaseService.createDocument.mockResolvedValue(mockPackagingItem)

      await packagingItemService.create({
        packaging_record_id: 'record-1',
        product_barcode: '1234567890128',
      })

      expect(mockDatabaseService.createDocument).toHaveBeenCalledWith(
        COLLECTIONS.PACKAGING_ITEMS,
        expect.objectContaining({
          scanned_at: expect.any(String),
        })
      )

      vi.restoreAllMocks()
    })

    it('should handle different barcode formats', async () => {
      mockDatabaseService.createDocument.mockResolvedValue(mockPackagingItem)

      await packagingItemService.create({
        packaging_record_id: 'record-1',
        product_barcode: '9876543210984',
      })

      expect(mockDatabaseService.createDocument).toHaveBeenCalledWith(
        COLLECTIONS.PACKAGING_ITEMS,
        expect.objectContaining({
          product_barcode: '9876543210984',
        })
      )
    })
  })

  describe('listByRecordId', () => {
    it('should list all items for a record', async () => {
      const items = [
        mockPackagingItem,
        { ...mockPackagingItem, $id: 'item-2', product_barcode: '9876543210984' },
      ]
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: items,
        total: 2,
      })

      const result = await packagingItemService.listByRecordId('record-1')

      expect(mockDatabaseService.listDocuments).toHaveBeenCalledWith(
        COLLECTIONS.PACKAGING_ITEMS,
        [
          'equal("packaging_record_id", "record-1")',
          'orderDesc("scanned_at")',
        ]
      )
      expect(result).toHaveLength(2)
    })

    it('should return empty array when no items', async () => {
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [],
        total: 0,
      })

      const result = await packagingItemService.listByRecordId('record-empty')

      expect(result).toEqual([])
    })

    it('should return items ordered by scanned_at descending', async () => {
      const items = [
        { ...mockPackagingItem, $id: 'item-1', scanned_at: '2024-01-15T10:10:00.000Z' },
        { ...mockPackagingItem, $id: 'item-2', scanned_at: '2024-01-15T10:05:00.000Z' },
      ]
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: items,
        total: 2,
      })

      const result = await packagingItemService.listByRecordId('record-1')

      expect(result[0].$id).toBe('item-1')
      expect(result[1].$id).toBe('item-2')
    })
  })

  describe('delete', () => {
    it('should delete a packaging item', async () => {
      mockDatabaseService.deleteDocument.mockResolvedValue({})

      await packagingItemService.delete('item-1')

      expect(mockDatabaseService.deleteDocument).toHaveBeenCalledWith(
        COLLECTIONS.PACKAGING_ITEMS,
        'item-1'
      )
    })

    it('should throw error for non-existent item', async () => {
      mockDatabaseService.deleteDocument.mockRejectedValue(
        new Error('Document not found')
      )

      await expect(packagingItemService.delete('non-existent')).rejects.toThrow(
        'Document not found'
      )
    })
  })
})

describe('packaging services edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('concurrent operations', () => {
    it('should handle concurrent item creations', async () => {
      mockDatabaseService.createDocument.mockResolvedValue(mockPackagingItem)

      const promises = Array.from({ length: 10 }, (_, i) =>
        packagingItemService.create({
          packaging_record_id: 'record-1',
          product_barcode: `123456789012${i}`,
        })
      )

      const results = await Promise.all(promises)

      expect(results).toHaveLength(10)
      expect(mockDatabaseService.createDocument).toHaveBeenCalledTimes(10)
    })

    it('should handle concurrent record lookups', async () => {
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [mockPackagingRecord],
        total: 1,
      })

      const promises = Array.from({ length: 5 }, () =>
        packagingRecordService.getByDateAndWaybill('2024-01-15', 'WB-12345')
      )

      const results = await Promise.all(promises)

      expect(results.every((r) => r?.$id === 'record-1')).toBe(true)
    })
  })

  describe('large data handling', () => {
    it('should handle record with many items', async () => {
      const manyItems = Array.from({ length: 100 }, (_, i) => ({
        ...mockPackagingItem,
        $id: `item-${i}`,
        product_barcode: `${1234567890128 + i}`,
      }))

      mockDatabaseService.getDocument.mockResolvedValue(mockPackagingRecord)
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: manyItems,
        total: 100,
      })

      const result = await packagingRecordService.getWithItems('record-1')

      expect(result.items).toHaveLength(100)
    })

    it('should handle many records for a date', async () => {
      const manyRecords = Array.from({ length: 50 }, (_, i) => ({
        ...mockPackagingRecord,
        $id: `record-${i}`,
        waybill_number: `WB-${10000 + i}`,
      }))

      // First call returns the records
      mockDatabaseService.listDocuments.mockResolvedValueOnce({
        documents: manyRecords,
        total: 50,
      })
      // Subsequent calls return items for each record
      for (let i = 0; i < 50; i++) {
        mockDatabaseService.listDocuments.mockResolvedValueOnce({
          documents: [mockPackagingItem],
          total: 1,
        })
      }

      const result = await packagingRecordService.listByDate('2024-01-15')

      expect(result).toHaveLength(50)
      expect(result.every((r) => r.items.length > 0)).toBe(true)
    })
  })

  describe('special characters in data', () => {
    it('should handle waybill with unicode characters', async () => {
      mockDatabaseService.createDocument.mockResolvedValue({
        ...mockPackagingRecord,
        waybill_number: 'WB-中文-日本語',
      })

      const result = await packagingRecordService.create({
        packaging_date: '2024-01-15',
        waybill_number: 'WB-中文-日本語',
      })

      expect(result.waybill_number).toBe('WB-中文-日本語')
    })

    it('should handle barcode with leading zeros', async () => {
      mockDatabaseService.createDocument.mockResolvedValue({
        ...mockPackagingItem,
        product_barcode: '0012345678905',
      })

      const result = await packagingItemService.create({
        packaging_record_id: 'record-1',
        product_barcode: '0012345678905',
      })

      expect(result.product_barcode).toBe('0012345678905')
    })
  })

  describe('error propagation', () => {
    it('should propagate database errors on create', async () => {
      mockDatabaseService.createDocument.mockRejectedValue(
        new Error('Database connection failed')
      )

      await expect(
        packagingRecordService.create({
          packaging_date: '2024-01-15',
          waybill_number: 'WB-12345',
        })
      ).rejects.toThrow('Database connection failed')
    })

    it('should propagate errors during delete cascade', async () => {
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [mockPackagingItem],
        total: 1,
      })
      mockDatabaseService.deleteDocument.mockRejectedValue(
        new Error('Delete failed')
      )

      await expect(packagingRecordService.delete('record-1')).rejects.toThrow(
        'Delete failed'
      )
    })
  })
})
