# QA Surface 17: Calculate Tool

> **PRs covered:** 8b (Math.js calculate tool)
> **Dogfoodable:** No (agent tool, tested via chat prompts)
> **Time estimate:** 10-15 min manual

---

## Prerequisites

- Logged in with working chat

---

## Dogfood Checklist (automated browser pass)

Not applicable — agent-side tool, results visible in chat responses.

---

## Manual QA Scenarios

### 17.1 Basic commission calculation

1. In chat: "What is 1% commission on a $1.8M property sale with 60/40 co-broke split?"
2. **Expected:** Agent calls `calculate` tool (visible in tool pill)
3. **Expected:** Correct result: $10,800 (agent's 60% share) or $7,200 (40% share)
4. **Expected:** Agent presents the math clearly

**Notes / failures:**

---

### 17.2 Multi-step financial calculation

1. "I'm selling a condo for $2.5M. Commission is 2%. GST is 9% on commission. What's the net commission after GST?"
2. **Expected:** Agent chains multiple `calculate` calls or uses one expression
3. **Expected:** Mathematically correct result

**Notes / failures:**

---

### 17.3 Unit conversion

1. "Convert 1500 square feet to square meters"
2. **Expected:** Agent calls calculate tool with unit conversion syntax
3. **Expected:** Correct result (~139.35 sqm)

**Notes / failures:**

---

### 17.4 Percentage and amortization

1. "If a $1M property appreciates at 3% per year for 5 years, what's the final value?"
2. **Expected:** Agent calculates compound growth correctly
3. **Expected:** Result: ~$1,159,274

**Notes / failures:**

---

### 17.5 Named variables

1. "Property price is $800,000. Down payment is 25%. Stamp duty is 3% on the first $180K and 4% above that. Calculate stamp duty."
2. **Expected:** Agent uses named variables for clarity in the calculate call
3. **Expected:** Correct stamp duty amount

**Notes / failures:**

---

## Edge Cases

- [ ] Very large numbers (billions) — handles without overflow
- [ ] Division by zero — returns error, doesn't crash agent
- [ ] Agent asked to do math that doesn't need calculate tool (e.g., "what's 2+2") — may answer directly or use tool, either is fine
- [ ] Agent asked to evaluate code (e.g., "run `import os`") — tool rejects dangerous functions

---

## Pass / Fail Criteria

- **Pass:** Agent uses calculate tool for financial math. Results are accurate. Unit conversions work. Multi-step calculations chain correctly. Dangerous expressions rejected.
- **Fail:** Agent hallucinates math instead of using the tool. Calculate results are wrong. Dangerous expressions execute.
