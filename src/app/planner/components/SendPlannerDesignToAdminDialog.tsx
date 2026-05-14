"use client";

import { useCallback, useId, useState } from "react";
import { Mail, X } from "lucide-react";
import { api } from "@/lib/api";

type Props = {
  adminSlug: string | undefined;
  plannerType: string;
  plannerLabel: string;
  buildDesign: () => Record<string, unknown> | Promise<Record<string, unknown>>;
  /** Icon + tooltip only (wardrobe/kitchen headers). When false, renders a text button for dense bars. */
  iconTrigger?: boolean;
  className?: string;
};

export default function SendPlannerDesignToAdminDialog({
  adminSlug,
  plannerType,
  plannerLabel,
  buildDesign,
  iconTrigger = true,
  className,
}: Props) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "err">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setStatus("idle");
    setErrorMessage(null);
  }, []);

  const submit = useCallback(async () => {
    const slug = adminSlug?.trim();
    if (!slug) {
      setErrorMessage("Store is not loaded. Try again in a moment.");
      setStatus("err");
      return;
    }
    const n = name.trim();
    const em = email.trim();
    if (!n || !em) {
      setErrorMessage("Please enter your name and email.");
      setStatus("err");
      return;
    }
    setStatus("sending");
    setErrorMessage(null);
    try {
      let design: Record<string, unknown>;
      try {
        design = await Promise.resolve(buildDesign());
      } catch (e) {
        throw new Error(e instanceof Error ? e.message : "Could not read design data.");
      }
      await api.submitPlannerInquiry(slug, {
        customer_name: n,
        customer_email: em,
        planner_type: plannerType,
        planner_label: plannerLabel,
        notes: notes.trim() || undefined,
        design,
      });
      setStatus("done");
    } catch (e) {
      setStatus("err");
      setErrorMessage(e instanceof Error ? e.message : "Something went wrong.");
    }
  }, [adminSlug, buildDesign, email, name, notes, plannerLabel, plannerType]);

  return (
    <>
      {iconTrigger ? (
        <button
          type="button"
          className={className ?? "header-icon-btn"}
          title="Email this design to the store"
          aria-label="Email this design to the store"
          onClick={() => {
            setOpen(true);
            setStatus("idle");
            setErrorMessage(null);
          }}
        >
          <Mail size={16} />
        </button>
      ) : (
        <button
          type="button"
          className={className ?? "btn-toggle"}
          title="Email this design to the store"
          onClick={() => {
            setOpen(true);
            setStatus("idle");
            setErrorMessage(null);
          }}
        >
          <Mail size={14} />
          <span>Email store</span>
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-[560] flex items-center justify-center p-4 bg-black/45 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--background)] shadow-xl text-[var(--foreground)]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
              <div>
                <h2 id={titleId} className="text-base font-semibold">
                  Email design to store
                </h2>
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{plannerLabel}</p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 hover:bg-[var(--muted)] text-[var(--muted-foreground)]"
                aria-label="Close"
                onClick={close}
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-4 py-3 space-y-3 text-sm">
              {status === "done" ? (
                <p className="text-[var(--foreground)]">
                  Thank you. The store owner has been sent your design details (sizes and configuration).
                </p>
              ) : (
                <>
                  <p className="text-[var(--muted-foreground)] text-xs leading-relaxed">
                    We attach a structured summary of your plan: room sizes, each item&apos;s dimensions, and any
                    custom wardrobe configuration.
                  </p>
                  <label className="block space-y-1">
                    <span className="text-xs font-medium">Your name</span>
                    <input
                      className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                      disabled={status === "sending"}
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-medium">Email</span>
                    <input
                      type="email"
                      className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      disabled={status === "sending"}
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-medium">Notes (optional)</span>
                    <textarea
                      className="w-full min-h-[72px] rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Delivery area, timeline, questions…"
                      disabled={status === "sending"}
                    />
                  </label>
                  {status === "err" && errorMessage && (
                    <p className="text-sm text-red-600" role="alert">
                      {errorMessage}
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
              {status === "done" ? (
                <button
                  type="button"
                  className="rounded-lg bg-[var(--primary)] text-white font-medium px-4 py-2 text-sm hover:opacity-90"
                  onClick={close}
                >
                  Close
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--muted)]"
                    onClick={close}
                    disabled={status === "sending"}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-[var(--primary)] text-white font-medium px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50"
                    onClick={() => void submit()}
                    disabled={status === "sending"}
                  >
                    {status === "sending" ? "Sending…" : "Send"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
