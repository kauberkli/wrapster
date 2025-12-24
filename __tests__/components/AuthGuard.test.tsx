import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AuthGuard from '@/components/AuthGuard'

const TestChild = () => <div data-testid="protected-content">Protected Content</div>
const LoginPage = () => <div data-testid="login-page">Login Page</div>

const renderWithRouter = (initialPath: string, authenticated = false) => {
  if (authenticated) {
    localStorage.setItem('token', 'test-token')
  } else {
    localStorage.removeItem('token')
  }

  return render(
    <MemoryRouter initialEntries={[initialPath]}>
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
    </MemoryRouter>
  )
}

describe('AuthGuard', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('public routes', () => {
    it('should render children for home route (public)', () => {
      renderWithRouter('/')
      expect(screen.getByTestId('protected-content')).toBeInTheDocument()
    })

    it('should render children for login route (public)', () => {
      renderWithRouter('/login')
      expect(screen.getByTestId('login-page')).toBeInTheDocument()
    })

    it('should render public routes without authentication', () => {
      localStorage.removeItem('token')
      renderWithRouter('/')
      expect(screen.getByTestId('protected-content')).toBeInTheDocument()
    })
  })

  describe('private routes', () => {
    it('should redirect to login for unauthenticated users on dashboard', () => {
      renderWithRouter('/dashboard', false)
      expect(screen.getByTestId('login-page')).toBeInTheDocument()
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
    })

    it('should render children for authenticated users on dashboard', () => {
      renderWithRouter('/dashboard', true)
      expect(screen.getByTestId('protected-content')).toBeInTheDocument()
    })
  })

  describe('authentication check', () => {
    it('should consider user authenticated when token exists in localStorage', () => {
      renderWithRouter('/dashboard', true)
      expect(screen.getByTestId('protected-content')).toBeInTheDocument()
    })

    it('should consider user unauthenticated when token is missing', () => {
      localStorage.removeItem('token')
      renderWithRouter('/dashboard')
      expect(screen.getByTestId('login-page')).toBeInTheDocument()
    })

    it('should consider user unauthenticated when token is empty string', () => {
      localStorage.setItem('token', '')
      renderWithRouter('/dashboard')
      expect(screen.getByTestId('login-page')).toBeInTheDocument()
    })
  })
})
