import './styles.css';
import { icon as sym } from './ui/icons';
import { enterLandscape, leaveFullscreen } from './services/display';
import { LEVELS, LEVEL_IDS, getLevel } from './data/map';
import { Game } from './domain/game';
import { COVER_IMAGE, MOBILE_COVER_IMAGE } from './data/assets';
import { LANDMARK_MEDIA } from './data/media';
import { CULTURAL_SOURCES } from './data/sources';
import type { Discovery, GameEvent, Level, LevelId, Settings, Vec3 } from './domain/types';
import { compileRoads } from './movement/roads';
import { Keyboard } from './input/keyboard';
import { TouchControls } from './input/touch';
import { AudioLandscape } from './services/audio';
import { completeLevel, defaultProgress, readProgress, unlockedCount, writeProgress } from './services/progress';
import type { StorageLike } from './services/progress';
import type { CityScene } from './scene/city';

const app=document.querySelector<HTMLDivElement>('#app')!;
const btn=(text:string,action:string,cls='button'):string=>'<button class="'+cls+'" data-action="'+action+'">'+text+'</button>';
const iconButton=(icon:string,label:string,action:string)=>'<button class="icon-button" aria-label="'+label+'" title="'+label+'" data-action="'+action+'">'+sym(icon)+'</button>';
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
let storage:StorageLike|undefined;
try{storage=window.localStorage;}catch{/* Session-only play remains available. */}
const saved=storage?readProgress(storage):{progress:defaultProgress(),warning:'浏览器无法保存设置，本次旅程仍可继续。'};
let progress=saved.progress;
let game:Game|undefined,scene:CityScene|undefined,level:Level|undefined,touch:TouchControls|undefined;
let panel='',page='cover',generation=0,phaseSeen='',accumulator=0,zoom=1;
let uiInterval=0,toastUntil=0,finishedSaved=false,cutaway=false;
let landscapeDismissed=false,displayBusy=false;
let landscapeNote='横屏视野更开阔，竖屏也能继续玩。';
let discoveryQueue:string[]=[],cardDismissed=new Set<string>(),activeDiscovery:string|undefined;
let lastEvent=0,feedbackGeneration=-1;
let feedbackQueue:GameEvent[]=[],activeFeedback:{event:GameEvent;until:number}[]=[];
const audio=new AudioLandscape();
const keys=new Keyboard(()=>interact(),()=>togglePause(),()=>{if(game&&!panel&&['exploring','riding'].includes(game.state.phase))openPanel('pause');},()=>toggleOverview(),()=>recenterCamera());
function clearInput():void { keys.clear();touch?.clear(); }
function save():void {if(storage&&!writeProgress(storage,progress))toast('进度暂未保存，本次游玩仍可继续。');}
function header():string {
  return '<header class="topbar"><button class="brand" data-action="home">'+sym('mountain')+'<span>山城赴约<small>SHANCHENG RENDEZVOUS</small></span></button><div class="header-center"><span class="tiny-dot"></span> 渝你同行 · 城市探索</div><nav aria-label="全局操作">'+iconButton(progress.settings.muted?'mute':'sound','切换声音','sound')+iconButton('book','山城札记','journal')+iconButton('settings','设置','settings')+'<span class="mobile-display">'+iconButton('fullscreen','全屏横屏','display')+'</span>'+'</nav></header>';
}
function shell(body:string):void {document.body.classList.toggle('is-playing',page==='game');app.innerHTML=header()+body+'<aside id="landscape-entry" class="landscape-entry" aria-label="显示方式" hidden><span id="landscape-note"></span>'+btn(sym('fullscreen')+' 全屏横屏','display','button secondary')+btn('继续竖屏','portrait','inline-button')+'</aside><div class="toast" role="status" aria-live="polite" hidden></div><div id="modal-root"></div>';updateDisplayEntry();}
function attachCoverImage():void {
  if(!COVER_IMAGE)return;
  const poster=app.querySelector<HTMLElement>('.cover-poster');if(!poster)return;
  const picture=document.createElement('picture');
  if(MOBILE_COVER_IMAGE){const source=document.createElement('source');source.media='(max-width: 640px)';source.srcset=import.meta.env.BASE_URL+MOBILE_COVER_IMAGE;picture.append(source);}
  const image=new Image();image.alt='重庆立体山城主视觉';image.className='cover-illustration';
  picture.append(image);
  image.onload=()=>{poster.replaceChildren(picture);poster.classList.add('has-cover-image');};
  image.src=import.meta.env.BASE_URL+COVER_IMAGE;
}
function stopRun():void {
  lastEvent=0;feedbackGeneration=-1;feedbackQueue=[];activeFeedback=[];
  discoveryQueue=[];cardDismissed.clear();activeDiscovery=undefined;
  touch?.dispose();touch=undefined;generation++;keys.enabled=false;keys.viewEnabled=false;clearInput();game?.cancel();scene?.dispose();scene=undefined;game=undefined;level=undefined;panel='';phaseSeen='';accumulator=0;
}
function cover():void {
  stopRun();page='cover';audio.pause(false);
  shell('<main class="cover"><div class="cover-lines" aria-hidden="true"></div><div class="cover-meta"><span>CHONGQING · 29°33′N 106°33′E</span><span>山城漫游手册 / VOL. 02</span></div><section class="cover-copy"><p class="eyebrow">一座山城，四次赴约</p><h1>山城<span>赴约<i>。</i></span></h1><p class="cover-intro">路有高低，生活有温度。<br>亲自走一段山城路，找到你的抵达方式。</p><div class="cover-actions">'+btn('开启山城旅程 '+sym('arrow'),'start','button primary')+btn(progress.completed.length?'继续旅程':'选择目的地','levels','button text-button')+'</div><div class="cover-controls"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / 方向键 · 手机摇杆移动</span><span>'+sym('leaf')+' 100 点体力 · 不限时</span></div></section><section class="cover-poster" aria-label="四个目的地"><div class="poster-label">山 / 城 / 行 / 记 <span>FIND YOUR WAY</span></div><div class="poster-grid">'+LEVELS.map((l,i)=>'<button class="poster-card poster-'+i+'" data-action="levels"><span class="poster-number">0'+(i+1)+'</span><div class="poster-symbol">'+sym(['rail','escalator','cable','layers'][i])+'</div><h2>'+l.name+'</h2><span class="poster-caption">'+['楼中穿行','沿高差而上','越过一江风','读懂层层路'][i]+'</span></button>').join('')+'</div><div class="poster-foot"><span>看得见的地方，<br>总有一种走法。</span><span class="round-stamp">渝<br><small>重庆</small></span></div></section><footer class="cover-footer"><span>轻量城市探索 · 键盘与触摸</span><button data-action="about">关于作品与地标资料 '+sym('arrow')+'</button><span>v0.7.0 · 立体山城探索</span></footer></main>');
  attachCoverImage();
}
function selectLevels():void {
  stopRun();page='levels';
  shell('<main class="level-select"><p class="eyebrow">YOUR NEXT DESTINATION</p><h1>今天，去哪儿赴约？</h1><p class="muted">每段旅程从 100 点体力开始。沿途发现可选，慢慢走也没关系。</p><div class="destination-grid">'+LEVELS.map((l,i)=>{
    const locked=i>=unlockedCount(progress),done=progress.completed.includes(l.id);
    return '<button class="destination-card '+(locked?'locked':'')+'" data-action="level:'+l.id+'" '+(locked?'disabled':'')+'><div class="destination-art art-'+i+'">'+sym(['rail','escalator','cable','layers'][i])+'<span>0'+(i+1)+'</span></div><div class="destination-copy"><span class="eyebrow">'+(done?'已抵达':locked?'完成前一关后开启':'可出发')+'</span><h2>'+l.name+'</h2><p>'+l.subtitle+'</p><span class="card-arrow">'+sym(done?'check':'arrow')+'</span></div></button>';
  }).join('')+'</div><div class="select-bottom">'+btn(sym('back')+' 返回封面','home','button text-button')+'<span>地标与局部空间经过游戏化简化，不作为现实导航。</span></div></main>');
}
async function enterLevel(id:LevelId):Promise<void> {
  const index=LEVEL_IDS.indexOf(id);if(index<0||index>=unlockedCount(progress))return;
  stopRun();page='loading';level=getLevel(id);
  const ticket=generation;
  shell('<main class="loading-page"><div class="loading-mark">'+sym('mountain')+'</div><p class="eyebrow">正在准备这一段旅程</p><h1>'+level.name+'</h1><p>街巷、梯道与下一次相遇。</p><div class="loading-bar"></div>'+btn('返回目的地','levels','button text-button')+'</main>');
  try {
    const {CityScene}=await import('./scene/city');
    if(ticket!==generation)return;
    game=new Game(level);page='game';progress.lastLevel=id;save();finishedSaved=false;lastEvent=0;phaseSeen='';zoom=1;cutaway=false;
    renderGame();
    const viewport=document.querySelector<HTMLElement>('#viewport')!;
    scene=new CityScene(viewport,level,frame,()=>{openPanel('graphics');});
    scene.setQuality(progress.settings.lowQuality);
    audio.setLevel(id);audio.pause(false);
    updateUI(true);
  }catch(error){
    if(ticket!==generation)return;
    console.error(error);page='error';shell('<main class="loading-page"><p class="eyebrow">这段路暂时没能打开</p><h1>场景加载遇到问题</h1><p>请使用支持 WebGL 的现代浏览器（Chrome、Edge 或 Safari），或重新加载场景。</p>'+btn('重新尝试','level:'+id,'button primary')+btn('返回目的地','levels','button text-button')+'</main>');
  }
}
function renderGame():void {
  if(!level)return;
  shell('<main class="game-layout"><aside class="journey-sidebar"><div class="chapter-overline"><span class="eyebrow">山城行记 / 0'+level.number+'</span><span>探索中</span></div><h1>'+level.name+'</h1><p class="chapter-subtitle">'+level.subtitle+'</p><div class="task-card"><span>'+sym('pin')+' 这一次的约定</span><h2>'+level.goalName+'</h2><p>'+level.intro+'</p>'+btn('查看任务与地图说明','mission','inline-button')+'</div><div class="sidebar-block"><h3>你的山城旅程 <span id="chapter-progress">'+progress.completed.length+' / 4</span></h3><div class="chapter-list">'+LEVELS.map((l,i)=>'<button data-action="level:'+l.id+'" class="chapter '+(l.id===level!.id?'active':'')+'" '+(i>=unlockedCount(progress)?'disabled':'')+'><span class="chapter-index">0'+l.number+'</span><span>'+l.name+'</span><span class="chapter-status">'+(progress.completed.includes(l.id)?sym('check'):i>=unlockedCount(progress)?'·':sym('arrow'))+'</span></button>').join('')+'</div></div><div class="sidebar-discovery"><span class="eyebrow">ALONG THE WAY</span><h3>顺路，认识重庆。</h3><p id="discovery-count">沿途发现 0 / 2</p>'+btn('翻开山城札记 '+sym('arrow'),'journal','inline-button')+'</div><div class="sidebar-bottom"><span class="tiny-dot"></span> 地标主题 · 局部简化 <button data-action="about">资料说明</button></div></aside><section class="game-stage"><div class="stage-top"><div><span class="eyebrow">第 0'+level.number+' 站 · '+level.name+'</span><p>赴约点 · '+level.goalName+'</p></div><div class="stamina-box"><div class="stamina-label">'+sym('leaf')+'<span>体力</span><strong id="stamina-value">100</strong><span>/ 100</span></div><div class="stamina-track" role="progressbar" aria-label="剩余体力" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><div id="stamina-fill"></div></div></div></div><div id="viewport" class="viewport" tabindex="0"><div class="scene-caption"><span id="surface-name"></span><small id="surface-layer"></small>'+(level.id==='huangjuewan'?'<small class="adaptation-badge">立交道路原型 · 步行改编</small>':'')+'</div><div id="event-feedback" class="event-feedback" role="status" aria-live="polite"></div><div id="floating-feedback" class="floating-feedback" aria-hidden="true"></div><div id="map-labels" class="map-labels" aria-hidden="true"></div><div class="viewport-tools">'+btn('总览 V','overview','view-button')+btn('居中 R','recenter','view-button')+iconButton('layers','切换剖面视图','cutaway')+iconButton('plus','放大场景','zoom-in')+iconButton('minus','缩小场景','zoom-out')+'</div><div class="map-legend"><span><i class="legend-goal"></i>赴约点</span><span><i class="legend-transport"></i>交通入口</span><span><i class="legend-discovery"></i>沿途发现</span></div><div id="interaction" class="interaction" hidden></div><div id="ride-banner" class="ride-banner" hidden></div><div id="discovery-card" class="discovery-card" hidden></div><div id="goal-compass" class="goal-compass"><span class="compass-arrow">'+sym('arrow')+'</span><span class="compass-text"></span></div><div class="camera-help">拖动环绕 / 仰视 · V 总览 · R 居中</div><div class="touch-controls"><div id="move-stick" class="move-stick" role="group" aria-label="移动摇杆" aria-describedby="touch-help"><span class="joystick-ring"></span><span class="joystick-knob"></span><span class="joystick-caption">移动</span></div><span id="touch-help" class="touch-help">左侧移动 · 右侧拖动观察</span></div></div><footer class="game-toolbar"><div class="key-guide"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / <span class="arrow-keys">↑ ← ↓ →</span> 移动</span><span><kbd>E</kbd> 乘坐</span><span><kbd>Esc</kbd> 暂停</span></div><div>'+btn('行程','itinerary','view-button')+iconButton('book','打开行记','journal')+iconButton('back','回歇脚点','restore-confirm')+iconButton('pause','暂停旅程','pause')+'</div></footer></section></main>');
  touch=new TouchControls(document.querySelector<HTMLElement>('#move-stick')!);
  const labels=document.querySelector('#map-labels')!;
  labels.innerHTML='<span class="world-label actor-label" data-label="actor">你在这里</span><span class="world-label goal-label" data-label="goal">'+sym('pin')+' '+level.goalName+'</span>'+level.transports.flatMap(t=>t.stops.map((s,i)=>'<span class="world-label transport-label" data-label="'+t.id+':'+i+'">'+sym(t.kind==='rail'?'rail':t.kind==='cableway'?'cable':t.kind==='escalator'?'escalator':'lift')+' '+(t.kind==='rail'?s.name:t.kind==='escalator'?s.name:t.name)+'</span>')).join('')+level.checkpoints.map(cp=>'<span class="world-label rest-label" data-rest="'+cp.id+'">'+sym('plus')+' 歇脚点 · 经过恢复 15</span>').join('')+level.discoveries.map(d=>'<span class="world-label discovery-marker-label" data-discovery-marker="'+d.id+'">'+sym('spark')+' 可选 · 地点行记</span>').join('');
}
function frame(dt:number):void {
  if(!game)return;
  if(game.state.paused){accumulator=0;}else{
    accumulator+=dt;let steps=0;
    while(accumulator>=1/60&&steps<5){const yaw=scene?.movementYaw??Math.PI/4,k=keys.direction(yaw),j=touch?.direction(yaw)??[0,0];game.update([k[0]+j[0],k[1]+j[1]],1/60);accumulator-=1/60;steps++;}
    if(steps===5)accumulator=0;
  }
  if(scene?.update(game.state,progress.settings.reducedMotion)){clearInput();accumulator=0;updateUI();}
  uiInterval+=dt;if(uiInterval>=0.04){uiInterval=0;updateUI();}
  updateLabels();
}
function setText(selector:string,value:string):void {const el=document.querySelector(selector);if(el&&el.textContent!==value)el.textContent=value;}
function updateUI(force=false):void {
  if(!game||!level||page!=='game')return;
  const s=game.state;
  scene?.update(s,progress.settings.reducedMotion);
  const autoView=scene?.viewMode==='ride-overview';
  const viewButton=document.querySelector<HTMLButtonElement>('[data-action="overview"]');
  if(viewButton){viewButton.textContent=autoView?'乘坐总览':scene?.viewMode==='overview'?'跟随 V':'总览 V';viewButton.disabled=autoView;viewButton.setAttribute('aria-pressed',String(autoView||scene?.viewMode==='overview'));}
  for(const action of['recenter','zoom-in','zoom-out']){const button=document.querySelector<HTMLButtonElement>('[data-action="'+action+'"]');if(button)button.disabled=autoView;}
  setText('.camera-help',autoView?'乘坐中自动观景 · 到站恢复跟随':'拖动环绕 / 仰视 · V 总览 · R 居中');
  app.classList.toggle('reduce-motion',progress.settings.reducedMotion);
  keys.enabled=!panel&&!s.paused&&s.phase==='exploring';
  if(touch)touch.enabled=keys.enabled;
  app.classList.toggle('input-blocked',!keys.enabled);
  keys.viewEnabled=!panel&&!s.paused&&!autoView&&['exploring','riding'].includes(s.phase);
  setText('#stamina-value',String(s.stamina>0?Math.ceil(s.stamina):0));
  const fill=document.querySelector<HTMLElement>('#stamina-fill');if(fill){fill.style.width=s.stamina+'%';fill.classList.toggle('low',s.stamina<25);}
  const meter=document.querySelector('.stamina-track');meter?.setAttribute('aria-valuenow',String(Math.ceil(s.stamina)));
  const surface=level.surfaces.find(t=>t.id===s.surfaceId);
  setText('#surface-name',s.phase==='riding'?'正在搭乘 · '+level.transports.find(t=>t.id===s.ride?.serviceId)?.name:surface?.name??'');
  const lizibaStep=level.id==='liziba'&&s.phase==='exploring'?(s.surfaceId==='liziba-plaza'?'沿观景步道前往橙旗':s.completedServices.includes('liziba-rail')?'李子坝已到站 · 沿右侧梯道出站':'先到佛图关站 · 乘2号线到李子坝'):'';
  setText('#surface-layer',lizibaStep||surface?.layer||'');
  setText('#discovery-count','沿途发现 '+s.discoveries.length+' / '+level.discoveries.length);
  const interaction=document.querySelector<HTMLElement>('#interaction')!,i=game.interaction();
  interaction.hidden=!i;
  const interactionText=i?'<button data-action="interact"><kbd>E</kbd><span><strong>'+i.title+'</strong><small>'+i.detail+'</small></span>'+sym('arrow')+'</button>':'';
  // Compare the original markup: the browser serializes SVG paths differently.
  // Rebuilding a held transport button every frame cancels native touch taps.
  if(interaction.dataset.content!==interactionText){interaction.dataset.content=interactionText;interaction.innerHTML=interactionText;}
  const ride=document.querySelector<HTMLElement>('#ride-banner')!;
  ride.hidden=s.phase!=='riding';
  if(s.ride){
    const t=level.transports.find(t=>t.id===s.ride!.serviceId)!;
    const identity=s.ride.generation+':'+s.ride.id+':'+progress.settings.reducedMotion;
    if(ride.dataset.ride!==identity){
      ride.dataset.ride=identity;
      ride.innerHTML='<span>'+sym(t.kind==='rail'?'rail':t.kind==='cableway'?'cable':t.kind==='lift'?'lift':'escalator')+' 正在'+t.name+' · 松开按键，安心看风景</span><div class="ride-track"><i></i></div>'+((s.ride.canSkip||progress.settings.reducedMotion)?btn('略过乘坐片段','skip','inline-button'):'');
    }
    const bar=ride.querySelector<HTMLElement>('.ride-track i');if(bar)bar.style.width=Math.round(s.ride.elapsed/s.ride.duration*100)+'%';
  }
  updateDiscoveryCard();
  updateFeedback();
  if(s.phase!==phaseSeen||force){phaseSeen=s.phase;if(['briefing','fatigued','success'].includes(s.phase))showRequired();}
  if(s.phase==='success'&&!finishedSaved){finishedSaved=true;progress=completeLevel(progress,level.id,s.discoveries);save();setText('#chapter-progress',progress.completed.length+' / 4');}
  const toastElement=document.querySelector<HTMLElement>('.toast');if(toastElement&&performance.now()>toastUntil)toastElement.hidden=true;
}
function updateLabels():void {
  if(!scene||!game||!level)return;
  const topInset=matchMedia('(any-pointer:coarse)').matches?72:0;
  const values:Record<string,Vec3>={actor:[game.state.position[0],game.state.position[1]+2.5,game.state.position[2]],goal:[level.goal.position[0],level.goal.position[1]+3.2,level.goal.position[2]]};
  level.transports.forEach(t=>t.stops.forEach((s,i)=>values[t.id+':'+i]=[s.position[0],s.position[1]+2.3,s.position[2]]));
  document.querySelectorAll<HTMLElement>('[data-label]').forEach(el=>{const p=values[el.dataset.label!];if(!p)return;const screen=scene!.project(p);el.hidden=!screen.visible||screen.y<topInset||(el.dataset.label==='actor'&&(scene!.viewMode==='follow'||game!.state.phase==='riding'));el.style.left=screen.x+'px';el.style.top=screen.y+'px';});
  for(const cp of level.checkpoints){
    const el=document.querySelector<HTMLElement>('[data-rest="'+cp.id+'"]');if(!el)continue;
    const distance=Math.hypot(cp.position[0]-game.state.position[0],cp.position[2]-game.state.position[2]);
    const p=scene.project(cp.position,2.1),used=game.state.consumedRests.includes(cp.id);
    el.hidden=!p.visible||p.y<topInset||(scene.viewMode==='follow'&&distance>18);el.classList.toggle('rest-used',used);
    const restLabel=sym(used?'check':'plus')+(used?' 本次已歇脚':' 歇脚点 · 经过恢复 15');if(el.dataset.used!==String(used)){el.innerHTML=restLabel;el.dataset.used=String(used);}el.style.left=p.x+'px';el.style.top=p.y+'px';
  }
  for(const d of level.discoveries){
    const el=document.querySelector<HTMLElement>('[data-discovery-marker="'+d.id+'"]');if(!el)continue;
    const p=scene.project(d.position,1.65),distance=Math.hypot(d.position[0]-game.state.position[0],d.position[2]-game.state.position[2]);
    el.hidden=!p.visible||p.y<topInset||game.state.discoveries.includes(d.id)||(scene.viewMode==='follow'&&distance>15);el.style.left=p.x+'px';el.style.top=p.y+'px';
  }
  document.querySelectorAll<HTMLElement>('[data-event-position]').forEach(el=>{
    const item=activeFeedback.find(f=>String(f.event.id)===el.dataset.eventPosition);if(!item)return;
    const p=scene!.project(item.event.position,2.1);el.hidden=!p.visible;el.style.left=p.x+'px';el.style.top=p.y+'px';
  });
  const compass=document.querySelector<HTMLElement>('#goal-compass');
  if(compass){
    const p=scene.project(values.goal),dy=level.goal.position[1]-game.state.position[1];
    compass.hidden=scene.viewMode!=='follow'||p.visible||game.state.phase==='success';
    const arrow=compass.querySelector<HTMLElement>('.compass-arrow')!;
    arrow.style.transform='rotate('+Math.atan2(p.dy,p.dx)+'rad)';
    const direction=Math.abs(dy)<1?'同层':dy>0?'上层':'下层';
    setText('.compass-text','目标方位 · '+level.goalName+' / '+direction);
  }
}
function updateFeedback():void {
  if(!game)return;
  const state=game.state,now=performance.now();
  if(feedbackGeneration!==state.generation){feedbackGeneration=state.generation;feedbackQueue=[];activeFeedback=[];document.querySelector('.stamina-box')?.classList.remove('stamina-restored');}
  for(const event of state.events.filter(e=>e.id>lastEvent)){
    lastEvent=event.id;
    if(event.kind==='message'){toast(event.text);audio.effect(state.phase==='success'?'arrive':'click');}
    else feedbackQueue.push(event);
  }
  activeFeedback=activeFeedback.filter(item=>item.until>now);
  while(activeFeedback.length<3&&feedbackQueue.length){
    const event=feedbackQueue.shift()!;activeFeedback.push({event,until:now+3600});
    audio.effect(event.kind==='discovery'?'discover':'recover');
    if(event.kind!=='discovery'&&(event.amount??0)>0){
      const meter=document.querySelector('.stamina-box');meter?.classList.remove('stamina-restored');void (meter as HTMLElement|null)?.offsetWidth;meter?.classList.add('stamina-restored');
    }
  }
  const eventRoot=document.querySelector<HTMLElement>('#event-feedback'),floating=document.querySelector<HTMLElement>('#floating-feedback');
  if(eventRoot){
    const ids=activeFeedback.map(f=>f.event.id).join(':');
    if(eventRoot.dataset.ids!==ids){
      eventRoot.dataset.ids=ids;
      eventRoot.innerHTML=activeFeedback.map(({event:e})=>'<div class="event-notice '+(e.kind==='discovery'?'event-discovery':'event-rest')+'" data-event-id="'+e.id+'"><span class="event-icon">'+sym(e.kind==='discovery'?'book':'leaf')+'</span><div><strong>'+(e.kind==='discovery'?'沿途发现 · 可选':(e.amount??0)>0?'体力 +'+Number(e.amount!.toFixed(1)):'体力已满')+'</strong><p>'+escape(e.text)+'</p></div></div>').join('');
      if(floating)floating.innerHTML=activeFeedback.map(({event:e})=>'<span class="world-feedback '+(e.kind==='discovery'?'floating-discovery':'floating-rest')+'" data-event-position="'+e.id+'">'+(e.kind==='discovery'?sym('spark')+' 新的地点行记':(e.amount??0)>0?sym('plus')+' 体力 +'+Number(e.amount!.toFixed(1)):sym('check')+' 体力已满 · 已记录')+'</span>').join('');
    }
  }
}
function toggleOverview():void {
  if(!scene||panel||scene.viewMode==='ride-overview')return;
  scene.setOverview(scene.viewMode!=='overview');clearInput();accumulator=0;
  const button=document.querySelector('[data-action="overview"]');
  if(button){button.textContent=scene.viewMode==='overview'?'跟随 V':'总览 V';button.setAttribute('aria-pressed',String(scene.viewMode==='overview'));}updateUI();
}
function recenterCamera():void {
  if(!scene||panel||scene.viewMode==='ride-overview')return;scene.recenter();clearInput();zoom=1;scene.setZoom(1);
  const button=document.querySelector('[data-action="overview"]');if(button){button.textContent='总览 V';button.setAttribute('aria-pressed','false');}updateUI();
}
function discoveryById(id:string):Discovery|undefined { return LEVELS.flatMap(l=>l.discoveries).find(d=>d.id===id); }
function discoveryMedia(d:Discovery,expanded=false):string {
  const media=d.mediaId?LANDMARK_MEDIA[d.mediaId]:undefined;
  if(!media?.src)return '<div class="media-unavailable"><span>'+sym('pin')+'</span><p>地点行记</p><small>展开行记可查看地标实景资料</small></div>';
  return '<figure class="landmark-media"><img src="'+import.meta.env.BASE_URL+escape(media.src)+'" alt="'+escape(media.alt)+'" '+(expanded?'':'loading="lazy"')+'><figcaption>'+(media.kind==='photo'?'实景照片':'AI 场景示意 · 非实景照片')+' · '+[media.author,media.license].filter(Boolean).map(escape).join(' · ')+'</figcaption></figure>';
}
function updateDiscoveryCard():void {
  if(!game)return;
  const known=new Set(game.state.discoveries);
  for(const id of [...cardDismissed])if(!known.has(id))cardDismissed.delete(id);
  discoveryQueue=discoveryQueue.filter(id=>known.has(id));
  if(activeDiscovery&&!known.has(activeDiscovery))activeDiscovery=undefined;
  for(const id of known)if(!cardDismissed.has(id)&&activeDiscovery!==id&&!discoveryQueue.includes(id))discoveryQueue.push(id);
  if(!activeDiscovery&&discoveryQueue.length)activeDiscovery=discoveryQueue.shift();
  const card=document.querySelector<HTMLElement>('#discovery-card');if(!card)return;
  const d=activeDiscovery?discoveryById(activeDiscovery):undefined;
  card.hidden=!d||game.state.phase==='success';
  if(!d){card.innerHTML='';delete card.dataset.discovery;return;}
  if(card.dataset.discovery===d.id)return;
  card.dataset.discovery=d.id;
  card.innerHTML=iconButton('close','收起地点发现','dismiss-discovery')+'<p class="eyebrow">沿途发现 · 可选</p>'+discoveryMedia(d)+'<h3>'+escape(d.title)+'</h3><p>'+escape(d.text)+'</p>'+btn('展开地点行记 '+sym('arrow'),'discovery:'+d.id,'inline-button');
}
function dismissDiscovery():void {
  if(activeDiscovery)cardDismissed.add(activeDiscovery);
  activeDiscovery=undefined;updateDiscoveryCard();
}
function showDiscovery(id:string):void {
  const d=discoveryById(id);if(!d)return;
  const known=new Set([...progress.discoveries,...(game?.state.discoveries??[])]);if(!known.has(id))return;
  panel='discovery';
    const source=Object.values(CULTURAL_SOURCES).find(s=>s.url===d.source);
    modal(d.title,'沿途发现 · 地点行记',discoveryMedia(d,true)+'<p class="dialog-lead">'+escape(d.text)+'</p>'+(source?'<p class="small muted">'+escape(source.publisher)+' · '+source.published+'<br>'+escape(source.title)+'</p>':'')+'<a href="'+d.source+'" target="_blank" rel="noopener noreferrer">查看地标实景资料 ↗</a>',btn('收好行记，继续','close','button primary'),true,true);
}
function updateDisplayEntry():void {
  const mobile=matchMedia('(any-pointer:coarse)').matches,portrait=matchMedia('(orientation:portrait)').matches;
  const entry=document.querySelector<HTMLElement>('#landscape-entry');
  if(entry)entry.hidden=!mobile||!portrait||landscapeDismissed||!!panel||page==='loading';
  setText('#landscape-note',landscapeNote);
  const button=document.querySelector<HTMLButtonElement>('.mobile-display button');
  if(button){
    const active=!!document.fullscreenElement;
    button.disabled=displayBusy;button.dataset.action=active?'exit-display':'display';button.setAttribute('aria-label',active?'退出全屏':'全屏横屏');button.title=active?'退出全屏':'全屏横屏';
    if(button.dataset.active!==String(active)){button.innerHTML=sym(active?'minimize':'fullscreen');button.dataset.active=String(active);}
  }
  const request=document.querySelector<HTMLButtonElement>('#landscape-entry [data-action="display"]');
  if(request)request.disabled=displayBusy;
}
async function requestLandscape(exit=false):Promise<void> {
  if(displayBusy)return;
  displayBusy=true;clearInput();updateDisplayEntry();
  try {
    if(exit){await leaveFullscreen();return;}
    const result=await enterLandscape();
    if(!result.locked){
      landscapeNote='可手动旋转手机，或继续竖屏游玩。';
      toast(result.fullscreen?'已进入全屏；可手动旋转手机，也可继续竖屏。':'当前浏览器不支持自动全屏横屏，竖屏仍可正常游玩。');
    }
  } finally {displayBusy=false;clearInput();accumulator=0;updateDisplayEntry();}
}
window.addEventListener('resize',updateDisplayEntry);
document.addEventListener('fullscreenchange',updateDisplayEntry);
function toast(message:string):void {const el=document.querySelector<HTMLElement>('.toast');if(el){el.textContent=message;el.hidden=false;toastUntil=performance.now()+4200;}}
function modal(title:string,eyebrow:string,body:string,actions:string,closable=true,wide=false):void {
  panel=panel||'state';if(touch)touch.enabled=false;keys.enabled=false;keys.viewEnabled=false;clearInput();game?.pause(true);audio.pause(true);
  document.querySelector('#modal-root')!.innerHTML='<div class="modal-scrim"><section class="dialog '+(wide?'dialog-wide':'')+'" role="dialog" aria-modal="true" aria-label="'+escape(title)+'">'+(closable?iconButton('close','关闭','close'):'')+'<p class="eyebrow">'+eyebrow+'</p><h2>'+title+'</h2><div class="dialog-body">'+body+'</div><div class="dialog-actions">'+actions+'</div></section></div>';
  document.querySelector<HTMLElement>('.dialog button')?.focus();updateDisplayEntry();
}
function closePanel():void {
  panel='';document.querySelector('#modal-root')!.innerHTML='';clearInput();game?.pause(false);audio.pause(false);accumulator=0;updateDisplayEntry();
  if(game&&['briefing','fatigued','success'].includes(game.state.phase))showRequired();
  else {keys.enabled=!!game;document.querySelector<HTMLElement>('#viewport')?.focus({preventScroll:true});}updateUI();
}
function showRequired():void {
  if(!game||!level)return;
  const s=game.state;panel='state';
  if(s.phase==='briefing')modal(level.name,'第 0'+level.number+' 站 · 即将出发','<p class="dialog-lead">'+level.subtitle+'</p><p>'+level.intro+'</p><div class="briefing-rules"><span>'+sym('leaf')+' 100 点体力</span><span>不限时 · 可随时停留</span></div><p class="small muted">电脑用 WASD / 方向键行走；手机用左下摇杆，右侧拖动环绕与仰视，横屏更开阔。V / 总览查看道路，R / 居中复位。交通入口按 E 或点击乘坐；青色歇脚点经过即恢复 15 点，每点每次挑战限一次。金色地点发现可选。</p><details><summary>地图与地标说明</summary><p class="small">'+level.geography+'</p></details>',btn('出发，慢慢走 '+sym('arrow'),'begin','button primary')+btn('返回目的地','levels','button text-button'),false);
  if(s.phase==='fatigued')modal('先歇一歇，再出发。','体力用尽','<p>你可以回到最近歇脚点，也可以重新开始。走得慢没有关系，停留不会消耗体力。</p><div class="checkpoint-summary"><span>'+s.checkpoint.name+'</span><strong>'+Math.ceil(s.checkpoint.snapshot.stamina)+' <small>点体力</small></strong></div><p class="small muted">回歇脚点会一起恢复当时的位置、发现与奖励记录，已领取的歇脚恢复不会再领取。</p>',btn('回到歇脚点','restore','button primary')+btn('重新开始本关','retry','button secondary')+btn('返回目的地','levels','button text-button'),false);
  if(s.phase==='success'){
    const next=LEVELS[level.number];
    modal('这一站，顺利抵达。','赴约成功 · '+level.name,'<p class="dialog-lead">山城的路，总能走出自己的答案。</p><div class="result-grid"><div><strong>'+Math.ceil(s.stamina)+'</strong><span>剩余体力</span></div><div><strong>'+s.discoveries.length+' / '+level.discoveries.length+'</strong><span>沿途发现 · 非必需</span></div><div><strong>'+s.rides+'</strong><span>交通搭乘</span></div></div><p>'+((level.discoveries.find(d=>s.discoveries.includes(d.id))??level.discoveries[0]).text)+'</p><p class="small muted">没有速度排名，错过的发现也可以下次再看。</p>',(next?btn('下一站 · '+next.name+' '+sym('arrow'),'level:'+next.id,'button primary'):btn('四站旅程，回看足迹','levels','button primary'))+btn('再走一次','retry','button secondary')+btn('山城札记','journal','button text-button'),false);
  }
}
function openPanel(kind:string):void {
  panel=kind;
  if(kind==='settings'){
    const s=progress.settings;
    modal('把旅程调成喜欢的样子。','旅程设置','<div class="setting-row"><label for="mute">总静音</label><input id="mute" type="checkbox" data-setting="muted" '+(s.muted?'checked':'')+'></div>'+(['music','ambient','effects'] as const).map((k,i)=>'<div class="setting-row"><label for="'+k+'">'+['背景音乐','城市环境声','交互音效'][i]+'</label><input id="'+k+'" aria-label="'+['背景音乐','城市环境声','交互音效'][i]+'" type="range" min="0" max="1" step="0.05" value="'+s[k]+'" data-setting="'+k+'"></div>').join('')+'<div class="setting-row"><label for="reduced">减少动态效果</label><input id="reduced" type="checkbox" data-setting="reducedMotion" '+(s.reducedMotion?'checked':'')+'></div><div class="setting-row"><label for="low">轻量画质</label><input id="low" type="checkbox" data-setting="lowQuality" '+(s.lowQuality?'checked':'')+'></div><p class="small muted">声音由操作后开启。轻量画质关闭实时投影并静止云水，保留脚下接触阴影；减少动态效果保留较轻步态，关闭起伏和环境动画。设置保存在本浏览器。</p>',btn('保存并返回','close','button primary'));
  }else if(kind==='journal'){
    const known=new Set([...progress.discoveries,...(game?.state.discoveries??[])]);
    modal('把重庆，装进行记。','山城札记','<p class="muted">不用收齐也能赴约。走到金色标记旁，就会留下一段发现。</p><div class="journal-entries">'+LEVELS.map(l=>'<section class="journal-chapter"><h3>0'+l.number+' / '+l.name+'</h3>'+l.discoveries.map(d=>'<article class="'+(known.has(d.id)?'':'undiscovered')+'"><span>'+sym(known.has(d.id)?'check':'pin')+'</span><div><h4>'+(known.has(d.id)?d.title:'还有一段风景，等你发现')+'</h4><p>'+(known.has(d.id)?d.text:'在这一站的金色标记旁停一停。')+'</p>'+(known.has(d.id)?btn('展开地点行记','discovery:'+d.id,'inline-button journal-media-link')+'<a href="'+d.source+'" target="_blank" rel="noopener noreferrer">资料来源 ↗</a>':'')+'</div></article>').join('')+'</section>').join('')+'</div>',btn('收好行记，继续','close','button primary'),true,true);
  }else if(kind==='about'||kind==='mission'){
    const l=level;
    modal(kind==='mission'&&l?l.goalName:'亲自走进山城。',kind==='mission'?'这一次的约定':'作品与地标资料','<p class="dialog-lead">'+(kind==='mission'&&l?l.intro:'通过行走感受高差，再用交通连接山城生活。')+'</p><p>电脑用 WASD / 方向键，手机用左下摇杆随镜头移动，右侧拖动环绕与仰视。V / 总览、R / 居中；E 或点击入口提示乘坐，Esc 或暂停按钮暂停。平路消耗体力，上楼消耗更多；自动乘坐不耗步行体力。轨道首次有效行程可恢复 20 点，往返不能重复领取。</p><p>每关从 100 点开始，不限时。归零可以回歇脚点或重试，停留不耗体力。经过青色歇脚点自动恢复 15 点，每点每次挑战限一次，并记录恢复后的状态。</p><p class="small"><a href="'+CULTURAL_SOURCES.mountainCity.url+'" target="_blank" rel="noopener noreferrer">市文化旅游委 · 山城特色交通与城市漫步资料 ↗</a></p><h3>地标与局部简化</h3>'+(l?'<p>'+l.geography+'</p><a href="'+l.source+'" target="_blank" rel="noopener noreferrer">'+l.sourceLabel+' ↗</a>':LEVELS.map(t=>'<p><strong>'+t.name+'</strong> · '+t.geography+' <a href="'+t.source+'" target="_blank" rel="noopener noreferrer">资料 ↗</a></p>').join(''))+'<p class="small muted">当前为地标主题试玩，局部通道研究尚未完成，不作为现实导航。暂无账号和数据上传；刷新会结束本关，保留已完成进度与设置。</p>',btn('知道了，继续','close','button primary'),true,true);
  }else if(kind==='restore-confirm'){
    if(!game)return;
    modal('回到上一处歇脚点？','恢复旅程','<p>回到'+game.state.checkpoint.name+'，恢复为 '+Math.ceil(game.state.checkpoint.snapshot.stamina)+' 点体力。之后的新发现、歇脚和交通奖励记录会一起回退。</p>',btn('回歇脚点','restore','button primary')+btn('继续走','close','button secondary'));
  }else if(kind==='graphics'){
    modal('图形环境暂时中断','场景暂停','<p>可以重新载入本关，或返回目的地。已完成关卡的进度仍会保留。</p>',btn('重载本关','level:'+level!.id,'button primary')+btn('返回目的地','levels','button secondary'),false);
  }else{
    modal('不用赶路，歇一会儿。','旅程暂停','<p>当前操作已暂停，体力不会减少。</p><div class="pause-options">'+btn('回歇脚点','restore-confirm','button secondary')+btn('重新开始本关','retry','button secondary')+btn('声音与画质','settings','button secondary')+btn('选择目的地','levels','button secondary')+'</div>',btn('继续旅程 '+sym('arrow'),'close','button primary'));
  }
}
function togglePause():void {
  if(panel){if(panel!=='state'&&panel!=='graphics')closePanel();return;}
  if(game&&['exploring','riding'].includes(game.state.phase))openPanel('pause');
}
function interact():void {game?.interact();clearInput();accumulator=0;if(game)scene?.update(game.state,progress.settings.reducedMotion);updateUI();}
function retry():void {if(!game)return;game.retry();phaseSeen='';finishedSaved=false;closePanel();updateUI();}
app.addEventListener('click',e=>{
  const element=(e.target as HTMLElement).closest<HTMLElement>('[data-action]');if(!element||element.hasAttribute('disabled'))return;
  const action=element.dataset.action!;
  if(action==='display'){void requestLandscape();return;}
  if(action==='exit-display'){void requestLandscape(true);return;}
  if(action==='portrait'){landscapeDismissed=true;updateDisplayEntry();return;}
  if(action==='sound'){
    progress.settings.muted=!progress.settings.muted;save();audio.apply(progress.settings);void audio.unlock(progress.settings);
    const b=app.querySelector('[data-action="sound"]');if(b)b.innerHTML=sym(progress.settings.muted?'mute':'sound');return;
  }
  void audio.unlock(progress.settings);
  if(action==='home'){cover();return;}
  if(action==='levels'){selectLevels();return;}
  if(action==='start'){void enterLevel('liziba');return;}
  if(action.startsWith('level:')){void enterLevel(action.slice(6) as LevelId);return;}
  if(action==='close'){closePanel();return;}
  if(action==='begin'){game?.start();progress.tutorialSeen=true;save();closePanel();updateUI();return;}
  if(action==='interact'){interact();return;}
  if(action==='dismiss-discovery'){dismissDiscovery();return;}
  if(action.startsWith('discovery:')){showDiscovery(action.slice(10));return;}
  if(action==='restore'){game?.restoreCheckpoint();phaseSeen='';finishedSaved=false;closePanel();updateUI();return;}
  if(action==='retry'){retry();return;}
  if(action==='skip'){game?.skipRide(progress.settings.reducedMotion);updateUI();return;}
  if(action==='overview'){toggleOverview();return;}
  if(action==='recenter'){recenterCamera();return;}
  if(action==='itinerary'){document.querySelector('.game-layout')?.classList.toggle('sidebar-open');return;}
  if(action==='cutaway'){cutaway=!cutaway;scene?.setCutaway(cutaway);element.setAttribute('aria-pressed',String(cutaway));return;}
  if(action==='zoom-in'||action==='zoom-out'){zoom+=action==='zoom-in'?0.12:-0.12;zoom=Math.max(0.75,Math.min(1.55,zoom));scene?.setZoom(zoom);updateLabels();return;}
  openPanel(action);
});
app.addEventListener('input',e=>{
  const input=e.target as HTMLInputElement,k=input.dataset.setting as keyof Settings|undefined;if(!k)return;
  const v=input.type==='checkbox'?input.checked:Number(input.value);
  Object.assign(progress.settings,{[k]:v});audio.apply(progress.settings);save();scene?.setQuality(progress.settings.lowQuality);
  const b=app.querySelector('[data-action="sound"]');if(b)b.innerHTML=sym(progress.settings.muted?'mute':'sound');
});
app.addEventListener('error',e=>{
  const img=e.target;
  if(img instanceof HTMLImageElement&&img.closest('.landmark-media')){
    const fallback=document.createElement('div');fallback.className='media-unavailable';
    fallback.textContent='图片暂时无法显示，可继续阅读行记或查看来源资料。';img.replaceWith(fallback);
  }
},true);
app.addEventListener('keydown',e=>{
  if(e.key!=='Tab'||!panel)return;
  const focusable=[...app.querySelectorAll<HTMLElement>('.dialog button,.dialog a,.dialog input,.dialog summary')].filter(el=>!el.hasAttribute('disabled'));
  const first=focusable[0],last=focusable.at(-1);
  if(e.shiftKey&&document.activeElement===first){last?.focus();e.preventDefault();}
  if(!e.shiftKey&&document.activeElement===last){first?.focus();e.preventDefault();}
});
cover();if(saved.warning)toast(saved.warning);
if(import.meta.env.DEV&&new URLSearchParams(location.search).has('test')){
  Object.assign(window,{__journey:{
    state:()=>game?structuredClone(game.state):undefined,
    progress:()=>structuredClone(progress),
    place:(surface:string,position:Vec3,stamina?:number)=>{if(game){game.state.surfaceId=surface;game.state.position=[...position];if(stamina!==undefined)game.state.stamina=stamina;game.state.phase='exploring';closePanel();updateUI();}},
    advance:(seconds:number)=>{if(game){for(let t=0;t<seconds;t+=1/60)game.update([0,0],1/60);updateUI();}},
    move:(direction:[number,number],seconds:number)=>{if(game){for(let t=0;t<seconds;t+=1/60)game.update(direction,1/60);updateUI();}},
    interact:()=>interact(),
    unlockAll:()=>{progress.completed=[...LEVEL_IDS];save();},
    load:(id:LevelId)=>enterLevel(id),
    pause:()=>openPanel('pause'),
    camera:()=>scene?.cameraInfo(),
    signs:()=>scene?.signInfo(),
    auditCamera:()=>scene?.auditCamera(),
    road:(id:string)=>level?.network?structuredClone(compileRoads(level.network).roads.find(r=>r.road.id===id)?.points):undefined,
    network:()=>level?.network?structuredClone(level.network):undefined,
    walkTo:(point:Vec3)=>{if(!game)return;for(let i=0;i<4000;i++){const [x,,z]=game.state.position,dx=point[0]-x,dz=point[2]-z,d=Math.hypot(dx,dz);if(d<0.025||game.state.phase==='success')break;const before=[...game.state.position];game.update([dx/d,dz/d],Math.min(1/60,d/3));if(before.every((v,j)=>Math.abs(v-game!.state.position[j])<1e-8))throw new Error('Walk blocked at '+before.join(',')+' to '+point.join(','));}updateUI();},
    media:(id:string,patch:Partial<(typeof LANDMARK_MEDIA)[string]>)=>{if(LANDMARK_MEDIA[id])Object.assign(LANDMARK_MEDIA[id],patch);},
  }});
}
