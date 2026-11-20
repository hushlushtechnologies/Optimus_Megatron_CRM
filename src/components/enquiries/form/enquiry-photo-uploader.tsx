"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Loader2, X } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  ENQUIRY_PHOTO_LIMIT_LABEL,
  ENQUIRY_PHOTO_MAX,
  previewUrl,
  removeEnquiryPhoto,
  uploadEnquiryPhoto,
  validateEnquiryPhoto,
} from "@/src/lib/supabase/enquiry-storage";

/** A photo that is in the bucket, with the local preview it was uploaded from. */
export interface StagedPhoto {
  path: string;
  preview: string;
  name: string;
}

interface EnquiryPhotoUploaderProps {
  /** A draft id, generated when the form opened. Becomes the folder in storage. */
  folder: string;
  photos: StagedPhoto[];
  onChange: (next: StagedPhoto[]) => void;
}

/**
 * Photos of the customer's own car, uploaded as they are chosen.
 *
 * Uploaded immediately rather than held until the form is submitted: these
 * are often a dozen photos off a phone over a showroom connection, and
 * discovering that at the moment somebody presses Save is the worst time to
 * find out it is slow.
 *
 * The preview shown is the local file, not a download of what was just
 * uploaded. The bucket is private, so a round trip would mean signing a URL
 * for a picture already sitting in the browser's memory.
 */
export function EnquiryPhotoUploader({ folder, photos, onChange }: EnquiryPhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * Object URLs pin their file in memory until revoked. Tracked in a ref
   * rather than cleaned up per photo, so a preview is never revoked while
   * it is still on screen.
   */
  const created = useRef<string[]>([]);

  useEffect(() => {
    const urls = created.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const room = ENQUIRY_PHOTO_MAX - photos.length;

  const add = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setError(null);

    const chosen = Array.from(files);

    if (chosen.length > room) {
      setError(`You can attach ${ENQUIRY_PHOTO_MAX} photos in total. Pick ${room} or fewer.`);
      return;
    }

    const rejected = chosen.map(validateEnquiryPhoto).find(Boolean);

    if (rejected) {
      setError(rejected);
      return;
    }

    setBusy(true);

    try {
      const added: StagedPhoto[] = [];

      for (const file of chosen) {
        const result = await uploadEnquiryPhoto(folder, file);

        if (result.error || !result.path) {
          setError(result.error);
          break;
        }

        const preview = previewUrl(file);
        created.current.push(preview);

        added.push({ path: result.path, preview, name: file.name });
      }

      /* Whatever made it through is kept: a failure on photo 9 keeps 1 to 8. */
      if (added.length > 0) onChange([...photos, ...added]);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const drop = async (photo: StagedPhoto) => {
    onChange(photos.filter((item) => item.path !== photo.path));

    /* Taken out of the bucket too, or an abandoned photo stays there forever. */
    await removeEnquiryPhoto(photo.path);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          onChange={(event) => void add(event.target.files)}
        />

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || room <= 0}
          onClick={() => inputRef.current?.click()}
          leftIcon={
            busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <ImagePlus className="size-4" aria-hidden="true" />
            )
          }
        >
          {busy ? "Uploading…" : "Add photos"}
        </Button>

        <p className="text-caption text-text-subtle">
          {room > 0 ? `${ENQUIRY_PHOTO_LIMIT_LABEL}. ${room} left.` : "That's the maximum."}
        </p>
      </div>

      {error && (
        <p role="alert" className="text-body-sm text-text-primary">
          {error}
        </p>
      )}

      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((photo) => (
            <li key={photo.path} className="group relative">
              <Image
                src={photo.preview}
                alt={photo.name}
                width={160}
                height={120}
                unoptimized
                className="border-border aspect-[4/3] w-full rounded-lg border object-cover"
              />

              <button
                type="button"
                onClick={() => void drop(photo)}
                aria-label={`Remove ${photo.name}`}
                className="bg-card/90 border-border hover:bg-card absolute top-1.5 right-1.5 rounded-full border p-1 transition-colors"
              >
                <X className="text-text-primary size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
