import type { Models } from 'appwrite'

/**
 * Job action type
 */
export type JobAction = 'import' | 'export' | 'report-export'

/**
 * Job status type
 */
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed'

/**
 * Import/Export job statistics
 */
export interface JobStats {
  imported: number
  updated: number
  skipped: number
  failed: number
}

/**
 * Import/Export job document from Appwrite
 */
export interface ImportJob extends Models.Document {
  user_id: string
  action: JobAction
  status: JobStatus
  file_id: string | null
  result_file_id: string | null
  filters: string | null
  stats: string | null
  error: string | null
  created_at: string
  completed_at: string | null
}

/**
 * Parsed job with typed stats
 */
export interface ParsedJob extends Omit<ImportJob, 'stats' | 'filters'> {
  stats: JobStats | null
  filters: Record<string, unknown> | null
}

/**
 * Collection ID for jobs
 */
export const COLLECTIONS = {
  IMPORT_JOBS: 'import_jobs',
} as const

/**
 * Queue job response from Appwrite Function
 */
export interface QueueJobResponse {
  success: boolean
  jobId: string
  action: JobAction
  status: string
  error?: string
}
