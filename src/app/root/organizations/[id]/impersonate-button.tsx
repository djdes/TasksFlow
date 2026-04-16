"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { UserCog } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Props = { organizationId: string; organizationName: string };

/**
 * Starts a "view as" session. Writes actingAsOrganizationId into the JWT
 * via next-auth update(), then redirects to /dashboard so the user lands
 * in the customer's view immediately. Dashboard layout shows a persistent
 * banner with a "Stop" button (see impersonation-banner.tsx).
 */
export function ImpersonateButton({ organizationId, organizationName }: Props) {
  const router = useRouter();
  const { update } = useSession();
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      const res = await fetch("/api/root/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Не удалось начать impersonation");
      }
      // Forces NextAuth to re-issue the JWT with the new claim.
      await update({ actingAsOrganizationId: organizationId });
      toast.success(`Вы просматриваете: ${organizationName}`);
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось войти в организацию"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      onClick={start}
      disabled={busy}
      className="h-11 rounded-2xl bg-[#5566f6] px-4 text-[15px] text-white hover:bg-[#4959eb]"
    >
      <UserCog className="size-5" />
      Войти как {organizationName}
    </Button>
  );
}
