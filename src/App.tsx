import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import AuthGuard from '@/components/AuthGuard'
import { Toaster } from '@/components/ui/sonner'
import { SuspenseSpinner } from '@/components/ui/spinner'
import { AuthProvider } from '@/contexts/AuthContext'
import { LoadingProvider } from '@/contexts/LoadingContext'
import { routes } from '@/routes'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 10, // 10 minutes (formerly cacheTime)
      refetchOnWindowFocus: false,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
        <LoadingProvider>
          <AuthGuard>
            <Suspense fallback={<SuspenseSpinner />}>
              <Routes>
                {routes.map((route) => (
                  <Route
                    key={route.path}
                    path={route.path}
                    element={<route.component />}
                  />
                ))}
              </Routes>
            </Suspense>
          </AuthGuard>
          <Toaster position="top-right" />
        </LoadingProvider>
      </AuthProvider>
    </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
