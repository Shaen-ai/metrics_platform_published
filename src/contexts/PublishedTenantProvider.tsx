"use client";

import {
  createContext,
  useContext,
  useLayoutEffect,
  type ReactNode,
} from "react";
import { useStore } from "@/lib/store";
import type { Admin } from "@/lib/types";
import type { LanguageCode } from "@/lib/translations";

/** Server-resolved tenant (available before client fetch completes). */
const TenantBootstrapContext = createContext<Admin | null>(null);

/** Language hint from SSR (cookie ↔ admin.language). */
export const PublishedLanguageContext =
  createContext<LanguageCode>("en");

export function useResolvedAdmin(): Admin | null {
  const bootstrap = useContext(TenantBootstrapContext);
  const storeAdmin = useStore((s) => s.admin);
  return storeAdmin ?? bootstrap;
}

function TenantStoreSeed({
  bootstrapAdmin,
  children,
}: {
  bootstrapAdmin: Admin | null;
  children: ReactNode;
}) {
  /** Mirror bootstrap into Zustand so async codepaths that read useStore still see tenant until fetch finishes. */
  useLayoutEffect(() => {
    if (bootstrapAdmin) {
      useStore.setState({ admin: bootstrapAdmin });
    }
  }, [bootstrapAdmin]);
  return <>{children}</>;
}

export function PublishedTenantProvider({
  bootstrapAdmin,
  initialLang,
  children,
}: {
  bootstrapAdmin: Admin | null;
  initialLang: LanguageCode;
  children: ReactNode;
}) {
  return (
    <PublishedLanguageContext.Provider value={initialLang}>
      <TenantBootstrapContext.Provider value={bootstrapAdmin}>
        <TenantStoreSeed bootstrapAdmin={bootstrapAdmin}>{children}</TenantStoreSeed>
      </TenantBootstrapContext.Provider>
    </PublishedLanguageContext.Provider>
  );
}
