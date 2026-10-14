import { preload } from "react-dom";
import { JsonLd } from "@/components/ui/JsonLd";
import type { Locale } from "@/lib/i18n";
import { getMessages } from "@/lib/messages";
import { SOFT_POSTER, openedBoardFile, openedBoardSrcSet } from "@/lib/square-poster";
import { openedBoardSizes } from "@/lib/square-props";
import { type RoomId, isRoomId } from "@/lib/rooms";
import { siteUrl } from "@/lib/site";
import { buildingData, storeData } from "@/lib/structured-data";
import { GatePoster } from "./GatePoster";
import { Intro } from "./Intro";
import { decideIntro } from "./intro-stage";
import { GateScene } from "./GateScene";
import { sceneCopy } from "./scene-copy";

/**
 * The gate, the ride, the square and the buildings, as one server-rendered
 * page. The Visit address renders the same page opened on the notice board,
 * and each building's address opens it inside that building, so what is seen
 * first is in the HTML from the first byte.
 */
export function FarmFront({ lang, initialView = "gate" }: { lang: Locale; initialView?: "gate" | "visit" | RoomId }) {
  const { gate, square, meta } = getMessages(lang);
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

  const structured = isRoomId(initialView)
    ? buildingData(initialView, lang, siteUrl(), meta.siteName)
    : storeData(lang, siteUrl(), { name: meta.siteName, description: meta.description });

  return (
    <main>
      <JsonLd data={structured} />
      {/* The opening plays only at the gate; a building or the board opens on itself. */}
      {initialView === "gate" && (
        <>
          <script dangerouslySetInnerHTML={{ __html: decideIntro }} />
          <Intro />
        </>
      )}
      <GateScene
        labelledBy="gate-heading"
        initialView={initialView}
        square={sceneCopy(lang)}
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
