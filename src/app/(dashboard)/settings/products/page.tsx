import { Package } from "lucide-react";
import { requireAuth } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProductImportDialog } from "@/components/settings/product-import-dialog";
import { ProductDialog } from "@/components/settings/product-dialog";
import { DeleteProductButton } from "@/components/settings/delete-product-button";

const unitLabels: Record<string, string> = {
  kg: "кг",
  l: "л",
  pcs: "шт",
  g: "г",
  ml: "мл",
  pack: "уп",
};

export default async function ProductsSettingsPage() {
  const session = await requireAuth();
  const canManage =
    session.user.role === "owner" || session.user.role === "technologist";

  const products = await db.product.findMany({
    where: {
      organizationId: session.user.organizationId,
      isActive: true,
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Справочник продуктов</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Импортируйте из Excel, iiko или 1С для быстрого заполнения журналов
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <ProductDialog />
            <ProductImportDialog />
          </div>
        )}
      </div>

      {products.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <Package className="size-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">Продуктов пока нет</h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-md">
            Импортируйте справочник из Excel-файла (поддерживаются форматы
            экспорта из iiko и 1С) или добавьте продукты вручную через журнал
            входного контроля.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Наименование</TableHead>
                <TableHead>Поставщик</TableHead>
                <TableHead>Штрих-код</TableHead>
                <TableHead>Ед.</TableHead>
                <TableHead>Категория</TableHead>
                <TableHead>Хранение</TableHead>
                <TableHead>Срок (дн.)</TableHead>
                {canManage && <TableHead className="w-[100px]">Действия</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell>{product.supplier ?? "—"}</TableCell>
                  <TableCell>
                    {product.barcode ? (
                      <Badge variant="outline" className="font-mono text-xs">
                        {product.barcode}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {unitLabels[product.unit] || product.unit}
                  </TableCell>
                  <TableCell>{product.category ?? "—"}</TableCell>
                  <TableCell>{product.storageTemp ?? "—"}</TableCell>
                  <TableCell>{product.shelfLifeDays ?? "—"}</TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex gap-1">
                        <ProductDialog product={{
                          id: product.id,
                          name: product.name,
                          supplier: product.supplier,
                          barcode: product.barcode,
                          unit: product.unit,
                          category: product.category,
                          storageTemp: product.storageTemp,
                          shelfLifeDays: product.shelfLifeDays,
                        }} />
                        {session.user.role === "owner" && (
                          <DeleteProductButton productId={product.id} />
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="rounded-lg border bg-muted/50 p-4 text-sm text-muted-foreground">
        <p className="font-medium mb-2">Поддерживаемые форматы импорта:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Excel (.xlsx, .xls)</strong> — столбцы: Наименование,
            Поставщик, Штрих-код, Единица, Категория
          </li>
          <li>
            <strong>iiko</strong> — экспорт номенклатуры (Товар, Контрагент,
            Ед.изм., Штрихкод)
          </li>
          <li>
            <strong>1С</strong> — выгрузка справочника Номенклатура (Номенклатура,
            Контрагент, Единица измерения)
          </li>
          <li>
            <strong>CSV</strong> — с разделителем ; или , (первая строка —
            заголовки)
          </li>
        </ul>
      </div>
    </div>
  );
}
