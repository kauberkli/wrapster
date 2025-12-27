import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useIsMobile } from '@/hooks/use-mobile'

describe('useIsMobile', () => {
  let matchMediaMock: {
    matches: boolean
    media: string
    addEventListener: ReturnType<typeof vi.fn>
    removeEventListener: ReturnType<typeof vi.fn>
  }
  let resizeHandler: (() => void) | null = null

  beforeEach(() => {
    resizeHandler = null
    matchMediaMock = {
      matches: false,
      media: '',
      addEventListener: vi.fn((_, handler) => {
        resizeHandler = handler
      }),
      removeEventListener: vi.fn(),
    }

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => matchMediaMock),
    })

    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      value: 1024,
    })
  })

  it('should return false for desktop width', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })

    const { result } = renderHook(() => useIsMobile())

    expect(result.current).toBe(false)
  })

  it('should return true for mobile width', () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, writable: true })

    const { result } = renderHook(() => useIsMobile())

    expect(result.current).toBe(true)
  })

  it('should return false at exactly 768px (breakpoint)', () => {
    Object.defineProperty(window, 'innerWidth', { value: 768, writable: true })

    const { result } = renderHook(() => useIsMobile())

    expect(result.current).toBe(false)
  })

  it('should return true at 767px (just below breakpoint)', () => {
    Object.defineProperty(window, 'innerWidth', { value: 767, writable: true })

    const { result } = renderHook(() => useIsMobile())

    expect(result.current).toBe(true)
  })

  it('should add event listener on mount', () => {
    renderHook(() => useIsMobile())

    expect(matchMediaMock.addEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function)
    )
  })

  it('should remove event listener on unmount', () => {
    const { unmount } = renderHook(() => useIsMobile())

    unmount()

    expect(matchMediaMock.removeEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function)
    )
  })

  it('should update when window resizes to mobile', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })

    const { result } = renderHook(() => useIsMobile())

    expect(result.current).toBe(false)

    // Simulate resize to mobile
    act(() => {
      Object.defineProperty(window, 'innerWidth', { value: 375, writable: true })
      resizeHandler?.()
    })

    expect(result.current).toBe(true)
  })

  it('should update when window resizes to desktop', () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, writable: true })

    const { result } = renderHook(() => useIsMobile())

    expect(result.current).toBe(true)

    // Simulate resize to desktop
    act(() => {
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })
      resizeHandler?.()
    })

    expect(result.current).toBe(false)
  })

  it('should handle multiple resize events', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })

    const { result } = renderHook(() => useIsMobile())

    // Desktop -> Mobile
    act(() => {
      Object.defineProperty(window, 'innerWidth', { value: 500, writable: true })
      resizeHandler?.()
    })
    expect(result.current).toBe(true)

    // Mobile -> Desktop
    act(() => {
      Object.defineProperty(window, 'innerWidth', { value: 900, writable: true })
      resizeHandler?.()
    })
    expect(result.current).toBe(false)

    // Desktop -> Mobile again
    act(() => {
      Object.defineProperty(window, 'innerWidth', { value: 320, writable: true })
      resizeHandler?.()
    })
    expect(result.current).toBe(true)
  })

  it('should call matchMedia with correct query', () => {
    renderHook(() => useIsMobile())

    expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 767px)')
  })

  it('should handle rapid resize events', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })

    const { result } = renderHook(() => useIsMobile())

    // Rapid resizing
    act(() => {
      for (let width = 1024; width >= 320; width -= 50) {
        Object.defineProperty(window, 'innerWidth', { value: width, writable: true })
        resizeHandler?.()
      }
    })

    // Final width is 324 (320 + 4 remaining), which is mobile
    expect(result.current).toBe(true)
  })
})

describe('useIsMobile edge cases', () => {
  beforeEach(() => {
    const matchMediaMock = {
      matches: false,
      media: '',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => matchMediaMock),
    })
  })

  it('should handle very small widths', () => {
    Object.defineProperty(window, 'innerWidth', { value: 100, writable: true })

    const { result } = renderHook(() => useIsMobile())

    expect(result.current).toBe(true)
  })

  it('should handle very large widths', () => {
    Object.defineProperty(window, 'innerWidth', { value: 3840, writable: true })

    const { result } = renderHook(() => useIsMobile())

    expect(result.current).toBe(false)
  })

  it('should handle width of 0', () => {
    Object.defineProperty(window, 'innerWidth', { value: 0, writable: true })

    const { result } = renderHook(() => useIsMobile())

    expect(result.current).toBe(true)
  })

  it('should return false for tablet width', () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, writable: true })

    const { result } = renderHook(() => useIsMobile())

    expect(result.current).toBe(false)
  })

  it('should handle common mobile device widths', () => {
    const mobileWidths = [320, 375, 390, 414, 428, 576]

    mobileWidths.forEach((width) => {
      Object.defineProperty(window, 'innerWidth', { value: width, writable: true })

      const { result } = renderHook(() => useIsMobile())

      expect(result.current).toBe(true)
    })
  })

  it('should handle common desktop device widths', () => {
    const desktopWidths = [768, 1024, 1280, 1440, 1920, 2560]

    desktopWidths.forEach((width) => {
      Object.defineProperty(window, 'innerWidth', { value: width, writable: true })

      const { result } = renderHook(() => useIsMobile())

      expect(result.current).toBe(false)
    })
  })
})
