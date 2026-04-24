/**
 * Shared CRM row action menu with lightweight portal positioning.
 * It keeps row-level controls isolated from parent row clicks while matching
 * the Open Mercato hover-or-click interaction pattern.
 * @module components/ui/row-actions
 */
"use client"

import * as React from "react"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils"

/**
 * Describes a single row-level action exposed from the shared CRM tables.
 */
export interface RowActionItem {
  id?: string
  label: string
  href?: string
  newTab?: boolean
  onSelect?: () => void
  destructive?: boolean
}

interface RowActionsProps {
  items?: RowActionItem[]
}

const HOVER_CLOSE_DELAY_MS = 150

/**
 * Renders the trailing row action trigger and its portal-based menu.
 */
export function RowActions({ items = [] }: RowActionsProps) {
  const [isMounted, setIsMounted] = React.useState(false)
  const [isOpen, setIsOpen] = React.useState(false)
  const [anchorRect, setAnchorRect] = React.useState<DOMRect | null>(null)
  const [direction, setDirection] = React.useState<"down" | "up">("down")
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)
  const closeTimeoutRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    setIsMounted(true)
  }, [])

  const clearScheduledClose = React.useCallback(() => {
    if (closeTimeoutRef.current == null) {
      return
    }

    window.clearTimeout(closeTimeoutRef.current)
    closeTimeoutRef.current = null
  }, [])

  const updatePosition = React.useCallback(() => {
    if (!triggerRef.current) {
      return
    }

    const nextAnchorRect = triggerRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - nextAnchorRect.bottom
    const spaceAbove = nextAnchorRect.top

    setAnchorRect(nextAnchorRect)
    setDirection(spaceBelow < 180 && spaceAbove > spaceBelow ? "up" : "down")
  }, [])

  const openMenu = React.useCallback(() => {
    clearScheduledClose()
    updatePosition()
    setIsOpen(true)
  }, [clearScheduledClose, updatePosition])

  const closeMenu = React.useCallback(() => {
    clearScheduledClose()
    setIsOpen(false)
  }, [clearScheduledClose])

  const scheduleClose = React.useCallback(() => {
    clearScheduledClose()
    closeTimeoutRef.current = window.setTimeout(() => {
      setIsOpen(false)
      closeTimeoutRef.current = null
    }, HOVER_CLOSE_DELAY_MS)
  }, [clearScheduledClose])

  React.useEffect(() => {
    if (!isOpen) {
      return
    }

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node

      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return
      }

      closeMenu()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return
      }

      event.preventDefault()
      closeMenu()
      triggerRef.current?.focus()
    }

    const handleWindowChange = () => {
      updatePosition()
    }

    document.addEventListener("mousedown", handleDocumentClick)
    document.addEventListener("keydown", handleKeyDown)
    window.addEventListener("resize", handleWindowChange)
    window.addEventListener("scroll", handleWindowChange, { capture: true, passive: true })

    return () => {
      document.removeEventListener("mousedown", handleDocumentClick)
      document.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("resize", handleWindowChange)
      window.removeEventListener("scroll", handleWindowChange, true)
    }
  }, [closeMenu, isOpen, updatePosition])

  React.useEffect(() => {
    return () => {
      clearScheduledClose()
    }
  }, [clearScheduledClose])

  if (items.length === 0) {
    return null
  }

  const handlePointerEnter = (event: React.PointerEvent) => {
    if (event.pointerType === "touch") {
      return
    }

    openMenu()
  }

  const handlePointerLeave = (event: React.PointerEvent) => {
    if (event.pointerType === "touch") {
      return
    }

    scheduleClose()
  }

  return (
    <div
      className="relative inline-flex"
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Open row actions"
        className={cn(
          "inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 transition-colors",
          "hover:bg-muted hover:text-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        )}
        onClick={(event) => {
          event.stopPropagation()
          openMenu()
        }}
      >
        <span aria-hidden="true" className="text-base leading-none">
          ⋯
        </span>
      </button>
      {isMounted && isOpen && anchorRect
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              className="fixed z-[1000] w-44 max-w-[calc(100vw-1rem)] rounded-xl border border-border/40 bg-popover p-1 shadow-md ring-1 ring-foreground/10"
              style={{
                top: direction === "down" ? anchorRect.bottom + 8 : anchorRect.top - 8,
                left: Math.min(anchorRect.right, window.innerWidth - 8),
                transform: `translate(-100%, ${direction === "down" ? "0" : "-100%"})`,
              }}
              onClick={(event) => event.stopPropagation()}
              onPointerEnter={handlePointerEnter}
              onPointerLeave={handlePointerLeave}
            >
              {items.map((item) =>
                item.href ? (
                  <a
                    key={item.id ?? item.label}
                    href={item.href}
                    role="menuitem"
                    target={item.newTab ? "_blank" : undefined}
                    rel={item.newTab ? "noreferrer noopener" : undefined}
                    className={cn(
                      "flex w-full items-center rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-muted/70 focus-visible:bg-muted/70 focus-visible:outline-none",
                      item.destructive ? "text-destructive" : "text-foreground"
                    )}
                    onClick={(event) => {
                      event.stopPropagation()
                      item.onSelect?.()
                      closeMenu()
                    }}
                  >
                    {item.label}
                  </a>
                ) : (
                  <button
                    key={item.id ?? item.label}
                    type="button"
                    role="menuitem"
                    className={cn(
                      "flex w-full items-center rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted/70 focus-visible:bg-muted/70 focus-visible:outline-none",
                      item.destructive ? "text-destructive" : "text-foreground"
                    )}
                    onClick={(event) => {
                      event.stopPropagation()
                      item.onSelect?.()
                      closeMenu()
                    }}
                  >
                    {item.label}
                  </button>
                )
              )}
            </div>,
            document.body
          )
        : null}
    </div>
  )
}
