"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type Locale, localeNames, locales, switchLocalePath } from "@/lib/i18n";

export function LanguageSwitch({ current, label }: { current: Locale; label: string }) {
  const pathname = usePathname() ?? `/${current}`;

  return (
    <nav aria-label={label} className="flex items-center gap-1.5">
      {locales.map((locale, index) => {
        const active = locale === current;
        return (
          <span key={locale} className="flex items-center gap-1.5">
            {index > 0 && <span aria-hidden="true">/</span>}
            <Link
              href={switchLocalePath(pathname, locale)}
              hrefLang={locale}
              lang={locale}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "-mx-1 rounded-xs px-1"
                  : "-mx-1 rounded-xs px-1 opacity-90 transition-opacity duration-(--duration-tap) ease-(--ease-out) hover:opacity-100"
              }
            >
              {locale.toUpperCase()}
              <span className="sr-only"> – {localeNames[locale]}</span>
            </Link>
          </span>
        );
      })}
    </nav>
  );
}
