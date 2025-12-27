import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { ReactNode } from 'react'

import JobsPage from '@/pages/Jobs'
import { jobService } from '@/lib/appwrite'
import type { ParsedJob } from '@/types/job'

// Mock the auth context
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { $id: 'user-123', email: 'test@example.com' },
    isLoading: false,
  }),
}))

// Mock translations
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'jobs.title': 'Background Jobs',
        'jobs.description': 'Monitor your import and export jobs',
        'jobs.loading': 'Loading jobs...',
        'jobs.noJobs': 'No jobs found',
        'jobs.import': 'Import',
        'jobs.export': 'Export',
        'jobs.reportExport': 'Report Export',
        'jobs.status.pending': 'Pending',
        'jobs.status.processing': 'Processing',
        'jobs.status.completed': 'Completed',
        'jobs.status.failed': 'Failed',
        'common.download': 'Download',
        'common.delete': 'Delete',
        'jobs.deleteConfirm': 'Delete this job?',
        'jobs.deleteConfirmDescription': 'This action cannot be undone.',
        'common.cancel': 'Cancel',
      }
      let result = translations[key] || key
      if (options) {
        Object.entries(options).forEach(([k, v]) => {
          result = result.replace(`{{${k}}}`, String(v))
        })
      }
      return result
    },
  }),
}))

// Mock date-fns
vi.mock('date-fns', () => ({
  formatDistanceToNow: () => '5 minutes',
  format: (date: Date) => date.toISOString(),
}))

// Mock job service
vi.mock('@/lib/appwrite', () => ({
  jobService: {
    listByUser: vi.fn(),
    getActiveJobs: vi.fn(),
    downloadExport: vi.fn(),
    deleteJob: vi.fn(),
  },
}))

const mockJobs: ParsedJob[] = [
  {
    $id: 'job-1',
    $collectionId: 'import_jobs',
    $databaseId: 'main',
    $createdAt: '2024-01-01T00:00:00.000Z',
    $updatedAt: '2024-01-01T00:00:00.000Z',
    $permissions: [],
    $sequence: 0,
    user_id: 'user-123',
    action: 'import-excel',
    status: 'completed',
    created_at: '2024-01-01T00:00:00.000Z',
    completed_at: '2024-01-01T00:01:00.000Z',
    stats: { imported: 10, updated: 5, skipped: 2, failed: 1 },
    error: null,
    file_id: 'file-123',
    result_file_id: null,
    filters: null,
  },
  {
    $id: 'job-2',
    $collectionId: 'import_jobs',
    $databaseId: 'main',
    $createdAt: '2024-01-01T00:00:00.000Z',
    $updatedAt: '2024-01-01T00:00:00.000Z',
    $permissions: [],
    $sequence: 0,
    user_id: 'user-123',
    action: 'export-excel',
    status: 'processing',
    created_at: '2024-01-01T00:00:00.000Z',
    completed_at: null,
    stats: null,
    error: null,
    file_id: null,
    result_file_id: null,
    filters: null,
  },
]

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
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    )
  }
}

describe('Jobs Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(jobService.listByUser as Mock).mockResolvedValue({
      documents: mockJobs,
      total: 2,
    })
    ;(jobService.getActiveJobs as Mock).mockResolvedValue([])
  })

  describe('page layout', () => {
    it('should render page title and description', async () => {
      render(<JobsPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Background Jobs')).toBeInTheDocument()
      })
      expect(screen.getByText('Monitor your import and export jobs')).toBeInTheDocument()
    })
  })

  describe('job list', () => {
    it('should display jobs from the server', async () => {
      render(<JobsPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Completed')).toBeInTheDocument()
      })
      expect(screen.getByText('Processing')).toBeInTheDocument()
    })

    it('should show no jobs message when empty', async () => {
      ;(jobService.listByUser as Mock).mockResolvedValue({
        documents: [],
        total: 0,
      })

      render(<JobsPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('No jobs found')).toBeInTheDocument()
      })
    })

    it('should show job actions', async () => {
      render(<JobsPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Import')).toBeInTheDocument()
      })
      expect(screen.getByText('Export')).toBeInTheDocument()
    })

    it('should show job stats for completed jobs', async () => {
      render(<JobsPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText(/10 imported/)).toBeInTheDocument()
      })
    })
  })

  describe('loading state', () => {
    it('should show loading indicator', async () => {
      ;(jobService.listByUser as Mock).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      )

      render(<JobsPage />, { wrapper: createWrapper() })

      expect(screen.getByText('Loading jobs...')).toBeInTheDocument()
    })
  })
})

describe('Jobs Page edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should handle failed jobs with error message', async () => {
    const failedJob: ParsedJob = {
      ...mockJobs[0],
      $id: 'job-failed',
      status: 'failed',
      error: 'File format not supported',
    }

    ;(jobService.listByUser as Mock).mockResolvedValue({
      documents: [failedJob],
      total: 1,
    })

    render(<JobsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument()
    })
    expect(screen.getByText('File format not supported')).toBeInTheDocument()
  })

  it('should handle report export jobs', async () => {
    const reportJob: ParsedJob = {
      ...mockJobs[0],
      $id: 'job-report',
      action: 'export-reporting-excel',
    }

    ;(jobService.listByUser as Mock).mockResolvedValue({
      documents: [reportJob],
      total: 1,
    })

    render(<JobsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Report Export')).toBeInTheDocument()
    })
  })

  it('should handle many jobs', async () => {
    const manyJobs = Array.from({ length: 20 }, (_, i) => ({
      ...mockJobs[0],
      $id: `job-${i}`,
      action: i % 2 === 0 ? 'import-excel' : 'export-excel',
      status: ['pending', 'processing', 'completed', 'failed'][i % 4],
    })) as ParsedJob[]

    ;(jobService.listByUser as Mock).mockResolvedValue({
      documents: manyJobs,
      total: 20,
    })

    render(<JobsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getAllByText('Import').length).toBeGreaterThan(0)
    })
  })

  it('should handle network error', async () => {
    ;(jobService.listByUser as Mock).mockRejectedValue(new Error('Network error'))

    render(<JobsPage />, { wrapper: createWrapper() })

    // Should handle error gracefully
    await waitFor(() => {
      expect(jobService.listByUser).toHaveBeenCalled()
    })
  })
})
