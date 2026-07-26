import type { FC } from 'react'

// The two participant-view modes swapped by the segment control. The stats view
// content itself is S18; here the control only owns the toggle.
export type RoomView = 'cards' | 'stats'

export interface ViewSwitcherProps {
  view: RoomView
  onViewChange: (view: RoomView) => void
}

const SEGMENTS: { value: RoomView; label: string }[] = [
  { value: 'cards', label: 'Cards view' },
  { value: 'stats', label: 'Graph view' },
]

// A dedicated section (spec §Segment control) sitting above the stage: a
// centered two-item segment control that swaps the participant view between the
// cards grid and the stats/graph view.
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
