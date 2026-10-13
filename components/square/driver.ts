/**
 * Moves the square on the page's own thread: dusk and the closing push-in
 * trail the scroll on a damped follower with a speed limit (like the gate
 * opening), the signpost arms swing on their nails and catch the light when
 * pointed at, the camera flies onto the notice board and back. Runs a frame loop only while something moves
 * and hands every frame to whoever draws it.
 */
import type { SquareState } from "@/components/gate/renderer/SquareRenderer";
import { bezierEasing } from "@/lib/gate-rig";
import { duration, ease, spring } from "@/lib/motion-tokens";
import { type SpringState, followLimited, isSettled, stepSpring } from "@/lib/spring";
import type { ArmId } from "@/lib/square-props";
import { SQUARE_FOLLOW } from "@/lib/square-rig";

/** How far an arm turns on its nail when it is pointed at, radians (its tip lifts). */
const ARM_TURN: Record<ArmId, number> = { cafe: 0.07, barn: 0.07, haunt: -0.07 };

const cameraEase = bezierEasing(ease.camera);

interface Tween {
  from: number;
  to: number;
  start: number;
  length: number;
}

const still = (value: number): SpringState => ({ value, velocity: 0 });

type Pointable = ArmId | "board";

export class SquareDriver {
  private readonly reduced: boolean;
  private readonly onFrame: (state: SquareState) => void;
  private dusk = still(0);
  private wander = still(0);
  private target = { dusk: 0, wander: 0 };
  private arms: Record<ArmId, SpringState> = { cafe: still(0), barn: still(0), haunt: still(0) };
  private armTarget: Record<ArmId, number> = { cafe: 0, barn: 0, haunt: 0 };
  private visit: Tween = { from: 0, to: 0, start: 0, length: 0 };
  private props: Tween = { from: 0, to: 0, start: 0, length: 0 };
  private pointed: Record<Pointable, Tween> = {
    cafe: { from: 0, to: 0, start: 0, length: 0 },
    barn: { from: 0, to: 0, start: 0, length: 0 },
    haunt: { from: 0, to: 0, start: 0, length: 0 },
    board: { from: 0, to: 0, start: 0, length: 0 },
  };
  private raf = 0;
  private last = 0;
  private disposed = false;

  constructor(options: { reduced: boolean; onFrame: (state: SquareState) => void }) {
    this.reduced = options.reduced;
    this.onFrame = options.onFrame;
  }

  /** Where the scroll says dusk and the push-in should be; `jump` lands there at once. */
  follow(dusk: number, wander: number, jump = false) {
    this.target = { dusk, wander };
    if (jump || this.reduced) {
      this.dusk = still(dusk);
      this.wander = still(wander);
    }
    this.wake();
  }

  /** Is the scene at rest on its golden first frame (so the ride may play back)? */
  get atStart(): boolean {
    return this.dusk.value === 0 && this.wander.value === 0 && this.value(this.visit, performance.now()) === 0;
  }

  pointArm(arm: ArmId, pointed: boolean) {
    this.armTarget[arm] = pointed ? ARM_TURN[arm] : 0;
    if (this.reduced) this.arms[arm] = still(this.armTarget[arm]);
    this.point(arm, pointed);
  }

  /** The board catches the light when pointed at (it has no nail to swing on). */
  pointBoard(pointed: boolean) {
    this.point("board", pointed);
  }

  /** Flies onto the notice board (or back). */
  openBoard(open: boolean, jump = false) {
    this.retarget(this.visit, open ? 1 : 0, jump || this.reduced ? 0 : duration.sceneShort);
    this.wake();
  }

  showProps(shown: boolean, jump = false) {
    this.retarget(this.props, shown ? 1 : 0, jump || this.reduced ? 0 : duration.panel);
    this.wake();
  }

  /** Hands out one frame even if nothing moves (whoever draws the square has changed). */
  refresh() {
    this.wake();
  }

  /** Hands out the current frame at once, in the same task (the page is being laid out around it). */
  draw() {
    if (!this.disposed) this.onFrame(this.snapshot());
  }

  /** The current state, without waiting for a frame. */
  snapshot(now = performance.now()): SquareState {
    return {
      dusk: this.dusk.value,
      wander: this.wander.value,
      visit: cameraEase(this.value(this.visit, now)),
      props: this.value(this.props, now),
      arms: { cafe: this.arms.cafe.value, barn: this.arms.barn.value, haunt: this.arms.haunt.value },
      pointed: {
        cafe: this.value(this.pointed.cafe, now),
        barn: this.value(this.pointed.barn, now),
        haunt: this.value(this.pointed.haunt, now),
        board: this.value(this.pointed.board, now),
      },
    };
  }

  dispose() {
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private point(target: Pointable, pointed: boolean) {
    this.retarget(this.pointed[target], pointed ? 1 : 0, this.reduced ? 0 : duration.ui);
    this.wake();
  }

  private retarget(tween: Tween, to: number, seconds: number) {
    const now = performance.now();
    const from = this.value(tween, now);
    // A reversed move takes only as long as the way back.
    const length = seconds * Math.abs(to - from);
    Object.assign(tween, { from, to, start: now, length });
  }

  private value(tween: Tween, now: number): number {
    if (tween.length <= 0) return tween.to;
    const t = Math.min(1, (now - tween.start) / (tween.length * 1000));
    return tween.from + (tween.to - tween.from) * t;
  }

  private wake() {
    if (this.disposed || this.raf) return;
    this.last = 0;
    this.raf = requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number) => {
    this.raf = 0;
    if (this.disposed) return;
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 1 / 60;
    this.last = now;

    this.dusk = followLimited(this.dusk, this.target.dusk, dt, SQUARE_FOLLOW.dusk);
    this.wander = followLimited(this.wander, this.target.wander, dt, SQUARE_FOLLOW.wander);
    let swinging = false;
    for (const arm of Object.keys(this.arms) as ArmId[]) {
      this.arms[arm] = stepSpring(this.arms[arm], this.armTarget[arm], dt, spring.nail);
      if (!isSettled(this.arms[arm], this.armTarget[arm])) swinging = true;
    }
    this.onFrame(this.snapshot(now));

    const tweening = [this.visit, this.props, ...Object.values(this.pointed)].some((t) => this.value(t, now) !== t.to);
    const following = this.dusk.value !== this.target.dusk || this.wander.value !== this.target.wander;
    if (tweening || following || swinging) this.raf = requestAnimationFrame(this.tick);
  };
}
