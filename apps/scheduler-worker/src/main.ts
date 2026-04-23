import axios from "axios";
import cron from "node-cron";

const apiBaseUrl = process.env.CORE_API_URL ?? "http://localhost:3000/v1";

async function runSyncTick(): Promise<void> {
  try {
    await axios.get(`${apiBaseUrl}/admin/dashboard`, {
      headers: { "x-owner-admin-id": process.env.OWNER_ADMIN_ID ?? "" }
    });
    console.log("scheduler tick ok");
  } catch (error) {
    // Worker should stay alive in dev even if API/DB is temporarily unavailable.
    console.error("scheduler tick failed", error);
  }
}

cron.schedule("*/30 * * * * *", () => {
  void runSyncTick();
});

// Run one initial tick on startup.
void runSyncTick();
