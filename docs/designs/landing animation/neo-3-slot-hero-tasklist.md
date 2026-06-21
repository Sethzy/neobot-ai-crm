# Neo 3-Slot Hero Animation Tasklist

## Objective
Replace the current landing hero identity animation with a 3-slot choreography adapted from the reference screenshots in this folder.

Do not improvise the motion model.
Do not redesign the hero.
Only change the identity lane above the headline.

Final outcome:
- Build phase adds 3 circular tokens from right to left.
- Resolve phase converts tokens into `N`, `E`, `O` in this exact order:
  - center `E`
  - right `O`
  - left `N`
- Final state reads `NEO`.

## Reference Source
The original frame-by-frame screenshots were pruned during repo hygiene. The
choreography below is the retained source of truth for the shipped animation.

## Current Files To Know

Primary files:
- `src/components/landing/HeroIdentityAnimation.tsx`
- `src/components/landing/Hero.tsx`
- `src/components/landing/Hero.test.tsx`

Supporting files:
- `src/components/landing/Logo.tsx`
- `src/assets/landing/avatars/avatar-1.png`
- `src/test/setup.ts`

Do not touch:
- headline copy
- CTA copy or route
- promo video
- landing header/nav

## Constraints

- Keep `Hero` as a server component. The animation stays isolated inside the existing client component.
- Keep reduced-motion support. Reduced motion should skip the sequence and render static `NEO`.
- Avoid new dependencies.
- Use the existing `framer-motion` package already in the repo.
- Keep the animation one-shot on first render. No looping.
- Preserve hero spacing. No layout shift that pushes the headline down mid-animation.
- YAGNI: only build the 3-slot version now. Do not add `neobot` support yet.

## Choreography Model

### Slot model
Use 3 logical slots:
- left slot: green AI chip, later becomes `N`
- middle slot: blue AI chip, later becomes `E`
- right slot: human avatar, later becomes `O`

### Step order
1. Empty lane
2. Right avatar appears centered
3. Middle blue chip appears to the left, avatar shifts right
4. Left green chip appears, row becomes 3 tokens
5. Middle blue chip resolves into `E`
6. Right avatar resolves into `O`
7. Left green chip resolves into `N`

Final state:
- `N E O` reads as one wordmark
- no extra circles remain

### What to copy from the reference
- build from right to left
- resolve from center outward
- hold a clean empty lane before the first token appears
- use soft spring-like movement, not linear motion

### What can be adapted
- exact token artwork
- exact font family of the final letters
- exact timing values, as long as the order is preserved and the motion feels deliberate

## Task Breakdown

### Task 1: Replace the current animation state model
File:
- `src/components/landing/HeroIdentityAnimation.tsx`

Work:
- Delete the current single wrapper morph logic.
- Replace it with an explicit step sequence model.
- Use a small state machine driven by timed steps.
- Make the sequence readable from code. Prefer a `SEQUENCE` array over scattered timeout math.

Implementation notes:
- Store the active step index in state.
- Advance steps with `setTimeout`.
- Clear pending timeouts on unmount.
- Expose `data-sequence-step` on the root for easier testing and debugging.

### Task 2: Render the 3 slot entities
File:
- `src/components/landing/HeroIdentityAnimation.tsx`

Work:
- Render three logical entities: left, middle, right.
- Each entity should animate its position and visibility.
- Each entity should swap its content from token to letter in-place.

Implementation notes:
- Keep the entity wrappers stable across the whole sequence.
- Animate content inside each entity with `AnimatePresence`.
- Add `data-slot-id` and `data-slot-visual` attributes for tests.
- Use absolute positioning inside a fixed-height lane so the hero layout does not jump.

### Task 3: Build the token visuals
File:
- `src/components/landing/HeroIdentityAnimation.tsx`

Work:
- Create two AI chips:
  - green chip
  - blue chip
- Create one human avatar token using an existing local avatar asset.

Implementation notes:
- Reuse existing local assets. Do not fetch remote images.
- Keep token size consistent.
- White ring around circles is fine and matches the reference language.

### Task 4: Build the final `NEO` letter visuals
File:
- `src/components/landing/HeroIdentityAnimation.tsx`

Work:
- Replace each slot token with its final letter:
  - left => `N`
  - middle => `E`
  - right => `O`

Implementation notes:
- Style the letters as one coherent wordmark, not three unrelated badges.
- Make sure the final row is centered above the headline.
- Final letters should be larger than the token circles.

### Task 5: Keep the hero integration small
Files:
- `src/components/landing/Hero.tsx`
- `src/components/landing/Logo.tsx`

Work:
- Leave `Hero.tsx` mounted as-is unless spacing needs a small adjustment.
- Only touch `Logo.tsx` if the animation needs a shared primitive that already belongs there.

Implementation notes:
- Do not move more hero logic into the client component.
- Do not change CTA behavior.

### Task 6: Add focused tests
Files:
- `src/components/landing/HeroIdentityAnimation.test.tsx`
- `src/components/landing/Hero.test.tsx`

Work:
- Add a dedicated component test for sequence order.
- Keep the existing hero integration test.

Implementation notes:
- Use fake timers.
- Assert the exact slot order across steps:
  - avatar only
  - blue + avatar
  - green + blue + avatar
  - green + `E` + avatar
  - green + `E` + `O`
  - `N` + `E` + `O`
- Add one reduced-motion test that renders the final static `NEO`.

## Validation

### Automated
Run:

```bash
pnpm exec eslint src/components/landing/HeroIdentityAnimation.tsx src/components/landing/HeroIdentityAnimation.test.tsx src/components/landing/Hero.tsx src/components/landing/Hero.test.tsx
pnpm vitest run src/components/landing/HeroIdentityAnimation.test.tsx src/components/landing/Hero.test.tsx
```

### Manual
Run:

```bash
pnpm dev
```

Open:
- `http://localhost:3000`

Check:
- animation lane starts empty
- avatar appears first
- blue chip adds second
- green chip adds third
- middle resolves to `E`
- right resolves to `O`
- left resolves to `N`
- final `NEO` is centered and readable
- no hero content jumps during the sequence
- reduced motion shows static `NEO`

## Done Criteria

- Sequence order matches the tasklist exactly.
- Hero CTA test still passes.
- New component test passes.
- Reduced-motion fallback works.
- No other landing sections changed.
