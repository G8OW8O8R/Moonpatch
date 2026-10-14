"use client";

import "lenis/dist/lenis.css";
import { usePathname } from "next/navigation";
import { type MouseEvent, type PointerEvent, type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { ProductCard } from "@/components/product/ProductCard";
import { RoomSeeds, type SeedOpen } from "@/components/product/RoomSeeds";
import { RoomPlate, RoomUi } from "@/components/room/RoomView";
import { type DoorParams, defaultDoor } from "@/lib/door-rig";
import { type RigParams, defaultRig } from "@/lib/gate-rig";
import type { Locale } from "@/lib/i18n";
import type { Messages } from "@/lib/messages";
import { ROOM_REST_ZOOM, roomBox } from "@/lib/plate-box";
import { type Pan, dragLook, flickVelocity, glide, pans } from "@/lib/room-pan";
import { ROOMS, ROOM_ROW, type RoomId, isRoomId } from "@/lib/rooms";
import { placeAt, placePath } from "@/lib/routes";
import { type ArmId, propsOnScreen } from "@/lib/square-props";
import { DUSK, type Track, defaultTrack, trackAt, trackEnd, trackLength } from "@/lib/square-rig";
import { SPOT_KEY, readSpot, spotToKeep, startAt, writeSpot } from "@/lib/square-spot";
import type { VisitCopy } from "@/lib/visit";
import { publishLenis } from "@/components/ui/lenis-channel";
import { SquareDriver } from "@/components/square/driver";
import { drawArmLabels } from "@/components/square/labels";
import { SquareOverlay, type SquareOverlayHandle } from "@/components/square/SquareOverlay";
import { VisitBackdrop, placeBackdrop } from "@/components/square/VisitBackdrop";
import { VisitPanel, openedBoardPicture } from "@/components/square/VisitPanel";
import { warmSquare } from "@/components/square/warm";
import type { DoorSeek, ScenePlace } from "./renderer/engine";
import type { FrameStats } from "./renderer/GateRenderer";
import { type SquareState, restingSquare } from "./renderer/SquareRenderer";
import type { GateController } from "./renderer/start";

type Mode = "poster" | "webgl" | "fallback";

export interface GateDebugState {
  mode: Mode;
  reason: string;
  progress: number;
  stats: FrameStats;
}

export interface SquareCopy {
  lang: Locale;
  t: Messages["square"];
  visit: Messages["visit"];
  board: VisitCopy;
  rooms: Messages["rooms"];
  product: Messages["product"];
  /** Page titles of the places the scene moves to by itself. */
  titles: Record<"square" | RoomId, string>;
}

export interface GateSceneProps {
  /** The poster and the screen-reader copy, rendered on the server. */
  children: ReactNode;
  labelledBy: string;
  square: SquareCopy;
  /** Open on the notice board or inside a building (their own addresses) instead of at the gate. */
  initialView?: "gate" | "visit" | RoomId;
  /** Lengths of the scroll, in viewport heights. */
  track?: Track;
  params?: RigParams;
  /** The camera between the square and the buildings. */
  door?: DoorParams;
  /** Development only: hold a move at one moment. */
  seek?: DoorSeek | null;
  /** Frame times of each move to or from a building, ms. */
  onJourney?: (frames: number[]) => void;
  onDebug?: (state: GateDebugState) => void;
}

interface ScrollLock {
  stop(): void;
  start(): void;
  destroy(): void;
}

/**
 * Runs `task` once the page has loaded and the browser is idle, `after` ms past the load at the
 * earliest; the visitor's first touch, click or key brings it forward. Returns a cancel.
 */
const whenIdle = (task: () => void, after = 0): (() => void) => {
  let done = false;
  let timer = 0;
  const once = () => {
    if (done) return;
    done = true;
    stop();
    task();
  };
  const idle = () => ("requestIdleCallback" in window ? window.requestIdleCallback(once, { timeout: 1500 }) : setTimeout(once, 200));
  const run = () => (after ? (timer = window.setTimeout(idle, after)) : idle());
  const early = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
  const stop = () => {
    window.clearTimeout(timer);
    window.removeEventListener("load", run);
    for (const type of early) window.removeEventListener(type, once, true);
  };
  if (after) for (const type of early) window.addEventListener(type, once, { capture: true, passive: true });
  if (document.readyState === "complete") run();
  else window.addEventListener("load", run, { once: true });
  return () => {
    done = true;
    stop();
  };
};

/**
 * Opened on the board's address, the board is all there is to see: the page shows it on its own
 * first, and the scene (and the square's own pictures) come this long after the page has loaded.
 */
const BOARD_SCENE_DELAY = 2500;

/** Development only: ?layer=gate|plate holds one renderer, for frame-by-frame comparison. */
const debugLayer = (): { debugLayer?: "gate" | "plate" } => {
  if (process.env.NODE_ENV === "production") return {};
  const layer = new URLSearchParams(window.location.search).get("layer");
  return layer === "gate" || layer === "plate" ? { debugLayer: layer } : {};
};

const prefersReduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Canvases already handed to a scene. A canvas gives its control away once; one that is still in
 * the page when the scene starts again (a hot reload, a component shown again) is swapped for a new one.
 */
const startedCanvases = new WeakSet<HTMLCanvasElement>();

/** Buildings the camera flies into; the others still open on their own pages. */
const ROOMS_IN_SCENE: ReadonlySet<RoomId> = new Set<RoomId>(["cafe", "barn", "haunt"]);

/** Set once a scene has left the page for another place on the farm: coming back to one is a return. */
let sceneLeft = false;

/** A way back (a move inside the site, the browser's back or forward), rather than a reload or a fresh visit? */
const isReturning = () => {
  const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (entry?.type === "back_forward") return true;
  // A page reached by a move inside the site is not the document's own address.
  const documentPath = entry ? new URL(entry.name).pathname : window.location.pathname;
  return sceneLeft || documentPath !== window.location.pathname;
};

/** Where the address the visitor is on was pushed from, if it was the scene that pushed it. */
const cameFrom = (): unknown => {
  const state: unknown = window.history.state;
  return state && typeof state === "object" && "from" in state ? (state as { from: unknown }).from : undefined;
};

/** A plain click, the kind the scene may take over from a link. */
const plainClick = (event: MouseEvent) => event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

/** The hint about looking around goes for the rest of the visit once the visitor has done it. */
const SWIPED_KEY = "moonpatch:swiped";

const swiped = () => {
  try {
    return window.sessionStorage.getItem(SWIPED_KEY) === "1";
  } catch {
    return false;
  }
};

/** Screens that look around a room by touch: the room runs well past their sides. */
const NARROW_TOUCH = "(pointer: coarse) and (aspect-ratio < 1.55)";
const isNarrowTouch = () => window.matchMedia(NARROW_TOUCH).matches;
const watchNarrowTouch = (onChange: () => void) => {
  const query = window.matchMedia(NARROW_TOUCH);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const watchNothing = () => () => undefined;
const never = () => false;

/** The stage's size, CSS px. */
const sizeOf = (el: HTMLElement | null) => (el ? { width: el.clientWidth, height: el.clientHeight } : { width: window.innerWidth, height: window.innerHeight });

const storedSpot = () => {
  try {
    return readSpot(window.sessionStorage.getItem(SPOT_KEY));
  } catch {
    return null;
  }
};

/**
 * The farm's front page in one scroll: the gate opens, the ride goes through
 * it onto the square, dusk falls over the square, and a last stretch pushes
 * in. The server-rendered poster is the first frame; the WebGL scene loads
 * after it and takes over invisibly, and draws the square from the very
 * texture the ride lands on. Without WebGL2, on a slow device or with
 * reduced motion, the square is plain HTML and dusk is a short crossfade.
 */
export function GateScene({
  children,
  labelledBy,
  square,
  initialView = "gate",
  track = defaultTrack,
  params = defaultRig,
  door = defaultDoor,
  seek = null,
  onJourney,
  onDebug,
}: GateSceneProps) {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<SquareOverlayHandle>(null);
  const backdrop = useRef<HTMLImageElement>(null);
  const controller = useRef<GateController | null>(null);
  const driver = useRef<SquareDriver | null>(null);
  const progress = useRef(0);
  /** Scroll into the section, in viewport heights: the spot to come back to. */
  const scrolled = useRef(0);
  /** Where this visit starts (decided once, before the first paint). */
  const startedAt = useRef<number | null>(null);
  /**
   * The page started on the square: it is simply there, a cut, with no fade
   * over the gate poster beneath. Lasts until the visitor first scrolls.
   */
  const [cut, setCut] = useState(initialView !== "gate");
  /** Opened on a building's own address: the scene starts inside it. */
  const startRoom = isRoomId(initialView) ? initialView : null;
  /** The scene has its first frame; it is shown once it can draw the square, if that is where the page is. */
  const engineReady = useRef(false);
  const paramsRef = useRef(params);
  const doorRef = useRef(door);
  const onJourneyRef = useRef(onJourney);
  /**
   * The building the camera has come to rest in (its copy is shown), and the one it is in from the
   * cut on. Nothing React renders changes while a move plays: the page only touches the DOM then.
   */
  const [inside, setInside] = useState<RoomId | null>(startRoom);
  const insideRef = useRef<RoomId | null>(startRoom);
  /** The building the page last came to rest in (the cut moves `insideRef` on before the page follows). */
  const restedIn = useRef<RoomId | null>(startRoom);
  /** On the way into a building, inside it, or on the way out: the square's own layer stands aside. */
  const awayRef = useRef(!!startRoom);
  /** Where the page is, or is on its way to. */
  const placeRef = useRef<ScenePlace>(startRoom ?? "square");
  /** Where the scene has come to rest (null: not yet, when it starts inside a building). */
  const canvasPlace = useRef<ScenePlace | null>(startRoom ? null : "square");
  /** Opened inside a building, the square's own pictures wait until the scene starts or the visitor leaves. */
  const [squareWarm, setSquareWarm] = useState(!startRoom);
  /** The page has come to rest somewhere other than where it opened: a room seen from now on fades in. */
  const [settledInPage, setSettledInPage] = useState(false);
  const roomPlate = useRef<HTMLDivElement>(null);
  const roomSeeds = useRef<HTMLDivElement>(null);
  /** The product card open in the room, and the seed it opened out of. */
  const [card, setCard] = useState<SeedOpen | null>(null);
  const cardOpen = useRef(false);
  const roomHeading = useRef<HTMLHeadingElement>(null);
  /** What takes the focus once the page has caught up with a move: the room's name, or the arm of the building left. */
  const focusNext = useRef<"room" | RoomId | null>(null);
  /** Looking around a room on a narrow screen. */
  const pan = useRef<Pan>({ look: startRoom ? ROOMS[startRoom].look : 0.5, velocity: 0 });
  const lookStart = useRef(startRoom ? ROOMS[startRoom].look : 0.5);
  const drag = useRef<{ id: number; x: number; t: number; v: number; moved: number } | null>(null);
  const glideFrame = useRef(0);
  /** The hint about looking around: narrow touch screens, until the visitor has done it once. */
  const narrowTouch = useSyncExternalStore(watchNarrowTouch, isNarrowTouch, never);
  const swipedBefore = useSyncExternalStore(watchNothing, swiped, never);
  const [swipedHere, setSwipedHere] = useState(false);
  const swipeNoted = useRef(false);
  const hint = !!inside && narrowTouch && !swipedBefore && !swipedHere;
  /** A move to or from a building is playing: nothing may render on the page until it lands. */
  const moving = useRef(false);
  const squareLayer = useRef<HTMLDivElement>(null);
  const roomLayer = useRef<HTMLDivElement>(null);
  const trackRef = useRef(track);
  const [mode, setMode] = useState<Mode>("poster");
  const [reason, setReason] = useState("");
  const [pastHalf, setPastHalf] = useState(false);
  const [moved, setMoved] = useState(false);
  const [restart, setRestart] = useState(0);
  const [stats, setStats] = useState<FrameStats>({ fps: 0, quality: 0 });
  const latestStats = useRef<FrameStats>({ fps: 0, quality: 0 });
  const debugging = !!onDebug;
  /** The scene's frame rate, for the lab only, and never shown in the middle of a move. */
  const reportStats = useCallback((next: FrameStats) => {
    latestStats.current = next;
    if (debugging && !moving.current) setStats(next);
  }, [debugging]);
  const [debugProgress, setDebugProgress] = useState(0);
  const [arrived, setArrived] = useState(false);
  /** The board was opened from the square in this visit (not arrived on at its own address). */
  const [openedInPage, setOpenedInPage] = useState(false);
  const lenis = useRef<ScrollLock | null>(null);
  const modeRef = useRef<Mode>("poster");
  const rideTarget = useRef<0 | 1>(0);
  /** Where the scroll wants the ride; it only plays back once the square is back on its first frame. */
  const rideWanted = useRef<0 | 1>(0);
  const rideAt = useRef<0 | 1>(0);
  const squareReady = useRef(false);
  const holdTimer = useRef(0);
  const openedHere = useRef(false);
  const arrivedOnBoard = useRef(initialView === "visit");
  /**
   * The opened board's lettering (and, for the plain-HTML square, its image) is fetched while the
   * visitor is still on the square, so opening it never waits on it.
   */
  const boardWarmed = useRef(false);
  const boardImage = useRef<HTMLImageElement | null>(null);
  /** The signpost's lettering, for readying the plain-HTML square. */
  const signpost = useRef({ labels: square.t.arms, lang: square.lang });

  const pathname = usePathname();
  const here = placeAt(pathname ?? "")?.place;
  const boardOpen = here === "visit";
  const room = isRoomId(here) && ROOMS_IN_SCENE.has(here) ? here : null;
  const boardOpenRef = useRef(boardOpen);

  /** Over the opened board and inside a building the page holds still. */
  const heldStill = useCallback(() => boardOpenRef.current || placeRef.current !== "square", []);

  // While the timed ride plays, the page holds still inside the section; it lets go when the ride lands.
  const release = useCallback(() => {
    window.clearTimeout(holdTimer.current);
    holdTimer.current = 0;
    if (!heldStill()) lenis.current?.start();
  }, [heldStill]);
  const hold = useCallback(() => {
    lenis.current?.stop();
    window.clearTimeout(holdTimer.current);
    // Never hold on for good, even if the scene goes quiet.
    holdTimer.current = window.setTimeout(release, paramsRef.current.rideDuration * 1000 + 600);
  }, [release]);

  const sendRide = useCallback(
    (target: 0 | 1) => {
      if (target === rideTarget.current) return;
      rideTarget.current = target;
      controller.current?.setRide(target);
      if (modeRef.current === "webgl") hold();
    },
    [hold],
  );

  /** Props stand on the square once the ride has landed and the scene can draw them (or at once in HTML). */
  const syncProps = useCallback((jump = false) => {
    const d = driver.current;
    if (!d) return;
    const webgl = modeRef.current === "webgl";
    const onSquare = webgl ? rideAt.current === 1 && rideWanted.current === 1 && squareReady.current : progress.current >= 0.5;
    d.showProps(onSquare || boardOpenRef.current, jump);
    // Inside a building the square's own pictures wait: the room comes first, the scene readies them later.
    if (placeRef.current !== "square") return;
    // The scene paints the opened board itself; only the plain-HTML square needs its image.
    if (onSquare && !webgl && !boardImage.current) {
      const img = openedBoardPicture();
      void img.decode().catch(() => undefined);
      boardImage.current = img;
    }
    // The square as plain HTML, ready for any way back onto it.
    // Out on the square (not behind a board opened on its own address, which readies them later).
    const out = onSquare && !boardOpenRef.current;
    if (out) warmSquare(signpost.current);
    if (out && !boardWarmed.current) {
      boardWarmed.current = true;
      // The board's lettering, so its first layout never waits on a font.
      const css = getComputedStyle(document.documentElement);
      for (const font of [`600 24px ${css.getPropertyValue("--font-fraunces")}`, `500 20px ${css.getPropertyValue("--font-caveat")}`]) {
        void document.fonts.load(font).catch(() => undefined);
      }
    }
  }, []);

  const showCanvas = useCallback(() => {
    if (!engineReady.current || modeRef.current === "webgl") return;
    const place = placeRef.current;
    // Inside, the canvas waits until it shows the room at rest; until then the room's picture stands.
    if (place !== "square" && canvasPlace.current !== place) return;
    // On the square, the canvas waits for the square's own layers; until then the plain one stands.
    if (place === "square" && rideWanted.current === 1 && !squareReady.current) return;
    setMode("webgl");
    setReason("");
  }, []);

  const measure = useCallback(() => {
    const el = section.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // The pinned stage is a fixed 100lvh, unlike innerHeight, which jumps as a phone's toolbar hides.
    const unit = stage.current?.clientHeight ?? window.innerHeight;
    scrolled.current = -rect.top / unit;
    const at = trackAt(scrolled.current, trackRef.current);
    progress.current = at.gate;
    controller.current?.setProgress(at.gate);
    driver.current?.follow(at.dusk, at.wander);
    // Crossing the threshold plays the ride forwards; coming back above it plays it back,
    // once dusk has lifted again (the ride only knows the golden square).
    const wanted = at.gate >= paramsRef.current.threshold ? 1 : 0;
    if (wanted !== rideWanted.current) {
      rideWanted.current = wanted;
      syncProps();
      showCanvas();
    }
    if (wanted === 1 || driver.current?.atStart !== false) sendRide(wanted);
    setPastHalf(at.gate >= 0.5);
    // The cut is the first frame only: from the first move on, the scene moves as it always does.
    if (startedAt.current !== null && Math.abs(scrolled.current - startedAt.current) > 0.01) setCut(false);
    if (at.gate > 0) setMoved(true);
    if (onDebug) setDebugProgress(at.gate);
  }, [onDebug, sendRide, syncProps, showCanvas]);

  useEffect(() => {
    paramsRef.current = params;
    controller.current?.setParams(params);
  }, [params]);

  useEffect(() => {
    trackRef.current = track;
    measure();
  }, [track, measure]);

  useEffect(() => {
    onDebug?.({ mode, reason, progress: debugProgress, stats });
  }, [onDebug, mode, reason, debugProgress, stats]);

  // The square's own motion, on this thread: every frame goes to the canvas and to the page's layer.
  // Laid out before the first paint, so the start below can already place it.
  useLayoutEffect(() => {
    const d = new SquareDriver({
      reduced: prefersReduced(),
      onFrame: (state: SquareState) => {
        const webgl = modeRef.current === "webgl";
        if (webgl) controller.current?.setSquare(state);
        const el = stage.current;
        // Before the scene is ready this layer stands in for it, framed as it will be; the fallback holds still.
        const size = el && { width: el.clientWidth, height: el.clientHeight };
        const plate = size && overlay.current?.update(state, size, webgl, modeRef.current !== "fallback");
        // Arrived on the board's address it stands where the camera rests on the board from the very first
        // frame; opened from the square, it comes in with the camera.
        if (size && plate && backdrop.current) {
          if (openedHere.current) placeBackdrop(backdrop.current, plate, state.visit);
          else placeBackdrop(backdrop.current, propsOnScreen(size, { dusk: 1, wander: 1, visit: 1 }, { pan: false }).plate, 1);
        }
        // Paper type once the sky has darkened, over the opened board and inside the buildings.
        const header = insideRef.current || state.dusk >= DUSK.header || state.visit > 0 ? "paper" : "ink";
        if (section.current && section.current.dataset.header !== header) section.current.dataset.header = header;
        setArrived(boardOpenRef.current && state.visit >= 0.999);
        // A ride back that waited for dusk to lift can go now.
        if (rideWanted.current === 0 && rideTarget.current === 1 && d.atStart) sendRide(0);
      },
    });
    driver.current = d;
    return () => {
      d.dispose();
      driver.current = null;
    };
  }, [sendRide]);

  // Scroll: smoothed wheel on desktop, native on touch, none of it under reduced motion.
  useEffect(() => {
    let cancelled = false;
    if (!prefersReduced()) {
      void import("lenis").then(({ default: Lenis }) => {
        if (cancelled) return;
        const instance = new Lenis({ autoRaf: true, smoothWheel: true, syncTouch: false });
        lenis.current = instance;
        if (heldStill()) instance.stop();
        publishLenis(instance);
      });
    }
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      cancelled = true;
      window.clearTimeout(holdTimer.current);
      if (lenis.current) publishLenis(null);
      lenis.current?.destroy();
      lenis.current = null;
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [measure, heldStill]);

  // Where the page starts is decided here, never by the browser: a reload or a fresh visit starts on
  // the closed gate (the poster's own frame); the way back from a building lands on the spot the
  // visitor left, the ride over; the board's address and #square start where the square comes to rest.
  // Before the first paint, so not even one frame of the gate shows on the way back.
  useLayoutEffect(() => {
    try {
      window.history.scrollRestoration = "manual";
    } catch {
      // Without it the browser may restore a spot of its own; the scroll below still wins.
    }
    if (startedAt.current === null) {
      const square = window.location.hash === "#square";
      startedAt.current = startAt({ board: initialView !== "gate", square, returning: isReturning(), spot: storedSpot() }, trackRef.current);
      // #square only says where to start: a reload of the address is a fresh visit.
      if (square) window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    }
    const at = startedAt.current;
    const el = section.current;
    if (!el) return;
    const unit = stage.current?.clientHeight ?? window.innerHeight;
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: at > 0 ? top + at * unit : 0, behavior: "instant" });
    measure();
    if (at === 0) return;
    const land = trackAt(at, trackRef.current);
    rideWanted.current = 1;
    syncProps(true);
    driver.current?.follow(land.dusk, land.wander, true);
    // The header and the square's layer are set in this very commit: no frame shows the server's gate state.
    driver.current?.draw();
    setCut(true);
    // Inside a building nothing scrolls.
    if (placeRef.current !== "square") document.documentElement.style.overflow = "hidden";
  }, [initialView, measure, syncProps]);

  // The spot on the square is kept for the way back, as the scene leaves the page or the tab.
  useEffect(() => {
    const remember = () => {
      try {
        const spot = spotToKeep(scrolled.current, trackRef.current);
        if (spot === null) window.sessionStorage.removeItem(SPOT_KEY);
        else window.sessionStorage.setItem(SPOT_KEY, writeSpot(spot));
      } catch {
        // No storage: the way back starts afresh.
      }
    };
    window.addEventListener("pagehide", remember);
    return () => {
      window.removeEventListener("pagehide", remember);
      sceneLeft = true;
      remember();
    };
  }, []);

  // The board opens with its address: the camera flies onto it, the page holds still beneath it.
  useEffect(() => {
    boardOpenRef.current = boardOpen;
    const d = driver.current;
    if (!d) return;
    if (boardOpen) {
      // Arriving on the board's address, it is simply open; opened from up by the gate, the square comes to rest first.
      const jump = arrivedOnBoard.current || progress.current < paramsRef.current.threshold;
      arrivedOnBoard.current = false;
      if (jump) {
        const el = section.current;
        const unit = stage.current?.clientHeight ?? window.innerHeight;
        if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + trackEnd(trackRef.current) * unit, behavior: "instant" });
        measure();
        d.follow(1, 1, true);
      }
      syncProps(jump);
      d.openBoard(true, jump);
      lenis.current?.stop();
    } else {
      d.openBoard(false);
      if (!holdTimer.current && !heldStill()) lenis.current?.start();
    }
  }, [boardOpen, measure, syncProps, heldStill]);

  const openBoard = useCallback(() => {
    openedHere.current = true;
    setOpenedInPage(true);
    window.history.pushState(null, "", placePath(square.lang, "visit"));
  }, [square.lang]);

  const closeBoard = useCallback(() => {
    if (openedHere.current) {
      openedHere.current = false;
      window.history.back();
    } else {
      window.history.replaceState(null, "", placePath(square.lang, "square"));
    }
  }, [square.lang]);

  /** The square's own layer (its buttons and lines) stands aside for a move to a building, or comes back. */
  const showSquareLayer = useCallback((shown: boolean) => {
    awayRef.current = !shown;
    const el = squareLayer.current;
    if (!el) return;
    el.inert = !shown;
    if (shown) delete el.dataset.away;
    else el.dataset.away = "";
  }, []);

  /** The room's own copy (and its picture), hidden the moment the way out begins: its name goes first. */
  const showRoomLayer = useCallback((shown: boolean) => {
    const layer = roomLayer.current;
    if (layer) {
      layer.inert = !shown;
      if (shown) delete layer.dataset.leaving;
      else layer.dataset.leaving = "";
    }
    const plate = roomPlate.current;
    if (plate) {
      plate.inert = !shown;
      plate.style.opacity = shown ? "" : "0";
    }
  }, []);

  /**
   * The page catches up with where the camera now is: inside, the square waits under the room at the
   * end of its path and nothing scrolls; outside, the page scrolls again. The address, the title and
   * the focus follow.
   */
  const settle = useCallback(
    (place: ScenePlace) => {
      const html = document.documentElement;
      const at = placeAt(window.location.pathname)?.place;
      const left = restedIn.current;
      restedIn.current = place === "square" ? null : place;
      setSettledInPage(true);
      if (place === "square") {
        insideRef.current = null;
        if (section.current) delete section.current.dataset.inside;
        showSquareLayer(true);
        html.style.overflow = "";
        if (!boardOpenRef.current) lenis.current?.start();
        setInside(null);
        setSquareWarm(true);
        // The square's pictures, held back while the page opened inside a building.
        syncProps();
        driver.current?.refresh();
        if (isRoomId(at)) {
          // Came in from the square on this page: the way out is the browser's way back.
          if (cameFrom() === "square") window.history.back();
          else window.history.pushState(null, "", placePath(square.lang, "square"));
        }
        document.title = square.titles.square;
        focusNext.current = left;
        return;
      }
      const el = section.current;
      const unit = stage.current?.clientHeight ?? window.innerHeight;
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + trackEnd(trackRef.current) * unit, behavior: "instant" });
      measure();
      driver.current?.follow(1, 1, true);
      html.style.overflow = "hidden";
      lenis.current?.stop();
      insideRef.current = place;
      if (el) {
        el.dataset.inside = "";
        el.dataset.header = "paper";
      }
      showRoomLayer(true);
      setInside(place);
      if (at !== place) window.history.pushState({ from: at ?? "square" }, "", placePath(square.lang, place));
      document.title = square.titles[place];
      if (left !== place) focusNext.current = "room";
    },
    [measure, showRoomLayer, showSquareLayer, square.lang, square.titles, syncProps],
  );

  /**
   * Goes to a place. With the scene on screen the camera flies there and the page follows once it has
   * landed, so no render of the page falls inside the move; without it the page crossfades, and a
   * scene still loading follows out of sight.
   */
  const goTo = useCallback(
    (place: ScenePlace) => {
      if (place === placeRef.current) return;
      placeRef.current = place;
      if (cardOpen.current) {
        cardOpen.current = false;
        setCard(null);
      }
      controller.current?.setSpot(null);
      cancelAnimationFrame(glideFrame.current);
      drag.current = null;
      const c = controller.current;
      if (modeRef.current === "webgl" && c) {
        showRoomLayer(false);
        if (place !== "square" && !awayRef.current) {
          showSquareLayer(false);
          lenis.current?.stop();
        }
        // A screen above 2× shows the canvas from the first move on; this is one.
        canvas.current?.classList.remove("invisible");
        moving.current = true;
        c.setPlace(place);
        return;
      }
      c?.setPlace(place);
      if (place !== "square") {
        if (!awayRef.current) showSquareLayer(false);
        settle(place);
        return;
      }
      showRoomLayer(false);
      window.setTimeout(() => {
        if (placeRef.current === "square") settle("square");
      }, 150);
    },
    [settle, showRoomLayer, showSquareLayer],
  );

  // The browser's back and forward (and any other change of address) move the camera too, once
  // the address has been taken in.
  useEffect(() => {
    if (boardOpen) return;
    const place = room ?? "square";
    queueMicrotask(() => goTo(place));
  }, [room, boardOpen, goTo]);

  /** The camera has cut across: only the header follows it now, the rest once it has landed. */
  const cutTo = useCallback((place: ScenePlace) => {
    const next = place === "square" ? null : place;
    insideRef.current = next;
    const el = section.current;
    if (next && el) {
      el.dataset.header = "paper";
      el.dataset.inside = "";
    } else {
      if (el) delete el.dataset.inside;
      driver.current?.refresh();
    }
  }, []);

  /** A move has come to rest. On the page's own way there, the page follows; out of sight, the canvas may now be shown. */
  const placed = useCallback(
    (place: ScenePlace) => {
      canvasPlace.current = place;
      if (modeRef.current !== "webgl") {
        showCanvas();
        return;
      }
      // Landed on the way somewhere else: the scene goes on by itself.
      if (place !== placeRef.current) return;
      moving.current = false;
      reportStats(latestStats.current);
      settle(place);
    },
    [reportStats, settle, showCanvas],
  );

  useEffect(() => () => void (document.documentElement.style.overflow = ""), []);

  // Arriving, the room's name takes the focus; back on the square, the arm of the building just left.
  useEffect(() => {
    const target = focusNext.current;
    if (!target) return;
    focusNext.current = null;
    if (target === "room") roomHeading.current?.focus({ preventScroll: true });
    else squareLayer.current?.querySelector<HTMLElement>(`a[href="${placePath(square.lang, target)}"]`)?.focus({ preventScroll: true });
  }, [inside, square.lang]);

  // Each room is first seen where it looks first.
  useEffect(() => {
    cancelAnimationFrame(glideFrame.current);
    if (!inside) return;
    pan.current = { look: ROOMS[inside].look, velocity: 0 };
    lookStart.current = pan.current.look;
  }, [inside]);

  const enterRoom = useCallback(
    (arm: ArmId, event: MouseEvent<HTMLAnchorElement>) => {
      if (!ROOMS_IN_SCENE.has(arm) || !plainClick(event)) return;
      event.preventDefault();
      goTo(arm);
    },
    [goTo],
  );

  const leaveRoom = useCallback(() => goTo("square"), [goTo]);

  const onBack = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (!plainClick(event)) return;
      event.preventDefault();
      leaveRoom();
    },
    [leaveRoom],
  );

  const onNextDoor = useCallback(
    (next: RoomId, event: MouseEvent<HTMLAnchorElement>) => {
      if (!plainClick(event)) return;
      event.preventDefault();
      goTo(next);
    },
    [goTo],
  );

  // Esc leaves a building, or turns the way in around before it lands; the arrow keys walk the
  // corridor to the building next door, in the order they stand on the square.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !boardOpenRef.current && (awayRef.current || placeRef.current !== "square")) leaveRoom();
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.defaultPrevented || boardOpenRef.current) return;
      const here = placeRef.current;
      if (!isRoomId(here)) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable], [role=dialog]")) return;
      const next = ROOM_ROW[ROOM_ROW.indexOf(here) + (event.key === "ArrowRight" ? 1 : -1)];
      if (!next) return;
      event.preventDefault();
      goTo(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [leaveRoom, goTo]);

  /** Looks somewhere else in the room: the scene, and the room's picture where it stands in for it. */
  const lookAt = useCallback((look: number) => {
    pan.current.look = look;
    controller.current?.setLook(look);
    const size = sizeOf(stage.current);
    const by = roomBox(size, ROOM_REST_ZOOM, look).x - roomBox(size, ROOM_REST_ZOOM, lookStart.current).x;
    // The picture standing in for the scene, and the seeds over the products, move with the look.
    for (const el of [roomPlate.current?.querySelector("img"), roomSeeds.current]) {
      if (el) el.style.transform = by ? `translate3d(${by}px, 0, 0)` : "";
    }
  }, []);

  /** A finger on a narrow screen pans the room; a flick carries on and slows to a stop. */
  const touchDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" || !insideRef.current || moving.current || placeRef.current === "square" || !pans(sizeOf(stage.current))) return;
    if ((event.target as Element).closest("a, button")) return;
    cancelAnimationFrame(glideFrame.current);
    pan.current.velocity = 0;
    drag.current = { id: event.pointerId, x: event.clientX, t: event.timeStamp, v: 0, moved: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const touchUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    drag.current = null;
    // A finger that stopped before lifting leaves the room where it is.
    const v = event.timeStamp - d.t > 80 ? 0 : d.v;
    const size = sizeOf(stage.current);
    pan.current.velocity = flickVelocity(size, v);
    if (pan.current.velocity === 0 || prefersReduced()) return;
    let last = performance.now();
    const step = (now: number) => {
      pan.current = glide(size, pan.current, Math.min(0.05, (now - last) / 1000));
      last = now;
      lookAt(pan.current.look);
      if (pan.current.velocity !== 0 && drag.current === null && !moving.current) glideFrame.current = requestAnimationFrame(step);
    };
    glideFrame.current = requestAnimationFrame(step);
  }, [lookAt]);

  /** Inside, a mouse moves the room a little; a finger looks around it. */
  const point = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!insideRef.current) return;
    if (event.pointerType === "mouse") {
      const rect = event.currentTarget.getBoundingClientRect();
      controller.current?.setPointer({ x: ((event.clientX - rect.left) / rect.width) * 2 - 1, y: ((event.clientY - rect.top) / rect.height) * 2 - 1 });
      return;
    }
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    const dx = event.clientX - d.x;
    const dt = Math.max(1, event.timeStamp - d.t);
    d.v = 0.8 * ((dx / dt) * 1000) + 0.2 * d.v;
    d.x = event.clientX;
    d.t = event.timeStamp;
    d.moved += Math.abs(dx);
    lookAt(dragLook(sizeOf(stage.current), pan.current.look, dx));
    if (d.moved > 12 && !swipeNoted.current) {
      swipeNoted.current = true;
      setSwipedHere(true);
      try {
        window.sessionStorage.setItem(SWIPED_KEY, "1");
      } catch {
        // Without storage the hint may come back in the next room.
      }
    }
  }, [lookAt]);
  const unpoint = useCallback(() => controller.current?.setPointer(null), []);

  const spot = useCallback((index: number | null) => controller.current?.setSpot(index), []);
  const openCard = useCallback((open: SeedOpen) => {
    cardOpen.current = true;
    setCard(open);
  }, []);
  const closeCard = useCallback(() => {
    cardOpen.current = false;
    setCard(null);
    controller.current?.setSpot(null);
  }, []);
  const cardSeed = useCallback(
    () => (card ? (roomSeeds.current?.querySelector<HTMLElement>(`[data-product="${card.hotspot.product.id}"]`) ?? null) : null),
    [card],
  );

  useEffect(() => {
    doorRef.current = door;
    controller.current?.setDoor(door);
  }, [door]);

  useEffect(() => {
    onJourneyRef.current = onJourney;
  }, [onJourney]);

  useEffect(() => {
    controller.current?.seek(seek);
  }, [seek]);

  const pointArm = useCallback((arm: ArmId, pointed: boolean) => driver.current?.pointArm(arm, pointed), []);
  const pointBoard = useCallback((pointed: boolean) => driver.current?.pointBoard(pointed), []);

  // The WebGL scene, started once the poster is on screen and the page is idle.
  useEffect(() => {
    const fallBack = (why: string) =>
      queueMicrotask(() => {
        setMode("fallback");
        setReason(why);
      });
    // Both checks are free: no trial context is ever created.
    if (prefersReduced()) return fallBack("reduced motion");
    if (typeof WebGL2RenderingContext === "undefined") return fallBack("no webgl2");
    const canvasEl = canvas.current;
    const stageEl = stage.current;
    const poster = stageEl?.querySelector<HTMLImageElement>("img.gate-poster");
    if (!canvasEl || !stageEl || !poster) return;

    let cancelled = false;
    let visible = true;
    let onscreen = true;
    const sync = () => controller.current?.setActive(visible && onscreen);
    const onVisibility = () => {
      visible = document.visibilityState === "visible";
      sync();
    };
    const intersection = new IntersectionObserver(([entry]) => {
      onscreen = !!entry?.isIntersecting;
      sync();
    });
    const resize = new ResizeObserver(() => {
      // A stage on its way out of the page measures nothing: there is no frame to fit to it.
      if (!stageEl.isConnected || !stageEl.clientWidth || !stageEl.clientHeight) return;
      controller.current?.resize({ width: stageEl.clientWidth, height: stageEl.clientHeight });
    });

    const onBoard = initialView === "visit" && boardOpenRef.current;
    // Opened elsewhere than at the gate, the scene comes in a little after the page has settled.
    const later = onBoard || startRoom !== null;
    const cancelStart = whenIdle(() => {
      if (cancelled) return;
      if (later) {
        warmSquare(signpost.current);
        setSquareWarm(true);
      }
      // Opened on the board, the gate's poster has waited until now; the scene starts from it.
      if (poster.loading === "lazy") poster.loading = "eager";
      void import("./renderer/start").then(({ startGate }) => {
        if (cancelled) return;
        if (startedCanvases.has(canvasEl)) {
          setRestart((n) => n + 1);
          return;
        }
        startedCanvases.add(canvasEl);
        squareReady.current = false;
        engineReady.current = false;
        controller.current = startGate(
          canvasEl,
          poster,
          {
            css: { width: stageEl.clientWidth, height: stageEl.clientHeight },
            params: paramsRef.current,
            door: doorRef.current,
            progress: progress.current,
            square: driver.current?.snapshot() ?? restingSquare,
            place: placeRef.current,
            ...debugLayer(),
          },
          {
            onReady: () => {
              engineReady.current = true;
              showCanvas();
            },
            onFail: (why) => {
              engineReady.current = false;
              controller.current = null;
              setMode("fallback");
              setReason(why);
              // A move cut short by the scene giving up lands at once.
              if (moving.current) {
                moving.current = false;
                settle(placeRef.current);
              }
            },
            onPlateChange: () => {
              engineReady.current = false;
              controller.current?.dispose();
              controller.current = null;
              setMode("poster");
              setRestart((n) => n + 1);
            },
            onStats: reportStats,
            onRideSettled: (ride) => {
              rideAt.current = ride;
              syncProps();
              release();
            },
            onSquareReady: () => {
              squareReady.current = true;
              syncProps();
              showCanvas();
            },
            onCut: cutTo,
            onPlaced: placed,
            onJourney: (frames) => onJourneyRef.current?.(frames),
            onSeeked: (ms) => {
              if (section.current) section.current.dataset.seeked = String(ms);
            },
          },
        );
        // The arms' lettering is set on this thread, where the fonts are.
        void drawArmLabels(square.t.arms, square.lang).then((labels) => {
          for (const [arm, bitmap] of Object.entries(labels) as [ArmId, ImageBitmap][]) {
            if (controller.current && !cancelled) controller.current.setLabel(arm, bitmap);
            else bitmap.close();
          }
        });
        intersection.observe(section.current!);
        resize.observe(stageEl);
        document.addEventListener("visibilitychange", onVisibility);
      });
    }, later ? BOARD_SCENE_DELAY : 0);

    return () => {
      cancelled = true;
      cancelStart();
      intersection.disconnect();
      resize.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      controller.current?.dispose();
      controller.current = null;
    };
  }, [restart, release, syncProps, showCanvas, square.t.arms, square.lang, initialView, startRoom, cutTo, placed, reportStats, settle]);

  // A fresh frame once the canvas is shown; without the scene nothing may hold the page.
  useEffect(() => {
    modeRef.current = mode;
    if (mode === "webgl") {
      controller.current?.setParams(paramsRef.current);
      const d = driver.current;
      if (d) controller.current?.setSquare(d.snapshot());
    } else {
      release();
    }
    syncProps(true);
    // One frame for the layer that now draws the square.
    driver.current?.refresh();
  }, [mode, release, syncProps]);

  // Without WebGL the square is plain HTML, shown once the poster's job is done.
  const htmlSquare = mode !== "webgl" && (mode === "fallback" || pastHalf);

  // The plain-HTML square mounts its images when it takes over: place them at once.
  useEffect(() => {
    if (htmlSquare) driver.current?.refresh();
  }, [htmlSquare]);
  // Above 2× the canvas is drawn at 2× and upscaled, a touch softer than the poster:
  // there it takes over with the first movement, where the difference cannot be seen.
  const canvasShown = mode === "webgl" && (moved || (typeof window !== "undefined" && window.devicePixelRatio <= 2));

  return (
    <section
      ref={section}
      aria-labelledby={labelledBy}
      data-header={initialView === "gate" ? "ink" : "paper"}
      data-inside={startRoom ? "" : undefined}
      className="relative"
      style={{ height: `${trackLength(track) * 100}lvh` }}
    >
      <div
        ref={stage}
        className="scene-stage sticky top-0 h-lvh overflow-hidden bg-bark"
        data-cut={cut ? "" : undefined}
        data-hold-poster={squareWarm ? undefined : ""}
        style={inside ? { touchAction: "pinch-zoom" } : undefined}
        onPointerDown={touchDown}
        onPointerMove={point}
        onPointerUp={touchUp}
        onPointerCancel={touchUp}
        onPointerLeave={unpoint}
      >
        {children}
        {inside && <RoomPlate key={`plate-${inside}`} ref={roomPlate} room={inside} alt={square.rooms[inside].alt} fade={settledInPage} />}
        <canvas
          key={restart}
          ref={canvas}
          aria-hidden="true"
          data-gate-canvas={mode}
          className={`absolute inset-0 size-full ${canvasShown ? "" : "invisible"}`}
        />
        <div
          ref={squareLayer}
          inert={!!startRoom}
          data-away={startRoom ? "" : undefined}
          className="absolute inset-0 transition-opacity duration-150 data-[away]:pointer-events-none data-[away]:opacity-0"
        >
        <div
          inert={!!seek}
          className={`absolute inset-0 ${cut ? "" : "transition-opacity duration-150"} ${!seek && (htmlSquare || mode === "webgl") ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          <SquareOverlay
            ref={overlay}
            lang={square.lang}
            t={square.t}
            paints={htmlSquare}
            plates={(!boardOpen || openedInPage) && squareWarm}
            first={cut}
            boardOpen={boardOpen}
            onPointArm={pointArm}
            onPointBoard={pointBoard}
            onOpenBoard={openBoard}
            onEnterRoom={enterRoom}
          />
        </div>
        </div>
        {inside && (
          <RoomUi
            key={`ui-${inside}`}
            ref={roomLayer}
            headingRef={roomHeading}
            room={inside}
            lang={square.lang}
            t={square.rooms}
            hint={hint}
            arrived={settledInPage}
            onBack={onBack}
            onNextDoor={onNextDoor}
          >
            <RoomSeeds
              ref={roomSeeds}
              room={inside}
              lang={square.lang}
              t={square.product}
              roomTitle={square.rooms[inside].title}
              lit={canvasShown}
              open={card?.hotspot.product.id ?? null}
              onOpen={openCard}
              onSpot={spot}
            />
          </RoomUi>
        )}
        {inside && card && card.hotspot.product.building === inside && (
          <ProductCard
            key={card.hotspot.product.id}
            product={card.hotspot.product}
            lang={square.lang}
            t={square.product}
            from={card.at}
            seed={cardSeed}
            onClose={closeCard}
          />
        )}
        {boardOpen && <VisitBackdrop ref={backdrop} painted={canvasShown} />}
        {boardOpen && (
          <VisitPanel
            copy={square.board}
            t={square.visit}
            arrived={arrived || mode !== "webgl"}
            content={arrived || mode !== "webgl"}
            fade={openedInPage}
            painted={canvasShown}
            onClose={closeBoard}
          />
        )}
      </div>
    </section>
  );
}
