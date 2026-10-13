import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GatePoster } from "@/components/gate/GatePoster";
import { TransitionLab } from "@/components/gate/TransitionLab";
import { isLocale } from "@/lib/i18n";
import { getMessages } from "@/lib/messages";
import { visitCopy } from "@/lib/visit";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Tuning rig for the move between the square and the buildings; development builds only. */
export default async function TransitionLabPage({ params }: { params: Promise<{ lang: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const { gate, square, visit, rooms } = getMessages(lang);

  return (
    <main>
      <TransitionLab square={{ lang, t: square, visit, board: visitCopy(lang), rooms }}>
        <GatePoster alt={gate.posterAlt} />
        <div className="sr-only">
          <h1 id="gate-heading">{gate.heading}</h1>
        </div>
      </TransitionLab>
    </main>
  );
}
