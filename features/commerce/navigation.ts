import type {
  StoreNavigationLink,
  StoreNavigationMenu,
  StoreNavigationMenuLocation,
} from "@/features/commerce/types";

export const storeNavigationLocations = ["header", "footer"] as const;

export const storeNavigationLocationLabels: Record<
  StoreNavigationMenuLocation,
  string
> = {
  header: "Header",
  footer: "Footer",
};

export type NavigationParseResult = {
  links: StoreNavigationLink[];
  errors: string[];
};

function isNavigationLocation(value: string): value is StoreNavigationMenuLocation {
  return storeNavigationLocations.includes(
    value as StoreNavigationMenuLocation,
  );
}

export function normalizeNavigationHref(value: string) {
  const href = value.trim();

  if (!href) {
    return null;
  }

  if (href.startsWith("www.")) {
    return `https://${href}`;
  }

  if (href === "#") {
    return href;
  }

  if (href.startsWith("/") && !href.startsWith("//")) {
    return href;
  }

  if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) {
    return href;
  }

  return null;
}

export function sanitizeNavigationLinks(
  value: unknown,
): StoreNavigationLink[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const links: StoreNavigationLink[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (typeof item !== "object" || !item) {
      continue;
    }

    const record = item as Record<string, unknown>;
    const label = String(record.label || "").trim().replace(/\s+/g, " ");
    const href = normalizeNavigationHref(String(record.href || ""));

    if (!label || label.length > 60 || !href) {
      continue;
    }

    const key = `${label.toLowerCase()}|${href.toLowerCase()}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    links.push({ label, href });
  }

  return links.slice(0, 12);
}

export function parseNavigationMenuLines(value: string): NavigationParseResult {
  const links: StoreNavigationLink[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const [index, rawLine] of value.split(/\r?\n/).entries()) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    const separatorIndex = line.indexOf("|");

    if (separatorIndex === -1) {
      errors.push(`Line ${index + 1} needs a label and URL.`);
      continue;
    }

    const label = line.slice(0, separatorIndex).trim().replace(/\s+/g, " ");
    const href = normalizeNavigationHref(line.slice(separatorIndex + 1));

    if (label.length < 2 || label.length > 60) {
      errors.push(`Line ${index + 1} needs a label from 2 to 60 characters.`);
      continue;
    }

    if (!href) {
      errors.push(`Line ${index + 1} has an invalid URL.`);
      continue;
    }

    const key = `${label.toLowerCase()}|${href.toLowerCase()}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    links.push({ label, href });
  }

  if (links.length > 12) {
    errors.push("Menus can have up to 12 links.");
  }

  return {
    links: links.slice(0, 12),
    errors,
  };
}

export function formatNavigationMenuLines(links: StoreNavigationLink[]) {
  return links.map((link) => `${link.label} | ${link.href}`).join("\n");
}

export function getNavigationMenu(
  menus: StoreNavigationMenu[],
  location: StoreNavigationMenuLocation,
) {
  return (
    menus.find((menu) => menu.location === location) || {
      id: `${location}-fallback`,
      storeId: "",
      location,
      links: [],
      createdAt: "",
      updatedAt: "",
    }
  );
}

export function getNavigationLinks(
  menus: StoreNavigationMenu[],
  location: StoreNavigationMenuLocation,
) {
  return getNavigationMenu(menus, location).links;
}

export function mapNavigationMenuLocation(value: string) {
  return isNavigationLocation(value) ? value : "footer";
}
