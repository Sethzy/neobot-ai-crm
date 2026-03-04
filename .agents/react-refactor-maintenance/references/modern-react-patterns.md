# Modern React Patterns for Refactors

## Remove Unnecessary `useEffect`

Use this rule of thumb: if logic can run during render or in an event handler, it usually should not be in an effect.

## Common Rewrites

1. Derived state in render instead of effect + state
   - Replace:
     - `useEffect(() => setFiltered(items.filter(...)), [items])`
   - With:
     - `const filtered = useMemo(() => items.filter(...), [items])`

2. Reset state by key instead of effect
   - Replace:
     - `useEffect(() => setForm(initial), [id])`
   - With:
     - `<Form key={id} initial={initial} />`

3. User actions in handlers instead of effect watchers
   - Replace:
     - effect that watches state and then calls API
   - With:
     - direct API call in submit/click handler

4. Subscription effects stay in effects
   - Keep effects for external systems only:
     - sockets
     - timers
     - DOM APIs
     - third-party widgets

## Safer Refactor Sequence

1. Add/adjust tests around current behavior.
2. Replace effect-driven state with render-time derivation.
3. Collapse duplicate state where possible.
4. Re-run lint and tests.
5. Remove obsolete comments and dead helper code.

## Signals That Refactor Is Worth Doing

- Duplicate state mirrors props.
- Effect only transforms local data.
- Effect sets state every render cycle.
- Effect creates ordering bugs or stale closures.

## Signals to Avoid Over-Refactoring

- Existing code is stable and easy to follow.
- Rewrite introduces abstraction that hides intent.
- Performance is already acceptable and profile data is absent.
