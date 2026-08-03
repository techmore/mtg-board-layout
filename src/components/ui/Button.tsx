import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'default' | 'primary' | 'danger' | 'ghost' | 'warning'
export type ButtonSize = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
}

const VARIANT_STYLES: Record<ButtonVariant, React.CSSProperties> = {
  default: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.14)',
    color: '#e6edf3',
  },
  primary: {
    background: 'rgba(88,166,255,0.18)',
    border: '1px solid rgba(88,166,255,0.6)',
    color: '#79c0ff',
  },
  danger: {
    background: 'rgba(248,81,73,0.12)',
    border: '1px solid rgba(248,81,73,0.55)',
    color: '#ff7b72',
  },
  warning: {
    background: 'rgba(210,153,34,0.14)',
    border: '1px solid rgba(210,153,34,0.55)',
    color: '#ffd33d',
  },
  ghost: {
    background: 'transparent',
    border: '1px solid transparent',
    color: '#8b949e',
  },
}

export function Button({ children, variant = 'default', size = 'md', disabled, style, ...rest }: ButtonProps) {
  const base: React.CSSProperties = {
    padding: size === 'sm' ? '5px 10px' : '9px 16px',
    borderRadius: 8,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: size === 'sm' ? '0.72rem' : '0.8rem',
    fontWeight: 700,
    whiteSpace: 'nowrap',
    lineHeight: 1.2,
    opacity: disabled ? 0.45 : 1,
    transition: 'filter 0.15s, opacity 0.15s',
  }
  return (
    <button
      {...rest}
      disabled={disabled}
      style={{ ...base, ...VARIANT_STYLES[variant], ...style }}
      onMouseEnter={disabled ? undefined : (event) => { event.currentTarget.style.filter = 'brightness(1.15)' }}
      onMouseLeave={disabled ? undefined : (event) => { event.currentTarget.style.filter = 'none' }}
    >
      {children}
    </button>
  )
}
