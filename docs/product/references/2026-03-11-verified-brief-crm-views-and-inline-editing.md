# Sunder CRM UI Brief: Views and Direct Editing

**Date:** March 11, 2026

**Scope:** This brief only covers:

1. More ways to view CRM data
2. Direct editing

Everything below is based on a live check of the running product, page by page, plus a code review to confirm behavior.

## What I Checked

I checked these live screens in the running app:

- Customers home
- People list
- Person detail
- Companies list
- Company detail
- Deals list
- Deals pipeline
- Deal detail
- Tasks page
- Task detail drawer

## What Is True Today

### Short version

Sunder today is **not** just tables.

Sunder today also does **not** force the user to use AI for every small change.

The real gaps are narrower:

- View choices are uneven across screens
- Editing is mostly available **after opening a detail page or drawer**, not directly where the user is scanning the list

### Verified current state by area

| Area | What the user can do today | What is still missing |
| --- | --- | --- |
| Customers home | See summary cards, recent activity, and a pipeline overview | This is a summary page, not a working multi-view workspace |
| People list | View people in a table, search, filter, export, open saved perspectives | No second view like board, calendar, or gallery. No direct edit in the list |
| Person detail | Edit name, company, email, phone, type, and notes directly on the page | Editing exists, but only after opening the person |
| Companies list | View companies in a table, search, filter, export, open saved perspectives | No second view. No direct edit in the list |
| Company detail | Edit name, industry, phone, email, website, address, and notes directly on the page | Editing exists, but only after opening the company |
| Deals list | View deals in a table with filters, perspectives, export, and a pipeline button | No direct edit in the list |
| Deals pipeline | View deals as a board by stage | The board exists, but it is currently read-only. The page text says deals can be dragged between lanes, but the current board does not actually do that |
| Deal detail | Edit address, stage, price, and notes directly on the page | Editing exists, but only after opening the deal |
| Tasks page | Switch between table and board views | No calendar view |
| Task detail drawer | Edit title, status, due date, and description directly in the drawer | Editing exists, but only after opening the drawer |

## Product Reading of the Current State

If we explain Sunder today in plain language:

```text
TODAY

Customers home = summary view
People = table
Companies = table
Deals = table + separate pipeline board
Tasks = table + board

Direct editing exists,
but mostly after opening a person, company, deal, or task
```

So the product is already partway there.

This means we should **not** plan this as:

- "add views from zero"
- "add direct editing from zero"

We should plan it as:

- make the existing view system feel more complete
- move editing closer to the place where the user is already working

## What I Would Implement

## 1. More Ways To View CRM Data

### What this should do

Let the user look at the same information in the way that best matches the job they are doing right now.

### What I would change

#### Deals

Deals already have two views today:

- list
- pipeline board

That is good, but it still feels split across two separate places.

What I would do is make it feel like one deal workspace with two natural ways to look at the same pipeline.

```text
TODAY

Deals
  -> list page
  -> separate pipeline page

AFTER

Deals
  -> [Table] [Board]
  -> same search
  -> same filters
  -> same sense of place
```

The user outcome:

- easier to switch from "scan details" to "see pipeline shape"
- less feeling of leaving one screen and entering another
- more polished and intentional experience

Also, if the product says the pipeline can be moved by dragging, that needs to become true in the real product. Right now the board is a viewing surface, not a moving surface.

#### Tasks

Tasks already have:

- table view
- board view

The clear missing view is calendar.

```text
TODAY

Tasks
  -> [Table] [Board]

Need to understand this week?
  -> scan rows
  -> or scan cards

AFTER

Tasks
  -> [Table] [Board] [Calendar]

Need to understand this week?
  -> open calendar
  -> see today's and this week's follow-ups immediately
```

The user outcome:

- much easier day planning
- much easier follow-up management
- much better fit for date-based work

#### People and Companies

I would **not** force extra views onto people and companies just to match a competitor.

Right now these pages are table-first, which is reasonable.

The stronger move is:

- keep them table-first for now
- improve direct editing in the table

That keeps scope disciplined and focused on real value.

### PM summary for feature 1

The goal is not "put every object into five view types."

The goal is:

- make deals feel like one workspace with both list and board
- add calendar to tasks
- keep people and companies simple unless a stronger need appears

## 2. Direct Editing

### What this should do

Let the user fix small things immediately, without opening another screen for every tiny change.

### Important correction based on the live product

Direct editing already exists today in Sunder.

It is already present in:

- person pages
- company pages
- deal pages
- task drawers

So the gap is **not** "users cannot edit directly."

The gap is:

- users cannot usually edit directly from the list or board where they are scanning work

### What I would change

Keep the current detail-page editing.

Add quick editing for the highest-frequency fields in the list and board surfaces.

#### People

Best quick-edit fields:

- phone
- email
- type
- company

```text
TODAY

People list
  Sarah Chen | +65 9123 4567 | Buyer

Want to fix the phone number?
  -> open Sarah
  -> edit on detail page
  -> save
  -> go back

AFTER

People list
  Sarah Chen | [ +65 9123 4567 ] | Buyer

Click number
  -> type new number
  -> press Enter
  -> saved
```

#### Deals

Best quick-edit fields:

- stage
- price

This is especially important on the board.

```text
TODAY

Deals board
  user can see stage
  user can open deal

AFTER

Deals board
  user can move the deal forward there
  user can quickly change stage there
```

For the list view:

- click stage to change it
- click price to correct it

#### Tasks

Best quick-edit fields:

- status
- due date
- title

```text
TODAY

Tasks board
  user sees work
  user opens drawer to edit

AFTER

Tasks board / table / calendar
  click status
  change status
  done

  click due date
  pick a new date
  done
```

#### Companies

Best quick-edit fields:

- phone
- website
- industry

This is useful, but I would put it after people, deals, and tasks.

### What should stay as a full page edit

Not everything needs to become a quick edit.

Longer or more thoughtful changes should stay in the detail page, for example:

- long notes
- multi-part record cleanup
- deeper relationship review

That keeps the quick-edit experience fast instead of messy.

## Before and After

### Overall product feel

```text
BEFORE

Sunder helps the user manage CRM data,
but the experience is split:

- some areas are table only
- some areas have a second view
- direct editing exists, but mostly after opening a deeper screen

AFTER

Sunder feels like a polished working surface:

- deals can be viewed naturally as list or pipeline
- tasks can be viewed naturally as list, board, or calendar
- small fixes happen right where the user notices them
- detail pages stay available for bigger edits
```

### Morning workflow

```text
BEFORE

1. Open Customers home
2. Open Deals list
3. Open Pipeline separately
4. Open a person to fix a phone number
5. Open a task drawer to move a due date

AFTER

1. Open Customers home
2. Switch Deals from list to board instantly
3. Open Tasks in calendar to see today's load
4. Fix a phone number in the people list
5. Move a deal stage without leaving the board
6. Change a task date directly where the task is shown
```

## What This Will Achieve

- Faster daily review
- Less jumping between list and detail screens
- Less unnecessary dependence on chat for tiny corrections
- More control in the user’s hands
- A more premium, polished feel

## Recommended First Release

If we want the highest value with the least waste, I would ship this in the following order:

1. **Deals**
   Make list and pipeline feel like one experience, and make stage changes possible from the pipeline itself.

2. **Tasks**
   Add calendar view and quick changes for status and due date.

3. **People**
   Add quick edits for phone, email, type, and company directly in the list.

4. **Companies**
   Add quick list editing after the higher-frequency surfaces are done.

## Final PM Take

The product opportunity here is real, but it is more precise than it first looked.

Sunder already has:

- a customers overview
- a deals board
- a tasks board
- direct editing on detail screens

So the work is not about inventing these ideas from zero.

The work is about turning partial capability into a cleaner, more obvious, more immediate user experience.
