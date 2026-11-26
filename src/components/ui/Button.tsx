import type { ButtonHTMLAttributes } from 'react'
import { Link, type LinkProps } from 'react-router-dom'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

type NativeButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  as?: 'button'
  variant?: ButtonVariant
}

type LinkButtonProps = Omit<LinkProps, 'className'> & {
  as: 'link'
  className?: string
  variant?: ButtonVariant
}

type ButtonProps = NativeButtonProps | LinkButtonProps

export function Button(props: ButtonProps) {
  const { variant = 'primary', className = '' } = props
  const classes = `ui-button ui-button--${variant} ${className}`.trim()

  if (props.as === 'link') {
    const { as: _as, variant: _variant, className: _className, ...linkProps } = props
    return <Link {...linkProps} className={classes} />
  }

  const { as: _as, variant: _variant, className: _className, ...buttonProps } = props
  return <button {...buttonProps} className={classes} />
}
