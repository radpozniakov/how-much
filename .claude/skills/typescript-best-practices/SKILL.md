---
name: typescript-best-practices
description: This skill should be used whenever creating, changing, reviewing, or refactoring TypeScript or TSX; configuring tsconfig; designing typed APIs; handling async TypeScript; or writing TypeScript tests. Apply it even when the user asks for a feature or bug fix without explicitly requesting a TypeScript review.
version: 1.0.0
---

# TypeScript Best Practices

Produce maintainable TypeScript that preserves the project's architecture while increasing type safety. Prefer the codebase's established runtime, module system, framework, formatter, and test tools over generic defaults.

## Workflow

1. Locate the nearest `tsconfig*.json`, `package.json`, lint configuration, and representative neighboring files before editing.
2. Determine which TypeScript project owns every changed file. Do not assume one root configuration covers a multi-package repository.
3. Preserve local naming, module, and testing conventions unless the task explicitly includes a migration.
4. Model inputs and state precisely before implementing behavior.
5. Make the smallest coherent change; avoid unrelated type-system rewrites.
6. Run the owning package's typecheck/build, lint, and focused tests. Report anything not run.

## Configuration

- Enable `strict: true` in every maintained TypeScript project. Treat it as the umbrella for strict checks rather than redundantly listing all strict flags.
- Enable `forceConsistentCasingInFileNames: true`.
- Enable `isolatedModules: true` when files are transpiled independently, as with Vite, Babel, esbuild, or SWC.
- Use `noEmit: true` when another tool emits JavaScript.
- Keep `target`, `module`, `moduleResolution`, JSX, libraries, and runtime types aligned with the actual toolchain. Do not copy CommonJS or Node resolution into a bundler project merely because an example uses it.
- Use `skipLibCheck: true` when dependency declaration checking is an unhelpful build cost, but never use it to excuse errors in project-owned declarations.
- Add stricter options incrementally only after checking their impact. Do not weaken existing checks to make a change compile.

## Type Design

- Let TypeScript infer obvious local variables and private implementation return types.
- Explicitly type function parameters and exported/public boundaries when the contract would otherwise be unclear.
- Use `interface` for extensible object contracts and `type` for unions, tuples, mapped types, and aliases. Follow an established local convention when either is equally suitable.
- Prefer discriminated unions for variant states and exhaustive narrowing for closed sets.
- Prefer specific domain types. Use generics only when a real relationship between input and output types must be preserved.
- Avoid `any`. Accept untrusted or unconstrained values as `unknown`, then narrow or validate them.
- Avoid unchecked assertions (`as T`) at data boundaries. A cast does not validate runtime data.
- Handle `null` and `undefined` deliberately with guards, optional chaining, or nullish coalescing. Do not use non-null assertions without a proved invariant.
- Use `as const` for intentionally fixed literals and derive unions from those values when useful.
- Use `import type` and `export type` for type-only dependencies, especially with `verbatimModuleSyntax` or isolated transpilation.
- Prefer composition over inheritance. Keep complex conditional and recursive types only when their benefit outweighs compiler and maintenance cost.

## Functions and Modules

- Keep functions focused and separate validation, transformation, persistence, and notification when they vary independently.
- Prefer pure functions for domain transformations and inject side-effecting dependencies to keep behavior testable.
- Use defaults and rest parameters where they express the contract more clearly than conditionals or loose arrays.
- Organize files by responsibility using the repository's naming convention. Use barrel files only when they improve a deliberate public API without introducing cycles or obscuring dependencies.
- Document exported contracts and non-obvious invariants; do not restate types in comments.

## Async Code

- Give public async functions meaningful `Promise<T>` contracts.
- Check protocol-level failure states, such as `Response.ok`; successful promise resolution does not guarantee a successful operation.
- Catch errors only to recover, translate, add useful context, or perform cleanup. Avoid catch-log-rethrow patterns that duplicate logging at multiple layers.
- Narrow caught values before reading error-specific properties.
- Use early returns to flatten conditional async flows.
- Use `Promise.all` only for independent operations. Preserve sequential awaits when one operation depends on another or ordering is required.

## Tests

- Test observable behavior through typed public APIs.
- Inject gateways, clocks, storage, and network clients instead of constructing them inside domain logic.
- Add compile-time tests for important type contracts with the project's chosen tool (`@ts-expect-error`, `tsd`, or equivalent).
- Place `@ts-expect-error` immediately above the intentional error and include a reason. Ensure the expression truly violates the declared type; semantic constraints such as “positive number” require a branded/refined type or runtime validation.
- Keep mocks type-checked against the interfaces they implement.

## Project Commands

For this repository:

- Fast TypeScript feedback: run `./scripts/check-typescript`; it type-checks and lint-checks the frontend and end-to-end projects with cached ESLint results.
- Frontend behavior changes: also run `cd frontend && npm run build` and focused `npm test -- <file>` as appropriate.
- End-to-end behavior changes: run focused Playwright tests when warranted.

## Detailed Reference

Read [`references/patterns.md`](references/patterns.md) when selecting concrete patterns for inference, unknown-value validation, type guards, async flows, dependency injection, type-only imports, const assertions, or type tests.
