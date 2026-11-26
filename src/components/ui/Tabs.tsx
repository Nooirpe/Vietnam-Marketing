import type { HTMLAttributes, ReactNode } from 'react'

type TabsProps = HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'nav'
  label: string
  children: ReactNode
}

export function Tabs({ as: Element = 'div', label, className = '', children, ...props }: TabsProps) {
  return Element === 'nav'
    ? <nav {...props} aria-label={label} className={`ui-tabs ${className}`.trim()}>{children}</nav>
    : <div {...props} role="group" aria-label={label} className={`ui-tabs ${className}`.trim()}>{children}</div>
}
