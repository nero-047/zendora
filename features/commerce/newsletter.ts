export const newsletterLeadTags = ["lead", "newsletter"] as const;

export function normalizeNewsletterText(value: string | undefined | null) {
  return value?.trim().replace(/\s+/g, " ") || "";
}

export function mergeNewsletterTags(existingTags: string[] = []) {
  const tags = new Set(
    existingTags
      .map((tag) => normalizeNewsletterText(tag).toLowerCase())
      .filter(Boolean),
  );

  for (const tag of newsletterLeadTags) {
    tags.add(tag);
  }

  return [...tags].sort((a, b) => a.localeCompare(b));
}

export function createNewsletterNote(input: {
  existingNote?: string | null;
  source?: string | null;
}) {
  const existingNote = normalizeNewsletterText(input.existingNote);
  const source = normalizeNewsletterText(input.source);
  const signupNote = source
    ? `Newsletter signup from ${source}.`
    : "Newsletter signup from storefront.";

  return existingNote || signupNote;
}
