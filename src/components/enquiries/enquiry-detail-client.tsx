"use client";

import {
  ArrowLeft,
  ArrowRight,
  Car,
  Clock,
  ExternalLink,
  Globe,
  Mail,
  MessageSquare,
  Phone,
  RotateCcw,
  ShieldAlert,
  Trash2,
  UserCheck,
  XCircle,
} from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConvertEnquiryDialog } from "@/src/components/enquiries/convert-enquiry-dialog";
import { EnquiryCloseDialog } from "@/src/components/enquiries/enquiry-close-dialog";
import { EnquiryStatusBadge } from "@/src/components/enquiries/enquiry-status-badge";
import { Button } from "@/src/components/ui/button";
import { Select } from "@/src/components/ui/select";

import {
  assignEnquiryAction,
  deleteEnquiryAction,
  linkEnquiryCustomerAction,
  setEnquiryStatusAction,
} from "@/app/admin/enquiries/actions";

import { useMotion } from "@/src/hooks/use-motion";
import type { EnquiryActivityEntry, EnquiryCustomerMatch, EnquiryListRow } from "@/src/lib/types/enquiry";
import { enquiryVehicleLabel, waitingFor } from "@/src/lib/utils/enquiry-format";
import type { EnquiryPermissions } from "@/src/lib/utils/enquiry-permissions";
import { formatDateTimeFull } from "@/src/lib/utils/test-drive-format";

/* =========================================================
   TYPES
========================================================= */

interface EnquiryDetailClientProps {
  enquiry: EnquiryListRow;
  /** null means the trail couldn't be loaded, which is not the same as empty. */
  activity: EnquiryActivityEntry[] | null;
  matches: EnquiryCustomerMatch[];
  stages: { id: string; name: string }[];
  staff: { id: string; full_name: string }[];
  permissions: EnquiryPermissions;
  currentUserId: string;
}

type OpenDialog = "convert" | "close" | null;

/* =========================================================
   SMALL PIECES
========================================================= */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-label">{label}</p>
      <div className="text-body-sm text-text-primary mt-1 break-words">{children}</div>
    </div>
  );
}

function none() {
  return <span className="text-text-subtle">Not given</span>;
}

/**
 * A phone number as a WhatsApp link.
 *
 * wa.me wants digits only, with the country code and no plus. A UAE mobile
 * typed as 0501234567 is turned into 971501234567, which is what a colleague
 * would do by hand before messaging someone.
 */
function whatsappHref(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");

  if (digits.length < 9) return null;
  if (digits.startsWith("971")) return `https://wa.me/${digits}`;
  if (digits.startsWith("0")) return `https://wa.me/971${digits.slice(1)}`;

  return `https://wa.me/${digits}`;
}

/* =========================================================
   COMPONENT
========================================================= */

export function EnquiryDetailClient({
  enquiry,
  activity,
  matches,
  stages,
  staff,
  permissions,
  currentUserId,
}: EnquiryDetailClientProps) {
  const router = useRouter();
  const { fadeUp } = useMotion();

  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [busy, setBusy] = useState(false);

  const vehicle = enquiryVehicleLabel(enquiry);
  const converted = enquiry.status === "Converted";
  const canManage = permissions.manage && !converted;

  /* =======================================================
     ACTIONS
  ======================================================= */

  const run = async (label: string, work: () => Promise<{ error: string | null }>) => {
    setBusy(true);

    try {
      const result = await work();

      if (result.error) {
        toast.error(result.error);
        return false;
      }

      toast.success(label);
      router.refresh();
      return true;
    } catch {
      toast.error("Something went wrong. Refresh the page and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const setStatus = (status: "New" | "In Review" | "Spam", label: string) =>
    run(label, () => setEnquiryStatusAction({ id: enquiry.id, status, reason: "" }));

  const assign = (assignedTo: string | null) =>
    run(assignedTo ? "Assigned." : "Assignment cleared.", () =>
      assignEnquiryAction({ id: enquiry.id, assignedTo }),
    );

  const remove = async () => {
    const ok = await run("Enquiry deleted.", () => deleteEnquiryAction({ id: enquiry.id }));
    if (ok) router.push("/admin/enquiries");
  };

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className="flex flex-col gap-6">
      {/* ===================================================
          HEADER
      =================================================== */}

      <motion.div {...fadeUp(0)} className="flex flex-col gap-3">
        <Link
          href="/admin/enquiries"
          className="text-body-sm text-text-muted hover:text-text-primary focus-visible:ring-primary inline-flex min-h-11 items-center gap-1.5 self-start rounded focus-visible:ring-2 focus-visible:outline-none sm:min-h-0"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Enquiry requests
        </Link>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="text-h3">{enquiry.full_name}</h1>
              <EnquiryStatusBadge status={enquiry.status} />
            </div>

            <p className="text-body-sm text-text-muted mt-1">
              {enquiry.enquiry_number} · {enquiry.enquiry_type} · arrived from {enquiry.source}
              <span className="text-text-subtle">
                {" · "}
                <Clock className="mb-0.5 inline size-3.5" aria-hidden="true" /> waiting{" "}
                {waitingFor(enquiry.created_at)}
              </span>
            </p>
          </div>

          {/* ---- Primary actions ---- */}

          <div className="flex flex-wrap gap-2">
            {canManage && enquiry.status !== "In Review" && enquiry.status !== "Spam" && (
              <Button
                variant="outline"
                className="h-11 sm:h-10"
                disabled={busy}
                onClick={() => void setStatus("In Review", "Moved to in review.")}
              >
                Start reviewing
              </Button>
            )}

            {canManage && (
              <Button
                variant="gradient"
                className="h-11 sm:h-10"
                disabled={busy || stages.length === 0}
                onClick={() => setDialog("convert")}
                rightIcon={<ArrowRight className="size-4" aria-hidden="true" />}
              >
                Convert to lead
              </Button>
            )}

            {converted && enquiry.lead_id && (
              <Link
                href={`/admin/leads/${enquiry.lead_id}`}
                className="border-primary bg-primary focus-visible:ring-primary inline-flex min-h-11 items-center gap-1.5 rounded-md border px-4 text-sm font-medium text-[#0b1220] transition-colors hover:brightness-105 focus-visible:ring-2 focus-visible:outline-none sm:min-h-10"
              >
                Open {enquiry.lead_number ?? "the lead"}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* =================================================
            LEFT
        ================================================= */}

        <div className="flex flex-col gap-6">
          {/* ---- What they asked ---- */}

          <motion.section
            {...fadeUp(1)}
            aria-label="The message"
            className="surface-card flex flex-col gap-3 p-5"
          >
            <p className="text-label flex items-center gap-1.5">
              <MessageSquare className="size-4" aria-hidden="true" />
              What they wrote
            </p>

            {enquiry.message ? (
              <p className="text-body-sm text-text-primary break-words whitespace-pre-wrap">
                {enquiry.message}
              </p>
            ) : (
              <p className="text-body-sm text-text-muted">
                No message was left. The form was submitted with contact details only.
              </p>
            )}

            {vehicle && (
              <p className="text-body-sm text-text-muted border-border flex items-start gap-1.5 border-t pt-3">
                <Car className="text-text-subtle mt-0.5 size-4 shrink-0" aria-hidden="true" />

                {enquiry.car_id ? (
                  <Link
                    href={`/admin/inventory/${enquiry.car_id}`}
                    className="text-primary-text hover:text-primary-hover"
                  >
                    {vehicle}
                  </Link>
                ) : (
                  <span>
                    {vehicle}
                    <span className="text-text-subtle"> — not matched to anything in stock</span>
                  </span>
                )}
              </p>
            )}
          </motion.section>

          {/* ---- How to reach them ---- */}

          <motion.section
            {...fadeUp(2)}
            aria-label="Contact details"
            className="surface-card flex flex-col gap-4 p-5"
          >
            <p className="text-label">How to reach them</p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Phone">
                {enquiry.phone ? (
                  <a href={`tel:${enquiry.phone}`} className="text-primary-text hover:text-primary-hover">
                    {enquiry.phone}
                  </a>
                ) : (
                  none()
                )}
              </Field>

              <Field label="Email">
                {enquiry.email ? (
                  <a href={`mailto:${enquiry.email}`} className="text-primary-text hover:text-primary-hover">
                    {enquiry.email}
                  </a>
                ) : (
                  none()
                )}
              </Field>

              <Field label="Prefers">{enquiry.preferred_contact ?? none()}</Field>
            </div>

            <div className="flex flex-wrap gap-2">
              {enquiry.phone && (
                <a
                  href={`tel:${enquiry.phone}`}
                  className="border-border bg-card hover:bg-card-hover text-text-primary focus-visible:ring-primary inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none sm:min-h-9"
                >
                  <Phone className="size-4" aria-hidden="true" />
                  Call
                </a>
              )}

              {enquiry.phone && whatsappHref(enquiry.phone) && (
                <a
                  href={whatsappHref(enquiry.phone)!}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="border-border bg-card hover:bg-card-hover text-text-primary focus-visible:ring-primary inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none sm:min-h-9"
                >
                  <MessageSquare className="size-4" aria-hidden="true" />
                  WhatsApp
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              )}

              {enquiry.email && (
                <a
                  href={`mailto:${enquiry.email}?subject=${encodeURIComponent(
                    `Your enquiry ${enquiry.enquiry_number} — Optimus Megatron Cars`,
                  )}`}
                  className="border-border bg-card hover:bg-card-hover text-text-primary focus-visible:ring-primary inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none sm:min-h-9"
                >
                  <Mail className="size-4" aria-hidden="true" />
                  Email
                </a>
              )}
            </div>
          </motion.section>

          {/* ---- Matches ---- */}

          {!enquiry.customer_id && matches.length > 0 && canManage && (
            <motion.section
              {...fadeUp(3)}
              aria-label="Possible matches"
              className="surface-card flex flex-col gap-3 p-5"
            >
              <div>
                <p className="text-label">Already on file?</p>
                <p className="text-caption text-text-subtle mt-1">
                  {matches.length === 1 ? "One customer matches" : `${matches.length} customers match`} this
                  enquiry&apos;s email or phone. Linking one keeps their history together, and does not
                  convert the enquiry.
                </p>
              </div>

              <ul className="flex flex-col gap-2">
                {matches.map((match) => (
                  <li
                    key={match.id}
                    className="border-border flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/admin/customers/${match.id}`}
                        className="text-body-sm text-primary-text hover:text-primary-hover font-medium"
                      >
                        {match.full_name}
                      </Link>

                      <p className="text-caption text-text-subtle">
                        {match.customer_number} · matched on {match.matchedOn === "email" ? "email" : "phone"}
                      </p>
                    </div>

                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-11 sm:h-9"
                      disabled={busy}
                      onClick={() =>
                        void run("Customer linked.", () =>
                          linkEnquiryCustomerAction({ id: enquiry.id, customerId: match.id }),
                        )
                      }
                      leftIcon={<UserCheck className="size-4" aria-hidden="true" />}
                    >
                      Link
                    </Button>
                  </li>
                ))}
              </ul>
            </motion.section>
          )}

          {/* ---- Activity ---- */}

          <motion.section
            {...fadeUp(4)}
            aria-label="History"
            className="surface-card flex flex-col gap-3 p-5"
          >
            <p className="text-label">History</p>

            {activity === null ? (
              <p
                role="alert"
                className="text-body-sm text-text-primary rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2"
              >
                The history couldn&apos;t be loaded. Refresh the page to try again.
              </p>
            ) : activity.length === 0 ? (
              <p className="text-body-sm text-text-muted">Nothing has happened to this enquiry yet.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {activity.map((entry) => (
                  <li
                    key={entry.id}
                    className="border-border flex flex-col gap-0.5 border-b pb-3 last:border-0 last:pb-0"
                  >
                    <p className="text-body-sm text-text-primary">
                      {entry.description}
                      {entry.old_value && entry.new_value && entry.activity_type === "status" && (
                        <span className="text-text-muted">
                          {": "}
                          {entry.old_value} → {entry.new_value}
                        </span>
                      )}
                    </p>

                    <p className="text-caption text-text-subtle">
                      {formatDateTimeFull(entry.changed_at)}
                      {entry.changed_by_name ? ` · ${entry.changed_by_name}` : " · from the website"}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </motion.section>
        </div>

        {/* =================================================
            RIGHT
        ================================================= */}

        <div className="flex flex-col gap-6">
          {/* ---- Ownership ---- */}

          <motion.section
            {...fadeUp(2)}
            aria-label="Ownership"
            className="surface-card flex flex-col gap-4 p-5"
          >
            <p className="text-label">Who has it</p>

            {canManage ? (
              <Select
                aria-label="Assign this enquiry"
                options={[
                  { value: "", label: "Nobody yet" },
                  ...staff.map((person) => ({ value: person.id, label: person.full_name })),
                ]}
                value={enquiry.assigned_to ?? ""}
                disabled={busy}
                onChange={(event) => void assign(event.target.value || null)}
              />
            ) : (
              <p className="text-body-sm text-text-primary">{enquiry.assigned_to_name || "Nobody yet"}</p>
            )}

            {canManage && enquiry.assigned_to !== currentUserId && (
              <Button
                size="sm"
                variant="secondary"
                className="h-11 sm:h-9"
                disabled={busy}
                onClick={() => void assign(currentUserId)}
              >
                Take it on myself
              </Button>
            )}

            {enquiry.customer_id && enquiry.customer_name && (
              <Field label="Customer">
                <Link
                  href={`/admin/customers/${enquiry.customer_id}`}
                  className="text-primary-text hover:text-primary-hover"
                >
                  {enquiry.customer_name}
                  {enquiry.customer_number ? ` · ${enquiry.customer_number}` : ""}
                </Link>
              </Field>
            )}

            {enquiry.lead_id && enquiry.lead_number && (
              <Field label="Lead">
                <Link
                  href={`/admin/leads/${enquiry.lead_id}`}
                  className="text-primary-text hover:text-primary-hover"
                >
                  {enquiry.lead_number}
                </Link>
              </Field>
            )}

            {enquiry.close_reason && <Field label="Closed because">{enquiry.close_reason}</Field>}
          </motion.section>

          {/* ---- Where it came from ---- */}

          <motion.section
            {...fadeUp(3)}
            aria-label="Where it came from"
            className="surface-card flex flex-col gap-4 p-5"
          >
            <p className="text-label flex items-center gap-1.5">
              <Globe className="size-4" aria-hidden="true" />
              Where it came from
            </p>

            <Field label="Received">{formatDateTimeFull(enquiry.created_at)}</Field>

            <Field label="Entered by">{enquiry.created_by_name || "The website form"}</Field>

            {enquiry.page_url && (
              <Field label="Page">
                <a
                  href={enquiry.page_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-primary-text hover:text-primary-hover inline-flex items-center gap-1 break-all"
                >
                  {enquiry.page_url}
                  <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                </a>
              </Field>
            )}

            {(enquiry.utm_source || enquiry.utm_medium || enquiry.utm_campaign) && (
              <Field label="Campaign">
                {[enquiry.utm_source, enquiry.utm_medium, enquiry.utm_campaign].filter(Boolean).join(" · ")}
              </Field>
            )}

            <p className="text-caption text-text-subtle border-border border-t pt-3">
              Anything above that came from the browser can be set by whoever submitted the form, so treat it
              as a hint rather than a fact.
            </p>
          </motion.section>

          {/* ---- Everything else ---- */}

          {(canManage || (permissions.delete && !converted)) && (
            <motion.section
              {...fadeUp(4)}
              aria-label="Other actions"
              className="surface-card flex flex-col gap-2 p-5"
            >
              <p className="text-label">Other actions</p>

              {canManage && enquiry.status !== "Closed" && (
                <Button
                  variant="outline"
                  className="h-11 justify-start sm:h-10"
                  disabled={busy}
                  onClick={() => setDialog("close")}
                  leftIcon={<XCircle className="size-4" aria-hidden="true" />}
                >
                  Close it
                </Button>
              )}

              {canManage && enquiry.status !== "Spam" && (
                <Button
                  variant="outline"
                  className="h-11 justify-start sm:h-10"
                  disabled={busy}
                  onClick={() => void setStatus("Spam", "Moved to spam.")}
                  leftIcon={<ShieldAlert className="size-4" aria-hidden="true" />}
                >
                  Flag as spam
                </Button>
              )}

              {canManage && (enquiry.status === "Spam" || enquiry.status === "Closed") && (
                <Button
                  variant="outline"
                  className="h-11 justify-start sm:h-10"
                  disabled={busy}
                  onClick={() => void setStatus("New", "Reopened.")}
                  leftIcon={<RotateCcw className="size-4" aria-hidden="true" />}
                >
                  Put it back in the queue
                </Button>
              )}

              {permissions.delete && !converted && (
                <Button
                  variant="destructive"
                  className="h-11 justify-start sm:h-10"
                  disabled={busy}
                  onClick={() => void remove()}
                  leftIcon={<Trash2 className="size-4" aria-hidden="true" />}
                >
                  Delete for good
                </Button>
              )}

              {permissions.delete && !converted && (
                <p className="text-caption text-text-subtle">
                  Deleting cannot be undone. For anything that might matter later, close it instead.
                </p>
              )}
            </motion.section>
          )}
        </div>
      </div>

      {/* ===================================================
          DIALOGS
      =================================================== */}

      {dialog === "convert" && (
        <ConvertEnquiryDialog
          enquiry={enquiry}
          matches={matches}
          stages={stages}
          staff={staff}
          currentUserId={currentUserId}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog === "close" && <EnquiryCloseDialog enquiry={enquiry} onClose={() => setDialog(null)} />}
    </div>
  );
}
