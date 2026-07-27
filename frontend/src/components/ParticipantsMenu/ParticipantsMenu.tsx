import { useEffect, useId, useRef, useState } from 'react'
import type { FC, FocusEvent, KeyboardEvent } from 'react'
import type { Participant } from '../../types'
import {
  CheckMarkIcon,
  CloseIcon,
  CrownIcon,
  UserMinusIcon,
  UsersIcon,
} from '../icons'

type RowAction = 'transfer' | 'remove'

interface Armed {
  id: string
  action: RowAction
}

type Slot = 'first' | 'second'

interface ActionSpec {
  idle: string
  confirm: string
  Glyph: typeof CrownIcon
  home: Slot
}

const ACTIONS: Record<RowAction, ActionSpec> = {
  transfer: {
    idle: 'Make host',
    confirm: 'Confirm handover',
    Glyph: CrownIcon,
    home: 'first',
  },
  remove: {
    idle: 'Remove from room',
    confirm: 'Confirm removal',
    Glyph: UserMinusIcon,
    home: 'second',
  },
}

const IDLE_ACTION: Record<Slot, RowAction> = {
  first: 'transfer',
  second: 'remove',
}

export interface ParticipantsMenuProps {
  participants: Participant[]
  currentParticipantId: string
  hostId: string
  onTransferHost: (targetId: string) => void
  onRemoveParticipant: (targetId: string) => void
  disabled?: boolean
}

export const ParticipantsMenu: FC<ParticipantsMenuProps> = ({
  participants,
  currentParticipantId,
  hostId,
  onTransferHost,
  onRemoveParticipant,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [armed, setArmed] = useState<Armed | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const disarmedBy = useRef<'cancel' | 'confirm'>('cancel')
  const titleId = useId()
  const panelId = useId()

  useEffect(() => {
    if (isOpen) panelRef.current?.focus()
  }, [isOpen])

  function close() {
    setIsOpen(false)
    setArmed(null)
  }

  function disarm() {
    disarmedBy.current = 'cancel'
    setArmed(null)
  }

  useEffect(() => {
    if (!isOpen) return

    function onKeyDown(e: KeyboardEvent | globalThis.KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (armed !== null) {
        disarm()
        return
      }
      close()
      triggerRef.current?.focus()
    }

    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) close()
    }

    document.addEventListener('keydown', onKeyDown as EventListener)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown as EventListener)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [isOpen, armed])

  const disarmed = useRef<Armed | null>(null)
  useEffect(() => {
    const previous = disarmed.current
    disarmed.current = armed
    if (!isOpen) return
    const panel = panelRef.current
    if (panel === null) return

    if (armed !== null) {
      panel.querySelector<HTMLButtonElement>('[data-row-confirm]')?.focus()
      return
    }
    if (previous === null) return
    if (disarmedBy.current === 'confirm') {
      panel.focus()
      return
    }
    panel
      .querySelector<HTMLButtonElement>(
        `[data-participant-id="${previous.id}"] [data-slot="${ACTIONS[previous.action].home}"]`,
      )
      ?.focus()
  }, [armed, isOpen])

  function handleBlur(e: FocusEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget)) close()
  }

  function handlePanelKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const actions = Array.from(
      panelRef.current?.querySelectorAll<HTMLButtonElement>(
        '[data-row-action]:not([disabled])',
      ) ?? [],
    )
    if (actions.length === 0) return
    e.preventDefault()
    const at = actions.indexOf(document.activeElement as HTMLButtonElement)
    const step = e.key === 'ArrowDown' ? 1 : -1
    const next =
      at === -1
        ? step === 1
          ? 0
          : actions.length - 1
        : (at + step + actions.length) % actions.length
    actions[next].focus()
  }

  const host = participants.find((p) => p.id === hostId)
  const ordered = host
    ? [host, ...participants.filter((p) => p.id !== hostId)]
    : participants

  function handleAction(id: string, action: RowAction) {
    if (armed?.id !== id || armed.action !== action) {
      setArmed({ id, action })
      return
    }
    disarmedBy.current = 'confirm'
    setArmed(null)
    if (action === 'transfer') onTransferHost(id)
    else onRemoveParticipant(id)
  }

  function slot(where: Slot, id: string, armedHere: RowAction | null) {
    const role =
      armedHere === null ? 'action' : where === 'first' ? 'cancel' : 'confirm'
    const action = armedHere ?? IDLE_ACTION[where]
    const spec = ACTIONS[action]

    const label =
      role === 'cancel'
        ? 'Cancel'
        : role === 'confirm'
          ? spec.confirm
          : spec.idle
    const Glyph =
      role === 'cancel'
        ? CloseIcon
        : role === 'confirm'
          ? CheckMarkIcon
          : spec.Glyph
    return (
      <button
        type="button"
        data-row-action
        data-row-confirm={role === 'confirm' ? '' : undefined}
        data-slot={where}
        className={
          `icon-btn participants-menu__row-action participants-menu__row-action--${where}` +
          (role === 'cancel' ? ' participants-menu__row-cancel' : '')
        }
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={role === 'cancel' ? disarm : () => handleAction(id, action)}
      >
        <Glyph />
      </button>
    )
  }

  return (
    <div className="participants-menu" ref={rootRef} onBlur={handleBlur}>
      <button
        type="button"
        ref={triggerRef}
        className="icon-btn"
        aria-label="Room participants"
        title="Room participants"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        onClick={() => (isOpen ? close() : setIsOpen(true))}
      >
        <UsersIcon />
      </button>

      {isOpen && (
        <div
          className="participants-menu__panel"
          id={panelId}
          ref={panelRef}
          tabIndex={-1}
          role="group"
          aria-labelledby={titleId}
          onKeyDown={handlePanelKeyDown}
        >
          <p className="participants-menu__title">
            <span id={titleId}>Participants</span>
            <span
              className="participants-menu__count"
              aria-label={`${participants.length} in the room`}
            >
              {participants.length}
            </span>
          </p>
          <ul className="participants-menu__list">
            {ordered.map((p) => {
              const isSelf = p.id === currentParticipantId
              const isHost = p.id === hostId
              const armedHere = armed?.id === p.id ? armed.action : null
              return (
                <li
                  key={p.id}
                  className={
                    'participants-menu__item' +
                    (isHost ? ' participants-menu__item--host' : '')
                  }
                  data-participant-id={p.id}
                >
                  <span className="participants-menu__name">{p.name}</span>
                  {isSelf && (
                    <span className="participants-menu__badge">me</span>
                  )}
                  {isHost && (
                    <span className="participants-menu__badge">host</span>
                  )}
                  {!isSelf && (
                    <>
                      {slot('first', p.id, armedHere)}
                      {slot('second', p.id, armedHere)}
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
