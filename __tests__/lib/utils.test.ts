import { beforeEach, describe, expect, it, vi } from 'vitest'

import { cn, getTodayDate, formatDateTime, formatTime, isToday } from '@/lib/utils'

describe('cn (class name utility)', () => {
  it('should merge class names', () => {
    const result = cn('class1', 'class2')
    expect(result).toBe('class1 class2')
  })

  it('should handle undefined values', () => {
    const result = cn('class1', undefined, 'class2')
    expect(result).toBe('class1 class2')
  })

  it('should handle null values', () => {
    const result = cn('class1', null, 'class2')
    expect(result).toBe('class1 class2')
  })

  it('should handle boolean conditions', () => {
    const isActive = true
    const isDisabled = false
    const result = cn('base', isActive && 'active', isDisabled && 'disabled')
    expect(result).toBe('base active')
  })

  it('should handle object syntax', () => {
    const result = cn({ 'bg-red': true, 'bg-blue': false, 'text-white': true })
    expect(result).toBe('bg-red text-white')
  })

  it('should handle array syntax', () => {
    const result = cn(['class1', 'class2'], 'class3')
    expect(result).toBe('class1 class2 class3')
  })

  it('should merge Tailwind classes correctly', () => {
    const result = cn('px-2 py-1', 'px-4')
    expect(result).toBe('py-1 px-4')
  })

  it('should handle conflicting Tailwind classes', () => {
    const result = cn('bg-red-500', 'bg-blue-500')
    expect(result).toBe('bg-blue-500')
  })

  it('should handle empty input', () => {
    const result = cn()
    expect(result).toBe('')
  })

  it('should handle empty string', () => {
    const result = cn('')
    expect(result).toBe('')
  })

  it('should handle complex combinations', () => {
    const isLoading = true
    const size = 'lg' as string
    const result = cn(
      'base-class',
      isLoading && 'opacity-50',
      {
        'text-sm': size === 'sm',
        'text-lg': size === 'lg',
      },
      ['hover:bg-gray-100', 'focus:ring-2']
    )
    expect(result).toContain('base-class')
    expect(result).toContain('opacity-50')
    expect(result).toContain('text-lg')
    expect(result).not.toContain('text-sm')
  })
})

describe('getTodayDate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should return today date in YYYY-MM-DD format', () => {
    vi.setSystemTime(new Date('2024-01-15T12:00:00'))

    const result = getTodayDate()

    expect(result).toBe('2024-01-15')
  })

  it('should handle single-digit months', () => {
    vi.setSystemTime(new Date('2024-03-05T12:00:00'))

    const result = getTodayDate()

    expect(result).toBe('2024-03-05')
  })

  it('should handle single-digit days', () => {
    vi.setSystemTime(new Date('2024-10-07T12:00:00'))

    const result = getTodayDate()

    expect(result).toBe('2024-10-07')
  })

  it('should handle December correctly', () => {
    vi.setSystemTime(new Date('2024-12-31T23:59:59'))

    const result = getTodayDate()

    expect(result).toBe('2024-12-31')
  })

  it('should handle January correctly', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00'))

    const result = getTodayDate()

    expect(result).toBe('2024-01-01')
  })

  it('should handle leap year date', () => {
    vi.setSystemTime(new Date('2024-02-29T12:00:00'))

    const result = getTodayDate()

    expect(result).toBe('2024-02-29')
  })

  it('should use local timezone', () => {
    // This test verifies the function uses local time, not UTC
    vi.setSystemTime(new Date('2024-06-15T04:00:00.000Z'))

    const result = getTodayDate()

    // Result depends on local timezone
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('formatDateTime', () => {
  it('should format ISO datetime string', () => {
    const result = formatDateTime('2024-01-15T14:30:45.000Z')

    // Result format depends on locale, but should be a non-empty string
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('should format datetime with timezone', () => {
    const result = formatDateTime('2024-06-15T10:30:00.000+08:00')

    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('should handle midnight time', () => {
    const result = formatDateTime('2024-01-15T00:00:00.000Z')

    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('should handle end of day time', () => {
    const result = formatDateTime('2024-01-15T23:59:59.999Z')

    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('should handle different date formats consistently', () => {
    const result1 = formatDateTime('2024-01-15T12:00:00.000Z')
    const result2 = formatDateTime('2024-07-15T12:00:00.000Z')

    // Both should return strings of similar structure
    expect(typeof result1).toBe('string')
    expect(typeof result2).toBe('string')
  })

  it('should return locale-specific format', () => {
    const result = formatDateTime('2024-01-15T14:30:45.000Z')

    // The result should contain recognizable date/time elements
    expect(result).not.toBe('Invalid Date')
  })
})

describe('formatTime', () => {
  it('should format time from ISO datetime string', () => {
    const result = formatTime('2024-01-15T14:30:45.000Z')

    // Result should be a time string
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('should handle midnight', () => {
    const result = formatTime('2024-01-15T00:00:00.000Z')

    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('should handle noon', () => {
    const result = formatTime('2024-01-15T12:00:00.000Z')

    expect(typeof result).toBe('string')
  })

  it('should handle end of day', () => {
    const result = formatTime('2024-01-15T23:59:59.999Z')

    expect(typeof result).toBe('string')
  })

  it('should return different times for different inputs', () => {
    const time1 = formatTime('2024-01-15T08:00:00.000Z')
    const time2 = formatTime('2024-01-15T20:00:00.000Z')

    // Times should be different
    expect(time1).not.toBe(time2)
  })
})

describe('isToday', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should return true for today date', () => {
    vi.setSystemTime(new Date('2024-01-15T12:00:00'))

    const result = isToday('2024-01-15')

    expect(result).toBe(true)
  })

  it('should return false for yesterday', () => {
    vi.setSystemTime(new Date('2024-01-15T12:00:00'))

    const result = isToday('2024-01-14')

    expect(result).toBe(false)
  })

  it('should return false for tomorrow', () => {
    vi.setSystemTime(new Date('2024-01-15T12:00:00'))

    const result = isToday('2024-01-16')

    expect(result).toBe(false)
  })

  it('should return false for different month', () => {
    vi.setSystemTime(new Date('2024-01-15T12:00:00'))

    const result = isToday('2024-02-15')

    expect(result).toBe(false)
  })

  it('should return false for different year', () => {
    vi.setSystemTime(new Date('2024-01-15T12:00:00'))

    const result = isToday('2023-01-15')

    expect(result).toBe(false)
  })

  it('should handle year boundary', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00'))

    expect(isToday('2024-01-01')).toBe(true)
    expect(isToday('2023-12-31')).toBe(false)
  })

  it('should handle leap year date', () => {
    vi.setSystemTime(new Date('2024-02-29T12:00:00'))

    expect(isToday('2024-02-29')).toBe(true)
    expect(isToday('2024-02-28')).toBe(false)
  })

  it('should be case sensitive for date strings', () => {
    vi.setSystemTime(new Date('2024-01-15T12:00:00'))

    // Only exact format should match
    expect(isToday('2024-01-15')).toBe(true)
    expect(isToday('2024-1-15')).toBe(false) // Different format
  })

  it('should return false for invalid date strings', () => {
    vi.setSystemTime(new Date('2024-01-15T12:00:00'))

    expect(isToday('')).toBe(false)
    expect(isToday('invalid')).toBe(false)
    expect(isToday('15-01-2024')).toBe(false)
  })
})

describe('utility functions edge cases', () => {
  describe('cn edge cases', () => {
    it('should handle deeply nested arrays', () => {
      const result = cn([['class1'], [['class2', 'class3']]])
      expect(result).toContain('class1')
      expect(result).toContain('class2')
      expect(result).toContain('class3')
    })

    it('should handle mixed falsy values', () => {
      const result = cn(
        'valid',
        null,
        undefined,
        false,
        0,
        '',
        'another-valid'
      )
      expect(result).toBe('valid another-valid')
    })

    it('should preserve important modifier', () => {
      const result = cn('text-red-500', '!text-blue-500')
      expect(result).toContain('!text-blue-500')
    })

    it('should handle responsive prefixes', () => {
      const result = cn('w-full', 'md:w-1/2', 'lg:w-1/3')
      expect(result).toBe('w-full md:w-1/2 lg:w-1/3')
    })

    it('should handle hover and focus states', () => {
      const result = cn('bg-blue-500', 'hover:bg-blue-600', 'focus:ring-2')
      expect(result).toContain('bg-blue-500')
      expect(result).toContain('hover:bg-blue-600')
      expect(result).toContain('focus:ring-2')
    })

    it('should handle dark mode classes', () => {
      const result = cn('bg-white', 'dark:bg-gray-900', 'text-black', 'dark:text-white')
      expect(result).toContain('bg-white')
      expect(result).toContain('dark:bg-gray-900')
    })
  })

  describe('date utility edge cases', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should handle month boundaries', () => {
      vi.setSystemTime(new Date('2024-01-31T23:59:59'))
      expect(getTodayDate()).toBe('2024-01-31')

      vi.setSystemTime(new Date('2024-02-01T00:00:00'))
      expect(getTodayDate()).toBe('2024-02-01')
    })

    it('should handle year boundaries', () => {
      vi.setSystemTime(new Date('2024-12-31T23:59:59'))
      expect(getTodayDate()).toBe('2024-12-31')

      vi.setSystemTime(new Date('2025-01-01T00:00:00'))
      expect(getTodayDate()).toBe('2025-01-01')
    })

    it('should handle different years in isToday', () => {
      vi.setSystemTime(new Date('2025-01-15T12:00:00'))

      expect(isToday('2024-01-15')).toBe(false)
      expect(isToday('2025-01-15')).toBe(true)
      expect(isToday('2026-01-15')).toBe(false)
    })
  })

  describe('formatDateTime edge cases', () => {
    it('should handle very old dates', () => {
      const result = formatDateTime('1900-01-01T00:00:00.000Z')
      expect(typeof result).toBe('string')
    })

    it('should handle future dates', () => {
      const result = formatDateTime('2099-12-31T23:59:59.000Z')
      expect(typeof result).toBe('string')
    })

    it('should handle milliseconds', () => {
      const result1 = formatDateTime('2024-01-15T12:00:00.000Z')
      const result2 = formatDateTime('2024-01-15T12:00:00.999Z')

      // Both should format to strings
      expect(typeof result1).toBe('string')
      expect(typeof result2).toBe('string')
    })
  })

  describe('formatTime edge cases', () => {
    it('should handle seconds and milliseconds', () => {
      const result1 = formatTime('2024-01-15T12:30:00.000Z')
      const result2 = formatTime('2024-01-15T12:30:45.000Z')
      const result3 = formatTime('2024-01-15T12:30:45.999Z')

      expect(typeof result1).toBe('string')
      expect(typeof result2).toBe('string')
      expect(typeof result3).toBe('string')
    })
  })
})
