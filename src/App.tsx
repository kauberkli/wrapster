import { Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import AuthGuard from '@/components/AuthGuard'
import { routes } from '@/routes'

function App() {
  return (
    <BrowserRouter>
      <AuthGuard>
        <Suspense fallback={<div>Loading...</div>}>
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
    </BrowserRouter>
  )
}

export default App
