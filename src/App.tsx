import { Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import AuthGuard from '@/components/AuthGuard'
import { Toaster } from '@/components/ui/sonner'
import { SuspenseSpinner } from '@/components/ui/spinner'
import { AuthProvider } from '@/contexts/AuthContext'
import { LoadingProvider } from '@/contexts/LoadingContext'
import { routes } from '@/routes'

function App() {
  return (
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
  )
}

export default App
