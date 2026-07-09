"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect } from "react";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

export function PostHogProvider({
  merchantSlug,
  merchantName,
  children,
}: {
  merchantSlug: string | null;
  merchantName: string | null;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!POSTHOG_KEY) return;
    if (!posthog.__loaded) {
      posthog.init(POSTHOG_KEY, {
        api_host: "/ingest",
        ui_host: "https://eu.posthog.com",
        defaults: "2025-05-24",
        capture_pageview: "history_change",
        person_profiles: "identified_only",
        session_recording: { maskAllInputs: true },
      });
    }
    posthog.register({ app: "published", merchant_slug: merchantSlug ?? "unknown" });
    if (merchantSlug) {
      posthog.group("merchant", merchantSlug, { name: merchantName ?? merchantSlug });
    }
  }, [merchantSlug, merchantName]);

  if (!POSTHOG_KEY) return <>{children}</>;
  return <PHProvider client={posthog}>{children}</PHProvider>;
}
