"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Download, FilePlus2, FileText } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { IssueDocumentDialog, VoidDocumentDialog } from "@/src/components/sales/documents/document-dialogs";
import { useMotion } from "@/src/hooks/use-motion";
import { DOCUMENT_LABELS, documentPdfPath, type DocumentOption } from "@/src/lib/utils/sales-documents";
import { formatFils, toFils } from "@/src/lib/utils/sales-money";
import { formatDateTimeFull, formatDay, getDubaiToday } from "@/src/lib/utils/test-drive-format";
import type { DocumentType, SalesDocumentItem } from "@/src/lib/types/sales-documents";
import { cn } from "@/src/lib/utils/cn";

interface DocumentsPanelProps {
  /** null means the list couldn't be loaded, which is different from "no documents". */
  documents: SalesDocumentItem[] | null;
  dealId: string | null;
  reservationId: string | null;
  options: DocumentOption[];
  canIssue: boolean;
  canVoid: boolean;
  intro: string;
}

type Open = { type: "issue"; docType: DocumentType } | { type: "void"; document: SalesDocumentItem } | null;

export function DocumentsPanel({
  documents,
  dealId,
  reservationId,
  options,
  canIssue,
  canVoid,
  intro,
}: DocumentsPanelProps) {
  const { fadeUp } = useMotion();
  const router = useRouter();
  const [open, setOpen] = useState<Open>(null);
  const today = getDubaiToday();

  const done = () => {
    setOpen(null);
    router.refresh();
  };

  const blocked = options.filter((option) => option.reason);

  return (
    <section aria-label="Documents" className="surface-card flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <p className="text-label">Documents</p>
          <p className="text-caption text-text-subtle mt-1">{intro}</p>
        </div>
        {canIssue && (
          <div className="flex flex-wrap gap-2">
            {options.map((option) => (
              <Button
                key={option.type}
                size="sm"
                variant="secondary"
                disabled={!!option.reason}
                title={option.reason ?? undefined}
                leftIcon={<FilePlus2 className="size-4" aria-hidden="true" />}
                onClick={() => setOpen({ type: "issue", docType: option.type })}
              >
                {option.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      {canIssue && blocked.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {blocked.map((option) => (
            <li key={option.type} className="text-caption text-text-subtle">
              {DOCUMENT_LABELS[option.type]}: {option.reason}
            </li>
          ))}
        </ul>
      )}

      {documents === null ? (
        <p
          role="alert"
          className="text-body-sm text-text-primary rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2"
        >
          The documents couldn&apos;t be loaded. Refresh the page to try again.
        </p>
      ) : documents.length === 0 ? (
        <p className="border-border text-body-sm text-text-muted rounded-md border border-dashed px-4 py-8 text-center">
          No documents have been created yet.
        </p>
      ) : (
        <ul className="divide-border border-border divide-y overflow-hidden rounded-md border">
          {documents.map((doc, index) => {
            const voided = doc.status === "Voided";
            const expired =
              doc.doc_type === "Quotation" && !voided && !!doc.valid_until && doc.valid_until < today;
            return (
              <motion.li key={doc.id} {...fadeUp(index)} className="flex flex-col gap-3 px-4 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <FileText
                      className={cn("mt-0.5 size-5 shrink-0", voided ? "text-text-subtle" : "text-primary")}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "text-body-sm font-medium",
                          voided ? "text-text-subtle line-through" : "text-text-primary",
                        )}
                      >
                        {DOCUMENT_LABELS[doc.doc_type]} · {doc.doc_number}
                      </p>
                      <p className="text-caption text-text-subtle">
                        Created {formatDateTimeFull(doc.issued_at)}
                        {doc.issued_by_name ? ` by ${doc.issued_by_name}` : ""}
                      </p>
                      {doc.valid_until && !voided && (
                        <p className={cn("text-caption", expired ? "text-amber-500" : "text-text-subtle")}>
                          {expired ? "Expired on" : "Valid until"} {formatDay(doc.valid_until)}
                        </p>
                      )}
                      {voided && (
                        <p className="text-caption text-red-400">
                          Voided{doc.voided_by_name ? ` by ${doc.voided_by_name}` : ""}
                          {doc.voided_at ? ` on ${formatDateTimeFull(doc.voided_at)}` : ""}: {doc.void_reason}
                        </p>
                      )}
                      {doc.note && <p className="text-caption text-text-muted mt-0.5">Note: {doc.note}</p>}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                    {doc.total !== null && doc.currency && (
                      <p className="text-text-primary font-semibold whitespace-nowrap tabular-nums">
                        {formatFils(toFils(doc.total), doc.currency)}
                      </p>
                    )}
                    <span
                      className={cn(
                        "text-caption rounded-full border px-2 py-0.5",
                        voided
                          ? "border-red-500/40 bg-red-500/10 text-red-400"
                          : "border-success/40 bg-success/10 text-success",
                      )}
                    >
                      {voided ? "Voided" : "Issued"}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <a href={documentPdfPath(doc.id)} target="_blank" rel="noopener noreferrer">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-11 sm:h-9"
                      leftIcon={<Download className="size-4" aria-hidden="true" />}
                    >
                      Download PDF
                      <span className="sr-only"> (opens in a new tab)</span>
                    </Button>
                  </a>
                  {canVoid && !voided && (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-11 sm:h-9"
                      onClick={() => setOpen({ type: "void", document: doc })}
                    >
                      Void
                    </Button>
                  )}
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}

      {open?.type === "issue" && (
        <IssueDocumentDialog
          type={open.docType}
          dealId={dealId}
          reservationId={reservationId}
          onClose={() => setOpen(null)}
          onDone={done}
        />
      )}
      {open?.type === "void" && (
        <VoidDocumentDialog document={open.document} onClose={() => setOpen(null)} onDone={done} />
      )}
    </section>
  );
}
