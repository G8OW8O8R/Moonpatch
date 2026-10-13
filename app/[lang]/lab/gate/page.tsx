import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GateLab } from "@/components/gate/GateLab";
import { GatePoster } from "@/components/gate/GatePoster";
import { isLocale } from "@/lib/i18n";
import { getMessages } from "@/lib/messages";
import { visitCopy } from "@/lib/visit";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Tuning rig for the gate scene; development builds only. */
export default async function GateLabPage({ params }: { params: Promise<{ lang: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const { gate, square, visit, rooms } = getMessages(lang);

  return (
    <main>
      <GateLab square={{ lang, t: square, visit, board: visitCopy(lang), rooms }}>
        <GatePoster alt={gate.posterAlt} />
        <div className="sr-only">
          <h1 id="gate-heading">{gate.heading}</h1>
        </div>
      </GateLab>
    </main>
  );
}
