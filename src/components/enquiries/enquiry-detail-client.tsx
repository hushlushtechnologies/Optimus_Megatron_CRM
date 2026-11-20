"use client";

import {
  ArrowLeft,
  ArrowRight,
  Car,
  Clock,
  ExternalLink,
  Globe,
  History,
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
import { EnquiryFinanceCard } from "@/src/components/enquiries/enquiry-finance-card";
import { EnquiryCustomerVehicleCard } from "@/src/components/enquiries/enquiry-customer-vehicle-card";
import { EnquiryAssignControl } from "@/src/components/enquiries/enquiry-assign-control";
import { EnquirySection } from "@/src/components/enquiries/enquiry-detail-section";
import { EnquiryDreamCarCard } from "@/src/components/enquiries/enquiry-dream-car-card";
import { EnquiryLinksPanel } from "@/src/components/enquiries/enquiry-links-panel";
import { EnquiryFollowUpsPanel } from "@/src/components/enquiries/enquiry-follow-ups-panel";
import { EnquiryNotesPanel } from "@/src/components/enquiries/enquiry-notes-panel";
import type { EnquiryFollowUp, EnquiryNote } from "@/src/lib/types/enquiry-work";
import { EnquiryPriorityBadge } from "@/src/components/enquiries/enquiry-priority-badge";
import { EnquiryPriorityControl } from "@/src/components/enquiries/enquiry-priority-control";
import { EnquiryStatusControl } from "@/src/components/enquiries/enquiry-status-control";
import { EnquiryTimeline } from "@/src/components/enquiries/enquiry-timeline";
import { EnquiryTypeBadge } from "@/src/components/enquiries/enquiry-type-badge";
import type { EnquiryLinks } from "@/src/lib/types/enquiry-links";
import type { EnquiryTimelineEntry } from "@/src/lib/types/enquiry-timeline";
import type { EnquiryWorkflow } from "@/src/lib/types/enquiry-workflow";
import { EnquiryTradeComparison } from "@/src/components/enquiries/enquiry-trade-comparison";
import type {
  EnquiryCustomerVehicle,
  EnquiryDreamCarDetails,
  EnquiryFinanceDetails,
  EnquiryPhoto,
  EnquiryStockCar,
} from "@/src/lib/types/enquiry-details";
import { Button } from "@/src/components/ui/button";

import {
  deleteEnquiryAction,
  linkEnquiryCustomerAction,
  setEnquiryStatusAction,
} from "@/app/admin/enquiries/actions";

import { useMotion } from "@/src/hooks/use-motion";
import type { EnquiryCustomerMatch, EnquiryListRow } from "@/src/lib/types/enquiry";
import { enquiryVehicleLabel, waitingFor } from "@/src/lib/utils/enquiry-format";
import type { EnquiryPermissions } from "@/src/lib/utils/enquiry-permissions";
import { formatDateTimeFull, formatDay } from "@/src/lib/utils/test-drive-format";

/* =========================================================
   TYPES
========================================================= */

interface EnquiryDetailClientProps {
  enquiry: EnquiryListRow;
  matches: EnquiryCustomerMatch[];
  stages: { id: string; name: string }[];
  staff: { id: string; full_name: string }[];
  /** null when this isn't a finance enquiry, which is the usual case. */
  finance: EnquiryFinanceDetails | null;
  /** The customer's own cars, if any. null means they couldn't be read. */
  vehicles: EnquiryCustomerVehicle[] | null;
  photos: EnquiryPhoto[] | null;
  /** Our half of a trade-in. null when nothing was picked from stock. */
  stockCar: EnquiryStockCar | null;
  /** The brief for a car we haven't got. null for every other kind. */
  dreamCar: EnquiryDreamCarDetails | null;
  /**
   * The car linked to that brief, read live from stock rather than stored
   * alongside the match: a car that has since sold should say so here.
   */
  matchedCar: EnquiryStockCar | null;
  /** Status and assignment history merged with the activity trail. */
  timeline: EnquiryTimelineEntry[] | null;
  /** null for either means it couldn't be read, not that there are none. */
  notes: EnquiryNote[] | null;
  followUps: EnquiryFollowUp[] | null;
  /** The lead, deal, test drive and reservation this enquiry points at. */
  links: EnquiryLinks;
  /** The configured statuses and the moves each one allows. */
  workflow: EnquiryWorkflow;
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
  matches,
  stages,
  staff,
  finance,
  vehicles,
  photos,
  stockCar,
  dreamCar,
  matchedCar,
  timeline,
  notes,
  followUps,
  links,
  workflow,
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

  /*
   * Two shortcuts that skip the status dialog, for the moves nobody wants a
   * form for: flagging junk, and reopening something closed by mistake.
   *
   * They still go through setEnquiryStatusAction, which checks the workflow
   * server-side, so a move the transitions table forbids is refused here
   * exactly as it would be from the dialog. The shortcut is to the form, not
   * past the rules.
   */
  const setStatus = (status: "New" | "Spam", label: string) =>
    run(label, () => setEnquiryStatusAction({ id: enquiry.id, status, reason: "" }));

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

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="text-h3">{enquiry.full_name}</h1>

              <EnquiryTypeBadge type={enquiry.enquiry_type} label={enquiry.type_label} />
              <EnquiryPriorityBadge priority={enquiry.priority} hideNormal />
            </div>

            {/*
              The seven facts the plan asks for in the header, as one
              sentence rather than a grid of labelled boxes: somebody opening
              an enquiry reads this once to orient themselves, and a sentence
              is faster to read than seven captions.
            */}
            <p className="text-body-sm text-text-muted mt-1">
              <span className="tabular-nums">{enquiry.enquiry_number}</span>
              {" · from "}
              {enquiry.source}
              {" · "}
              {formatDay(enquiry.created_at)}
              {enquiry.status_is_open && (
                <span className="text-text-subtle">
                  {" · "}
                  <Clock className="mb-0.5 inline size-3.5" aria-hidden="true" /> waiting{" "}
                  {waitingFor(enquiry.created_at)}
                </span>
              )}
            </p>

            {/* The status and what it may become next, from the workflow. */}
            <div className="mt-3">
              <EnquiryStatusControl
                enquiryId={enquiry.id}
                currentStatus={enquiry.status}
                statusLabel={enquiry.status_label ?? enquiry.status}
                enquiryType={enquiry.enquiry_type}
                version={enquiry.version}
                workflow={workflow}
                canManage={permissions.manage}
              />
            </div>
          </div>

          {/* ---- Primary actions ---- */}

          <div className="flex flex-wrap gap-2">
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
          {/* ---- Finance figures, when this is a finance enquiry ---- */}

          {finance && <EnquiryFinanceCard details={finance} index={1} />}

          {/* ---- What they want that we haven't got ---- */}

          {dreamCar && (
            <EnquiryDreamCarCard
              details={dreamCar}
              enquiryId={enquiry.id}
              matchedCar={matchedCar}
              canManage={permissions.manage}
              index={1}
            />
          )}

          {/* ---- The customer's own car, for a sale or a trade-in ---- */}

          {(vehicles ?? []).map((vehicle, position) => (
            <div key={vehicle.id} className="flex flex-col gap-3">
              <EnquiryCustomerVehicleCard
                vehicle={vehicle}
                photos={(photos ?? []).filter((photo) => photo.vehicleId === vehicle.id)}
                canValuate={permissions.valuate}
                index={position + 1}
              />

              {/*
                A trade-in is two cars, so our side is shown directly beneath
                theirs with the sum between them. Stacked rather than two
                columns: the detail page already sits in a narrow column on
                desktop, and a column split inside it would give each car
                less room than it needs.
              */}
              {vehicle.role === "trade_in" && (
                <EnquiryTradeComparison
                  expected={vehicle.askingPrice}
                  car={stockCar}
                  wanted={enquiry.vehicle_text}
                  index={position + 2}
                />
              )}
            </div>
          ))}

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

          {/* ===============================================
              FOLLOW-UPS AND CONTACT
          =============================================== */}

          <EnquiryFollowUpsPanel
            enquiryId={enquiry.id}
            followUps={followUps}
            staff={staff}
            canManage={canManage}
            index={4}
          />

          {/* ===============================================
              CONNECTED RECORDS
          =============================================== */}

          <EnquiryLinksPanel
            enquiryId={enquiry.id}
            links={links}
            customerId={enquiry.customer_id}
            canManage={canManage}
            index={5}
          />

          {/* ===============================================
              NOTES
          =============================================== */}

          <EnquiryNotesPanel
            enquiryId={enquiry.id}
            notes={notes}
            currentUserId={currentUserId}
            canManage={canManage}
            /*
             * Anybody who can delete an enquiry can tidy anybody's note.
             * Without this a colleague who leaves takes their notes with
             * them, uneditable by anyone.
             */
            canManageAllNotes={permissions.delete}
            index={6}
          />

          {/* ===============================================
              ACTIVITY AND HISTORY

              One list, not two. Phase 1 split what happens to an enquiry
              across three tables because each has different columns; the
              question somebody actually asks is "what happened to this",
              which has one answer in time order.
          =============================================== */}

          <EnquirySection
            title="History"
            index={7}
            icon={<History className="size-4" aria-hidden="true" />}
            description="Everything that has happened, newest first."
          >
            <EnquiryTimeline entries={timeline} />
          </EnquirySection>
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

            {/*
              A dropdown that reassigns on change was too quiet for this: a
              mis-click handed somebody else's enquiry away with no reason
              recorded and no way to see why. Taking it on is still one
              click; handing it over now asks who and why.
            */}
            <EnquiryAssignControl
              enquiryId={enquiry.id}
              assignedTo={enquiry.assigned_to}
              assignedToName={enquiry.assigned_to_name}
              version={enquiry.version}
              staff={staff}
              currentUserId={currentUserId}
              canManage={canManage}
            />

            <div className="border-border border-t pt-4">
              <p className="text-label">Priority</p>

              <div className="mt-2">
                <EnquiryPriorityControl
                  enquiryId={enquiry.id}
                  priority={enquiry.priority}
                  version={enquiry.version}
                  canManage={canManage}
                />
              </div>
            </div>

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

              {canManage && enquiry.status !== "Cancelled" && (
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

              {canManage && (enquiry.status === "Spam" || enquiry.status === "Cancelled") && (
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
