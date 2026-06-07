"use client";

import { useActionState } from "react";
import { Loader2, PauseCircle, PlayCircle } from "lucide-react";

import type { ActionState } from "@/features/commerce/action-state";
import { initialActionState } from "@/features/commerce/action-state";
import {
  pauseStoreAction,
  publishStoreAction,
} from "@/features/commerce/actions";
import type { Store } from "@/features/commerce/types";

export function StoreStatusControls({
  storeId,
  storeStatus,
}: {
  storeId: string;
  storeStatus: Store["status"];
}) {
  async function publishAction(
    _currentState: ActionState,
    _formData: FormData,
  ) {
    void _currentState;
    void _formData;

    return publishStoreAction(storeId);
  }

  async function pauseAction(
    _currentState: ActionState,
    _formData: FormData,
  ) {
    void _currentState;
    void _formData;

    return pauseStoreAction(storeId);
  }

  const [publishState, publishFormAction, publishPending] = useActionState(
    publishAction,
    initialActionState,
  );
  const [pauseState, pauseFormAction, pausePending] = useActionState(
    pauseAction,
    initialActionState,
  );
  const state = publishState.message ? publishState : pauseState;

  return (
    <div className="mt-5 grid gap-2">
      <div className="flex flex-wrap gap-2">
        <form action={publishFormAction}>
          <button
            className="secondary-button px-3 text-sm disabled:cursor-not-allowed disabled:opacity-55"
            disabled={publishPending || storeStatus === "active"}
            type="submit"
          >
            {publishPending ? (
              <Loader2 aria-hidden="true" className="animate-spin" size={16} />
            ) : (
              <PlayCircle aria-hidden="true" size={16} />
            )}
            Publish
          </button>
        </form>
        <form action={pauseFormAction}>
          <button
            className="secondary-button px-3 text-sm disabled:cursor-not-allowed disabled:opacity-55"
            disabled={pausePending || storeStatus === "paused"}
            type="submit"
          >
            {pausePending ? (
              <Loader2 aria-hidden="true" className="animate-spin" size={16} />
            ) : (
              <PauseCircle aria-hidden="true" size={16} />
            )}
            Pause
          </button>
        </form>
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
    </div>
  );
}
