import type { ReactNode } from 'react'

import { Navigate, useLocation } from 'react-router-dom'

import { AppLayout } from '@/components/AppLayout'
import { useAuth } from '@/contexts/AuthContext'
import { publicPaths } from '@/routes'

interface AuthGuardProps {
  children: ReactNode
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const { user, isLoading } = useAuth()
  const location = useLocation()
  const isPublicRoute = publicPaths.includes(location.pathname)

  if (isLoading) {
    return <div>Loading...</div>
  }

  if (isPublicRoute) {
    return <>{children}</>
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <AppLayout>{children}</AppLayout>
}
