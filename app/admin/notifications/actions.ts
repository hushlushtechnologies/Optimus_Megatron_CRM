"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/src/lib/supabase/server";
import { NOTIFICATION_PAGE_SIZE } from "@/src/lib/types/notification";
import type { AppNotification, NotificationFeed, NotificationFilter } from "@/src/lib/types/notification";

/*
 * A "use server" file may only export async functions, so the page size, the
 * filter type and the feed shape live in src/lib/types/notification.ts and
 * are imported here.
 */

const NOTIFICATION_COLUMNS = "id, type, title, description, entity_type, entity_id, read_at, created_at";

const EMPTY_FEED: NotificationFeed = {
  items: [],
  unreadCount: 0,
  totalCount: 0,
  hasMore: false,
  failed: false,
};

/* =========================================================
   READ — TOPBAR DROPDOWN
========================================================= */

/**
 * The most recent notifications for the signed-in person, for the topbar bell.
 * Kept exactly as it was so the dropdown's polling is unaffected.
 */
export async function getMyNotifications(
  limit = 20,
): Promise<{ notifications: AppNotification[]; unreadCount: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { notifications: [], unreadCount: 0 };

  const [{ data }, { count }] = await Promise.all([
    supabase
      .from("notifications")
      .select(NOTIFICATION_COLUMNS)
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("recipient_id", user.id)
      .is("read_at", null),
  ]);

  return { notifications: (data ?? []) as AppNotification[], unreadCount: count ?? 0 };
}

/* =========================================================
   READ — FULL PAGE
========================================================= */

/**
 * One page of the signed-in person's notifications, newest first, with the
 * counts the page header needs.
 *
 * A failure is reported as `failed`, never as an empty list, so the page can
 * say it couldn't load instead of claiming there is nothing there.
 */
export async function getNotificationFeed(
  filter: NotificationFilter = "all",
  page = 0,
): Promise<NotificationFeed> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return EMPTY_FEED;

  const safePage = Number.isInteger(page) && page >= 0 ? page : 0;
  const from = safePage * NOTIFICATION_PAGE_SIZE;

  // One extra row tells us whether another page exists, with no second count query.
  const to = from + NOTIFICATION_PAGE_SIZE;

  let rows = supabase
    .from("notifications")
    .select(NOTIFICATION_COLUMNS)
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filter === "unread") rows = rows.is("read_at", null);

  const [page_, unread, total] = await Promise.all([
    rows,
    supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("recipient_id", user.id)
      .is("read_at", null),
    supabase.from("notifications").select("*", { count: "exact", head: true }).eq("recipient_id", user.id),
  ]);

  if (page_.error) {
    console.error("getNotificationFeed error:", page_.error);
    return { ...EMPTY_FEED, failed: true };
  }

  const fetched = (page_.data ?? []) as AppNotification[];
  const hasMore = fetched.length > NOTIFICATION_PAGE_SIZE;

  return {
    items: hasMore ? fetched.slice(0, NOTIFICATION_PAGE_SIZE) : fetched,
    unreadCount: unread.count ?? 0,
    totalCount: total.count ?? 0,
    hasMore,
    failed: false,
  };
}

/* =========================================================
   WRITE
========================================================= */

export async function markNotificationRead(notificationId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("recipient_id", user.id)
    .is("read_at", null);

  if (error) {
    console.error("markNotificationRead error:", error);
    return { error: "Unable to update this notification." };
  }
  return { error: null };
}

/** Puts one notification back in the unread list. */
export async function markNotificationUnread(notificationId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: null })
    .eq("id", notificationId)
    .eq("recipient_id", user.id)
    .not("read_at", "is", null);

  if (error) {
    console.error("markNotificationUnread error:", error);
    return { error: "Unable to update this notification." };
  }

  revalidatePath("/admin/notifications");
  return { error: null };
}

export async function markAllNotificationsRead() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", user.id)
    .is("read_at", null);

  if (error) {
    console.error("markAllNotificationsRead error:", error);
    return { error: "Unable to update your notifications." };
  }

  revalidatePath("/admin/notifications");
  return { error: null };
}
