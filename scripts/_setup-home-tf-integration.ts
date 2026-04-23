import crypto from "node:crypto";
import { db } from "@/lib/db";
import { encryptSecret } from "@/lib/integration-crypto";

const HOME_ORG_ID = "cmmbrt40y0000rotsr41p4xh6"; // «Домашняя кухня»
const NEW_BASE_URL = "http://127.0.0.1:5001";
const NEW_RAW_KEY = "tfk_mJ8-IIptUJ_ZQ3uoYkGT1qXRCYE4sCaP";
const TF_COMPANY_ID = 3;

async function main() {
  const encrypted = encryptSecret(NEW_RAW_KEY);
  const prefix = NEW_RAW_KEY.slice(0, 12);
  const webhookSecret = crypto.randomBytes(32).toString("base64url");

  const existing = await db.tasksFlowIntegration.findUnique({
    where: { organizationId: HOME_ORG_ID },
    select: { id: true },
  });

  if (existing) {
    const u = await db.tasksFlowIntegration.update({
      where: { organizationId: HOME_ORG_ID },
      data: {
        baseUrl: NEW_BASE_URL,
        apiKeyEncrypted: encrypted,
        apiKeyPrefix: prefix,
        tasksflowCompanyId: TF_COMPANY_ID,
        enabled: true,
      },
      select: { id: true, baseUrl: true, apiKeyPrefix: true },
    });
    console.log("Updated:", u);
  } else {
    const c = await db.tasksFlowIntegration.create({
      data: {
        organizationId: HOME_ORG_ID,
        baseUrl: NEW_BASE_URL,
        apiKeyEncrypted: encrypted,
        apiKeyPrefix: prefix,
        tasksflowCompanyId: TF_COMPANY_ID,
        webhookSecret,
        enabled: true,
      },
      select: { id: true, baseUrl: true, apiKeyPrefix: true },
    });
    console.log("Created:", c);
  }

  await db.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
