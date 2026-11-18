"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  FileSpreadsheet,
  FileText,
  Mail,
  MapPin,
  MoreVertical,
  Pencil,
  Phone,
  StickyNote,
  Tag,
  Trash2,
} from "lucide-react";

import { CustomerAvatar } from "@/src/components/customers/customer-avatar";
import {
  CustomerLifecycleBadge,
  CustomerAccountStatusBadge,
} from "@/src/components/customers/customer-status-badge";
import { CustomerSourceBadge } from "@/src/components/customers/customer-source-badge";
import { CustomerTagPill } from "@/src/components/customers/customer-tag-pill";
import { ContactCustomerMenu } from "@/src/components/customers/contact-customer-menu";
import { AddNoteDialog } from "@/src/components/customers/add-note-dialog";
import { ManageTagsDialog } from "@/src/components/customers/manage-tags-dialog";
import { ConfirmDialog } from "@/src/components/shared/confirm-dialog";

import { Button } from "@/src/components/ui/button";
import { Dropdown, DropdownTrigger, DropdownContent } from "@/src/components/ui/dropdown";
import { IconButton } from "@/src/components/ui/icon-button";
import { Spinner } from "@/src/components/ui/spinner";

import { downloadExportFile } from "@/src/lib/utils/download-export-file";
import { formatDateTimeFull } from "@/src/lib/utils/test-drive-format";

import { archiveCustomer, deleteCustomer, restoreCustomer } from "@/app/admin/customers/[id]/admin-actions";

import type { CustomerDetail } from "@/src/lib/supabase/customer-detail-queries";
import type { CustomerTag } from "@/src/lib/supabase/customer-lookups";

interface CustomerDetailHeaderProps {
  customer: CustomerDetail;
  assignedTags: CustomerTag[];
  availableTags: CustomerTag[];
  /** May archive, restore and export. Defaults to true; the server checks again regardless. */
  canManage?: boolean;
  /** May permanently delete. Defaults to true; the server checks again regardless. */
  canDelete?: boolean;
}

type ExportFormat = "excel" | "pdf";

export function CustomerDetailHeader({
  customer,
  assignedTags,
  availableTags,
  canManage = true,
  canDelete = true,
}: CustomerDetailHeaderProps) {
  const router = useRouter();

  const [addNoteOpen, setAddNoteOpen] = useState(false);
  const [manageTagsOpen, setManageTagsOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isArchived = !!customer.archived_at;

  /* =========================================================
     EXPORT

     Reuses the list export route in "selected" scope with this
     one id, so the spreadsheet and PDF layouts stay identical
     to the ones staff already know from the Customers list.
  ========================================================= */

  const handleExport = async (format: ExportFormat) => {
    setExporting(format);

    try {
      const result = await downloadExportFile(
        `/admin/customers/export?format=${format}&scope=selected&ids=${customer.id}`,
      );

      if (result.error) toast.error(result.error);
      else toast.success(`${customer.full_name} exported as ${format === "excel" ? "Excel" : "PDF"}.`);
    } finally {
      setExporting(null);
    }
  };

  /* =========================================================
     ARCHIVE / RESTORE
  ========================================================= */

  const handleArchiveToggle = async () => {
    setIsArchiving(true);

    try {
      const result = isArchived ? await restoreCustomer(customer.id) : await archiveCustomer(customer.id);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(isArchived ? "Customer restored." : "Customer archived.");
      setArchiveOpen(false);
      router.refresh();
    } catch {
      toast.error("Your change couldn't be saved. Please try again.");
    } finally {
      setIsArchiving(false);
    }
  };

  /* =========================================================
     DELETE
  ========================================================= */

  const handleDelete = async () => {
    setIsDeleting(true);

    try {
      const result = await deleteCustomer(customer.id);

      if (result.error) {
        toast.error(result.error);
        setDeleteOpen(false);
        return;
      }

      toast.success(`${customer.full_name} was permanently deleted.`);
      router.push("/admin/customers");
    } catch {
      toast.error("Your change couldn't be saved. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  const hasMenu = canManage || canDelete;

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div className="flex flex-col gap-4">
      {isArchived && (
        <p
          role="status"
          className="border-border bg-card-hover/60 text-body-sm text-text-muted flex items-center gap-2 rounded-md border px-3 py-2"
        >
          <Archive className="size-4 shrink-0" aria-hidden="true" />
          This customer is archived
          {customer.archived_at ? ` (${formatDateTimeFull(customer.archived_at)})` : ""}. They are kept for
          the record and hidden from the active Customers list.
        </p>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <CustomerAvatar fullName={customer.full_name} photoUrl={customer.profile_photo_url} size="lg" />
          <div className="min-w-0">
            <h1 className="text-h2">{customer.full_name}</h1>
            <p className="text-body-sm text-text-muted">{customer.customer_number}</p>

            <div className="mt-2 flex flex-wrap gap-1.5">
              <CustomerLifecycleBadge status={customer.lifecycle_status} />
              <CustomerAccountStatusBadge status={customer.account_status} />
              <CustomerSourceBadge
                sourceName={customer.source?.name ?? null}
                sourceDetail={customer.source_detail}
              />
              {assignedTags.map((tag) => (
                <CustomerTagPill key={tag.id} tag={tag} />
              ))}
            </div>

            <div className="text-caption text-text-muted mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="flex items-center gap-1">
                <Mail className="size-3.5" aria-hidden="true" />
                {customer.email}
              </span>
              <span className="flex items-center gap-1">
                <Phone className="size-3.5" aria-hidden="true" />
                {customer.phone}
              </span>
              {customer.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3.5" aria-hidden="true" />
                  {customer.location.name}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/admin/customers/${customer.id}/edit`}>
            <Button leftIcon={<Pencil className="size-4" />}>Edit Customer</Button>
          </Link>
          <Button
            variant="outline"
            leftIcon={<StickyNote className="size-4" />}
            onClick={() => setAddNoteOpen(true)}
          >
            Add Note
          </Button>
          <ContactCustomerMenu email={customer.email} phone={customer.phone} />
          <Button
            variant="outline"
            leftIcon={<Tag className="size-4" />}
            onClick={() => setManageTagsOpen(true)}
          >
            Manage Tags
          </Button>

          {hasMenu && (
            <Dropdown>
              <DropdownTrigger>
                <IconButton aria-label="More actions" variant="outline">
                  <MoreVertical className="size-4" />
                </IconButton>
              </DropdownTrigger>
              <DropdownContent align="end" className="w-56 py-1">
                {canManage && (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={exporting !== null}
                      onClick={() => void handleExport("excel")}
                      className="text-body-sm text-text-primary hover:bg-card-hover flex w-full items-center gap-2.5 px-4 py-2 text-left disabled:opacity-50"
                    >
                      {exporting === "excel" ? (
                        <Spinner size="sm" />
                      ) : (
                        <FileSpreadsheet className="text-text-muted size-4" aria-hidden="true" />
                      )}
                      Export Excel
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      disabled={exporting !== null}
                      onClick={() => void handleExport("pdf")}
                      className="text-body-sm text-text-primary hover:bg-card-hover flex w-full items-center gap-2.5 px-4 py-2 text-left disabled:opacity-50"
                    >
                      {exporting === "pdf" ? (
                        <Spinner size="sm" />
                      ) : (
                        <FileText className="text-text-muted size-4" aria-hidden="true" />
                      )}
                      Export PDF
                    </button>

                    <div className="border-border my-1 border-t" role="separator" />

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => setArchiveOpen(true)}
                      className="text-body-sm text-text-primary hover:bg-card-hover flex w-full items-center gap-2.5 px-4 py-2 text-left"
                    >
                      {isArchived ? (
                        <ArchiveRestore className="text-text-muted size-4" aria-hidden="true" />
                      ) : (
                        <Archive className="text-text-muted size-4" aria-hidden="true" />
                      )}
                      {isArchived ? "Restore Customer" : "Archive Customer"}
                    </button>
                  </>
                )}

                {canDelete && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => setDeleteOpen(true)}
                    className="text-body-sm hover:bg-card-hover flex w-full items-center gap-2.5 px-4 py-2 text-left text-red-400"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    Delete Customer
                  </button>
                )}
              </DropdownContent>
            </Dropdown>
          )}
        </div>
      </div>

      <AddNoteDialog isOpen={addNoteOpen} onClose={() => setAddNoteOpen(false)} customerId={customer.id} />
      <ManageTagsDialog
        isOpen={manageTagsOpen}
        onClose={() => setManageTagsOpen(false)}
        customerId={customer.id}
        assignedTags={assignedTags}
        availableTags={availableTags}
      />

      <ConfirmDialog
        isOpen={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={() => void handleArchiveToggle()}
        isLoading={isArchiving}
        title={isArchived ? `Restore ${customer.full_name}?` : `Archive ${customer.full_name}?`}
        description={
          isArchived
            ? "They will appear in the active Customers list again. Nothing else changes."
            : "They stay on record with all their history, but are hidden from the active Customers list. You can restore them at any time."
        }
        confirmLabel={isArchived ? "Restore Customer" : "Archive Customer"}
      />

      <ConfirmDialog
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => void handleDelete()}
        isLoading={isDeleting}
        variant="danger"
        title={`Permanently delete ${customer.full_name}?`}
        description="This cannot be undone. Their profile, notes, tags and activity are removed for good. If they have any deals, reservations or test drives on record, archive them instead — deleting will be refused to protect that history."
        confirmLabel="Delete Permanently"
      />
    </div>
  );
}