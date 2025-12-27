import { beforeEach, describe, expect, it, vi } from 'vitest'

import { databaseService } from '@/lib/appwrite/database'

const mockDatabases = {
  createDocument: vi.fn(),
  getDocument: vi.fn(),
  listDocuments: vi.fn(),
  updateDocument: vi.fn(),
  deleteDocument: vi.fn(),
}

vi.mock('@/lib/appwrite/config', () => ({
  databases: {
    createDocument: (...args: unknown[]) => mockDatabases.createDocument(...args),
    getDocument: (...args: unknown[]) => mockDatabases.getDocument(...args),
    listDocuments: (...args: unknown[]) => mockDatabases.listDocuments(...args),
    updateDocument: (...args: unknown[]) => mockDatabases.updateDocument(...args),
    deleteDocument: (...args: unknown[]) => mockDatabases.deleteDocument(...args),
  },
  ID: {
    unique: () => 'unique-id',
  },
  Query: {
    equal: (field: string, value: string) => `equal("${field}", "${value}")`,
  },
}))

const DATABASE_ID = 'test-database'

interface TestDocument {
  $id: string
  $collectionId: string
  $databaseId: string
  $createdAt: string
  $updatedAt: string
  $permissions: string[]
  $sequence: number
  name: string
  value: number
}

const mockDocument: TestDocument = {
  $id: 'doc-1',
  $collectionId: 'test-collection',
  $databaseId: DATABASE_ID,
  $createdAt: '2024-01-01T00:00:00.000Z',
  $updatedAt: '2024-01-01T00:00:00.000Z',
  $permissions: [],
  $sequence: 0,
  name: 'Test Document',
  value: 42,
}

describe('databaseService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock the environment variable
    vi.stubEnv('VITE_APPWRITE_DATABASE_ID', DATABASE_ID)
  })

  describe('createDocument', () => {
    it('should create a document with auto-generated ID', async () => {
      mockDatabases.createDocument.mockResolvedValue(mockDocument)

      const result = await databaseService.createDocument<TestDocument>(
        'test-collection',
        { name: 'Test Document', value: 42 }
      )

      expect(mockDatabases.createDocument).toHaveBeenCalledWith(
        expect.any(String),
        'test-collection',
        'unique-id',
        { name: 'Test Document', value: 42 },
        undefined
      )
      expect(result).toEqual(mockDocument)
    })

    it('should create a document with custom ID', async () => {
      mockDatabases.createDocument.mockResolvedValue(mockDocument)

      await databaseService.createDocument<TestDocument>(
        'test-collection',
        { name: 'Test Document', value: 42 },
        'custom-id'
      )

      expect(mockDatabases.createDocument).toHaveBeenCalledWith(
        expect.any(String),
        'test-collection',
        'custom-id',
        { name: 'Test Document', value: 42 },
        undefined
      )
    })

    it('should create a document with permissions', async () => {
      mockDatabases.createDocument.mockResolvedValue(mockDocument)

      await databaseService.createDocument<TestDocument>(
        'test-collection',
        { name: 'Test Document', value: 42 },
        undefined,
        ['read("any")', 'write("user:123")']
      )

      expect(mockDatabases.createDocument).toHaveBeenCalledWith(
        expect.any(String),
        'test-collection',
        'unique-id',
        { name: 'Test Document', value: 42 },
        ['read("any")', 'write("user:123")']
      )
    })

    it('should throw error on creation failure', async () => {
      mockDatabases.createDocument.mockRejectedValue(
        new Error('Document already exists')
      )

      await expect(
        databaseService.createDocument('test-collection', { name: 'Test', value: 1 })
      ).rejects.toThrow('Document already exists')
    })
  })

  describe('getDocument', () => {
    it('should get a document by ID', async () => {
      mockDatabases.getDocument.mockResolvedValue(mockDocument)

      const result = await databaseService.getDocument<TestDocument>(
        'test-collection',
        'doc-1'
      )

      expect(mockDatabases.getDocument).toHaveBeenCalledWith(
        expect.any(String),
        'test-collection',
        'doc-1'
      )
      expect(result).toEqual(mockDocument)
    })

    it('should throw error for non-existent document', async () => {
      mockDatabases.getDocument.mockRejectedValue(
        new Error('Document not found')
      )

      await expect(
        databaseService.getDocument('test-collection', 'non-existent')
      ).rejects.toThrow('Document not found')
    })
  })

  describe('listDocuments', () => {
    it('should list documents without queries', async () => {
      mockDatabases.listDocuments.mockResolvedValue({
        documents: [mockDocument],
        total: 1,
      })

      const result = await databaseService.listDocuments<TestDocument>(
        'test-collection'
      )

      expect(mockDatabases.listDocuments).toHaveBeenCalledWith(
        expect.any(String),
        'test-collection',
        undefined
      )
      expect(result.documents).toEqual([mockDocument])
      expect(result.total).toBe(1)
    })

    it('should list documents with queries', async () => {
      mockDatabases.listDocuments.mockResolvedValue({
        documents: [mockDocument],
        total: 1,
      })

      await databaseService.listDocuments<TestDocument>(
        'test-collection',
        ['equal("name", "Test")', 'limit(10)']
      )

      expect(mockDatabases.listDocuments).toHaveBeenCalledWith(
        expect.any(String),
        'test-collection',
        ['equal("name", "Test")', 'limit(10)']
      )
    })

    it('should return empty array when no documents', async () => {
      mockDatabases.listDocuments.mockResolvedValue({
        documents: [],
        total: 0,
      })

      const result = await databaseService.listDocuments<TestDocument>(
        'test-collection'
      )

      expect(result.documents).toEqual([])
      expect(result.total).toBe(0)
    })

    it('should handle pagination', async () => {
      mockDatabases.listDocuments.mockResolvedValue({
        documents: [mockDocument],
        total: 100,
      })

      const result = await databaseService.listDocuments<TestDocument>(
        'test-collection',
        ['limit(25)', 'offset(50)']
      )

      expect(result.documents).toHaveLength(1)
      expect(result.total).toBe(100)
    })
  })

  describe('updateDocument', () => {
    it('should update a document', async () => {
      const updatedDocument = { ...mockDocument, name: 'Updated Name' }
      mockDatabases.updateDocument.mockResolvedValue(updatedDocument)

      const result = await databaseService.updateDocument<TestDocument>(
        'test-collection',
        'doc-1',
        { name: 'Updated Name' }
      )

      expect(mockDatabases.updateDocument).toHaveBeenCalledWith(
        expect.any(String),
        'test-collection',
        'doc-1',
        { name: 'Updated Name' },
        undefined
      )
      expect(result.name).toBe('Updated Name')
    })

    it('should update document with permissions', async () => {
      mockDatabases.updateDocument.mockResolvedValue(mockDocument)

      await databaseService.updateDocument<TestDocument>(
        'test-collection',
        'doc-1',
        { name: 'Updated' },
        ['read("any")']
      )

      expect(mockDatabases.updateDocument).toHaveBeenCalledWith(
        expect.any(String),
        'test-collection',
        'doc-1',
        { name: 'Updated' },
        ['read("any")']
      )
    })

    it('should throw error for non-existent document', async () => {
      mockDatabases.updateDocument.mockRejectedValue(
        new Error('Document not found')
      )

      await expect(
        databaseService.updateDocument('test-collection', 'non-existent', {
          name: 'Test',
        })
      ).rejects.toThrow('Document not found')
    })

    it('should handle partial updates', async () => {
      mockDatabases.updateDocument.mockResolvedValue({
        ...mockDocument,
        value: 100,
      })

      const result = await databaseService.updateDocument<TestDocument>(
        'test-collection',
        'doc-1',
        { value: 100 }
      )

      expect(mockDatabases.updateDocument).toHaveBeenCalledWith(
        expect.any(String),
        'test-collection',
        'doc-1',
        { value: 100 },
        undefined
      )
      expect(result.value).toBe(100)
      expect(result.name).toBe('Test Document') // Unchanged
    })
  })

  describe('deleteDocument', () => {
    it('should delete a document', async () => {
      mockDatabases.deleteDocument.mockResolvedValue({})

      await databaseService.deleteDocument('test-collection', 'doc-1')

      expect(mockDatabases.deleteDocument).toHaveBeenCalledWith(
        expect.any(String),
        'test-collection',
        'doc-1'
      )
    })

    it('should throw error for non-existent document', async () => {
      mockDatabases.deleteDocument.mockRejectedValue(
        new Error('Document not found')
      )

      await expect(
        databaseService.deleteDocument('test-collection', 'non-existent')
      ).rejects.toThrow('Document not found')
    })
  })
})

describe('databaseService edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('special data handling', () => {
    it('should handle documents with nested objects', async () => {
      const nestedDoc = {
        ...mockDocument,
        metadata: { nested: { deeply: 'value' } },
      }
      mockDatabases.createDocument.mockResolvedValue(nestedDoc)

      const result = await databaseService.createDocument('test-collection', {
        name: 'Test',
        value: 1,
        metadata: { nested: { deeply: 'value' } },
      })

      expect(result).toEqual(nestedDoc)
    })

    it('should handle documents with arrays', async () => {
      const arrayDoc = {
        ...mockDocument,
        tags: ['tag1', 'tag2', 'tag3'],
      }
      mockDatabases.createDocument.mockResolvedValue(arrayDoc)

      const result = await databaseService.createDocument('test-collection', {
        name: 'Test',
        value: 1,
        tags: ['tag1', 'tag2', 'tag3'],
      })

      expect(result).toEqual(arrayDoc)
    })

    it('should handle unicode strings', async () => {
      const unicodeDoc = {
        ...mockDocument,
        name: '中文日本語한국어🚀',
      }
      mockDatabases.createDocument.mockResolvedValue(unicodeDoc)

      const result = await databaseService.createDocument<TestDocument>('test-collection', {
        name: '中文日本語한국어🚀',
        value: 1,
      })

      expect(result.name).toBe('中文日本語한국어🚀')
    })

    it('should handle null values', async () => {
      const nullDoc = {
        ...mockDocument,
        optionalField: null,
      }
      mockDatabases.createDocument.mockResolvedValue(nullDoc)

      await databaseService.createDocument('test-collection', {
        name: 'Test',
        value: 1,
        optionalField: null,
      })

      expect(mockDatabases.createDocument).toHaveBeenCalled()
    })

    it('should handle boolean values', async () => {
      const boolDoc = {
        ...mockDocument,
        isActive: true,
        isDeleted: false,
      }
      mockDatabases.createDocument.mockResolvedValue(boolDoc)

      const result = await databaseService.createDocument('test-collection', {
        name: 'Test',
        value: 1,
        isActive: true,
        isDeleted: false,
      })

      expect(result).toEqual(boolDoc)
    })

    it('should handle date strings', async () => {
      const dateDoc = {
        ...mockDocument,
        createdDate: '2024-01-15T12:00:00.000Z',
      }
      mockDatabases.createDocument.mockResolvedValue(dateDoc)

      const result = await databaseService.createDocument('test-collection', {
        name: 'Test',
        value: 1,
        createdDate: '2024-01-15T12:00:00.000Z',
      })

      expect(result).toEqual(dateDoc)
    })
  })

  describe('concurrent operations', () => {
    it('should handle concurrent creates', async () => {
      mockDatabases.createDocument.mockResolvedValue(mockDocument)

      const promises = Array.from({ length: 10 }, (_, i) =>
        databaseService.createDocument('test-collection', {
          name: `Doc ${i}`,
          value: i,
        })
      )

      const results = await Promise.all(promises)

      expect(results).toHaveLength(10)
      expect(mockDatabases.createDocument).toHaveBeenCalledTimes(10)
    })

    it('should handle concurrent reads', async () => {
      mockDatabases.getDocument.mockResolvedValue(mockDocument)

      const promises = Array.from({ length: 10 }, () =>
        databaseService.getDocument('test-collection', 'doc-1')
      )

      const results = await Promise.all(promises)

      expect(results.every((r) => r.$id === mockDocument.$id)).toBe(true)
    })

    it('should handle concurrent mixed operations', async () => {
      mockDatabases.createDocument.mockResolvedValue(mockDocument)
      mockDatabases.getDocument.mockResolvedValue(mockDocument)
      mockDatabases.listDocuments.mockResolvedValue({ documents: [mockDocument], total: 1 })

      const promises = [
        databaseService.createDocument('test-collection', { name: 'Test', value: 1 }),
        databaseService.getDocument('test-collection', 'doc-1'),
        databaseService.listDocuments('test-collection'),
      ]

      const results = await Promise.all(promises)

      expect(results).toHaveLength(3)
    })
  })

  describe('error scenarios', () => {
    it('should handle network errors', async () => {
      mockDatabases.createDocument.mockRejectedValue(new Error('Network error'))

      await expect(
        databaseService.createDocument('test-collection', { name: 'Test', value: 1 })
      ).rejects.toThrow('Network error')
    })

    it('should handle permission errors', async () => {
      mockDatabases.getDocument.mockRejectedValue(new Error('Permission denied'))

      await expect(
        databaseService.getDocument('test-collection', 'doc-1')
      ).rejects.toThrow('Permission denied')
    })

    it('should handle timeout errors', async () => {
      mockDatabases.listDocuments.mockRejectedValue(new Error('Request timeout'))

      await expect(
        databaseService.listDocuments('test-collection')
      ).rejects.toThrow('Request timeout')
    })

    it('should handle validation errors', async () => {
      mockDatabases.updateDocument.mockRejectedValue(
        new Error('Invalid attribute value')
      )

      await expect(
        databaseService.updateDocument('test-collection', 'doc-1', {
          value: 'invalid',
        })
      ).rejects.toThrow('Invalid attribute value')
    })
  })

  describe('empty and edge values', () => {
    it('should handle empty string values', async () => {
      const emptyDoc = { ...mockDocument, name: '' }
      mockDatabases.createDocument.mockResolvedValue(emptyDoc)

      const result = await databaseService.createDocument<TestDocument>('test-collection', {
        name: '',
        value: 0,
      })

      expect(result.name).toBe('')
    })

    it('should handle zero values', async () => {
      const zeroDoc = { ...mockDocument, value: 0 }
      mockDatabases.createDocument.mockResolvedValue(zeroDoc)

      const result = await databaseService.createDocument<TestDocument>('test-collection', {
        name: 'Test',
        value: 0,
      })

      expect(result.value).toBe(0)
    })

    it('should handle negative values', async () => {
      const negDoc = { ...mockDocument, value: -100 }
      mockDatabases.createDocument.mockResolvedValue(negDoc)

      const result = await databaseService.createDocument<TestDocument>('test-collection', {
        name: 'Test',
        value: -100,
      })

      expect(result.value).toBe(-100)
    })

    it('should handle floating point values', async () => {
      const floatDoc = { ...mockDocument, value: 3.14159 }
      mockDatabases.createDocument.mockResolvedValue(floatDoc)

      const result = await databaseService.createDocument<TestDocument>('test-collection', {
        name: 'Test',
        value: 3.14159,
      })

      expect(result.value).toBeCloseTo(3.14159)
    })

    it('should handle very large numbers', async () => {
      const largeDoc = { ...mockDocument, value: Number.MAX_SAFE_INTEGER }
      mockDatabases.createDocument.mockResolvedValue(largeDoc)

      const result = await databaseService.createDocument<TestDocument>('test-collection', {
        name: 'Test',
        value: Number.MAX_SAFE_INTEGER,
      })

      expect(result.value).toBe(Number.MAX_SAFE_INTEGER)
    })
  })
})
