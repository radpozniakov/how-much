import {
  Home,
  Copy,
  LogOut,
  Check,
  CircleCheck,
  Crown,
  UserMinus,
  Users,
  X,
} from 'lucide-react'
import type { LucideProps } from 'lucide-react'

// Central icon module. We use lucide-react for consistent, battle-tested outline
// glyphs; these thin aliases keep call sites decoupled from the icon library and
// pin the project sizing defaults used across the UI. currentColor stroke is
// lucide's default, so they still invert on hover with the icon button.
export type IconProps = LucideProps

// Icon-button glyphs default to 18px to match the previous hand-rolled SVGs.
export const HomeIcon = (props: IconProps) => <Home size={18} {...props} />
export const CopyIcon = (props: IconProps) => <Copy size={18} {...props} />
export const ExitIcon = (props: IconProps) => <LogOut size={18} {...props} />
export const UsersIcon = (props: IconProps) => <Users size={18} {...props} />

// Roster row actions (FR-20, FR-21): a crown for "make host", a person-minus for
// "remove from room", and the bare check / cross for the two-step confirm. Distinct
// from CheckIcon below, which is the 28px card-face glyph — these are icon-button
// sized.
export const CrownIcon = (props: IconProps) => <Crown size={18} {...props} />
// UserMinus rather than a trash can: removal takes someone out of *this room* and
// deletes nothing — they keep the code and can rejoin (D-15). A trash glyph would
// promise the ban that V2 explicitly is not.
export const UserMinusIcon = (props: IconProps) => (
  <UserMinus size={18} {...props} />
)
export const CheckMarkIcon = (props: IconProps) => (
  <Check size={18} {...props} />
)
export const CloseIcon = (props: IconProps) => <X size={18} {...props} />

// The participant "voted" state uses a larger check-in-circle glyph.
export const CheckIcon = (props: IconProps) => (
  <CircleCheck size={28} {...props} />
)
