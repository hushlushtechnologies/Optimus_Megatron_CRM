"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Plus, Power, Ticket } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Modal } from "@/src/components/ui/modal";
import { ConfirmDialog } from "@/src/components/shared/confirm-dialog";
import { EmptyState } from "@/src/components/shared/empty-state";

import { createPromotionCodeAction, setCodeActiveAction } from "@/app/admin/offers/actions";
import type { OfferCode, OfferDetail } from "@/src/lib/types/offer-detail";
import { cn } from "@/src/lib/utils/cn";
import { formatDay } from "@/src/lib/utils/test-drive-format";

/*
|--------------------------------------------------------------------------
| PROMOTIONAL CODES (Phase 12)
|--------------------------------------------------------------------------
|
| One campaign can carry several codes, each with its own limits — which is
| why they are their own table rather than a column on the campaign. A
| launch code with 50 uses and a VIP code with no limit can point at the
| same discount.
|
| THE LIMITS ARE NOT ENFORCED HERE.
|
| Redeeming goes through redeem_promotion_code in the database, which takes
| a row lock on the code before it counts anything. Checking a limit in
| JavaScript and then inserting is two steps, and two tills can both pass
| the check before either writes — so a code limited to 50 gets used 52
| times and nothing in the log looks wrong.
|
| This screen creates codes, shows what they have been used for, and turns
| them off. It never decides whether a redemption is allowed.
*/

interface OfferCodesTabProps {
  detail: OfferDetail;
  canManage: boolean;
}

export function OfferCodesTab({ detail, canManage }: OfferCodesTabProps) {
  const router = useRouter();

  const [creating, setCreating] = useState(false);
  const [toggling, setToggling] = useState<OfferCode | null>(null);
  const [busy, setBusy] = useState(false);

  const [code, setCode] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const [perCustomerLimit, setPerCustomerLimit] = useState("");

  const create = async () => {
    setBusy(true);

    try {
      const result = await createPromotionCodeAction({
        promotionId: detail.id,
        code,
        usageLimit,
        perCustomerLimit,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(`${code.toUpperCase()} created.`);
      setCreating(false);
      setCode("");
      setUsageLimit("");
      setPerCustomerLimit("");
      router.refresh();
    } catch {
      toast.error("Something went wrong. The code wasn't created.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async () => {
    if (!toggling) return;

    setBusy(true);

    try {
      const result = await setCodeActiveAction({ id: toggling.id, isActive: !toggling.isActive });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(
        toggling.isActive
          ? `${toggling.code} switched off. Past redemptions are unaffected.`
          : `${toggling.code} is active again.`,
      );

      setToggling(null);
      router.refresh();
    } catch {
      toast.error("Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${value} copied.`);
    } catch {
      /* Clipboard access can be refused; the code is on screen to read. */
      toast.error("Couldn't copy it — you can select it by hand.");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-body text-text-primary font-medium">
            {detail.codes.length === 0
              ? "No codes"
              : `${detail.codes.length} ${detail.codes.length === 1 ? "code" : "codes"}`}
          </p>

          <p className="text-body-sm text-text-muted mt-0.5 max-w-xl">
            A code is optional. Without one, this campaign applies automatically to whatever it
            targets.
          </p>
        </div>

        {canManage && detail.archivedAt === null && (
          <Button
            variant="gradient"
            size="sm"
            leftIcon={<Plus className="size-4" aria-hidden="true" />}
            onClick={() => setCreating(true)}
          >
            New code
          </Button>
        )}
      </div>

      {detail.codes.length === 0 ? (
        <div className="surface-card">
          <EmptyState
            icon="Tag"
            title="No promotional codes"
            description="Add one if customers should have to quote something to get this discount."
            size="compact"
          />
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {detail.codes.map((item) => {
            const exhausted = item.usageLimit !== null && item.usedCount >= item.usageLimit;

            return (
              <li
                key={item.id}
                className={cn("surface-card flex flex-col gap-3 p-4", !item.isActive && "opacity-70")}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Ticket className="text-primary size-4 shrink-0" aria-hidden="true" />

                    <code className="text-body text-text-primary font-mono font-semibold tracking-wider">
                      {item.code}
                    </code>

                    <button
                      type="button"
                      onClick={() => void copy(item.code)}
                      aria-label={`Copy ${item.code}`}
                      className="text-text-muted hover:text-primary hover:bg-card-hover inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors"
                    >
                      <Copy className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    {exhausted && <Badge status="warning">Fully used</Badge>}
                    <Badge status={item.isActive ? "success" : "neutral"}>
                      {item.isActive ? "Active" : "Off"}
                    </Badge>
                  </div>
                </div>

                <div className="text-body-sm text-text-muted flex flex-wrap gap-x-4 gap-y-1">
                  <span className="text-text-primary tabular-nums">
                    Used {item.usedCount.toLocaleString()}
                    {item.usageLimit !== null && ` of ${item.usageLimit.toLocaleString()}`}
                  </span>

                  <span>
                    {item.perCustomerLimit === null
                      ? "No per-customer limit"
                      : `${item.perCustomerLimit} per customer`}
                  </span>

                  <span>added {formatDay(item.createdAt)}</span>

                  {item.createdByName && <span>by {item.createdByName}</span>}
                </div>

                {canManage && (
                  <div>
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<Power className="size-3.5" aria-hidden="true" />}
                      onClick={() => setToggling(item)}
                    >
                      {item.isActive ? "Switch off" : "Switch on"}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* ===================================================
          NEW CODE
      =================================================== */}

      <Modal isOpen={creating} onClose={() => setCreating(false)} title="New promotional code">
        <div className="flex flex-col gap-4">
          <Input
            label="The code"
            placeholder="MEGATRONVIP"
            value={code}
            maxLength={40}
            required
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            hint="Letters, numbers and hyphens. No spaces — a code gets read out over the phone."
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Total uses"
              type="number"
              min={1}
              step="1"
              value={usageLimit}
              onChange={(event) => setUsageLimit(event.target.value)}
              hint="Blank = unlimited."
            />

            <Input
              label="Uses per customer"
              type="number"
              min={1}
              step="1"
              value={perCustomerLimit}
              onChange={(event) => setPerCustomerLimit(event.target.value)}
              hint="Blank = unlimited."
            />
          </div>

          <p className="text-body-sm text-text-muted">
            Codes are unique across every campaign, so if this one is taken you&apos;ll be told.
            Limits are enforced in the database when the code is redeemed, not in the browser.
          </p>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreating(false)} disabled={busy}>
              Cancel
            </Button>

            <Button
              variant="gradient"
              onClick={() => void create()}
              disabled={busy || code.trim().length < 3}
            >
              Create
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={toggling !== null}
        onClose={() => setToggling(null)}
        onConfirm={() => void toggle()}
        title={toggling?.isActive ? `Switch off ${toggling.code}?` : `Switch on ${toggling?.code}?`}
        description={
          toggling?.isActive
            ? "Nobody will be able to quote it from now on. Redemptions already made are unaffected, and you can switch it back on."
            : "Customers will be able to quote it again, subject to its limits."
        }
        confirmLabel={toggling?.isActive ? "Switch off" : "Switch on"}
        isLoading={busy}
      />
    </div>
  );
}
