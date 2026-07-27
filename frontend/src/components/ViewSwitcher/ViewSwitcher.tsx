import type { FC } from 'react'

export type RoomView = 'cards' | 'stats'

export interface ViewSwitcherProps {
  view: RoomView
  onViewChange: (view: RoomView) => void
}

const SEGMENTS: { value: RoomView; label: string }[] = [
  { value: 'cards', label: 'Cards view' },
  { value: 'stats', label: 'Graph view' },
]

export const ViewSwitcher: FC<ViewSwitcherProps> = ({ view, onViewChange }) => (
  <div className="view-switcher">
    <div className="segment" role="tablist" aria-label="Participant view">
      {SEGMENTS.map((seg) => (
        <button
          key={seg.value}
          type="button"
          role="tab"
          aria-selected={view === seg.value}
          className={`segment__item ${view === seg.value ? 'segment__item--active' : ''}`}
          onClick={() => onViewChange(seg.value)}
        >
          {seg.label}
        </button>
      ))}
    </div>
  </div>
)
