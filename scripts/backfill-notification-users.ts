// One-off backfill: syncs every existing user to Knock and writes the default
// Notification preferences for anyone who has none yet (see #51). Safe to
// re-run, because choices people already made are never overwritten.
// A no-op without KNOCK_SECRET_API_KEY.
//
//   npm run notifications:backfill-users
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../app/db/schema";
import {
  defaultNotifications,
  isKnockConfigured,
} from "../app/lib/notifications.server";
import { syncAllUsers } from "../app/lib/users.server";

async function backfill() {
  if (!isKnockConfigured()) {
    console.log("Nothing to backfill: no KNOCK_SECRET_API_KEY.");
    return;
  }
  const db = drizzle(new Database("data.db"), { schema });
  const synced = await syncAllUsers(db, defaultNotifications());
  console.log(`Synced ${synced} users to Knock.`);
}

backfill().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
