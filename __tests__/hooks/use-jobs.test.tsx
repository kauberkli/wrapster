import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { ReactNode } from 'react'

import {
  useJobs,
  useActiveJobs,
  useRecentCompletedExports,
  useCompletedReportExports,
  useJob,
  useQueueImport,
  useQueueExport,
  useQueueReportExport,
  useQueueSendReportEmail,
  useDownloadExport,
  useDeleteJob,
  getJobStatusColor,
  formatJobStats,
} from '@/hooks/use-jobs'
import { jobService } from '@/lib/appwrite'
import type { ParsedJob } from '@/types/job'

// Mock the job service
vi.mock('@/lib/appwrite', () => ({
  jobService: {
    listByUser: vi.fn(),
    getActiveJobs: vi.fn(),
    getRecentCompletedExports: vi.fn(),
    getCompletedReportExports: vi.fn(),
    getById: vi.fn(),
    queueImport: vi.fn(),
    queueExport: vi.fn(),
    queueReportExport: vi.fn(),
    queueSendReportEmail: vi.fn(),
    downloadExport: vi.fn(),
    deleteJob: vi.fn(),
  },
}))

const mockJob: ParsedJob = {
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

const mockCompletedJob: ParsedJob = {
  ...mockJob,
  $id: 'job-2',
  status: 'completed',
  completed_at: '2024-01-01T00:01:00.000Z',
  stats: { imported: 10, updated: 5, skipped: 2, failed: 1 },
}

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
}

describe('useJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch jobs for a user', async () => {
    (jobService.listByUser as Mock).mockResolvedValue({
      documents: [mockJob],
      total: 1,
    })

    const { result } = renderHook(
      () => useJobs({ userId: 'user-123' }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data?.documents).toHaveLength(1)
    expect(jobService.listByUser).toHaveBeenCalledWith('user-123', {
      action: undefined,
      status: undefined,
      limit: 20,
    })
  })

  it('should filter by action', async () => {
    (jobService.listByUser as Mock).mockResolvedValue({
      documents: [mockJob],
      total: 1,
    })

    const { result } = renderHook(
      () => useJobs({ userId: 'user-123', action: 'import-excel' }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(jobService.listByUser).toHaveBeenCalledWith('user-123', {
      action: 'import-excel',
      status: undefined,
      limit: 20,
    })
  })

  it('should filter by status', async () => {
    (jobService.listByUser as Mock).mockResolvedValue({
      documents: [mockCompletedJob],
      total: 1,
    })

    const { result } = renderHook(
      () => useJobs({ userId: 'user-123', status: 'completed' }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(jobService.listByUser).toHaveBeenCalledWith('user-123', {
      action: undefined,
      status: 'completed',
      limit: 20,
    })
  })

  it('should respect custom limit', async () => {
    (jobService.listByUser as Mock).mockResolvedValue({
      documents: [],
      total: 0,
    })

    renderHook(
      () => useJobs({ userId: 'user-123', limit: 50 }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(jobService.listByUser).toHaveBeenCalledWith('user-123', {
        action: undefined,
        status: undefined,
        limit: 50,
      })
    })
  })

  it('should not fetch when disabled', async () => {
    renderHook(
      () => useJobs({ userId: 'user-123', enabled: false }),
      { wrapper: createWrapper() }
    )

    // Wait a bit to ensure no fetch happens
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(jobService.listByUser).not.toHaveBeenCalled()
  })

  it('should not fetch when userId is empty', async () => {
    renderHook(
      () => useJobs({ userId: '' }),
      { wrapper: createWrapper() }
    )

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(jobService.listByUser).not.toHaveBeenCalled()
  })
})

describe('useActiveJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch active jobs', async () => {
    (jobService.getActiveJobs as Mock).mockResolvedValue([mockJob])

    const { result } = renderHook(
      () => useActiveJobs('user-123'),
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toHaveLength(1)
    expect(jobService.getActiveJobs).toHaveBeenCalledWith('user-123')
  })

  it('should not fetch when disabled', async () => {
    renderHook(
      () => useActiveJobs('user-123', false),
      { wrapper: createWrapper() }
    )

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(jobService.getActiveJobs).not.toHaveBeenCalled()
  })
})

describe('useRecentCompletedExports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch recent completed exports', async () => {
    (jobService.getRecentCompletedExports as Mock).mockResolvedValue([mockCompletedJob])

    const { result } = renderHook(
      () => useRecentCompletedExports('user-123'),
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toHaveLength(1)
    expect(jobService.getRecentCompletedExports).toHaveBeenCalledWith('user-123')
  })
})

describe('useCompletedReportExports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch completed report exports', async () => {
    const reportJob = { ...mockCompletedJob, action: 'export-reporting-excel' }
    ;(jobService.getCompletedReportExports as Mock).mockResolvedValue([reportJob])

    const { result } = renderHook(
      () => useCompletedReportExports('user-123'),
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toHaveLength(1)
  })
})

describe('useJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch a single job', async () => {
    (jobService.getById as Mock).mockResolvedValue(mockJob)

    const { result } = renderHook(
      () => useJob('job-1'),
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual(mockJob)
    expect(jobService.getById).toHaveBeenCalledWith('job-1')
  })

  it('should not fetch when disabled', async () => {
    renderHook(
      () => useJob('job-1', false),
      { wrapper: createWrapper() }
    )

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(jobService.getById).not.toHaveBeenCalled()
  })
})

describe('useQueueImport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should queue an import job', async () => {
    (jobService.queueImport as Mock).mockResolvedValue({ success: true, jobId: 'new-job' })

    const { result } = renderHook(
      () => useQueueImport(),
      { wrapper: createWrapper() }
    )

    const file = new File(['content'], 'test.xlsx')

    await act(async () => {
      await result.current.mutateAsync({ file, userId: 'user-123' })
    })

    expect(jobService.queueImport).toHaveBeenCalledWith(file, 'user-123')
  })
})

describe('useQueueExport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should queue an export job without filters', async () => {
    (jobService.queueExport as Mock).mockResolvedValue({ success: true, jobId: 'new-job' })

    const { result } = renderHook(
      () => useQueueExport(),
      { wrapper: createWrapper() }
    )

    await act(async () => {
      await result.current.mutateAsync({ userId: 'user-123' })
    })

    expect(jobService.queueExport).toHaveBeenCalledWith('user-123', undefined)
  })

  it('should queue an export job with filters', async () => {
    (jobService.queueExport as Mock).mockResolvedValue({ success: true, jobId: 'new-job' })

    const { result } = renderHook(
      () => useQueueExport(),
      { wrapper: createWrapper() }
    )

    await act(async () => {
      await result.current.mutateAsync({ userId: 'user-123', filters: { type: 'bundle' } })
    })

    expect(jobService.queueExport).toHaveBeenCalledWith('user-123', { type: 'bundle' })
  })
})

describe('useQueueReportExport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should queue a report export job', async () => {
    (jobService.queueReportExport as Mock).mockResolvedValue({ success: true, jobId: 'new-job' })

    const { result } = renderHook(
      () => useQueueReportExport(),
      { wrapper: createWrapper() }
    )

    await act(async () => {
      await result.current.mutateAsync({
        userId: 'user-123',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        format: 'pdf',
      })
    })

    expect(jobService.queueReportExport).toHaveBeenCalledWith(
      'user-123',
      '2024-01-01',
      '2024-01-31',
      'pdf'
    )
  })
})

describe('useQueueSendReportEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should queue a send email job', async () => {
    (jobService.queueSendReportEmail as Mock).mockResolvedValue({ success: true, jobId: 'new-job' })

    const { result } = renderHook(
      () => useQueueSendReportEmail(),
      { wrapper: createWrapper() }
    )

    await act(async () => {
      await result.current.mutateAsync({
        userId: 'user-123',
        fileId: 'file-123',
        recipients: ['test@example.com'],
        dateRange: '2024-01-01 to 2024-01-31',
      })
    })

    expect(jobService.queueSendReportEmail).toHaveBeenCalledWith(
      'user-123',
      'file-123',
      ['test@example.com'],
      '2024-01-01 to 2024-01-31'
    )
  })
})

describe('useDownloadExport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock URL methods
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:test-url')
    global.URL.revokeObjectURL = vi.fn()
    // Mock document methods
    const mockLink = {
      href: '',
      download: '',
      click: vi.fn(),
    }
    vi.spyOn(document, 'createElement').mockReturnValue(mockLink as unknown as HTMLElement)
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as unknown as HTMLAnchorElement)
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink as unknown as HTMLAnchorElement)
  })

  it('should download an export file', async () => {
    const mockBlob = new Blob(['file content'])
    ;(jobService.downloadExport as Mock).mockResolvedValue(mockBlob)

    const { result } = renderHook(
      () => useDownloadExport(),
      { wrapper: createWrapper() }
    )

    await act(async () => {
      await result.current.mutateAsync({ fileId: 'file-123', fileName: 'test.xlsx' })
    })

    expect(jobService.downloadExport).toHaveBeenCalledWith('file-123')
    expect(global.URL.createObjectURL).toHaveBeenCalledWith(mockBlob)
  })

  it('should use default filename if not provided', async () => {
    const mockBlob = new Blob(['file content'])
    ;(jobService.downloadExport as Mock).mockResolvedValue(mockBlob)

    const { result } = renderHook(
      () => useDownloadExport(),
      { wrapper: createWrapper() }
    )

    await act(async () => {
      await result.current.mutateAsync({ fileId: 'file-123' })
    })

    expect(jobService.downloadExport).toHaveBeenCalledWith('file-123')
  })
})

describe('useDeleteJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should delete a job', async () => {
    (jobService.deleteJob as Mock).mockResolvedValue(undefined)

    const { result } = renderHook(
      () => useDeleteJob(),
      { wrapper: createWrapper() }
    )

    await act(async () => {
      await result.current.mutateAsync({ jobId: 'job-123', fileId: 'file-123' })
    })

    expect(jobService.deleteJob).toHaveBeenCalledWith('job-123', 'file-123')
  })

  it('should delete a job without file', async () => {
    (jobService.deleteJob as Mock).mockResolvedValue(undefined)

    const { result } = renderHook(
      () => useDeleteJob(),
      { wrapper: createWrapper() }
    )

    await act(async () => {
      await result.current.mutateAsync({ jobId: 'job-123' })
    })

    expect(jobService.deleteJob).toHaveBeenCalledWith('job-123', undefined)
  })
})

describe('getJobStatusColor', () => {
  it('should return correct color for pending status', () => {
    expect(getJobStatusColor('pending')).toBe('bg-yellow-100 text-yellow-700')
  })

  it('should return correct color for processing status', () => {
    expect(getJobStatusColor('processing')).toBe('bg-blue-100 text-blue-700')
  })

  it('should return correct color for completed status', () => {
    expect(getJobStatusColor('completed')).toBe('bg-green-100 text-green-700')
  })

  it('should return correct color for failed status', () => {
    expect(getJobStatusColor('failed')).toBe('bg-red-100 text-red-700')
  })

  it('should return default color for unknown status', () => {
    expect(getJobStatusColor('unknown' as any)).toBe('bg-gray-100 text-gray-700')
  })
})

describe('formatJobStats', () => {
  it('should format stats with all values', () => {
    const job: ParsedJob = {
      ...mockJob,
      stats: { imported: 10, updated: 5, skipped: 2, failed: 1 },
    }

    const result = formatJobStats(job)

    expect(result).toContain('10 imported')
    expect(result).toContain('5 updated')
    expect(result).toContain('2 skipped')
    expect(result).toContain('1 failed')
  })

  it('should only include non-zero values', () => {
    const job: ParsedJob = {
      ...mockJob,
      stats: { imported: 10, updated: 0, skipped: 0, failed: 0 },
    }

    const result = formatJobStats(job)

    expect(result).toBe('10 imported')
    expect(result).not.toContain('updated')
    expect(result).not.toContain('skipped')
    expect(result).not.toContain('failed')
  })

  it('should return empty string for null stats', () => {
    const job: ParsedJob = {
      ...mockJob,
      stats: null,
    }

    const result = formatJobStats(job)

    expect(result).toBe('')
  })

  it('should handle all zero values', () => {
    const job: ParsedJob = {
      ...mockJob,
      stats: { imported: 0, updated: 0, skipped: 0, failed: 0 },
    }

    const result = formatJobStats(job)

    expect(result).toBe('')
  })

  it('should format multiple values with commas', () => {
    const job: ParsedJob = {
      ...mockJob,
      stats: { imported: 5, updated: 3, skipped: 0, failed: 0 },
    }

    const result = formatJobStats(job)

    expect(result).toBe('5 imported, 3 updated')
  })
})
