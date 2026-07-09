import posthog from "posthog-js";

function enabled(): boolean {
  return typeof window !== "undefined" && posthog.__loaded;
}

export function track(event: string, props?: Record<string, unknown>): void {
  if (enabled()) posthog.capture(event, props);
}
