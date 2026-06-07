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
        "/stores/*/checkout",
        "/stores/*/orders/",
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
