export const privacyRequestTypes = [
  "access",
  "correction",
  "deletion",
  "marketing_opt_out",
] as const;

export type PrivacyRequestType = (typeof privacyRequestTypes)[number];

export const privacyRequestTypeLabels: Record<PrivacyRequestType, string> = {
  access: "Data access",
  correction: "Data correction",
  deletion: "Deletion request",
  marketing_opt_out: "Marketing opt-out",
};

export function normalizePrivacyRequestText(value: string | undefined | null) {
  return value?.trim().replace(/\s+/g, " ") || "";
}

export function createPrivacyRequestSubject(input: {
  requestType: PrivacyRequestType;
  storeName: string;
}) {
  return `${input.storeName} privacy request: ${
    privacyRequestTypeLabels[input.requestType]
  }`;
}

export function createPrivacyRequestPreview(input: {
  email: string;
  message?: string | null;
  requestType: PrivacyRequestType;
}) {
  const message = normalizePrivacyRequestText(input.message);
  const fallback = `${privacyRequestTypeLabels[input.requestType]} request from ${input.email}.`;

  return message || fallback;
}

export function mergePrivacyRequestTags(existingTags: string[] = []) {
  const tags = new Set(
    existingTags
      .map((tag) => normalizePrivacyRequestText(tag).toLowerCase())
      .filter(Boolean),
  );

  tags.add("privacy-request");
  return [...tags].sort((a, b) => a.localeCompare(b));
}
