"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Select } from "@/src/components/ui/select";
import { EnquiryPriorityBadge } from "@/src/components/enquiries/enquiry-priority-badge";
import { setEnquiryPriorityAction } from "@/app/admin/enquiries/actions";
import { ENQUIRY_PRIORITIES, type EnquiryPriority } from "@/src/lib/types/enquiry";

interface EnquiryPriorityControlProps {
  enquiryId: string;
  priority: EnquiryPriority;
  version: number;
  canManage: boolean;
  onDone?: () => void;
}

/**
 * How urgent this enquiry is.
 *
 * Saves on change rather than behind a button: it is one value from a list
 * of four, and an Apply step for a single select is a step nobody thanks you
 * for. A failure puts the old value straight back.
 */
export function EnquiryPriorityControl({
  enquiryId,
  priority,
  version,
  canManage,
  onDone,
}: EnquiryPriorityControlProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  if (!canManage) return <EnquiryPriorityBadge priority={priority} />;

  const change = async (next: EnquiryPriority) => {
    if (next === priority) return;

    setSaving(true);

    try {
      const result = await setEnquiryPriorityAction({
        id: enquiryId,
        priority: next,
        expectedVersion: version,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(`Priority set to ${next}.`);
      // The caller refreshes if it wants to; otherwise the page reloads itself.
      if (onDone) onDone();
      else router.refresh();
    } catch {
      toast.error("Something went wrong. Refresh the page and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Select
      aria-label="Priority"
      options={ENQUIRY_PRIORITIES.map((item) => ({ value: item, label: item }))}
      value={priority}
      disabled={saving}
      onChange={(event) => void change(event.target.value as EnquiryPriority)}
    />
  );
}
