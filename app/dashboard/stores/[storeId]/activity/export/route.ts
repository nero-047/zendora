import { requireAppUser } from "@/features/auth/app-user";
import {
  filterActivityCenterItems,
  getActivityCenterItems,
  parseActivityCenterKindFilter,
  parseActivityCenterPriorityFilter,
  parseActivityCenterSortOption,
  readActivityCenterSearchParam,
  type ActivityCenterItem,
} from "@/features/commerce/activity-center";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

function readParam(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key) || undefined;
}

function getKindLabel(item: ActivityCenterItem) {
  return item.kind === "notification" ? "Notification" : "Audit event";
}

export async function GET(request: Request, context: ExportRouteContext) {
  const { storeId } = await context.params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    return new Response("Store not found.", { status: 404 });
  }

  const searchParams = new URL(request.url).searchParams;
  const items = getActivityCenterItems({
    auditEvents: workspace.auditEvents,
    notifications: workspace.notifications,
    storeId: workspace.store.id,
  });
  const rows = filterActivityCenterItems({
    items,
    kind: parseActivityCenterKindFilter(readParam(searchParams, "kind")),
    priority: parseActivityCenterPriorityFilter(readParam(searchParams, "priority")),
    query: readActivityCenterSearchParam(readParam(searchParams, "q")),
    sort: parseActivityCenterSortOption(readParam(searchParams, "sort")),
  });

  return csvResponse<ActivityCenterItem>({
    filename: `${workspace.store.slug}-activity.csv`,
    rows,
    columns: [
      { header: "activity_id", value: (item) => item.id },
      { header: "kind", value: (item) => getKindLabel(item) },
      { header: "priority", value: (item) => item.priority },
      { header: "title", value: (item) => item.title },
      { header: "detail", value: (item) => item.detail },
      { header: "status_or_label", value: (item) => item.label },
      { header: "resource", value: (item) => item.resourceLabel },
      { header: "dashboard_href", value: (item) => item.href },
      {
        header: "created_at",
        value: (item) => new Date(item.createdAt).toISOString(),
      },
    ],
  });
}
