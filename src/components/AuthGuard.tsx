import type { ReactNode } from 'react'

import { Navigate, useLocation } from 'react-router-dom'

import { publicPaths } from '@/routes'

interface AuthGuardProps {
  children: ReactNode
}

function isAuthenticated(): boolean {
  // TODO: Replace with actual authentication logic
  return !!localStorage.getItem('token')
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const location = useLocation()
  const isPublicRoute = publicPaths.includes(location.pathname)

  if (isPublicRoute) {
    return <>{children}</>
  }

  if (!isAuthenticated()) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}
