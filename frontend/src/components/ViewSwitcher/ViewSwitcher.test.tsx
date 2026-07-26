import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ViewSwitcher } from './ViewSwitcher'

describe('ViewSwitcher', () => {
  it('marks the active view tab and switches on click', async () => {
    const onViewChange = vi.fn()
    const user = userEvent.setup()
    render(<ViewSwitcher view="cards" onViewChange={onViewChange} />)

    const cards = screen.getByRole('tab', { name: 'Cards view' })
    const stats = screen.getByRole('tab', { name: 'Graph view' })
    expect(cards).toHaveAttribute('aria-selected', 'true')
    expect(stats).toHaveAttribute('aria-selected', 'false')

    await user.click(stats)
    expect(onViewChange).toHaveBeenCalledWith('stats')
  })

  it('reflects the stats view as active', () => {
    render(<ViewSwitcher view="stats" onViewChange={() => {}} />)
    expect(
      screen.getByRole('tab', { name: 'Graph view' }),
    ).toHaveAttribute('aria-selected', 'true')
  })
})
