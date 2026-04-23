import { db } from "@/lib/db";
import { encryptSecret } from "@/lib/integration-crypto";

const ORG_ID = "demo-screenshots";
const NEW_BASE_URL = "http://127.0.0.1:5001";
const NEW_RAW_KEY = "tfk_fhPr1Ff-ZVSjq19CHQJwwFRCirehyoB9";

async function main() {
  const encrypted = encryptSecret(NEW_RAW_KEY);
  const prefix = NEW_RAW_KEY.slice(0, 12);

  const before = await db.tasksFlowIntegration.findUnique({
    where: { organizationId: ORG_ID },
    select: { baseUrl: true, apiKeyPrefix: true },
  });
  console.log("Before:", before);

  const updated = await db.tasksFlowIntegration.update({
    where: { organizationId: ORG_ID },
    data: {
      baseUrl: NEW_BASE_URL,
      apiKeyEncrypted: encrypted,
      apiKeyPrefix: prefix,
      tasksflowCompanyId: 2,
      enabled: true,
    },
    select: { baseUrl: true, apiKeyPrefix: true, tasksflowCompanyId: true },
  });
  console.log("After:", updated);

  await db.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
