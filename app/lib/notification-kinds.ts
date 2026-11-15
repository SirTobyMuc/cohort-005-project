import { z } from "zod";

// ─── Notification kinds ───
// What each Notification carries, as zod schemas so data coming back from the
// vendor can be checked, not cast. Shared by the server port
// (notifications.server.ts) and the Notification Feed (notification-feed.ts),
// so it holds no server-only code. See GLOSSARY.md and #46.

/**
 * What Discussion Notifications carry. `commentId` is the comment that caused
 * the Notification. `snippet` is its text as posted, so later edits change
 * nothing. `url` is the lesson, scrolled to the comment.
 */
const discussionDataSchema = z.object({
  commentId: z.number(),
  courseTitle: z.string(),
  lessonTitle: z.string(),
  snippet: z.string(),
  url: z.string(),
});

export type DiscussionNotificationData = z.infer<typeof discussionDataSchema>;

/**
 * One Notification and what its feed row needs. Cadence writes the row's text
 * from `data`; `url` is where clicking the row goes, or null for nowhere.
 */
export const notificationSchema = z.discriminatedUnion("kind", [
  // 8: to the buyer, confirming their Refund Request is under review.
  z.object({
    kind: z.literal("refund_request_confirmation"),
    data: z.object({
      refundRequestId: z.number(),
      courseTitle: z.string(),
      amount: z.number(),
      url: z.null(),
    }),
  }),
  // 3: to every Platform Admin, when a buyer raises a Refund Request.
  z.object({
    kind: z.literal("open_refund_request"),
    data: z.object({
      refundRequestId: z.number(),
      courseTitle: z.string(),
      amount: z.number(),
      reason: z.string(),
      url: z.string(),
    }),
  }),
  // 1: to the buyer, when a Platform Admin approves their Refund Request.
  z.object({
    kind: z.literal("refund_request_approved"),
    data: z.object({
      refundRequestId: z.number(),
      purchaseId: z.number(),
      purchasedAt: z.string(),
      courseTitle: z.string(),
      amount: z.number(),
      decisionNote: z.string().nullable(),
      url: z.null(),
    }),
  }),
  // 2: to the buyer, when a Platform Admin declines their Refund Request.
  // The row reminds them they can raise a new one.
  z.object({
    kind: z.literal("refund_request_declined"),
    data: z.object({
      refundRequestId: z.number(),
      purchaseId: z.number(),
      courseTitle: z.string(),
      amount: z.number(),
      decisionNote: z.string(),
      url: z.null(),
    }),
  }),
  // 4: to the Team Admin who owns the Team Licence, when a Student claims one
  // of its Seats. `seatsLeft` is its Unclaimed Seats after this claim.
  z.object({
    kind: z.literal("seat_claimed"),
    data: z.object({
      seatId: z.number(),
      courseTitle: z.string(),
      seatsLeft: z.number(),
      url: z.string(),
    }),
  }),
  // 5: to the course's Instructor, when a Student gets an Enrollment (from an
  // Individual Purchase or a Claimed Seat). Its category is off by default.
  z.object({
    kind: z.literal("new_enrollment"),
    data: z.object({
      enrollmentId: z.number(),
      courseTitle: z.string(),
      url: z.string(),
    }),
  }),
  // 6: to the course's Instructor, when someone else asks a Discussion
  // Question.
  z.object({
    kind: z.literal("discussion_question"),
    data: discussionDataSchema,
  }),
  // 7: to the question's author only, when someone else Replies to it.
  z.object({
    kind: z.literal("discussion_reply"),
    data: discussionDataSchema,
  }),
]);

export type Notification = z.infer<typeof notificationSchema>;

export type NotificationKind = Notification["kind"];
