import type { StoreMembershipRole } from "@/features/commerce/types";

export type StorePermission =
  | "manage_store_settings"
  | "manage_catalog"
  | "manage_inventory"
  | "manage_orders"
  | "manage_discounts"
  | "manage_shipping"
  | "manage_refunds"
  | "manage_team";

const permissionRoles: Record<StorePermission, StoreMembershipRole[]> = {
  manage_store_settings: ["owner", "admin"],
  manage_catalog: ["owner", "admin", "staff"],
  manage_inventory: ["owner", "admin", "staff"],
  manage_orders: ["owner", "admin", "staff"],
  manage_discounts: ["owner", "admin"],
  manage_shipping: ["owner", "admin"],
  manage_refunds: ["owner", "admin"],
  manage_team: ["owner"],
};

const permissionLabels: Record<StorePermission, string> = {
  manage_store_settings: "manage store settings",
  manage_catalog: "manage products and collections",
  manage_inventory: "manage inventory",
  manage_orders: "manage orders",
  manage_discounts: "manage discounts",
  manage_shipping: "manage shipping",
  manage_refunds: "manage refunds",
  manage_team: "manage team access",
};

export function canStoreRole(
  role: StoreMembershipRole | undefined,
  permission: StorePermission,
) {
  return Boolean(role && permissionRoles[permission].includes(role));
}

export function getStorePermissionLabel(permission: StorePermission) {
  return permissionLabels[permission];
}
