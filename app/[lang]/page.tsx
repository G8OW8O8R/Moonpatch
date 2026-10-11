import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GatePoster } from "@/components/gate/GatePoster";
import { defaultLocale, isLocale, locales } from "@/lib/i18n";
import { getMessages } from "@/lib/messages";

export async function generateMetadata({ params }: PageProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};

  return {
    alternates: {
      canonical: `/${lang}`,
      languages: {
        ...Object.fromEntries(locales.map((locale) => [locale, `/${locale}`])),
        "x-default": `/${defaultLocale}`,
      },
    },
    openGraph: { url: `/${lang}` },
  };
}

export default async function GatePage({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const { gate } = getMessages(lang);

  return (
    <main>
      <section aria-labelledby="gate-heading" className="relative h-svh overflow-hidden bg-bark">
        <GatePoster alt={gate.posterAlt} />
        <div className="sr-only">
          <h1 id="gate-heading">{gate.heading}</h1>
          <p>{gate.intro}</p>
        </div>
      </section>
    </main>
  );
}
