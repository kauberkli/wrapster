import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import Login from '@/pages/Login'

describe('Login', () => {
  it('should render the login page', () => {
    render(<Login />)
    expect(screen.getByText('Login')).toBeInTheDocument()
  })

  it('should render a div element', () => {
    const { container } = render(<Login />)
    expect(container.querySelector('div')).toBeInTheDocument()
  })
})
