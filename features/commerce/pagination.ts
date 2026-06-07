export type DashboardSearchParams = Record<
  string,
  string | string[] | undefined
>;

export const dashboardPageSizeOptions = [10, 25, 50] as const;
export const defaultDashboardPageSize = 10;

export type DashboardPageSize = (typeof dashboardPageSizeOptions)[number];

export type PaginationResult<T> = {
  items: T[];
  page: number;
  pageSize: DashboardPageSize;
  totalItems: number;
  totalPages: number;
  startItem: number;
  endItem: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

function readFirstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseDashboardPage(value: string | string[] | undefined) {
  const parsed = Number.parseInt(readFirstParam(value) || "", 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
}

export function parseDashboardPageSize(
  value: string | string[] | undefined,
): DashboardPageSize {
  const parsed = Number.parseInt(readFirstParam(value) || "", 10);

  if (dashboardPageSizeOptions.includes(parsed as DashboardPageSize)) {
    return parsed as DashboardPageSize;
  }

  return defaultDashboardPageSize;
}

export function paginateItems<T>(input: {
  items: T[];
  page: number;
  pageSize: DashboardPageSize;
}): PaginationResult<T> {
  const totalItems = input.items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / input.pageSize));
  const page = Math.min(Math.max(1, input.page), totalPages);
  const startIndex = (page - 1) * input.pageSize;
  const endIndex = startIndex + input.pageSize;
  const items = input.items.slice(startIndex, endIndex);

  return {
    items,
    page,
    pageSize: input.pageSize,
    totalItems,
    totalPages,
    startItem: totalItems === 0 ? 0 : startIndex + 1,
    endItem: Math.min(totalItems, endIndex),
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
  };
}

export function buildDashboardPageHref(input: {
  basePath: string;
  params: DashboardSearchParams;
  page: number;
  pageSize: DashboardPageSize;
}) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(input.params)) {
    if (key === "page" || key === "pageSize" || value === undefined) {
      continue;
    }

    const values = Array.isArray(value) ? value : [value];

    for (const item of values) {
      if (item) {
        searchParams.append(key, item);
      }
    }
  }

  if (input.page > 1) {
    searchParams.set("page", String(input.page));
  }

  if (input.pageSize !== defaultDashboardPageSize) {
    searchParams.set("pageSize", String(input.pageSize));
  }

  const query = searchParams.toString();

  return query ? `${input.basePath}?${query}` : input.basePath;
}

export function buildDashboardExportHref(input: {
  basePath: string;
  params: DashboardSearchParams;
}) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(input.params)) {
    if (key === "page" || key === "pageSize" || value === undefined) {
      continue;
    }

    const values = Array.isArray(value) ? value : [value];

    for (const item of values) {
      if (item) {
        searchParams.append(key, item);
      }
    }
  }

  const query = searchParams.toString();

  return query ? `${input.basePath}?${query}` : input.basePath;
}
