import { renderHook, act, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useDebounce } from '@/hooks/use-debounce'

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should return initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('initial', 500))

    expect(result.current).toBe('initial')
  })

  it('should not update value before delay', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 500 } }
    )

    rerender({ value: 'updated', delay: 500 })

    // Value should still be initial
    expect(result.current).toBe('initial')
  })

  it('should update value after delay', async () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 500 } }
    )

    rerender({ value: 'updated', delay: 500 })

    // Fast forward time
    act(() => {
      vi.advanceTimersByTime(500)
    })

    await waitFor(() => {
      expect(result.current).toBe('updated')
    })
  })

  it('should reset timer on new value', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 500 } }
    )

    // First update
    rerender({ value: 'first', delay: 500 })

    // Advance half the delay
    act(() => {
      vi.advanceTimersByTime(250)
    })

    // Second update (should reset the timer)
    rerender({ value: 'second', delay: 500 })

    // Advance another 250ms (total 500ms since first update)
    act(() => {
      vi.advanceTimersByTime(250)
    })

    // Should still be initial since timer was reset
    expect(result.current).toBe('initial')

    // Advance remaining time
    act(() => {
      vi.advanceTimersByTime(250)
    })

    // Now should be 'second'
    expect(result.current).toBe('second')
  })

  it('should handle rapid value changes', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'v0', delay: 300 } }
    )

    // Rapid changes
    for (let i = 1; i <= 10; i++) {
      rerender({ value: `v${i}`, delay: 300 })
      act(() => {
        vi.advanceTimersByTime(50)
      })
    }

    // Should still be initial after rapid changes
    expect(result.current).toBe('v0')

    // Wait for full delay after last change
    act(() => {
      vi.advanceTimersByTime(300)
    })

    // Should now be the last value
    expect(result.current).toBe('v10')
  })

  it('should work with different delay values', async () => {
    const { result: result100 } = renderHook(() => useDebounce('test', 100))
    const { result: result500 } = renderHook(() => useDebounce('test', 500))
    const { result: result1000 } = renderHook(() => useDebounce('test', 1000))

    // All should have initial value
    expect(result100.current).toBe('test')
    expect(result500.current).toBe('test')
    expect(result1000.current).toBe('test')
  })

  it('should handle zero delay', async () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 0 } }
    )

    rerender({ value: 'updated', delay: 0 })

    act(() => {
      vi.advanceTimersByTime(0)
    })

    await waitFor(() => {
      expect(result.current).toBe('updated')
    })
  })

  it('should work with number values', async () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 0, delay: 500 } }
    )

    rerender({ value: 42, delay: 500 })

    act(() => {
      vi.advanceTimersByTime(500)
    })

    await waitFor(() => {
      expect(result.current).toBe(42)
    })
  })

  it('should work with boolean values', async () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: false, delay: 500 } }
    )

    rerender({ value: true, delay: 500 })

    act(() => {
      vi.advanceTimersByTime(500)
    })

    await waitFor(() => {
      expect(result.current).toBe(true)
    })
  })

  it('should work with object values', async () => {
    const initialObj = { name: 'John', age: 30 }
    const updatedObj = { name: 'Jane', age: 25 }

    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: initialObj, delay: 500 } }
    )

    expect(result.current).toEqual(initialObj)

    rerender({ value: updatedObj, delay: 500 })

    act(() => {
      vi.advanceTimersByTime(500)
    })

    await waitFor(() => {
      expect(result.current).toEqual(updatedObj)
    })
  })

  it('should work with array values', async () => {
    const initialArr = [1, 2, 3]
    const updatedArr = [4, 5, 6]

    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: initialArr, delay: 500 } }
    )

    expect(result.current).toEqual(initialArr)

    rerender({ value: updatedArr, delay: 500 })

    act(() => {
      vi.advanceTimersByTime(500)
    })

    await waitFor(() => {
      expect(result.current).toEqual(updatedArr)
    })
  })

  it('should handle null values', async () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial' as string | null, delay: 500 } }
    )

    rerender({ value: null, delay: 500 })

    act(() => {
      vi.advanceTimersByTime(500)
    })

    await waitFor(() => {
      expect(result.current).toBeNull()
    })
  })

  it('should handle undefined values', async () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial' as string | undefined, delay: 500 } }
    )

    rerender({ value: undefined, delay: 500 })

    act(() => {
      vi.advanceTimersByTime(500)
    })

    await waitFor(() => {
      expect(result.current).toBeUndefined()
    })
  })

  it('should clean up timer on unmount', () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')

    const { unmount, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 500 } }
    )

    rerender({ value: 'updated', delay: 500 })
    unmount()

    expect(clearTimeoutSpy).toHaveBeenCalled()
  })

  it('should update when delay changes', async () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 500 } }
    )

    // Change both value and delay
    rerender({ value: 'updated', delay: 200 })

    act(() => {
      vi.advanceTimersByTime(200)
    })

    await waitFor(() => {
      expect(result.current).toBe('updated')
    })
  })
})

describe('useDebounce edge cases', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should handle very long delays', async () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 60000 } } // 1 minute
    )

    rerender({ value: 'updated', delay: 60000 })

    // Advance 30 seconds
    act(() => {
      vi.advanceTimersByTime(30000)
    })
    expect(result.current).toBe('initial')

    // Advance remaining 30 seconds
    act(() => {
      vi.advanceTimersByTime(30000)
    })

    await waitFor(() => {
      expect(result.current).toBe('updated')
    })
  })

  it('should handle empty string values', async () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 500 } }
    )

    rerender({ value: '', delay: 500 })

    act(() => {
      vi.advanceTimersByTime(500)
    })

    await waitFor(() => {
      expect(result.current).toBe('')
    })
  })

  it('should handle same value rerenders', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'same', delay: 500 } }
    )

    // Rerender with same value multiple times
    rerender({ value: 'same', delay: 500 })
    rerender({ value: 'same', delay: 500 })
    rerender({ value: 'same', delay: 500 })

    expect(result.current).toBe('same')
  })

  it('should handle complex object changes', async () => {
    const initial = { nested: { deep: { value: 1 } }, array: [1, 2, 3] }
    const updated = { nested: { deep: { value: 2 } }, array: [4, 5, 6] }

    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: initial, delay: 500 } }
    )

    rerender({ value: updated, delay: 500 })

    act(() => {
      vi.advanceTimersByTime(500)
    })

    await waitFor(() => {
      expect(result.current).toEqual(updated)
    })
  })

  it('should handle function values', async () => {
    const fn1 = () => 'function1'
    const fn2 = () => 'function2'

    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: fn1, delay: 500 } }
    )

    rerender({ value: fn2, delay: 500 })

    act(() => {
      vi.advanceTimersByTime(500)
    })

    await waitFor(() => {
      expect(result.current()).toBe('function2')
    })
  })

  it('should maintain reference equality until debounced', () => {
    const obj = { key: 'value' }
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: obj, delay: 500 } }
    )

    // Reference should be the same
    expect(result.current).toBe(obj)

    const newObj = { key: 'new value' }
    rerender({ value: newObj, delay: 500 })

    // Should still be old reference before debounce
    expect(result.current).toBe(obj)
  })
})
