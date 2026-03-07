/**
 * Uploads chat image attachments to the public chat-attachments bucket.
 * Returns the reference-compatible metadata payload used by the chat composer.
 * @module app/api/files/upload/route
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveClientId } from "@/lib/chat/client-id";
import { createClient } from "@/lib/supabase/server";

const BUCKET_ID = "chat-attachments";

function isBlobLike(value: unknown): value is Blob {
  return (
    typeof value === "object" &&
    value !== null &&
    "size" in value &&
    typeof value.size === "number" &&
    "type" in value &&
    typeof value.type === "string" &&
    "arrayBuffer" in value &&
    typeof value.arrayBuffer === "function"
  );
}

const fileSchema = z.object({
  file: z
    .custom<Blob>(isBlobLike, { message: "Invalid input" })
    .refine((file) => file.size <= 5 * 1024 * 1024, {
      message: "File size should be less than 5MB",
    })
    .refine((file) => ["image/jpeg", "image/png"].includes(file.type), {
      message: "File type should be JPEG or PNG",
    }),
});

function getFileExtension(filename: string): string {
  const extension = filename.split(".").pop()?.trim().toLowerCase();
  return extension && extension.length > 0 ? extension : "jpg";
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const fileEntry = formData.get("file");
    const filenameField = formData.get("filename");

    if (fileEntry === null || typeof fileEntry === "string") {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const validatedFile = fileSchema.safeParse({ file: fileEntry });
    if (!validatedFile.success) {
      return NextResponse.json(
        { error: validatedFile.error.issues.map((issue) => issue.message).join(", ") },
        { status: 400 },
      );
    }

    const clientId = await resolveClientId(supabase, user.id);
    const filename = typeof filenameField === "string" && filenameField.trim().length > 0
      ? filenameField.trim()
      : (formData.get("file") as File).name;
    const fileExtension = getFileExtension(filename);
    const storageFilename = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${fileExtension}`;
    const storagePath = `${clientId}/${storageFilename}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_ID)
      .upload(storagePath, await fileEntry.arrayBuffer(), {
        contentType: fileEntry.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET_ID).getPublicUrl(storagePath);

    return NextResponse.json({
      url: publicUrl,
      pathname: filename,
      contentType: fileEntry.type,
    });
  } catch {
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}
