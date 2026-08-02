import { create } from 'zustand'

export interface Toast {
  id: number
  text: string
  kind: 'info' | 'success' | 'error'
}

interface ToastState {
  toasts: Toast[]
  push: (text: string, kind?: Toast['kind']) => void
  dismiss: (id: number) => void
}

let nextToastId = 1

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (text, kind = 'info') => {
    const id = nextToastId++
    set((state) => ({ toasts: [...state.toasts.slice(-3), { id, text, kind }] }))
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
    }, 3500)  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}))
