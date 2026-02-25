---
name: financial-analysis
description: Calculate ratios and interpret against industry benchmarks.
  Rule-based interpretation works because financial metrics have standardized
  thresholds. Use for ratio analysis, financial health checks, or benchmarking.
---

# Financial Analysis

## Philosophy

### Why Rule-Based Interpretation Works Here

Financial ratios have standardized industry benchmarks:
- Current ratio > 2 = healthy liquidity (well-established)
- Debt-to-equity thresholds by industry (documented)
- Profit margins comparable across sectors

The "judgment" can be encoded as conditionals because:
- Benchmarks are published and agreed-upon
- Thresholds are relatively stable
- Context is predictable (industry + company size)

### When This Doesn't Apply

Rule-based interpretation breaks down when:
- No standardized benchmarks exist
- Context is highly variable
- Semantic matching required (see contract-reconciliation)

## The Pattern

Calculate (always scriptable) → Interpret via rules (if benchmarks exist)

```python
# calculate_ratios.py - Pure math
current_ratio = current_assets / current_liabilities

# interpret_ratios.py - Rule-based judgment
if current_ratio > 2:
    rating = "Excellent"
elif current_ratio > 1:
    rating = "Adequate"
else:
    rating = "Concern"
```

## Source

Based on Anthropic cookbook:
https://github.com/anthropics/claude-cookbooks/tree/main/skills/custom_skills/analyzing-financial-statements
