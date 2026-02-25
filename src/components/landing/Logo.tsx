/**
 * Logo component — NeoBot branding.
 * 3D isometric "N" - Geometrically Perfect V3.
 * Corrected projection vector (+5, -3) for standard 31° isometric angle.
 * B&W Attio-inspired theme.
 */
export function Logo({
  className,
  iconClassName,
  invert = false,
  ...props
}: React.ComponentPropsWithoutRef<'div'> & {
  iconClassName?: string
  invert?: boolean
}) {
  const containerFill = '#2B2B2B'

  return (
    <div className={`flex items-center gap-2.5 ${className ?? ''}`} {...props}>
      {/* NeoBot 3D Isometric Icon Mark - V3 Perfect Geometry */}
      <svg
        aria-hidden="true"
        viewBox="0 0 80 80"
        fill="none"
        className={`h-8 w-8 ${iconClassName ?? ''}`}
      >
        <rect x="2" y="2" width="76" height="76" rx="16" fill={containerFill} />

        {/* Diagonal Bar (Back Layer) */}
        <polygon points="15.5,20 26.5,20 59.5,64 48.5,64" fill="white" />
        <polygon points="26.5,20 31.5,17 64.5,61 59.5,64" fill="#c8c8c8" />

        {/* Left Vertical Bar (Top) */}
        <polygon points="26.5,20 31.5,17 31.5,61 26.5,64" fill="#c8c8c8" />
        <polygon points="15.5,20 26.5,20 26.5,64 15.5,64" fill="white" />
        <polygon points="15.5,20 26.5,20 31.5,17 20.5,17" fill="#e8e8e8" />

        {/* Right Vertical Bar (Bottom) */}
        <polygon points="59.5,20 64.5,17 64.5,61 59.5,64" fill="#c8c8c8" />
        <polygon points="48.5,20 59.5,20 59.5,64 48.5,64" fill="white" />
        <polygon points="48.5,20 59.5,20 64.5,17 53.5,17" fill="#e8e8e8" />


      </svg>
      {/* Wordmark */}
      <span
        className="text-[19px] tracking-[-0.02em]"
        style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 800 }}
      >
        neobot
      </span>
    </div>
  )
}
