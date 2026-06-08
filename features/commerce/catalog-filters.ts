export const catalogAvailabilityOptions = ["all", "available", "sold-out"] as const;
export const catalogSortOptions = [
  "featured",
  "newest",
  "price-asc",
  "price-desc",
  "name-asc",
] as const;

export type StorefrontCatalogAvailability =
  (typeof catalogAvailabilityOptions)[number];
export type StorefrontCatalogSort = (typeof catalogSortOptions)[number];

export type StorefrontCatalogFilters = {
  query: string;
  category: string;
  availability: StorefrontCatalogAvailability;
  minPrice: string;
  maxPrice: string;
  saleOnly: boolean;
  sort: StorefrontCatalogSort;
};

export const defaultStorefrontCatalogFilters: StorefrontCatalogFilters = {
  query: "",
  category: "all",
  availability: "all",
  minPrice: "",
  maxPrice: "",
  saleOnly: false,
  sort: "featured",
};

function readFirstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function sanitizeSearchParam(value: string | string[] | undefined, maxLength: number) {
  return (readFirstSearchParam(value) || "").trim().slice(0, maxLength);
}

function sanitizePriceSearchParam(value: string | string[] | undefined) {
  const rawValue = sanitizeSearchParam(value, 16);

  if (!rawValue) {
    return "";
  }

  const amount = Number(rawValue);

  if (!Number.isFinite(amount) || amount < 0) {
    return "";
  }

  return rawValue;
}

function isEnabledSearchParam(value: string | string[] | undefined) {
  const normalizedValue = sanitizeSearchParam(value, 16).toLowerCase();

  return ["1", "true", "yes", "on"].includes(normalizedValue);
}

export function parseStorefrontFilterPriceCents(value: string) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  return Math.round(amount * 100);
}

function isCatalogAvailability(
  value: string,
): value is StorefrontCatalogAvailability {
  return catalogAvailabilityOptions.includes(
    value as StorefrontCatalogAvailability,
  );
}

function isCatalogSort(value: string): value is StorefrontCatalogSort {
  return catalogSortOptions.includes(value as StorefrontCatalogSort);
}

export function parseStorefrontCatalogFilters(
  searchParams?: Record<string, string | string[] | undefined>,
): StorefrontCatalogFilters {
  const availability = sanitizeSearchParam(searchParams?.availability, 32);
  const sort = sanitizeSearchParam(searchParams?.sort, 32);

  return {
    query: sanitizeSearchParam(searchParams?.q, 80),
    category: sanitizeSearchParam(searchParams?.category, 80) || "all",
    availability: isCatalogAvailability(availability)
      ? availability
      : defaultStorefrontCatalogFilters.availability,
    minPrice: sanitizePriceSearchParam(searchParams?.minPrice),
    maxPrice: sanitizePriceSearchParam(searchParams?.maxPrice),
    saleOnly: isEnabledSearchParam(searchParams?.sale),
    sort: isCatalogSort(sort) ? sort : defaultStorefrontCatalogFilters.sort,
  };
}

export function hasActiveStorefrontCatalogFilters(
  filters: StorefrontCatalogFilters,
) {
  return (
    Boolean(filters.query.trim()) ||
    filters.category !== defaultStorefrontCatalogFilters.category ||
    filters.availability !== defaultStorefrontCatalogFilters.availability ||
    Boolean(filters.minPrice.trim()) ||
    Boolean(filters.maxPrice.trim()) ||
    filters.saleOnly !== defaultStorefrontCatalogFilters.saleOnly ||
    filters.sort !== defaultStorefrontCatalogFilters.sort
  );
}

export function serializeStorefrontCatalogFilters(
  filters: StorefrontCatalogFilters,
) {
  const params = new URLSearchParams();
  const query = filters.query.trim();

  if (query) {
    params.set("q", query);
  }

  if (filters.category !== defaultStorefrontCatalogFilters.category) {
    params.set("category", filters.category);
  }

  if (filters.availability !== defaultStorefrontCatalogFilters.availability) {
    params.set("availability", filters.availability);
  }

  if (filters.minPrice.trim()) {
    params.set("minPrice", filters.minPrice.trim());
  }

  if (filters.maxPrice.trim()) {
    params.set("maxPrice", filters.maxPrice.trim());
  }

  if (filters.saleOnly) {
    params.set("sale", "true");
  }

  if (filters.sort !== defaultStorefrontCatalogFilters.sort) {
    params.set("sort", filters.sort);
  }

  return params.toString();
}
