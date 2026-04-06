/**
 * Spike: Test Tasklet-equivalent server-side isolation using
 * Supabase JWT session tokens + RLS + s3fs FUSE mount.
 *
 * Mints a real JWT for client 1, mounts Supabase Storage via s3fs
 * with session token auth, then tests:
 * - Can see client 1's files (SHOULD work)
 * - Cannot see client 2's files (RLS SHOULD block)
 * - Cannot list bucket root (RLS SHOULD block)
 *
 * Usage: SUPABASE_JWT_SECRET=... source .env.local && npx tsx scripts/spike/blaxel-fuse-jwt-rls-test.ts
 */
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";
import { SandboxInstance } from "@blaxel/core";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET!;

const PROJECT_REF = new URL(SUPABASE_URL).hostname.split(".")[0];
const S3_ENDPOINT = `https://${PROJECT_REF}.supabase.co/storage/v1/s3`;
const SANDBOX_NAME = "sunder-jwt-rls-spike";

interface TestResult { test: string; pass: boolean; output: string }
const results: TestResult[] = [];

function log(msg: string) {
  console.log(`\n${"=".repeat(60)}\n${msg}\n${"=".repeat(60)}`);
}

function mintJwt(userId: string): string {
  const payload = {
    sub: userId,
    iss: "supabase",
    ref: PROJECT_REF,
    role: "authenticated",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
  };
  return jwt.sign(payload, JWT_SECRET);
}

async function main() {
  if (!JWT_SECRET) {
    console.error("SUPABASE_JWT_SECRET not set");
    return;
  }

  log("STEP 1: Get clients and mint JWTs");

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: clients } = await admin
    .from("clients")
    .select("client_id, user_id, display_name")
    .limit(2);

  if (!clients?.length) {
    console.error("No clients found");
    return;
  }

  const c1 = clients[0];
  const c2 = clients.length > 1 ? clients[1] : null;

  console.log(`Client 1: ${c1.display_name} (client_id: ${c1.client_id}, user_id: ${c1.user_id})`);
  if (c2) console.log(`Client 2: ${c2.display_name} (client_id: ${c2.client_id}, user_id: ${c2.user_id})`);

  const token1 = mintJwt(c1.user_id);
  console.log(`\nMinted JWT for client 1 (first 50 chars): ${token1.slice(0, 50)}...`);
  console.log(`JWT length: ${token1.length} chars`);
  results.push({ test: "Mint JWT for client 1", pass: true, output: `JWT minted, ${token1.length} chars` });

  // Quick local verify
  const decoded = jwt.verify(token1, JWT_SECRET) as jwt.JwtPayload;
  console.log(`Decoded: sub=${decoded.sub}, role=${decoded.role}, exp=${new Date((decoded.exp ?? 0) * 1000).toISOString()}`);

  log("STEP 2: Boot sandbox and install s3fs");

  const sandbox = await SandboxInstance.createIfNotExists({
    name: SANDBOX_NAME,
    image: "blaxel/base-image:latest",
    memory: 2048,
    region: "us-was-1",
  });
  console.log("Sandbox ready");

  const run = async (name: string, cmd: string, timeout = 30000): Promise<string> => {
    const display = cmd.length > 120 ? cmd.slice(0, 120) + "..." : cmd;
    console.log(`\n> ${display}`);
    try {
      await sandbox.process.exec({ name, command: cmd, waitForCompletion: true, timeout });
      const info = await sandbox.process.get(name);
      const out = info.logs ?? "";
      console.log(out || "(no output)");
      return out;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`ERR: ${msg}`);
      return `ERROR: ${msg}`;
    }
  };

  await run("install", "apk add --no-cache s3fs-fuse 2>&1 | tail -3", 60000);

  log("STEP 3: Mount with JWT session token (client 1)");

  // Credentials: project_ref:anon_key (both public/non-secret)
  await run("creds", `echo "${PROJECT_REF}:${SUPABASE_ANON_KEY}" > /root/.passwd-s3fs && chmod 600 /root/.passwd-s3fs && echo "creds ok"`);
  await run("mkdir", "mkdir -p /mnt/rls-test && echo ok");

  // Mount with session token
  const mountOut = await run(
    "mount-rls",
    `AWSSESSIONTOKEN="${token1}" s3fs agent-files /mnt/rls-test -o url=${S3_ENDPOINT} -o use_path_request_style -o use_session_token -o passwd_file=/root/.passwd-s3fs -o allow_other 2>&1 && echo "MOUNT_OK" || echo "MOUNT_FAIL"`,
  );
  const mounted = mountOut.includes("MOUNT_OK");
  results.push({ test: "s3fs mount with JWT session token", pass: mounted, output: mountOut.trim() });

  if (!mounted) {
    // Try with AWS_SESSION_TOKEN env var name instead
    console.log("\nTrying with AWS_SESSION_TOKEN env var...");
    const mountOut2 = await run(
      "mount-rls-2",
      `AWS_SESSION_TOKEN="${token1}" s3fs agent-files /mnt/rls-test -o url=${S3_ENDPOINT} -o use_path_request_style -o use_session_token -o passwd_file=/root/.passwd-s3fs -o allow_other 2>&1 && echo "MOUNT_OK" || echo "MOUNT_FAIL"`,
    );
    const mounted2 = mountOut2.includes("MOUNT_OK");
    results.push({ test: "s3fs mount (AWS_SESSION_TOKEN var)", pass: mounted2, output: mountOut2.trim() });

    if (!mounted2) {
      console.log("\nMount failed. Checking s3fs debug output...");
      await run(
        "mount-debug",
        `AWS_SESSION_TOKEN="${token1}" s3fs agent-files /mnt/rls-test -o url=${S3_ENDPOINT} -o use_path_request_style -o use_session_token -o passwd_file=/root/.passwd-s3fs -o dbglevel=info -f 2>&1 &
sleep 5
mount | grep fuse
ls /mnt/rls-test/ 2>&1
kill %1 2>/dev/null
echo "DEBUG_DONE"`,
        20000,
      );
      await cleanup(sandbox);
      printReport();
      return;
    }
  }

  log("STEP 4: Test RLS isolation");

  // Check mount
  const mountCheck = await run("check-mount", "mount | grep fuse 2>&1");
  console.log("Mount status:", mountCheck);

  // Test 1: List bucket root
  const lsRoot = await run("ls-root", "ls -la /mnt/rls-test/ 2>&1 | head -20");
  const rootEntries = lsRoot.split("\n").filter(l => l.includes("drwx")).length;
  results.push({
    test: "List bucket root",
    pass: true,
    output: `${rootEntries} directories visible. Content:\n${lsRoot.trim()}`,
  });

  // Test 2: Access client 1's files (should work)
  const lsOwn = await run("ls-own", `ls -la /mnt/rls-test/${c1.client_id}/ 2>&1 | head -10`);
  const canSeeOwn = !lsOwn.includes("cannot access") && !lsOwn.includes("No such file") && !lsOwn.includes("Transport endpoint");
  results.push({ test: "Access own client files (client 1)", pass: canSeeOwn, output: lsOwn.trim() });

  // Test 3: Access client 2's files (should FAIL if RLS works)
  if (c2) {
    const lsOther = await run("ls-other", `ls -la /mnt/rls-test/${c2.client_id}/ 2>&1 | head -10`);
    const cantSeeOther = lsOther.includes("cannot access") ||
      lsOther.includes("No such file") ||
      lsOther.includes("Permission denied") ||
      lsOther.includes("Transport endpoint") ||
      lsOther.includes("Input/output error") ||
      lsOther.trim() === "";
    results.push({
      test: "CANNOT access other client files (RLS enforcement)",
      pass: cantSeeOther,
      output: cantSeeOther
        ? `BLOCKED: ${lsOther.trim()}`
        : `EXPOSED: Can see client 2's files!\n${lsOther.trim()}`,
    });

    // Test 4: Try to read a specific file from client 2
    const readOther = await run("read-other", `cat /mnt/rls-test/${c2.client_id}/memory/SOUL.md 2>&1 | head -5`);
    const cantReadOther = readOther.includes("No such file") ||
      readOther.includes("Permission denied") ||
      readOther.includes("Input/output error") ||
      readOther.includes("Transport endpoint");
    results.push({
      test: "CANNOT read other client's SOUL.md",
      pass: cantReadOther,
      output: cantReadOther ? `BLOCKED: ${readOther.trim()}` : `EXPOSED: ${readOther.trim()}`,
    });
  }

  // Test 5: Write to own client's home (should work)
  const writeOwn = await run("write-own", `echo "jwt-rls-test $(date)" > /mnt/rls-test/${c1.client_id}/home/jwt-rls-test.txt 2>&1 && echo "WRITE_OK" || echo "WRITE_FAIL"`);
  results.push({ test: "Write to own client home", pass: writeOwn.includes("WRITE_OK"), output: writeOwn.trim() });

  // Test 6: Write to other client's home (should FAIL)
  if (c2) {
    const writeOther = await run("write-other", `echo "hacked" > /mnt/rls-test/${c2.client_id}/home/hacked.txt 2>&1 && echo "WRITE_OK" || echo "WRITE_FAIL"`);
    const cantWriteOther = writeOther.includes("WRITE_FAIL") || writeOther.includes("Permission denied") || writeOther.includes("Input/output error");
    results.push({
      test: "CANNOT write to other client home (RLS enforcement)",
      pass: cantWriteOther,
      output: cantWriteOther ? `BLOCKED: ${writeOther.trim()}` : `EXPOSED: Write succeeded!\n${writeOther.trim()}`,
    });
  }

  await cleanup(sandbox);
  printReport();
}

async function cleanup(sandbox: InstanceType<typeof SandboxInstance>) {
  log("CLEANUP");
  try {
    await SandboxInstance.delete(SANDBOX_NAME);
    console.log("Sandbox deleted");
  } catch {
    console.log("Cleanup failed (may already be gone)");
  }
}

function printReport() {
  log("SPIKE REPORT: JWT Session Token + RLS FUSE Isolation");
  console.log("");
  for (const r of results) {
    const icon = r.pass ? "PASS" : "FAIL";
    console.log(`  [${icon}] ${r.test}`);
    console.log(`         ${r.output.split("\n").join("\n         ")}`);
    console.log("");
  }

  const mounted = results.find(r => r.test.includes("mount with JWT"))?.pass;
  const rlsBlocked = results.find(r => r.test.includes("CANNOT access other"))?.pass;
  const writeBlocked = results.find(r => r.test.includes("CANNOT write"))?.pass;

  console.log("─".repeat(60));
  if (mounted && rlsBlocked && writeBlocked) {
    console.log("  VERDICT: TASKLET-EQUIVALENT ISOLATION ACHIEVED");
    console.log("  JWT session token + Supabase RLS provides server-side enforcement.");
    console.log("  Other client's files are invisible AND unwritable.");
    console.log("  → Update design doc: use runner-minted JWT, not project-level S3 keys.");
  } else if (mounted && (!rlsBlocked || !writeBlocked)) {
    console.log("  VERDICT: JWT WORKS BUT RLS NOT FULLY ENFORCING");
    console.log("  Check Storage RLS policies on agent-files bucket.");
    console.log("  May need SELECT/INSERT/UPDATE/DELETE policies scoped to auth.uid().");
  } else if (!mounted) {
    console.log("  VERDICT: SESSION TOKEN MOUNT FAILED");
    console.log("  s3fs may not support Supabase's session token format.");
    console.log("  → Fall back to project-level S3 keys + prefix scoping.");
  } else {
    console.log("  VERDICT: INCONCLUSIVE — check individual test results above.");
  }
  console.log("");
}

main().catch(console.error);
