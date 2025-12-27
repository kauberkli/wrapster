import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDistanceToNow, format } from 'date-fns'
import {
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  FileUp,
  Loader2,
  XCircle,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import {
  formatJobStats,
  getJobStatusColor,
  useDownloadExport,
  useJobs,
} from '@/hooks/use-jobs'
import type { JobAction, JobStatus, ParsedJob } from '@/types/job'

export default function Jobs() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const downloadExport = useDownloadExport()

  const [actionFilter, setActionFilter] = useState<JobAction | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'all'>('all')

  const { data, isLoading } = useJobs({
    userId: user?.$id || '',
    action: actionFilter === 'all' ? undefined : actionFilter,
    status: statusFilter === 'all' ? undefined : statusFilter,
    limit: 50,
    enabled: !!user,
  })

  const jobs = data?.documents || []

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="size-4" />
      case 'processing':
        return <Loader2 className="size-4 animate-spin" />
      case 'completed':
        return <CheckCircle2 className="size-4" />
      case 'failed':
        return <XCircle className="size-4" />
      default:
        return null
    }
  }

  const getActionIcon = (action: string) => {
    if (action === 'import-excel') {
      return <FileUp className="size-5" />
    }
    if (action === 'export-excel') {
      return <Download className="size-5" />
    }
    if (action.includes('reporting')) {
      return <FileSpreadsheet className="size-5" />
    }
    return null
  }

  const getActionLabel = (action: string) => {
    if (action === 'import-excel') {
      return t('jobs.import')
    }
    if (action === 'export-excel') {
      return t('jobs.export')
    }
    if (action.includes('reporting')) {
      return t('jobs.reportExport')
    }
    return action
  }

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

  return (
    <div className="flex h-full flex-col gap-6 overflow-auto p-1">
      <div>
        <h1 className="text-2xl font-bold">{t('jobs.title')}</h1>
        <p className="text-muted-foreground mt-1">
          {t('jobs.subtitle')}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">{t('jobs.filterByAction')}</label>
          <Select
            value={actionFilter}
            onValueChange={(value) => setActionFilter(value as JobAction | 'all')}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('jobs.allActions')}</SelectItem>
              <SelectItem value="import">{t('jobs.import')}</SelectItem>
              <SelectItem value="export">{t('jobs.export')}</SelectItem>
              <SelectItem value="report-export">{t('jobs.reportExport')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">{t('jobs.filterByStatus')}</label>
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as JobStatus | 'all')}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('jobs.allStatuses')}</SelectItem>
              <SelectItem value="pending">{t('jobs.status.pending')}</SelectItem>
              <SelectItem value="processing">{t('jobs.status.processing')}</SelectItem>
              <SelectItem value="completed">{t('jobs.status.completed')}</SelectItem>
              <SelectItem value="failed">{t('jobs.status.failed')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Jobs List */}
      <Card>
        <CardHeader>
          <CardTitle>{t('jobs.jobsList')}</CardTitle>
          <CardDescription>
            {t('jobs.showingJobs', { count: jobs.length })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('jobs.noJobs')}
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <div
                  key={job.$id}
                  className="flex items-center justify-between gap-4 rounded-lg border p-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      {getActionIcon(job.action)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {getActionLabel(job.action)}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${getJobStatusColor(job.status)}`}
                        >
                          {getStatusIcon(job.status)}
                          {t(`jobs.status.${job.status}`)}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {format(new Date(job.created_at), 'PPp')}
                        {' • '}
                        {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                      </div>
                      {job.status === 'completed' && job.stats && (
                        <div className="mt-1 text-sm text-muted-foreground">
                          {formatJobStats(job)}
                        </div>
                      )}
                      {job.status === 'failed' && job.error && (
                        <div className="mt-1 text-sm text-destructive">
                          {job.error}
                        </div>
                      )}
                    </div>
                  </div>
                  {job.status === 'completed' &&
                    (job.action === 'export-excel' || job.action.includes('reporting')) &&
                    job.result_file_id && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload(job)}
                        disabled={downloadExport.isPending}
                      >
                        {downloadExport.isPending ? (
                          <Loader2 className="mr-2 size-4 animate-spin" />
                        ) : (
                          <Download className="mr-2 size-4" />
                        )}
                        {t('common.download')}
                      </Button>
                    )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
