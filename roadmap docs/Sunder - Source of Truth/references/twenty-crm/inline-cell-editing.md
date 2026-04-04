# Twenty CRM Inline Cell Editing — Reference Analysis

**Source**: `/Users/sethlim/Documents/twenty` (official open-source repo)
**Date**: 2026-04-04
**Purpose**: Reference for Sunder's CRM side panel inline field editing

---

## The Core Design Decision

**Twenty renders edit mode as a FLOATING PORTAL, not inline replacement.**

When you click a field in Twenty:
1. The field row DOM **does not change** — display text stays rendered
2. A floating overlay (portal to `document.body`) appears **on top** of the value area
3. The overlay contains the input/select/datepicker
4. When you finish editing, the overlay disappears, display text updates

This is fundamentally different from replacing the `<span>` with an `<input>` inline. It eliminates layout shift by design — the row never re-renders, only the floating overlay appears/disappears.

---

## Key Files (Twenty repo)

### Orchestration
| File | Path | Purpose |
|------|------|---------|
| RecordInlineCell | `modules/object-record/record-inline-cell/components/RecordInlineCell.tsx` | Main orchestrator — state, keyboard handlers, persist logic |
| RecordInlineCellContainer | `...RecordInlineCellContainer.tsx` | Layout wrapper — icon + label + value columns |
| RecordInlineCellValue | `...RecordInlineCellValue.tsx` | Click handler wrapper around display/edit content |
| RecordInlineCellDisplayMode | `...RecordInlineCellDisplayMode.tsx` | Display mode wrapper — hover states, edit button |
| RecordInlineCellEditMode | `...RecordInlineCellEditMode.tsx` | Edit mode — Floating UI portal + overlay container |

### Display Components
| File | Path | Purpose |
|------|------|---------|
| TextFieldDisplay | `modules/object-record/record-field/ui/meta-types/display/components/TextFieldDisplay.tsx` | Text value display |
| SelectFieldDisplay | `...SelectFieldDisplay.tsx` | Colored Tag badge |
| PhonesFieldDisplay | `...PhonesFieldDisplay.tsx` | Phone with RoundedLink |
| EmailsFieldDisplay | `...EmailsFieldDisplay.tsx` | Email with RoundedLink |
| DateFieldDisplay | `...DateFieldDisplay.tsx` | Formatted date |

### Input Components
| File | Path | Purpose |
|------|------|---------|
| TextFieldInput | `modules/object-record/record-field/ui/meta-types/input/components/TextFieldInput.tsx` | Text edit wrapper |
| SelectFieldInput | `...SelectFieldInput.tsx` | Select dropdown with search |
| FieldInputContainer | `modules/ui/field/input/components/FieldInputContainer.tsx` | Universal input wrapper |
| TextAreaInput | `modules/ui/field/input/components/TextAreaInput.tsx` | Borderless text input |
| SelectInput | `modules/ui/input/components/SelectInput.tsx` | Select dropdown content |
| Tag | `twenty-ui/src/components/tag/Tag.tsx` | Colored badge component |

---

## Layout Structure (Exact CSS)

### Field Row Container (`RecordInlineCellContainer`)
```css
display: flex;
gap: 4px;                    /* spacing[1] */
width: 100%;
height: fit-content;
cursor: pointer;             /* if not readonly */
align-items: center;
user-select: none;
```

### Label + Icon Column (`StyledLabelAndIconContainer`)
```css
align-items: center;
align-self: flex-start;      /* anchors to top — prevents icon shift */
color: tertiary;
display: flex;
gap: 4px;                    /* spacing[1] */
height: 24px;                /* FIXED — this is the key */
```

### Icon (`StyledIconContainer`)
```css
align-items: center;
color: tertiary;
display: flex;
width: 16px;
/* SVG inside: 16x16px, centered */
```

### Value Column (`StyledValueContainer`)
```css
display: flex;
min-width: 0;                /* allows flex shrink */
position: relative;
width: 100%;
```

### Display Mode (`StyledRecordInlineCellNormalModeOuterContainer`)
```css
display: flex;
height: 16px;                /* fixed, or auto for multiline */
min-height: 16px;
overflow: hidden;
padding: 0 4px;              /* spacing[1] left/right */
border-radius: 4px;          /* border.radius.sm */
/* On hover (non-readonly): */
background-color: transparent-light;
outline: 1px solid border-color-medium;
cursor: pointer;
```

### Display Text Inner (`StyledRecordInlineCellNormalModeInnerContainer`)
```css
height: fit-content;
padding-top: 2px;
padding-bottom: 2px;
overflow: hidden;
text-overflow: ellipsis;
white-space: nowrap;
align-items: center;
color: primary;
```

---

## Edit Mode — The Floating Portal

### Edit Container (`RecordInlineCellEditMode`)
```typescript
// Reference element (invisible, same position as display)
const StyledInlineCellEditModeContainer = styled.div`
  display: flex;
  height: 24px;              /* Same height as label column */
`;

// Floating UI positioning
const { refs, floatingStyles } = useFloating({
  placement: 'bottom-start',
  middleware: [
    flip(),
    offset({ mainAxis: -29, crossAxis: -5 }),  // overlaps field by 29px up, 5px left
  ],
  whileElementsMounted: autoUpdate,
});

// Portal render
createPortal(
  <OverlayContainer
    ref={refs.setFloating}
    style={floatingStyles}
    borderRadius="sm"
    hasDangerBorder={isFieldInError}
  >
    {children}  /* TextAreaInput, SelectInput, etc. */
  </OverlayContainer>,
  document.body
)
```

### OverlayContainer (the visible edit box)
```css
z-index: 30;
border: 1px solid border-color-medium;       /* or danger if error */
border-radius: 4px;
background: background-primary;
box-shadow: boxShadow.strong;                /* dropdown shadow */
```

### FieldInputContainer (wraps the actual input)
```css
align-items: center;
display: flex;
min-height: 32px;
min-width: 200px;
width: 100%;
```

---

## Text Input Styling (`TextAreaInput`)
```css
background-color: transparent;
border: none;
color: font-color-primary;
font-family: inherit;
font-size: inherit;
font-weight: inherit;
outline: none;
padding: 0 8px;              /* spacing[0] spacing[2] */
line-height: 18px;
resize: none;
max-height: 400px;
width: calc(100% - 28px);    /* leaves space for copy icon */
```

---

## Select Dropdown (`SelectInput`)

### Structure
```
DropdownContent (flex column, width: 200px)
  DropdownMenuSearchInput (autofocus, height: 36px)
  DropdownMenuSeparator
  DropdownMenuItemsContainer (scrollable, max-height limited)
    MenuItemSelectTag * N (colored Tag badges with checkmark)
```

### Search Input
```css
padding: 0 8px;
background-color: transparent;
border: none;
outline: none;
font-size: font.size.sm;
color: font.color.primary;
placeholder-color: font.color.light;
width: 100%;
```

### Dropdown Item (MenuItemSelectTag)
- Uses `Tag` component for colored badge
- `height: 20px; padding: 0 8px; border-radius: 4px;`
- Background: `tag.background[color]` (blue, green, red, yellow, etc.)
- Checkmark icon when selected
- 4px gap between icon and text

---

## Where Sunder Drifts Today

### Problem 1: Inline replacement vs floating portal
**Twenty**: Edit UI floats in a portal OVER the unchanged row
**Sunder**: Edit UI replaces display content INLINE, causing row height change

**Fix**: For text/number fields, keep inline approach BUT ensure fixed row height. For select fields, use Radix Popover (our portal equivalent) positioned at the value area.

### Problem 2: Row height changes on edit
**Twenty**: Label column is always 24px. Value area height doesn't change because edit is in portal.
**Sunder**: The value column div gets border+padding on edit, growing the row height.

**Fix**: Set fixed `min-h-[24px]` on the field row. The edit chip border should use `box-sizing: border-box` or negative margin to not add height.

### Problem 3: Select trigger visible in edit mode
**Twenty**: No inline select trigger. Dropdown opens as a floating portal.
**Sunder**: SelectTrigger renders inline with chevron, then dropdown opens from it.

**Fix**: Hide the SelectTrigger entirely. Use a Popover/portal anchored to the value area. When clicking a select field, open the popover directly with no intermediate trigger state.

### Problem 4: Icon vertical shift
**Twenty**: Icon container has `align-self: flex-start` + fixed `height: 24px`. Never moves.
**Sunder**: Icon is in a container with `items-center` on the row. When row height changes, icon shifts.

**Fix**: Add `self-start` to the label+icon column. Give it fixed `h-6` (24px). Use `items-center` within that fixed-height box.

---

## Recommended Sunder Changes

### 1. Fix the row container
```diff
- "group flex items-center gap-3 rounded-md px-1 py-1"
+ "group flex items-center gap-3 rounded-md px-1 min-h-[28px]"
```
Remove `py-1` — let internal elements handle their own padding. Set `min-h` to prevent collapse.

### 2. Fix the label+icon column
```diff
- "flex w-[110px] shrink-0 items-center gap-2"
+ "flex w-[110px] shrink-0 items-center gap-2 self-start h-7"
```
Add `self-start` + fixed `h-7` (28px) so icon never shifts.

### 3. Fix the edit chip height
```diff
- "-ml-2 rounded-md border border-border/50 px-2 py-0.5"
+ "-ml-2 rounded-md border border-border/50 px-2 py-0 min-h-[24px] items-center"
```
Use `py-0` + `min-h-[24px]` — border is included in min-h via border-box, no added height.

### 4. For select fields — use Popover portal
Replace inline `<Select open>` with a `<Popover>` that renders the options in a portal. The field row shows display text. Clicking opens the popover below the value area. No inline trigger needed.

### 5. Text input — ensure same line-height
```css
input {
  line-height: 20px;          /* matches display text */
  padding: 0;                 /* no vertical padding */
  height: 24px;               /* matches label column */
}
```

---

## Acceptable Drift from Twenty

| Aspect | Twenty | Sunder | Reason for drift |
|--------|--------|--------|-----------------|
| Styling system | styled-components (emotion) | Tailwind CSS | Project-wide choice |
| State management | Jotai atoms | React useState | Simpler, sufficient for our needs |
| Portal library | @floating-ui/react | Radix Popover | Already using Radix throughout |
| Field types | 15+ types (emails, phones, links, etc.) | 5 types (text, select, date, number, textarea) | YAGNI — add as needed |
| Edit mode for text | Floating portal overlay | Inline chip border | Good enough for text — portal is overkill for simple inputs |
| Multi-select | Full multi-item with search | Single select only | No multi-select fields yet |

**No drift needed for**: Row height stability, icon alignment, select dropdown behavior, placeholder styling, spacing values.
