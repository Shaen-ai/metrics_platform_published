"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Pencil, Box } from "lucide-react";

const EditorWorkspace = dynamic(
  () =>
    import("@/components/editor/EditorWorkspace").then((m) => ({
      default: m.EditorWorkspace,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-1 items-center justify-center bg-[var(--muted)] text-sm text-[var(--muted-foreground)]">
        Loading room editor…
      </div>
    ),
  }
);

const SheetDraftCanvas = dynamic(() => import("./SheetDraftCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center bg-[var(--muted)] text-sm text-[var(--muted-foreground)]">
      Loading drafting sheet…
    </div>
  ),
});

function CustomDesignInner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const mode = useMemo(() => {
    const m = searchParams.get("mode");
    return m === "room" ? "room" : "sheet";
  }, [searchParams]);

  const setMode = (next: "sheet" | "room") => {
    const q = new URLSearchParams(searchParams.toString());
    q.set("mode", next);
    router.replace(`${pathname}?${q.toString()}`);
  };

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[var(--background)]">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--border)] px-3 py-2.5 md:px-4">
        <Link
          href="/planners"
          className="inline-flex items-center gap-1 rounded-lg text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
        >
          <ChevronLeft className="h-4 w-4" />
          Planners
        </Link>
        <h1 className="text-base font-semibold md:text-lg">Custom planner</h1>
        <div className="ml-auto flex rounded-lg border border-[var(--border)] p-0.5">
          <button
            type="button"
            onClick={() => setMode("sheet")}
            className={
              mode === "sheet"
                ? "inline-flex items-center gap-1.5 rounded-md bg-[var(--primary)]/15 px-3 py-1.5 text-sm font-medium text-[var(--foreground)]"
                : "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
            }
          >
            <Pencil className="h-4 w-4" />
            Sheet
          </button>
          <button
            type="button"
            onClick={() => setMode("room")}
            className={
              mode === "room"
                ? "inline-flex items-center gap-1.5 rounded-md bg-[var(--primary)]/15 px-3 py-1.5 text-sm font-medium text-[var(--foreground)]"
                : "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
            }
          >
            <Box className="h-4 w-4" />
            Room + 3D
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1">
        {mode === "sheet" ? (
          <SheetDraftCanvas />
        ) : (
          <div className="h-full min-h-0">
            <EditorWorkspace embeddedInPlanner />
          </div>
        )}
      </div>
    </div>
  );
}

export default function CustomDesignPlannerLayout() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[100dvh] items-center justify-center bg-[var(--background)] text-sm text-[var(--muted-foreground)]">
          Loading custom planner…
        </div>
      }
    >
      <CustomDesignInner />
    </Suspense>
  );
}
