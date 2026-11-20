"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUpRight, Link2, Link2Off, Share2, TriangleAlert, UserPlus } from "lucide-react";

import { EnquirySection } from "@/src/components/enquiries/enquiry-detail-section";
import { Button } from "@/src/components/ui/button";
import { Combobox, type ComboboxOption } from "@/src/components/ui/combobox";

import { listEnquiryLinkCandidatesAction, setEnquiryLinkAction } from "@/app/admin/enquiries/link-actions";
import {
  LINK_KINDS,
  LINK_KINDS_SPEC,
  linkHref,
  type EnquiryLinkKind,
  type EnquiryLinkedRecord,
  type EnquiryLinks,
} from "@/src/lib/types/enquiry-links";
import { formatDay } from "@/src/lib/utils/test-drive-format";

interface EnquiryLinksPanelProps {
  enquiryId: string;
  links: EnquiryLinks;
  /** Null when the enquiry isn't tied to a customer yet. */
  customerId: string | null;
  canManage: boolean;
  index?: number;
}

/* =========================================================
   ONE ROW
========================================================= */

interface RowProps {
  enquiryId: string;
  kind: EnquiryLinkKind;
  record: EnquiryLinkedRecord | null;
  hasCustomer: boolean;
  canManage: boolean;
  busy: boolean;
  onLink: (kind: EnquiryLinkKind, recordId: string | null) => void;
}

function LinkRow({ enquiryId, kind, record, hasCustomer, canManage, busy, onLink }: RowProps) {
  const spec = LINK_KINDS_SPEC[kind];

  const [picking, setPicking] = useState(false);
  const [choice, setChoice] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<EnquiryLinkedRecord[] | null>(null);

  const open = async () => {
    setPicking(true);
    setChoice(null);

    if (candidates === null) {
      const rows = await listEnquiryLinkCandidatesAction({ enquiryId, kind }).catch(() => []);
      setCandidates(rows);
    }
  };

  const options: ComboboxOption[] = (candidates ?? []).map((item) => ({
    id: item.id,
    label: [item.number, item.status, item.vehicleTitle].filter(Boolean).join(" · "),
  }));

  return (
    <li className="border-border flex flex-col gap-2 border-b py-3 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-label">{spec.label}</p>

          {record ? (
            <>
              <Link
                href={linkHref(record)}
                className="text-body-sm text-primary-text mt-0.5 inline-flex items-center gap-1 font-medium hover:underline"
              >
                {record.number}
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </Link>

              <p className="text-caption text-text-muted mt-0.5">
                {[record.status, record.vehicleTitle, record.when ? formatDay(record.when) : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </>
          ) : (
            <p className="text-body-sm text-text-subtle mt-0.5">{spec.hint}</p>
          )}
        </div>

        {canManage && !picking && (
          <div className="flex shrink-0 gap-2">
            {record ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => onLink(kind, null)}
                leftIcon={<Link2Off className="size-4" aria-hidden="true" />}
              >
                Unlink
              </Button>
            ) : (
              hasCustomer && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void open()}
                  leftIcon={<Link2 className="size-4" aria-hidden="true" />}
                >
                  Link
                </Button>
              )
            )}
          </div>
        )}
      </div>

      {picking && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Combobox
              label={`Pick a ${spec.label.toLowerCase()}`}
              value={choice}
              onChange={setChoice}
              options={options}
              disabled={candidates === null}
              disabledHint="Loading…"
              placeholder={
                candidates !== null && candidates.length === 0
                  ? `This customer has no ${spec.label.toLowerCase()} yet`
                  : "Search…"
              }
            />
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={choice === null || busy}
              onClick={() => {
                onLink(kind, choice);
                setPicking(false);
              }}
            >
              Link
            </Button>

            <Button size="sm" variant="outline" disabled={busy} onClick={() => setPicking(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

/* =========================================================
   PANEL
========================================================= */

/**
 * What else this enquiry is about.
 *
 * Four links, each to a record that already exists in its own module.
 * Nothing here creates any of them: an enquiry arriving is a question, not a
 * deal, and a deal made because somebody filled in a form is a deal nobody
 * agreed to.
 *
 * Candidates are limited to this customer's own records, so the picker can't
 * be used to browse other customers or to attach their dealings here.
 */
export function EnquiryLinksPanel({
  enquiryId,
  links,
  customerId,
  canManage,
  index = 0,
}: EnquiryLinksPanelProps) {
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: EnquiryLinkKind, recordId: string | null) => {
    setBusy(true);
    setError(null);

    try {
      const result = await setEnquiryLinkAction({ enquiryId, kind, recordId });

      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }

      toast.success(recordId === null ? "Link removed." : "Linked.");
      router.refresh();
    } catch {
      const message = "Something went wrong. Refresh the page and try again.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <EnquirySection
      title="Connected records"
      index={index}
      icon={<Share2 className="size-4" aria-hidden="true" />}
      description="Linking says two things that already exist are about each other. It creates nothing."
    >
      {!customerId && (
        <p className="text-body-sm text-text-primary bg-card-hover flex items-start gap-2 rounded-md px-3 py-2.5">
          <UserPlus className="text-text-muted mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Link a customer to this enquiry first. Records are matched by customer, so there is nothing safe to
          offer until then.
        </p>
      )}

      <ul className="flex flex-col">
        {LINK_KINDS.map((kind) => (
          <LinkRow
            key={kind}
            enquiryId={enquiryId}
            kind={kind}
            record={links[kind]}
            hasCustomer={customerId !== null}
            canManage={canManage}
            busy={busy}
            onLink={(k, id) => void run(k, id)}
          />
        ))}
      </ul>

      {error && (
        <p
          role="alert"
          className="text-body-sm text-text-primary border-danger/40 bg-danger/10 flex items-start gap-2 rounded-md border px-3 py-2.5"
        >
          <TriangleAlert className="text-danger mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      <p className="text-caption text-text-subtle">
        Statuses here are read live from each module, so a cancelled deal says so.
      </p>
    </EnquirySection>
  );
}
