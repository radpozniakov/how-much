import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ShareLink } from './ShareLink'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ShareLink', () => {
  it('shows the room URL in a readonly input', () => {
    render(<ShareLink code="ABCDEF" />)
    expect(screen.getByDisplayValue(/\/room\/ABCDEF$/)).toBeInTheDocument()
  })

  it('copies the link and confirms', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    render(<ShareLink code="ABCDEF" />)
    fireEvent.click(screen.getByRole('button', { name: /copy link/i }))
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('/room/ABCDEF'),
    )
    expect(
      await screen.findByRole('button', { name: /copied/i }),
    ).toBeInTheDocument()
  })
})
