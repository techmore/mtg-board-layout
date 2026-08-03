import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Button } from '../ui/Button'
import type { ButtonVariant } from '../ui/Button'

interface BoardBtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  onClick: () => void
  children: ReactNode
  variant?: ButtonVariant
}

export function BoardBtn({ onClick, children, variant = 'default', ...rest }: BoardBtnProps) {
  return (
    <Button size="sm" variant={variant} onClick={onClick} {...rest}>
      {children}
    </Button>
  )
}
