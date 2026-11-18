import { getNotificationFeed } from "@/app/admin/notifications/actions";
import { NotificationsPageClient } from "@/src/components/notifications/notifications-page-client";

export const metadata = {
  title: "Notifications · Optimus Megatron Cars",
};

/**
 * The full notification history for the signed-in person.
 *
 * The topbar bell shows only the most recent few; this is where everything
 * lives, with read/unread filtering and paging. Each person only ever sees
 * their own notifications: every query is scoped to their recipient_id.
 */
export default async function NotificationsPage() {
  const initialFeed = await getNotificationFeed("all", 0);

  return <NotificationsPageClient initialFeed={initialFeed} />;
}
