# Connection Setup and Auth Failure Handling

## Minimal-permission setup path

1. Check existing connections.
2. Discover calendar integration.
3. Verify capability coverage.
4. Create connection with least-required tools activated.

## Expected auth outcomes

1. User approves OAuth
- connection created
- tools activated
- run can proceed

2. User skips OAuth
- cannot execute workflow
- prompt retry/alternative provider path

3. Partial permission grant
- detect missing fields on first API call
- explain missing scope and request reauthorization

4. Expired/revoked token
- detect auth error (401/403-like)
- run reauthorization flow
- preserve trigger configuration (do not destroy pipeline)

## Reliability recommendation

Treat auth failures as operational incidents with explicit logging and user-visible remediation tasks, not silent skips.

