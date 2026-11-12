import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Level } from '../domain/types';

const vertex = `varying vec3 vWorld;
void main(){vec4 world=modelMatrix*vec4(position,1.0);vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`;

/** Local procedural scenery: no image downloads, reflection passes or geographic map tiles. */
export class CityEnvironment extends THREE.Group {
  private sky: THREE.Mesh;
  private time = { value: 0 };
  private motion = 0;
  private low = false;
  constructor(level: Level) {
    super();
    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, uniforms: { uTime: this.time },
      vertexShader: 'varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `uniform float uTime;varying vec3 vDirection;
      void main(){vec3 d=normalize(vDirection);float h=max(0.0,d.y);
        vec3 color=mix(vec3(.86,.89,.81),vec3(.48,.66,.70),pow(h,.55));
        vec2 p=d.xz/(h+.24);float n=sin(p.x*3.0+uTime*.012)+sin(p.y*5.0+p.x*1.3)+sin(p.x*7.0-p.y*3.0)*.32;
        float cloud=smoothstep(1.15,1.85,n)*smoothstep(.02,.22,h)*(1.0-smoothstep(.55,.9,h));
        color=mix(color,vec3(.98,.96,.87),cloud*.5);
        float sun=pow(max(0.0,dot(d,normalize(vec3(-.5,.8,.4)))),48.0);
        color+=vec3(.12,.09,.035)*sun;gl_FragColor=vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(310, 24, 12), skyMaterial);
    this.sky.renderOrder = -10; this.sky.frustumCulled = false; this.add(this.sky);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(540, 540), new THREE.MeshStandardMaterial({ color: '#a8b396', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(level.center[0], -3.5, level.center[2]); this.add(ground);
    this.horizon(level);
    if (!level.network) this.river(level);
  }
  private horizon(level: Level): void {
    const geometries: THREE.BufferGeometry[] = [];
    const add = (geometry: THREE.BufferGeometry, p: number[], scale: number[], color: string) => {
      const geo = geometry.index ? geometry.toNonIndexed() : geometry;
      if (geo !== geometry) geometry.dispose();
      geo.scale(scale[0], scale[1], scale[2]); geo.translate(p[0], p[1], p[2]);
      const rgb = new THREE.Color(color), colors = new Float32Array(geo.getAttribute('position').count * 3);
      for (let i = 0; i < colors.length; i += 3) { colors[i] = rgb.r; colors[i + 1] = rgb.g; colors[i + 2] = rgb.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geometries.push(geo);
    };
    for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 18; i++) {
      const angle = i / 18 * Math.PI * 2 + ring * .13, radius = 128 + ring * 55;
      add(new THREE.IcosahedronGeometry(1, 1), [level.center[0] + Math.sin(angle) * radius, -8, level.center[2] + Math.cos(angle) * radius],
        [24 + i % 4 * 7, 26 + (i * 7) % 26, 26], ring ? '#b2bfac' : '#8fa99a');
    }
    for (let i = 0; i < 64; i++) {
      const angle = i / 64 * Math.PI * 2, radius = 94 + i % 5 * 5, height = 8 + (i * 7) % 19;
      add(new THREE.BoxGeometry(1, 1, 1), [level.center[0] + Math.sin(angle) * radius, height / 2 - 3, level.center[2] + Math.cos(angle) * radius],
        [3 + i % 4, height, 4 + i % 3], ['#afb9a8', '#bcc3ae', '#a5b8a9'][i % 3]);
    }
    const merged = mergeGeometries(geometries, false); geometries.forEach(g => g.dispose());
    if (merged) this.add(new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true })));
  }
  private river(level: Level): void {
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: this.time }, vertexShader: vertex,
      fragmentShader: `uniform float uTime;varying vec3 vWorld;
      void main(){vec2 p=vWorld.xz;float t=uTime;
        float a=sin(p.x*.65+p.y*.19+t*.65),b=cos(p.y*.83-p.x*.12-t*.45);
        vec3 n=normalize(vec3(-a*.075,1.0,-b*.05));vec3 view=normalize(cameraPosition-vWorld);
        float fresnel=pow(1.0-max(0.0,dot(n,view)),2.0);
        vec3 color=mix(vec3(.30,.46,.40),vec3(.63,.72,.62),fresnel*.7);
        float ripple=pow(max(0.0,sin(p.y*3.5+p.x*.3+a*.4+t*.7)),24.0);
        color+=vec3(.035,.045,.025)*ripple;
        float light=pow(max(0.0,dot(reflect(-normalize(vec3(-.5,.8,.4)),n),view)),70.0);
        color+=vec3(.30,.24,.12)*light;gl_FragColor=vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    });
    const cableway = level.id === 'yangtze-cableway';
    const water = new THREE.Mesh(new THREE.PlaneGeometry(cableway ? 380 : 420, cableway ? 380 : 190), material);
    water.rotation.x = -Math.PI / 2; water.position.set(level.center[0], -2.07, cableway ? 1 : 105); this.add(water);
  }
  update(camera: THREE.Camera, dt: number, reducedMotion: boolean): void {
    this.sky.position.copy(camera.position);
    if (!reducedMotion && !this.low) this.motion += dt;
    this.time.value = this.motion;
  }
  setQuality(low: boolean): void { this.low = low; }
}
