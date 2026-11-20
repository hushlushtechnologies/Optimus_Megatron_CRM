"use client";

import { createClient } from "@/src/lib/supabase/client";

/*
|--------------------------------------------------------------------------
| ENQUIRY PHOTOS
|--------------------------------------------------------------------------
|
| Photos of a member of the public's own car, usually with a number plate in
| frame and sometimes a driveway behind it. The bucket is private — unlike
| car-media, which is a showroom listing meant to be seen — so nothing here
| returns a public URL. Reading goes through a short-lived signed URL minted
| on the server.
*/

const BUCKET = "enquiry-media";

/* Matches the bucket's own allowed_mime_types and file_size_limit. */
const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

export const ENQUIRY_PHOTO_LIMIT_LABEL = "JPG, PNG or WebP, up to 10 MB each";

/** How many photos one vehicle may carry. Enough for a walk-around, not a gallery. */
export const ENQUIRY_PHOTO_MAX = 12;

export function validateEnquiryPhoto(file: File): string | null {
  if (!TYPES.includes(file.type)) {
    return `"${file.name}" isn't a supported format. Accepted: ${ENQUIRY_PHOTO_LIMIT_LABEL}.`;
  }

  if (file.size > MAX_BYTES) {
    return `"${file.name}" is too large. Accepted: ${ENQUIRY_PHOTO_LIMIT_LABEL}.`;
  }

  return null;
}

/**
 * Puts one photo in the bucket and hands back where it went.
 *
 * `folder` is a draft id generated when the form opens, because the enquiry
 * does not exist yet when somebody attaches photos to it. The path is only
 * ever an address — what ties a photo to an enquiry is the enquiry_media
 * row written when the enquiry is saved.
 */
export async function uploadEnquiryPhoto(folder: string, file: File) {
  const supabase = createClient();

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${folder}/${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });

  if (error) {
    console.error("uploadEnquiryPhoto error:", error);
    return { path: null, error: "That photo didn't upload. Check your connection and try again." };
  }

  return { path, error: null };
}

/** Takes a photo back out, for one removed before the enquiry was saved. */
export async function removeEnquiryPhoto(path: string) {
  const supabase = createClient();

  const { error } = await supabase.storage.from(BUCKET).remove([path]);

  if (error) console.error("removeEnquiryPhoto error:", error);
}

/**
 * A preview of a file the browser already holds.
 *
 * Shown instead of re-downloading what was just uploaded. The caller is
 * responsible for revoking it — an object URL pins the file in memory until
 * somebody does.
 */
export function previewUrl(file: File): string {
  return URL.createObjectURL(file);
}
