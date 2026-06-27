"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type Locale = "en" | "ru";

interface Translations {
  [key: string]: string | Translations;
}

interface I18nContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextType>({
  locale: "en",
  setLocale: () => {},
  t: (key: string) => key,
});

function getNested(obj: Translations, path: string): string {
  const keys = path.split(".");
  let current: Translations | string = obj;
  for (const k of keys) {
    if (typeof current !== "object" || current === null) return path;
    current = current[k];
  }
  return typeof current === "string" ? current : path;
}

export function I18nProvider({
  children,
  initialLocale,
  messages,
}: {
  children: ReactNode;
  initialLocale: Locale;
  messages: Record<Locale, Translations>;
}) {
  const [locale, setLocale] = useState<Locale>(initialLocale);

  const t = useCallback(
    (key: string) => {
      const localeMessages = messages[locale];
      if (!localeMessages) return key;
      const result = getNested(localeMessages, key);
      return result !== key ? result : getNested(messages["en"] || {}, key);
    },
    [locale, messages],
  );

  const switchLocale = useCallback((l: Locale) => {
    setLocale(l);
    try { localStorage.setItem("locale", l); } catch {}
  }, []);

  return (
    <I18nContext.Provider value={{ locale, setLocale: switchLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useT() {
  return useContext(I18nContext);
}
