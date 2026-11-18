"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Bell, CheckCheck, ChevronRight, Dot, Loader2, RotateCcw } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/shared/empty-state";
import { ErrorState } from "@/src/components/shared/error-state";

import { useMotion } from "@/src/hooks/use-motion";
import { cn } from "@/src/lib/utils/cn";
import { formatDateTimeFull } from "@/src/lib/utils/test-drive-format";
import {
  notificationDayLabel,
  notificationHref,
  notificationIcon,
} from "@/src/lib/utils/notification-links";

import {
  getNotificationFeed,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
} from "@/app/admin/notifications/actions";

import type {
  AppNotification,
  NotificationFeed,
  NotificationFilter,
} from "@/src/lib/types/notification";

interface NotificationsPageClientProps {
  initialFeed: NotificationFeed;
}

const FILTERS: { id: NotificationFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
];

/** Groups notifications under Today / Yesterday / Earlier headings, order preserved. */
function groupByDay(items: AppNotification[]): { label: string; items: AppNotification[] }[] {
  const groups: { label: string; items: AppNotification[] }[] = [];

  items.forEach((item) => {
    const label = notificationDayLabel(item.created_at);
    const last = groups[groups.length - 1];

    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  });

  return groups;
}

export function NotificationsPageClient({ initialFeed }: NotificationsPageClientProps) {
  const { fadeUp } = useMotion();

  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [feed, setFeed] = useState<NotificationFeed>(initialFeed);
  const [page, setPage] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSwitching, startSwitching] = useTransition();

  /* =========================================================
     FILTER
  ========================================================= */

  const changeFilter = (next: NotificationFilter) => {
    if (next === filter) return;

    setFilter(next);
    setPage(0);

    startSwitching(() => {
      void getNotificationFeed(next, 0)
        .then(setFeed)
        .catch(() => toast.error("Your notifications couldn't be loaded. Please try again."));
    });
  };

  /* =========================================================
     PAGING
  ========================================================= */

  const loadMore = async () => {
    const nextPage = page + 1;
    setIsLoadingMore(true);

    try {
      const next = await getNotificationFeed(filter, nextPage);

      if (next.failed) {
        toast.error("The next page couldn't be loaded. Please try again.");
        return;
      }

      setPage(nextPage);
      setFeed((current) => ({
        ...next,
        items: [...current.items, ...next.items],
      }));
    } catch {
      toast.error("The next page couldn't be loaded. Please try again.");
    } finally {
      setIsLoadingMore(false);
    }
  };

  /* =========================================================
     READ / UNREAD
  ========================================================= */

  const setRead = (notification: AppNotification, read: boolean) => {
    const readAt = read ? new Date().toISOString() : null;

    // Optimistic: the row updates now and reverts only if the server refuses.
    setFeed((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.id === notification.id ? { ...item, read_at: readAt } : item,
      ),
      unreadCount: Math.max(0, current.unreadCount + (read ? -1 : 1)),
    }));

    const request = read ? markNotificationRead(notification.id) : markNotificationUnread(notification.id);

    void request
      .then((result) => {
        if (!result.error) return;

        toast.error(result.error);
        setFeed((current) => ({
          ...current,
          items: current.items.map((item) =>
            item.id === notification.id ? { ...item, read_at: notification.read_at } : item,
          ),
          unreadCount: Math.max(0, current.unreadCount + (read ? 1 : -1)),
        }));
      })
      .catch(() => toast.error("Your change couldn't be saved. Please try again."));
  };

  const markAllRead = () => {
    const readAt = new Date().toISOString();
    const previous = feed;

    setFeed((current) => ({
      ...current,
      items: current.items.map((item) => ({ ...item, read_at: item.read_at ?? readAt })),
      unreadCount: 0,
    }));

    void markAllNotificationsRead()
      .then((result) => {
        if (!result.error) {
          toast.success("All notifications marked as read.");
          return;
        }

        toast.error(result.error);
        setFeed(previous);
      })
      .catch(() => {
        toast.error("Your change couldn't be saved. Please try again.");
        setFeed(previous);
      });
  };

  /* =========================================================
     RENDER
  ========================================================= */

  const groups = groupByDay(feed.items);

  return (
    <div className="flex flex-col gap-5">
      {/* =====================================================
          HEADER
      ===================================================== */}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-h2">Notifications</h1>
          <p className="text-body-sm text-text-muted mt-1">
            {feed.unreadCount > 0
              ? `${feed.unreadCount} unread of ${feed.totalCount}`
              : feed.totalCount > 0
                ? `${feed.totalCount} in total · you're all caught up`
                : "Everything that needs your attention lands here."}
          </p>
        </div>

        {feed.unreadCount > 0 && (
          <Button variant="outline" leftIcon={<CheckCheck className="size-4" />} onClick={markAllRead}>
            Mark all read
          </Button>
        )}
      </div>

      {/* =====================================================
          FILTER
      ===================================================== */}

      <div
        role="group"
        aria-label="Filter notifications"
        className="border-border bg-card inline-flex w-fit gap-1 rounded-lg border p-1"
      >
        {FILTERS.map((option) => {
          const isSelected = filter === option.id;

          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => changeFilter(option.id)}
              className={cn(
                "text-body-sm focus-visible:ring-primary relative min-h-9 rounded-md px-3.5 font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
                isSelected ? "text-[#0b1220]" : "text-text-muted hover:text-text-primary",
              )}
            >
              {isSelected && (
                <motion.span
                  layoutId="notification-filter-pill"
                  className="bg-primary absolute inset-0 rounded-md"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}

              <span className="relative z-10 flex items-center gap-1.5">
                {option.label}
                {option.id === "unread" && feed.unreadCount > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[11px] leading-none font-semibold tabular-nums",
                      isSelected ? "bg-[#0b1220]/15" : "bg-primary/10 text-primary",
                    )}
                  >
                    {feed.unreadCount}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* =====================================================
          LIST
      ===================================================== */}

      {feed.failed ? (
        <ErrorState
          title="Your notifications couldn't be loaded"
          description="Nothing has been lost. Refresh the page to try again."
        />
      ) : isSwitching ? (
        <div className="surface-card flex items-center justify-center gap-2 p-12">
          <Loader2 className="text-text-subtle size-4 animate-spin" aria-hidden="true" />
          <p className="text-body-sm text-text-muted">Loading notifications…</p>
        </div>
      ) : feed.items.length === 0 ? (
        <EmptyState
          icon="Inbox"
          title={filter === "unread" ? "Nothing unread" : "No notifications yet"}
          description={
            filter === "unread"
              ? "Every notification has been read."
              : "Assignments, follow-ups, approvals and reminders will appear here."
          }
        />
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((group, groupIndex) => (
            <section key={`${group.label}-${groupIndex}`} aria-label={group.label}>
              <p className="text-label mb-2">{group.label}</p>

              <ul className="surface-card divide-border divide-y overflow-hidden">
                {group.items.map((notification, index) => {
                  const Icon = notificationIcon(notification.type);
                  const href = notificationHref(notification);
                  const isUnread = !notification.read_at;

                  return (
                    <motion.li
                      key={notification.id}
                      {...fadeUp(index)}
                      className={cn("relative", isUnread && "bg-primary/[0.04]")}
                    >
                      <div className="flex items-start gap-3 p-4">
                        <span
                          className={cn(
                            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                            isUnread ? "bg-primary/15 text-primary" : "bg-card-hover text-text-subtle",
                          )}
                        >
                          <Icon className="size-4" aria-hidden="true" />
                        </span>

                        <div className="min-w-0 flex-1">
                          <p className="text-body-sm text-text-primary flex items-center gap-1.5 font-medium">
                            {isUnread && <span className="sr-only">Unread:</span>}
                            {notification.title}
                            {isUnread && (
                              <span aria-hidden="true" className="bg-primary size-1.5 shrink-0 rounded-full" />
                            )}
                          </p>

                          {notification.description && (
                            <p className="text-body-sm text-text-muted mt-0.5">{notification.description}</p>
                          )}

                          <p className="text-caption text-text-subtle mt-1.5 flex items-center gap-0.5">
                            <time
                              dateTime={notification.created_at}
                              title={formatDateTimeFull(notification.created_at)}
                            >
                              {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                            </time>

                            {href && (
                              <>
                                <Dot className="size-3.5 shrink-0" aria-hidden="true" />
                                <Link
                                  href={href}
                                  onClick={() => {
                                    if (isUnread) setRead(notification, true);
                                  }}
                                  className="text-primary-text hover:text-primary-hover focus-visible:ring-primary inline-flex items-center gap-0.5 rounded focus-visible:ring-2 focus-visible:outline-none"
                                >
                                  Open
                                  <ChevronRight className="size-3.5" aria-hidden="true" />
                                </Link>
                              </>
                            )}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => setRead(notification, isUnread)}
                          title={isUnread ? "Mark as read" : "Mark as unread"}
                          className="text-text-subtle hover:text-text-primary focus-visible:ring-primary flex size-9 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
                        >
                          {isUnread ? (
                            <CheckCheck className="size-4" aria-hidden="true" />
                          ) : (
                            <RotateCcw className="size-4" aria-hidden="true" />
                          )}
                          <span className="sr-only">
                            {isUnread
                              ? `Mark "${notification.title}" as read`
                              : `Mark "${notification.title}" as unread`}
                          </span>
                        </button>
                      </div>
                    </motion.li>
                  );
                })}
              </ul>
            </section>
          ))}

          {feed.hasMore && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => void loadMore()}
                isLoading={isLoadingMore}
                leftIcon={<Bell className="size-4" />}
              >
                Load older notifications
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}