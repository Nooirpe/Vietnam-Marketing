import { cloneElement, useId, type ReactElement } from 'react'

export function Tooltip({ label, children }: { label: string; children: ReactElement<{ 'aria-describedby'?: string }> }) {
  const tooltipId = useId()
  return (
    <span className="ui-tooltip">
      {cloneElement(children, { 'aria-describedby': tooltipId })}
      <span id={tooltipId} role="tooltip" className="ui-tooltip-content">{label}</span>
    </span>
  )
}
