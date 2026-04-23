import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/integration-crypto";

async function main() {
  const i = await db.tasksFlowIntegration.findFirst({
    where: { organizationId: "demo-screenshots" },
  });
  if (!i) {
    console.log("no integration");
    return;
  }
  const key = decryptSecret(i.apiKeyEncrypted);
  const url = i.baseUrl.replace(/\/+$/, "") + "/api/users";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ phone: "+79990002099", name: "DEBUG TEST" }),
  });
  const body = await res.text();
  console.log(`POST ${url}  →  ${res.status}`);
  console.log(`Body: ${body.slice(0, 500)}`);
  await db.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
