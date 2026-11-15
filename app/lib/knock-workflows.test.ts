import { describe, it, expect, vi, afterEach } from "vitest";
import { KNOCK_WORKFLOW_KEYS, toFeedNotification } from "./knock-workflows";
import type { Notification, NotificationKind } from "./notification-kinds";

afterEach(() => {
  vi.restoreAllMocks();
});

const discussion = {
  commentId: 3,
  courseTitle: "Test Course",
  lessonTitle: "Lesson One",
  snippet: "How does this work?",
  url: "/courses/test/lessons/1#comment-3",
};

// One of every Notification kind, as the server port triggers it.
const sent: { [K in NotificationKind]: Extract<Notification, { kind: K }> } = {
  refund_request_confirmation: {
    kind: "refund_request_confirmation",
    data: {
      refundRequestId: 7,
      courseTitle: "Test Course",
      amount: 7900,
      url: null,
    },
  },
  open_refund_request: {
    kind: "open_refund_request",
    data: {
      refundRequestId: 7,
      courseTitle: "Test Course",
      amount: 7900,
      reason: "Wrong course.",
      url: "/admin/refunds",
    },
  },
  refund_request_approved: {
    kind: "refund_request_approved",
    data: {
      refundRequestId: 7,
      purchaseId: 4,
      purchasedAt: "2026-11-01T10:00:00.000Z",
      courseTitle: "Test Course",
      amount: 7900,
      decisionNote: null,
      url: null,
    },
  },
  refund_request_declined: {
    kind: "refund_request_declined",
    data: {
      refundRequestId: 7,
      purchaseId: 4,
      courseTitle: "Test Course",
      amount: 7900,
      decisionNote: "Past the Watch Limit.",
      url: null,
    },
  },
  seat_claimed: {
    kind: "seat_claimed",
    data: { seatId: 9, courseTitle: "Test Course", seatsLeft: 2, url: "/team" },
  },
  new_enrollment: {
    kind: "new_enrollment",
    data: { enrollmentId: 5, courseTitle: "Test Course", url: "/instructor" },
  },
  discussion_question: { kind: "discussion_question", data: discussion },
  discussion_reply: { kind: "discussion_reply", data: discussion },
};

function feedItem(workflowKey: string, data: unknown) {
  return {
    id: "msg_1",
    source: { key: workflowKey, version_id: "v1", categories: [] },
    data,
    actors: [{ id: "2", name: "Ana Buyer", avatar: null }],
    inserted_at: "2026-11-15T10:00:00.000Z",
    read_at: null,
    seen_at: null,
  };
}

describe("toFeedNotification", () => {
  it.each(Object.values(sent))(
    "brings a $kind Notification back into the feed",
    (notification) => {
      const item = feedItem(
        KNOCK_WORKFLOW_KEYS[notification.kind],
        notification.data
      );

      expect(toFeedNotification(item)).toEqual({
        ...notification,
        id: "msg_1",
        sender: { name: "Ana Buyer", avatar: null },
        insertedAt: "2026-11-15T10:00:00.000Z",
        readAt: null,
        seenAt: null,
      });
    }
  );

  it("has no sender when nobody caused it", () => {
    const item = {
      ...feedItem(
        "refund-request-confirmation",
        sent.refund_request_confirmation.data
      ),
      actors: [],
    };

    expect(toFeedNotification(item)?.sender).toBeNull();
  });

  it("leaves out a workflow Cadence doesn't know", () => {
    expect(toFeedNotification(feedItem("some-other-workflow", {}))).toBeNull();
  });

  it("logs and leaves out a Notification whose data doesn't fit its kind", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const item = feedItem("seat-claimed", { courseTitle: "Test Course" });

    expect(toFeedNotification(item)).toBeNull();
    expect(log).toHaveBeenCalled();
  });
});
