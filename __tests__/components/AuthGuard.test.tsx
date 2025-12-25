import type { ReactNode } from 'react'

import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AuthGuard from '@/components/AuthGuard'
import { AuthProvider } from '@/contexts/AuthContext'
import { LoadingProvider } from '@/contexts/LoadingContext'

vi.mock('@/lib/appwrite', () => ({
  authService: {
    getCurrentUser: vi.fn(),
  },
}))

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: vi.fn().mockReturnValue(false),
}))

const TestChild = () => <div data-testid="protected-content">Protected Content</div>
const LoginPage = () => <div data-testid="login-page">Login Page</div>

interface WrapperProps {
  children: ReactNode
}

function TestWrapper({ children }: WrapperProps) {
  return (
    <AuthProvider>
      <LoadingProvider>{children}</LoadingProvider>
    </AuthProvider>
  )
}

const renderWithRouter = async (initialPath: string, mockUser: unknown = null) => {
  const { authService } = await import('@/lib/appwrite')
  vi.mocked(authService.getCurrentUser).mockResolvedValue(mockUser as never)

  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <TestWrapper>
        <Routes>
          <Route
            path="*"
            element={
              <AuthGuard>
                <Routes>
                  <Route path="/" element={<TestChild />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/dashboard" element={<TestChild />} />
                </Routes>
              </AuthGuard>
            }
          />
        </Routes>
      </TestWrapper>
    </MemoryRouter>
  )
}

describe('AuthGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('loading state', () => {
    it('should show loading spinner while checking authentication', async () => {
      const { authService } = await import('@/lib/appwrite')
      vi.mocked(authService.getCurrentUser).mockImplementation(
        () => new Promise(() => {})
      )

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <TestWrapper>
            <AuthGuard>
              <div>Content</div>
            </AuthGuard>
          </TestWrapper>
        </MemoryRouter>
      )

      expect(screen.getByRole('status')).toBeInTheDocument()
      expect(screen.getByText('Checking authentication...')).toBeInTheDocument()
    })
  })

  describe('public routes', () => {
    it('should render children for home route (public)', async () => {
      await renderWithRouter('/')
      expect(await screen.findByTestId('protected-content')).toBeInTheDocument()
    })

    it('should render children for login route (public)', async () => {
      await renderWithRouter('/login')
      expect(await screen.findByTestId('login-page')).toBeInTheDocument()
    })

    it('should render public routes without authentication', async () => {
      await renderWithRouter('/', null)
      expect(await screen.findByTestId('protected-content')).toBeInTheDocument()
    })
  })

  describe('private routes', () => {
    it('should redirect to login for unauthenticated users on dashboard', async () => {
      await renderWithRouter('/dashboard', null)
      expect(await screen.findByTestId('login-page')).toBeInTheDocument()
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
    })

    it('should render children for authenticated users on dashboard', async () => {
      await renderWithRouter('/dashboard', { $id: '123', email: 'test@test.com' })
      expect(await screen.findByTestId('protected-content')).toBeInTheDocument()
    })
  })

  describe('authentication check', () => {
    it('should consider user authenticated when user object exists', async () => {
      await renderWithRouter('/dashboard', { $id: '123', email: 'test@test.com' })
      expect(await screen.findByTestId('protected-content')).toBeInTheDocument()
    })

    it('should consider user unauthenticated when user is null', async () => {
      await renderWithRouter('/dashboard', null)
      expect(await screen.findByTestId('login-page')).toBeInTheDocument()
    })
  })
})
