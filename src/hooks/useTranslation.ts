"use client";

import { useState, useEffect, useCallback } from "react";
import { getTranslation, getLanguage, setLanguage as setLangStorage, type LanguageCode } from "@/lib/translations";

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function useTranslation() {
  const [lang, setLang] = useState<LanguageCode>("en");

  useEffect(() => {
    setLang(getLanguage());
    const handler = () => setLang(getLanguage());
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  const t = useCallback(
    (key: string): string => getTranslation(lang, key),
    [lang],
  );

  const changeLang = useCallback((code: LanguageCode) => {
    setLangStorage(code);
    setLang(code);
    notify();
  }, []);

  return { t, lang, changeLang };
}
