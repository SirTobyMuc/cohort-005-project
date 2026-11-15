import { useEffect, useRef, useState } from "react";
import {
  Bell,
  GraduationCap,
  MessageSquare,
  Receipt,
  UsersRound,
} from "lucide-react";
import { cn, formatRelativeTime } from "~/lib/utils";
import { UserAvatar } from "~/components/user-avatar";
import type { NotificationFeedConfig } from "~/lib/notifications.server";
import {
  describeNotification,
  emptyNotificationFeed,
  type FeedNotification,
  type NotificationCategory,
  type NotificationCounts,
  type NotificationFeed,
} from "~/lib/notification-feed";

// ─── Notification Feed UI (variant A2 from prototype/notification-feed) ───
// The bell in the sidebar header and the popover it opens. Talks only to the
// client port; the Knock adapter is loaded in the browser once there is a
// feed config. No automated tests (see #46).

function newestFirst(
  current: FeedNotification[],
  incoming: FeedNotification[]
): FeedNotification[] {
  const byId = new Map(current.map((n) => [n.id, n]));
  for (const n of incoming) byId.set(n.id, n);
  return [...byId.values()].sort((a, b) =>
    b.insertedAt.localeCompare(a.insertedAt)
  );
}

const NO_COUNTS: NotificationCounts = { unseen: 0, unread: 0 };

/**
 * The session user's live Notification Feed: one adapter, and so one socket,
 * per user. A DevUI user switch closes it and opens the new user's feed.
 */
export function useNotificationFeed(config: NotificationFeedConfig | null) {
  const [feed, setFeed] = useState<NotificationFeed>(emptyNotificationFeed);
  const [notifications, setNotifications] = useState<FeedNotification[]>([]);
  const [counts, setCounts] = useState<NotificationCounts>(NO_COUNTS);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // The layout loader signs a fresh token whenever it revalidates; the
  // adapter picks up the newest one when the current token is expiring.
  const latestConfig = useRef(config);
  latestConfig.current = config;
  const userId = config?.userId ?? null;

  useEffect(() => {
    setFeed(emptyNotificationFeed());
    setNotifications([]);
    setCounts(NO_COUNTS);
    setNextCursor(null);
    const initial = latestConfig.current;
    if (!initial) return;

    let closed = false;
    let opened: NotificationFeed | null = null;
    let unsubscribe = () => {};

    import("~/lib/notification-feed.knock").then(
      async ({ knockNotificationFeed }) => {
        if (closed) return;
        const live = knockNotificationFeed(
          initial,
          () => latestConfig.current?.userToken
        );
        opened = live;
        setFeed(live);
        unsubscribe = live.subscribe((change) => {
          setCounts(change.counts);
          if (change.received.length > 0) {
            setNotifications((current) =>
              newestFirst(current, change.received)
            );
          }
        });
        try {
          const page = await live.listNotifications(null);
          if (closed) return;
          setNotifications((current) =>
            newestFirst(current, page.notifications)
          );
          setNextCursor(page.nextCursor);
          setCounts(live.counts());
        } catch (error) {
          console.error("Notification Feed failed to load:", error);
        }
      }
    );

    return () => {
      closed = true;
      unsubscribe();
      opened?.close();
    };
  }, [userId]);

  return { feed, notifications, counts, nextCursor };
}

export function NotificationBell({
  config,
}: {
  config: NotificationFeedConfig | null;
}) {
  const { notifications, counts } = useNotificationFeed(config);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
        aria-label={
          counts.unseen > 0
            ? `Notifications, ${counts.unseen} unseen`
            : "Notifications"
        }
        className="relative rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <Bell className="size-4" />
        {counts.unseen > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {counts.unseen > 9 ? "9+" : counts.unseen}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <NotificationPopover notifications={notifications} />
        </>
      )}
    </>
  );
}

function NotificationPopover({
  notifications,
}: {
  notifications: FeedNotification[];
}) {
  return (
    <div className="fixed left-56 top-2 z-50 ml-2 flex max-h-[calc(100vh-1rem)] w-[26rem] flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl">
      <div className="flex items-center gap-2 bg-muted/60 px-4 py-3">
        <Bell className="size-4" />
        <span className="font-semibold">Notifications</span>
      </div>
      <ul className="flex-1 overflow-y-auto">
        {notifications.map((n) => (
          <NotificationRow key={n.id} notification={n} />
        ))}
      </ul>
    </div>
  );
}

const categoryIcon: Record<NotificationCategory, React.ReactNode> = {
  discussion: <MessageSquare />,
  refund: <Receipt />,
  team: <UsersRound />,
  enrollment: <GraduationCap />,
};

function NotificationRow({ notification }: { notification: FeedNotification }) {
  const row = describeNotification(notification);
  const read = notification.readAt !== null;
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent">
      <span className="relative shrink-0">
        {notification.sender ? (
          <UserAvatar
            name={notification.sender.name}
            avatarUrl={notification.sender.avatar}
            className={cn("size-9", read && "opacity-60")}
          />
        ) : (
          // Notifications from Cadence itself have no sender.
          <span
            className={cn(
              "flex size-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground",
              read && "opacity-60"
            )}
          >
            C
          </span>
        )}
        <span className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-popover text-muted-foreground ring-1 ring-border [&_svg]:size-2.5">
          {categoryIcon[row.category]}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn("block truncate text-sm", !read && "font-semibold")}
        >
          {row.title}
        </span>
        <span
          className="block truncate text-xs text-muted-foreground"
          suppressHydrationWarning
        >
          {row.snippet} · {formatRelativeTime(notification.insertedAt)}
        </span>
      </span>
    </li>
  );
}
