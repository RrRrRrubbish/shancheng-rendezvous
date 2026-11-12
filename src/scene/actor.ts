import * as THREE from 'three';
import type { RunState } from '../domain/types';

export class Walker extends THREE.Group {
  private body = new THREE.Group();
  private hips: THREE.Group[] = [];
  private knees: THREE.Group[] = [];
  private shoulders: THREE.Group[] = [];
  private elbows: THREE.Group[] = [];
  private phase = 0;
  private weight = 0;
  private slope = 0;
  private distance = 0;
  private elevation = 0;
  private generation = -1;
  private mode = 'idle';
  constructor() {
    super(); this.add(this.body);
    const materials = new Map<string, THREE.MeshStandardMaterial>();
    const box = (parent: THREE.Group, position: number[], size: number[], color: string) => {
      if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true }));
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), materials.get(color));
      mesh.position.set(position[0], position[1], position[2]); parent.add(mesh); return mesh;
    };
    const pivot = (parent: THREE.Group, x: number, y: number, z = 0) => {
      const group = new THREE.Group(); group.position.set(x, y, z); parent.add(group); return group;
    };
    box(this.body, [0, 0.8, 0], [0.44, 0.52, 0.32], '#d96d4c');
    box(this.body, [0, 0.81, -0.23], [0.32, 0.4, 0.18], '#d2a55f');
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.23, 1), new THREE.MeshStandardMaterial({ color: '#edc49a', roughness: 1 }));
    head.position.set(0, 1.24, 0.02); this.body.add(head);
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.31, 0.11, 10), new THREE.MeshStandardMaterial({ color: '#efdbb0', roughness: 1 }));
    hat.position.set(0, 1.42, 0); this.body.add(hat);
    // Face and shoes make facing and alternating strides readable from every orbit angle.
    box(this.body, [0, 1.21, 0.235], [0.065, 0.065, 0.065], '#ce9878');
    for (const x of [-0.13, 0.13]) {
      const hip = pivot(this.body, x, 0.56), knee = pivot(hip, 0, -0.24);
      box(hip, [0, -0.12, 0], [0.16, 0.24, 0.18], '#3e5754');
      box(knee, [0, -0.12, 0], [0.145, 0.24, 0.17], '#3e5754');
      box(knee, [0, -0.23, 0.045], [0.18, 0.09, 0.28], '#344744');
      this.hips.push(hip); this.knees.push(knee);
    }
    for (const x of [-0.3, 0.3]) {
      const shoulder = pivot(this.body, x, 1.01), elbow = pivot(shoulder, 0, -0.23);
      box(shoulder, [0, -0.1, 0], [0.14, 0.23, 0.16], '#d96d4c');
      box(elbow, [0, -0.1, 0], [0.12, 0.23, 0.14], '#edc49a');
      this.shoulders.push(shoulder); this.elbows.push(elbow);
    }
  }
  update(state: RunState, dt: number, reducedMotion: boolean): void {
    if (this.generation !== state.generation) {
      this.generation = state.generation; this.distance = state.distance; this.elevation = state.position[1];
      this.phase = 0; this.weight = 0; this.slope = 0;
    }
    const travelled = Math.max(0, state.distance - this.distance), rise = state.position[1] - this.elevation;
    this.distance = state.distance; this.elevation = state.position[1];
    if (state.paused) return;
    const walking = state.phase === 'exploring' && travelled > 1e-6;
    const blend = 1 - Math.exp(-18 * Math.max(0, dt));
    const speed = dt > 0 ? Math.min(1, travelled / (3 * dt)) : 0;
    this.weight += ((walking ? speed : 0) - this.weight) * blend;
    this.slope += ((walking ? Math.max(-0.6, Math.min(0.6, rise / travelled)) : 0) - this.slope) * blend;
    this.phase += walking ? travelled * 4.8 : 0;
    if (state.phase !== 'exploring') this.weight = 0;
    this.mode = state.phase === 'riding' ? 'riding' : walking ? Math.abs(this.slope) > 0.08 ? 'stairs' : 'walking' : 'idle';
    const amplitude = this.weight * (reducedMotion ? 0.68 : 1);
    for (let i = 0; i < 2; i++) {
      const swing = Math.sin(this.phase + i * Math.PI);
      this.hips[i].rotation.x = swing * 0.67 * amplitude - this.slope * 0.18;
      this.knees[i].rotation.x = Math.max(0, -swing) * (0.58 + Math.abs(this.slope) * 0.5) * amplitude;
      this.shoulders[i].rotation.x = -swing * 0.5 * amplitude;
      this.elbows[i].rotation.x = -0.15 - Math.max(0, swing) * 0.2 * amplitude;
    }
    this.body.position.y = reducedMotion ? 0 : Math.abs(Math.sin(this.phase)) * 0.025 * this.weight;
    this.body.rotation.x = -this.slope * 0.12;
    this.body.rotation.z = reducedMotion ? 0 : Math.cos(this.phase) * 0.025 * this.weight;
  }
  info(): { mode: string; phase: number; hip: number[]; knee: number[]; weight: number } {
    return { mode: this.mode, phase: this.phase, hip: this.hips.map(g => g.rotation.x), knee: this.knees.map(g => g.rotation.x), weight: this.weight };
  }
}
