import { requireAppUser } from "@/features/auth/app-user";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

type ProductImportTemplateRow = {
  rowType: "product" | "variant" | "note";
  handle: string;
  title: string;
  status: string;
  sku: string;
  category: string;
  description: string;
  price: string;
  compareAtPrice: string;
  inventory: string;
  imageUrl: string;
  optionName: string;
  optionValue: string;
  variantSku: string;
  variantPrice: string;
  variantCompareAtPrice: string;
  variantInventory: string;
  variantStatus: string;
  instructions: string;
};

const rows: ProductImportTemplateRow[] = [
  {
    rowType: "product",
    handle: "field-carry-pack",
    title: "Field Carry Pack",
    status: "draft",
    sku: "NLS-BAG-001",
    category: "Bags",
    description:
      "Weather-resistant day pack with a structured laptop sleeve and clean travel pockets.",
    price: "129.00",
    compareAtPrice: "159.00",
    inventory: "24",
    imageUrl: "https://example.com/products/field-carry-pack.jpg",
    optionName: "Color",
    optionValue: "",
    variantSku: "",
    variantPrice: "",
    variantCompareAtPrice: "",
    variantInventory: "",
    variantStatus: "",
    instructions:
      "Use one product row per handle. Status can be draft, active, or archived.",
  },
  {
    rowType: "variant",
    handle: "field-carry-pack",
    title: "",
    status: "",
    sku: "",
    category: "",
    description: "",
    price: "",
    compareAtPrice: "",
    inventory: "",
    imageUrl: "",
    optionName: "Color",
    optionValue: "Forest",
    variantSku: "NLS-BAG-001-FOR",
    variantPrice: "129.00",
    variantCompareAtPrice: "159.00",
    variantInventory: "14",
    variantStatus: "active",
    instructions:
      "Use variant rows after a product row. Variant status can be active or paused.",
  },
  {
    rowType: "variant",
    handle: "field-carry-pack",
    title: "",
    status: "",
    sku: "",
    category: "",
    description: "",
    price: "",
    compareAtPrice: "",
    inventory: "",
    imageUrl: "",
    optionName: "Color",
    optionValue: "Clay",
    variantSku: "NLS-BAG-001-CLA",
    variantPrice: "139.00",
    variantCompareAtPrice: "169.00",
    variantInventory: "18",
    variantStatus: "active",
    instructions:
      "Rows with the same handle are grouped into one product during import review.",
  },
  {
    rowType: "note",
    handle: "",
    title: "",
    status: "",
    sku: "",
    category: "",
    description: "",
    price: "",
    compareAtPrice: "",
    inventory: "",
    imageUrl: "",
    optionName: "",
    optionValue: "",
    variantSku: "",
    variantPrice: "",
    variantCompareAtPrice: "",
    variantInventory: "",
    variantStatus: "",
    instructions:
      "Delete note rows before uploading. Keep prices as decimals and inventory as whole numbers.",
  },
];

export async function GET(_request: Request, context: ExportRouteContext) {
  const { storeId } = await context.params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    return new Response("Store not found.", { status: 404 });
  }

  return csvResponse<ProductImportTemplateRow>({
    filename: `${workspace.store.slug}-product-import-template.csv`,
    rows,
    columns: [
      { header: "row_type", value: (row) => row.rowType },
      { header: "handle", value: (row) => row.handle },
      { header: "title", value: (row) => row.title },
      { header: "status", value: (row) => row.status },
      { header: "sku", value: (row) => row.sku },
      { header: "category", value: (row) => row.category },
      { header: "description", value: (row) => row.description },
      { header: "price", value: (row) => row.price },
      { header: "compare_at_price", value: (row) => row.compareAtPrice },
      { header: "inventory", value: (row) => row.inventory },
      { header: "image_url", value: (row) => row.imageUrl },
      { header: "option_name", value: (row) => row.optionName },
      { header: "option_value", value: (row) => row.optionValue },
      { header: "variant_sku", value: (row) => row.variantSku },
      { header: "variant_price", value: (row) => row.variantPrice },
      { header: "variant_compare_at_price", value: (row) => row.variantCompareAtPrice },
      { header: "variant_inventory", value: (row) => row.variantInventory },
      { header: "variant_status", value: (row) => row.variantStatus },
      { header: "instructions", value: (row) => row.instructions },
    ],
  });
}
