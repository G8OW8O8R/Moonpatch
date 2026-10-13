"use client";

import "lenis/dist/lenis.css";
import { usePathname } from "next/navigation";
import { type MouseEvent, type PointerEvent, type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type DoorParams, defaultDoor } from "@/lib/door-rig";
import { type RigParams, defaultRig } from "@/lib/gate-rig";
import type { Locale } from "@/lib/i18n";
import type { Messages } from "@/lib/messages";
import { type RoomId, isRoomId } from "@/lib/rooms";
import { placeAt, placePath } from "@/lib/routes";
import { type ArmId, propsOnScreen } from "@/lib/square-props";
import { DUSK, type Track, defaultTrack, trackAt, trackEnd, trackLength } from "@/lib/square-rig";
import { SPOT_KEY, readSpot, spotToKeep, startAt, writeSpot } from "@/lib/square-spot";
import type { VisitCopy } from "@/lib/visit";
import { Icon } from "@/components/ui/Icon";
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
}

export interface GateSceneProps {
  /** The poster and the screen-reader copy, rendered on the server. */
  children: ReactNode;
  labelledBy: string;
  square: SquareCopy;
  /** Open on the notice board (its own address) instead of at the gate. */
  initialView?: "gate" | "visit";
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
const ROOMS_IN_SCENE: ReadonlySet<RoomId> = new Set<RoomId>(["cafe"]);

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
  const [cut, setCut] = useState(initialView === "visit");
  /** The scene has its first frame; it is shown once it can draw the square, if that is where the page is. */
  const engineReady = useRef(false);
  const paramsRef = useRef(params);
  const doorRef = useRef(door);
  const onJourneyRef = useRef(onJourney);
  /** The building the camera is in, from the cut on (null out on the square). */
  const [inside, setInside] = useState<RoomId | null>(null);
  const insideRef = useRef<RoomId | null>(null);
  /** On the way into a building, inside it, or on the way out: the square's own layer stands aside. */
  const [away, setAway] = useState(false);
  const awayRef = useRef(false);
  /** The building was entered from the square in this visit, so the way out is the browser's way back. */
  const roomFromHere = useRef(false);
  const trackRef = useRef(track);
  const [mode, setMode] = useState<Mode>("poster");
  const [reason, setReason] = useState("");
  const [pastHalf, setPastHalf] = useState(false);
  const [moved, setMoved] = useState(false);
  const [restart, setRestart] = useState(0);
  const [stats, setStats] = useState<FrameStats>({ fps: 0, quality: 0 });
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

  // While the timed ride plays, the page holds still inside the section; it lets go when the ride lands.
  const release = useCallback(() => {
    window.clearTimeout(holdTimer.current);
    holdTimer.current = 0;
    if (!boardOpenRef.current) lenis.current?.start();
  }, []);
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
    // On the square, the canvas waits for the square's own layers; until then the plain one stands.
    if (rideWanted.current === 1 && !squareReady.current) return;
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
        if (boardOpenRef.current) instance.stop();
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
  }, [measure]);

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
      startedAt.current = startAt({ board: initialView === "visit", square, returning: isReturning(), spot: storedSpot() }, trackRef.current);
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
      if (!holdTimer.current) lenis.current?.start();
    }
  }, [boardOpen, measure, syncProps]);

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

  // Into a building and out again: the scene plays the move; the page only says where to go.
  useEffect(() => {
    const c = controller.current;
    if (room) {
      if (modeRef.current !== "webgl" || !c) return;
      awayRef.current = true;
      setAway(true);
      lenis.current?.stop();
      c.setPlace(room);
    } else if (awayRef.current) {
      c?.setPlace("square");
    }
  }, [room]);

  /** The camera has cut across: the header and the room's own copy follow it. */
  const cutTo = useCallback((place: ScenePlace) => {
    const next = place === "square" ? null : place;
    insideRef.current = next;
    setInside(next);
    if (next && section.current) section.current.dataset.header = "paper";
    else driver.current?.refresh();
  }, []);

  /** A move has landed: inside, the square waits under the room at the end of its path; outside, the page scrolls again. */
  const placed = useCallback(
    (place: ScenePlace) => {
      const html = document.documentElement;
      if (place === "square") {
        awayRef.current = false;
        setAway(false);
        html.style.overflow = "";
        if (!boardOpenRef.current) lenis.current?.start();
        return;
      }
      const el = section.current;
      const unit = stage.current?.clientHeight ?? window.innerHeight;
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + trackEnd(trackRef.current) * unit, behavior: "instant" });
      measure();
      driver.current?.follow(1, 1, true);
      html.style.overflow = "hidden";
    },
    [measure],
  );

  useEffect(() => () => void (document.documentElement.style.overflow = ""), []);

  const enterRoom = useCallback(
    (arm: ArmId, event: MouseEvent<HTMLAnchorElement>) => {
      // The scene takes the visitor in itself only from the drawn square; otherwise the link opens the room's page.
      if (!ROOMS_IN_SCENE.has(arm) || modeRef.current !== "webgl" || rideAt.current !== 1 || !squareReady.current) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      roomFromHere.current = true;
      window.history.pushState(null, "", placePath(square.lang, arm));
    },
    [square.lang],
  );

  const leaveRoom = useCallback(() => {
    if (roomFromHere.current) {
      roomFromHere.current = false;
      window.history.back();
    } else {
      window.history.pushState(null, "", placePath(square.lang, "square"));
    }
  }, [square.lang]);

  useEffect(() => {
    if (!inside) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") leaveRoom();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inside, leaveRoom]);

  /** Inside, a mouse moves the room a little. */
  const point = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || !insideRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    controller.current?.setPointer({ x: ((event.clientX - rect.left) / rect.width) * 2 - 1, y: ((event.clientY - rect.top) / rect.height) * 2 - 1 });
  }, []);
  const unpoint = useCallback(() => controller.current?.setPointer(null), []);

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
    const cancelStart = whenIdle(() => {
      if (cancelled) return;
      if (onBoard) warmSquare(signpost.current);
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
            },
            onPlateChange: () => {
              engineReady.current = false;
              controller.current?.dispose();
              controller.current = null;
              setMode("poster");
              setRestart((n) => n + 1);
            },
            onStats: setStats,
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
    }, onBoard ? BOARD_SCENE_DELAY : 0);

    return () => {
      cancelled = true;
      cancelStart();
      intersection.disconnect();
      resize.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      controller.current?.dispose();
      controller.current = null;
    };
  }, [restart, release, syncProps, showCanvas, square.t.arms, square.lang, initialView, cutTo, placed]);

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
      data-header="ink"
      className="relative"
      style={{ height: `${trackLength(track) * 100}lvh` }}
    >
      <div
        ref={stage}
        className="scene-stage sticky top-0 h-lvh overflow-hidden bg-bark"
        data-cut={cut ? "" : undefined}
        onPointerMove={inside ? point : undefined}
        onPointerLeave={inside ? unpoint : undefined}
      >
        {children}
        <canvas
          key={restart}
          ref={canvas}
          aria-hidden="true"
          data-gate-canvas={mode}
          className={`absolute inset-0 size-full ${canvasShown ? "" : "invisible"}`}
        />
        <div
          inert={away || !!seek}
          className={`absolute inset-0 ${cut ? "" : "transition-opacity duration-150"} ${!away && !seek && (htmlSquare || mode === "webgl") ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          <SquareOverlay
            ref={overlay}
            lang={square.lang}
            t={square.t}
            paints={htmlSquare}
            plates={!boardOpen || openedInPage}
            first={cut}
            boardOpen={boardOpen}
            onPointArm={pointArm}
            onPointBoard={pointBoard}
            onOpenBoard={openBoard}
            onEnterRoom={enterRoom}
          />
        </div>
        {inside && (
          <div className="absolute inset-0">
            <h1 className="sr-only">{square.rooms[inside].title}</h1>
            <button type="button" onClick={leaveRoom} className="room-back transition-opacity duration-300 starting:opacity-0">
              <Icon name="arrow-left" className="drop-shadow-hug" />
              <span>{square.rooms.back}</span>
            </button>
          </div>
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
