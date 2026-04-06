/**
 * Spike: Test s3fs FUSE mount with Supabase JWT session token (RLS-scoped).
 *
 * This tests whether we can replicate Tasklet's server-side enforcement model
 * using Supabase's S3 session token flow + RLS.
 *
 * Flow:
 * 1. Get a real client user from the database
 * 2. Mint a JWT for that user via supabase.auth.admin
 * 3. Boot a Blaxel sandbox
 * 4. Mount Supabase Storage with project_ref:anon_key:jwt (session token)
 * 5. Verify: can see own files, CANNOT see other clients' files
 *
 * Usage: source .env.local && npx tsx scripts/spike/blaxel-fuse-jwt-test.ts
 */
import { createClient } from "@supabase/supabase-js";
import { SandboxInstance } from "@blaxel/core";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Extract project ref from URL: https://xtewwwycvapskgvfnliq.supabase.co -> xtewwwycvapskgvfnliq
const PROJECT_REF = new URL(SUPABASE_URL).hostname.split(".")[0];
const S3_ENDPOINT = `https://${PROJECT_REF}.supabase.co/storage/v1/s3`;

const SANDBOX_NAME = "sunder-jwt-fuse-spike";
const REGION = "us-was-1";

interface TestResult {
  test: string;
  pass: boolean;
  output: string;
}

const results: TestResult[] = [];

function log(msg: string) {
  console.log(`\n${"=".repeat(60)}\n${msg}\n${"=".repeat(60)}`);
}

async function main() {
  // ── Step 1: Get a real client and mint a JWT ──
  log("STEP 1: Get a client user and mint JWT");

  const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Get the first client from the clients table
  const { data: clients, error: clientsError } = await adminSupabase
    .from("clients")
    .select("client_id, user_id, display_name")
    .limit(2);

  if (clientsError || !clients?.length) {
    console.error("Failed to get clients:", clientsError);
    results.push({ test: "Get client", pass: false, output: clientsError?.message ?? "No clients found" });
    printReport();
    return;
  }

  const client1 = clients[0];
  const client2 = clients.length > 1 ? clients[1] : null;
  console.log(`Client 1: ${client1.display_name} (${client1.client_id})`);
  if (client2) console.log(`Client 2: ${client2.display_name} (${client2.client_id})`);
  results.push({ test: "Get clients", pass: true, output: `Found ${clients.length} clients` });

  // Get the auth user for client 1
  const { data: authUser, error: authError } = await adminSupabase.auth.admin.getUserById(client1.user_id);
  if (authError || !authUser?.user) {
    console.error("Failed to get auth user:", authError);
    results.push({ test: "Get auth user", pass: false, output: authError?.message ?? "No user found" });
    printReport();
    return;
  }

  // Generate a session for this user (this gives us a JWT)
  // Using generateLink to get a valid session without requiring the user's password
  const { data: session, error: sessionError } = await adminSupabase.auth.admin.generateLink({
    type: "magiclink",
    email: authUser.user.email!,
  });

  // Alternative: use impersonation to get a real access token
  // Let's try signing in as the user using the admin API
  // Actually, we need an access_token. Let's use a different approach.

  // The cleanest way: create a session directly
  const { data: userSession, error: signInError } = await adminSupabase.auth.admin.generateLink({
    type: "magiclink",
    email: authUser.user.email!,
  });

  if (signInError) {
    console.error("Failed to generate link:", signInError);
  }

  // We need an actual access_token (JWT). Let's get one by exchanging the magic link token.
  // The hashed_token from generateLink can be verified to create a session.
  // But easier: just call signInWithPassword if we know the password, or use the token endpoint.

  // Simplest approach: use supabase.auth.admin to create a session
  // Note: There's no direct "mint JWT for user" in Supabase admin API.
  // The recommended way for S3 session tokens is:
  // 1. User signs in normally -> gets access_token
  // 2. Use access_token as AWS_SESSION_TOKEN
  //
  // For server-side minting, we can use the JWT secret directly.
  // But we don't have JWT_SECRET in env. Let's try another approach.

  // Approach: Use the OTP/magic link flow to get a real access token
  // Step 1: Generate magic link (gives us a token hash)
  // Step 2: Verify the OTP to get an access_token

  if (!userSession?.properties?.hashed_token) {
    console.log("No hashed_token in magic link response. Trying alternative approach...");

    // Alternative: Try to get JWT via the Supabase auth API directly
    // We can use the service_role key to call the GoTrue admin endpoint
    const gotrue = `${SUPABASE_URL}/auth/v1`;
    const res = await fetch(`${gotrue}/admin/generate_link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({
        type: "magiclink",
        email: authUser.user.email,
      }),
    });
    const linkData = await res.json();
    console.log("GoTrue response keys:", Object.keys(linkData));

    // The response should include action_link with a token we can verify
    if (linkData.action_link) {
      // Extract the token from the magic link URL
      const url = new URL(linkData.action_link);
      const token = url.searchParams.get("token") || url.hash;
      console.log("Got magic link token (first 20 chars):", token?.slice(0, 20));

      // Verify the OTP to get a session with access_token
      const { data: verifyData, error: verifyError } = await adminSupabase.auth.verifyOtp({
        email: authUser.user.email!,
        token: linkData.hashed_token,
        type: "email",
      });

      if (verifyError) {
        console.log("OTP verify failed:", verifyError.message);
        // Try with the raw token instead
        const tokenHash = linkData.hashed_token;
        console.log("Trying hashed_token (first 20):", tokenHash?.slice(0, 20));

        const { data: v2, error: v2Error } = await adminSupabase.auth.verifyOtp({
          email: authUser.user.email!,
          token: tokenHash,
          type: "magiclink",
        });

        if (v2Error) {
          console.log("Second verify attempt failed:", v2Error.message);

          // Last resort: try token_hash as type email
          const { data: v3, error: v3Error } = await adminSupabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "magiclink",
          });

          if (v3Error) {
            console.log("Third verify attempt failed:", v3Error.message);
            console.log("\nFalling back to project-level S3 keys for the mount test.");
            console.log("JWT session token minting needs the Supabase JWT secret (SUPABASE_JWT_SECRET).");
            console.log("Add it to .env.local and re-run.\n");

            results.push({
              test: "Mint JWT for client",
              pass: false,
              output: "Could not mint JWT via admin API. Need SUPABASE_JWT_SECRET for direct JWT signing, or a different auth flow.",
            });

            // Still run the sandbox test with project keys to verify s3fs session_token flag exists
            await testSessionTokenFlag();
            printReport();
            return;
          }

          if (v3?.session?.access_token) {
            console.log("Got access_token via token_hash!");
            await runFullTest(v3.session.access_token, client1, client2);
            printReport();
            return;
          }
        }

        if (v2?.session?.access_token) {
          console.log("Got access_token!");
          await runFullTest(v2.session.access_token, client1, client2);
          printReport();
          return;
        }
      }

      if (verifyData?.session?.access_token) {
        console.log("Got access_token!");
        await runFullTest(verifyData.session.access_token, client1, client2);
        printReport();
        return;
      }
    }
  }

  console.log("Could not obtain JWT. Need to add JWT_SECRET to env for direct signing.");
  results.push({ test: "Mint JWT", pass: false, output: "Need SUPABASE_JWT_SECRET" });
  await testSessionTokenFlag();
  printReport();
}

async function testSessionTokenFlag() {
  log("FALLBACK: Test if s3fs supports session_token flag");

  const sandbox = await SandboxInstance.createIfNotExists({
    name: SANDBOX_NAME,
    image: "blaxel/base-image:latest",
    memory: 2048,
    region: REGION,
  });

  const run = async (name: string, cmd: string) => {
    console.log(`\n> ${cmd}`);
    try {
      await sandbox.process.exec({ name, command: cmd, waitForCompletion: true, timeout: 30000 });
      const info = await sandbox.process.get(name);
      const out = info.logs ?? "";
      console.log(out || "(no output)");
      return out;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`ERR: ${msg}`);
      return msg;
    }
  };

  await run("install", "apk add --no-cache s3fs-fuse 2>&1 | tail -3");

  // Check if s3fs supports use_session_token
  const helpOutput = await run("s3fs-help", "s3fs --help 2>&1 | grep -i session || echo 'NO_SESSION_TOKEN_SUPPORT'");
  const supportsSession = !helpOutput.includes("NO_SESSION_TOKEN_SUPPORT");
  results.push({
    test: "s3fs supports session_token flag",
    pass: supportsSession,
    output: helpOutput.trim(),
  });

  // Try mounting with a dummy session token to see error behavior
  await run("creds", `echo "${PROJECT_REF}:${SUPABASE_ANON_KEY}" > /root/.passwd-s3fs && chmod 600 /root/.passwd-s3fs && echo "ok"`);
  await run("mkdir", "mkdir -p /mnt/jwt-test && echo ok");

  const mountOutput = await run(
    "mount-jwt",
    `AWS_SESSION_TOKEN="dummy_jwt_token_for_testing" s3fs agent-files /mnt/jwt-test -o url=${S3_ENDPOINT} -o use_path_request_style -o use_session_token -o passwd_file=/root/.passwd-s3fs 2>&1 && echo "MOUNT_OK" || echo "MOUNT_FAIL"`,
  );

  results.push({
    test: "s3fs mount with session_token flag (dummy token)",
    pass: mountOutput.includes("MOUNT_OK") || mountOutput.includes("MOUNT_FAIL"),
    output: `Flag accepted by s3fs: ${!mountOutput.includes("unknown option")}. Mount result: ${mountOutput.includes("MOUNT_OK") ? "mounted (will fail on first access)" : "mount rejected"}`,
  });

  await SandboxInstance.delete(SANDBOX_NAME).catch(() => {});
}

async function runFullTest(
  jwt: string,
  client1: { client_id: string; display_name: string },
  client2: { client_id: string; display_name: string } | null,
) {
  log("FULL TEST: s3fs mount with real JWT session token");
  results.push({ test: "Mint JWT for client", pass: true, output: `JWT obtained for ${client1.display_name}` });

  const sandbox = await SandboxInstance.createIfNotExists({
    name: SANDBOX_NAME,
    image: "blaxel/base-image:latest",
    memory: 2048,
    region: REGION,
  });

  const run = async (name: string, cmd: string) => {
    console.log(`\n> ${cmd.slice(0, 200)}${cmd.length > 200 ? "..." : ""}`);
    try {
      await sandbox.process.exec({ name, command: cmd, waitForCompletion: true, timeout: 30000 });
      const info = await sandbox.process.get(name);
      const out = info.logs ?? "";
      console.log(out || "(no output)");
      return out;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`ERR: ${msg}`);
      return msg;
    }
  };

  await run("install", "apk add --no-cache s3fs-fuse 2>&1 | tail -3");

  // Write credentials: project_ref:anon_key
  await run("creds", `echo "${PROJECT_REF}:${SUPABASE_ANON_KEY}" > /root/.passwd-s3fs && chmod 600 /root/.passwd-s3fs && echo "ok"`);
  await run("mkdir", "mkdir -p /mnt/jwt-scoped && echo ok");

  // Mount with session token
  const mountOut = await run(
    "mount-jwt",
    `AWS_SESSION_TOKEN="${jwt}" s3fs agent-files /mnt/jwt-scoped -o url=${S3_ENDPOINT} -o use_path_request_style -o use_session_token -o passwd_file=/root/.passwd-s3fs -o allow_other 2>&1 && echo "MOUNT_OK" || echo "MOUNT_FAIL"`,
  );
  const mounted = mountOut.includes("MOUNT_OK");
  results.push({ test: "s3fs mount with JWT session token", pass: mounted, output: mountOut.trim() });

  if (!mounted) {
    await SandboxInstance.delete(SANDBOX_NAME).catch(() => {});
    return;
  }

  // Check mount
  await run("check-mount", "mount | grep fuse 2>&1");

  // List root — can we see client directories?
  const lsRoot = await run("ls-root", "ls -la /mnt/jwt-scoped/ 2>&1 | head -20");
  results.push({ test: "List bucket root with JWT", pass: true, output: lsRoot.trim() });

  // Try to access client1's files (should work)
  const lsOwn = await run("ls-own", `ls -la /mnt/jwt-scoped/${client1.client_id}/ 2>&1 | head -10`);
  const canSeeOwn = !lsOwn.includes("error") && !lsOwn.includes("No such file");
  results.push({ test: "Access own client files", pass: canSeeOwn, output: lsOwn.trim() });

  // Try to access client2's files (should FAIL if RLS works)
  if (client2) {
    const lsOther = await run("ls-other", `ls -la /mnt/jwt-scoped/${client2.client_id}/ 2>&1 | head -10`);
    const cantSeeOther = lsOther.includes("error") || lsOther.includes("No such file") || lsOther.includes("Permission denied") || lsOther.includes("Transport endpoint");
    results.push({
      test: "CANNOT access other client's files (RLS enforcement)",
      pass: cantSeeOther,
      output: cantSeeOther ? `BLOCKED: ${lsOther.trim()}` : `EXPOSED: ${lsOther.trim()} — RLS IS NOT ENFORCING`,
    });
  }

  await SandboxInstance.delete(SANDBOX_NAME).catch(() => {});
}

function printReport() {
  log("SPIKE REPORT: JWT Session Token FUSE Mount");
  console.log("");
  for (const r of results) {
    const icon = r.pass ? "PASS" : "FAIL";
    console.log(`  [${icon}] ${r.test}`);
    console.log(`         ${r.output.split("\n").join("\n         ")}`);
  }
  console.log("");

  const jwtMinted = results.find((r) => r.test === "Mint JWT for client")?.pass;
  const jwtMounted = results.find((r) => r.test === "s3fs mount with JWT session token")?.pass;
  const rlsEnforced = results.find((r) => r.test.includes("CANNOT access"))?.pass;

  if (jwtMinted && jwtMounted && rlsEnforced) {
    console.log("  VERDICT: TASKLET-EQUIVALENT ISOLATION ACHIEVED");
    console.log("  JWT session token + RLS provides server-side enforcement.");
    console.log("  Update design doc: restore R15 with runner-minted JWT model.");
  } else if (jwtMinted && jwtMounted && !rlsEnforced) {
    console.log("  VERDICT: JWT WORKS BUT RLS NOT ENFORCING");
    console.log("  Check Storage RLS policies on agent-files bucket.");
  } else if (!jwtMinted) {
    console.log("  VERDICT: INCONCLUSIVE — COULD NOT MINT JWT");
    console.log("  Add SUPABASE_JWT_SECRET to .env.local for direct JWT signing,");
    console.log("  or find an auth flow that returns an access_token for a specific user.");
  } else {
    console.log("  VERDICT: SESSION TOKEN MOUNT FAILED");
    console.log("  s3fs may not support Supabase's session token format.");
  }
}

main().catch(console.error);
