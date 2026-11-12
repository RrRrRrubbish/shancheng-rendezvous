import type { Point } from '../domain/types';
import { keyboardDirection } from '../movement/ground';

/** A fixed left thumbstick owns one pointer; the canvas independently owns the look pointer. */
export class TouchControls {
  private pointer?: number;
  private axes: Point = [0, 0];
  private active = false;
  private knob: HTMLElement;
  constructor(private pad: HTMLElement) {
    this.knob = pad.querySelector<HTMLElement>('.joystick-knob')!;
    pad.addEventListener('pointerdown', this.down);
    pad.addEventListener('pointermove', this.move);
    pad.addEventListener('pointerup', this.end);
    pad.addEventListener('pointercancel', this.end);
    pad.addEventListener('lostpointercapture', this.end);
    window.addEventListener('blur', this.clear);
    window.addEventListener('resize', this.clear);
    document.addEventListener('visibilitychange', this.visibility);
  }
  set enabled(value: boolean) {
    this.active = value;
    this.pad.setAttribute('aria-disabled', String(!value));
    if (!value) this.clear();
  }
  private down = (e: PointerEvent): void => {
    if (!this.active || this.pointer !== undefined || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    this.pointer = e.pointerId;
    this.pad.setPointerCapture(e.pointerId);
    this.pad.classList.add('is-active');
    this.move(e);
  };
  private move = (e: PointerEvent): void => {
    if (this.pointer !== e.pointerId || !this.active) return;
    e.preventDefault(); e.stopPropagation();
    const bounds = this.pad.getBoundingClientRect(), radius = bounds.width * 0.31;
    const x = (e.clientX - bounds.x - bounds.width / 2) / radius;
    const y = (e.clientY - bounds.y - bounds.height / 2) / radius;
    const length = Math.hypot(x, y), amount = Math.min(1, Math.max(0, (length - 0.14) / 0.86));
    this.axes = length > 0 ? [x / length * amount, y / length * amount] : [0, 0];
    const scale = Math.min(1, length) * radius / Math.max(length, 0.001);
    this.knob.style.transform = `translate(${x * scale}px,${y * scale}px)`;
  };
  private end = (e: PointerEvent): void => { if (e.pointerId === this.pointer) this.clear(); };
  private visibility = (): void => { if (document.hidden) this.clear(); };
  direction(yaw: number): Point { return this.active ? keyboardDirection(...this.axes, yaw) : [0, 0]; }
  clear = (): void => {
    const pointer = this.pointer; this.pointer = undefined; this.axes = [0, 0];
    this.knob.style.transform = ''; this.pad.classList.remove('is-active');
    if (pointer !== undefined && this.pad.hasPointerCapture(pointer)) this.pad.releasePointerCapture(pointer);
  };
  dispose(): void {
    this.clear();
    this.pad.removeEventListener('pointerdown', this.down); this.pad.removeEventListener('pointermove', this.move);
    this.pad.removeEventListener('pointerup', this.end); this.pad.removeEventListener('pointercancel', this.end);
    this.pad.removeEventListener('lostpointercapture', this.end);
    window.removeEventListener('blur', this.clear); window.removeEventListener('resize', this.clear);
    document.removeEventListener('visibilitychange', this.visibility);
  }
}
