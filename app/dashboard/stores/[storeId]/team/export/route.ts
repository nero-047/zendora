import { requireAppUser } from "@/features/auth/app-user";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import {
  canStoreRole,
  getStorePermissionLabel,
  type StorePermission,
} from "@/features/commerce/permissions";
import type {
  StoreInvitation,
  StoreMembershipRole,
} from "@/features/commerce/types";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

type TeamExportRow = {
  section: string;
  metric: string;
  label: string;
  value: string | number;
  count?: number;
  status?: string;
  detail?: string;
  date?: string;
  href?: string;
};

const roles = ["owner", "admin", "staff"] as const satisfies readonly StoreMembershipRole[];

const permissions = [
  "manage_store_settings",
  "manage_catalog",
  "manage_inventory",
  "manage_orders",
  "manage_discounts",
  "manage_shipping",
  "manage_refunds",
  "manage_team",
] as const satisfies readonly StorePermission[];

function formatDate(value: string | undefined) {
  return value ? new Date(value).toISOString() : "";
}

function getInvitationStatus(invitation: StoreInvitation) {
  if (invitation.revokedAt) {
    return "Revoked";
  }

  if (invitation.acceptedAt) {
    return "Accepted";
  }

  if (new Date(invitation.expiresAt).getTime() < Date.now()) {
    return "Expired";
  }

  return "Pending";
}

function getRolePermissions(role: StoreMembershipRole) {
  return permissions
    .filter((permission) => canStoreRole(role, permission))
    .map(getStorePermissionLabel)
    .join(" / ");
}

function summarizeMetadata(metadata: Record<string, unknown>) {
  return Object.entries(metadata)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" / ");
}

export async function GET(_request: Request, context: ExportRouteContext) {
  const { storeId } = await context.params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    return new Response("Store not found.", { status: 404 });
  }

  const membershipRole = workspace.membershipRole;

  if (!membershipRole || !canStoreRole(membershipRole, "manage_team")) {
    return new Response("Team export requires owner access.", { status: 403 });
  }

  const { store } = workspace;
  const teamAuditEvents = workspace.auditEvents
    .filter(
      (event) =>
        event.action.startsWith("team_") ||
        event.resourceType === "store_invitation" ||
        event.resourceType === "store_membership",
    )
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  const ownerCount = workspace.members.filter((member) => member.role === "owner")
    .length;
  const adminCount = workspace.members.filter((member) => member.role === "admin")
    .length;
  const staffCount = workspace.members.filter((member) => member.role === "staff")
    .length;
  const rows: TeamExportRow[] = [
    {
      section: "access_summary",
      metric: "current_user_role",
      label: "Current user role",
      value: membershipRole,
      status: membershipRole,
      detail: getRolePermissions(membershipRole),
    },
    {
      section: "access_summary",
      metric: "members",
      label: "Members",
      value: workspace.members.length,
      detail: `${ownerCount} owners / ${adminCount} admins / ${staffCount} staff`,
    },
    {
      section: "access_summary",
      metric: "pending_invitations",
      label: "Pending invitations",
      value: workspace.invitations.filter(
        (invitation) => getInvitationStatus(invitation) === "Pending",
      ).length,
      count: workspace.invitations.length,
    },
    ...workspace.members
      .slice()
      .sort((a, b) => a.role.localeCompare(b.role) || a.email.localeCompare(b.email))
      .map((member) => ({
        section: "team_member",
        metric: member.userId,
        label: member.name,
        value: member.email,
        status: member.role,
        detail: getRolePermissions(member.role),
        date: formatDate(member.createdAt),
      })),
    ...workspace.invitations
      .slice()
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .map((invitation) => ({
        section: "team_invitation",
        metric: invitation.id,
        label: invitation.email,
        value: invitation.role,
        status: getInvitationStatus(invitation),
        detail: [
          `Invited by ${invitation.invitedByUserId}`,
          `Expires ${formatDate(invitation.expiresAt)}`,
          invitation.acceptedAt ? `Accepted ${formatDate(invitation.acceptedAt)}` : "",
          invitation.revokedAt ? `Revoked ${formatDate(invitation.revokedAt)}` : "",
        ]
          .filter(Boolean)
          .join(" / "),
        date: formatDate(invitation.createdAt),
      })),
    ...roles.flatMap((role) =>
      permissions.map((permission) => ({
        section: "permission_matrix",
        metric: `${role}:${permission}`,
        label: getStorePermissionLabel(permission),
        value: canStoreRole(role, permission) ? "Allowed" : "Denied",
        status: role,
        detail: permission,
      })),
    ),
    ...teamAuditEvents.map((event) => ({
      section: "team_audit",
      metric: event.id,
      label: event.action.replaceAll("_", " "),
      value: event.summary,
      status: event.resourceType,
      detail: summarizeMetadata(event.metadata),
      date: formatDate(event.createdAt),
      href: `/dashboard/stores/${store.id}/activity`,
    })),
  ];

  return csvResponse<TeamExportRow>({
    filename: `${store.slug}-team-access.csv`,
    rows,
    columns: [
      { header: "section", value: (row) => row.section },
      { header: "metric", value: (row) => row.metric },
      { header: "label", value: (row) => row.label },
      { header: "value", value: (row) => row.value },
      { header: "count", value: (row) => row.count },
      { header: "status", value: (row) => row.status },
      { header: "detail", value: (row) => row.detail },
      { header: "date", value: (row) => row.date },
      { header: "href", value: (row) => row.href },
    ],
  });
}
