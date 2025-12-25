import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

interface SpinnerProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

const sizeClasses = {
  sm: 'size-4',
  md: 'size-8',
  lg: 'size-12',
}

export function Spinner({ className, size = 'md' }: SpinnerProps) {
  return (
    <Loader2
      className={cn('animate-spin text-primary', sizeClasses[size], className)}
      aria-label="Loading"
    />
  )
}

interface FullScreenSpinnerProps {
  message?: string
}

export function FullScreenSpinner({ message }: FullScreenSpinnerProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm"
      role="status"
      aria-live="polite"
    >
      <Spinner size="lg" />
      {message && (
        <p className="mt-4 text-sm text-muted-foreground">{message}</p>
      )}
    </div>
  )
}

export function SuspenseSpinner() {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm"
      role="status"
      aria-live="polite"
    >
      <Spinner size="lg" />
      <p className="mt-4 text-sm text-muted-foreground">Loading page...</p>
    </div>
  )
}
