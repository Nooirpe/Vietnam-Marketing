import type { HTMLAttributes, ReactNode } from 'react'

type PanelProps = HTMLAttributes<HTMLElement> & {
  as?: 'aside' | 'details' | 'div' | 'fieldset' | 'section'
  children?: ReactNode
}

export function Panel({ as: Element = 'section', className = '', ...props }: PanelProps) {
  return <Element {...props} className={`ui-panel ${className}`.trim()} />
}
