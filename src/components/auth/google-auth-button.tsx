/**
 * Google OAuth button shared by login and signup screens.
 * @module components/auth/google-auth-button
 */
import { cn } from "@/lib/utils";

interface GoogleAuthButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  label: string;
}

export function GoogleAuthButton({
  className,
  disabled,
  isLoading = false,
  label,
  ...props
}: GoogleAuthButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-12 w-full items-center justify-center gap-3 rounded-2xl border border-border bg-card px-4 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      <GoogleIcon />
      <span>{isLoading ? "Connecting..." : label}</span>
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24">
      <path
        d="M21.8 12.2c0-.8-.1-1.5-.2-2.2H12v4.1h5.5a4.7 4.7 0 0 1-2 3.1v2.6h3.3c1.9-1.8 3-4.4 3-7.6Z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.6c-.9.6-2.1 1-3.4 1-2.6 0-4.7-1.7-5.5-4H3.1v2.7A10 10 0 0 0 12 22Z"
        fill="#34A853"
      />
      <path
        d="M6.5 14c-.2-.6-.4-1.3-.4-2s.1-1.4.4-2V7.3H3.1A10 10 0 0 0 2 12c0 1.6.4 3.2 1.1 4.7L6.5 14Z"
        fill="#FBBC04"
      />
      <path
        d="M12 6c1.5 0 2.9.5 4 1.5l3-3C17 2.7 14.7 2 12 2A10 10 0 0 0 3.1 7.3l3.4 2.7C7.3 7.7 9.4 6 12 6Z"
        fill="#EA4335"
      />
    </svg>
  );
}
