import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { FullScreenSpinner, Spinner, SuspenseSpinner } from '@/components/ui/spinner'

describe('Spinner', () => {
  it('should render with default size', () => {
    render(<Spinner />)
    const spinner = screen.getByLabelText('Loading')
    expect(spinner).toBeInTheDocument()
    expect(spinner).toHaveClass('animate-spin')
  })

  it('should render with small size', () => {
    render(<Spinner size="sm" />)
    const spinner = screen.getByLabelText('Loading')
    expect(spinner).toHaveClass('size-4')
  })

  it('should render with medium size', () => {
    render(<Spinner size="md" />)
    const spinner = screen.getByLabelText('Loading')
    expect(spinner).toHaveClass('size-8')
  })

  it('should render with large size', () => {
    render(<Spinner size="lg" />)
    const spinner = screen.getByLabelText('Loading')
    expect(spinner).toHaveClass('size-12')
  })

  it('should apply custom className', () => {
    render(<Spinner className="custom-class" />)
    const spinner = screen.getByLabelText('Loading')
    expect(spinner).toHaveClass('custom-class')
  })
})

describe('FullScreenSpinner', () => {
  it('should render full screen overlay', () => {
    render(<FullScreenSpinner />)
    const overlay = screen.getByRole('status')
    expect(overlay).toBeInTheDocument()
    expect(overlay).toHaveClass('fixed', 'inset-0', 'z-50')
  })

  it('should render without message by default', () => {
    render(<FullScreenSpinner />)
    expect(screen.queryByText(/./)).toBeNull()
  })

  it('should render with message when provided', () => {
    render(<FullScreenSpinner message="Loading data..." />)
    expect(screen.getByText('Loading data...')).toBeInTheDocument()
  })

  it('should have backdrop blur', () => {
    render(<FullScreenSpinner />)
    const overlay = screen.getByRole('status')
    expect(overlay).toHaveClass('backdrop-blur-sm')
  })

  it('should be accessible with aria-live', () => {
    render(<FullScreenSpinner />)
    const overlay = screen.getByRole('status')
    expect(overlay).toHaveAttribute('aria-live', 'polite')
  })
})

describe('SuspenseSpinner', () => {
  it('should render full screen overlay', () => {
    render(<SuspenseSpinner />)
    const overlay = screen.getByRole('status')
    expect(overlay).toBeInTheDocument()
    expect(overlay).toHaveClass('fixed', 'inset-0', 'z-50')
  })

  it('should display "Loading page..." message', () => {
    render(<SuspenseSpinner />)
    expect(screen.getByText('Loading page...')).toBeInTheDocument()
  })

  it('should be accessible with aria-live', () => {
    render(<SuspenseSpinner />)
    const overlay = screen.getByRole('status')
    expect(overlay).toHaveAttribute('aria-live', 'polite')
  })
})
