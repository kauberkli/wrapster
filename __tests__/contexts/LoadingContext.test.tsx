import { act, render, renderHook, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { LoadingProvider, useLoading } from '@/contexts/LoadingContext'

describe('LoadingProvider', () => {
  it('should render children', () => {
    render(
      <LoadingProvider>
        <div data-testid="child">Child content</div>
      </LoadingProvider>
    )
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('should not show spinner when not loading', () => {
    render(
      <LoadingProvider>
        <div>Content</div>
      </LoadingProvider>
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('useLoading', () => {
  it('should throw error when used outside LoadingProvider', () => {
    expect(() => {
      renderHook(() => useLoading())
    }).toThrow('useLoading must be used within a LoadingProvider')
  })

  it('should return loading state and methods', () => {
    const { result } = renderHook(() => useLoading(), {
      wrapper: LoadingProvider,
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.loadingMessage).toBeNull()
    expect(typeof result.current.startLoading).toBe('function')
    expect(typeof result.current.stopLoading).toBe('function')
    expect(typeof result.current.setLoading).toBe('function')
  })

  it('should start loading without message', () => {
    const { result } = renderHook(() => useLoading(), {
      wrapper: LoadingProvider,
    })

    act(() => {
      result.current.startLoading()
    })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.loadingMessage).toBeNull()
  })

  it('should start loading with message', () => {
    const { result } = renderHook(() => useLoading(), {
      wrapper: LoadingProvider,
    })

    act(() => {
      result.current.startLoading('Loading data...')
    })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.loadingMessage).toBe('Loading data...')
  })

  it('should stop loading', () => {
    const { result } = renderHook(() => useLoading(), {
      wrapper: LoadingProvider,
    })

    act(() => {
      result.current.startLoading('Loading...')
    })

    expect(result.current.isLoading).toBe(true)

    act(() => {
      result.current.stopLoading()
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.loadingMessage).toBeNull()
  })

  it('should set loading with setLoading(true)', () => {
    const { result } = renderHook(() => useLoading(), {
      wrapper: LoadingProvider,
    })

    act(() => {
      result.current.setLoading(true, 'Saving...')
    })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.loadingMessage).toBe('Saving...')
  })

  it('should set loading with setLoading(false)', () => {
    const { result } = renderHook(() => useLoading(), {
      wrapper: LoadingProvider,
    })

    act(() => {
      result.current.setLoading(true, 'Loading...')
    })

    act(() => {
      result.current.setLoading(false)
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.loadingMessage).toBeNull()
  })
})

describe('LoadingProvider spinner visibility', () => {
  it('should show spinner when loading starts', () => {
    function TestComponent() {
      const { startLoading } = useLoading()
      return (
        <button onClick={() => startLoading('Loading...')}>Start Loading</button>
      )
    }

    render(
      <LoadingProvider>
        <TestComponent />
      </LoadingProvider>
    )

    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    act(() => {
      screen.getByRole('button').click()
    })

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('should hide spinner when loading stops', () => {
    function TestComponent() {
      const { startLoading, stopLoading, isLoading } = useLoading()
      return (
        <>
          <button onClick={() => startLoading()}>Start</button>
          <button onClick={() => stopLoading()}>Stop</button>
          <span data-testid="status">{isLoading ? 'loading' : 'idle'}</span>
        </>
      )
    }

    render(
      <LoadingProvider>
        <TestComponent />
      </LoadingProvider>
    )

    act(() => {
      screen.getByText('Start').click()
    })

    expect(screen.getByRole('status')).toBeInTheDocument()

    act(() => {
      screen.getByText('Stop').click()
    })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
