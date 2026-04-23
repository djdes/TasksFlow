import "dotenv/config";
import { db } from "@/lib/db";

(async () => {
  const entries = await db.journalDocumentEntry.findMany({
    where: {
      documentId: "cmo7760cx00198c9m02knrycb",
      employeeId: "cmnyodrhl0005ootsujeud3cc",
    },
    orderBy: { date: "desc" },
    take: 5,
  });
  console.log("hygiene entries for Gromov:", JSON.stringify(entries, null, 2));
  await db.$disconnect();
})();
