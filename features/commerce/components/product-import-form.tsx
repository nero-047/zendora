"use client";

import { useActionState } from "react";
import { FileUp, Loader2, Upload } from "lucide-react";

import { initialActionState } from "@/features/commerce/action-state";
import { importProductsAction } from "@/features/commerce/actions";

export function ProductImportForm({ storeId }: { storeId: string }) {
  const [state, formAction, pending] = useActionState(
    importProductsAction.bind(null, storeId),
    initialActionState,
  );

  return (
    <form action={formAction} className="glass-panel grid gap-5 p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-[8px] bg-sky-500/12 text-sky-700">
          <FileUp aria-hidden="true" size={21} />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-950">
            Import products
          </h1>
          <p className="text-sm text-slate-500">
            Upload the product import template or paste CSV rows.
          </p>
        </div>
      </div>

      <label className="grid gap-2">
        <span className="label">CSV file</span>
        <div className="field flex items-center gap-3 p-3">
          <Upload aria-hidden="true" className="shrink-0 text-slate-400" size={20} />
          <input
            accept=".csv,text/csv"
            className="w-full text-sm file:mr-4 file:rounded-[8px] file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
            name="csvFile"
            type="file"
          />
        </div>
      </label>

      <label className="grid gap-2">
        <span className="label">CSV rows</span>
        <textarea
          className="field min-h-72 resize-y font-mono text-xs"
          name="csvText"
          placeholder="row_type,handle,title,status,sku,category,description,price,compare_at_price,inventory,image_url,option_name,option_value,variant_sku,variant_price,variant_compare_at_price,variant_inventory,variant_status"
        />
        {state.errors?.csvText ? (
          <span className="text-xs font-medium text-red-600">
            {state.errors.csvText[0]}
          </span>
        ) : null}
      </label>

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

      <button className="primary-button px-4" disabled={pending} type="submit">
        {pending ? (
          <Loader2 aria-hidden="true" className="animate-spin" size={18} />
        ) : (
          <FileUp aria-hidden="true" size={18} />
        )}
        Import products
      </button>
    </form>
  );
}
