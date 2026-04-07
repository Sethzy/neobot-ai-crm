/**
 * Test Supabase S3 session token RLS enforcement using the AWS SDK directly.
 * No sandbox, no FUSE — just testing whether the S3 API respects RLS via JWT.
 */
import jwt from "jsonwebtoken";
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET!;
const PROJECT_REF = new URL(SUPABASE_URL).hostname.split(".")[0];
const S3_ENDPOINT = `https://${PROJECT_REF}.supabase.co/storage/v1/s3`;

const USER_ID = "e9564aed-fb19-4131-9010-9e610e572dcd";
const CLIENT_ID_1 = "132e4b6e-b710-4714-ba95-db0039a547e0";
const CLIENT_ID_2 = "0e79aaa2-5c61-43c1-b345-f2fcd1a775fa";

async function testWithToken(label: string, sessionToken: string) {
  console.log(`\n--- ${label} ---`);

  const s3 = new S3Client({
    forcePathStyle: true,
    region: "us-east-1",
    endpoint: S3_ENDPOINT,
    credentials: {
      accessKeyId: PROJECT_REF,
      secretAccessKey: ANON_KEY,
      sessionToken,
    },
  });

  // List own client
  try {
    const own = await s3.send(new ListObjectsV2Command({
      Bucket: "agent-files",
      Prefix: `${CLIENT_ID_1}/`,
      Delimiter: "/",
      MaxKeys: 10,
    }));
    const prefixes = own.CommonPrefixes?.map(p => p.Prefix) ?? [];
    console.log(`Own client (${CLIENT_ID_1.slice(0, 8)}): ${prefixes.length} prefixes, ${own.Contents?.length ?? 0} objects`);
    if (prefixes.length > 0) console.log("  Prefixes:", prefixes);
  } catch (e: any) {
    console.log(`Own client ERROR: ${e.Code || e.message}`);
  }

  // List other client
  try {
    const other = await s3.send(new ListObjectsV2Command({
      Bucket: "agent-files",
      Prefix: `${CLIENT_ID_2}/`,
      Delimiter: "/",
      MaxKeys: 10,
    }));
    const prefixes = other.CommonPrefixes?.map(p => p.Prefix) ?? [];
    const objects = other.Contents?.length ?? 0;
    if (prefixes.length > 0 || objects > 0) {
      console.log(`Other client (${CLIENT_ID_2.slice(0, 8)}): ${prefixes.length} prefixes, ${objects} objects — RLS NOT ENFORCING!`);
    } else {
      console.log(`Other client (${CLIENT_ID_2.slice(0, 8)}): empty — RLS IS ENFORCING`);
    }
  } catch (e: any) {
    console.log(`Other client BLOCKED: ${e.Code || e.message} — RLS IS ENFORCING`);
  }

  // List bucket root
  try {
    const root = await s3.send(new ListObjectsV2Command({
      Bucket: "agent-files",
      Delimiter: "/",
      MaxKeys: 10,
    }));
    const prefixes = root.CommonPrefixes?.map(p => p.Prefix) ?? [];
    console.log(`Bucket root: ${prefixes.length} prefixes visible`);
    if (prefixes.length > 0) console.log("  Visible:", prefixes);
  } catch (e: any) {
    console.log(`Bucket root ERROR: ${e.Code || e.message}`);
  }
}

async function main() {
  // ── Test A: Hand-minted JWT with correct Supabase claims ──
  console.log("=== Minting JWT with correct Supabase claims ===");
  const mintedToken = jwt.sign({
    sub: USER_ID,
    aud: "authenticated",
    role: "authenticated",
    iss: `https://${PROJECT_REF}.supabase.co/auth/v1`,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  }, JWT_SECRET);
  console.log("Minted JWT length:", mintedToken.length);

  await testWithToken("MINTED JWT", mintedToken);

  // ── Test B: Real session token from Supabase auth ──
  console.log("\n\n=== Getting real session token from Supabase auth ===");
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: user } = await admin.auth.admin.getUserById(USER_ID);
  console.log("User:", user?.user?.email);

  const { data: link } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: user?.user?.email!,
  });

  if (link?.properties?.hashed_token) {
    const userClient = createClient(SUPABASE_URL, ANON_KEY);
    const { data: session, error } = await userClient.auth.verifyOtp({
      token_hash: link.properties.hashed_token,
      type: "magiclink",
    });

    if (session?.session?.access_token) {
      console.log("Real token length:", session.session.access_token.length);

      // Decode and compare claims
      const realDecoded = jwt.decode(session.session.access_token) as any;
      const mintedDecoded = jwt.decode(mintedToken) as any;
      console.log("\nClaim comparison:");
      console.log("  REAL  iss:", realDecoded?.iss);
      console.log("  MINTED iss:", mintedDecoded?.iss);
      console.log("  REAL  aud:", realDecoded?.aud);
      console.log("  MINTED aud:", mintedDecoded?.aud);
      console.log("  REAL  role:", realDecoded?.role);
      console.log("  MINTED role:", mintedDecoded?.role);
      console.log("  REAL  sub:", realDecoded?.sub);
      console.log("  MINTED sub:", mintedDecoded?.sub);
      console.log("  REAL  extra keys:", Object.keys(realDecoded).filter(k => !["iss","aud","role","sub","iat","exp"].includes(k)));

      await testWithToken("REAL SESSION TOKEN", session.session.access_token);
    } else {
      console.log("Could not get real session:", error?.message);
    }
  }

  console.log("\n\n=== SUMMARY ===");
}

main().catch(console.error);
