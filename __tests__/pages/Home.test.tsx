import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import Home from '@/pages/Home'

describe('Home', () => {
  it('should render the home page', () => {
    render(<Home />)
    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('should render a div element', () => {
    const { container } = render(<Home />)
    expect(container.querySelector('div')).toBeInTheDocument()
  })
})
