export interface AppNotification {
  id: string;
  type: string;
  title: string;
  description: string | null;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
}

/** How many notifications the full Notifications page loads at a time. */
export const NOTIFICATION_PAGE_SIZE = 25;

export type NotificationFilter = "all" | "unread";

export interface NotificationFeed {
  items: AppNotification[];
  unreadCount: number;
  totalCount: number;
  /** True when another page can be loaded. */
  hasMore: boolean;
  /** True when the feed itself failed to load, which is not the same as being empty. */
  failed: boolean;
}
