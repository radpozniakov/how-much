# TypeScript Patterns

Use these examples as patterns, adapting names and module settings to the project.

## Inference and API boundaries

```ts
const displayName = 'John' // infer obvious local values

export interface User {
  id: string
  name: string
  email?: string
}

export function formatUserName(user: User): string {
  return user.name.trim().toUpperCase()
}
```

Explicitly type parameters and useful public contracts. Avoid annotations that merely repeat obvious initializer types.

## Interfaces, aliases, and literals

```ts
interface AdminUser extends User {
  permissions: readonly string[]
}

type UserRole = 'admin' | 'editor' | 'viewer'
type Point = readonly [number, number]

const roles = ['admin', 'editor', 'viewer'] as const
type Role = (typeof roles)[number]
```

Use interfaces for extensible object contracts. Use aliases for unions, tuples, mapped types, and derived literal unions.

## Unknown values and type guards

```ts
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseUser(value: unknown): User {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') {
    throw new Error('Invalid user')
  }

  if (value.email !== undefined && typeof value.email !== 'string') {
    throw new Error('Invalid user email')
  }

  return {
    id: value.id,
    name: value.name,
    ...(value.email === undefined ? {} : { email: value.email }),
  }
}
```

Do not replace validation with `return value as User`. Prefer a schema validator when the project already uses one.

For ordinary unions, use built-in narrowing:

```ts
function formatInput(input: string | number): string {
  if (typeof input === 'string') return input.toUpperCase()
  return input.toFixed(2)
}
```

## Nullability

```ts
function getLength(value: string | null): number {
  return value?.length ?? 0
}

interface ProfileOwner {
  profile?: { name?: string }
}

function getName(user: ProfileOwner): string {
  return user.profile?.name ?? 'Anonymous'
}
```

Use `??`, not `||`, when `0`, `false`, or an empty string is a valid value.

## Focused functions

```ts
interface UserData {
  name: string
  email: string
}

interface ProcessedUserData extends UserData {
  createdAt: Date
}

function normalizeUser(data: UserData, now: Date): ProcessedUserData {
  return { ...data, name: data.name.trim(), createdAt: now }
}

async function updateUser(
  data: UserData,
  save: (user: ProcessedUserData) => Promise<void>,
  notify: (email: string) => Promise<void>,
): Promise<ProcessedUserData> {
  const user = normalizeUser(data, new Date())
  await save(user)
  await notify(user.email)
  return user
}
```

Keep validation, transformation, and effects independently testable when they have separate reasons to change.

## Async operations

```ts
async function fetchJson<T>(url: string, validate: (value: unknown) => T): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`)
  }

  const body: unknown = await response.json()
  return validate(body)
}
```

A generic type argument alone does not make JSON trustworthy; validate the `unknown` body.

Flatten dependent work with guards:

```ts
async function loadLatestOrder(userId: string): Promise<OrderSummary | null> {
  const user = await getUser(userId)
  if (!user) return null

  const orders = await getOrders(user.id)
  const latestOrder = orders[0]
  if (!latestOrder) return { user, latestOrder: null, items: [] }

  const items = await getOrderItems(latestOrder.id)
  return { user, latestOrder, items }
}
```

Run only independent work in parallel:

```ts
const [profile, preferences] = await Promise.all([
  getProfile(userId),
  getPreferences(userId),
])
```

## Dependency injection

```ts
interface PaymentGateway {
  charge(amount: number): Promise<boolean>
}

export class PaymentProcessor {
  constructor(private readonly gateway: PaymentGateway) {}

  async processPayment(amount: number): Promise<boolean> {
    if (amount <= 0) throw new Error('Amount must be greater than zero')
    return this.gateway.charge(amount)
  }
}
```

Tests can supply a typed fake without constructing a real gateway.

## Type-only imports and exports

```ts
import type { User, UserSettings } from './types'
import { fetchUser } from './api'

export type { User }
export { fetchUser }
```

This makes runtime dependencies explicit and works reliably with isolated module transforms.

## Type tests

```ts
type PositiveAmount = number & { readonly __brand: 'PositiveAmount' }

declare function charge(amount: PositiveAmount): Promise<boolean>

// @ts-expect-error: an unvalidated number is not a PositiveAmount
void charge(-1)
```

`number` alone cannot reject negative values at compile time. Use runtime validation to construct a branded type, or test the runtime guard instead.

## File organization

Prefer the repository's existing naming convention. In a kebab-case layered module, a coherent layout can be:

```text
user/
├── user.model.ts
├── user.service.ts
├── user.service.test.ts
└── index.ts
```

Do not add a barrel solely for aesthetics. Add one when the directory intentionally exposes a stable public surface.
