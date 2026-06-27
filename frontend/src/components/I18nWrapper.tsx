"use client";

import { I18nProvider, type Locale } from "@/lib/i18n";
import en from "@/locales/en.json";
import ru from "@/locales/ru.json";
import type { ReactNode } from "react";

const messages = { en, ru };

function getInitialLocale(): Locale {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("locale");
      if (stored === "ru" || stored === "en") return stored;
    } catch {}
  }
  return "ru";
}

export default function I18nWrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider initialLocale={getInitialLocale()} messages={messages}>
      {children}
    </I18nProvider>
  );
}
