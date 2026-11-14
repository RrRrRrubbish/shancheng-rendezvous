import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Level } from '../domain/types';

const vertex=`varying vec3 vWorld;
void main(){vec4 world=modelMatrix*vec4(position,1.0);vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`;
const noise=`float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){return noise(p)*.57+noise(p*2.03+3.1)*.28+noise(p*4.07-5.2)*.15;}`;
const random=(n:number)=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};

/** Procedural low-poly scenery. No downloaded map tiles or photographic textures. */
export class CityEnvironment extends THREE.Group {
  private sky:THREE.Mesh;
  private time={value:0};
  private detail={value:1};
  private motion=0;
  private low=false;
  constructor(level:Level){
    super();
    const skyMaterial=new THREE.ShaderMaterial({
      side:THREE.BackSide,depthWrite:false,uniforms:{uTime:this.time,uDetail:this.detail},
      vertexShader:'varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:`uniform float uTime;uniform float uDetail;varying vec3 vDirection;${noise}
      void main(){vec3 d=normalize(vDirection);float h=max(0.,d.y);
        vec3 color=mix(vec3(.80,.87,.82),vec3(.37,.61,.72),pow(h,.48));
        vec2 p=d.xz/max(.13,h+.10);
        vec2 wind=vec2(uTime*.005,uTime*.0018);
        float low=fbm(p*.75+wind),high=fbm(p*1.6-wind*.45+17.);
        float cloud=smoothstep(.49,.70,low),wisps=smoothstep(.57,.76,high)*.26;
        float band=smoothstep(.015,.14,h)*(1.-smoothstep(.72,.98,h));
        vec3 cloudColor=mix(vec3(.78,.83,.79),vec3(.99,.98,.91),smoothstep(.46,.77,low));
        color=mix(color,cloudColor,cloud*band*.87);
        color=mix(color,vec3(.97,.98,.95),wisps*band*(.5+uDetail*.5));
        float sun=pow(max(0.,dot(d,normalize(vec3(-.5,.8,.4)))),64.);
        color+=vec3(.15,.11,.045)*sun;gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    });
    this.sky=new THREE.Mesh(new THREE.SphereGeometry(310,24,12),skyMaterial);
    this.sky.renderOrder=-10;this.sky.frustumCulled=false;this.add(this.sky);
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(590,590),new THREE.MeshStandardMaterial({color:'#a8b396',roughness:1}));
    ground.rotation.x=-Math.PI/2;ground.position.set(level.center[0],-3.5,level.center[2]);this.add(ground);
    this.horizon(level);if(!level.network)this.river(level);
  }
  private horizon(level:Level):void {
    const geometries:THREE.BufferGeometry[]=[];
    const haze=new THREE.Color('#c1d2c8');
    const add=(geometry:THREE.BufferGeometry,p:number[],scale:number[],color:THREE.Color)=>{
      const geo=geometry.index?geometry.toNonIndexed():geometry;
      if(geo!==geometry)geometry.dispose();
      // Icosahedra and boxes must have identical attributes before batching.
      geo.deleteAttribute('uv');geo.scale(scale[0],scale[1],scale[2]);geo.translate(p[0],p[1],p[2]);
      const colors=new Float32Array(geo.getAttribute('position').count*3);
      for(let i=0;i<colors.length;i+=3){colors[i]=color.r;colors[i+1]=color.g;colors[i+2]=color.b;}
      geo.setAttribute('color',new THREE.BufferAttribute(colors,3));geometries.push(geo);
    };
    for(let ring=0;ring<3;ring++)for(let i=0;i<24;i++){
      const seed=ring*83+i,angle=(i+random(seed)*.6)/24*Math.PI*2+ring*.18,radius=135+ring*55;
      const color=new THREE.Color(ring?'#8da99e':'#78988b').lerp(haze,.18+ring*.23);
      add(new THREE.IcosahedronGeometry(1,1),[level.center[0]+Math.sin(angle)*radius,-9-ring*3,level.center[2]+Math.cos(angle)*radius],
        [25+random(seed+1)*21,24+random(seed+3)*31,24+random(seed+9)*19],color);
    }
    for(let ring=0;ring<3;ring++){
      const count=74+ring*20;
      for(let i=0;i<count;i++){
        const seed=700+ring*211+i,angle=(i+random(seed)*.6)/count*Math.PI*2+ring*.17;
        const radius=78+ring*28+random(seed+1)*13,height=7+random(seed+2)*22;
        const color=new THREE.Color(['#a5b5a4','#bfbca7','#9eb4ae','#b6beab'][Math.floor(random(seed+5)*4)]).lerp(haze,.12+ring*.22);
        const x=level.center[0]+Math.sin(angle)*radius,z=level.center[2]+Math.cos(angle)*radius;
        add(new THREE.BoxGeometry(1,1,1),[x,height/2-3,z],[2.7+random(seed+3)*4.5,height,3+random(seed+4)*4],color);
        if(ring===0&&i%3===0)add(new THREE.BoxGeometry(1,1,1),[x,height-2.5,z],[1.2,1.1,1.3],color.clone().multiplyScalar(.9));
      }
    }
    const merged=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());
    if(merged)this.add(new THREE.Mesh(merged,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true})));
  }
  private river(level:Level):void {
    const material=new THREE.ShaderMaterial({
      uniforms:{uTime:this.time,uDetail:this.detail},vertexShader:vertex,
      fragmentShader:`uniform float uTime;uniform float uDetail;varying vec3 vWorld;${noise}
      void main(){vec2 p=vWorld.xz;float t=uTime;
        float broad=sin(p.x*.19+p.y*.12+t*.28),cross=sin(p.y*.54-p.x*.16-t*.42);
        float fine=sin(p.y*2.1+p.x*.28+broad*.8+t*.65)*uDetail;
        vec3 n=normalize(vec3(-broad*.05-cross*.02,1.,-cross*.055-fine*.018));
        vec3 view=normalize(cameraPosition-vWorld);float distance=length(cameraPosition.xz-p);
        float farWater=smoothstep(18.,180.,distance),fresnel=pow(1.-max(0.,dot(n,view)),2.);
        float current=fbm(p*.055+vec2(t*.008,-t*.009));
        vec3 nearColor=mix(vec3(.23,.40,.34),vec3(.35,.50,.40),current);
        vec3 color=mix(nearColor,vec3(.51,.65,.61),farWater*.65+fresnel*.25);
        float wavePatch=noise(p*.23+vec2(t*.018,-t*.012));
        float wave=p.y*2.4+p.x*.25+broad*.7+wavePatch*2.6+t*.55;
        float width=max(.07,fwidth(wave)*1.25);
        float ripple=1.-smoothstep(.04,.04+width,abs(sin(wave)));
        float broken=smoothstep(.40,.76,wavePatch)*(.5+.5*sin(p.x*.31+p.y*.15+t*.24));
        float smallWave=pow(max(0.,sin(p.x*.87-p.y*.62+cross*.8-t*.37)),16.);
        color+=vec3(.040,.052,.037)*(ripple*broken+smallWave*.3*uDetail)*(1.-farWater*.82);
        float sparkle=pow(max(0.,dot(reflect(-normalize(vec3(-.5,.8,.4)),n),view)),90.);
        color+=vec3(.28,.25,.15)*sparkle;
        color=mix(color,vec3(.75,.82,.76),smoothstep(90.,270.,distance)*.65);
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    });
    const cableway=level.id==='yangtze-cableway';
    const water=new THREE.Mesh(new THREE.PlaneGeometry(cableway?380:420,cableway?380:190),material);
    water.rotation.x=-Math.PI/2;water.position.set(level.center[0],-2.07,cableway?1:105);this.add(water);
  }
  update(camera:THREE.Camera,dt:number,reducedMotion:boolean):void {
    this.sky.position.copy(camera.position);
    if(!reducedMotion&&!this.low)this.motion+=dt;
    this.time.value=this.motion;
  }
  setQuality(low:boolean):void {this.low=low;this.detail.value=low?0:1;}
}
