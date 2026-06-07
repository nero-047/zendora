"use client";

import { useActionState } from "react";
import { Loader2, MailPlus } from "lucide-react";

import { initialActionState } from "@/features/commerce/action-state";
import { createStoreInvitationAction } from "@/features/commerce/actions";

export function TeamInviteForm({ storeId }: { storeId: string }) {
  const [state, formAction, pending] = useActionState(
    createStoreInvitationAction.bind(null, storeId),
    initialActionState,
  );

  return (
    <form action={formAction} className="soft-panel grid gap-4 p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-[8px] bg-violet-500/12 text-violet-700">
          <MailPlus aria-hidden="true" size={21} />
        </div>
        <h2 className="text-lg font-semibold text-slate-950">Invite team</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_160px_auto]">
        <label className="grid gap-2">
          <span className="label">Email</span>
          <input
            className="field"
            inputMode="email"
            name="email"
            placeholder="teammate@example.com"
            type="email"
          />
          {state.errors?.email ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.email[0]}
            </span>
          ) : null}
        </label>

        <label className="grid gap-2">
          <span className="label">Role</span>
          <select className="field" defaultValue="staff" name="role">
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
          {state.errors?.role ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.role[0]}
            </span>
          ) : null}
        </label>

        <div className="grid content-end">
          <button className="primary-button px-4 text-sm" disabled={pending} type="submit">
            {pending ? (
              <Loader2 aria-hidden="true" className="animate-spin" size={18} />
            ) : (
              <MailPlus aria-hidden="true" size={18} />
            )}
            Invite
          </button>
        </div>
      </div>

      {state.message ? (
        <p
          className={
            state.status === "error"
              ? "text-sm font-medium text-red-600"
              : "text-sm font-medium text-emerald-700"
          }
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
