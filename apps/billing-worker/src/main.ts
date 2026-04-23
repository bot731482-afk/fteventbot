import axios from "axios";
import cron from "node-cron";

const cryptoBaseUrl = process.env.CRYPTOBOT_BASE_URL ?? "https://pay.crypt.bot/api";
const apiBaseUrl = process.env.CORE_API_URL ?? "http://localhost:3000/v1";

async function reconcileInvoices(): Promise<void> {
  await axios.get(`${cryptoBaseUrl}/getInvoices`, {
    headers: { "Crypto-Pay-API-Token": process.env.CRYPTOBOT_API_TOKEN ?? "" }
  });
  await axios.get(`${apiBaseUrl}/admin/dashboard`, {
    headers: { "x-owner-admin-id": process.env.OWNER_ADMIN_ID ?? "" }
  });
}

cron.schedule("*/20 * * * * *", () => {
  void reconcileInvoices();
});
