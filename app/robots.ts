import type { MetadataRoute } from "next";

import { getAppUrl } from "@/lib/env";

function getBaseUrl() {
  return getAppUrl().replace(/\/$/, "");
}

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getBaseUrl();

  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/stores/"],
      disallow: [
        "/api/",
        "/dashboard/",
        "/sign-in/",
        "/sign-up/",
        "/stores/*/cart",
        "/stores/*/cart/",
        "/stores/*/checkout",
        "/stores/*/checkout/",
        "/stores/*/compare",
        "/stores/*/compare/",
        "/stores/*/gift-cards",
        "/stores/*/gift-cards/",
        "/stores/*/orders",
        "/stores/*/orders/",
        "/stores/*/privacy-requests",
        "/stores/*/privacy-requests/",
        "/stores/*/recently-viewed",
        "/stores/*/recently-viewed/",
        "/stores/*/search",
        "/stores/*/search/",
        "/stores/*/wishlist",
        "/stores/*/wishlist/",
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
