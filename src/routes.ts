import type { ComponentType } from 'react'

import { lazy } from 'react'

export interface RouteConfig {
  path: string
  component: ComponentType
  isPublic?: boolean
}

const Home = lazy(() => import('@/pages/Home'))
const Login = lazy(() => import('@/pages/Login'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))

export const routes: RouteConfig[] = [
  {
    path: '/',
    component: Home,
    isPublic: true,
  },
  {
    path: '/login',
    component: Login,
    isPublic: true,
  },
  {
    path: '/dashboard',
    component: Dashboard,
    isPublic: false,
  },
]

export const publicPaths = routes
  .filter((route) => route.isPublic)
  .map((route) => route.path)
