import Link from "next/link";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function JournalsPage() {
  const templates = await db.journalTemplate.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Журналы</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <Link key={template.id} href={`/journals/${template.code}`}>
            <Card className="transition-shadow hover:shadow-md cursor-pointer h-full">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{template.name}</CardTitle>
                  <div className="flex gap-1 shrink-0">
                    {template.isMandatorySanpin && (
                      <Badge
                        variant="destructive"
                        className="text-[10px] px-1.5 py-0 h-5 shrink-0"
                      >
                        <ShieldCheck className="size-3 mr-0.5" />
                        СанПиН
                      </Badge>
                    )}
                    {template.isMandatoryHaccp && (
                      <Badge
                        variant="default"
                        className="text-[10px] px-1.5 py-0 h-5 shrink-0"
                      >
                        <ShieldAlert className="size-3 mr-0.5" />
                        ХАССП
                      </Badge>
                    )}
                  </div>
                </div>
                {template.description && (
                  <CardDescription>{template.description}</CardDescription>
                )}
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
