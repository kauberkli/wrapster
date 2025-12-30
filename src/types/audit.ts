import type { Models } from 'appwrite'

/**
 * Audit action types for all tracked operations
 */
export type AuditActionType =
  // Authentication actions
  | 'auth_login'
  | 'auth_logout'
  | 'auth_create_account'
  | 'auth_update_name'
  | 'auth_update_email'
  | 'auth_update_password'
  | 'auth_password_recovery_request'
  | 'auth_password_recovery_confirm'
  | 'auth_email_verification_request'
  | 'auth_email_verification_confirm'
  // Product actions
  | 'product_create'
  | 'product_update'
  | 'product_delete'
  | 'product_view'
  | 'product_search_barcode'
  | 'product_search_sku'
  | 'product_list'
  | 'product_stock_update'
  | 'product_stock_deduct'
  | 'product_stock_restore'
  // Product component actions
  | 'product_component_add'
  | 'product_component_remove'
  | 'product_component_update'
  // Packaging actions
  | 'packaging_record_create'
  | 'packaging_record_delete'
  | 'packaging_record_view'
  | 'packaging_list_by_date'
  | 'packaging_view_by_date'
  | 'packaging_item_scan'
  | 'packaging_item_remove'
  // Job actions
  | 'job_queue_import'
  | 'job_queue_export'
  | 'job_queue_report_export'
  | 'job_queue_send_email'
  | 'job_delete'
  | 'job_download'
  | 'job_import_started'
  | 'job_import_completed'
  | 'job_export_started'
  | 'job_export_completed'
  | 'job_report_export_started'
  | 'job_report_export_completed'
  | 'report_email_sent'
  // Storage actions
  | 'storage_file_upload'
  | 'storage_file_delete'
  | 'storage_file_view'
  | 'storage_file_download'
  // Audit log actions (meta-auditing)
  | 'audit_log_view'
  | 'audit_log_export'

/**
 * Resource types that can be audited
 */
export type AuditResourceType =
  | 'auth'
  | 'product'
  | 'product_component'
  | 'packaging_record'
  | 'packaging_item'
  | 'job'
  | 'storage'
  | 'audit_log'

/**
 * Audit log status
 */
export type AuditStatus = 'success' | 'failure'

/**
 * Audit log document from Appwrite
 */
export interface AuditLog extends Models.Document {
  user_id: string
  user_email: string | null
  action_type: AuditActionType
  resource_type: AuditResourceType
  resource_id: string | null
  action_details: string | null // JSON string
  ip_address: string | null
  user_agent: string | null
  status: AuditStatus
  error_message: string | null
  timestamp: string
  session_id: string | null
}

/**
 * Parsed audit log with typed action details
 */
export interface ParsedAuditLog extends Omit<AuditLog, 'action_details'> {
  action_details: Record<string, unknown> | null
}

/**
 * Input for creating an audit log entry
 */
export interface CreateAuditLogInput {
  user_id: string
  user_email?: string | null
  action_type: AuditActionType
  resource_type: AuditResourceType
  resource_id?: string | null
  action_details?: Record<string, unknown> | null
  ip_address?: string | null
  user_agent?: string | null
  status: AuditStatus
  error_message?: string | null
  session_id?: string | null
}

/**
 * Filters for querying audit logs
 */
export interface AuditLogFilters {
  user_id?: string
  action_type?: AuditActionType | AuditActionType[]
  resource_type?: AuditResourceType | AuditResourceType[]
  resource_id?: string
  status?: AuditStatus
  startDate?: string
  endDate?: string
  limit?: number
  offset?: number
}

/**
 * Request context captured during auditing
 */
export interface AuditRequestContext {
  ip_address: string | null
  user_agent: string | null
  session_id: string | null
}

/**
 * User context for audit logging
 */
export interface AuditUserContext {
  user_id: string
  user_email: string | null
  session_id?: string | null
}

/**
 * Collection ID for audit logs
 */
export const COLLECTIONS = {
  AUDIT_LOGS: 'audit_logs',
} as const

/**
 * Sensitive fields that should be sanitized before logging
 */
export const SENSITIVE_FIELDS = [
  'password',
  'oldPassword',
  'newPassword',
  'secret',
  'token',
  'apiKey',
  'api_key',
  'accessToken',
  'refreshToken',
  'authorization',
] as const
