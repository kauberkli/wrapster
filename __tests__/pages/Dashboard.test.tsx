import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import Dashboard from '@/pages/Dashboard'

describe('Dashboard', () => {
  it('should render the dashboard page', () => {
    render(<Dashboard />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('should render a div element', () => {
    const { container } = render(<Dashboard />)
    expect(container.querySelector('div')).toBeInTheDocument()
  })
})
