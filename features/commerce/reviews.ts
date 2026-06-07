import type {
  OrderStatus,
  PaymentStatus,
  ProductReview,
  ProductReviewStatus,
} from "@/features/commerce/types";

export const productReviewStatuses = [
  "pending",
  "approved",
  "rejected",
] as const satisfies readonly ProductReviewStatus[];

export const productReviewStatusLabels: Record<ProductReviewStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

export function getProductReviewSummary(
  reviews: Pick<ProductReview, "rating" | "status">[],
) {
  const approvedReviews = reviews.filter((review) => review.status === "approved");
  const ratingTotal = approvedReviews.reduce(
    (sum, review) => sum + review.rating,
    0,
  );

  return {
    reviewCount: approvedReviews.length,
    averageRating:
      approvedReviews.length > 0
        ? Number((ratingTotal / approvedReviews.length).toFixed(1))
        : 0,
  };
}

export function canCustomerReviewOrderItem(input: {
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  productId?: string;
  orderItemId?: string;
  existingReviews: Pick<ProductReview, "orderItemId" | "productId" | "orderId">[];
  orderId: string;
}) {
  if (!input.productId) {
    return false;
  }

  if (input.orderStatus !== "paid" && input.orderStatus !== "fulfilled") {
    return false;
  }

  if (
    input.paymentStatus !== "paid" &&
    input.paymentStatus !== "partially_refunded"
  ) {
    return false;
  }

  return !input.existingReviews.some((review) => {
    if (input.orderItemId && review.orderItemId === input.orderItemId) {
      return true;
    }

    return review.orderId === input.orderId && review.productId === input.productId;
  });
}
