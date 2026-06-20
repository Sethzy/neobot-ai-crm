# Security Policy

Do not commit credentials, local environment files, browser auth state,
cookies, Supabase service-role keys, OAuth tokens, or private customer data.

## Reporting

If you find a vulnerability or leaked secret, contact the maintainer privately
instead of opening a public issue. Include the affected file path, commit, and
any steps needed to reproduce or verify the issue.

## Local Secret Hygiene

- Use `.env.local` for local credentials.
- Keep `.mcp.json` local; `.mcp.example.json` is the safe template.
- Rotate any credential or session that has been committed, even if it is later
  removed from the current tree.
- Run a tracked-file secret scan before pushing sensitive cleanup work.
