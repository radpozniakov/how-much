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

export type IconProps = LucideProps

export const HomeIcon = (props: IconProps) => <Home size={18} {...props} />
export const CopyIcon = (props: IconProps) => <Copy size={18} {...props} />
export const ExitIcon = (props: IconProps) => <LogOut size={18} {...props} />
export const UsersIcon = (props: IconProps) => <Users size={18} {...props} />

export const CrownIcon = (props: IconProps) => <Crown size={18} {...props} />
export const UserMinusIcon = (props: IconProps) => (
  <UserMinus size={18} {...props} />
)
export const CheckMarkIcon = (props: IconProps) => (
  <Check size={18} {...props} />
)
export const CloseIcon = (props: IconProps) => <X size={18} {...props} />

export const CheckIcon = (props: IconProps) => (
  <CircleCheck size={28} {...props} />
)
