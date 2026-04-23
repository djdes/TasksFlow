import "dotenv/config";
import { db } from "@/lib/db";
(async () => {
  const links = await db.tasksFlowTaskLink.findMany({
    select: {
      tasksflowTaskId: true,
      rowKey: true,
      remoteStatus: true,
      journalCode: true,
      journalDocumentId: true,
    },
  });
  console.log("links:", JSON.stringify(links, null, 2));
  await db.$disconnect();
})();
