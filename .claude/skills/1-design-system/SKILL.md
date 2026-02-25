---
name: 1-design-system
description: Use when creating or modifying UI components, pages, tables, forms, or any visual elements to ensure consistent styling
---

# Sunder Design System

## Overview

Minimalist, modern, professional design. Clean lines, ample whitespace, subtle depth, content clarity.

**Announce at start:** "I'm using the design-system skill to ensure consistent styling."é

## Mindset

You're an expert UI/UX product designer who has built beautiful UIs for FAANG-style companies.

**Design philosophy:**

- **Clean lines** - Simple, uncluttered interfaces
- **Ample whitespace** - Generous padding and margins for visual breathing room
- **Subtle depth** - Soft shadows and borders for hierarchy without distraction
- **Content clarity** - Typography and color choices that prioritize readability

**Layout principles:**

- **Structure:** Grid-based, highly organized, spacious. Elements well-defined with clear boundaries, promoting easy scanning.
- **Spacing:** Generous padding and margins to create visual breathing room around elements.

**The Iron Rule:**

```
PURELY COSMETIC IMPROVEMENTS ONLY
App behavior must remain exactly the same
```

Polish the look. Don't change functionality. If a change affects behavior, stop.

## When to Use

Use for ANY UI work:

- Creating new components or pages
- Modifying existing UI
- Building tables, forms, cards
- Adding buttons, inputs, status indicators
- Reviewing UI code for consistency

## Quick Reference

### Spacing

```
Page container: px-12 py-10
Between sections: mt-8 or mt-10
Between elements: mt-4 or mt-6
Within components: space-y-4 or space-y-5
Card padding: p-8
Table cells: px-5 py-4
```

### Cards & Containers

```tsx
// Standard card
className = "rounded-xl border border-border/40 bg-card shadow-sm";

// Card with padding
className = "p-8 rounded-xl border-border/40 shadow-sm";
```

### Tables

```tsx
// Container
className="rounded-xl border border-border/40 bg-card overflow-hidden shadow-sm"

// Header row
<thead className="border-b border-border/40 bg-muted/20">

// Header cell
className="px-5 py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70"

// Body row
className="border-b border-border/30 hover:bg-muted/40 transition-colors"

// Body cell
className="px-5 py-4 text-[13px] text-foreground/80"

// Index column
<span className="text-muted-foreground/70 tabular-nums">{index}</span>

// Date column
<span className="whitespace-nowrap text-foreground/80">{date}</span>
```

### Typography

```tsx
// Page title
className = "text-2xl font-semibold tracking-tight text-foreground";

// Page subtitle
className = "text-sm text-muted-foreground/70";

// Section title
className = "text-lg font-semibold text-foreground";

// Card title
className = "text-xl font-semibold text-foreground";

// Label (forms, metadata) - uppercase
className = "text-xs font-medium text-muted-foreground/70 uppercase tracking-wider";

// Value text (tables)
className = "text-[13px] text-foreground/80";
```

### Buttons

```tsx
// Primary (black)
className = "bg-foreground text-background hover:bg-foreground/90 shadow-sm";

// Outline
className = "border-border/50";

// Ghost (icons)
className = "text-muted-foreground/60 hover:text-foreground";
```

### Toolbar Header

```tsx
// Toolbar container (compact vertical spacing, tight horizontal gaps)
className="px-5 py-2 border-b border-border/40 bg-card"

// Toolbar items row
className="flex items-center gap-2"
```

### Toolbar Buttons (compact)

```tsx
// Text button (e.g., "4 documents", "View splits")
className="h-7 px-2.5 text-xs font-normal border-border/50"
// Icon inside: h-2 w-2

// Icon button (square, e.g., filter)
className="h-7 w-7 border-border/50"
// Icon inside: h-2 w-2

// Primary action with icon (e.g., "Mark reviewed")
<Button className="h-7 gap-1.5 text-xs font-normal bg-foreground text-background hover:bg-foreground/90 rounded-lg px-3 shadow-sm">
  <Check className="h-3.5 w-3.5" />
  Mark reviewed
</Button>

// Success state (e.g., "Reviewed")
<Button className="h-7 gap-1.5 text-xs font-normal bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg px-3 shadow-sm">
  <Check className="h-3.5 w-3.5" />
  Reviewed
</Button>

// Standalone indicator icons (e.g., duplicate warning)
<Info className="h-3.5 w-3.5 text-warning/80" />
<CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
```

### Filter Button with Count Badge

```tsx
// Wrapper for icon button with badge overlay
<div className="relative inline-flex">
  <Button variant="outline" size="icon" className="h-7 w-7 border-border/50">
    <Filter className="h-3 w-3" />
  </Button>
  {count > 0 && (
    <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-foreground text-background text-[9px] font-medium flex items-center justify-center">
      {count}
    </span>
  )}
</div>
```

### Form Inputs

```tsx
// Search input
<Input className="pl-11 h-12 w-full border-border/50 shadow-sm focus-visible:ring-1" />

// Search icon
<Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />

// Standard input
className="h-10 border-border/50"

// Textarea
className="border-border/50"
```

### Status Indicators

```tsx
// Active/Success dot (standalone)
<span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />

// In table rows (smaller)
<span className="h-2 w-2 rounded-full bg-emerald-500" />
```

### Empty States

```tsx
<div className="rounded-xl border border-border/40 bg-card p-16 text-center shadow-sm">
  <Icon className="mx-auto h-12 w-12 text-muted-foreground/40" />
  <p className="mt-6 text-muted-foreground">Primary message</p>
  <p className="mt-2 text-sm text-muted-foreground/60">Secondary message</p>
</div>
```

### Breadcrumbs

```tsx
<nav className="flex items-center gap-2 text-sm text-muted-foreground/70 mb-6">
  <Link className="hover:text-foreground transition-colors">Parent</Link>
  <ChevronRight className="h-4 w-4" />
  <span className="text-foreground/80">Current</span>
</nav>
```

### Tabs

```tsx
<TabsList className="bg-muted/40">
  <TabsTrigger value="tab1">Tab 1</TabsTrigger>
</TabsList>
<TabsContent className="mt-6">{/* content */}</TabsContent>
```

### Extraction Cards

```tsx
// Card container
className="rounded-xl border border-border/40 bg-card shadow-sm overflow-hidden"

// Card header (clickable)
className="px-5 py-4 border-b border-border/30 cursor-pointer hover:bg-muted/40 transition-colors"

// Doc type label (section header - prominent)
<span className="text-sm font-semibold text-foreground">{tagLabel}</span>

// Page range text (monospace for alignment)
<span className="text-xs text-muted-foreground/70 font-mono tabular-nums">{pageRange}</span>

// Field dividers
className="divide-y divide-border/30"
```

### Extraction Fields

```tsx
// Field container (with blue hover border)
className="px-5 py-4 transition-colors border-2 border-transparent hover:border-[#808BF8]/60"

// Field label (subtle but visible)
className="text-sm font-medium text-foreground/80"

// Field description
className="text-xs text-muted-foreground/70 mt-2 leading-relaxed"

// Value display - uniform 80% opacity, xs size
className="h-10 text-xs text-foreground/80 px-3 border-border/50"

// Reasoning/Citations section wrapper
className="mt-3 p-3 bg-white rounded-lg border border-border/40"

// Reasoning/Citations content box
className="px-3 py-2 bg-[#F9FAFB] rounded-md"

// Reasoning/Citations text (uniform 80%, smaller size)
className="text-xs text-foreground/80 leading-relaxed"
```

### Font Hierarchy (Extraction Panel)

```
1. Doc type header    → text-sm font-semibold text-foreground (section header)
2. Field label        → text-sm font-medium text-foreground/80 (subtle but visible)
3. Field value        → text-xs text-foreground/80 (uniform)
4. Supporting text    → text-xs text-foreground/80 (uniform)
5. Description        → text-xs text-muted-foreground/70 (helper text)
```

### Status Badges

```tsx
// All status badges use consistent text-[10px] and border-0

// Warning badges (Low confidence, Not found)
<Badge variant="warning" className="text-[10px]">Low confidence</Badge>

// Success badge (Corrected)
<Badge variant="success" className="text-[10px]">Corrected</Badge>

// Needs review (with hover tooltip)
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Badge className="text-[10px] bg-red-50 text-red-600/80 border-0 cursor-default hover:bg-red-100">
        Needs review
      </Badge>
    </TooltipTrigger>
    <TooltipContent>{/* validation failures */}</TooltipContent>
  </Tooltip>
</TooltipProvider>

// OCR confidence
<Badge className="text-[10px] bg-muted/40 text-muted-foreground border-0 hover:bg-muted/40">
  ocrConfidence={value}
</Badge>

// Section labels (Reasoning with icon, Citations)
<Badge variant="info" className="text-[10px] mb-2 gap-1">
  <Lightbulb className="h-3 w-3" />
  Reasoning
</Badge>
<Badge className="text-[10px] mb-2 bg-[#F9FAFB] text-muted-foreground border-0">Citations</Badge>
```

### Review Button States

```tsx
// Not reviewed (primary) - compact with check icon
<Button className="h-7 gap-1.5 text-xs font-normal bg-foreground text-background hover:bg-foreground/90 rounded-lg px-3 shadow-sm">
  <Check className="h-3.5 w-3.5" />
  Mark reviewed
</Button>

// Reviewed (success) - compact with check icon
<Button className="h-7 gap-1.5 text-xs font-normal bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg px-3 shadow-sm">
  <Check className="h-3.5 w-3.5" />
  Reviewed
</Button>
```

### Popovers & Dropdowns

```tsx
<PopoverContent className="border-border/40 shadow-md p-1.5">
  <button className="rounded-lg hover:bg-muted/40 transition-colors px-3 py-2.5">
    <span className="font-medium text-foreground/80">Label</span>
    <span className="text-muted-foreground/70 text-xs">Meta</span>
  </button>
</PopoverContent>
```

## Color Opacity Guide

| Element              | Class                               |
| -------------------- | ----------------------------------- |
| Primary text         | `text-foreground`                   |
| Content text (values)| `text-foreground/80`                |
| Muted/helper text    | `text-muted-foreground/70`          |
| Disabled/subtle      | `text-muted-foreground/40`          |
| Borders (prominent)  | `border-border/50`                  |
| Borders (subtle)     | `border-border/40` or `/30`         |
| Backgrounds (hover)  | `bg-muted/40`                       |
| Backgrounds (header) | `bg-muted/20`                       |

## Red Flags - STOP and Revise

If you catch yourself:

- Using `rounded-lg` instead of `rounded-xl` for cards
- Missing `shadow-sm` on cards/containers
- Using `border-border` without opacity (should be `/40` or `/50`)
- Tight padding (use `p-8` for cards, `px-5 py-4` for table cells)
- Missing `transition-colors` on hover states
- Using `text-[11px]` instead of `text-xs` for labels
- Missing `tracking-wider` on uppercase labels
- Missing `tabular-nums` on numeric columns
- Using `/90` or `/60` opacity instead of `/80` or `/70`

**ALL of these mean: STOP. Apply design system before continuing.**

## Checklist for New Components

Before delivering UI code:

- [ ] Cards use `rounded-xl` and `shadow-sm`
- [ ] Borders use `border-border/40` (subtle) or `/50` (prominent)
- [ ] Generous padding applied (`p-8` cards, `px-5 py-4` table cells)
- [ ] Hover states have `transition-colors`
- [ ] Labels use `text-xs` + `uppercase` + `tracking-wider`
- [ ] Numeric columns use `tabular-nums`
- [ ] Text hierarchy follows opacity guide
- [ ] Empty states follow standard pattern

## Common Mistakes

| Wrong                   | Right                                 |
| ----------------------- | ------------------------------------- |
| `rounded-lg`            | `rounded-xl`                          |
| `border`                | `border border-border/40`             |
| `p-4` on cards          | `p-8` on cards                        |
| `px-3 py-2` table cells | `px-5 py-4` table cells               |
| `text-xs` or `text-sm` in tables | `text-[13px]` for all table cells |
| `text-[11px]`           | `text-xs`                             |
| `uppercase` alone       | `uppercase tracking-wider`            |
| `hover:bg-gray-100`     | `hover:bg-muted/40 transition-colors` |
| `text-foreground/90`    | `text-foreground/80`                  |
| `text-muted-foreground/60` | `text-muted-foreground/70`         |
