import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/integration-crypto";
import { mintTaskFillToken } from "@/lib/task-fill-token";

async function main() {
  const userEmail = "ivan.\u0442\u0435\u0441\u0442\u043e\u0432\u044b\u0439@cmo8t1b1.local";
  // ^ Иван Тестовый — его email я сделал автоматом в сидинге
  // lets just grab a hygiene task for Иван, by template code + rowKey
  const ivan = await db.user.findFirst({
    where: { phone: "+79990003001" },
    select: { id: true, organizationId: true },
  });
  if (!ivan) {
    console.error("Иван not found");
    process.exit(1);
  }
  const rowKey = `employee-${ivan.id}`;
  const link = await db.tasksFlowTaskLink.findFirst({
    where: { rowKey, journalCode: "fryer_oil" },
    include: { integration: true },
  });
  if (!link) {
    console.error("no fryer_oil task for Ivan");
    process.exit(1);
  }
  const token = mintTaskFillToken(
    link.tasksflowTaskId,
    link.integration.webhookSecret
  );
  const url = `http://localhost:3000/task-fill/${link.tasksflowTaskId}?token=${encodeURIComponent(token)}`;
  console.log(url);
  await db.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
