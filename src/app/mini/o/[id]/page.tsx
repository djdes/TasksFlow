import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { sanitizeMiniAppRedirectPath } from "@/lib/journal-obligation-links";
import {
  getJournalObligationById,
  markJournalObligationOpened,
} from "@/lib/journal-obligations";
import { getServerSession } from "@/lib/server-session";

export default async function MiniObligationRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/mini");
  }

  const obligation = await getJournalObligationById(id, session.user.id);
  if (!obligation) {
    notFound();
  }

  const targetPath = sanitizeMiniAppRedirectPath(obligation.targetPath);
  if (!targetPath) {
    notFound();
  }

  try {
    await markJournalObligationOpened(id, session.user.id);
  } catch (error) {
    console.error("Failed to mark journal obligation as opened", {
      id,
      userId: session.user.id,
      error,
    });
  }

  redirect(targetPath);
}
