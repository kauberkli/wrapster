import { beforeEach, describe, expect, it, vi } from 'vitest'

import { jobService } from '@/lib/appwrite/jobs'
import { COLLECTIONS } from '@/types/job'
import type { ImportJob } from '@/types/job'

const mockDatabaseService = {
  createDocument: vi.fn(),
  getDocument: vi.fn(),
  listDocuments: vi.fn(),
  updateDocument: vi.fn(),
  deleteDocument: vi.fn(),
}

const mockStorage = {
  createFile: vi.fn(),
  deleteFile: vi.fn(),
  getFileDownload: vi.fn(),
}

const mockFunctions = {
  createExecution: vi.fn(),
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
    equal: (field: string, value: string | string[]) => `equal("${field}", ${JSON.stringify(value)})`,
    contains: (field: string, value: string) => `contains("${field}", "${value}")`,
    isNotNull: (field: string) => `isNotNull("${field}")`,
    greaterThan: (field: string, value: string) => `greaterThan("${field}", "${value}")`,
    orderDesc: (field: string) => `orderDesc("${field}")`,
    limit: (value: number) => `limit(${value})`,
    offset: (value: number) => `offset(${value})`,
  },
}))

vi.mock('@/lib/appwrite/config', () => ({
  default: {},
  storage: {
    createFile: (...args: unknown[]) => mockStorage.createFile(...args),
    deleteFile: (...args: unknown[]) => mockStorage.deleteFile(...args),
    getFileDownload: (...args: unknown[]) => mockStorage.getFileDownload(...args),
  },
}))

vi.mock('appwrite', () => ({
  Functions: vi.fn().mockImplementation(() => ({
    createExecution: (...args: unknown[]) => mockFunctions.createExecution(...args),
  })),
  ExecutionMethod: {
    POST: 'POST',
  },
}))

const mockJob: ImportJob = {
  $id: 'job-1',
  $collectionId: 'import_jobs',
  $databaseId: 'main',
  $createdAt: '2024-01-01T00:00:00.000Z',
  $updatedAt: '2024-01-01T00:00:00.000Z',
  $permissions: [],
  $sequence: 0,
  user_id: 'user-123',
  action: 'import-excel',
  status: 'pending',
  created_at: '2024-01-01T00:00:00.000Z',
  completed_at: null,
  stats: null,
  error: null,
  file_id: 'file-123',
  result_file_id: null,
  filters: null,
}

const mockCompletedJob: ImportJob = {
  ...mockJob,
  $id: 'job-2',
  status: 'completed',
  completed_at: '2024-01-01T00:01:00.000Z',
  stats: JSON.stringify({ imported: 10, updated: 5, skipped: 2, failed: 1 }),
  result_file_id: 'result-file-123',
}

const mockExportJob: ImportJob = {
  ...mockJob,
  $id: 'job-3',
  action: 'export-excel',
  status: 'completed',
  completed_at: '2024-01-01T00:01:00.000Z',
  result_file_id: 'export-file-123',
}

describe('jobService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset Date.now mock
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2024-01-01T00:05:00.000Z').getTime())
  })

  describe('queueImport', () => {
    it('should upload file and queue import job', async () => {
      const file = new File(['test content'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      mockStorage.createFile.mockResolvedValue({ $id: 'uploaded-file-123' })
      mockFunctions.createExecution.mockResolvedValue({
        responseBody: JSON.stringify({ success: true, jobId: 'job-123' }),
      })

      const result = await jobService.queueImport(file, 'user-123')

      expect(mockStorage.createFile).toHaveBeenCalled()
      expect(result.success).toBe(true)
      expect(result.jobId).toBe('job-123')
    })

    it('should clean up file on queue failure', async () => {
      const file = new File(['test content'], 'test.xlsx')
      mockStorage.createFile.mockResolvedValue({ $id: 'uploaded-file-123' })
      mockFunctions.createExecution.mockResolvedValue({
        responseBody: JSON.stringify({ success: false, error: 'Queue failed' }),
      })

      await expect(jobService.queueImport(file, 'user-123')).rejects.toThrow(
        'Queue failed'
      )
      expect(mockStorage.deleteFile).toHaveBeenCalled()
    })

    it('should ignore cleanup errors', async () => {
      const file = new File(['test content'], 'test.xlsx')
      mockStorage.createFile.mockResolvedValue({ $id: 'uploaded-file-123' })
      mockFunctions.createExecution.mockResolvedValue({
        responseBody: JSON.stringify({ success: false, error: 'Queue failed' }),
      })
      mockStorage.deleteFile.mockRejectedValue(new Error('Cleanup failed'))

      await expect(jobService.queueImport(file, 'user-123')).rejects.toThrow(
        'Queue failed'
      )
    })
  })

  describe('queueExport', () => {
    it('should queue export job without filters', async () => {
      mockFunctions.createExecution.mockResolvedValue({
        status: 'completed',
        responseBody: JSON.stringify({ success: true, jobId: 'export-job-123' }),
      })

      const result = await jobService.queueExport('user-123')

      expect(result.success).toBe(true)
      expect(result.jobId).toBe('export-job-123')
    })

    it('should queue export job with type filter', async () => {
      mockFunctions.createExecution.mockResolvedValue({
        status: 'completed',
        responseBody: JSON.stringify({ success: true, jobId: 'export-job-123' }),
      })

      const result = await jobService.queueExport('user-123', { type: 'bundle' })

      expect(result.success).toBe(true)
    })

    it('should throw error on function failure', async () => {
      mockFunctions.createExecution.mockResolvedValue({
        status: 'failed',
        errors: 'Function execution failed',
        responseBody: '',
      })

      await expect(jobService.queueExport('user-123')).rejects.toThrow(
        'Function failed'
      )
    })

    it('should throw error on empty response', async () => {
      mockFunctions.createExecution.mockResolvedValue({
        status: 'completed',
        responseBody: '',
      })

      await expect(jobService.queueExport('user-123')).rejects.toThrow(
        'Function returned empty response'
      )
    })
  })

  describe('queueReportExport', () => {
    it('should queue excel report export', async () => {
      mockFunctions.createExecution.mockResolvedValue({
        status: 'completed',
        responseBody: JSON.stringify({ success: true, jobId: 'report-job-123' }),
      })

      const result = await jobService.queueReportExport(
        'user-123',
        '2024-01-01',
        '2024-01-31',
        'excel'
      )

      expect(result.success).toBe(true)
    })

    it('should queue pdf report export', async () => {
      mockFunctions.createExecution.mockResolvedValue({
        status: 'completed',
        responseBody: JSON.stringify({ success: true, jobId: 'report-job-123' }),
      })

      const result = await jobService.queueReportExport(
        'user-123',
        '2024-01-01',
        '2024-01-31',
        'pdf'
      )

      expect(result.success).toBe(true)
    })

    it('should default to excel format', async () => {
      mockFunctions.createExecution.mockResolvedValue({
        status: 'completed',
        responseBody: JSON.stringify({ success: true, jobId: 'report-job-123' }),
      })

      await jobService.queueReportExport('user-123', '2024-01-01', '2024-01-31')

      // Should work with default excel format
      expect(mockFunctions.createExecution).toHaveBeenCalled()
    })

    it('should throw error on failure', async () => {
      mockFunctions.createExecution.mockResolvedValue({
        status: 'completed',
        responseBody: JSON.stringify({ success: false, error: 'Report generation failed' }),
      })

      await expect(
        jobService.queueReportExport('user-123', '2024-01-01', '2024-01-31')
      ).rejects.toThrow('Report generation failed')
    })
  })

  describe('queueSendReportEmail', () => {
    it('should queue send email job', async () => {
      mockFunctions.createExecution.mockResolvedValue({
        status: 'completed',
        responseBody: JSON.stringify({ success: true, jobId: 'email-job-123' }),
      })

      const result = await jobService.queueSendReportEmail(
        'user-123',
        'file-123',
        ['recipient@example.com'],
        '2024-01-01 to 2024-01-31'
      )

      expect(result.success).toBe(true)
    })

    it('should handle multiple recipients', async () => {
      mockFunctions.createExecution.mockResolvedValue({
        status: 'completed',
        responseBody: JSON.stringify({ success: true, jobId: 'email-job-123' }),
      })

      await jobService.queueSendReportEmail(
        'user-123',
        'file-123',
        ['user1@example.com', 'user2@example.com', 'user3@example.com'],
        '2024-01-01 to 2024-01-31'
      )

      expect(mockFunctions.createExecution).toHaveBeenCalled()
    })

    it('should throw error on failure', async () => {
      mockFunctions.createExecution.mockResolvedValue({
        status: 'failed',
        errors: 'Email sending failed',
        responseBody: '',
      })

      await expect(
        jobService.queueSendReportEmail(
          'user-123',
          'file-123',
          ['recipient@example.com'],
          '2024-01-01 to 2024-01-31'
        )
      ).rejects.toThrow('Function failed')
    })
  })

  describe('getById', () => {
    it('should get job by ID and parse it', async () => {
      mockDatabaseService.getDocument.mockResolvedValue(mockCompletedJob)

      const result = await jobService.getById('job-2')

      expect(mockDatabaseService.getDocument).toHaveBeenCalledWith(
        COLLECTIONS.IMPORT_JOBS,
        'job-2'
      )
      expect(result.stats).toEqual({ imported: 10, updated: 5, skipped: 2, failed: 1 })
    })

    it('should handle job without stats', async () => {
      mockDatabaseService.getDocument.mockResolvedValue(mockJob)

      const result = await jobService.getById('job-1')

      expect(result.stats).toBeNull()
    })

    it('should parse filters if present', async () => {
      const jobWithFilters = {
        ...mockJob,
        filters: JSON.stringify({ type: 'bundle' }),
      }
      mockDatabaseService.getDocument.mockResolvedValue(jobWithFilters)

      const result = await jobService.getById('job-1')

      expect(result.filters).toEqual({ type: 'bundle' })
    })
  })

  describe('listByUser', () => {
    it('should list jobs for user', async () => {
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [mockJob, mockCompletedJob],
        total: 2,
      })

      const result = await jobService.listByUser('user-123')

      expect(result.documents).toHaveLength(2)
      expect(result.total).toBe(2)
    })

    it('should filter by action', async () => {
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [mockExportJob],
        total: 1,
      })

      await jobService.listByUser('user-123', { action: 'export-excel' })

      expect(mockDatabaseService.listDocuments).toHaveBeenCalledWith(
        COLLECTIONS.IMPORT_JOBS,
        expect.arrayContaining([
          expect.stringContaining('equal("action"'),
        ])
      )
    })

    it('should filter by status', async () => {
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [mockCompletedJob],
        total: 1,
      })

      await jobService.listByUser('user-123', { status: 'completed' })

      expect(mockDatabaseService.listDocuments).toHaveBeenCalledWith(
        COLLECTIONS.IMPORT_JOBS,
        expect.arrayContaining([
          expect.stringContaining('equal("status"'),
        ])
      )
    })

    it('should apply limit and offset', async () => {
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [mockJob],
        total: 100,
      })

      await jobService.listByUser('user-123', { limit: 10, offset: 20 })

      expect(mockDatabaseService.listDocuments).toHaveBeenCalledWith(
        COLLECTIONS.IMPORT_JOBS,
        expect.arrayContaining([
          expect.stringContaining('limit(10)'),
          expect.stringContaining('offset(20)'),
        ])
      )
    })

    it('should parse all returned jobs', async () => {
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [mockCompletedJob],
        total: 1,
      })

      const result = await jobService.listByUser('user-123')

      expect(result.documents[0].stats).toEqual({
        imported: 10,
        updated: 5,
        skipped: 2,
        failed: 1,
      })
    })
  })

  describe('getActiveJobs', () => {
    it('should get active and recent jobs', async () => {
      mockDatabaseService.listDocuments
        .mockResolvedValueOnce({ documents: [mockJob], total: 1 })
        .mockResolvedValueOnce({ documents: [mockCompletedJob], total: 1 })

      const result = await jobService.getActiveJobs('user-123')

      expect(result).toHaveLength(2)
    })

    it('should mark stale pending jobs as failed', async () => {
      // Mock Date.now to return a fixed value
      const now = Date.now()
      const originalDateNow = Date.now
      Date.now = vi.fn(() => now)

      const staleJob = {
        ...mockJob,
        status: 'pending' as const,
        created_at: new Date(now - 3 * 60 * 1000).toISOString(), // 3 minutes ago
      }
      mockDatabaseService.listDocuments
        .mockResolvedValueOnce({ documents: [staleJob], total: 1 })
        .mockResolvedValueOnce({ documents: [], total: 0 })
      mockDatabaseService.updateDocument.mockResolvedValue({})

      await jobService.getActiveJobs('user-123')

      expect(mockDatabaseService.updateDocument).toHaveBeenCalledWith(
        COLLECTIONS.IMPORT_JOBS,
        'job-1',
        expect.objectContaining({
          status: 'failed',
          error: expect.stringContaining('expired'),
        })
      )

      // Restore original Date.now
      Date.now = originalDateNow
    })

    it('should deduplicate jobs', async () => {
      mockDatabaseService.listDocuments
        .mockResolvedValueOnce({ documents: [mockJob], total: 1 })
        .mockResolvedValueOnce({ documents: [mockJob], total: 1 }) // Same job

      const result = await jobService.getActiveJobs('user-123')

      expect(result).toHaveLength(1)
    })

    it('should sort by created_at descending', async () => {
      const olderJob = { ...mockJob, $id: 'job-old', created_at: '2024-01-01T00:00:00.000Z' }
      const newerJob = { ...mockJob, $id: 'job-new', created_at: '2024-01-01T00:02:00.000Z' }

      mockDatabaseService.listDocuments
        .mockResolvedValueOnce({ documents: [olderJob, newerJob], total: 2 })
        .mockResolvedValueOnce({ documents: [], total: 0 })

      const result = await jobService.getActiveJobs('user-123')

      expect(result[0].$id).toBe('job-new')
      expect(result[1].$id).toBe('job-old')
    })

    it('should limit to 10 jobs', async () => {
      const manyJobs = Array.from({ length: 15 }, (_, i) => ({
        ...mockJob,
        $id: `job-${i}`,
        created_at: new Date(Date.now() - i * 1000).toISOString(),
      }))

      mockDatabaseService.listDocuments
        .mockResolvedValueOnce({ documents: manyJobs, total: 15 })
        .mockResolvedValueOnce({ documents: [], total: 0 })

      const result = await jobService.getActiveJobs('user-123')

      expect(result).toHaveLength(10)
    })
  })

  describe('getRecentCompletedExports', () => {
    it('should get recently completed export jobs', async () => {
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [mockExportJob],
        total: 1,
      })

      const result = await jobService.getRecentCompletedExports('user-123')

      expect(result).toHaveLength(1)
      expect(result[0].action).toBe('export-excel')
    })

    it('should filter exports from last 5 minutes', async () => {
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [],
        total: 0,
      })

      await jobService.getRecentCompletedExports('user-123')

      expect(mockDatabaseService.listDocuments).toHaveBeenCalledWith(
        COLLECTIONS.IMPORT_JOBS,
        expect.arrayContaining([
          expect.stringContaining('contains("action", "export")'),
          expect.stringContaining('greaterThan("completed_at"'),
        ])
      )
    })
  })

  describe('getCompletedReportExports', () => {
    it('should get completed report exports', async () => {
      const reportJob = { ...mockExportJob, action: 'export-reporting-excel' }
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [reportJob],
        total: 1,
      })

      const result = await jobService.getCompletedReportExports('user-123')

      expect(result).toHaveLength(1)
    })

    it('should use custom limit', async () => {
      mockDatabaseService.listDocuments.mockResolvedValue({
        documents: [],
        total: 0,
      })

      await jobService.getCompletedReportExports('user-123', 50)

      expect(mockDatabaseService.listDocuments).toHaveBeenCalledWith(
        COLLECTIONS.IMPORT_JOBS,
        expect.arrayContaining([
          expect.stringContaining('limit(50)'),
        ])
      )
    })
  })

  describe('getDownloadUrl', () => {
    it('should construct download URL correctly', () => {
      const url = jobService.getDownloadUrl('file-123')

      expect(url).toContain('file-123')
      expect(url).toContain('/download')
    })
  })

  describe('downloadExport', () => {
    it('should download export file', async () => {
      const mockBlob = new Blob(['file content'])
      mockStorage.getFileDownload.mockReturnValue('https://example.com/download')
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      })

      const result = await jobService.downloadExport('file-123')

      expect(result).toEqual(mockBlob)
    })

    it('should throw error on download failure', async () => {
      mockStorage.getFileDownload.mockReturnValue('https://example.com/download')
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Not Found',
      })

      await expect(jobService.downloadExport('file-123')).rejects.toThrow(
        'Failed to download file'
      )
    })
  })

  describe('deleteJob', () => {
    it('should delete job and associated file', async () => {
      mockStorage.deleteFile.mockResolvedValue({})
      mockDatabaseService.deleteDocument.mockResolvedValue({})

      await jobService.deleteJob('job-123', 'file-123')

      expect(mockStorage.deleteFile).toHaveBeenCalled()
      expect(mockDatabaseService.deleteDocument).toHaveBeenCalledWith(
        COLLECTIONS.IMPORT_JOBS,
        'job-123'
      )
    })

    it('should delete job without file', async () => {
      mockDatabaseService.deleteDocument.mockResolvedValue({})

      await jobService.deleteJob('job-123')

      expect(mockStorage.deleteFile).not.toHaveBeenCalled()
      expect(mockDatabaseService.deleteDocument).toHaveBeenCalled()
    })

    it('should delete job when file is null', async () => {
      mockDatabaseService.deleteDocument.mockResolvedValue({})

      await jobService.deleteJob('job-123', null)

      expect(mockStorage.deleteFile).not.toHaveBeenCalled()
      expect(mockDatabaseService.deleteDocument).toHaveBeenCalled()
    })

    it('should ignore file deletion errors', async () => {
      mockStorage.deleteFile.mockRejectedValue(new Error('File not found'))
      mockDatabaseService.deleteDocument.mockResolvedValue({})

      await jobService.deleteJob('job-123', 'file-123')

      expect(mockDatabaseService.deleteDocument).toHaveBeenCalled()
    })
  })
})

describe('jobService edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('parsing edge cases', () => {
    it('should handle null stats', async () => {
      const jobWithNullStats = { ...mockJob, stats: null }
      mockDatabaseService.getDocument.mockResolvedValue(jobWithNullStats)

      const result = await jobService.getById('job-1')

      expect(result.stats).toBeNull()
    })

    it('should handle null filters', async () => {
      const jobWithNullFilters = { ...mockJob, filters: null }
      mockDatabaseService.getDocument.mockResolvedValue(jobWithNullFilters)

      const result = await jobService.getById('job-1')

      expect(result.filters).toBeNull()
    })

    it('should handle empty stats object', async () => {
      const jobWithEmptyStats = { ...mockJob, stats: JSON.stringify({}) }
      mockDatabaseService.getDocument.mockResolvedValue(jobWithEmptyStats)

      const result = await jobService.getById('job-1')

      expect(result.stats).toEqual({})
    })
  })

  describe('error handling', () => {
    it('should propagate database errors on getById', async () => {
      mockDatabaseService.getDocument.mockRejectedValue(new Error('Database error'))

      await expect(jobService.getById('job-1')).rejects.toThrow('Database error')
    })

    it('should propagate database errors on listByUser', async () => {
      mockDatabaseService.listDocuments.mockRejectedValue(new Error('Query failed'))

      await expect(jobService.listByUser('user-123')).rejects.toThrow('Query failed')
    })
  })

  describe('large data handling', () => {
    it('should handle job with large stats', async () => {
      const largeStats = {
        imported: 10000,
        updated: 5000,
        skipped: 2000,
        failed: 500,
        details: Array(100).fill({ row: 1, error: 'test' }),
      }
      const jobWithLargeStats = { ...mockJob, stats: JSON.stringify(largeStats) }
      mockDatabaseService.getDocument.mockResolvedValue(jobWithLargeStats)

      const result = await jobService.getById('job-1')

      expect(result.stats?.imported).toBe(10000)
    })
  })
})
