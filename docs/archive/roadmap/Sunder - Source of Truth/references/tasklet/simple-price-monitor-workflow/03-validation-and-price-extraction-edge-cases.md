# Validation and Price Extraction Edge Cases

## Pre-trigger validation run

Run one initial scrape before enabling schedule to verify:
- URL reachable
- price extraction feasible
- response format understood

## High-risk extraction failures

1. JS-rendered prices only
- static scrape misses runtime DOM updates
- may require browser-computer-use path

2. Multiple price candidates
- list price, discounted price, member price
- resolve with explicit heuristic priority

3. Currency mismatch
- threshold currency vs page currency mismatch
- return currency explicitly and avoid silent conversion assumptions

## Extraction strategy order

1. structured product metadata (JSON-LD)
2. semantic attributes/selectors
3. fallback regex patterns
4. ambiguity report if confidence is low

