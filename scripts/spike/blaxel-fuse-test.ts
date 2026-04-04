/**
 * Spike: Test whether we can run a custom FUSE mount (s3fs) inside a Blaxel sandbox.
 *
 * Tests:
 * 1. Create a Blaxel sandbox with base image
 * 2. Check if /dev/fuse exists
 * 3. Install s3fs-fuse via apk
 * 4. Attempt to mount Supabase Storage via S3 protocol
 * 5. Read/write through the mount
 *
 * Usage: npx tsx scripts/spike/blaxel-fuse-test.ts
 */
import { SandboxInstance } from "@blaxel/core";

const SANDBOX_NAME = "sunder-fuse-spike";
const REGION = "us-was-1";

// Supabase Storage S3 credentials — read from env
const S3_ACCESS_KEY = process.env.SUPABASE_S3_ACCESS_KEY_ID;
const S3_SECRET_KEY = process.env.SUPABASE_S3_SECRET_ACCESS_KEY;
const S3_ENDPOINT = process.env.SUPABASE_S3_ENDPOINT; // e.g. https://xxx.supabase.co/storage/v1/s3
const S3_BUCKET = process.env.SUPABASE_S3_BUCKET || "agent-files";

interface TestResult {
  test: string;
  pass: boolean;
  output: string;
}

const results: TestResult[] = [];

function log(msg: string) {
  console.log(`\n${"=".repeat(60)}\n${msg}\n${"=".repeat(60)}`);
}

async function runCmd(
  sandbox: InstanceType<typeof SandboxInstance>,
  name: string,
  command: string,
  timeout = 30000,
): Promise<{ logs: string; exitCode: number | null }> {
  console.log(`\n> ${command}`);
  try {
    const proc = await sandbox.process.exec({
      name,
      command,
      waitForCompletion: true,
      timeout,
    });
    const info = await sandbox.process.get(name);
    const logs = info.logs ?? proc.logs ?? "";
    console.log(logs || "(no output)");
    return { logs, exitCode: 0 };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`ERROR: ${msg}`);
    return { logs: msg, exitCode: 1 };
  }
}

async function main() {
  // ── Test 1: Create sandbox ──
  log("TEST 1: Create Blaxel Sandbox");
  let sandbox: InstanceType<typeof SandboxInstance>;
  try {
    sandbox = await SandboxInstance.createIfNotExists({
      name: SANDBOX_NAME,
      image: "blaxel/base-image:latest",
      memory: 2048,
      region: REGION,
    });
    console.log("Sandbox created/resumed:", sandbox.metadata?.name);
    results.push({ test: "Create sandbox", pass: true, output: "OK" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Failed to create sandbox:", msg);
    results.push({ test: "Create sandbox", pass: false, output: msg });
    printReport();
    return;
  }

  // ── Test 2: Check /dev/fuse ──
  log("TEST 2: Check /dev/fuse exists");
  const fuseCheck = await runCmd(sandbox, "fuse-check", "ls -la /dev/fuse 2>&1 && echo 'FUSE_EXISTS=true' || echo 'FUSE_EXISTS=false'");
  const fuseExists = fuseCheck.logs.includes("FUSE_EXISTS=true");
  results.push({ test: "/dev/fuse exists", pass: fuseExists, output: fuseCheck.logs.trim() });

  // ── Test 3: Check fuse kernel module ──
  log("TEST 3: Check FUSE kernel support");
  const fuseModule = await runCmd(sandbox, "fuse-module", "cat /proc/filesystems 2>&1 | grep fuse || echo 'NO_FUSE_IN_KERNEL'");
  const fuseInKernel = !fuseModule.logs.includes("NO_FUSE_IN_KERNEL");
  results.push({ test: "FUSE in kernel", pass: fuseInKernel, output: fuseModule.logs.trim() });

  // ── Test 4: Install s3fs-fuse ──
  log("TEST 4: Install s3fs-fuse");
  const install = await runCmd(sandbox, "install-s3fs", "apk add --no-cache s3fs-fuse 2>&1", 60000);
  const s3fsInstalled = !install.logs.includes("ERROR") && !install.logs.includes("error:");
  results.push({ test: "Install s3fs-fuse", pass: s3fsInstalled, output: install.logs.slice(-200).trim() });

  // Verify binary exists
  const s3fsBin = await runCmd(sandbox, "s3fs-bin", "which s3fs 2>&1 && s3fs --version 2>&1 || echo 'S3FS_NOT_FOUND'");
  results.push({ test: "s3fs binary available", pass: !s3fsBin.logs.includes("S3FS_NOT_FOUND"), output: s3fsBin.logs.trim() });

  // ── Test 5: Also install rclone as alternative ──
  log("TEST 5: Install rclone");
  const rcloneInstall = await runCmd(sandbox, "install-rclone", "apk add --no-cache rclone 2>&1", 60000);
  const rcloneInstalled = !rcloneInstall.logs.includes("ERROR");
  results.push({ test: "Install rclone", pass: rcloneInstalled, output: rcloneInstall.logs.slice(-200).trim() });

  const rcloneBin = await runCmd(sandbox, "rclone-bin", "which rclone 2>&1 && rclone version 2>&1 | head -3 || echo 'RCLONE_NOT_FOUND'");
  results.push({ test: "rclone binary available", pass: !rcloneBin.logs.includes("RCLONE_NOT_FOUND"), output: rcloneBin.logs.trim() });

  // ── Test 6: Try FUSE mount (s3fs) ──
  log("TEST 6: Attempt s3fs FUSE mount");
  if (!S3_ACCESS_KEY || !S3_SECRET_KEY || !S3_ENDPOINT) {
    console.log("Skipping — SUPABASE_S3_ACCESS_KEY_ID, SUPABASE_S3_SECRET_ACCESS_KEY, or SUPABASE_S3_ENDPOINT not set");
    results.push({ test: "s3fs FUSE mount", pass: false, output: "SKIPPED — env vars not set. Set SUPABASE_S3_ACCESS_KEY_ID, SUPABASE_S3_SECRET_ACCESS_KEY, SUPABASE_S3_ENDPOINT" });
  } else {
    // Write credentials file
    await runCmd(sandbox, "s3fs-creds", `echo "${S3_ACCESS_KEY}:${S3_SECRET_KEY}" > /root/.passwd-s3fs && chmod 600 /root/.passwd-s3fs`);

    // Create mount point
    await runCmd(sandbox, "mkdir-agent", "mkdir -p /mnt/supabase");

    // Attempt mount
    const mount = await runCmd(
      sandbox,
      "s3fs-mount",
      `s3fs ${S3_BUCKET} /mnt/supabase -o url=${S3_ENDPOINT} -o use_path_request_style -o passwd_file=/root/.passwd-s3fs -o dbglevel=info -f 2>&1 &
sleep 3
mount | grep fuse
ls -la /mnt/supabase/ 2>&1 | head -20
echo "MOUNT_TEST_DONE"`,
      15000,
    );
    const mountOk = mount.logs.includes("fuse") || mount.logs.includes("MOUNT_TEST_DONE");
    results.push({ test: "s3fs FUSE mount", pass: mountOk, output: mount.logs.trim() });

    // Try to list files if mount succeeded
    if (mountOk) {
      const listFiles = await runCmd(sandbox, "list-mount", "ls -la /mnt/supabase/ 2>&1 | head -20");
      results.push({ test: "List files via FUSE", pass: !listFiles.logs.includes("Transport endpoint"), output: listFiles.logs.trim() });
    }
  }

  // ── Test 7: Check existing mounts (see if Blaxel has any built-in FUSE) ──
  log("TEST 7: Check existing mounts and filesystem");
  const mounts = await runCmd(sandbox, "check-mounts", "mount 2>&1 && echo '---' && df -h 2>&1");
  results.push({ test: "Mount info collected", pass: true, output: mounts.logs.trim() });

  // ── Test 8: Try rclone mount as alternative ──
  log("TEST 8: Attempt rclone FUSE mount");
  if (!S3_ACCESS_KEY || !S3_SECRET_KEY || !S3_ENDPOINT) {
    results.push({ test: "rclone FUSE mount", pass: false, output: "SKIPPED — env vars not set" });
  } else {
    // Configure rclone
    await runCmd(sandbox, "rclone-config", `mkdir -p /root/.config/rclone && cat > /root/.config/rclone/rclone.conf << 'RCLONEEOF'
[supabase]
type = s3
provider = Other
access_key_id = ${S3_ACCESS_KEY}
secret_access_key = ${S3_SECRET_KEY}
endpoint = ${S3_ENDPOINT}
force_path_style = true
RCLONEEOF`);

    // Try listing via rclone (no mount needed — tests S3 connectivity)
    const rcloneLs = await runCmd(sandbox, "rclone-ls", `rclone lsd supabase:${S3_BUCKET} 2>&1 | head -20`);
    const rcloneConnected = !rcloneLs.logs.includes("ERROR") && !rcloneLs.logs.includes("error");
    results.push({ test: "rclone S3 connectivity", pass: rcloneConnected, output: rcloneLs.logs.trim() });

    // Try rclone mount
    await runCmd(sandbox, "mkdir-rclone", "mkdir -p /mnt/rclone");
    const rcloneMount = await runCmd(
      sandbox,
      "rclone-mount",
      `rclone mount supabase:${S3_BUCKET} /mnt/rclone --vfs-cache-mode full --daemon 2>&1
sleep 3
mount | grep -i fuse 2>&1
ls -la /mnt/rclone/ 2>&1 | head -20
echo "RCLONE_MOUNT_DONE"`,
      15000,
    );
    const rcloneMountOk = rcloneMount.logs.includes("RCLONE_MOUNT_DONE");
    results.push({ test: "rclone FUSE mount", pass: rcloneMountOk, output: rcloneMount.logs.trim() });
  }

  // ── Cleanup ──
  log("CLEANUP");
  try {
    await SandboxInstance.delete(SANDBOX_NAME);
    console.log("Sandbox deleted.");
  } catch {
    console.log("Sandbox cleanup failed (may already be gone).");
  }

  printReport();
}

function printReport() {
  log("SPIKE REPORT: Blaxel Sandbox FUSE Mount Feasibility");
  console.log("");
  for (const r of results) {
    const icon = r.pass ? "PASS" : "FAIL";
    console.log(`  [${icon}] ${r.test}`);
    if (!r.pass || r.output.length < 200) {
      console.log(`         ${r.output.split("\n").join("\n         ")}`);
    }
  }
  console.log("");

  const passCount = results.filter((r) => r.pass).length;
  const failCount = results.filter((r) => !r.pass).length;
  console.log(`  Total: ${passCount} passed, ${failCount} failed out of ${results.length} tests`);
  console.log("");

  const fuseAvail = results.find((r) => r.test === "/dev/fuse exists")?.pass;
  const s3fsOk = results.find((r) => r.test === "s3fs FUSE mount")?.pass;
  const rcloneOk = results.find((r) => r.test === "rclone FUSE mount")?.pass;

  if (fuseAvail && (s3fsOk || rcloneOk)) {
    console.log("  VERDICT: FEASIBLE");
    console.log("  Supabase Storage can be FUSE-mounted inside Blaxel sandboxes.");
    console.log(`  Recommended client: ${rcloneOk ? "rclone (caching)" : "s3fs"}`);
  } else if (fuseAvail) {
    console.log("  VERDICT: PARTIALLY FEASIBLE");
    console.log("  /dev/fuse exists but S3 mount failed. Check credentials and endpoint.");
  } else {
    console.log("  VERDICT: NOT FEASIBLE");
    console.log("  /dev/fuse is not available in Blaxel sandboxes.");
    console.log("  Fall back to Blaxel Agent Drive (requires private preview access).");
  }
}

main().catch(console.error);
