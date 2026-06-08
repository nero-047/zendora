import { requireAppUser } from "@/features/auth/app-user";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import { productReviewStatusLabels } from "@/features/commerce/reviews";
import type { ProductReview } from "@/features/commerce/types";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

type ReviewModerationRow = {
  reviewId: string;
  productId: string;
  productName: string;
  customerName: string;
  customerEmail: string;
  rating: number;
  status: string;
  priority: string;
  ageDays: number;
  moderationStatus: string;
  recommendedAction: string;
  title?: string;
  body: string;
  merchantReply?: string;
  reviewedAt: string;
  updatedAt: string;
  orderHref?: string;
  productHref?: string;
};

const pendingReviewSlaDays = 2;

function formatDate(value: string | undefined) {
  return value ? new Date(value).toISOString() : "";
}

function getAgeDays(reviewedAt: string, now: Date) {
  const reviewedTime = new Date(reviewedAt).getTime();

  if (!Number.isFinite(reviewedTime)) {
    return 0;
  }

  return Math.max(0, Math.floor((now.getTime() - reviewedTime) / 86400000));
}

function getPriority(review: ProductReview, ageDays: number) {
  if (review.status === "pending" && ageDays > pendingReviewSlaDays) {
    return "critical";
  }

  if (review.status === "pending") {
    return "high";
  }

  if (review.rating <= 2) {
    return "medium";
  }

  return "normal";
}

function getModerationStatus(review: ProductReview, ageDays: number) {
  if (review.status === "pending" && ageDays > pendingReviewSlaDays) {
    return "Pending overdue";
  }

  if (review.status === "pending") {
    return "Pending review";
  }

  if (review.status === "approved" && !review.merchantReply && review.rating <= 3) {
    return "Needs merchant reply";
  }

  return productReviewStatusLabels[review.status];
}

function getRecommendedAction(review: ProductReview, ageDays: number) {
  if (review.status === "pending" && ageDays > pendingReviewSlaDays) {
    return "Moderate this review immediately to keep review publishing fresh.";
  }

  if (review.status === "pending") {
    return "Approve, reject, or reply before the moderation SLA window closes.";
  }

  if (review.status === "approved" && !review.merchantReply && review.rating <= 3) {
    return "Add a merchant reply before using this feedback in product marketing.";
  }

  if (review.status === "rejected") {
    return "No publishing action needed unless the customer resubmits feedback.";
  }

  return "No action needed; keep monitoring product review quality.";
}

export async function GET(_request: Request, context: ExportRouteContext) {
  const { storeId } = await context.params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    return new Response("Store not found.", { status: 404 });
  }

  const now = new Date();
  const productsById = new Map(
    workspace.products.map((product) => [product.id, product]),
  );
  const rows: ReviewModerationRow[] = workspace.productReviews
    .slice()
    .sort(
      (a, b) =>
        Number(b.status === "pending") - Number(a.status === "pending") ||
        new Date(b.reviewedAt).getTime() - new Date(a.reviewedAt).getTime(),
    )
    .map((review) => {
      const product = productsById.get(review.productId);
      const ageDays = getAgeDays(review.reviewedAt, now);

      return {
        reviewId: review.id,
        productId: review.productId,
        productName: product?.name || review.productId,
        customerName: review.customerName,
        customerEmail: review.customerEmail,
        rating: review.rating,
        status: productReviewStatusLabels[review.status],
        priority: getPriority(review, ageDays),
        ageDays,
        moderationStatus: getModerationStatus(review, ageDays),
        recommendedAction: getRecommendedAction(review, ageDays),
        title: review.title,
        body: review.body,
        merchantReply: review.merchantReply,
        reviewedAt: formatDate(review.reviewedAt),
        updatedAt: formatDate(review.updatedAt),
        orderHref: review.orderId
          ? `/dashboard/stores/${workspace.store.id}/orders/${review.orderId}`
          : undefined,
        productHref: product
          ? `/dashboard/stores/${workspace.store.id}/products/${product.id}/edit`
          : undefined,
      };
    });

  return csvResponse<ReviewModerationRow>({
    filename: `${workspace.store.slug}-review-moderation.csv`,
    rows,
    columns: [
      { header: "review_id", value: (row) => row.reviewId },
      { header: "product_id", value: (row) => row.productId },
      { header: "product_name", value: (row) => row.productName },
      { header: "customer_name", value: (row) => row.customerName },
      { header: "customer_email", value: (row) => row.customerEmail },
      { header: "rating", value: (row) => row.rating },
      { header: "status", value: (row) => row.status },
      { header: "priority", value: (row) => row.priority },
      { header: "age_days", value: (row) => row.ageDays },
      {
        header: "moderation_status",
        value: (row) => row.moderationStatus,
      },
      {
        header: "recommended_action",
        value: (row) => row.recommendedAction,
      },
      { header: "title", value: (row) => row.title },
      { header: "body", value: (row) => row.body },
      { header: "merchant_reply", value: (row) => row.merchantReply },
      { header: "reviewed_at", value: (row) => row.reviewedAt },
      { header: "updated_at", value: (row) => row.updatedAt },
      { header: "order_href", value: (row) => row.orderHref },
      { header: "product_href", value: (row) => row.productHref },
    ],
  });
}
