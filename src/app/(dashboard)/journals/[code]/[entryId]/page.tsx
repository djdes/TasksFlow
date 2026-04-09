import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, User, MapPin, Wrench, Clock, Wifi, CheckCircle2, XCircle } from "lucide-react";
import { requireAuth } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EntryApprovalActions } from "@/components/journals/entry-approval";
import { resolveJournalCodeAlias } from "@/lib/source-journal-map";

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "\u2014";
  if (typeof value === "boolean") return value ? "\u0414\u0430" : "\u041d\u0435\u0442";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    // Try to detect date strings
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      try {
        return new Date(value).toLocaleDateString("ru-RU");
      } catch {
        return value;
      }
    }
    return value;
  }
  return JSON.stringify(value);
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "draft":
      return <Badge variant="outline" className="text-sm">\u0427\u0435\u0440\u043d\u043e\u0432\u0438\u043a</Badge>;
    case "submitted":
      return <Badge variant="secondary" className="text-sm">\u041d\u0430 \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0435</Badge>;
    case "approved":
      return <Badge className="bg-green-600 text-sm">\u0423\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u043e</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

// Russian labels for known field keys
const FIELD_LABELS: Record<string, string> = {
  temperature: "\u0422\u0435\u043c\u043f\u0435\u0440\u0430\u0442\u0443\u0440\u0430 (\u00b0C)",
  humidity: "\u0412\u043b\u0430\u0436\u043d\u043e\u0441\u0442\u044c (%)",
  productName: "\u041d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435 \u043f\u0440\u043e\u0434\u0443\u043a\u0442\u0430",
  supplier: "\u041f\u043e\u0441\u0442\u0430\u0432\u0449\u0438\u043a",
  quantity: "\u041a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e",
  unit: "\u0415\u0434\u0438\u043d\u0438\u0446\u0430 \u0438\u0437\u043c\u0435\u0440\u0435\u043d\u0438\u044f",
  manufactureDate: "\u0414\u0430\u0442\u0430 \u0438\u0437\u0433\u043e\u0442\u043e\u0432\u043b\u0435\u043d\u0438\u044f",
  expiryDate: "\u0421\u0440\u043e\u043a \u0433\u043e\u0434\u043d\u043e\u0441\u0442\u0438",
  decision: "\u0420\u0435\u0448\u0435\u043d\u0438\u0435",
  temperatureOnArrival: "\u0422\u0435\u043c\u043f\u0435\u0440\u0430\u0442\u0443\u0440\u0430 \u043f\u0440\u0438 \u043f\u0440\u0438\u0451\u043c\u043a\u0435 (\u00b0C)",
  packagingCondition: "\u0421\u043e\u0441\u0442\u043e\u044f\u043d\u0438\u0435 \u0443\u043f\u0430\u043a\u043e\u0432\u043a\u0438",
  batchNumber: "\u041d\u043e\u043c\u0435\u0440 \u043f\u0430\u0440\u0442\u0438\u0438",
  appearance: "\u0412\u043d\u0435\u0448\u043d\u0438\u0439 \u0432\u0438\u0434",
  taste: "\u0412\u043a\u0443\u0441",
  smell: "\u0417\u0430\u043f\u0430\u0445",
  consistency: "\u041a\u043e\u043d\u0441\u0438\u0441\u0442\u0435\u043d\u0446\u0438\u044f",
  servingTemperature: "\u0422\u0435\u043c\u043f\u0435\u0440\u0430\u0442\u0443\u0440\u0430 \u043f\u043e\u0434\u0430\u0447\u0438 (\u00b0C)",
  employeeName: "\u0421\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a",
  noSkinDiseases: "\u041d\u0435\u0442 \u043a\u043e\u0436\u043d\u044b\u0445 \u0437\u0430\u0431\u043e\u043b\u0435\u0432\u0430\u043d\u0438\u0439",
  noRespiratorySymptoms: "\u041d\u0435\u0442 \u0441\u0438\u043c\u043f\u0442\u043e\u043c\u043e\u0432 \u041e\u0420\u0417",
  noGastrointestinalIssues: "\u041d\u0435\u0442 \u043a\u0438\u0448\u0435\u0447\u043d\u044b\u0445 \u0440\u0430\u0441\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432",
  cleanUniform: "\u0427\u0438\u0441\u0442\u0430\u044f \u0441\u043f\u0435\u0446\u043e\u0434\u0435\u0436\u0434\u0430",
  admittedToWork: "\u0414\u043e\u043f\u0443\u0449\u0435\u043d \u043a \u0440\u0430\u0431\u043e\u0442\u0435",
  ccpName: "\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u041a\u041a\u0422",
  parameter: "\u041a\u043e\u043d\u0442\u0440\u043e\u043b\u0438\u0440\u0443\u0435\u043c\u044b\u0439 \u043f\u0430\u0440\u0430\u043c\u0435\u0442\u0440",
  criticalLimit: "\u041a\u0440\u0438\u0442\u0438\u0447\u0435\u0441\u043a\u0438\u0439 \u043f\u0440\u0435\u0434\u0435\u043b",
  measuredValue: "\u0418\u0437\u043c\u0435\u0440\u0435\u043d\u043d\u043e\u0435 \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0435",
  withinLimits: "\u0412 \u043f\u0440\u0435\u0434\u0435\u043b\u0430\u0445 \u043d\u043e\u0440\u043c\u044b",
  correctiveAction: "\u041a\u043e\u0440\u0440\u0435\u043a\u0442\u0438\u0440\u0443\u044e\u0449\u0438\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044f",
  source: "\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a \u0434\u0430\u043d\u043d\u044b\u0445",
  reason: "\u041f\u0440\u0438\u0447\u0438\u043d\u0430 \u0441\u043f\u0438\u0441\u0430\u043d\u0438\u044f",
  disposalMethod: "\u0421\u043f\u043e\u0441\u043e\u0431 \u0443\u0442\u0438\u043b\u0438\u0437\u0430\u0446\u0438\u0438",
  targetTemp: "\u0426\u0435\u043b\u0435\u0432\u0430\u044f \u0442\u0435\u043c\u043f\u0435\u0440\u0430\u0442\u0443\u0440\u0430",
  actualTemp: "\u0424\u0430\u043a\u0442\u0438\u0447\u0435\u0441\u043a\u0430\u044f \u0442\u0435\u043c\u043f\u0435\u0440\u0430\u0442\u0443\u0440\u0430",
  coreTemp: "\u0422\u0435\u043c\u043f\u0435\u0440\u0430\u0442\u0443\u0440\u0430 \u0432 \u0442\u043e\u043b\u0449\u0435",
  duration: "\u0414\u043b\u0438\u0442\u0435\u043b\u044c\u043d\u043e\u0441\u0442\u044c (\u043c\u0438\u043d)",
  detergent: "\u041c\u043e\u044e\u0449\u0435\u0435 \u0441\u0440\u0435\u0434\u0441\u0442\u0432\u043e",
  concentration: "\u041a\u043e\u043d\u0446\u0435\u043d\u0442\u0440\u0430\u0446\u0438\u044f (%)",
  exposureTime: "\u0412\u0440\u0435\u043c\u044f \u0432\u043e\u0437\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044f (\u043c\u0438\u043d)",
  vehicleTemp: "\u0422\u0435\u043c\u043f\u0435\u0440\u0430\u0442\u0443\u0440\u0430 \u0442\u0440\u0430\u043d\u0441\u043f\u043e\u0440\u0442\u0430",
  vehicleCondition: "\u0421\u043e\u0441\u0442\u043e\u044f\u043d\u0438\u0435 \u0442\u0440\u0430\u043d\u0441\u043f\u043e\u0440\u0442\u0430",
  nextCalibrationDate: "\u0421\u043b\u0435\u0434\u0443\u044e\u0449\u0430\u044f \u043f\u043e\u0432\u0435\u0440\u043a\u0430",
  notes: "\u041f\u0440\u0438\u043c\u0435\u0447\u0430\u043d\u0438\u044f",
  ocrUsed: "OCR \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043d\u043e",
  ocrConfidence: "\u0422\u043e\u0447\u043d\u043e\u0441\u0442\u044c OCR",
  barcode: "\u0428\u0442\u0440\u0438\u0445-\u043a\u043e\u0434",
  storageTemp: "\u0422\u0435\u043c\u043f\u0435\u0440\u0430\u0442\u0443\u0440\u0430 \u0445\u0440\u0430\u043d\u0435\u043d\u0438\u044f",
  composition: "\u0421\u043e\u0441\u0442\u0430\u0432",
};

export default async function EntryDetailPage({
  params,
}: {
  params: Promise<{ code: string; entryId: string }>;
}) {
  const { code, entryId } = await params;
  const resolvedCode = resolveJournalCodeAlias(code);
  const session = await requireAuth();

  const entry = await db.journalEntry.findUnique({
    where: { id: entryId },
    include: {
      template: true,
      filledBy: { select: { name: true } },
      area: { select: { name: true } },
      equipment: { select: { name: true } },
    },
  });

  if (!entry || entry.organizationId !== session.user.organizationId) {
    notFound();
  }

  const data = (entry.data && typeof entry.data === "object" && !Array.isArray(entry.data))
    ? (entry.data as Record<string, unknown>)
    : {};

  const source = data.source as string | undefined;
  const isIoT = source === "tuya_auto" || source === "tuya_sensor";

  // Filter out internal fields
  const displayFields = Object.entries(data).filter(
    ([key]) => !["ocrUsed", "ocrConfidence", "source"].includes(key)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/journals/${resolvedCode}`}>
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{entry.template.name}</h1>
          <p className="text-sm text-muted-foreground">
            {"\u0417\u0430\u043f\u0438\u0441\u044c \u043e\u0442 "}{entry.createdAt.toLocaleString("ru-RU")}
          </p>
        </div>
        <StatusBadge status={entry.status} />
      </div>

      {/* Metadata */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-center gap-2 rounded-lg border p-3 text-sm">
          <User className="size-4 text-muted-foreground" />
          <div>
            <div className="text-xs text-muted-foreground">{"\u0417\u0430\u043f\u043e\u043b\u043d\u0438\u043b"}</div>
            <div className="font-medium">{entry.filledBy.name}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border p-3 text-sm">
          <Clock className="size-4 text-muted-foreground" />
          <div>
            <div className="text-xs text-muted-foreground">{"\u0414\u0430\u0442\u0430 \u0438 \u0432\u0440\u0435\u043c\u044f"}</div>
            <div className="font-medium">
              {entry.createdAt.toLocaleString("ru-RU", {
                day: "2-digit", month: "2-digit", year: "numeric",
                hour: "2-digit", minute: "2-digit",
              })}
            </div>
          </div>
        </div>
        {entry.area && (
          <div className="flex items-center gap-2 rounded-lg border p-3 text-sm">
            <MapPin className="size-4 text-muted-foreground" />
            <div>
              <div className="text-xs text-muted-foreground">{"\u0423\u0447\u0430\u0441\u0442\u043e\u043a"}</div>
              <div className="font-medium">{entry.area.name}</div>
            </div>
          </div>
        )}
        {entry.equipment && (
          <div className="flex items-center gap-2 rounded-lg border p-3 text-sm">
            <Wrench className="size-4 text-muted-foreground" />
            <div>
              <div className="text-xs text-muted-foreground">{"\u041e\u0431\u043e\u0440\u0443\u0434\u043e\u0432\u0430\u043d\u0438\u0435"}</div>
              <div className="font-medium">{entry.equipment.name}</div>
            </div>
          </div>
        )}
      </div>

      {/* Data source indicator */}
      {isIoT && (
        <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          <Wifi className="size-4" />
          <span>{"\u0414\u0430\u043d\u043d\u044b\u0435 \u043f\u043e\u043b\u0443\u0447\u0435\u043d\u044b \u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0447\u0435\u0441\u043a\u0438 \u0441 IoT-\u0434\u0430\u0442\u0447\u0438\u043a\u0430 ("}{source === "tuya_auto" ? "\u0430\u0432\u0442\u043e\u0441\u0431\u043e\u0440 \u043f\u043e \u0440\u0430\u0441\u043f\u0438\u0441\u0430\u043d\u0438\u044e" : "\u0440\u0443\u0447\u043d\u043e\u0439 \u0437\u0430\u043f\u0440\u043e\u0441"}{")"}</span>
        </div>
      )}

      {/* Entry data */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{"\u0414\u0430\u043d\u043d\u044b\u0435 \u0437\u0430\u043f\u0438\u0441\u0438"}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {displayFields.map(([key, value]) => (
              <div key={key} className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground mb-1">
                  {FIELD_LABELS[key] || key}
                </div>
                <div className="font-medium text-sm flex items-center gap-1.5">
                  {typeof value === "boolean" ? (
                    value ? (
                      <><CheckCircle2 className="size-4 text-green-600" /> {"\u0414\u0430"}</>
                    ) : (
                      <><XCircle className="size-4 text-red-500" /> {"\u041d\u0435\u0442"}</>
                    )
                  ) : (
                    formatValue(value)
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Approval actions */}
      <EntryApprovalActions
        entryId={entry.id}
        currentStatus={entry.status}
        userRole={session.user.role}
        journalCode={resolvedCode}
      />
    </div>
  );
}
