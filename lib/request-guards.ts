export const JSON_BODY_LIMIT_BYTES = 32 * 1024;
export const WEBHOOK_BODY_LIMIT_BYTES = 128 * 1024;

type JsonBodyResult =
  | {
      ok: true;
      value: unknown;
    }
  | {
      ok: false;
      error: string;
      status: number;
    };

type RateLimitPolicy = {
  limit: number;
  windowMs: number;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type HeaderGetter = {
  get(name: string): string | null;
};

export type RateLimitResult =
  | {
      ok: true;
      remaining: number;
      resetAt: number;
    }
  | {
      ok: false;
      retryAfterSeconds: number;
      resetAt: number;
    };

const rateLimitBuckets = new Map<string, RateLimitBucket>();

function pruneExpiredRateLimitBuckets(now: number) {
  if (rateLimitBuckets.size < 1000) {
    return;
  }

  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (bucket.resetAt <= now) {
      rateLimitBuckets.delete(key);
    }
  }
}

export function getClientFingerprint(request: Request) {
  return getClientFingerprintFromHeaders(request.headers);
}

export function getClientFingerprintFromHeaders(headers: HeaderGetter) {
  const forwardedFor = headers.get("x-forwarded-for");
  const forwardedIp = forwardedFor?.split(",")[0]?.trim();
  const ip =
    headers.get("cf-connecting-ip")?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    forwardedIp ||
    "unknown";
  const userAgent = headers.get("user-agent")?.trim().slice(0, 120) || "unknown";

  return `${ip}:${userAgent}`;
}

export function getContentLengthLimitError(
  headers: HeaderGetter,
  maxBytes: number,
) {
  const contentLength = Number(headers.get("content-length") || 0);

  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return {
      error: "Request body is too large.",
      status: 413,
    };
  }

  return null;
}

export function consumeRateLimit(
  key: string,
  policy: RateLimitPolicy,
  now = Date.now(),
): RateLimitResult {
  pruneExpiredRateLimitBuckets(now);

  const bucket = rateLimitBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + policy.windowMs;
    rateLimitBuckets.set(key, {
      count: 1,
      resetAt,
    });

    return {
      ok: true,
      remaining: Math.max(0, policy.limit - 1),
      resetAt,
    };
  }

  if (bucket.count >= policy.limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      resetAt: bucket.resetAt,
    };
  }

  bucket.count += 1;

  return {
    ok: true,
    remaining: Math.max(0, policy.limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

export async function readLimitedJsonBody(
  request: Request,
  maxBytes = JSON_BODY_LIMIT_BYTES,
): Promise<JsonBodyResult> {
  const contentType = request.headers.get("content-type")?.toLowerCase() || "";

  if (!contentType.includes("application/json")) {
    return {
      ok: false,
      error: "Expected a JSON request body.",
      status: 415,
    };
  }

  const contentLengthError = getContentLengthLimitError(request.headers, maxBytes);

  if (contentLengthError) {
    return {
      ok: false,
      ...contentLengthError,
    };
  }

  if (!request.body) {
    return {
      ok: false,
      error: "Missing request body.",
      status: 400,
    };
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let receivedBytes = 0;
  let bodyText = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    receivedBytes += value.byteLength;

    if (receivedBytes > maxBytes) {
      await reader.cancel();

      return {
        ok: false,
        error: "Request body is too large.",
        status: 413,
      };
    }

    bodyText += decoder.decode(value, { stream: true });
  }

  bodyText += decoder.decode();

  if (!bodyText.trim()) {
    return {
      ok: false,
      error: "Missing request body.",
      status: 400,
    };
  }

  try {
    return {
      ok: true,
      value: JSON.parse(bodyText),
    };
  } catch {
    return {
      ok: false,
      error: "Request body must be valid JSON.",
      status: 400,
    };
  }
}
