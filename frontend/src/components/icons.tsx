import { Home, Copy, LogOut, CircleCheck } from 'lucide-react'
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

// The participant "voted" state uses a larger check-in-circle glyph.
export const CheckIcon = (props: IconProps) => <CircleCheck size={28} {...props} />
