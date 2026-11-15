import { describe, it, expect } from "vitest";
import {
  describeNotification,
  markLoadedRead,
  markLoadedSeen,
  type FeedNotification,
} from "./notification-feed";

const received = {
  id: "msg_1",
  insertedAt: "2026-11-15T10:00:00.000Z",
  readAt: null,
  seenAt: null,
};

const ana = { name: "Ana Buyer", avatar: null };

describe("describeNotification", () => {
  it("confirms a Refund Request from Cadence itself", () => {
    const notification: FeedNotification = {
      ...received,
      sender: null,
      kind: "refund_request_confirmation",
      data: {
        refundRequestId: 7,
        courseTitle: "Test Course",
        amount: 7900,
        url: null,
      },
    };

    expect(describeNotification(notification)).toEqual({
      category: "refund",
      title: "We've received your Refund Request",
      snippet: "$79.00 for Test Course is under review.",
    });
  });

  it("tells a Platform Admin who asked for which refund and why", () => {
    const notification: FeedNotification = {
      ...received,
      sender: ana,
      kind: "open_refund_request",
      data: {
        refundRequestId: 7,
        courseTitle: "Test Course",
        amount: 7900,
        reason: "Bought the wrong course.",
        url: "/admin/refunds",
      },
    };

    expect(describeNotification(notification)).toEqual({
      category: "refund",
      title: "Ana Buyer requested a $79.00 refund",
      snippet: "Test Course: “Bought the wrong course.”",
    });
  });

  const decided = {
    refundRequestId: 7,
    purchaseId: 3,
    courseTitle: "Test Course",
    amount: 7900,
  };

  it("tells the buyer their Refund Request was approved, with any note", () => {
    const approved = (decisionNote: string | null): FeedNotification => ({
      ...received,
      sender: null,
      kind: "refund_request_approved",
      data: {
        ...decided,
        purchasedAt: "2026-11-01T10:00:00.000Z",
        decisionNote,
        url: null,
      },
    });

    expect(describeNotification(approved("Sorry it wasn't a fit."))).toEqual({
      category: "refund",
      title: "Your Refund Request was approved",
      snippet: "$79.00 for Test Course: “Sorry it wasn't a fit.”",
    });
    expect(describeNotification(approved(null)).snippet).toBe(
      "$79.00 for Test Course will be refunded."
    );
  });

  it("tells the buyer their Refund Request was declined and they can ask again", () => {
    const notification: FeedNotification = {
      ...received,
      sender: null,
      kind: "refund_request_declined",
      data: { ...decided, decisionNote: "Over the Watch Limit.", url: null },
    };

    expect(describeNotification(notification)).toEqual({
      category: "refund",
      title: "Your Refund Request was declined",
      snippet: "Test Course: “Over the Watch Limit.” You can ask again.",
    });
  });

  const discussion = {
    commentId: 12,
    courseTitle: "Test Course",
    lessonTitle: "Narrowing",
    snippet: "Why doesn't `in` narrow here?",
    url: "/courses/test-course/lessons/3#comment-12",
  };

  it("tells an Instructor who asked a Discussion Question on which lesson", () => {
    const notification: FeedNotification = {
      ...received,
      sender: ana,
      kind: "discussion_question",
      data: discussion,
    };

    expect(describeNotification(notification)).toEqual({
      category: "discussion",
      title: "Ana Buyer asked a question on Narrowing",
      snippet: "“Why doesn't `in` narrow here?”",
    });
  });

  it("tells a question's author who replied to it", () => {
    const notification: FeedNotification = {
      ...received,
      sender: ana,
      kind: "discussion_reply",
      data: discussion,
    };

    expect(describeNotification(notification)).toEqual({
      category: "discussion",
      title: "Ana Buyer replied to your question on Narrowing",
      snippet: "“Why doesn't `in` narrow here?”",
    });
  });
});

describe("marking loaded Notifications", () => {
  const at = "2026-11-15T12:00:00.000Z";
  const earlier = "2026-11-15T11:00:00.000Z";

  function question(
    id: string,
    status: { readAt?: string | null; seenAt?: string | null } = {}
  ): FeedNotification {
    return {
      ...received,
      id,
      readAt: status.readAt ?? null,
      seenAt: status.seenAt ?? null,
      sender: ana,
      kind: "discussion_question",
      data: {
        commentId: 12,
        courseTitle: "Test Course",
        lessonTitle: "Narrowing",
        snippet: "Why?",
        url: "/courses/test-course/lessons/3#comment-12",
      },
    };
  }

  it("marks only the given rows read", () => {
    const rows = [question("a"), question("b")];

    const marked = markLoadedRead(rows, ["b"], at);

    expect(marked.map((n) => [n.id, n.readAt])).toEqual([
      ["a", null],
      ["b", at],
    ]);
  });

  it("marks every loaded row read, keeping when earlier ones were read", () => {
    const rows = [question("msg_1"), question("msg_2", { readAt: earlier })];

    const marked = markLoadedRead(rows, "all", at);

    expect(marked.map((n) => [n.id, n.readAt])).toEqual([
      ["msg_1", at],
      ["msg_2", earlier],
    ]);
  });

  it("marks every loaded row seen and leaves them unread", () => {
    const rows = [question("msg_1"), question("msg_2", { seenAt: earlier })];

    const marked = markLoadedSeen(rows, at);

    expect(marked.map((n) => [n.id, n.seenAt, n.readAt])).toEqual([
      ["msg_1", at, null],
      ["msg_2", earlier, null],
    ]);
  });
});
