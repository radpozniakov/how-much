import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Topic } from './Topic'

describe('Topic', () => {
  it('renders the current item when set', () => {
    render(<Topic currentItem="Login page redesign" />)
    expect(screen.getByText('Login page redesign')).toBeInTheDocument()
  })

  it('shows a placeholder when there is no topic', () => {
    render(<Topic currentItem={null} />)
    expect(screen.getByText(/waiting for the host/i)).toBeInTheDocument()
  })
})
