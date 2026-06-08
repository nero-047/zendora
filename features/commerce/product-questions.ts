export const productQuestionTopics = [
  "sizing",
  "compatibility",
  "materials",
  "shipping",
  "other",
] as const;

export type ProductQuestionTopic = (typeof productQuestionTopics)[number];

export const productQuestionTopicLabels: Record<ProductQuestionTopic, string> = {
  sizing: "Sizing or fit",
  compatibility: "Compatibility",
  materials: "Materials or care",
  shipping: "Shipping",
  other: "Other product question",
};

export function normalizeProductQuestionText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function createProductQuestionPreview(input: {
  message: string;
  productName: string;
  topic: ProductQuestionTopic;
  maxLength?: number;
}) {
  const normalized = normalizeProductQuestionText(input.message);
  const maxLength = input.maxLength ?? 220;
  const fallback = `Customer asked about ${input.productName}: ${
    productQuestionTopicLabels[input.topic]
  }.`;
  const preview = normalized || fallback;

  if (preview.length <= maxLength) {
    return preview;
  }

  return `${preview.slice(0, Math.max(0, maxLength - 3))}...`;
}

export function createProductQuestionSubject(input: {
  productName: string;
  storeName: string;
  topic: ProductQuestionTopic;
}) {
  return `${input.storeName} product question: ${input.productName} / ${
    productQuestionTopicLabels[input.topic]
  }`;
}
