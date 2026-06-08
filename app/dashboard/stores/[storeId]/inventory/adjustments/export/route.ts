import { requireAppUser } from "@/features/auth/app-user";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import type {
  InventoryAdjustment,
  InventoryAdjustmentReason,
  Product,
} from "@/features/commerce/types";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

type InventoryAdjustmentExportRow = {
  adjustment: InventoryAdjustment;
  product?: Product;
};

const adjustmentReasonLabels: Record<InventoryAdjustmentReason, string> = {
  restock: "Restock",
  correction: "Correction",
  damage: "Damage",
  return: "Return",
  manual_edit: "Product edit",
};

export async function GET(_request: Request, context: ExportRouteContext) {
  const { storeId } = await context.params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    return new Response("Store not found.", { status: 404 });
  }

  const productsById = new Map(
    workspace.products.map((product) => [product.id, product]),
  );
  const rows = [...workspace.inventoryAdjustments]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .map((adjustment) => ({
      adjustment,
      product: productsById.get(adjustment.productId),
    }));

  return csvResponse<InventoryAdjustmentExportRow>({
    filename: `${workspace.store.slug}-inventory-adjustments.csv`,
    rows,
    columns: [
      { header: "adjustment_id", value: (row) => row.adjustment.id },
      { header: "product_id", value: (row) => row.adjustment.productId },
      { header: "product_name", value: (row) => row.product?.name },
      { header: "variant_id", value: (row) => row.adjustment.productVariantId },
      {
        header: "reason",
        value: (row) => adjustmentReasonLabels[row.adjustment.reason],
      },
      { header: "delta", value: (row) => row.adjustment.delta },
      {
        header: "previous_inventory",
        value: (row) => row.adjustment.previousInventory,
      },
      { header: "next_inventory", value: (row) => row.adjustment.nextInventory },
      { header: "reference", value: (row) => row.adjustment.reference },
      { header: "note", value: (row) => row.adjustment.note },
      { header: "changed_by", value: (row) => row.adjustment.clerkUserId },
      {
        header: "created_at",
        value: (row) => new Date(row.adjustment.createdAt).toISOString(),
      },
    ],
  });
}
