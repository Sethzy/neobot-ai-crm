/**
 * Landing page button component with solid/outline variants.
 * Supports both button and link modes via TanStack Router.
 */
import Link from "next/link";
import { cn } from '@/lib/utils'

const baseStyles = {
  solid:
    'group inline-flex items-center justify-center rounded-full py-2 px-4 text-sm font-semibold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2',
  outline:
    'group inline-flex ring-1 items-center justify-center rounded-full py-2 px-4 text-sm focus:outline-none',
}

const variantStyles = {
  solid: {
    slate:
      'bg-foreground text-background hover:bg-foreground/80 active:bg-foreground/90 active:text-background/80 focus-visible:outline-foreground',
    green: 'bg-sunder-green text-white hover:bg-sunder-green-light active:bg-sunder-green-dark focus-visible:outline-sunder-green',
    white:
      'bg-white text-foreground hover:bg-sunder-green/5 active:bg-sunder-green/10 active:text-foreground/80 focus-visible:outline-white',
  },
  outline: {
    slate:
      'ring-border text-muted-foreground hover:text-foreground hover:ring-border/80 active:bg-muted active:text-muted-foreground focus-visible:outline-primary focus-visible:ring-border/80',
    white:
      'ring-white/30 text-white hover:ring-white/50 active:ring-white/30 active:text-white/80 focus-visible:outline-white',
  },
}

type Variant = 'solid' | 'outline'
type SolidColor = 'slate' | 'green' | 'white'
type OutlineColor = 'slate' | 'white'

interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color'> {
  variant?: Variant
  color?: SolidColor | OutlineColor
  href?: string
  children?: React.ReactNode
}

export function Button({
  variant = 'solid',
  color = 'slate',
  className,
  href,
  children,
  ...props
}: ButtonProps) {
  const variantStyle = variantStyles[variant]
  const colorStyle = color in variantStyle
    ? variantStyle[color as keyof typeof variantStyle]
    : variantStyle.slate

  const classes = cn(baseStyles[variant], colorStyle, className)

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    )
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  )
}
