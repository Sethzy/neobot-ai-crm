---
name: hoh-law-docgen
description: This skill calculates claim totals, identifies coverage gaps, and summarizes injuries from medical documents for personal injury case preparation
---

# Personal Injury Claim Calculator Skill

This skill provides comprehensive claim analysis for evaluating medical expenses, coverage opportunities, and injury severity in Singapore personal injury cases.

## Capabilities

Calculate and interpret:
- **Expense Totals**: Gross amounts, out-of-pocket costs, coverage ratios
- **Payment Breakdowns**: By provider, payment source (Medisave, MediShield, insurance, employer)
- **Coverage Gaps**: Missing Medisave claims, unclaimed insurance, MediShield opportunities
- **Income Analysis**: Average monthly earnings, employer breakdown, loss-of-earning baseline
- **Injury Summary**: Body parts affected, severity flags, escalation requirements
- **Recovery Opportunities**: Potential amounts recoverable from unclaimed benefits

## How to Use

1. **Input Data**: Provide extracted document data (medical expenses, reports, income documents)
2. **Select Analysis**: Specify which calculations to run or use "all" for comprehensive analysis
3. **Interpretation**: The skill will calculate totals and provide actionable recommendations

## Input Format

Document data can be provided as:
- JSON with extracted splits by document type
- Individual expense records with payment breakdowns
- Medical reports with injury details
- Income documents with salary information

## Output Format

Results include:
- Calculated totals with breakdowns
- Coverage gap identification
- Injury severity assessment
- Prioritized action items
- Excel report with formatted results

## Example Usage

"Calculate total claim amount and coverage ratio from the attached medical expenses"

"What coverage gaps exist in these bills? Are there potential Medisave claims?"

"Summarize all injuries and flag any serious findings requiring escalation"

## Scripts

- `calculate_claims.py`: Main calculation engine for expenses, income, and injury summaries
- `interpret_claims.py`: Provides recommendations and identifies recovery opportunities

## Best Practices

1. Always validate data completeness before calculations
2. Flag bills with missing coverage for follow-up with patient
3. Consider Singapore healthcare context when interpreting results
4. Include period comparisons for treatment timeline clarity
5. Flag serious injuries for immediate legal team attention

## Limitations

- Requires accurate extracted document data
- Coverage eligibility requires verification with CPF/insurers
- Income calculations assume consistent earning patterns
- Medical assessments require professional legal review
