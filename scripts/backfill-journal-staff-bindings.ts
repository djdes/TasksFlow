import "dotenv/config";
import { Prisma } from "@prisma/client";
import dotenv from "dotenv";
import { db } from "@/lib/db";
import {
  normalizeJournalDocumentStaffState,
  normalizeJournalEntryStaffData,
  type StaffBindingUser,
} from "@/lib/journal-staff-binding";

dotenv.config({ path: ".env.local", override: false });
dotenv.config({ path: ".env", override: false });

function toPrismaJsonValue(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

function serialize(value: unknown) {
  return JSON.stringify(value ?? null);
}

async function main() {
  try {
    const documents = await db.journalDocument.findMany({
      select: {
        id: true,
        organizationId: true,
        responsibleUserId: true,
        responsibleTitle: true,
        config: true,
        template: {
          select: {
            code: true,
          },
        },
      },
      orderBy: [{ organizationId: "asc" }, { createdAt: "asc" }],
    });

    const usersByOrganization = new Map<string, StaffBindingUser[]>();
    let updatedDocuments = 0;
    let updatedEntries = 0;

    for (const document of documents) {
      let users = usersByOrganization.get(document.organizationId);
      if (!users) {
        users = await db.user.findMany({
          where: {
            organizationId: document.organizationId,
            isActive: true,
          },
          select: {
            id: true,
            name: true,
            role: true,
            positionTitle: true,
          },
          orderBy: [{ role: "asc" }, { name: "asc" }],
        });
        usersByOrganization.set(document.organizationId, users);
      }

      const normalizedDocument = normalizeJournalDocumentStaffState(
        document.template.code,
        {
          config: document.config,
          responsibleUserId: document.responsibleUserId,
          responsibleTitle: document.responsibleTitle,
        },
        users
      );

      const shouldUpdateDocument =
        serialize(document.config) !== serialize(normalizedDocument.config) ||
        (document.responsibleUserId || null) !== (normalizedDocument.responsibleUserId || null) ||
        (document.responsibleTitle || null) !== (normalizedDocument.responsibleTitle || null);

      if (shouldUpdateDocument) {
        await db.journalDocument.update({
          where: { id: document.id },
          data: {
            config: toPrismaJsonValue(normalizedDocument.config),
            responsibleUserId: normalizedDocument.responsibleUserId,
            responsibleTitle: normalizedDocument.responsibleTitle,
          },
        });
        updatedDocuments += 1;
      }

      const entries = await db.journalDocumentEntry.findMany({
        where: { documentId: document.id },
        select: {
          id: true,
          data: true,
        },
      });

      for (const entry of entries) {
        const normalizedEntryData = normalizeJournalEntryStaffData(entry.data, users);
        if (serialize(entry.data) === serialize(normalizedEntryData)) {
          continue;
        }

        await db.journalDocumentEntry.update({
          where: { id: entry.id },
          data: {
            data: toPrismaJsonValue(normalizedEntryData),
          },
        });
        updatedEntries += 1;
      }
    }

    console.log(
      JSON.stringify(
        {
          scannedDocuments: documents.length,
          updatedDocuments,
          updatedEntries,
        },
        null,
        2
      )
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
