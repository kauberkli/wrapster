import { beforeEach, describe, expect, it, vi } from 'vitest'

import { authService } from '@/lib/appwrite/auth'

// Mock the Appwrite config
const mockAccount = {
  create: vi.fn(),
  createEmailPasswordSession: vi.fn(),
  deleteSession: vi.fn(),
  get: vi.fn(),
  updateName: vi.fn(),
  updateEmail: vi.fn(),
  updatePassword: vi.fn(),
  createRecovery: vi.fn(),
  updateRecovery: vi.fn(),
  createVerification: vi.fn(),
  updateVerification: vi.fn(),
}

vi.mock('@/lib/appwrite/config', () => ({
  account: {
    create: (...args: unknown[]) => mockAccount.create(...args),
    createEmailPasswordSession: (...args: unknown[]) =>
      mockAccount.createEmailPasswordSession(...args),
    deleteSession: (...args: unknown[]) => mockAccount.deleteSession(...args),
    get: (...args: unknown[]) => mockAccount.get(...args),
    updateName: (...args: unknown[]) => mockAccount.updateName(...args),
    updateEmail: (...args: unknown[]) => mockAccount.updateEmail(...args),
    updatePassword: (...args: unknown[]) => mockAccount.updatePassword(...args),
    createRecovery: (...args: unknown[]) => mockAccount.createRecovery(...args),
    updateRecovery: (...args: unknown[]) => mockAccount.updateRecovery(...args),
    createVerification: (...args: unknown[]) =>
      mockAccount.createVerification(...args),
    updateVerification: (...args: unknown[]) =>
      mockAccount.updateVerification(...args),
  },
  ID: {
    unique: () => 'unique-id',
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
  password: '',
  hash: '',
  hashOptions: {},
  mfa: false,
  targets: [],
}

const mockSession = {
  $id: 'session-123',
  $createdAt: '2024-01-01T00:00:00.000Z',
  userId: 'user-123',
  expire: '2024-01-08T00:00:00.000Z',
  provider: 'email',
  providerUid: 'test@example.com',
  providerAccessToken: '',
  providerAccessTokenExpiry: '',
  providerRefreshToken: '',
  ip: '127.0.0.1',
  osCode: 'LIN',
  osName: 'Linux',
  osVersion: '5.0',
  clientType: 'browser',
  clientCode: 'CH',
  clientName: 'Chrome',
  clientVersion: '100.0',
  clientEngine: 'Blink',
  clientEngineVersion: '',
  deviceName: 'Desktop',
  deviceBrand: '',
  deviceModel: '',
  countryCode: 'US',
  countryName: 'United States',
  current: true,
  factors: [],
  secret: '',
  mfaUpdatedAt: '',
}

describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createAccount', () => {
    it('should create a new account and login', async () => {
      mockAccount.create.mockResolvedValue(mockUser)
      mockAccount.createEmailPasswordSession.mockResolvedValue(mockSession)

      const result = await authService.createAccount(
        'test@example.com',
        'password123',
        'Test User'
      )

      expect(mockAccount.create).toHaveBeenCalledWith(
        'unique-id',
        'test@example.com',
        'password123',
        'Test User'
      )
      expect(mockAccount.createEmailPasswordSession).toHaveBeenCalledWith(
        'test@example.com',
        'password123'
      )
      expect(result).toEqual(mockUser)
    })

    it('should create account without name', async () => {
      mockAccount.create.mockResolvedValue({ ...mockUser, name: '' })
      mockAccount.createEmailPasswordSession.mockResolvedValue(mockSession)

      await authService.createAccount('test@example.com', 'password123')

      expect(mockAccount.create).toHaveBeenCalledWith(
        'unique-id',
        'test@example.com',
        'password123',
        undefined
      )
    })

    it('should throw error if account creation fails', async () => {
      const error = new Error('Account creation failed')
      mockAccount.create.mockRejectedValue(error)

      await expect(
        authService.createAccount('test@example.com', 'password123')
      ).rejects.toThrow('Account creation failed')
    })

    it('should throw error if login after creation fails', async () => {
      mockAccount.create.mockResolvedValue(mockUser)
      const error = new Error('Login failed')
      mockAccount.createEmailPasswordSession.mockRejectedValue(error)

      await expect(
        authService.createAccount('test@example.com', 'password123')
      ).rejects.toThrow('Login failed')
    })
  })

  describe('login', () => {
    it('should create email password session', async () => {
      mockAccount.createEmailPasswordSession.mockResolvedValue(mockSession)

      const result = await authService.login('test@example.com', 'password123')

      expect(mockAccount.createEmailPasswordSession).toHaveBeenCalledWith(
        'test@example.com',
        'password123'
      )
      expect(result).toEqual(mockSession)
    })

    it('should throw error for invalid credentials', async () => {
      const error = new Error('Invalid credentials')
      mockAccount.createEmailPasswordSession.mockRejectedValue(error)

      await expect(
        authService.login('wrong@example.com', 'wrongpassword')
      ).rejects.toThrow('Invalid credentials')
    })

    it('should handle empty email', async () => {
      const error = new Error('Email is required')
      mockAccount.createEmailPasswordSession.mockRejectedValue(error)

      await expect(authService.login('', 'password123')).rejects.toThrow(
        'Email is required'
      )
    })

    it('should handle empty password', async () => {
      const error = new Error('Password is required')
      mockAccount.createEmailPasswordSession.mockRejectedValue(error)

      await expect(
        authService.login('test@example.com', '')
      ).rejects.toThrow('Password is required')
    })
  })

  describe('logout', () => {
    it('should delete current session', async () => {
      mockAccount.deleteSession.mockResolvedValue({})

      await authService.logout()

      expect(mockAccount.deleteSession).toHaveBeenCalledWith('current')
    })

    it('should throw error if logout fails', async () => {
      const error = new Error('Logout failed')
      mockAccount.deleteSession.mockRejectedValue(error)

      await expect(authService.logout()).rejects.toThrow('Logout failed')
    })
  })

  describe('deleteCurrentSession', () => {
    it('should delete current session', async () => {
      mockAccount.deleteSession.mockResolvedValue({})

      await authService.deleteCurrentSession()

      expect(mockAccount.deleteSession).toHaveBeenCalledWith('current')
    })
  })

  describe('hasActiveSession', () => {
    it('should return true when user has active session', async () => {
      mockAccount.get.mockResolvedValue(mockUser)

      const result = await authService.hasActiveSession()

      expect(result).toBe(true)
      expect(mockAccount.get).toHaveBeenCalled()
    })

    it('should return false when no active session', async () => {
      mockAccount.get.mockRejectedValue(new Error('No session'))

      const result = await authService.hasActiveSession()

      expect(result).toBe(false)
    })

    it('should return false on any error', async () => {
      mockAccount.get.mockRejectedValue(new Error('Network error'))

      const result = await authService.hasActiveSession()

      expect(result).toBe(false)
    })
  })

  describe('getCurrentUser', () => {
    it('should return current user', async () => {
      mockAccount.get.mockResolvedValue(mockUser)

      const result = await authService.getCurrentUser()

      expect(result).toEqual(mockUser)
      expect(mockAccount.get).toHaveBeenCalled()
    })

    it('should return null when no user', async () => {
      mockAccount.get.mockRejectedValue(new Error('Not authenticated'))

      const result = await authService.getCurrentUser()

      expect(result).toBeNull()
    })

    it('should return null on any error', async () => {
      mockAccount.get.mockRejectedValue(new Error('Server error'))

      const result = await authService.getCurrentUser()

      expect(result).toBeNull()
    })
  })

  describe('updateName', () => {
    it('should update user name', async () => {
      const updatedUser = { ...mockUser, name: 'New Name' }
      mockAccount.updateName.mockResolvedValue(updatedUser)

      const result = await authService.updateName('New Name')

      expect(mockAccount.updateName).toHaveBeenCalledWith('New Name')
      expect(result.name).toBe('New Name')
    })

    it('should handle empty name', async () => {
      const updatedUser = { ...mockUser, name: '' }
      mockAccount.updateName.mockResolvedValue(updatedUser)

      const result = await authService.updateName('')

      expect(mockAccount.updateName).toHaveBeenCalledWith('')
      expect(result.name).toBe('')
    })

    it('should throw error if update fails', async () => {
      mockAccount.updateName.mockRejectedValue(new Error('Update failed'))

      await expect(authService.updateName('New Name')).rejects.toThrow(
        'Update failed'
      )
    })
  })

  describe('updateEmail', () => {
    it('should update user email with password verification', async () => {
      const updatedUser = { ...mockUser, email: 'new@example.com' }
      mockAccount.updateEmail.mockResolvedValue(updatedUser)

      const result = await authService.updateEmail(
        'new@example.com',
        'password123'
      )

      expect(mockAccount.updateEmail).toHaveBeenCalledWith(
        'new@example.com',
        'password123'
      )
      expect(result.email).toBe('new@example.com')
    })

    it('should throw error for wrong password', async () => {
      mockAccount.updateEmail.mockRejectedValue(
        new Error('Invalid password')
      )

      await expect(
        authService.updateEmail('new@example.com', 'wrongpassword')
      ).rejects.toThrow('Invalid password')
    })

    it('should throw error for invalid email format', async () => {
      mockAccount.updateEmail.mockRejectedValue(
        new Error('Invalid email format')
      )

      await expect(
        authService.updateEmail('invalid-email', 'password123')
      ).rejects.toThrow('Invalid email format')
    })
  })

  describe('updatePassword', () => {
    it('should update password with old password verification', async () => {
      mockAccount.updatePassword.mockResolvedValue(mockUser)

      const result = await authService.updatePassword(
        'newpassword123',
        'oldpassword123'
      )

      expect(mockAccount.updatePassword).toHaveBeenCalledWith(
        'newpassword123',
        'oldpassword123'
      )
      expect(result).toEqual(mockUser)
    })

    it('should throw error for wrong old password', async () => {
      mockAccount.updatePassword.mockRejectedValue(
        new Error('Invalid credentials')
      )

      await expect(
        authService.updatePassword('newpassword123', 'wrongoldpassword')
      ).rejects.toThrow('Invalid credentials')
    })

    it('should throw error for weak new password', async () => {
      mockAccount.updatePassword.mockRejectedValue(
        new Error('Password too weak')
      )

      await expect(
        authService.updatePassword('123', 'oldpassword123')
      ).rejects.toThrow('Password too weak')
    })
  })

  describe('createPasswordRecovery', () => {
    it('should create password recovery request', async () => {
      const recoveryToken = { $id: 'recovery-123' }
      mockAccount.createRecovery.mockResolvedValue(recoveryToken)

      const result = await authService.createPasswordRecovery(
        'test@example.com',
        'https://example.com/reset'
      )

      expect(mockAccount.createRecovery).toHaveBeenCalledWith(
        'test@example.com',
        'https://example.com/reset'
      )
      expect(result).toEqual(recoveryToken)
    })

    it('should throw error for non-existent email', async () => {
      mockAccount.createRecovery.mockRejectedValue(
        new Error('User not found')
      )

      await expect(
        authService.createPasswordRecovery(
          'nonexistent@example.com',
          'https://example.com/reset'
        )
      ).rejects.toThrow('User not found')
    })
  })

  describe('confirmPasswordRecovery', () => {
    it('should confirm password recovery', async () => {
      mockAccount.updateRecovery.mockResolvedValue({})

      await authService.confirmPasswordRecovery(
        'user-123',
        'secret-token',
        'newpassword123'
      )

      expect(mockAccount.updateRecovery).toHaveBeenCalledWith(
        'user-123',
        'secret-token',
        'newpassword123'
      )
    })

    it('should throw error for invalid secret', async () => {
      mockAccount.updateRecovery.mockRejectedValue(
        new Error('Invalid secret')
      )

      await expect(
        authService.confirmPasswordRecovery(
          'user-123',
          'invalid-secret',
          'newpassword123'
        )
      ).rejects.toThrow('Invalid secret')
    })

    it('should throw error for expired token', async () => {
      mockAccount.updateRecovery.mockRejectedValue(
        new Error('Token expired')
      )

      await expect(
        authService.confirmPasswordRecovery(
          'user-123',
          'expired-token',
          'newpassword123'
        )
      ).rejects.toThrow('Token expired')
    })
  })

  describe('createEmailVerification', () => {
    it('should create email verification request', async () => {
      const verificationToken = { $id: 'verification-123' }
      mockAccount.createVerification.mockResolvedValue(verificationToken)

      const result = await authService.createEmailVerification(
        'https://example.com/verify'
      )

      expect(mockAccount.createVerification).toHaveBeenCalledWith(
        'https://example.com/verify'
      )
      expect(result).toEqual(verificationToken)
    })

    it('should throw error if not authenticated', async () => {
      mockAccount.createVerification.mockRejectedValue(
        new Error('Not authenticated')
      )

      await expect(
        authService.createEmailVerification('https://example.com/verify')
      ).rejects.toThrow('Not authenticated')
    })
  })

  describe('confirmEmailVerification', () => {
    it('should confirm email verification', async () => {
      mockAccount.updateVerification.mockResolvedValue({})

      await authService.confirmEmailVerification('user-123', 'secret-token')

      expect(mockAccount.updateVerification).toHaveBeenCalledWith(
        'user-123',
        'secret-token'
      )
    })

    it('should throw error for invalid secret', async () => {
      mockAccount.updateVerification.mockRejectedValue(
        new Error('Invalid verification secret')
      )

      await expect(
        authService.confirmEmailVerification('user-123', 'invalid-secret')
      ).rejects.toThrow('Invalid verification secret')
    })

    it('should throw error for already verified email', async () => {
      mockAccount.updateVerification.mockRejectedValue(
        new Error('Email already verified')
      )

      await expect(
        authService.confirmEmailVerification('user-123', 'secret-token')
      ).rejects.toThrow('Email already verified')
    })
  })
})

describe('authService edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('special characters handling', () => {
    it('should handle email with special characters', async () => {
      mockAccount.createEmailPasswordSession.mockResolvedValue(mockSession)

      await authService.login('test+special@example.com', 'password123')

      expect(mockAccount.createEmailPasswordSession).toHaveBeenCalledWith(
        'test+special@example.com',
        'password123'
      )
    })

    it('should handle name with unicode characters', async () => {
      const unicodeName = '用户名 José 🚀'
      const updatedUser = { ...mockUser, name: unicodeName }
      mockAccount.updateName.mockResolvedValue(updatedUser)

      const result = await authService.updateName(unicodeName)

      expect(result.name).toBe(unicodeName)
    })

    it('should handle password with special characters', async () => {
      mockAccount.createEmailPasswordSession.mockResolvedValue(mockSession)

      await authService.login('test@example.com', 'P@ssw0rd!#$%^&*()')

      expect(mockAccount.createEmailPasswordSession).toHaveBeenCalledWith(
        'test@example.com',
        'P@ssw0rd!#$%^&*()'
      )
    })
  })

  describe('network errors', () => {
    it('should propagate network errors on create account', async () => {
      mockAccount.create.mockRejectedValue(new Error('Network error'))

      await expect(
        authService.createAccount('test@example.com', 'password123')
      ).rejects.toThrow('Network error')
    })

    it('should handle timeout errors', async () => {
      mockAccount.get.mockRejectedValue(new Error('Request timeout'))

      const result = await authService.getCurrentUser()

      expect(result).toBeNull()
    })
  })

  describe('concurrent operations', () => {
    it('should handle multiple concurrent login attempts', async () => {
      mockAccount.createEmailPasswordSession.mockResolvedValue(mockSession)

      const promises = [
        authService.login('user1@example.com', 'password1'),
        authService.login('user2@example.com', 'password2'),
        authService.login('user3@example.com', 'password3'),
      ]

      const results = await Promise.all(promises)

      expect(results).toHaveLength(3)
      expect(mockAccount.createEmailPasswordSession).toHaveBeenCalledTimes(3)
    })

    it('should handle concurrent get current user calls', async () => {
      mockAccount.get.mockResolvedValue(mockUser)

      const promises = [
        authService.getCurrentUser(),
        authService.getCurrentUser(),
        authService.getCurrentUser(),
      ]

      const results = await Promise.all(promises)

      expect(results.every((r) => r?.$id === mockUser.$id)).toBe(true)
    })
  })

  describe('long inputs', () => {
    it('should handle very long name', async () => {
      const longName = 'A'.repeat(1000)
      mockAccount.updateName.mockResolvedValue({ ...mockUser, name: longName })

      const result = await authService.updateName(longName)

      expect(mockAccount.updateName).toHaveBeenCalledWith(longName)
      expect(result.name).toBe(longName)
    })

    it('should handle very long email', async () => {
      const longEmail = 'a'.repeat(100) + '@example.com'
      mockAccount.createEmailPasswordSession.mockResolvedValue(mockSession)

      await authService.login(longEmail, 'password123')

      expect(mockAccount.createEmailPasswordSession).toHaveBeenCalledWith(
        longEmail,
        'password123'
      )
    })
  })
})
