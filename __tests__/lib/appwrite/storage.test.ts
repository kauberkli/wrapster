import { ImageGravity } from 'appwrite'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { storageService } from '@/lib/appwrite/storage'

const mockStorage = {
  createFile: vi.fn(),
  getFile: vi.fn(),
  listFiles: vi.fn(),
  deleteFile: vi.fn(),
  updateFile: vi.fn(),
  getFilePreview: vi.fn(),
  getFileDownload: vi.fn(),
  getFileView: vi.fn(),
}

vi.mock('@/lib/appwrite/config', () => ({
  storage: {
    createFile: (...args: unknown[]) => mockStorage.createFile(...args),
    getFile: (...args: unknown[]) => mockStorage.getFile(...args),
    listFiles: (...args: unknown[]) => mockStorage.listFiles(...args),
    deleteFile: (...args: unknown[]) => mockStorage.deleteFile(...args),
    updateFile: (...args: unknown[]) => mockStorage.updateFile(...args),
    getFilePreview: (...args: unknown[]) => mockStorage.getFilePreview(...args),
    getFileDownload: (...args: unknown[]) => mockStorage.getFileDownload(...args),
    getFileView: (...args: unknown[]) => mockStorage.getFileView(...args),
  },
  ID: {
    unique: () => 'unique-id',
  },
}))

const BUCKET_ID = 'test-bucket'

const mockFile = {
  $id: 'file-123',
  $createdAt: '2024-01-01T00:00:00.000Z',
  $updatedAt: '2024-01-01T00:00:00.000Z',
  $permissions: ['read("any")'],
  bucketId: BUCKET_ID,
  name: 'test-file.xlsx',
  signature: 'abc123',
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  sizeOriginal: 1024,
  chunksTotal: 1,
  chunksUploaded: 1,
}

describe('storageService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VITE_APPWRITE_BUCKET_ID', BUCKET_ID)
  })

  describe('uploadFile', () => {
    it('should upload a file with auto-generated ID', async () => {
      mockStorage.createFile.mockResolvedValue(mockFile)
      const file = new File(['test content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })

      const result = await storageService.uploadFile(file)

      expect(mockStorage.createFile).toHaveBeenCalledWith(
        expect.any(String),
        'unique-id',
        file,
        undefined
      )
      expect(result).toEqual(mockFile)
    })

    it('should upload a file with custom ID', async () => {
      mockStorage.createFile.mockResolvedValue(mockFile)
      const file = new File(['test content'], 'test.xlsx')

      await storageService.uploadFile(file, 'custom-file-id')

      expect(mockStorage.createFile).toHaveBeenCalledWith(
        expect.any(String),
        'custom-file-id',
        file,
        undefined
      )
    })

    it('should upload a file with permissions', async () => {
      mockStorage.createFile.mockResolvedValue(mockFile)
      const file = new File(['test content'], 'test.xlsx')

      await storageService.uploadFile(file, undefined, ['read("any")', 'write("user:123")'])

      expect(mockStorage.createFile).toHaveBeenCalledWith(
        expect.any(String),
        'unique-id',
        file,
        ['read("any")', 'write("user:123")']
      )
    })

    it('should handle large file upload', async () => {
      mockStorage.createFile.mockResolvedValue({
        ...mockFile,
        sizeOriginal: 10 * 1024 * 1024, // 10 MB
        chunksTotal: 10,
        chunksUploaded: 10,
      })
      const largeContent = 'x'.repeat(10 * 1024 * 1024)
      const file = new File([largeContent], 'large-file.xlsx')

      const result = await storageService.uploadFile(file)

      expect(result.sizeOriginal).toBe(10 * 1024 * 1024)
    })

    it('should throw error on upload failure', async () => {
      mockStorage.createFile.mockRejectedValue(new Error('Upload failed'))
      const file = new File(['test'], 'test.xlsx')

      await expect(storageService.uploadFile(file)).rejects.toThrow('Upload failed')
    })

    it('should handle different file types', async () => {
      mockStorage.createFile.mockResolvedValue(mockFile)

      const pdfFile = new File(['pdf content'], 'test.pdf', { type: 'application/pdf' })
      await storageService.uploadFile(pdfFile)

      const imageFile = new File(['image content'], 'test.png', { type: 'image/png' })
      await storageService.uploadFile(imageFile)

      expect(mockStorage.createFile).toHaveBeenCalledTimes(2)
    })
  })

  describe('getFile', () => {
    it('should get file by ID', async () => {
      mockStorage.getFile.mockResolvedValue(mockFile)

      const result = await storageService.getFile('file-123')

      expect(mockStorage.getFile).toHaveBeenCalledWith(expect.any(String), 'file-123')
      expect(result).toEqual(mockFile)
    })

    it('should throw error for non-existent file', async () => {
      mockStorage.getFile.mockRejectedValue(new Error('File not found'))

      await expect(storageService.getFile('non-existent')).rejects.toThrow(
        'File not found'
      )
    })
  })

  describe('listFiles', () => {
    it('should list files without queries', async () => {
      mockStorage.listFiles.mockResolvedValue({
        files: [mockFile],
        total: 1,
      })

      const result = await storageService.listFiles()

      expect(mockStorage.listFiles).toHaveBeenCalledWith(
        expect.any(String),
        undefined,
        undefined
      )
      expect(result.files).toEqual([mockFile])
      expect(result.total).toBe(1)
    })

    it('should list files with queries', async () => {
      mockStorage.listFiles.mockResolvedValue({
        files: [mockFile],
        total: 1,
      })

      await storageService.listFiles(['limit(10)', 'offset(5)'])

      expect(mockStorage.listFiles).toHaveBeenCalledWith(
        expect.any(String),
        ['limit(10)', 'offset(5)'],
        undefined
      )
    })

    it('should list files with search', async () => {
      mockStorage.listFiles.mockResolvedValue({
        files: [mockFile],
        total: 1,
      })

      await storageService.listFiles(undefined, 'test')

      expect(mockStorage.listFiles).toHaveBeenCalledWith(
        expect.any(String),
        undefined,
        'test'
      )
    })

    it('should list files with both queries and search', async () => {
      mockStorage.listFiles.mockResolvedValue({
        files: [],
        total: 0,
      })

      await storageService.listFiles(['limit(5)'], 'xlsx')

      expect(mockStorage.listFiles).toHaveBeenCalledWith(
        expect.any(String),
        ['limit(5)'],
        'xlsx'
      )
    })

    it('should return empty array when no files', async () => {
      mockStorage.listFiles.mockResolvedValue({
        files: [],
        total: 0,
      })

      const result = await storageService.listFiles()

      expect(result.files).toEqual([])
      expect(result.total).toBe(0)
    })
  })

  describe('deleteFile', () => {
    it('should delete file by ID', async () => {
      mockStorage.deleteFile.mockResolvedValue({})

      await storageService.deleteFile('file-123')

      expect(mockStorage.deleteFile).toHaveBeenCalledWith(
        expect.any(String),
        'file-123'
      )
    })

    it('should throw error for non-existent file', async () => {
      mockStorage.deleteFile.mockRejectedValue(new Error('File not found'))

      await expect(storageService.deleteFile('non-existent')).rejects.toThrow(
        'File not found'
      )
    })
  })

  describe('updateFile', () => {
    it('should update file name', async () => {
      const updatedFile = { ...mockFile, name: 'new-name.xlsx' }
      mockStorage.updateFile.mockResolvedValue(updatedFile)

      const result = await storageService.updateFile('file-123', 'new-name.xlsx')

      expect(mockStorage.updateFile).toHaveBeenCalledWith(
        expect.any(String),
        'file-123',
        'new-name.xlsx',
        undefined
      )
      expect(result.name).toBe('new-name.xlsx')
    })

    it('should update file permissions', async () => {
      mockStorage.updateFile.mockResolvedValue(mockFile)

      await storageService.updateFile('file-123', undefined, ['read("any")'])

      expect(mockStorage.updateFile).toHaveBeenCalledWith(
        expect.any(String),
        'file-123',
        undefined,
        ['read("any")']
      )
    })

    it('should update both name and permissions', async () => {
      mockStorage.updateFile.mockResolvedValue(mockFile)

      await storageService.updateFile('file-123', 'new-name.xlsx', ['read("any")'])

      expect(mockStorage.updateFile).toHaveBeenCalledWith(
        expect.any(String),
        'file-123',
        'new-name.xlsx',
        ['read("any")']
      )
    })
  })

  describe('getFilePreview', () => {
    it('should get file preview URL', () => {
      mockStorage.getFilePreview.mockReturnValue('https://example.com/preview')

      const result = storageService.getFilePreview('file-123')

      expect(mockStorage.getFilePreview).toHaveBeenCalledWith(
        expect.any(String),
        'file-123',
        undefined,
        undefined,
        undefined,
        undefined
      )
      expect(result).toBe('https://example.com/preview')
    })

    it('should get file preview with dimensions', () => {
      mockStorage.getFilePreview.mockReturnValue('https://example.com/preview')

      storageService.getFilePreview('file-123', { width: 200, height: 100 })

      expect(mockStorage.getFilePreview).toHaveBeenCalledWith(
        expect.any(String),
        'file-123',
        200,
        100,
        undefined,
        undefined
      )
    })

    it('should get file preview with quality', () => {
      mockStorage.getFilePreview.mockReturnValue('https://example.com/preview')

      storageService.getFilePreview('file-123', { quality: 80 })

      expect(mockStorage.getFilePreview).toHaveBeenCalledWith(
        expect.any(String),
        'file-123',
        undefined,
        undefined,
        undefined,
        80
      )
    })

    it('should get file preview with all options', () => {
      mockStorage.getFilePreview.mockReturnValue('https://example.com/preview')

      storageService.getFilePreview('file-123', {
        width: 300,
        height: 200,
        gravity: ImageGravity.Center,
        quality: 90,
      })

      expect(mockStorage.getFilePreview).toHaveBeenCalledWith(
        expect.any(String),
        'file-123',
        300,
        200,
        'center',
        90
      )
    })
  })

  describe('getFileDownload', () => {
    it('should get file download URL', () => {
      mockStorage.getFileDownload.mockReturnValue('https://example.com/download')

      const result = storageService.getFileDownload('file-123')

      expect(mockStorage.getFileDownload).toHaveBeenCalledWith(
        expect.any(String),
        'file-123'
      )
      expect(result).toBe('https://example.com/download')
    })
  })

  describe('getFileView', () => {
    it('should get file view URL', () => {
      mockStorage.getFileView.mockReturnValue('https://example.com/view')

      const result = storageService.getFileView('file-123')

      expect(mockStorage.getFileView).toHaveBeenCalledWith(
        expect.any(String),
        'file-123'
      )
      expect(result).toBe('https://example.com/view')
    })
  })
})

describe('storageService edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('file type handling', () => {
    it('should handle Excel file upload', async () => {
      mockStorage.createFile.mockResolvedValue({
        ...mockFile,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const file = new File(['content'], 'data.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })

      const result = await storageService.uploadFile(file)

      expect(result.mimeType).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
    })

    it('should handle PDF file upload', async () => {
      mockStorage.createFile.mockResolvedValue({
        ...mockFile,
        mimeType: 'application/pdf',
        name: 'document.pdf',
      })
      const file = new File(['content'], 'document.pdf', {
        type: 'application/pdf',
      })

      const result = await storageService.uploadFile(file)

      expect(result.mimeType).toBe('application/pdf')
    })

    it('should handle image file upload', async () => {
      mockStorage.createFile.mockResolvedValue({
        ...mockFile,
        mimeType: 'image/png',
        name: 'image.png',
      })
      const file = new File(['content'], 'image.png', {
        type: 'image/png',
      })

      const result = await storageService.uploadFile(file)

      expect(result.mimeType).toBe('image/png')
    })
  })

  describe('concurrent operations', () => {
    it('should handle concurrent uploads', async () => {
      mockStorage.createFile.mockResolvedValue(mockFile)

      const files = Array.from(
        { length: 5 },
        (_, i) => new File(['content'], `file${i}.xlsx`)
      )
      const promises = files.map((file) => storageService.uploadFile(file))

      const results = await Promise.all(promises)

      expect(results).toHaveLength(5)
      expect(mockStorage.createFile).toHaveBeenCalledTimes(5)
    })

    it('should handle concurrent deletes', async () => {
      mockStorage.deleteFile.mockResolvedValue({})

      const fileIds = ['file-1', 'file-2', 'file-3', 'file-4', 'file-5']
      const promises = fileIds.map((id) => storageService.deleteFile(id))

      await Promise.all(promises)

      expect(mockStorage.deleteFile).toHaveBeenCalledTimes(5)
    })

    it('should handle mixed concurrent operations', async () => {
      mockStorage.createFile.mockResolvedValue(mockFile)
      mockStorage.getFile.mockResolvedValue(mockFile)
      mockStorage.deleteFile.mockResolvedValue({})

      const file = new File(['content'], 'test.xlsx')
      const promises = [
        storageService.uploadFile(file),
        storageService.getFile('file-123'),
        storageService.deleteFile('old-file'),
      ]

      await Promise.all(promises)

      expect(mockStorage.createFile).toHaveBeenCalled()
      expect(mockStorage.getFile).toHaveBeenCalled()
      expect(mockStorage.deleteFile).toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('should handle storage quota exceeded', async () => {
      mockStorage.createFile.mockRejectedValue(new Error('Storage quota exceeded'))
      const file = new File(['content'], 'test.xlsx')

      await expect(storageService.uploadFile(file)).rejects.toThrow(
        'Storage quota exceeded'
      )
    })

    it('should handle invalid file type', async () => {
      mockStorage.createFile.mockRejectedValue(new Error('Invalid file type'))
      const file = new File(['content'], 'test.exe', {
        type: 'application/x-msdownload',
      })

      await expect(storageService.uploadFile(file)).rejects.toThrow(
        'Invalid file type'
      )
    })

    it('should handle permission denied', async () => {
      mockStorage.getFile.mockRejectedValue(new Error('Permission denied'))

      await expect(storageService.getFile('file-123')).rejects.toThrow(
        'Permission denied'
      )
    })

    it('should handle network errors', async () => {
      mockStorage.createFile.mockRejectedValue(new Error('Network error'))
      const file = new File(['content'], 'test.xlsx')

      await expect(storageService.uploadFile(file)).rejects.toThrow('Network error')
    })
  })

  describe('special file names', () => {
    it('should handle file names with spaces', async () => {
      mockStorage.createFile.mockResolvedValue({
        ...mockFile,
        name: 'my file name.xlsx',
      })
      const file = new File(['content'], 'my file name.xlsx')

      const result = await storageService.uploadFile(file)

      expect(result.name).toBe('my file name.xlsx')
    })

    it('should handle file names with unicode', async () => {
      mockStorage.createFile.mockResolvedValue({
        ...mockFile,
        name: '文档报告.xlsx',
      })
      const file = new File(['content'], '文档报告.xlsx')

      const result = await storageService.uploadFile(file)

      expect(result.name).toBe('文档报告.xlsx')
    })

    it('should handle file names with special characters', async () => {
      mockStorage.createFile.mockResolvedValue({
        ...mockFile,
        name: 'file-name_v2 (copy).xlsx',
      })
      const file = new File(['content'], 'file-name_v2 (copy).xlsx')

      const result = await storageService.uploadFile(file)

      expect(result.name).toBe('file-name_v2 (copy).xlsx')
    })
  })

  describe('empty and edge values', () => {
    it('should handle empty file', async () => {
      mockStorage.createFile.mockResolvedValue({
        ...mockFile,
        sizeOriginal: 0,
      })
      const file = new File([], 'empty.xlsx')

      const result = await storageService.uploadFile(file)

      expect(result.sizeOriginal).toBe(0)
    })

    it('should handle zero-width and zero-height preview', () => {
      mockStorage.getFilePreview.mockReturnValue('https://example.com/preview')

      storageService.getFilePreview('file-123', { width: 0, height: 0 })

      expect(mockStorage.getFilePreview).toHaveBeenCalledWith(
        expect.any(String),
        'file-123',
        0,
        0,
        undefined,
        undefined
      )
    })

    it('should handle quality at boundaries', () => {
      mockStorage.getFilePreview.mockReturnValue('https://example.com/preview')

      storageService.getFilePreview('file-123', { quality: 0 })
      storageService.getFilePreview('file-123', { quality: 100 })

      expect(mockStorage.getFilePreview).toHaveBeenCalledTimes(2)
    })
  })
})
