import type { Product, ProductVariant } from "@/features/commerce/types";

export const restockAlertTags = ["lead", "restock-alert"] as const;

export function normalizeRestockAlertText(value: string | undefined | null) {
  return value?.trim().replace(/\s+/g, " ") || "";
}

export function mergeRestockAlertTags(existingTags: string[] = []) {
  const tags = new Set(
    existingTags
      .map((tag) => normalizeRestockAlertText(tag).toLowerCase())
      .filter(Boolean),
  );

  for (const tag of restockAlertTags) {
    tags.add(tag);
  }

  return [...tags].sort((a, b) => a.localeCompare(b));
}

export function createRestockAlertNote(input: {
  existingNote?: string | null;
  product: Pick<Product, "name" | "sku">;
  variant?: Pick<ProductVariant, "optionValue" | "sku"> | null;
}) {
  const existingNote = normalizeRestockAlertText(input.existingNote);

  if (existingNote) {
    return existingNote;
  }

  const variantLabel = input.variant?.optionValue
    ? ` (${input.variant.optionValue})`
    : "";
  const sku = input.variant?.sku || input.product.sku;

  return [
    `Restock alert requested for ${input.product.name}${variantLabel}.`,
    sku ? `SKU ${sku}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
