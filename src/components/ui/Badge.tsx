import type { HTMLAttributes } from 'react'

export type BadgeVariant = 'neutral' | 'success' | 'danger' | 'missing' | 'estimated' | 'verified' | 'brand'

export function Badge({ variant = 'neutral', className = '', ...props }: HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant
}) {
  return <span {...props} className={`ui-badge ui-badge--${variant} ${className}`.trim()} />
}
