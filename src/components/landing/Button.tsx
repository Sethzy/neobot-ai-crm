/**
 * Landing page button component with solid/outline variants.
 * Supports both button and link modes via Next.js Link.
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
    green:
      'bg-lp-black text-lp-cream hover:bg-lp-lavender hover:text-lp-ink active:bg-lp-ink focus-visible:outline-lp-black',
    white:
      'bg-lp-cream text-lp-ink hover:bg-lp-lavender active:bg-lp-paper-muted active:text-lp-ink focus-visible:outline-lp-cream',
  },
  outline: {
    slate:
      'ring-border text-muted-foreground hover:text-foreground hover:ring-border/80 active:bg-muted active:text-muted-foreground focus-visible:outline-primary focus-visible:ring-border/80',
    white:
      'ring-lp-cream/45 text-lp-cream hover:ring-lp-cream active:bg-lp-cream/10 active:text-lp-cream-muted focus-visible:outline-lp-cream',
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
