import jwt from "jsonwebtoken";
import { SandboxInstance } from "@blaxel/core";

const PROJECT_REF = new URL(process.env.SUPABASE_URL!).hostname.split(".")[0];
const ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET!;
const S3_ENDPOINT = `https://${PROJECT_REF}.supabase.co/storage/v1/s3`;
const ACTIVE_USER_ID = "280d59ae-a367-4d7e-8e12-07218c1553b6";
const ACTIVE_CLIENT_ID = "d66bc1b7-d6b0-4651-96b2-f8ee25f3708a";

const token = jwt.sign({
  sub: ACTIVE_USER_ID, aud: "authenticated", role: "authenticated",
  iss: `https://${PROJECT_REF}.supabase.co/auth/v1`,
  iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
}, JWT_SECRET);

async function run(sb: InstanceType<typeof SandboxInstance>, name: string, cmd: string): Promise<string> {
  try {
    await sb.process.exec({ name, command: cmd, waitForCompletion: true, timeout: 30000 });
    const info = await sb.process.get(name);
    return info.logs ?? "";
  } catch (e: any) { return "ERR: " + e.message; }
}

async function main() {
  const sb = await SandboxInstance.get("sunder-rls-final-2");
  console.log("Connected to sandbox");

  // Unmount previous
  await run(sb, "umount", "fusermount -u /mnt/rls 2>/dev/null; echo ok");

  // Write creds
  await run(sb, "creds2", `printf '%s:%s' '${PROJECT_REF}' '${ANON_KEY}' > /root/.passwd-s3fs && chmod 600 /root/.passwd-s3fs && echo creds-ok`);

  // Mount with debug in background
  const mountCmd = `AWSSESSIONTOKEN='${token}' s3fs agent-files /mnt/rls -o url=${S3_ENDPOINT} -o use_path_request_style -o use_session_token -o passwd_file=/root/.passwd-s3fs -o allow_other -o dbglevel=info -o curldbg -f > /tmp/s3fs-debug.log 2>&1 &
sleep 4
echo MOUNT_BG_STARTED`;

  let out = await run(sb, "mount2", mountCmd);
  console.log("Mount:", out.trim());

  // Check mount
  out = await run(sb, "mnt2", "mount | grep s3fs && echo mounted || echo not-mounted");
  console.log("Mount check:", out.trim());

  // Try listing
  out = await run(sb, "ls2", `ls /mnt/rls/${ACTIVE_CLIENT_ID}/ 2>&1; echo EXIT=$?`);
  console.log("List own:", out.trim());

  // Get debug log
  out = await run(sb, "debug", "cat /tmp/s3fs-debug.log 2>&1 | tail -80");
  console.log("\n=== S3FS DEBUG LOG ===\n" + out);
}

main().catch(console.error);
