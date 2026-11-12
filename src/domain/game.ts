import type { GameEvent, Interaction, Level, Point, RunSnapshot, RunState, Vec3 } from './types';
import { EPSILON, solveMovement, validateLevel } from '../movement/ground';

const copy = <T>(value: T): T => structuredClone(value);
const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);
export function samplePath(path: Vec3[], progress: number): Vec3 {
  const lengths = path.slice(1).map((p, i) => Math.hypot(p[0]-path[i][0],p[1]-path[i][1],p[2]-path[i][2]));
  let remaining = Math.min(1, Math.max(0, progress)) * lengths.reduce((a,b) => a+b, 0);
  for (let i=0;i<lengths.length;i++) {
    if (remaining <= lengths[i] || i === lengths.length - 1) {
      const t = lengths[i] ? Math.min(1, remaining / lengths[i]) : 1;
      return path[i].map((v,j) => v + (path[i+1][j] - v) * t) as Vec3;
    }
    remaining -= lengths[i];
  }
  return [...path[0]];
}
export class Game {
  readonly level: Level;
  state: RunState;
  private serial = 0;
  private eventSerial = 0;
  constructor(level: Level) {
    validateLevel(level);
    this.level = level;
    const start: RunSnapshot = { position: [...level.start.position], surfaceId: level.start.surface, facing: level.id === 'yangtze-cableway' ? Math.PI / 2 : Math.PI, stamina: 100, discoveries: [], consumedGroups: [], consumedRests: [], completedServices: [], distance: 0, rides: 0 };
    this.state = { ...copy(start), phase: 'briefing', paused: false, generation: 1, checkpoint: { id: 'start', name: '出发点', snapshot: copy(start) }, message: '', messageId: 0, moving: false, events: [] };
  }
  start(): void { if (this.state.phase === 'briefing') this.state.phase = 'exploring'; }
  notify(message: string,kind:GameEvent['kind']='message',details:Partial<Pick<GameEvent,'placeId'|'amount'|'position'>>={}): void {
    this.state.message = message; this.state.messageId++;
    this.state.events.push({id:++this.eventSerial,kind,text:message,position:[...this.state.position],...details});
    if(this.state.events.length>64)this.state.events.splice(0,this.state.events.length-64);
  }
  pause(value = true): void { this.state.paused = value; this.state.moving = false; }
  snapshot(): RunSnapshot {
    const s = this.state;
    return copy({ position: s.position, surfaceId: s.surfaceId, facing: s.facing, stamina: s.stamina, discoveries: s.discoveries, consumedGroups: s.consumedGroups, consumedRests: s.consumedRests, completedServices: s.completedServices, distance: s.distance, rides: s.rides });
  }
  update(input: Point, dt: number): void {
    const s = this.state;
    s.moving = false;
    if (s.paused || !Number.isFinite(dt) || dt <= 0) return;
    if (s.phase === 'riding' && s.ride) {
      s.ride.elapsed = Math.min(s.ride.duration, s.ride.elapsed + dt);
      const t = this.level.transports.find(t => t.id === s.ride!.serviceId)!;
      s.position = samplePath(s.ride.direction ? [...t.path].reverse() : t.path, s.ride.elapsed / s.ride.duration);
      if (s.ride.elapsed >= s.ride.duration) this.finishRide(s.ride.id, s.ride.generation);
      return;
    }
    if (s.phase !== 'exploring') return;
    if (this.checkPlaces()) return;
    const segments = solveMovement(this.level, s.position, s.surfaceId, input, Math.min(dt, 0.1));
    for (const seg of segments) {
      const needed = seg.distance * seg.coefficient;
      const fraction = Math.min(1, s.stamina / needed);
      const actual = seg.distance * fraction;
      if (actual <= EPSILON) break;
      s.position = seg.from.map((v, i) => v + (seg.to[i] - v) * fraction) as Vec3;
      s.surfaceId = seg.surfaceId;
      s.facing = Math.atan2(seg.to[0] - seg.from[0], seg.to[2] - seg.from[2]);
      s.stamina = Math.max(0, s.stamina - needed * fraction);
      if (s.stamina < EPSILON) s.stamina = 0;
      s.distance += actual; s.moving = true;
      if (this.checkPlaces()) break;
      if (s.stamina === 0) { s.phase = 'fatigued'; s.moving = false; break; }
    }
    if (s.phase === 'exploring') {
      if (!this.checkPlaces() && s.stamina <= EPSILON) { s.stamina = 0; s.phase = 'fatigued'; }
    }
  }
  private checkPlaces(): boolean {
    const s = this.state;
    for (const d of this.level.discoveries) {
      if (d.surface === s.surfaceId && distance(d.position, s.position) <= 0.85 && !s.discoveries.includes(d.id)) {
        s.discoveries.push(d.id); this.notify('沿途发现 · ' + d.title,'discovery',{placeId:d.id,position:[...d.position]});
      }
    }
    for (const c of this.level.checkpoints) {
      if (c.surface !== s.surfaceId || distance(c.position, s.position) > 0.9 + EPSILON || s.consumedRests.includes(c.id)) continue;
      const restored = Math.min(15, 100 - s.stamina);
      s.stamina = Math.min(100, s.stamina + 15);
      s.consumedRests.push(c.id);
      s.checkpoint = { id: c.id, name: c.name, snapshot: this.snapshot() };
      this.notify(c.name + (restored>EPSILON?' · 体力 +'+Number(restored.toFixed(1)):' · 体力已满')+' · 已记录歇脚点','rest',{placeId:c.id,amount:restored,position:[...c.position]});
    }
    if (this.level.goal.surface === s.surfaceId && distance(this.level.goal.position, s.position) <= 0.6 + EPSILON) {
      s.phase = 'success'; s.moving = false;
      this.notify('赴约成功 · ' + this.level.name);
      return true;
    }
    return false;
  }
  interaction(): Interaction | undefined {
    const s = this.state;
    if (s.phase !== 'exploring' || s.paused) return;
    let best: { distance: number; interaction: Interaction } | undefined;
    const offer = (d: number, interaction: Interaction) => { if (d <= 1.1 && (!best || d < best.distance)) best = { distance: d, interaction }; };
    for (const t of this.level.transports) {
      t.stops.forEach((stop, i) => {
        if (stop.surface !== s.surfaceId) return;
        const recovery = t.recoveryGroup ? s.consumedGroups.includes(t.recoveryGroup) ? '本关恢复已领取' : '首次完整乘坐恢复 20 点体力' : '自动乘坐，不耗体力';
        offer(distance(s.position, stop.position), { kind: 'transport', id: t.id, direction: i as 0|1, title: '乘坐' + t.name, detail: '前往' + t.stops[1-i].name + ' · ' + recovery });
      });
    }
    return best?.interaction;
  }
  interact(): void {
    const i = this.interaction(); if (!i) return;
    const s = this.state;
    const t = this.level.transports.find(t => t.id === i.id)!;
    s.phase = 'riding'; s.moving = false;
    s.ride = { id: ++this.serial, generation: s.generation, serviceId: t.id, direction: i.direction!, elapsed: 0, duration: t.duration, canSkip: s.completedServices.includes(t.id) };
    s.position = samplePath(i.direction ? [...t.path].reverse() : t.path, 0);
    this.notify(t.kind === 'rail' ? '坐下来歇一会儿，到站后结算恢复' : '安心看风景，松开按键也会自动抵达');
  }
  finishRide(id: number, generation: number): boolean {
    const s = this.state, r = s.ride;
    if (s.phase !== 'riding' || !r || r.id !== id || r.generation !== generation || generation !== s.generation) return false;
    const t = this.level.transports.find(t => t.id === r.serviceId)!;
    const end = t.stops[r.direction ? 0 : 1];
    s.position = [...end.position]; s.surfaceId = end.surface; s.ride = undefined; s.phase = 'exploring'; s.rides++;
    if (!s.completedServices.includes(t.id)) s.completedServices.push(t.id);
    if (t.recoveryGroup && !s.consumedGroups.includes(t.recoveryGroup)) {
      const restored = Math.min(20, 100-s.stamina);
      s.stamina = Math.min(100, s.stamina+20); s.consumedGroups.push(t.recoveryGroup);
      this.notify(restored>EPSILON?'已到站 · 体力 +'+Number(restored.toFixed(1)):'已到站 · 体力已满，本线路恢复已记录','recovery',{amount:restored});
    } else this.notify('已抵达' + end.name + (t.recoveryGroup ? ' · 本线路恢复已领取' : ' · 继续向橙色旗帜出发'));
    this.checkPlaces();
    return true;
  }
  skipRide(reducedMotion = false): void {
    const r = this.state.ride;
    if (!this.state.paused && r && (r.canSkip || reducedMotion)) this.finishRide(r.id, r.generation);
  }
  restoreCheckpoint(): void {
    const s = this.state, checkpoint = copy(s.checkpoint), generation = s.generation+1;
    Object.assign(s, copy(checkpoint.snapshot), { phase: 'exploring', paused: false, ride: undefined, moving: false, generation, checkpoint, events: [] });
    this.notify('回到' + checkpoint.name + ' · ' + Math.ceil(s.stamina) + ' 点体力');
  }
  retry(): void {
    const generation = this.state.generation + 1;
    const initial = new Game(this.level);
    this.state = { ...initial.state, generation, phase: 'exploring' };
    this.serial++;
  }
  cancel(): void { this.state.generation++; this.state.ride = undefined; this.state.paused = true; this.state.moving = false; }
}
