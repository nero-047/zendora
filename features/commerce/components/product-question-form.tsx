"use client";

import { FormEvent, useState } from "react";
import { Loader2, MessageCircle, Send } from "lucide-react";

import {
  productQuestionTopicLabels,
  productQuestionTopics,
} from "@/features/commerce/product-questions";

type ProductQuestionResponse =
  | {
      ok: true;
      demo?: boolean;
      questionId: string;
    }
  | {
      ok: false;
      error: string;
    };

type ProductQuestionFormProps = {
  productId: string;
  productName: string;
  storeSlug: string;
};

export function ProductQuestionForm({
  productId,
  productName,
  storeSlug,
}: ProductQuestionFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [questionId, setQuestionId] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setQuestionId(null);
    setPending(true);

    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const response = await fetch(
        `/api/stores/${storeSlug}/products/${productId}/questions`,
        {
          body: JSON.stringify(Object.fromEntries(formData.entries())),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        },
      );
      const body = (await response.json()) as ProductQuestionResponse;

      if (!response.ok || !body.ok) {
        setError(body.ok ? "Product question is not available." : body.error);
        return;
      }

      form.reset();
      setQuestionId(body.questionId);
    } catch {
      setError("Product question is not available.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="soft-panel mt-5 grid gap-4 p-4" onSubmit={handleSubmit}>
      <div>
        <span className="status-pill mb-3">
          <MessageCircle aria-hidden="true" size={14} />
          Product questions
        </span>
        <h2 className="text-xl font-semibold text-slate-950">
          Ask about {productName}
        </h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2">
          <span className="label">Name</span>
          <input
            autoComplete="name"
            className="field"
            maxLength={80}
            name="name"
            placeholder="Mira Chen"
            required
          />
        </label>

        <label className="grid gap-2">
          <span className="label">Email</span>
          <input
            autoComplete="email"
            className="field"
            maxLength={120}
            name="email"
            placeholder="mira@example.com"
            required
            type="email"
          />
        </label>
      </div>

      <label className="grid gap-2">
        <span className="label">Topic</span>
        <select className="field" defaultValue="sizing" name="topic">
          {productQuestionTopics.map((topic) => (
            <option key={topic} value={topic}>
              {productQuestionTopicLabels[topic]}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-2">
        <span className="label">Question</span>
        <textarea
          className="field min-h-28 resize-y"
          maxLength={1200}
          name="message"
          placeholder="Ask about sizing, materials, compatibility, or delivery before buying."
          required
        />
      </label>

      {error ? (
        <p aria-live="polite" className="text-sm font-medium text-red-600">
          {error}
        </p>
      ) : null}

      {questionId ? (
        <p aria-live="polite" className="text-sm font-medium text-emerald-700">
          Product question received. Reference {questionId}.
        </p>
      ) : null}

      <button
        className="secondary-button w-full px-4 disabled:cursor-not-allowed disabled:opacity-55"
        disabled={pending}
        type="submit"
      >
        {pending ? (
          <Loader2 aria-hidden="true" className="animate-spin" size={18} />
        ) : (
          <Send aria-hidden="true" size={18} />
        )}
        Ask question
      </button>
    </form>
  );
}
