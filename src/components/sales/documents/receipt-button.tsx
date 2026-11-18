"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Receipt } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { issueDocumentAction } from "@/app/admin/sales/document-actions";
import { documentPdfPath } from "@/src/lib/utils/sales-documents";

/** Creates the receipt for a verified payment, or opens the one that already exists. */
export function ReceiptButton({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const result = await issueDocumentAction({
        type: "Receipt",
        dealId: null,
        reservationId: null,
        paymentId,
        note: "",
      });

      if (result.error || !result.documentId) {
        toast.error(result.error ?? "The receipt could not be created.");
        return;
      }

      toast.success(`Receipt ${result.documentNumber}${result.created ? " created" : " is ready"}`, {
        action: {
          label: "Open PDF",
          onClick: () =>
            window.open(documentPdfPath(result.documentId as string), "_blank", "noopener,noreferrer"),
        },
        duration: 8000,
      });
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      className="h-11 sm:h-9"
      isLoading={busy}
      leftIcon={<Receipt className="size-4" aria-hidden="true" />}
      onClick={() => void run()}
    >
      Receipt
    </Button>
  );
}
