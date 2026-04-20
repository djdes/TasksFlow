import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "@/lib/server-session";
import {
  getJournalObligationById,
  markJournalObligationOpened,
} from "@/lib/journal-obligations";

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

  await markJournalObligationOpened(id, session.user.id);
  redirect(obligation.targetPath);
}
