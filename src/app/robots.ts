import type { MetadataRoute } from "next";

/**
 * Per-merchant storefronts are served on many hosts (<slug>.tunzone.com), so
 * this robots policy is host-agnostic: allow crawling of public storefront
 * pages, keep API + checkout out of the index, and explicitly welcome the AI
 * answer-engine crawlers.
 */
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "Google-Extended",
  "ClaudeBot",
  "Claude-SearchBot",
  "Anthropic-AI",
  "PerplexityBot",
  "Perplexity-User",
  "Applebot-Extended",
  "CCBot",
];

const disallow = ["/api/", "/checkout", "/cart", "/login", "/signup"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, allow: "/", disallow })),
    ],
  };
}
