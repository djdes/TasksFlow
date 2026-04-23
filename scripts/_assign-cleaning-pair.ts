import "dotenv/config";
import { db } from "@/lib/db";
import { normalizeCleaningDocumentConfig } from "@/lib/cleaning-document";

const DOC_ID = "cmo704aoh00028c9muyy64mw2";
const TARGET_USER_ID = "cmnyodrhl0005ootsujeud3cc"; // Громов Илья Павлович (linked)

async function main() {
  const doc = await db.journalDocument.findUnique({ where: { id: DOC_ID } });
  if (!doc) throw new Error("doc not found");
  const config = normalizeCleaningDocumentConfig(doc.config) as any;
  if (!config.responsiblePairs?.length) throw new Error("no pairs");
  const target = await db.user.findUnique({ where: { id: TARGET_USER_ID } });
  if (!target) throw new Error("target user not found");
  config.responsiblePairs[0].cleaningUserId = TARGET_USER_ID;
  config.responsiblePairs[0].cleaningUserName = target.name;
  await db.journalDocument.update({
    where: { id: DOC_ID },
    data: { config },
  });
  console.log("[assign] pair updated → cleaningUserId =", TARGET_USER_ID);
  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
