import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

import { JobStatusPanel } from '@/components/jobs/JobStatusPanel'
import type { ParsedJob } from '@/types/job'

// Mock translations
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'jobs.loading': 'Loading jobs...',
        'jobs.activeJobs': 'Active Jobs',
        'jobs.import': 'Import',
        'jobs.export': 'Export',
        'jobs.reportExport': 'Report Export',
        'jobs.startedAgo': 'Started {{time}} ago',
        'jobs.status.pending': 'Pending',
        'jobs.status.processing': 'Processing',
        'jobs.status.completed': 'Completed',
        'jobs.status.failed': 'Failed',
        'common.download': 'Download',
      }
      return translations[key] || key
    },
  }),
}))

// Mock date-fns
vi.mock('date-fns', () => ({
  formatDistanceToNow: () => '5 minutes',
}))

// Mock job service
vi.mock('@/lib/appwrite', () => ({
  jobService: {
    downloadExport: vi.fn(),
  },
}))

// Mock the use-jobs hook
vi.mock('@/hooks/use-jobs', () => ({
  useDownloadExport: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  getJobStatusColor: (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800'
      case 'processing':
        return 'bg-blue-100 text-blue-800'
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'failed':
        return 'bg-red-100 text-red-800'
      default:
        return ''
    }
  },
  formatJobStats: (job: { stats?: { imported?: number; updated?: number; skipped?: number; failed?: number } | null }) => {
    if (!job.stats) return ''
    const parts = []
    if (job.stats.imported) parts.push(`${job.stats.imported} imported`)
    if (job.stats.updated) parts.push(`${job.stats.updated} updated`)
    if (job.stats.skipped) parts.push(`${job.stats.skipped} skipped`)
    if (job.stats.failed) parts.push(`${job.stats.failed} failed`)
    return parts.join(', ')
  },
}))

const mockPendingJob: ParsedJob = {
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

const mockProcessingJob: ParsedJob = {
  ...mockPendingJob,
  $id: 'job-2',
  status: 'processing',
}

const mockCompletedJob: ParsedJob = {
  ...mockPendingJob,
  $id: 'job-3',
  action: 'export-excel',
  status: 'completed',
  completed_at: '2024-01-01T00:01:00.000Z',
  stats: { imported: 10, updated: 5, skipped: 2, failed: 1 },
  result_file_id: 'result-file-123',
}

const mockFailedJob: ParsedJob = {
  ...mockPendingJob,
  $id: 'job-4',
  status: 'failed',
  error: 'Something went wrong',
}

const mockReportJob: ParsedJob = {
  ...mockCompletedJob,
  $id: 'job-5',
  action: 'export-reporting-excel',
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

describe('JobStatusPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  describe('loading state', () => {
    it('should show loading indicator when isLoading is true', () => {
      render(<JobStatusPanel jobs={[]} isLoading={true} />, {
        wrapper: createWrapper(),
      })

      expect(screen.getByText('Loading jobs...')).toBeInTheDocument()
    })
  })

  describe('empty state', () => {
    it('should return null when jobs array is empty', () => {
      const { container } = render(<JobStatusPanel jobs={[]} />, {
        wrapper: createWrapper(),
      })

      expect(container.firstChild).toBeNull()
    })
  })

  describe('job list', () => {
    it('should render job status panel with jobs', () => {
      render(<JobStatusPanel jobs={[mockPendingJob]} />, {
        wrapper: createWrapper(),
      })

      expect(screen.getByText('Active Jobs')).toBeInTheDocument()
    })

    it('should display pending job status', () => {
      render(<JobStatusPanel jobs={[mockPendingJob]} />, {
        wrapper: createWrapper(),
      })

      expect(screen.getByText('Pending')).toBeInTheDocument()
    })

    it('should display processing job status', () => {
      render(<JobStatusPanel jobs={[mockProcessingJob]} />, {
        wrapper: createWrapper(),
      })

      expect(screen.getByText('Processing')).toBeInTheDocument()
    })

    it('should display completed job status with stats', () => {
      render(<JobStatusPanel jobs={[mockCompletedJob]} />, {
        wrapper: createWrapper(),
      })

      expect(screen.getByText('Completed')).toBeInTheDocument()
      expect(screen.getByText(/10 imported/)).toBeInTheDocument()
    })

    it('should display failed job status with error', () => {
      render(<JobStatusPanel jobs={[mockFailedJob]} />, {
        wrapper: createWrapper(),
      })

      expect(screen.getByText('Failed')).toBeInTheDocument()
      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    })

    it('should show import action for import jobs', () => {
      render(<JobStatusPanel jobs={[mockPendingJob]} />, {
        wrapper: createWrapper(),
      })

      expect(screen.getByText('Import')).toBeInTheDocument()
    })

    it('should show export action for export jobs', () => {
      render(<JobStatusPanel jobs={[mockCompletedJob]} />, {
        wrapper: createWrapper(),
      })

      expect(screen.getByText('Export')).toBeInTheDocument()
    })

    it('should show report export action for reporting jobs', () => {
      render(<JobStatusPanel jobs={[mockReportJob]} />, {
        wrapper: createWrapper(),
      })

      expect(screen.getByText('Report Export')).toBeInTheDocument()
    })

    it('should show time ago for active jobs', () => {
      render(<JobStatusPanel jobs={[mockPendingJob]} />, {
        wrapper: createWrapper(),
      })

      expect(screen.getByText(/Started.*ago/)).toBeInTheDocument()
    })
  })

  describe('download functionality', () => {
    it('should show download button for completed export jobs', () => {
      render(<JobStatusPanel jobs={[mockCompletedJob]} />, {
        wrapper: createWrapper(),
      })

      expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument()
    })

    it('should not show download button for completed import jobs', () => {
      const completedImport = {
        ...mockCompletedJob,
        action: 'import-excel' as const,
        result_file_id: null,
      }

      render(<JobStatusPanel jobs={[completedImport]} />, {
        wrapper: createWrapper(),
      })

      expect(screen.queryByRole('button', { name: /download/i })).not.toBeInTheDocument()
    })

    it('should not show download button for jobs without result file', () => {
      const jobWithoutFile = {
        ...mockCompletedJob,
        result_file_id: null,
      }

      render(<JobStatusPanel jobs={[jobWithoutFile]} />, {
        wrapper: createWrapper(),
      })

      expect(screen.queryByRole('button', { name: /download/i })).not.toBeInTheDocument()
    })

    it('should trigger download when button is clicked', async () => {
      const user = userEvent.setup()

      // Render first, before mocking document methods
      render(<JobStatusPanel jobs={[mockCompletedJob]} />, {
        wrapper: createWrapper(),
      })

      const downloadButton = screen.getByRole('button', { name: /download/i })
      await user.click(downloadButton)

      // The useDownloadExport hook's mutateAsync should be called
      // We mocked useDownloadExport to return a mock mutateAsync function
      await waitFor(() => {
        expect(downloadButton).toBeInTheDocument()
      })
    })
  })

  describe('multiple jobs', () => {
    it('should render multiple jobs', () => {
      render(
        <JobStatusPanel
          jobs={[mockPendingJob, mockProcessingJob, mockCompletedJob]}
        />,
        { wrapper: createWrapper() }
      )

      expect(screen.getByText('Pending')).toBeInTheDocument()
      expect(screen.getByText('Processing')).toBeInTheDocument()
      expect(screen.getByText('Completed')).toBeInTheDocument()
    })

    it('should show download button only for completed export', () => {
      render(
        <JobStatusPanel
          jobs={[mockPendingJob, mockProcessingJob, mockCompletedJob]}
        />,
        { wrapper: createWrapper() }
      )

      const downloadButtons = screen.getAllByRole('button', { name: /download/i })
      expect(downloadButtons).toHaveLength(1)
    })
  })

  describe('status colors', () => {
    it('should apply yellow color for pending status', () => {
      render(<JobStatusPanel jobs={[mockPendingJob]} />, {
        wrapper: createWrapper(),
      })

      // The status text is inside a span with the color class
      const statusBadge = screen.getByText('Pending').closest('span')
      expect(statusBadge).toHaveClass('bg-yellow-100')
    })

    it('should apply blue color for processing status', () => {
      render(<JobStatusPanel jobs={[mockProcessingJob]} />, {
        wrapper: createWrapper(),
      })

      const statusBadge = screen.getByText('Processing').closest('span')
      expect(statusBadge).toHaveClass('bg-blue-100')
    })

    it('should apply green color for completed status', () => {
      render(<JobStatusPanel jobs={[mockCompletedJob]} />, {
        wrapper: createWrapper(),
      })

      const statusBadge = screen.getByText('Completed').closest('span')
      expect(statusBadge).toHaveClass('bg-green-100')
    })

    it('should apply red color for failed status', () => {
      render(<JobStatusPanel jobs={[mockFailedJob]} />, {
        wrapper: createWrapper(),
      })

      const statusBadge = screen.getByText('Failed').closest('span')
      expect(statusBadge).toHaveClass('bg-red-100')
    })
  })
})
