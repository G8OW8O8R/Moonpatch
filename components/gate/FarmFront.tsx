import { preload } from "react-dom";
import type { Locale } from "@/lib/i18n";
import { getMessages } from "@/lib/messages";
import { SOFT_POSTER, openedBoardFile, openedBoardSrcSet } from "@/lib/square-poster";
import { openedBoardSizes } from "@/lib/square-props";
import { visitCopy } from "@/lib/visit";
import { GatePoster } from "./GatePoster";
import { GateScene } from "./GateScene";

/**
 * The gate, the ride and the square, as one server-rendered page. The Visit
 * address renders the same page opened on the notice board, so its copy is
 * in the HTML from the first byte.
 */
export function FarmFront({ lang, initialView = "gate" }: { lang: Locale; initialView?: "gate" | "visit" }) {
  const { gate, square, visit, rooms } = getMessages(lang);
  // Opened on the board, the board is the first thing seen.
  if (initialView === "visit") {
    preload(openedBoardFile(1160, "avif"), {
      as: "image",
      type: "image/avif",
      imageSrcSet: openedBoardSrcSet("avif"),
      imageSizes: openedBoardSizes(),
      fetchPriority: "high",
    });
    // The square out of focus behind it: a few kilobytes, wanted in the same first frame.
    preload(SOFT_POSTER.src, { as: "image", type: "image/webp", fetchPriority: "high" });
  }

  return (
    <main>
      <GateScene
        labelledBy="gate-heading"
        initialView={initialView}
        square={{ lang, t: square, visit, board: visitCopy(lang), rooms }}
      >
        <GatePoster alt={gate.posterAlt} priority={initialView === "gate"} />
        <div className="sr-only">
          <h1 id="gate-heading">{gate.heading}</h1>
          <p>{gate.intro}</p>
          <h2>{square.heading}</h2>
          <p>{square.intro}</p>
        </div>
      </GateScene>
    </main>
  );
}
