import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Mercury FGIS API Stub
// This is a placeholder for future integration with the Federal State Information System
// for veterinary certificate tracking (ФГИС «Меркурий»)
// API docs: https://help.vetis.ru/wiki/Mercury_API

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  return NextResponse.json({
    status: "not_configured",
    message: "Интеграция с ФГИС «Меркурий» в разработке",
    requiredFields: {
      apiKey: "API-ключ ФГИС Меркурий",
      enterpriseGuid: "GUID предприятия в системе Ветис",
      issuerGuid: "GUID хозяйствующего субъекта",
    },
    availableEndpoints: [
      {
        name: "getVetDocumentList",
        description: "Получение списка ветеринарных сертификатов",
        status: "planned",
      },
      {
        name: "getVetDocumentByUuid",
        description: "Получение ВСД по UUID",
        status: "planned",
      },
      {
        name: "processIncomingConsignment",
        description: "Гашение входящей партии",
        status: "planned",
      },
      {
        name: "prepareOutgoingConsignment",
        description: "Оформление исходящей партии",
        status: "planned",
      },
    ],
  });
}
