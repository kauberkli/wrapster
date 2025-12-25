import type { ReactNode } from 'react'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'

import { FullScreenSpinner } from '@/components/ui/spinner'

interface LoadingContextType {
  isLoading: boolean
  loadingMessage: string | null
  startLoading: (message?: string) => void
  stopLoading: () => void
  setLoading: (loading: boolean, message?: string) => void
}

const LoadingContext = createContext<LoadingContextType | null>(null)

interface LoadingProviderProps {
  children: ReactNode
}

export function LoadingProvider({ children }: LoadingProviderProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null)

  const startLoading = useCallback((message?: string) => {
    setLoadingMessage(message ?? null)
    setIsLoading(true)
  }, [])

  const stopLoading = useCallback(() => {
    setIsLoading(false)
    setLoadingMessage(null)
  }, [])

  const setLoading = useCallback((loading: boolean, message?: string) => {
    setIsLoading(loading)
    setLoadingMessage(loading ? (message ?? null) : null)
  }, [])

  const value = useMemo(
    () => ({
      isLoading,
      loadingMessage,
      startLoading,
      stopLoading,
      setLoading,
    }),
    [isLoading, loadingMessage, startLoading, stopLoading, setLoading]
  )

  return (
    <LoadingContext.Provider value={value}>
      {children}
      {isLoading && <FullScreenSpinner message={loadingMessage ?? undefined} />}
    </LoadingContext.Provider>
  )
}

export function useLoading() {
  const context = useContext(LoadingContext)
  if (!context) {
    throw new Error('useLoading must be used within a LoadingProvider')
  }
  return context
}
