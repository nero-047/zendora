import { requireAppUser } from "@/features/auth/app-user";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import {
  getProductReviewSummary,
  productReviewStatusLabels,
} from "@/features/commerce/reviews";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

type ReviewExportRow = {
  section: string;
  metric: string;
  label: string;
  value: string | number;
  status?: string;
  detail?: string;
  href?: string;
};

function formatDate(value: string | undefined) {
  return value ? new Date(value).toISOString() : "";
}

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
  const reviewSummary = getProductReviewSummary(workspace.productReviews);
  const pendingCount = workspace.productReviews.filter(
    (review) => review.status === "pending",
  ).length;
  const rejectedCount = workspace.productReviews.filter(
    (review) => review.status === "rejected",
  ).length;
  const rows: ReviewExportRow[] = [
    {
      section: "summary",
      metric: "total_reviews",
      label: "Total reviews",
      value: workspace.productReviews.length,
      detail: `${pendingCount} pending / ${rejectedCount} rejected`,
    },
    {
      section: "summary",
      metric: "approved_reviews",
      label: "Approved reviews",
      value: reviewSummary.reviewCount,
      detail: `${reviewSummary.averageRating} average rating`,
    },
    ...workspace.productReviews
      .sort(
        (a, b) =>
          new Date(b.reviewedAt).getTime() - new Date(a.reviewedAt).getTime(),
      )
      .map((review) => {
        const product = productsById.get(review.productId);

        return {
          section: "product_review",
          metric: review.id,
          label: review.title || product?.name || "Product review",
          value: `${review.rating}/5`,
          status: productReviewStatusLabels[review.status],
          detail: [
            product?.name,
            review.customerEmail,
            review.body,
            review.merchantReply,
            formatDate(review.reviewedAt),
            formatDate(review.approvedAt),
            formatDate(review.rejectedAt),
          ]
            .filter(Boolean)
            .join(" / "),
          href: review.orderId
            ? `/dashboard/stores/${workspace.store.id}/orders/${review.orderId}`
            : product
              ? `/dashboard/stores/${workspace.store.id}/products/${product.id}/edit`
              : undefined,
        };
      }),
  ];

  return csvResponse<ReviewExportRow>({
    filename: `${workspace.store.slug}-product-reviews.csv`,
    rows,
    columns: [
      { header: "section", value: (row) => row.section },
      { header: "metric", value: (row) => row.metric },
      { header: "label", value: (row) => row.label },
      { header: "value", value: (row) => row.value },
      { header: "status", value: (row) => row.status },
      { header: "detail", value: (row) => row.detail },
      { header: "href", value: (row) => row.href },
    ],
  });
}
