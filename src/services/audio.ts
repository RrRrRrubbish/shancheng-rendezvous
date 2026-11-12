import type { LevelId, Settings } from '../domain/types';
type Bus = 'music' | 'ambient' | 'effects';
export class AudioLandscape {
  private context?: AudioContext;
  private master?: GainNode;
  private buses?: Record<Bus, GainNode>;
  private settings?: Settings;
  private suspended = false;
  private tickId?: number;
  private nextNote = 0;
  private step = 0;
  private level: LevelId = 'liziba';
  private sources: AudioScheduledSourceNode[] = [];
  async unlock(settings: Settings): Promise<void> {
    this.settings=settings;
    if(settings.muted)return;
    try {
      if(!this.context)this.setup();
      if(this.context?.state==='suspended')await this.context.resume();
      this.apply(settings);this.schedule();
    } catch { /* Silence never blocks gameplay. */ }
  }
  private setup(): void {
    const c=this.context=new AudioContext();
    this.master=c.createGain();this.master.gain.value=0;this.master.connect(c.destination);
    this.buses={music:c.createGain(),ambient:c.createGain(),effects:c.createGain()};
    Object.values(this.buses).forEach(g=>g.connect(this.master!));this.ambience();
  }
  apply(settings: Settings): void {
    this.settings={...settings};
    if(!this.context||!this.buses||!this.master)return;
    const at=this.context.currentTime;
    this.master.gain.setTargetAtTime(settings.muted||this.suspended?0:0.55,at,0.1);
    for(const b of ['music','ambient','effects'] as Bus[])this.buses[b].gain.setTargetAtTime(settings[b],at,0.1);
  }
  setLevel(id: LevelId): void {if(this.level!==id){this.level=id;this.step=0;this.ambience();}}
  pause(value: boolean): void {
    this.suspended=value;if(this.settings)this.apply(this.settings);
    if(!value){this.nextNote=this.context?.currentTime??0;this.schedule();}
  }
  private note(f: number,at: number,duration: number,gain: number,type: OscillatorType,bus: Bus='music'): void {
    const c=this.context;if(!c||!this.buses)return;
    const o=c.createOscillator(),env=c.createGain();o.type=type;o.frequency.value=f;
    env.gain.setValueAtTime(0.0001,at);env.gain.exponentialRampToValueAtTime(gain,at+0.025);env.gain.exponentialRampToValueAtTime(0.0001,at+duration);
    o.connect(env);env.connect(this.buses[bus]);o.start(at);o.stop(at+duration+0.04);
    o.onended=()=>{o.disconnect();env.disconnect();};
  }
  private schedule = (): void => {
    if(this.tickId)clearTimeout(this.tickId);
    const c=this.context;if(!c||c.state!=='running'||this.suspended)return;
    if(this.nextNote<c.currentTime)this.nextNote=c.currentTime+0.05;
    const melody=[0,7,9,12,7,4,2,4,0,4,7,9,14,12,9,7,4,7,12,16,14,9,7,4,2,4,7,9,7,4,2,0];
    const root=this.level==='huangjuewan'?174.614:this.level==='yangtze-cableway'?195.998:164.814,interval=60/82/2;
    while(this.nextNote<c.currentTime+0.18){
      const at=this.nextNote,n=this.step%melody.length;
      this.note(root*2**(melody[n]/12)*2,at,1.2,0.13,this.level==='crown-escalator'?'triangle':'sine');
      this.note(root*2**([0,4,7,9][this.step%4]/12),at,0.8,0.035,'triangle');
      if(this.step%8===0){
        this.note(root/2,at,interval*7,0.1,'sine');
        for(const semitone of [0,4,7])this.note(root*2**(semitone/12),at,interval*8,0.025,'sine');
      }
      this.step++;this.nextNote+=interval;
    }
    this.tickId=window.setTimeout(this.schedule,90);
  };
  private ambience(): void {
    this.sources.forEach(s=>{try{s.stop();s.disconnect();}catch{/* Stopped. */}});this.sources=[];
    const c=this.context;if(!c||!this.buses)return;
    const buffer=c.createBuffer(1,c.sampleRate*4,c.sampleRate),data=buffer.getChannelData(0);
    let previous=0;for(let i=0;i<data.length;i++){previous=(previous+(Math.random()*2-1)*0.02)/1.02;data[i]=previous*2;}
    const noise=c.createBufferSource(),filter=c.createBiquadFilter(),volume=c.createGain();
    noise.buffer=buffer;noise.loop=true;filter.type='lowpass';filter.frequency.value=this.level==='yangtze-cableway'?1100:this.level==='huangjuewan'?420:650;volume.gain.value=0.22;
    noise.connect(filter);filter.connect(volume);volume.connect(this.buses.ambient);noise.start();this.sources.push(noise);
    if(this.level!=='yangtze-cableway'){
      const machine=c.createOscillator(),gain=c.createGain();machine.frequency.value=this.level==='crown-escalator'?72:53;gain.gain.value=0.025;
      machine.connect(gain);gain.connect(this.buses.ambient);machine.start();this.sources.push(machine);
    }
  }
  effect(kind:'discover'|'arrive'|'click'|'low'|'recover'): void {
    if(!this.context||this.suspended||this.settings?.muted)return;
    const notes=kind==='arrive'?[523.25,659.25,783.99,1046.5]:kind==='recover'?[392,523.25,659.25]:kind==='discover'?[659.25,880]:kind==='low'?[220,196]:[440];
    notes.forEach((f,i)=>this.note(f,this.context!.currentTime+i*0.1,0.4,0.15,'sine','effects'));
  }
  dispose(): void {if(this.tickId)clearTimeout(this.tickId);this.sources.forEach(s=>{try{s.stop();}catch{/* Stopped. */}});void this.context?.close();}
}
