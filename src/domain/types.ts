export type Vec3 = [number, number, number];
export type Point = [number, number];
export type LevelId = 'liziba' | 'crown-escalator' | 'yangtze-cableway' | 'huangjuewan';
export type Terrain = 'flat' | 'stairs' | 'slope';
export interface Surface {
  id: string; name: string; layer: string;
  bounds: [number, number, number, number];
  origin: Vec3; gradient: Point; terrain: Terrain; neighbors: string[];
  polygon?: Point[];
  roadId?: string;
  tier?: number;
  thickness?: number;
}
export interface Solid { id: string; min: Vec3; max: Vec3 }
export interface RoadNode { id: string; name: string; position: Vec3; tier: number }
export interface Road {
  id: string; name: string; from: string; to: string; width: number;
  path: Vec3[]; tier: number; kind: 'main' | 'ramp' | 'scenic';
}
export interface RoadNetwork { nodes: RoadNode[]; roads: Road[] }
export interface Place { surface: string; position: Vec3 }
export interface Stop extends Place { name: string; vehiclePosition?: Vec3 }
export interface Transport {
  id: string; name: string; kind: 'lift' | 'escalator' | 'rail' | 'cableway';
  stops: [Stop, Stop]; path: Vec3[]; duration: number; recoveryGroup?: string;
  rideView?: { center: Vec3; distance: number; yaw: number; pitch: number };
}
export interface Discovery extends Place {
  id: string; title: string; text: string; source: string; mediaId?: string;
}
export interface CheckpointConfig extends Place { id: string; name: string; benchOffset?:Point }
export interface Level {
  id: LevelId; number: number; name: string; subtitle: string; intro: string;
  goalName: string; goal: Place; start: Place; center: Vec3; viewSize: number;
  accent: string; surfaces: Surface[]; transports: Transport[];
  discoveries: Discovery[]; checkpoints: CheckpointConfig[];
  source: string; sourceLabel: string; geography: string;
  network?: RoadNetwork;
  obstacles?: Solid[];
  staminaScale?: number;
}
export type Phase = 'briefing' | 'exploring' | 'riding' | 'fatigued' | 'success';
export interface Ride {
  id: number; generation: number; serviceId: string; direction: 0 | 1;
  elapsed: number; duration: number; canSkip: boolean;
}
export interface RunSnapshot {
  position: Vec3; surfaceId: string; facing: number; stamina: number;
  discoveries: string[]; consumedGroups: string[]; consumedRests: string[]; completedServices: string[];
  distance: number; rides: number;
}
export interface Checkpoint { id: string; name: string; snapshot: RunSnapshot }
export interface RunState extends RunSnapshot {
  phase: Phase; paused: boolean; ride?: Ride; checkpoint: Checkpoint;
  message: string; messageId: number; generation: number; moving: boolean;
  events: GameEvent[];
}
export interface GameEvent {
  id: number; kind: 'message' | 'rest' | 'discovery' | 'recovery';
  text: string; position: Vec3; placeId?: string; amount?: number;
}
export interface Settings {
  muted: boolean; music: number; ambient: number; effects: number;
  reducedMotion: boolean; lowQuality: boolean;
}
export interface Progress {
  schemaVersion: 2; completed: LevelId[]; discoveries: string[];
  lastLevel: LevelId; settings: Settings; tutorialSeen: boolean;
}
export interface Interaction {
  kind: 'transport'; id: string; title: string;
  detail: string; direction?: 0 | 1;
}
export interface MovementSegment {
  from: Vec3; to: Vec3; surfaceId: string; distance: number; coefficient: number;
}
