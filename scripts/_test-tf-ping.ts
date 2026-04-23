import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/integration-crypto";

async function main() {
  const integrations = await db.tasksFlowIntegration.findMany({
    select: { id: true, organizationId: true, baseUrl: true, apiKeyEncrypted: true },
  });
  for (const i of integrations) {
    const org = await db.organization.findUnique({
      where: { id: i.organizationId },
      select: { name: true },
    });
    let key = "";
    try {
      key = decryptSecret(i.apiKeyEncrypted);
    } catch {
      console.log(`  ! "${org?.name}" — не удаётся расшифровать ключ`);
      continue;
    }
    const url = `${i.baseUrl.replace(/\/+$/, "")}/api/users`;
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${key}` },
      });
      const text = await response.text();
      console.log(
        `  "${org?.name}"  ${url}  ->  ${response.status}  body=${text.slice(0, 120)}`
      );
    } catch (err) {
      console.log(
        `  "${org?.name}"  ${url}  FETCH-FAIL: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  await db.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
