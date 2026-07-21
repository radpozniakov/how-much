// Global test setup. Adds jest-dom's matchers to vitest's expect (ready for
// component tests) and runs Testing Library's cleanup after each test.
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})
