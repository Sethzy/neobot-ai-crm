---
name: refactor
description: Systematic codebase refactoring - duplication, dead code, patterns, tests, docs
---

# Codebase Refactor

You are performing a systematic codebase refactoring session. Present the user with the following menu and ask which area(s) they want to focus on:

## Refactoring Menu

1. **Code Duplication** - Run jscpd, review duplicates, extract shared utilities
2. **Dead Code** - Run knip, remove unused exports/files/dependencies
3. **Lint & Patterns** - Run eslint (react-compiler, deprecation plugins), fix violations
4. **API Consolidation** - Audit API routes for redundancy, consolidate where possible
5. **Large File Splitting** - Find files >300 lines, propose splits by responsibility
6. **Modern React Patterns** - Find useEffect that could be replaced (derived state, event handlers, TanStack Query)
7. **Test Coverage** - Identify untested critical paths, add tests for tricky logic
8. **Slow Tests** - Profile test suite, rewrite slow tests
9. **Documentation** - Add JSDoc to undocumented exports, update stale docs
10. **Dependencies** - Check for outdated packages, review upgrade paths

## Instructions

1. Ask user which area(s) to focus on (they can pick multiple)
2. For each selected area, run the relevant analysis tool or manual audit
3. Present findings with file:line references
4. Propose specific fixes - get approval before making changes
5. Track progress using TodoWrite

## Tool Commands Reference

```bash
# Code duplication
npx jscpd src --reporters console --threshold 5

# Dead code analysis
npx knip

# Lint with all plugins
npm run lint

# Find large files
find src -name "*.ts" -o -name "*.tsx" | xargs wc -l | sort -n | tail -20

# Test coverage
npm run test -- --coverage

# Outdated dependencies
npm outdated
```

## Key Principles

- One refactor area at a time - don't boil the ocean
- Always run tests after changes
- Commit atomic changes with clear messages
- If a refactor grows complex, suggest splitting into separate PRs
