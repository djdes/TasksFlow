import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { verifyEquipmentQrToken } from "@/lib/equipment-qr-token";
import { EquipmentFillClient } from "./equipment-fill-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public page opened when someone scans the QR sticker on a fridge /
 * chamber. No WeSetup session — auth is the HMAC `?token=…` from the
 * sticker.
 *
 * Worker picks their name once (cached in localStorage for next scan),
 * enters today's temperature, taps «Сохранить» — and today's
 * cold_equipment_control row is upserted under their name.
 */
export default async function EquipmentFillPage({
  params,
  searchParams,
}: {
  params: Promise<{ equipmentId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { equipmentId } = await params;
  const { token } = await searchParams;
  if (!token) notFound();

  const verify = verifyEquipmentQrToken(token);
  if (!verify.ok || verify.equipmentId !== equipmentId) {
    return (
      <main className="min-h-screen bg-[#fafbff] flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-3xl border border-[#ececf4] bg-white p-8 text-center shadow-[0_20px_60px_-30px_rgba(11,16,36,0.2)]">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-[#fff4f2] text-[#a13a32] text-2xl">
            !
          </div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[#0b1024]">
            Ссылка недействительна
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-[#6f7282]">
            {verify.ok === false && verify.reason === "expired"
              ? "Срок QR-наклейки истёк — попросите администратора распечатать новую."
              : "Наклейка повреждена или не подходит к этому оборудованию."}
          </p>
        </div>
      </main>
    );
  }

  const equipment = await db.equipment.findUnique({
    where: { id: equipmentId },
    select: {
      id: true,
      name: true,
      tempMin: true,
      tempMax: true,
      area: {
        select: {
          id: true,
          name: true,
          organizationId: true,
        },
      },
    },
  });
  if (!equipment) notFound();

  const organizationId = equipment.area.organizationId;

  // Employees who can be named as the reader.
  const employees = await db.user.findMany({
    where: { organizationId, isActive: true, archivedAt: null },
    select: { id: true, name: true, positionTitle: true },
    orderBy: { name: "asc" },
  });

  return (
    <EquipmentFillClient
      token={token}
      equipment={{
        id: equipment.id,
        name: equipment.name,
        tempMin: equipment.tempMin ?? null,
        tempMax: equipment.tempMax ?? null,
        areaName: equipment.area.name,
      }}
      employees={employees.map((e) => ({
        id: e.id,
        name: e.name,
        positionTitle: e.positionTitle ?? null,
      }))}
    />
  );
}
