import type { ProductStatus } from "@/features/commerce/types";
import { slugify, toPriceCents } from "@/lib/utils";

export type ProductImportVariant = {
  optionName: string;
  optionValue: string;
  sku: string | null;
  priceCents: number;
  compareAtCents: number | null;
  inventoryCount: number;
  status: "active" | "paused";
  sortOrder: number;
};

export type ProductImportProduct = {
  handle: string;
  title: string;
  slug: string;
  sku: string | null;
  category: string | null;
  description: string;
  priceCents: number;
  compareAtCents: number | null;
  inventoryCount: number;
  imageUrl: string | null;
  status: ProductStatus;
  variants: ProductImportVariant[];
};

export type ProductImportResult =
  | {
      errors: string[];
      products: [];
      status: "error";
    }
  | {
      errors: [];
      products: ProductImportProduct[];
      status: "success";
      variantCount: number;
    };

export const productImportRequiredHeaders = [
  "row_type",
  "handle",
  "title",
  "status",
  "sku",
  "category",
  "description",
  "price",
  "compare_at_price",
  "inventory",
  "image_url",
  "option_name",
  "option_value",
  "variant_sku",
  "variant_price",
  "variant_compare_at_price",
  "variant_inventory",
  "variant_status",
] as const;

type ProductDraft = Omit<ProductImportProduct, "variants"> & {
  variants: ProductImportVariant[];
};

function normalizeCell(value: string | undefined) {
  return value?.trim().replace(/\s+/g, " ") || "";
}

function parseCsvRows(csv: string) {
  const rows: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    const nextCharacter = csv[index + 1];

    if (character === '"' && inQuotes && nextCharacter === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      row.push(cell);
      rows.push(row);
      cell = "";
      row = [];
      continue;
    }

    cell += character;
  }

  row.push(cell);
  rows.push(row);

  return rows.filter((item) => item.some((value) => normalizeCell(value)));
}

function buildHeaderIndex(headers: string[]) {
  const headerIndex = new Map<string, number>();

  headers.forEach((header, index) => {
    headerIndex.set(normalizeCell(header).toLowerCase(), index);
  });

  return headerIndex;
}

function getCell(row: string[], headers: Map<string, number>, key: string) {
  const index = headers.get(key);

  return index === undefined ? "" : normalizeCell(row[index]);
}

function parseStatus(value: string, rowNumber: number): ProductStatus | string {
  const status = value.toLowerCase() || "draft";

  if (status === "draft" || status === "active" || status === "archived") {
    return status;
  }

  return `Row ${rowNumber} status must be draft, active, or archived.`;
}

function parseVariantStatus(value: string, rowNumber: number) {
  const status = value.toLowerCase() || "active";

  if (status === "active" || status === "paused") {
    return status;
  }

  return `Row ${rowNumber} variant status must be active or paused.`;
}

function parseInventory(value: string, rowNumber: number, label: string) {
  const inventory = Number(value || "0");

  if (!Number.isInteger(inventory) || inventory < 0) {
    return `Row ${rowNumber} ${label} must be a whole number of 0 or more.`;
  }

  return inventory;
}

function parseRequiredPrice(value: string, rowNumber: number, label: string) {
  if (!value) {
    return `Row ${rowNumber} ${label} must be a valid amount.`;
  }

  const priceCents = toPriceCents(value);

  if (priceCents === null || priceCents < 0) {
    return `Row ${rowNumber} ${label} must be a valid amount.`;
  }

  return priceCents;
}

function parseCompareAtPrice(
  value: string,
  priceCents: number,
  rowNumber: number,
  label: string,
) {
  if (!value) {
    return null;
  }

  const compareAtCents = toPriceCents(value);

  if (compareAtCents === null || compareAtCents <= priceCents) {
    return `Row ${rowNumber} ${label} must be higher than the sale price.`;
  }

  return compareAtCents;
}

export function parseProductImportCsv(csv: string): ProductImportResult {
  const rows = parseCsvRows(csv);
  const errors: string[] = [];

  if (rows.length <= 1) {
    return {
      errors: ["Add a CSV header row and at least one product row."],
      products: [],
      status: "error",
    };
  }

  if (rows.length > 501) {
    return {
      errors: ["Import at most 500 product and variant rows at a time."],
      products: [],
      status: "error",
    };
  }

  const headerIndex = buildHeaderIndex(rows[0] || []);
  const missingHeaders = productImportRequiredHeaders.filter(
    (header) => !headerIndex.has(header),
  );

  if (missingHeaders.length > 0) {
    return {
      errors: [`CSV is missing columns: ${missingHeaders.join(", ")}.`],
      products: [],
      status: "error",
    };
  }

  const productsByHandle = new Map<string, ProductDraft>();

  for (const [index, row] of rows.slice(1).entries()) {
    const rowNumber = index + 2;
    const rowType = getCell(row, headerIndex, "row_type").toLowerCase();
    const handle = slugify(getCell(row, headerIndex, "handle"));

    if (rowType === "note" || (!rowType && !handle)) {
      continue;
    }

    if (rowType !== "product" && rowType !== "variant") {
      errors.push(`Row ${rowNumber} row_type must be product or variant.`);
      continue;
    }

    if (!handle) {
      errors.push(`Row ${rowNumber} needs a handle.`);
      continue;
    }

    if (rowType === "product") {
      if (productsByHandle.has(handle)) {
        errors.push(`Row ${rowNumber} duplicates product handle ${handle}.`);
        continue;
      }

      const title = getCell(row, headerIndex, "title");
      const description = getCell(row, headerIndex, "description");
      const status = parseStatus(getCell(row, headerIndex, "status"), rowNumber);
      const priceCents = parseRequiredPrice(
        getCell(row, headerIndex, "price"),
        rowNumber,
        "price",
      );

      if (!title || title.length < 2) {
        errors.push(`Row ${rowNumber} needs a product title.`);
      }

      if (title.length > 120) {
        errors.push(`Row ${rowNumber} title must be under 120 characters.`);
      }

      if (description.length > 500) {
        errors.push(`Row ${rowNumber} description must be under 500 characters.`);
      }

      if (typeof status === "string" && !["draft", "active", "archived"].includes(status)) {
        errors.push(status);
      }

      if (typeof priceCents === "string") {
        errors.push(priceCents);
        continue;
      }

      const compareAtCents = parseCompareAtPrice(
        getCell(row, headerIndex, "compare_at_price"),
        priceCents,
        rowNumber,
        "compare-at price",
      );
      const inventoryCount = parseInventory(
        getCell(row, headerIndex, "inventory"),
        rowNumber,
        "inventory",
      );

      if (typeof compareAtCents === "string") {
        errors.push(compareAtCents);
      }

      if (typeof inventoryCount === "string") {
        errors.push(inventoryCount);
      }

      if (errors.length > 0) {
        continue;
      }

      productsByHandle.set(handle, {
        category: getCell(row, headerIndex, "category") || null,
        compareAtCents,
        description,
        handle,
        imageUrl: getCell(row, headerIndex, "image_url") || null,
        inventoryCount,
        priceCents,
        sku: getCell(row, headerIndex, "sku") || null,
        slug: handle,
        status: status as ProductStatus,
        title,
        variants: [],
      });
      continue;
    }

    const product = productsByHandle.get(handle);

    if (!product) {
      errors.push(`Row ${rowNumber} variant handle ${handle} needs a product row first.`);
      continue;
    }

    const optionName =
      getCell(row, headerIndex, "option_name") || product.variants[0]?.optionName || "Variant";
    const optionValue = getCell(row, headerIndex, "option_value");
    const priceValue = getCell(row, headerIndex, "variant_price");
    const priceCents = parseRequiredPrice(
      priceValue || String(product.priceCents / 100),
      rowNumber,
      "variant price",
    );
    const status = parseVariantStatus(
      getCell(row, headerIndex, "variant_status"),
      rowNumber,
    );

    if (!optionValue) {
      errors.push(`Row ${rowNumber} needs a variant option value.`);
    }

    if (optionName.length > 40) {
      errors.push(`Row ${rowNumber} option name must be under 40 characters.`);
    }

    if (typeof priceCents === "string") {
      errors.push(priceCents);
      continue;
    }

    const compareAtCents = parseCompareAtPrice(
      getCell(row, headerIndex, "variant_compare_at_price"),
      priceCents,
      rowNumber,
      "variant compare-at price",
    );
    const inventoryCount = parseInventory(
      getCell(row, headerIndex, "variant_inventory"),
      rowNumber,
      "variant inventory",
    );

    if (typeof compareAtCents === "string") {
      errors.push(compareAtCents);
    }

    if (typeof inventoryCount === "string") {
      errors.push(inventoryCount);
    }

    if (typeof status === "string" && status !== "active" && status !== "paused") {
      errors.push(status);
    }

    const optionKey = `${optionName.toLowerCase()}:${optionValue.toLowerCase()}`;

    if (
      product.variants.some(
        (variant) =>
          `${variant.optionName.toLowerCase()}:${variant.optionValue.toLowerCase()}` ===
          optionKey,
      )
    ) {
      errors.push(`Row ${rowNumber} duplicates variant ${optionValue}.`);
    }

    if (errors.length > 0) {
      continue;
    }

    product.variants.push({
      compareAtCents,
      inventoryCount,
      optionName,
      optionValue,
      priceCents,
      sku: getCell(row, headerIndex, "variant_sku") || null,
      sortOrder: product.variants.length,
      status: status as "active" | "paused",
    });
  }

  const products = [...productsByHandle.values()];

  if (products.length === 0 && errors.length === 0) {
    errors.push("Add at least one product row before importing.");
  }

  if (errors.length > 0) {
    return {
      errors: errors.slice(0, 12),
      products: [],
      status: "error",
    };
  }

  return {
    errors: [],
    products,
    status: "success",
    variantCount: products.reduce((sum, product) => sum + product.variants.length, 0),
  };
}
