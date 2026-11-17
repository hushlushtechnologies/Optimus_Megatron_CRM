"use client";

import { TriangleAlert } from "lucide-react";
import { Select } from "@/src/components/ui/select";
import { FormSection } from "@/src/components/test-drives/form/form-section";

interface DealOwnershipSectionProps {
  showrooms: { id: string; name: string }[];
  locationId: string;
  onLocationChange: (id: string) => void;
  owners: { id: string; name: string }[];
  ownerId: string | null;
  onOwnerChange: (id: string | null) => void;
  /** Only people with the assign permission can choose someone else. */
  canAssign: boolean;
  currentUserId: string;
  showroomMismatchMessage: string | null;
  locationError?: string;
}

export function DealOwnershipSection({
  showrooms,
  locationId,
  onLocationChange,
  owners,
  ownerId,
  onOwnerChange,
  canAssign,
  currentUserId,
  showroomMismatchMessage,
  locationError,
}: DealOwnershipSectionProps) {
  const ownerName = owners.find((owner) => owner.id === ownerId)?.name ?? null;

  return (
    <FormSection
      step={4}
      title="Showroom & owner"
      description="Where the sale happens, and the sales executive who is responsible for it."
    >
      <div className="flex flex-col gap-1.5">
        <Select
          label="Showroom"
          placeholder="Choose a showroom"
          options={showrooms.map((showroom) => ({ value: showroom.id, label: showroom.name }))}
          value={locationId}
          onChange={(event) => onLocationChange(event.target.value)}
        />
        {locationError && (
          <p role="alert" className="text-body-sm text-red-500">
            {locationError}
          </p>
        )}
      </div>

      {showroomMismatchMessage && (
        <p
          role="status"
          className="text-body-sm text-text-primary flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden="true" />
          {showroomMismatchMessage}
        </p>
      )}

      {canAssign ? (
        <Select
          label="Sales executive"
          placeholder="No owner yet"
          options={owners.map((owner) => ({ value: owner.id, label: owner.name }))}
          value={ownerId ?? ""}
          onChange={(event) => onOwnerChange(event.target.value || null)}
        />
      ) : (
        <div className="flex flex-col gap-1.5">
          <p className="text-label">Sales executive</p>
          <p className="border-border bg-card-hover/40 text-body text-text-primary rounded-md border px-3 py-2.5">
            {ownerId === currentUserId ? `${ownerName ?? "You"} (you)` : (ownerName ?? "No owner yet")}
          </p>
          <p className="text-caption text-text-subtle">
            New deals are assigned to you. A manager can reassign them later.
          </p>
        </div>
      )}

      <p className="text-caption text-text-subtle">
        Negotiation can only start once a sales executive and a proposed price are set.
      </p>
    </FormSection>
  );
}