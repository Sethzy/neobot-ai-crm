## Sandbox Tenant Isolation Review

Date: April 6, 2026

Purpose: Record the exact adversarial tests run against the Blaxel + Supabase Storage tenant isolation model, with enough detail for another engineer to reproduce the results.

Scope:
- Direct S3 access using Supabase session-token auth
- `rclone` FUSE mounts inside the live Blaxel sandbox `sunder-rls-final-2`
- JWT edge cases: expired token, nonexistent `sub`, forged `authenticated`, forged `service_role`
- Signed URL behavior
- rclone config rotation behavior

This document intentionally omits plaintext passwords, `anon_key`, and the JWT signing secret. Those were supplied out-of-band for the review and should not be committed to the repo.

### Test Accounts Used

| Role | Name | User ID | Client ID |
| --- | --- | --- | --- |
| Attacker | Alice | `6950ba88-086b-4135-82d1-86771009f869` | `3bc3fead-143a-4fc3-8b19-36c5f84733b4` |
| Victim 1 | Bob | `2620e0fd-279b-4c95-bb41-83406a22b427` | `ed4ffa0a-8e9e-4c41-87b3-388bfce888b7` |
| Victim 2 | Carol | `84ac9c48-df27-494a-b51b-75712f31472e` | `5b001631-3b94-4954-a332-a168d83437bf` |

### Storage Model Under Test

Relevant policy:

```sql
CREATE POLICY "agent_files_select_own_prefix"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'agent-files'
    AND (storage.foldername(name))[1] = public.get_my_client_id()::text
  );
```

Resolver:

```sql
CREATE OR REPLACE FUNCTION public.get_my_client_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT client_id
  FROM public.clients
  WHERE user_id = auth.uid()
  LIMIT 1
$$;
```

The `clients.user_id` column is `UNIQUE`, so today there is a 1:1 mapping from `auth.uid()` to `client_id`.

## What Was Tested

### 1. Direct S3 access with Alice's JWT

Method:
- Minted an `authenticated` JWT for Alice using the supplied project signing key.
- Used AWS SDK `S3Client` with:
  - `accessKeyId = project_ref`
  - `secretAccessKey = anon_key`
  - `sessionToken = aliceJwt`
  - endpoint `https://{project_ref}.supabase.co/storage/v1/s3`

Checks performed:
- `ListObjectsV2` on bucket root
- `ListObjectsV2` on Alice, Bob, and Carol prefixes
- `GetObject` on Bob's known file path `ed4ffa0a-.../home/identity.txt`
- `PutObject` on Bob's path `ed4ffa0a-.../home/hacked-from-review.txt`

Observed results:
- Bucket root returned only Alice's client prefix:

```json
{
  "prefixes": [
    "3bc3fead-143a-4fc3-8b19-36c5f84733b4/"
  ],
  "keyCount": 1
}
```

- Alice prefix listed her subdirectories only:

```json
{
  "prefixes": [
    "3bc3fead-143a-4fc3-8b19-36c5f84733b4/home/",
    "3bc3fead-143a-4fc3-8b19-36c5f84733b4/memory/",
    "3bc3fead-143a-4fc3-8b19-36c5f84733b4/skills/",
    "3bc3fead-143a-4fc3-8b19-36c5f84733b4/uploads/"
  ],
  "keyCount": 4
}
```

- Bob prefix returned empty:

```json
{
  "prefixes": [],
  "objects": [],
  "keyCount": 0
}
```

- Carol prefix returned empty:

```json
{
  "prefixes": [],
  "objects": [],
  "keyCount": 0
}
```

- Reading Bob's known file path returned `404 NoSuchKey`:

```json
{
  "ok": false,
  "name": "NoSuchKey",
  "code": "NoSuchKey",
  "message": "Object not found",
  "status": 404
}
```

- Writing to Bob's prefix returned `403 AccessDenied` with an RLS failure:

```json
{
  "name": "AccessDenied",
  "code": "AccessDenied",
  "message": "new row violates row-level security policy",
  "status": 403
}
```

Conclusion:
- With only Alice's valid `authenticated` JWT, direct S3 access stayed inside Alice's tenant.
- Supabase masked foreign-object reads as `404`, which is acceptable from an isolation perspective.

### 2. Expired JWT behavior

Method:
- Minted an Alice JWT with `exp` in the past.
- Re-ran the same S3 operations.

Observed results:
- Every operation failed with `403 AccessDenied`.
- Error message was explicit:

```json
{
  "code": "AccessDenied",
  "message": "\"exp\" claim timestamp check failed",
  "status": 403
}
```

Conclusion:
- Expired tokens fail closed.

### 3. Nonexistent `sub` behavior

Method:
- Minted an `authenticated` JWT with `sub = 11111111-1111-1111-1111-111111111111`, which has no `clients` row.
- Re-ran root listing, foreign prefix listing, foreign object read, and foreign write.

Observed results:
- Root listing returned no prefixes.
- Alice/Bob/Carol prefix listing returned empty.
- Foreign read returned `404 NoSuchKey`.
- Foreign write returned `403 AccessDenied` / RLS violation.

Conclusion:
- `get_my_client_id()` returning `NULL` fails closed in practice.

### 4. rclone FUSE mount inside the live Blaxel sandbox as Alice

Sandbox used:
- `sunder-rls-final-2`

Method:
- Wrote `/tmp/rclone-alice.conf` with Alice's `session_token`.
- Mounted client-prefixed path:

```bash
rclone mount supabase:agent-files/3bc3fead-143a-4fc3-8b19-36c5f84733b4/ /agent \
  --config /tmp/rclone-alice.conf \
  --s3-list-version 2 \
  --vfs-cache-mode writes \
  --vfs-write-back 0s \
  --allow-other \
  --no-modtime \
  --dir-cache-time 5s
```

- Verified mount and read Alice's known file:

```text
IDENTITY=I am Alice. Role: ATTACKER. ClientId: 3bc3fead-143a-4fc3-8b19-36c5f84733b4. If you can read this from another account, ISOLATION IS BROKEN.
ALICE_ROOT=home,memory,skills,uploads,
```

- Tested directory traversal outside the mount:

```text
BOB_DIRECT=ls: /agent/../ed4ffa0a-8e9e-4c41-87b3-388bfce888b7: No such file or directory,
```

Conclusion:
- The client-prefixed FUSE mount only exposed Alice's tree.
- Escaping with `/agent/..` did not reveal Bob's directory.

### 5. Root `agent-files/` mount inside the live Blaxel sandbox as Alice

Method:
- Mounted bucket root instead of client-prefixed path:

```bash
rclone mount supabase:agent-files/ /mnt/root-test \
  --config /tmp/rclone-alice.conf \
  --s3-list-version 2 \
  --vfs-cache-mode writes \
  --vfs-write-back 0s \
  --allow-other \
  --no-modtime \
  --dir-cache-time 5s
```

Observed results:

```text
ROOT=3bc3fead-143a-4fc3-8b19-36c5f84733b4,
BOB=ls: /mnt/root-test/ed4ffa0a-8e9e-4c41-87b3-388bfce888b7: No such file or directory,
CAROL=ls: /mnt/root-test/5b001631-3b94-4954-a332-a168d83437bf: No such file or directory,
```

Direct rclone lookup against Bob's prefix also returned nothing:

```bash
rclone ls supabase:agent-files/ed4ffa0a-8e9e-4c41-87b3-388bfce888b7/ --config /tmp/rclone-alice.conf
```

Result:
- Empty output.

Write attempt into Bob's directory:

```text
EXIT=1
sh: can't create /mnt/root-test/ed4ffa0a-8e9e-4c41-87b3-388bfce888b7/home/hacked-from-sandbox.txt: nonexistent directory
```

Conclusion:
- Even a root mount collapses to the caller's RLS-visible subset.
- Alice could not materialize Bob or Carol through the filesystem view.

### 6. rclone config rotation does not retarget an existing mount

Method:
- Mounted bucket root with Alice's token.
- Overwrote the same rclone config file with Bob's token.
- Compared:
  - existing mount contents
  - new direct `rclone lsd` calls using the updated config

Observed results:

```json
{
  "before": "MOUNT=3bc3fead-143a-4fc3-8b19-36c5f84733b4,\nDIRECT=3bc3fead-143a-4fc3-8b19-36c5f84733b4,\n",
  "after": "MOUNT=3bc3fead-143a-4fc3-8b19-36c5f84733b4,\nDIRECT=ed4ffa0a-8e9e-4c41-87b3-388bfce888b7,\n"
}
```

Conclusion:
- Existing rclone mounts keep the credentials they were started with.
- Editing the config file at runtime changes new rclone commands, not the live mount.

This matters operationally:
- Token rotation requires remounting.
- A compromised sandbox cannot pivot an existing mount by editing the config alone.

### 7. Forged `authenticated` JWT for another user works if the project JWT secret is available

Method:
- Minted a valid `authenticated` JWT for Bob using the supplied project JWT signing key.
- Re-ran direct S3 list/write tests.

Observed results:
- Root listing showed Bob's client prefix only.
- Bob prefix listed Bob's `home/`, `memory/`, `skills/`, and `uploads/`.
- Writing to Bob's `home/hacked-from-review.txt` succeeded.

Observed Bob `home/` keys:

```json
[
  "ed4ffa0a-8e9e-4c41-87b3-388bfce888b7/home/hacked-from-review.txt",
  "ed4ffa0a-8e9e-4c41-87b3-388bfce888b7/home/identity.txt",
  "ed4ffa0a-8e9e-4c41-87b3-388bfce888b7/home/secret-victim_1.txt"
]
```

Conclusion:
- This is not a sandbox breakout.
- It is a broker-trust result: anyone who has the project JWT signing key can impersonate any user by minting a valid user JWT.

### 8. Forged `service_role` JWT bypasses storage RLS entirely if the project JWT secret is available

Method:
- Minted a JWT with:
  - `sub = Alice`
  - `role = service_role`
- Re-ran direct S3 listing and read tests.

Observed results:
- Bucket root listed all visible client prefixes, not just Alice's:

```json
{
  "prefixes": [
    "3bc3fead-143a-4fc3-8b19-36c5f84733b4/",
    "5b001631-3b94-4954-a332-a168d83437bf/",
    "d66bc1b7-d6b0-4651-96b2-f8ee25f3708a/",
    "de675b20-204e-477b-b14b-f96f8f9c095c/",
    "ed4ffa0a-8e9e-4c41-87b3-388bfce888b7/"
  ]
}
```

- Read of Bob's known file succeeded:

```text
I am Bob. Role: VICTIM_1. ClientId: ed4ffa0a-8e9e-4c41-87b3-388bfce888b7. If you can read this from another account, ISOLATION IS BROKEN.
```

Conclusion:
- This is the critical caveat in the design.
- If the project JWT signing key leaks, the blast radius is full-project storage compromise, not one-tenant compromise.

### 9. Signed URLs bypass RLS for the targeted object

Method:
- Minted a valid Bob user JWT using the supplied signing key.
- Used Supabase JS client with Bob auth to call:

```ts
supabase.storage.from("agent-files").createSignedUrl(
  "ed4ffa0a-8e9e-4c41-87b3-388bfce888b7/home/identity.txt",
  60
)
```

- Fetched the resulting signed URL without Bob's JWT attached.

Observed result:

```json
{
  "status": 200,
  "body": "I am Bob. Role: VICTIM_1. ClientId: ed4ffa0a-8e9e-4c41-87b3-388bfce888b7. If you can read this from another account, ISOLATION IS BROKEN.",
  "urlPath": "/storage/v1/object/sign/agent-files/ed4ffa0a-8e9e-4c41-87b3-388bfce888b7/home/identity.txt"
}
```

Conclusion:
- This is expected Supabase behavior for private buckets.
- Signed URLs are bearer tokens. If one is ever exposed into sandbox-visible state, RLS is irrelevant for that object until expiry.

### 10. What I did not find

With only:
- Alice's valid user JWT
- `project_ref`
- `anon_key`

I did not find a cross-tenant read or write path through:
- direct S3 requests
- client-prefixed rclone mount
- bucket-root rclone mount
- `../` traversal out of the mount
- explicit Bob/Carol prefix requests
- expired token edge case
- nonexistent `sub` edge case

## Final Assessment

What held:
- The `storage.objects` prefix policy behaved correctly for ordinary `authenticated` user JWTs.
- `get_my_client_id()` failed closed when no `clients` row existed.
- Alice's sandbox could not see or modify Bob/Carol through direct S3 or FUSE.

What another engineer must keep in mind:
- The project JWT signing key is the real crown jewel. If it leaks, an attacker can mint arbitrary user JWTs and, worse, `service_role` JWTs.
- Signed URLs are object-level RLS bypasses by design. Do not persist them into sandbox-readable artifacts, tool outputs, logs, or traces.
- rclone does not dynamically re-read config for a live mount. Rotation means remount.

## Relevant Code and Docs

- RLS policies: [supabase/migrations/20260302130000_create_agent_files_bucket.sql](/Users/sethlim/Documents/sunder-next-migration-20260225/supabase/migrations/20260302130000_create_agent_files_bucket.sql)
- `get_my_client_id()`: [supabase/migrations/20260301000005_add_rls_policies.sql](/Users/sethlim/Documents/sunder-next-migration-20260225/supabase/migrations/20260301000005_add_rls_policies.sql)
- `clients.user_id` uniqueness: [supabase/migrations/20260301000000_create_clients_table.sql](/Users/sethlim/Documents/sunder-next-migration-20260225/supabase/migrations/20260301000000_create_clients_table.sql)
- Signed URL minting helper: [src/lib/storage/agent-files.ts](/Users/sethlim/Documents/sunder-next-migration-20260225/src/lib/storage/agent-files.ts)
- Sandbox artifact sync returning signed URLs: [src/lib/runner/tools/sandbox/sync-output-artifacts.ts](/Users/sethlim/Documents/sunder-next-migration-20260225/src/lib/runner/tools/sandbox/sync-output-artifacts.ts)
- Sandbox tool returning artifact metadata to the model: [src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts](/Users/sethlim/Documents/sunder-next-migration-20260225/src/lib/runner/tools/sandbox/create-lazy-bash-tool.ts)
- User-facing download endpoint that mints signed URLs on demand: [app/api/files/download/route.ts](/Users/sethlim/Documents/sunder-next-migration-20260225/app/api/files/download/route.ts)
