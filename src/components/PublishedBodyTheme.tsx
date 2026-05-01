"use client";

import { useLayoutEffect } from "react";
import { useResolvedAdmin } from "@/contexts/PublishedTenantProvider";
import {
  applyCssVariablesToElement,
  getPublishedThemeBodyStyle,
} from "@/app/site-designs/registry";

/** Keeps document.body semantic tokens in sync with resolved tenant (after client fetch / persist). */
export function PublishedBodyTheme() {
  const admin = useResolvedAdmin();

  useLayoutEffect(() => {
    applyCssVariablesToElement(document.body, getPublishedThemeBodyStyle(admin));
  }, [admin]);

  return null;
}
