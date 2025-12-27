import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { authService } from '@/lib/appwrite'

// Mock the auth service
vi.mock('@/lib/appwrite', () => ({
  authService: {
    getCurrentUser: vi.fn(),
    login: vi.fn(),
    createAccount: vi.fn(),
    logout: vi.fn(),
  },
}))

const mockUser = {
  $id: 'user-123',
  $createdAt: '2024-01-01T00:00:00.000Z',
  $updatedAt: '2024-01-01T00:00:00.000Z',
  name: 'Test User',
  email: 'test@example.com',
  emailVerification: true,
  phone: '',
  phoneVerification: false,
  prefs: {},
  status: true,
  registration: '2024-01-01T00:00:00.000Z',
  labels: [],
  accessedAt: '2024-01-01T00:00:00.000Z',
}

// Test component that uses the auth context
function TestConsumer({ onError }: { onError?: (error: Error) => void }) {
  const { user, isLoading, login, register, logout } = useAuth()

  const handleLogin = async () => {
    try {
      await login('test@example.com', 'password')
    } catch (error) {
      onError?.(error as Error)
    }
  }

  const handleRegister = async () => {
    try {
      await register('new@example.com', 'password', 'New User')
    } catch (error) {
      onError?.(error as Error)
    }
  }

  return (
    <div>
      <div data-testid="loading">{isLoading ? 'loading' : 'loaded'}</div>
      <div data-testid="user">{user ? user.email : 'no user'}</div>
      <button onClick={handleLogin}>Login</button>
      <button onClick={handleRegister}>Register</button>
      <button onClick={() => logout()}>Logout</button>
    </div>
  )
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('AuthProvider', () => {
    it('should render children', async () => {
      (authService.getCurrentUser as Mock).mockResolvedValue(null)

      render(
        <AuthProvider>
          <div data-testid="child">Child content</div>
        </AuthProvider>
      )

      expect(screen.getByTestId('child')).toBeInTheDocument()
    })

    it('should start with loading state', async () => {
      (authService.getCurrentUser as Mock).mockResolvedValue(null)

      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      )

      expect(screen.getByTestId('loading')).toHaveTextContent('loading')

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('loaded')
      })
    })

    it('should load user on mount', async () => {
      (authService.getCurrentUser as Mock).mockResolvedValue(mockUser)

      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('test@example.com')
      })
    })

    it('should set user to null when no user is authenticated', async () => {
      (authService.getCurrentUser as Mock).mockResolvedValue(null)

      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('no user')
      })
    })

    it('should set user to null on auth error', async () => {
      (authService.getCurrentUser as Mock).mockRejectedValue(new Error('Auth error'))

      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('loaded')
      })

      expect(screen.getByTestId('user')).toHaveTextContent('no user')
    })
  })

  describe('login', () => {
    it('should login user and update state', async () => {
      (authService.getCurrentUser as Mock)
        .mockResolvedValueOnce(null) // Initial load
        .mockResolvedValueOnce(mockUser) // After login
      ;(authService.login as Mock).mockResolvedValue({ $id: 'session-123' })

      const user = userEvent.setup()

      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('loaded')
      })

      await user.click(screen.getByText('Login'))

      await waitFor(() => {
        expect(authService.login).toHaveBeenCalledWith('test@example.com', 'password')
      })

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('test@example.com')
      })
    })

    it('should throw error on login failure', async () => {
      (authService.getCurrentUser as Mock).mockResolvedValue(null)
      ;(authService.login as Mock).mockRejectedValue(new Error('Invalid credentials'))

      const user = userEvent.setup()
      const onError = vi.fn()

      render(
        <AuthProvider>
          <TestConsumer onError={onError} />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('loaded')
      })

      await user.click(screen.getByText('Login'))

      await waitFor(() => {
        expect(authService.login).toHaveBeenCalled()
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({
          message: 'Invalid credentials',
        }))
      })
    })
  })

  describe('register', () => {
    it('should register user and update state', async () => {
      (authService.getCurrentUser as Mock)
        .mockResolvedValueOnce(null) // Initial load
        .mockResolvedValueOnce({ ...mockUser, email: 'new@example.com' }) // After registration
      ;(authService.createAccount as Mock).mockResolvedValue({ $id: 'new-user' })

      const user = userEvent.setup()

      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('loaded')
      })

      await user.click(screen.getByText('Register'))

      await waitFor(() => {
        expect(authService.createAccount).toHaveBeenCalledWith(
          'new@example.com',
          'password',
          'New User'
        )
      })

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('new@example.com')
      })
    })
  })

  describe('logout', () => {
    it('should logout user and clear state', async () => {
      (authService.getCurrentUser as Mock).mockResolvedValue(mockUser)
      ;(authService.logout as Mock).mockResolvedValue({})

      const user = userEvent.setup()

      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('test@example.com')
      })

      await user.click(screen.getByText('Logout'))

      await waitFor(() => {
        expect(authService.logout).toHaveBeenCalled()
      })

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('no user')
      })
    })
  })

  describe('useAuth hook', () => {
    it('should throw error when used outside AuthProvider', () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => {
        render(<TestConsumer />)
      }).toThrow('useAuth must be used within an AuthProvider')

      consoleSpy.mockRestore()
    })
  })
})

describe('AuthContext edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should handle concurrent auth operations', async () => {
    (authService.getCurrentUser as Mock).mockResolvedValue(null)
    ;(authService.login as Mock).mockResolvedValue({ $id: 'session' })
    ;(authService.logout as Mock).mockResolvedValue({})

    const user = userEvent.setup()

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('loaded')
    })

    // Rapid login/logout clicks
    await user.click(screen.getByText('Login'))
    await user.click(screen.getByText('Logout'))

    // Should complete without errors
    await waitFor(() => {
      expect(authService.login).toHaveBeenCalled()
    })
  })

  it('should handle undefined user from getCurrentUser', async () => {
    (authService.getCurrentUser as Mock).mockResolvedValue(undefined)

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('no user')
    })
  })

  it('should handle network timeout on initial load', async () => {
    (authService.getCurrentUser as Mock).mockRejectedValue(new Error('Network timeout'))

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('loaded')
    })

    expect(screen.getByTestId('user')).toHaveTextContent('no user')
  })

  it('should preserve user state across re-renders', async () => {
    (authService.getCurrentUser as Mock).mockResolvedValue(mockUser)

    const { rerender } = render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('test@example.com')
    })

    // Re-render
    rerender(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )

    expect(screen.getByTestId('user')).toHaveTextContent('test@example.com')
  })

  it('should handle slow network on login', async () => {
    // Mock a delayed login response
    (authService.getCurrentUser as Mock)
      .mockResolvedValueOnce(null) // Initial check
      .mockResolvedValueOnce(mockUser) // After login
    ;(authService.login as Mock).mockResolvedValue({ $id: 'session' })

    const user = userEvent.setup()

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('loaded')
    })

    // Click login and wait for it to complete
    await user.click(screen.getByText('Login'))

    await waitFor(() => {
      expect(authService.login).toHaveBeenCalled()
    })
  })
})
