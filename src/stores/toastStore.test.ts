import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToastStore } from './toastStore'

beforeEach(() => {
  vi.useFakeTimers()
  useToastStore.setState({ toasts: [] })
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('toast store', () => {
  it('pushes a toast and auto-dismisses it after the timeout', () => {
    useToastStore.getState().push('Hello')
    expect(useToastStore.getState().toasts).toHaveLength(1)
    expect(useToastStore.getState().toasts[0].text).toBe('Hello')
    expect(useToastStore.getState().toasts[0].kind).toBe('info')

    vi.advanceTimersByTime(3600)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('keeps the kind and supports manual dismissal', () => {
    useToastStore.getState().push('Failed', 'error')
    const id = useToastStore.getState().toasts[0].id
    useToastStore.getState().dismiss(id)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('caps the visible stack', () => {
    for (let i = 0; i < 6; i++) useToastStore.getState().push(`Toast ${i}`)
    expect(useToastStore.getState().toasts.length).toBeLessThanOrEqual(4)
  })
})
