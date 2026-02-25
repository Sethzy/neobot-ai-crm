# Sunder Client Onboarding Workflows

## Quick Reference

| Command | Purpose |
|---------|---------|
| `/1-process-transcript` | Transform call transcript → intake brief |
| `/2-onboard-client` | Run full onboarding (Phases 1-8) |

## Workflow Overview

```
Transcript → /1-process-transcript → Intake Brief
                                          ↓
                              /2-onboard-client
                                          ↓
                    ┌─────────────────────┴─────────────────────┐
                    │           ONBOARDING (Sequential)          │
                    │  3-onboard-config → 4-onboard-processors   │
                    │  → 5-onboard-schemas → 6-onboard-docgen    │
                    │  → 7-onboard-user                          │
                    └─────────────────────┬─────────────────────┘
                                          ↓
                    ┌─────────────────────┴─────────────────────┐
                    │         MAINTENANCE (Ad-hoc)               │
                    │  maintain-schema, maintain-validation,     │
                    │  maintain-docgen, maintain-evals           │
                    └────────────────────────────────────────────┘
```

## Shared References

All procedural knowledge lives in `templates/references/`:
- `schema-design/` - ExtendAI schema patterns and field descriptions
- `schema-procedures.md` - Pull/push/register schemas
- `validation-guide.md` - Writing validation rules
- `docgen-design/` - Cookbook patterns for docgen skills

## Detailed Documentation

See `2-client-onboarding/SKILL.md` for full orchestrator flow.
