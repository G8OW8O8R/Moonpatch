import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import { format, type Messages } from "@/lib/messages";
import { Icon } from "./Icon";
import { LanguageSwitch } from "./LanguageSwitch";

const MOONS_TOTAL = 4;

function Dot({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`select-none ${className}`}>
      •
    </span>
  );
}

export function SiteHeader({ lang, t }: { lang: Locale; t: Messages["header"] }) {
  const moonsFound = 0;
  const basketCount = 0;

  return (
    <header className="site-header pointer-events-none fixed inset-x-0 top-0 z-30 flex items-start justify-between gap-4 px-gutter pt-gutter">
      {/* Not prefetched: the gate's page asks for its poster up front, which elsewhere would compete with what is on screen. */}
      <Link
        href={`/${lang}`}
        prefetch={false}
        aria-label={t.home}
        className="wordmark-link pointer-events-auto block shrink-0 rounded-sm drop-shadow-hug"
      >
        <span aria-hidden="true" className="wordmark block" />
      </Link>

      <div className="status-row pointer-events-auto flex flex-wrap items-center justify-end gap-x-2.5 gap-y-1 text-header font-medium text-shadow-hug tabular-nums sm:flex-nowrap sm:gap-x-3.5">
        <LanguageSwitch current={lang} label={t.language} />

        {/* On phones the sound switch drops to a quiet second line under the counters. */}
        <span className="flex items-center gap-x-2.5 max-sm:order-last max-sm:basis-full max-sm:justify-end sm:gap-x-3.5">
          <Dot className="max-sm:hidden" />
          <span className="flex items-center gap-1.5">
            <Icon name="sound-off" className="drop-shadow-hug" />
            <span aria-hidden="true">{t.sound}</span>
            <span className="sr-only">{t.soundOff}</span>
          </span>
        </span>

        <Dot />
        <span className="flex items-center gap-1.5">
          <Icon name="moon" className="drop-shadow-hug" />
          <span aria-hidden="true">
            {moonsFound}/{MOONS_TOTAL}
          </span>
          <span className="sr-only">{format(t.moons, { found: moonsFound, total: MOONS_TOTAL })}</span>
        </span>

        <Dot />
        <span className="flex items-center gap-1.5">
          <Icon name="wheelbarrow" className="drop-shadow-hug" />
          <span aria-hidden="true">{basketCount}</span>
          <span className="sr-only">{format(t.basket, { count: basketCount })}</span>
        </span>
      </div>
    </header>
  );
}
