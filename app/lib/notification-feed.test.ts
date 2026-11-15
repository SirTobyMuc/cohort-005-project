import { describe, it, expect } from "vitest";
import {
  describeNotification,
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

  it("tells a Team Admin who claimed a Seat and how many are left", () => {
    const notification: FeedNotification = {
      ...received,
      sender: ana,
      kind: "seat_claimed",
      data: {
        seatId: 4,
        courseTitle: "Test Course",
        seatsLeft: 3,
        url: "/team",
      },
    };

    expect(describeNotification(notification)).toEqual({
      category: "team",
      title: "Ana Buyer claimed a Seat on Test Course",
      snippet: "3 Seats left.",
    });
  });

  it("says when a Team Licence has one Seat left, or none", () => {
    const seat = { seatId: 4, courseTitle: "Test Course", url: "/team" };
    const row = (seatsLeft: number) =>
      describeNotification({
        ...received,
        sender: ana,
        kind: "seat_claimed",
        data: { ...seat, seatsLeft },
      }).snippet;

    expect([row(1), row(0)]).toEqual(["1 Seat left.", "No Seats left."]);
  });

  it("tells an Instructor who enrolled on their course", () => {
    const notification: FeedNotification = {
      ...received,
      sender: ana,
      kind: "new_enrollment",
      data: {
        enrollmentId: 9,
        courseTitle: "Test Course",
        url: "/instructor/1/students",
      },
    };

    expect(describeNotification(notification)).toEqual({
      category: "enrollment",
      title: "Ana Buyer enrolled on Test Course",
      snippet: "A new Student on your course.",
    });
  });
});
