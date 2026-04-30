"use client";

import {
  useState,
  useEffect,
  useCallback,
  useContext,
} from "react";
import {
  getTranslation,
  getResolvedLanguage,
  setLanguage as setLangStorage,
  type LanguageCode,
} from "@/lib/translations";
import { PublishedLanguageContext } from "@/contexts/PublishedTenantProvider";

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function useTranslation() {
  const tenantDefault = useContext(PublishedLanguageContext) ?? "en";
  const [lang, setLang] = useState<LanguageCode>(tenantDefault);

  useEffect(() => {
    setLang(getResolvedLanguage(tenantDefault));
  }, [tenantDefault]);

  useEffect(() => {
    const handler = () => setLang(getResolvedLanguage(tenantDefault));
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, [tenantDefault]);

  const t = useCallback(
    (key: string): string => getTranslation(lang, key),
    [lang],
  );

  const changeLang = useCallback(
    (code: LanguageCode) => {
      setLangStorage(code);
      setLang(code);
      notify();
    },
    [],
  );

  return { t, lang, changeLang };
}
