"use client";

import { Suspense } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ChevronLeft } from "lucide-react";
import SendPlannerDesignToAdminDialog from "../components/SendPlannerDesignToAdminDialog";
import { buildCustomDesignEmailDesign } from "../utils/plannerDesignSnapshots";
import { useResolvedAdmin } from "@/contexts/PublishedTenantProvider";

const SheetDraftCanvas = dynamic(() => import("./SheetDraftCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center bg-[var(--muted)] text-sm text-[var(--muted-foreground)]">
      Loading drafting sheet…
    </div>
  ),
});

function CustomDesignInner() {
  const admin = useResolvedAdmin();

  return (
    <div className="flex min-h-[100dvh] flex-col overflow-y-auto bg-[var(--background)]">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--border)] px-3 py-2.5 md:px-4">
        <Link
          href="/planners"
          className="inline-flex items-center gap-1 rounded-lg text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
        >
          <ChevronLeft className="h-4 w-4" />
          Planners
        </Link>
        <h1 className="text-base font-semibold md:text-lg">Custom planner</h1>
        <div className="ml-auto flex items-center gap-2 rounded-lg border border-[var(--border)] p-0.5">
          <SendPlannerDesignToAdminDialog
            adminSlug={admin?.slug}
            plannerType="custom-design"
            plannerLabel="Custom planner"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
            buildDesign={() => buildCustomDesignEmailDesign()}
          />
        </div>
      </header>
      <div className="min-h-[calc(100dvh-58px)] flex-1">
        <SheetDraftCanvas />
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
