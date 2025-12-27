import type { ComponentType } from 'react'

import { lazy } from 'react'

export interface RouteConfig {
  path: string
  component: ComponentType
  isPublic?: boolean
}

const Login = lazy(() => import('@/pages/Login'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Products = lazy(() => import('@/pages/Products'))
const Packaging = lazy(() => import('@/pages/Packaging'))
const Reports = lazy(() => import('@/pages/Reports'))
const Jobs = lazy(() => import('@/pages/Jobs'))

export const routes: RouteConfig[] = [
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
  {
    path: '/products',
    component: Products,
    isPublic: false,
  },
  {
    path: '/packaging',
    component: Packaging,
    isPublic: false,
  },
  {
    path: '/reports',
    component: Reports,
    isPublic: false,
  },
  {
    path: '/jobs',
    component: Jobs,
    isPublic: false,
  },
]

export const publicPaths = routes
  .filter((route) => route.isPublic)
  .map((route) => route.path)
