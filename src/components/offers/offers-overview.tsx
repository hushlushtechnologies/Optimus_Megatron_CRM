"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  CalendarClock,
  CircleDollarSign,
  Clock,
  Gift,
  Plus,
  Sparkles,
  Tag,
  Ticket,
  TriangleAlert,
  Users,
} from "lucide-react";

import { Card } from "@/src/components/ui/card";
import { EmptyState } from "@/src/components/shared/empty-state";
import { MetricCard } from "@/src/components/shared/metric-card";
import { OfferCard } from "@/src/components/offers/offer-card";

import { setOfferStatusAction } from "@/app/admin/offers/actions";
import { useMotion } from "@/src/hooks/use-motion";
import type { OfferListRow, OfferSummary } from "@/src/lib/types/offer-list";
import type { OfferPermissions } from "@/src/lib/utils/offer-permissions";

interface OffersOverviewProps {
  summary: OfferSummary | null;
  permissions: OfferPermissions;
}

/* =========================================================
   A SECTION OF CARDS
========================================================= */

function OfferSection({
  title,
  description,
  icon,
  offers,
  permissions,
  busyId,
  onPause,
  onResume,
  emptyTitle,
  emptyDescription,
  index,
}: {
  title: string;
  description?: string;
  icon: React.ReactNode;
  offers: OfferListRow[];
  permissions: OfferPermissions;
  busyId: string | null;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  emptyTitle: string;
  emptyDescription?: string;
  index: number;
}) {
  const { reduce, transition } = useMotion();

  return (
    <motion.section
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transition(0.3, index * 0.06)}
      className="flex flex-col gap-3"
    >
      <div>
        <h2 className="text-h4 text-text-primary flex items-center gap-2">
          <span className="text-primary">{icon}</span>
          {title}
        </h2>

        {description && <p className="text-body-sm text-text-muted mt-0.5">{description}</p>}
      </div>

      {offers.length === 0 ? (
        <Card padding="md">
          <EmptyState title={emptyTitle} description={emptyDescription} size="compact" />
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {offers.map((offer, position) => (
            <OfferCard
              key={offer.id}
              offer={offer}
              canPublish={permissions.publish}
              busy={busyId === offer.id}
              onPause={onPause}
              onResume={onResume}
              index={position}
            />
          ))}
        </ul>
      )}
    </motion.section>
  );
}

/* =========================================================
   OVERVIEW
========================================================= */

/**
 * The offers workspace overview.
 *
 * Every figure here is a count of rows that exist. There are no trends and
 * no percentages-versus-last-month: the plan says not to invent them, and a
 * change figure from a module that went live this week would be noise shaped
 * like insight.
 */
export function OffersOverview({ summary, permissions }: OffersOverviewProps) {
  const router = useRouter();

  const [busyId, setBusyId] = useState<string | null>(null);

  const move = async (id: string, status: "active" | "paused") => {
    setBusyId(id);

    try {
      const result = await setOfferStatusAction({ id, status });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(status === "paused" ? "Campaign paused." : "Campaign running again.");
      router.refresh();
    } catch {
      toast.error("Something went wrong. Refresh the page and try again.");
    } finally {
      setBusyId(null);
    }
  };

  if (summary === null) {
    return (
      <div
        role="alert"
        className="surface-card text-body-sm text-text-primary flex items-start gap-3 p-5"
      >
        <TriangleAlert className="text-warning mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-medium">The overview couldn&apos;t be loaded.</p>
          <p className="text-text-muted mt-1">
            Refresh the page to try again. If it keeps happening, the promotions tables may not have
            been migrated yet.
          </p>
        </div>
      </div>
    );
  }

  const nothingYet = summary.totalPromotions === 0;

  return (
    <div className="flex flex-col gap-8">
      {/* ===============================================
          THE NUMBERS
      =============================================== */}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          label="Total Promotions"
          value={summary.totalPromotions}
          icon={<Tag />}
          caption="Not archived"
        />
        <MetricCard
          label="Active Promotions"
          value={summary.activePromotions}
          icon={<Sparkles />}
          accent="success"
          caption="Running now"
        />
        <MetricCard
          label="Scheduled Promotions"
          value={summary.scheduledPromotions}
          icon={<CalendarClock />}
          accent="info"
          caption="Waiting to start"
        />
        <MetricCard
          label="Expired Promotions"
          value={summary.expiredPromotions}
          icon={<Clock />}
          caption="Finished"
        />
        <MetricCard
          label="Personalized Offers"
          value={summary.personalisedOffers}
          icon={<Users />}
          accent="info"
          caption="Assigned to customers"
        />
        <MetricCard
          label="Total Redemptions"
          value={summary.totalRedemptions}
          icon={<Ticket />}
          caption="Applied to deals"
        />
      </div>

      {/* ===============================================
          NOTHING YET
      =============================================== */}

      {nothingYet && (
        <Card padding="lg">
          <EmptyState
            title="No campaigns yet"
            description="A promotion is a discount with rules around it — who it applies to, which vehicles, when it runs and how often it can be used. Create one and it appears here."
            action={
              permissions.manage
                ? { label: "Create a promotion", href: "/admin/offers/new" }
                : undefined
            }
          />
        </Card>
      )}

      {/* ===============================================
          NEEDS A LOOK
      =============================================== */}

      {summary.needsAttention.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-h4 text-text-primary flex items-center gap-2">
            <TriangleAlert className="text-warning size-4" aria-hidden="true" />
            Needs a look
          </h2>

          <ul className="flex flex-col gap-2">
            {summary.needsAttention.map(({ offer, reason }) => (
              <li key={offer.id}>
                <Link
                  href={`/admin/offers/${offer.id}`}
                  className="surface-card hover:bg-card-hover focus-visible:ring-primary flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                >
                  <span className="text-body-sm text-text-primary font-medium">{offer.name}</span>
                  <span className="text-body-sm text-warning">{reason}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ===============================================
          THE THREE LISTS
      =============================================== */}

      {!nothingYet && (
        <>
          <OfferSection
            title="Currently active"
            description="Running right now, soonest to finish first."
            icon={<Sparkles className="size-4" aria-hidden="true" />}
            offers={summary.currentlyActive}
            permissions={permissions}
            busyId={busyId}
            onPause={(id) => void move(id, "paused")}
            onResume={(id) => void move(id, "active")}
            emptyTitle="Nothing running"
            emptyDescription="No campaign is live at the moment."
            index={0}
          />

          <OfferSection
            title="Scheduled next"
            description="Set to start, soonest first."
            icon={<CalendarClock className="size-4" aria-hidden="true" />}
            offers={summary.scheduledNext}
            permissions={permissions}
            busyId={busyId}
            onPause={(id) => void move(id, "paused")}
            onResume={(id) => void move(id, "active")}
            emptyTitle="Nothing scheduled"
            emptyDescription="Campaigns with a future start date appear here."
            index={1}
          />

          <OfferSection
            title="Recently expired"
            description="Finished in the last 30 days."
            icon={<Clock className="size-4" aria-hidden="true" />}
            offers={summary.recentlyExpired}
            permissions={permissions}
            busyId={busyId}
            onPause={(id) => void move(id, "paused")}
            onResume={(id) => void move(id, "active")}
            emptyTitle="Nothing has expired recently"
            index={2}
          />
        </>
      )}

      {/* ===============================================
          LOYALTY
      =============================================== */}

      {permissions.loyaltyView && (
        <section className="flex flex-col gap-3">
          <h2 className="text-h4 text-text-primary flex items-center gap-2">
            <Gift className="text-primary size-4" aria-hidden="true" />
            Loyalty
          </h2>

          {summary.loyalty === null || !summary.loyalty.isEnabled ? (
            <Card padding="md">
              <EmptyState
                title="The loyalty program is switched off"
                description="It needs an earn rate and a points conversion before it can be turned on. Until then nothing earns and nothing can be redeemed."
                size="compact"
                action={
                  permissions.loyaltySettings
                    ? { label: "Loyalty settings", href: "/admin/offers/settings" }
                    : undefined
                }
              />
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MetricCard
                label="Customers participating"
                value={summary.loyalty.participatingCustomers}
                icon={<Users />}
                caption="With points on hand"
              />
              <MetricCard
                label="Points outstanding"
                value={summary.loyalty.pointsOutstanding}
                icon={<CircleDollarSign />}
                caption="Across all wallets"
              />
              <MetricCard
                label="Earned (30 days)"
                value={summary.loyalty.pointsEarned30d}
                icon={<Plus />}
                accent="success"
                caption="From qualifying sales"
              />
              <MetricCard
                label="Redeemed (30 days)"
                value={summary.loyalty.pointsRedeemed30d}
                icon={<Ticket />}
                caption="Against deals"
              />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
