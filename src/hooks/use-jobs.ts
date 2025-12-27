import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { jobService } from '@/lib/appwrite'
import type { JobAction, JobStatus, ParsedJob } from '@/types/job'

const JOBS_QUERY_KEY = 'jobs'
const ACTIVE_JOBS_QUERY_KEY = 'active-jobs'

interface UseJobsOptions {
  userId: string
  action?: JobAction
  status?: JobStatus
  limit?: number
  enabled?: boolean
}

/**
 * Hook to fetch jobs for a user
 */
export function useJobs(options: UseJobsOptions) {
  const { userId, action, status, limit = 20, enabled = true } = options

  return useQuery({
    queryKey: [JOBS_QUERY_KEY, userId, action, status, limit],
    queryFn: () =>
      jobService.listByUser(userId, {
        action,
        status,
        limit,
      }),
    enabled: enabled && !!userId,
    refetchInterval: (query) => {
      // Refetch more frequently if there are active jobs
      const hasActiveJobs = query.state.data?.documents.some(
        (job) => job.status === 'pending' || job.status === 'processing'
      )
      return hasActiveJobs ? 3000 : false
    },
  })
}

/**
 * Hook to fetch active jobs (pending/processing) for a user
 */
export function useActiveJobs(userId: string, enabled = true) {
  return useQuery({
    queryKey: [ACTIVE_JOBS_QUERY_KEY, userId],
    queryFn: () => jobService.getActiveJobs(userId),
    enabled: enabled && !!userId,
    refetchInterval: 3000, // Poll every 3 seconds for active jobs
  })
}

/**
 * Hook to fetch a single job by ID
 */
export function useJob(jobId: string, enabled = true) {
  return useQuery({
    queryKey: [JOBS_QUERY_KEY, 'detail', jobId],
    queryFn: () => jobService.getById(jobId),
    enabled: enabled && !!jobId,
    refetchInterval: (query) => {
      // Refetch while job is active
      const job = query.state.data
      if (job && (job.status === 'pending' || job.status === 'processing')) {
        return 2000
      }
      return false
    },
  })
}

/**
 * Hook to queue an import job
 */
export function useQueueImport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ file, userId }: { file: File; userId: string }) =>
      jobService.queueImport(file, userId),
    onSuccess: (_data, variables) => {
      // Invalidate jobs queries to show new job
      queryClient.invalidateQueries({
        queryKey: [JOBS_QUERY_KEY, variables.userId],
      })
      queryClient.invalidateQueries({
        queryKey: [ACTIVE_JOBS_QUERY_KEY, variables.userId],
      })
    },
  })
}

/**
 * Hook to queue an export job
 */
export function useQueueExport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      userId,
      filters,
    }: {
      userId: string
      filters?: { type?: 'single' | 'bundle' }
    }) => jobService.queueExport(userId, filters),
    onSuccess: (_data, variables) => {
      // Invalidate jobs queries to show new job
      queryClient.invalidateQueries({
        queryKey: [JOBS_QUERY_KEY, variables.userId],
      })
      queryClient.invalidateQueries({
        queryKey: [ACTIVE_JOBS_QUERY_KEY, variables.userId],
      })
    },
  })
}

/**
 * Hook to queue a report export job
 */
export function useQueueReportExport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      userId,
      startDate,
      endDate,
      format = 'excel',
    }: {
      userId: string
      startDate: string
      endDate: string
      format?: 'excel' | 'pdf'
    }) => jobService.queueReportExport(userId, startDate, endDate, format),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: [JOBS_QUERY_KEY, variables.userId],
      })
      queryClient.invalidateQueries({
        queryKey: [ACTIVE_JOBS_QUERY_KEY, variables.userId],
      })
    },
  })
}

/**
 * Hook to download export result
 */
export function useDownloadExport() {
  return useMutation({
    mutationFn: async ({
      fileId,
      fileName,
    }: {
      fileId: string
      fileName?: string
    }) => {
      const blob = await jobService.downloadExport(fileId)

      // Create download link
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName || `export_${Date.now()}.xlsx`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      return { success: true }
    },
  })
}

/**
 * Helper to get job status color
 */
export function getJobStatusColor(status: JobStatus): string {
  switch (status) {
    case 'pending':
      return 'bg-yellow-100 text-yellow-700'
    case 'processing':
      return 'bg-blue-100 text-blue-700'
    case 'completed':
      return 'bg-green-100 text-green-700'
    case 'failed':
      return 'bg-red-100 text-red-700'
    default:
      return 'bg-gray-100 text-gray-700'
  }
}

/**
 * Helper to format job stats
 */
export function formatJobStats(job: ParsedJob): string {
  if (!job.stats) return ''

  const parts: string[] = []
  if (job.stats.imported > 0) parts.push(`${job.stats.imported} imported`)
  if (job.stats.updated > 0) parts.push(`${job.stats.updated} updated`)
  if (job.stats.skipped > 0) parts.push(`${job.stats.skipped} skipped`)
  if (job.stats.failed > 0) parts.push(`${job.stats.failed} failed`)

  return parts.join(', ')
}
