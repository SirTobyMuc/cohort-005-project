import { and, eq } from "drizzle-orm";
import crypto from "crypto";
import {
  coupons,
  purchases,
  teamMembers,
  teams,
  TeamMemberRole,
} from "~/db/schema";
import type { Db } from "~/lib/refunds.server";

// ─── Purchases ───
// Recording a Purchase. An Individual Purchase is followed by `enrollUser`
// (see enrollments.server.ts); a Team Licence grants Seats and no Enrollment.

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Queryable = Db | Tx;

type Purchase = typeof purchases.$inferSelect;
type Team = typeof teams.$inferSelect;
type Seat = typeof coupons.$inferSelect;

export function createPurchase(
  db: Queryable,
  userId: number,
  courseId: number,
  amountPaid: number,
  country: string | null,
  now: Date
): Purchase {
  return db
    .insert(purchases)
    .values({
      userId,
      courseId,
      amountPaid,
      country,
      createdAt: now.toISOString(),
    })
    .returning()
    .get();
}

function getTeamForAdmin(db: Queryable, userId: number): Team | undefined {
  const membership = db
    .select()
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.userId, userId),
        eq(teamMembers.role, TeamMemberRole.Admin)
      )
    )
    .get();

  if (!membership) return undefined;

  return db.select().from(teams).where(eq(teams.id, membership.teamId)).get();
}

function getOrCreateTeamForUser(
  db: Queryable,
  userId: number,
  now: Date
): Team {
  const existingTeam = getTeamForAdmin(db, userId);
  if (existingTeam) return existingTeam;

  const team = db
    .insert(teams)
    .values({ createdAt: now.toISOString() })
    .returning()
    .get();
  db.insert(teamMembers)
    .values({
      teamId: team.id,
      userId,
      role: TeamMemberRole.Admin,
      createdAt: now.toISOString(),
    })
    .run();
  return team;
}

function generateSeats(
  db: Queryable,
  teamId: number,
  courseId: number,
  purchaseId: number,
  quantity: number,
  now: Date
): Seat[] {
  const created: Seat[] = [];
  for (let i = 0; i < quantity; i++) {
    created.push(
      db
        .insert(coupons)
        .values({
          teamId,
          courseId,
          code: crypto.randomBytes(12).toString("base64url"),
          purchaseId,
          createdAt: now.toISOString(),
        })
        .returning()
        .get()
    );
  }
  return created;
}

/**
 * A Team Admin buys a Team Licence: the Purchase, their team (created on the
 * first one) and `quantity` Unclaimed Seats. The buyer gets no Enrollment.
 */
export function buyTeamLicence(
  db: Queryable,
  userId: number,
  courseId: number,
  amountPaid: number,
  country: string | null,
  quantity: number,
  now: Date
): { purchase: Purchase; team: Team; seats: Seat[] } {
  const purchase = createPurchase(
    db,
    userId,
    courseId,
    amountPaid,
    country,
    now
  );
  const team = getOrCreateTeamForUser(db, userId, now);
  const seats = generateSeats(
    db,
    team.id,
    courseId,
    purchase.id,
    quantity,
    now
  );
  return { purchase, team, seats };
}
