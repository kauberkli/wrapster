import { useTranslation } from 'react-i18next'
import { formatDistanceToNow } from 'date-fns'
import {
  CheckCircle2,
  Clock,
  Download,
  FileUp,
  Loader2,
  XCircle,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  formatJobStats,
  getJobStatusColor,
  useDownloadExport,
} from '@/hooks/use-jobs'
import type { ParsedJob } from '@/types/job'

interface JobStatusPanelProps {
  jobs: ParsedJob[]
  isLoading?: boolean
}

export function JobStatusPanel({ jobs, isLoading }: JobStatusPanelProps) {
  const { t } = useTranslation()
  const downloadExport = useDownloadExport()

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {t('jobs.loading')}
      </div>
    )
  }

  if (jobs.length === 0) {
    return null
  }

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
    switch (action) {
      case 'import':
        return <FileUp className="size-4" />
      case 'export':
        return <Download className="size-4" />
      default:
        return null
    }
  }

  const handleDownload = async (job: ParsedJob) => {
    if (job.result_file_id) {
      const date = new Date(job.created_at).toISOString().split('T')[0]
      await downloadExport.mutateAsync({
        fileId: job.result_file_id,
        fileName: `products_export_${date}.xlsx`,
      })
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="mb-3 text-sm font-medium">{t('jobs.activeJobs')}</h3>
      <div className="space-y-2">
        {jobs.map((job) => (
          <div
            key={job.$id}
            className="flex items-center justify-between gap-4 rounded-md border p-3"
          >
            <div className="flex items-center gap-3">
              <div className="text-muted-foreground">
                {getActionIcon(job.action)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${getJobStatusColor(job.status)}`}
                  >
                    {getStatusIcon(job.status)}
                    {t(`jobs.status.${job.status}`)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {job.action === 'import' ? t('jobs.import') : t('jobs.export')}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {job.status === 'completed' && job.stats && (
                    <span>{formatJobStats(job)}</span>
                  )}
                  {job.status === 'failed' && job.error && (
                    <span className="text-destructive">{job.error}</span>
                  )}
                  {(job.status === 'pending' || job.status === 'processing') && (
                    <span>
                      {t('jobs.startedAgo', {
                        time: formatDistanceToNow(new Date(job.created_at)),
                      })}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {job.status === 'completed' &&
              job.action === 'export' &&
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
    </div>
  )
}
