import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GateLab } from "@/components/gate/GateLab";
import { GatePoster } from "@/components/gate/GatePoster";
import { sceneCopy } from "@/components/gate/scene-copy";
import { isLocale } from "@/lib/i18n";
import { getMessages } from "@/lib/messages";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Tuning rig for the gate scene; development builds only. */
export default async function GateLabPage({ params }: { params: Promise<{ lang: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const { gate } = getMessages(lang);

  return (
    <main>
      <GateLab square={sceneCopy(lang)}>
        <GatePoster alt={gate.posterAlt} />
        <div className="sr-only">
          <h1 id="gate-heading">{gate.heading}</h1>
        </div>
      </GateLab>
    </main>
  );
}
