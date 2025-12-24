import { describe, expect, it } from 'vitest'

import { publicPaths, routes, type RouteConfig } from '@/routes'

describe('routes', () => {
  describe('route configuration', () => {
    it('should have required properties for each route', () => {
      routes.forEach((route: RouteConfig) => {
        expect(route).toHaveProperty('path')
        expect(route).toHaveProperty('component')
        expect(typeof route.path).toBe('string')
        expect(route.component).toBeDefined()
        expect(route.component.$$typeof).toBeDefined()
      })
    })

    it('should contain home route', () => {
      const homeRoute = routes.find((route) => route.path === '/')
      expect(homeRoute).toBeDefined()
      expect(homeRoute?.isPublic).toBe(true)
    })

    it('should contain login route', () => {
      const loginRoute = routes.find((route) => route.path === '/login')
      expect(loginRoute).toBeDefined()
      expect(loginRoute?.isPublic).toBe(true)
    })

    it('should contain dashboard route', () => {
      const dashboardRoute = routes.find((route) => route.path === '/dashboard')
      expect(dashboardRoute).toBeDefined()
      expect(dashboardRoute?.isPublic).toBe(false)
    })

    it('should have unique paths', () => {
      const paths = routes.map((route) => route.path)
      const uniquePaths = new Set(paths)
      expect(uniquePaths.size).toBe(paths.length)
    })
  })

  describe('publicPaths', () => {
    it('should contain only public route paths', () => {
      const expectedPublicPaths = routes
        .filter((route) => route.isPublic)
        .map((route) => route.path)

      expect(publicPaths).toEqual(expectedPublicPaths)
    })

    it('should include home path', () => {
      expect(publicPaths).toContain('/')
    })

    it('should include login path', () => {
      expect(publicPaths).toContain('/login')
    })

    it('should not include dashboard path', () => {
      expect(publicPaths).not.toContain('/dashboard')
    })
  })
})
