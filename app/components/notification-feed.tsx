import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
  Bell,
  Check,
  GraduationCap,
  MessageSquare,
  Receipt,
  Settings,
  UsersRound,
} from "lucide-react";
import { cn, formatRelativeTime } from "~/lib/utils";
import { UserAvatar } from "~/components/user-avatar";
import type { NotificationFeedConfig } from "~/lib/notifications.server";
import {
  describeNotification,
  emptyNotificationFeed,
  markLoadedRead,
  markLoadedSeen,
  type FeedNotification,
  type NotificationRowGroup,
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

  // Infinite scroll asks again while a page is in flight; one at a time.
  const loadingMore = useRef(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore.current) return;
    loadingMore.current = true;
    setIsLoadingMore(true);
    try {
      const page = await feed.listNotifications(nextCursor);
      setNotifications((current) => newestFirst(current, page.notifications));
      setNextCursor(page.nextCursor);
    } catch (error) {
      // Knock skips a fetch while another (e.g. a realtime one) is in
      // flight. The cursor is unchanged, so the next scroll tries again.
      console.warn("Couldn't load older Notifications:", error);
    } finally {
      loadingMore.current = false;
      setIsLoadingMore(false);
    }
  }, [feed, nextCursor]);

  // The adapter only reports counts, so loaded rows and counts are updated
  // here straight away; Knock's next counts replace ours.
  const markRead = useCallback(
    (ids: string[]) => {
      const unread = notifications.filter(
        (n) => ids.includes(n.id) && n.readAt === null
      );
      if (unread.length === 0) return;
      const now = new Date().toISOString();
      setNotifications((current) => markLoadedRead(current, ids, now));
      setCounts((c) => ({
        ...c,
        unread: Math.max(0, c.unread - unread.length),
      }));
      feed.markRead(unread.map((n) => n.id)).catch((error) => {
        console.error("Couldn't mark the Notification read:", error);
      });
    },
    [feed, notifications]
  );

  const markAllRead = useCallback(() => {
    const now = new Date().toISOString();
    setNotifications((current) => markLoadedRead(current, "all", now));
    setCounts((c) => ({ ...c, unread: 0 }));
    feed.markAllRead().catch((error) => {
      console.error("Couldn't mark all Notifications read:", error);
    });
  }, [feed]);

  const markAllSeen = useCallback(() => {
    const now = new Date().toISOString();
    setNotifications((current) => markLoadedSeen(current, now));
    setCounts((c) => ({ ...c, unseen: 0 }));
    feed.markAllSeen().catch((error) => {
      console.error("Couldn't mark all Notifications seen:", error);
    });
  }, [feed]);

  return {
    notifications,
    counts,
    hasMore: nextCursor !== null,
    isLoadingMore,
    loadMore,
    markRead,
    markAllRead,
    markAllSeen,
  };
}

type NotificationFeedState = ReturnType<typeof useNotificationFeed>;

export function NotificationBell({
  config,
}: {
  config: NotificationFeedConfig | null;
}) {
  const feed = useNotificationFeed(config);
  const { counts } = feed;
  const [open, setOpen] = useState(false);

  function toggle() {
    const opening = !open;
    setOpen(opening);
    // Opening clears the badge, for Notifications not loaded yet too.
    if (opening && counts.unseen > 0) feed.markAllSeen();
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
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
          <NotificationPopover feed={feed} close={() => setOpen(false)} />
        </>
      )}
    </>
  );
}

function NotificationPopover({
  feed,
  close,
}: {
  feed: NotificationFeedState;
  close: () => void;
}) {
  const { notifications, counts, hasMore, isLoadingMore, loadMore } = feed;
  const list = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  // Loads the next older page whenever the end of the list scrolls into
  // view. Re-observing after each page re-checks, so a short page or a
  // skipped fetch asks again.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || isLoadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { root: list.current }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, loadMore, notifications.length]);

  return (
    <div className="fixed left-56 top-2 z-50 ml-2 flex max-h-[calc(100vh-1rem)] w-[26rem] flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl">
      <div className="flex items-center gap-2 bg-muted/60 px-4 py-3">
        <Bell className="size-4" />
        <span className="font-semibold">Notifications</span>
        <button
          type="button"
          onClick={feed.markAllRead}
          disabled={counts.unread === 0}
          className="ml-auto text-xs font-medium text-primary hover:underline disabled:opacity-40 disabled:hover:no-underline"
        >
          Mark all as read
        </button>
        <Link
          to="/settings"
          onClick={close}
          title="Notification settings"
          aria-label="Notification settings"
          className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
        >
          <Settings className="size-4" />
        </Link>
      </div>
      <div ref={list} className="flex-1 overflow-y-auto">
        {notifications.length === 0 && !hasMore ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            You're all caught up.
          </p>
        ) : (
          <ul>
            {notifications.map((n) => (
              <NotificationRow
                key={n.id}
                notification={n}
                markRead={feed.markRead}
                close={close}
              />
            ))}
          </ul>
        )}
        {hasMore && (
          <div
            ref={sentinel}
            className="p-3 text-center text-xs text-muted-foreground"
          >
            {isLoadingMore ? "Loading…" : null}
          </div>
        )}
      </div>
    </div>
  );
}

const groupIcon: Record<NotificationRowGroup, React.ReactNode> = {
  discussion: <MessageSquare />,
  refund: <Receipt />,
  team: <UsersRound />,
  enrollment: <GraduationCap />,
};

function NotificationRow({
  notification,
  markRead,
  close,
}: {
  notification: FeedNotification;
  markRead: (ids: string[]) => void;
  close: () => void;
}) {
  const row = describeNotification(notification);
  const read = notification.readAt !== null;
  // Where clicking goes; null (e.g. a Refund Request confirmation) only
  // marks the row read and keeps the popover open.
  const target = notification.data.url;

  const text = (
    <>
      <span className={cn("block truncate text-sm", !read && "font-semibold")}>
        {row.title}
      </span>
      <span
        className="block truncate text-xs text-muted-foreground"
        suppressHydrationWarning
      >
        {row.snippet} · {formatRelativeTime(notification.insertedAt)}
      </span>
    </>
  );

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
          {groupIcon[row.group]}
        </span>
      </span>
      {target ? (
        <Link
          to={target}
          onClick={() => {
            markRead([notification.id]);
            close();
          }}
          className="min-w-0 flex-1 text-left"
        >
          {text}
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => markRead([notification.id])}
          className="min-w-0 flex-1 text-left"
        >
          {text}
        </button>
      )}
      {!read && (
        <button
          type="button"
          onClick={() => markRead([notification.id])}
          title="Mark as read"
          aria-label="Mark as read"
          className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-background hover:text-primary"
        >
          <Check className="size-4" />
        </button>
      )}
    </li>
  );
}
