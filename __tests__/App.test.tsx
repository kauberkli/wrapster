import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import App from '@/App'

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('should render the app with loading fallback initially', () => {
    render(<App />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('should render home page after lazy loading', async () => {
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('Home')).toBeInTheDocument()
    })
  })

  it('should render within a BrowserRouter context', () => {
    const { container } = render(<App />)
    expect(container).toBeInTheDocument()
  })
})

describe('App routing', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.pushState({}, '', '/')
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('should display home page on root path', async () => {
    window.history.pushState({}, '', '/')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('Home')).toBeInTheDocument()
    })
  })

  it('should display login page on /login path', async () => {
    window.history.pushState({}, '', '/login')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('Login')).toBeInTheDocument()
    })
  })

  it('should redirect to login when accessing dashboard without auth', async () => {
    localStorage.removeItem('token')
    window.history.pushState({}, '', '/dashboard')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('Login')).toBeInTheDocument()
    })
  })

  it('should display dashboard when authenticated', async () => {
    localStorage.setItem('token', 'test-token')
    window.history.pushState({}, '', '/dashboard')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
    })
  })
})
