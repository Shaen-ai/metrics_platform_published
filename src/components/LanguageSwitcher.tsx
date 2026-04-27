"use client";

import { Globe } from "lucide-react";
import { languages } from "@/lib/translations";
import { useTranslation } from "@/hooks/useTranslation";
import { useState, useRef, useEffect } from "react";

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { lang, changeLang } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const current = languages.find((l) => l.code === lang) || languages[0];

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
      >
        <Globe className="w-4 h-4" />
        <span>{current.flag}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[140px] rounded-xl border border-[var(--border)] bg-white shadow-lg py-1">
          {languages.map((l) => (
            <button
              key={l.code}
              onClick={() => { changeLang(l.code); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--muted)] transition-colors ${
                l.code === lang ? "font-semibold text-[var(--primary)]" : "text-[var(--foreground)]"
              }`}
            >
              <span>{l.flag}</span>
              <span>{l.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
