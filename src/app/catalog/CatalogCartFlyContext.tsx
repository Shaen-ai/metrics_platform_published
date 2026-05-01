"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

type CatalogCartFlyContextValue = {
  cartIconTargetRef: RefObject<HTMLSpanElement | null>;
  bumpKey: number;
  bumpCartFab: () => void;
};

const CatalogCartFlyContext = createContext<CatalogCartFlyContextValue | null>(null);

export function CatalogCartFlyProvider({ children }: { children: React.ReactNode }) {
  const cartIconTargetRef = useRef<HTMLSpanElement | null>(null);
  const [bumpKey, setBumpKey] = useState(0);
  const bumpCartFab = useCallback(() => setBumpKey((k) => k + 1), []);

  const value = useMemo(
    () => ({
      cartIconTargetRef,
      bumpKey,
      bumpCartFab,
    }),
    [bumpKey, bumpCartFab],
  );

  return <CatalogCartFlyContext.Provider value={value}>{children}</CatalogCartFlyContext.Provider>;
}

export function useCatalogCartFly(): CatalogCartFlyContextValue {
  const ctx = useContext(CatalogCartFlyContext);
  if (!ctx) {
    throw new Error("useCatalogCartFly must be used within CatalogCartFlyProvider");
  }
  return ctx;
}
