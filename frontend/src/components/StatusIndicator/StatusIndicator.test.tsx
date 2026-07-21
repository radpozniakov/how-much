import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusIndicator } from './StatusIndicator'

describe('StatusIndicator', () => {
  it('labels a live connection', () => {
    render(<StatusIndicator status="live" />)
    expect(screen.getByText('live')).toBeInTheDocument()
  })

  it('labels a connecting state', () => {
    render(<StatusIndicator status="connecting" />)
    expect(screen.getByText(/connecting/i)).toBeInTheDocument()
  })

  it('labels a reconnecting state', () => {
    render(<StatusIndicator status="reconnecting" />)
    expect(screen.getByText(/reconnecting/i)).toBeInTheDocument()
  })
})
