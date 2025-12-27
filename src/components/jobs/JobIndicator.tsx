import { useTranslation } from 'react-i18next'
import { formatDistanceToNow } from 'date-fns'
import {
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  FileUp,
  Loader2,
  XCircle,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { useAuth } from '@/contexts/AuthContext'
import {
  formatJobStats,
  getJobStatusColor,
  useActiveJobs,
  useDownloadExport,
} from '@/hooks/use-jobs'
import type { ParsedJob } from '@/types/job'

export function JobIndicator() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { data: activeJobs = [], isLoading } = useActiveJobs(user?.$id || '', !!user)
  const downloadExport = useDownloadExport()

  // Count active jobs
  const pendingCount = activeJobs.filter(j => j.status === 'pending').length
  const processingCount = activeJobs.filter(j => j.status === 'processing').length
  const totalActive = pendingCount + processingCount
  const hasActiveJobs = totalActive > 0
  const hasRecentJobs = activeJobs.length > 0

  const handleDownload = async (job: ParsedJob) => {
    if (job.result_file_id) {
      const date = new Date(job.created_at).toISOString().split('T')[0]
      const isPdf = job.action === 'export-reporting-pdf'
      const isReport = job.action.includes('reporting')
      const ext = isPdf ? 'pdf' : 'xlsx'
      const fileName = isReport
        ? `packaging_report_${date}.${ext}`
        : `products_export_${date}.xlsx`
      await downloadExport.mutateAsync({
        fileId: job.result_file_id,
        fileName,
      })
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="size-3" />
      case 'processing':
        return <Loader2 className="size-3 animate-spin" />
      case 'completed':
        return <CheckCircle2 className="size-3" />
      case 'failed':
        return <XCircle className="size-3" />
      default:
        return null
    }
  }

  const getActionIcon = (action: string) => {
    if (action === 'import-excel') {
      return <FileUp className="size-4" />
    }
    if (action === 'export-excel') {
      return <Download className="size-4" />
    }
    if (action.includes('reporting')) {
      return <FileSpreadsheet className="size-4" />
    }
    return null
  }

  if (!user || isLoading) {
    return null
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{t('jobs.backgroundJobs')}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <Popover>
              <PopoverTrigger asChild>
                <SidebarMenuButton
                  tooltip={t('jobs.viewJobs')}
                  className="cursor-pointer"
                >
                  {hasActiveJobs ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <CheckCircle2 />
                  )}
                  <span>
                    {hasActiveJobs
                      ? t('jobs.jobsRunning', { count: totalActive })
                      : t('jobs.noActiveJobs')}
                  </span>
                  {hasActiveJobs && (
                    <SidebarMenuBadge>{totalActive}</SidebarMenuBadge>
                  )}
                </SidebarMenuButton>
              </PopoverTrigger>
              <PopoverContent
                side="right"
                align="start"
                className="w-80 p-0"
              >
                <div className="p-3 border-b">
                  <h4 className="font-medium text-sm">{t('jobs.recentJobs')}</h4>
                </div>
                {!hasRecentJobs ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    {t('jobs.noJobs')}
                  </div>
                ) : (
                  <div className="max-h-64 overflow-auto">
                    {activeJobs.map((job) => (
                      <div
                        key={job.$id}
                        className="flex items-start gap-3 p-3 border-b last:border-b-0 hover:bg-muted/50"
                      >
                        <div className="text-muted-foreground mt-0.5">
                          {getActionIcon(job.action)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium ${getJobStatusColor(job.status)}`}
                            >
                              {getStatusIcon(job.status)}
                              {t(`jobs.status.${job.status}`)}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {job.action === 'import-excel'
                              ? t('jobs.import')
                              : job.action.includes('reporting')
                                ? t('jobs.reportExport')
                                : t('jobs.export')}
                            {' • '}
                            {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                          </div>
                          {job.status === 'completed' && job.stats && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {formatJobStats(job)}
                            </div>
                          )}
                          {job.status === 'failed' && job.error && (
                            <div className="text-xs text-destructive mt-1 truncate">
                              {job.error}
                            </div>
                          )}
                          {job.status === 'completed' &&
                            (job.action === 'export-excel' || job.action.includes('reporting')) &&
                            job.result_file_id && (
                              <button
                                onClick={() => handleDownload(job)}
                                disabled={downloadExport.isPending}
                                className="text-xs text-primary hover:underline mt-1 inline-flex items-center gap-1"
                              >
                                <Download className="size-3" />
                                {t('common.download')}
                              </button>
                            )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="p-2 border-t">
                  <Link
                    to="/jobs"
                    className="text-xs text-primary hover:underline block text-center"
                  >
                    {t('jobs.viewAllJobs')}
                  </Link>
                </div>
              </PopoverContent>
            </Popover>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
