import { useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { applyGeneratedPlan, type GeneratedPlanData } from "./applyGeneratedPlan";

const STORAGE_KEY = "interior-design-plan";

export function useApplyInteriorDesignPlan(ready: boolean) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const applied = useRef(false);

  useEffect(() => {
    if (!ready || applied.current) return;
    if (searchParams.get("fromInteriorDesign") !== "1") return;

    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
      const data = JSON.parse(raw) as GeneratedPlanData;
      applyGeneratedPlan(data);
    } catch {
      console.error("Failed to parse interior-design plan from sessionStorage");
    } finally {
      applied.current = true;
      sessionStorage.removeItem(STORAGE_KEY);
      router.replace(window.location.pathname, { scroll: false });
    }
  }, [ready, searchParams, router]);
}
