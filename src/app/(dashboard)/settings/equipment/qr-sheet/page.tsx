import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { requireAuth, getActiveOrgId } from "@/lib/auth-helpers";
import { hasFullWorkspaceAccess } from "@/lib/role-access";
import { db } from "@/lib/db";
import { mintEquipmentQrToken } from "@/lib/equipment-qr-token";
import { QrSheetClient } from "./qr-sheet-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Printable A4-ready sheet of QR codes — one per equipment. Manager
 * opens this page, hits Ctrl+P, paper stickers go on each fridge.
 *
 * Uses the server's `QRCode.toString(..., 'svg')` at build time so the
 * print layout is pixel-perfect and doesn't rely on the browser's JS
 * renderer. No client-side QR generation — keeps mobile print views
 * identical to desktop.
 */
export default async function EquipmentQrSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ origin?: string }>;
}) {
  const session = await requireAuth();
  if (!hasFullWorkspaceAccess(session.user)) {
    redirect("/settings");
  }
  const organizationId = getActiveOrgId(session);
  const { origin: overrideOrigin } = await searchParams;

  const equipmentList = await db.equipment.findMany({
    where: { area: { organizationId } },
    orderBy: [{ area: { name: "asc" } }, { name: "asc" }],
    include: {
      area: { select: { name: true } },
    },
  });

  const origin =
    overrideOrigin ||
    process.env.NEXTAUTH_URL ||
    process.env.PUBLIC_URL ||
    "https://wesetup.ru";

  const items = await Promise.all(
    equipmentList.map(async (equip) => {
      const token = mintEquipmentQrToken(equip.id);
      const url = `${origin.replace(/\/+$/, "")}/equipment-fill/${equip.id}?token=${encodeURIComponent(token)}`;
      const svg = await QRCode.toString(url, {
        type: "svg",
        errorCorrectionLevel: "M",
        margin: 1,
        width: 220,
      });
      return {
        id: equip.id,
        name: equip.name,
        areaName: equip.area.name,
        tempMin: equip.tempMin ?? null,
        tempMax: equip.tempMax ?? null,
        url,
        svg,
      };
    })
  );

  return <QrSheetClient items={items} origin={origin} />;
}
