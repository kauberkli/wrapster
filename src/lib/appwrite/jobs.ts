import { ExecutionMethod, Functions } from 'appwrite'

import client, { storage } from './config'
import { databaseService, Query } from './database'

import type {
  ImportJob,
  JobAction,
  JobStatus,
  ParsedJob,
  QueueJobResponse,
} from '@/types/job'
import { COLLECTIONS } from '@/types/job'

const functions = new Functions(client)

const FUNCTION_ID = import.meta.env.VITE_APPWRITE_QUEUE_FUNCTION_ID || 'queue-product-job'
const BUCKET_ID = import.meta.env.VITE_APPWRITE_BUCKET_ID

/**
 * Parse job document to typed job
 */
function parseJob(job: ImportJob): ParsedJob {
  return {
    ...job,
    stats: job.stats ? JSON.parse(job.stats) : null,
    filters: job.filters ? JSON.parse(job.filters) : null,
  }
}

export const jobService = {
  /**
   * Upload file for import and queue the import job
   */
  async queueImport(file: File, userId: string): Promise<QueueJobResponse> {
    // Upload file to storage first
    const uploadedFile = await storage.createFile(BUCKET_ID, 'unique()', file)

    // Call Appwrite Function to queue the job
    const execution = await functions.createExecution(
      FUNCTION_ID,
      JSON.stringify({
        action: 'import',
        fileId: uploadedFile.$id,
        userId,
      }),
      false, // async
      '/', // path
      ExecutionMethod.POST // method
    )

    // Parse the response
    const response = JSON.parse(execution.responseBody) as QueueJobResponse

    if (!response.success) {
      // Clean up uploaded file on failure
      try {
        await storage.deleteFile(BUCKET_ID, uploadedFile.$id)
      } catch {
        // Ignore cleanup errors
      }
      throw new Error(response.error || 'Failed to queue import job')
    }

    return response
  },

  /**
   * Queue an export job
   */
  async queueExport(
    userId: string,
    filters?: { type?: 'single' | 'bundle' }
  ): Promise<QueueJobResponse> {
    const execution = await functions.createExecution(
      FUNCTION_ID,
      JSON.stringify({
        action: 'export',
        userId,
        filters,
      }),
      false, // async
      '/', // path
      ExecutionMethod.POST // method
    )

    // Check if function executed successfully
    if (execution.status === 'failed') {
      console.error('Function execution failed:', execution.errors)
      throw new Error(`Function failed: ${execution.errors || 'Unknown error'}`)
    }

    // Check for empty response
    if (!execution.responseBody) {
      console.error('Function returned empty response:', execution)
      throw new Error('Function returned empty response. Check function logs in Appwrite Console.')
    }

    const response = JSON.parse(execution.responseBody) as QueueJobResponse

    if (!response.success) {
      throw new Error(response.error || 'Failed to queue export job')
    }

    return response
  },

  /**
   * Queue a report export job
   */
  async queueReportExport(
    userId: string,
    startDate: string,
    endDate: string,
    format: 'excel' | 'pdf' = 'excel'
  ): Promise<QueueJobResponse> {
    const execution = await functions.createExecution(
      FUNCTION_ID,
      JSON.stringify({
        action: 'report-export',
        userId,
        startDate,
        endDate,
        format,
      }),
      false, // async
      '/', // path
      ExecutionMethod.POST // method
    )

    // Check if function executed successfully
    if (execution.status === 'failed') {
      console.error('Function execution failed:', execution.errors)
      throw new Error(`Function failed: ${execution.errors || 'Unknown error'}`)
    }

    // Check for empty response
    if (!execution.responseBody) {
      console.error('Function returned empty response:', execution)
      throw new Error('Function returned empty response. Check function logs in Appwrite Console.')
    }

    const response = JSON.parse(execution.responseBody) as QueueJobResponse

    if (!response.success) {
      throw new Error(response.error || 'Failed to queue report export job')
    }

    return response
  },

  /**
   * Get a job by ID
   */
  async getById(jobId: string): Promise<ParsedJob> {
    const job = await databaseService.getDocument<ImportJob>(
      COLLECTIONS.IMPORT_JOBS,
      jobId
    )
    return parseJob(job)
  },

  /**
   * List jobs for a user
   */
  async listByUser(
    userId: string,
    options?: {
      action?: JobAction
      status?: JobStatus
      limit?: number
      offset?: number
    }
  ): Promise<{ documents: ParsedJob[]; total: number }> {
    const queries: string[] = [Query.equal('user_id', userId)]

    if (options?.action) {
      queries.push(Query.equal('action', options.action))
    }
    if (options?.status) {
      queries.push(Query.equal('status', options.status))
    }

    queries.push(Query.orderDesc('created_at'))

    if (options?.limit) {
      queries.push(Query.limit(options.limit))
    }
    if (options?.offset) {
      queries.push(Query.offset(options.offset))
    }

    const result = await databaseService.listDocuments<ImportJob>(
      COLLECTIONS.IMPORT_JOBS,
      queries
    )

    return {
      documents: result.documents.map(parseJob),
      total: result.total,
    }
  },

  /**
   * Get active and recent jobs for a user
   * Includes pending/processing jobs and recently completed/failed jobs (last 1 hour)
   * Also marks stale pending jobs (>15 min) as failed
   */
  async getActiveJobs(userId: string): Promise<ParsedJob[]> {
    // Get active jobs (pending/processing)
    const activeResult = await databaseService.listDocuments<ImportJob>(
      COLLECTIONS.IMPORT_JOBS,
      [
        Query.equal('user_id', userId),
        Query.equal('status', ['pending', 'processing']),
        Query.orderDesc('created_at'),
        Query.limit(10),
      ]
    )

    // Check for stale pending jobs (>2 minutes) and mark them as failed
    const staleThreshold = 2 * 60 * 1000 // 2 minutes
    for (const job of activeResult.documents) {
      const jobAge = Date.now() - new Date(job.created_at).getTime()
      if (job.status === 'pending' && jobAge > staleThreshold) {
        try {
          await databaseService.updateDocument(COLLECTIONS.IMPORT_JOBS, job.$id, {
            status: 'failed',
            error: 'Task expired - worker did not pick up the job in time',
            completed_at: new Date().toISOString(),
          })
          job.status = 'failed'
          job.error = 'Task expired - worker did not pick up the job in time'
        } catch {
          // Ignore update errors
        }
      }
    }

    // Get recently completed/failed jobs (last 1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const recentResult = await databaseService.listDocuments<ImportJob>(
      COLLECTIONS.IMPORT_JOBS,
      [
        Query.equal('user_id', userId),
        Query.equal('status', ['completed', 'failed']),
        Query.greaterThan('$updatedAt', oneHourAgo),
        Query.orderDesc('created_at'),
        Query.limit(10),
      ]
    )

    // Combine and deduplicate
    const allJobs = [...activeResult.documents, ...recentResult.documents]
    const uniqueJobs = allJobs.filter(
      (job, index, self) => index === self.findIndex((j) => j.$id === job.$id)
    )

    // Sort by created_at descending
    uniqueJobs.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

    return uniqueJobs.slice(0, 10).map(parseJob)
  },

  /**
   * Get download URL for export result
   */
  getDownloadUrl(fileId: string): string {
    const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT
    const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID
    return `${endpoint}/storage/buckets/${BUCKET_ID}/files/${fileId}/download?project=${projectId}`
  },

  /**
   * Download export file
   */
  async downloadExport(fileId: string): Promise<Blob> {
    const url = storage.getFileDownload(BUCKET_ID, fileId)
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`)
    }
    return response.blob()
  },
}
