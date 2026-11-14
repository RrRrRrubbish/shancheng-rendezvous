import { test, expect, type Page } from '@playwright/test';

const runtimeErrors=new WeakMap<Page,string[]>();
test.beforeEach(({page})=>{const errors:string[]=[];runtimeErrors.set(page,errors);page.on('pageerror',error=>errors.push(String(error)));});
test.afterEach(({page})=>{expect(runtimeErrors.get(page)??[],'uncaught browser errors').toEqual([]);});

async function start(page:Page):Promise<void>{
 await page.goto('/?test=1');
 await page.getByRole('button',{name:/开启山城旅程/}).click();
 await page.getByRole('button',{name:/出发，慢慢走/}).click();
 await expect(page.locator('.city-canvas')).toBeVisible();
 await page.waitForFunction(()=>!(window as any).__journey.state().paused);
}
const state=(page:Page)=>page.evaluate(()=>(window as any).__journey.state());
const place=(page:Page,surface:string,position:number[],stamina=80)=>page.evaluate(({surface,position,stamina})=>(window as any).__journey.place(surface,position,stamina),{surface,position,stamina});
test('cover is separate from gameplay and only the first destination starts unlocked',async({page})=>{
 await page.goto('/');
 await expect(page.getByRole('heading',{name:/山城\s*赴约。/})).toBeVisible();
 await expect(page.locator('canvas')).toHaveCount(0);
 await page.getByRole('button',{name:'选择目的地',exact:true}).click();
 await expect(page.locator('.destination-card')).toHaveCount(4);
 await expect(page.locator('.destination-card:disabled')).toHaveCount(3);
 await expect(page.locator('.destination-copy h2')).toHaveText(['李子坝','皇冠大扶梯','长江索道','黄桷湾立交']);
});
test('WASD and arrows really move the character, release stops and clicking the map does not select a route',async({page})=>{
 await start(page);
 await page.keyboard.down('KeyD');await page.waitForFunction(()=>(window as any).__journey.state().distance>0.8);await page.keyboard.up('KeyD');
 await page.waitForTimeout(80);const a=await state(page);expect(a.stamina).toBeLessThan(100);
 await page.waitForTimeout(180);expect((await state(page)).stamina).toBe(a.stamina);
 await page.locator('#viewport').click({position:{x:400,y:260}});await page.waitForTimeout(100);expect((await state(page)).position).toEqual(a.position);
 await page.keyboard.down('ArrowLeft');await page.waitForTimeout(350);await page.keyboard.up('ArrowLeft');
 await expect.poll(async()=>(await state(page)).position[0]).toBeLessThan(a.position[0]);
});
test('blur pauses movement and resume clears held keys',async({page})=>{
 await start(page);
 await page.keyboard.down('KeyD');await page.waitForTimeout(150);
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
 await expect(page.getByRole('dialog')).toContainText('旅程暂停');
 const before=await state(page);await page.waitForTimeout(250);expect((await state(page)).stamina).toBe(before.stamina);
 await page.keyboard.up('KeyD');await page.getByRole('button',{name:/继续旅程/}).click();
 const after=await state(page);await page.waitForTimeout(200);expect((await state(page)).position).toEqual(after.position);
 await page.keyboard.down('ArrowRight');await expect.poll(async()=>(await state(page)).stamina).toBeLessThan(after.stamina);await page.keyboard.up('ArrowRight');
});
test('E boards a lift and the passenger arrives without held input or stamina charge',async({page})=>{
 await start(page);await place(page,'quay',[-15,0,10],64);
 await expect(page.locator('#interaction')).toContainText('乘坐直梯');await page.keyboard.press('KeyE');
 await expect.poll(async()=>(await state(page)).phase).toBe('riding');
 await page.keyboard.press('KeyV');await expect(page.locator('.city-canvas')).toHaveAttribute('data-camera','overview');
 await expect.poll(async()=>(await state(page)).surfaceId,{timeout:7000}).toBe('skywalk');
 const s=await state(page);expect(s.stamina).toBe(64);expect(s.position).toEqual([-15,6,10]);
});
test('localized occlusion keeps whole layers opaque and manual cutaway spends no resources',async({page})=>{
 await start(page);await place(page,'quay',[-15,0,10],64);
 await expect(page.locator('.city-canvas')).toHaveAttribute('data-cutaway','false');
 await place(page,'quay',[-28,0,10],64);
 await expect(page.locator('.city-canvas')).toHaveAttribute('data-cutaway','false');
 const before=await state(page);
 await page.getByRole('button',{name:'切换剖面视图'}).click();
 await expect(page.locator('.city-canvas')).toHaveAttribute('data-cutaway','true');
 expect((await state(page)).position).toEqual(before.position);expect((await state(page)).stamina).toBe(before.stamina);
});
test('rail restores 20 only once and reverse travel cannot farm stamina',async({page})=>{
 await start(page);await place(page,'terrace',[-24,6,-5],55);await page.keyboard.press('KeyE');
 await page.evaluate(()=>(window as any).__journey.advance(11));
 expect((await state(page)).stamina).toBe(75);expect((await state(page)).surfaceId).toBe('arrival');
 await page.keyboard.press('KeyE');await page.evaluate(()=>(window as any).__journey.advance(11));
 expect((await state(page)).stamina).toBe(75);expect((await state(page)).surfaceId).toBe('terrace');
});
test('fatigue has a recovery path and restart invalidates a previous ride',async({page})=>{
 await start(page);await place(page,'quay',[-28,0,10],0.02);
 await page.keyboard.down('KeyD');await expect(page.getByRole('dialog')).toContainText('体力用尽');await page.keyboard.up('KeyD');
 expect((await state(page)).stamina).toBe(0);
 await page.getByRole('button',{name:'回到歇脚点',exact:true}).click();expect((await state(page)).stamina).toBe(100);expect((await state(page)).position).toEqual([-26,0,10]);
 await place(page,'quay',[-15,0,10],60);await page.keyboard.press('KeyE');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'重新开始本关',exact:true}).click();
 await page.evaluate(()=>(window as any).__journey.advance(6));expect((await state(page)).stamina).toBe(100);expect((await state(page)).rides).toBe(0);
});
test('checkpoint restores the full run and newly discovered notes roll back',async({page})=>{
 await start(page);await place(page,'terrace',[-29,6,-5],64);await page.evaluate(()=>(window as any).__journey.advance(0.1));
 expect((await state(page)).checkpoint.id).toBe('liziba-station');
 await place(page,'arrival',[5,6,-3],60);await page.evaluate(()=>(window as any).__journey.advance(0.1));
 expect((await state(page)).discoveries).toContain('liziba-building');
 await page.getByRole('button',{name:'山城札记',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('列车从楼中经过');
 await page.getByRole('button',{name:'收好行记，继续',exact:true}).click();
 await page.getByRole('button',{name:'回歇脚点',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'回歇脚点',exact:true}).click();
 const s=await state(page);expect(s.stamina).toBe(79);expect(s.consumedRests).toContain('liziba-station');expect(s.position).toEqual([-29,6,-5]);expect(s.discoveries).toEqual([]);
});
test('four success screens unlock the next destination and persist on reload',async({page})=>{
 await start(page);
 const goals=[['liziba-plaza',[12,0,14]],['lianglukou',[8,8,-10]],['south-street',[25,2,-1]],['junction-goal',[22,20,-20]]] as const;
 for(let i=0;i<goals.length;i++){
   await place(page,goals[i][0],[...goals[i][1]],25);await page.evaluate(()=>(window as any).__journey.advance(0.05));
   await expect(page.getByRole('dialog')).toContainText('赴约成功');
   await expect.poll(async()=>page.evaluate(()=>(window as any).__journey.progress().completed.length)).toBe(i+1);
   if(i<3){await page.getByRole('button',{name:/下一站 ·/}).click();await page.getByRole('button',{name:/出发，慢慢走/}).click();}
 }
 await page.getByRole('button',{name:'四站旅程，回看足迹'}).click();
 await expect(page.locator('.destination-card:disabled')).toHaveCount(0);
 await page.reload();await page.getByRole('button',{name:'继续旅程',exact:true}).click();
 await expect(page.locator('.destination-card:disabled')).toHaveCount(0);
});
test('settings persist, three sound buses work independently and keyboard focus stays in the dialog',async({page})=>{
 await page.goto('/?test=1');await page.getByRole('button',{name:'设置',exact:true}).click();
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'设置',exact:true}).click();
 await page.getByLabel('总静音',{exact:true}).check();await page.getByLabel('背景音乐',{exact:true}).fill('0.15');await page.getByLabel('城市环境声',{exact:true}).fill('0.6');await page.getByLabel('减少动态效果',{exact:true}).check();
 await page.getByRole('button',{name:'保存并返回'}).click();await page.reload();await page.getByRole('button',{name:'设置',exact:true}).click();
 await expect(page.getByLabel('总静音',{exact:true})).toBeChecked();await expect(page.getByLabel('背景音乐',{exact:true})).toHaveValue('0.15');await expect(page.getByLabel('城市环境声',{exact:true})).toHaveValue('0.6');await expect(page.getByLabel('减少动态效果',{exact:true})).toBeChecked();
 await page.getByRole('button',{name:'保存并返回'}).focus();await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'关闭',exact:true})).toBeFocused();
});
test('old three-level saves stay intact without completing the new landmarks',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('shancheng-rendezvous:progress:v1',JSON.stringify({schemaVersion:1,sound:false,unlocked:3,completed:['L01','L02','L03']})));
 await page.goto('/?test=1');await page.getByRole('button',{name:'选择目的地',exact:true}).click();
 await expect(page.locator('.destination-card:disabled')).toHaveCount(3);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('shancheng-rendezvous:progress:v1')!).unlocked)).toBe(3);
});
test('corrupt and blocked storage keep the cover and game playable',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('shancheng-rendezvous:progress:v2','{bad'));
 await start(page);expect((await state(page)).stamina).toBe(100);
 await page.context().addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked');}}));
 await page.reload();await page.getByRole('button',{name:/开启山城旅程/}).click();await page.getByRole('button',{name:/出发，慢慢走/}).click();await expect(page.locator('.city-canvas')).toBeVisible();
});
test('desktop layout and a narrow cover stay inside the viewport',async({page})=>{
 await page.setViewportSize({width:1366,height:768});await start(page);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(1366);
 await expect(page.locator('.game-toolbar')).toBeInViewport();await expect(page.locator('.city-canvas')).toBeInViewport();
 await page.getByRole('button',{name:/山城赴约\s+SHANCHENG/}).click();
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
 await expect(page.getByRole('button',{name:/开启山城旅程/})).toBeVisible();
});

test('third-person camera follows the character, mouse orbit changes WASD axes, and overview spends no stamina',async({page})=>{
 await start(page);
 await expect(page.locator('.city-canvas')).toHaveAttribute('data-camera','follow');
 const initial=await state(page);
 await page.keyboard.down('KeyD');await page.waitForFunction(()=>(window as any).__journey.state().position[0]>-25.5);await page.keyboard.up('KeyD');
 await expect.poll(async()=>page.evaluate(()=>Math.abs((window as any).__journey.camera().target[0]-(window as any).__journey.state().position[0]))).toBeLessThan(0.15);
 const before=await state(page),bounds=(await page.locator('canvas').boundingBox())!;
 await page.mouse.move(bounds.x+450,bounds.y+400);await page.mouse.down();await page.mouse.move(bounds.x+764,bounds.y+400,{steps:12});await page.mouse.up();
 expect((await state(page)).position).toEqual(before.position);expect((await state(page)).stamina).toBe(before.stamina);
 const yaw=await page.evaluate(()=>(window as any).__journey.camera().yaw);expect(yaw).toBeCloseTo(-Math.PI/2,2);
 await page.keyboard.down('KeyW');await page.waitForFunction(({x})=>(window as any).__journey.state().position[0]>x+0.5,{x:before.position[0]});await page.keyboard.up('KeyW');
 expect(Math.abs((await state(page)).position[2]-before.position[2])).toBeLessThan(0.9);
 await page.keyboard.press('KeyR');await expect.poll(()=>page.evaluate(()=>(window as any).__journey.camera().yaw)).toBe(0);
 const stopped=await state(page);await page.keyboard.press('KeyV');
 await expect(page.locator('.city-canvas')).toHaveAttribute('data-camera','overview');await page.waitForTimeout(150);
 expect((await state(page)).stamina).toBe(stopped.stamina);expect((await state(page)).position).toEqual(stopped.position);
 await page.keyboard.press('KeyV');await expect(page.locator('.city-canvas')).toHaveAttribute('data-camera','follow');
 expect(initial.position).not.toEqual((await state(page)).position);
});

test('rest nodes activate without E, show a one-time reward and cannot be farmed by restoring',async({page})=>{
 await start(page);await place(page,'terrace',[-29,6,-5],50);
 await expect.poll(async()=>(await state(page)).stamina).toBe(65);
 await expect(page.locator('#interaction')).toBeHidden();
 await place(page,'terrace',[-26,6,-5],30);await place(page,'terrace',[-29,6,-5],30);
 await page.evaluate(()=>(window as any).__journey.advance(0.2));expect((await state(page)).stamina).toBe(30);
 await page.getByRole('button',{name:'回歇脚点',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'回歇脚点',exact:true}).click();
 expect((await state(page)).stamina).toBe(65);await page.evaluate(()=>(window as any).__journey.advance(2));expect((await state(page)).stamina).toBe(65);
});

test('optional discovery card is nonblocking, expands with pause, can be dismissed and reopens from the journal',async({page})=>{
 await start(page);await place(page,'quay',[-20,0,12],70);
 await expect(page.locator('#discovery-card')).toBeVisible();await expect(page.locator('#discovery-card')).toContainText('先找入口，再看远方');
 expect((await state(page)).paused).toBe(false);expect((await state(page)).stamina).toBe(70);
 await page.keyboard.down('KeyA');await page.waitForTimeout(200);await page.keyboard.up('KeyA');expect((await state(page)).stamina).toBeLessThan(70);
 await page.getByRole('button',{name:/展开地点行记/}).click();await expect(page.getByRole('dialog')).toContainText('先找入口，再看远方');
 expect((await state(page)).paused).toBe(true);const paused=await state(page);await page.keyboard.press('KeyW');expect((await state(page)).position).toEqual(paused.position);
 await expect(page.getByRole('link',{name:'查看地标实景资料 ↗'})).toHaveAttribute('href',/^https:/);
 await page.getByRole('button',{name:'收好行记，继续',exact:true}).click();expect((await state(page)).paused).toBe(false);
 await page.getByRole('button',{name:'收起地点发现'}).click();await expect(page.locator('#discovery-card')).toBeHidden();
 await page.getByRole('button',{name:'山城札记',exact:true}).click();
 await page.getByRole('button',{name:'展开地点行记',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('先找入口，再看远方');
});


test('local media renders with an AI label and an image failure leaves the discovery usable',async({page})=>{
 await start(page);
 await page.route('**/media/fixture.png',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="480" height="240"><rect width="480" height="240" fill="#d7e1cb"/></svg>'}));
 await page.evaluate(()=>(window as any).__journey.media('liziba',{src:'media/fixture.png',kind:'ai-illustration',author:'fixture',license:'test only'}));
 await place(page,'quay',[-20,0,12],70);
 await expect(page.locator('#discovery-card img')).toBeVisible();
 await expect(page.locator('#discovery-card figcaption')).toContainText('AI 场景示意 · 非实景照片');
 await page.getByRole('button',{name:/展开地点行记/}).click();await expect(page.getByRole('dialog').locator('img')).toBeVisible();
 await page.getByRole('button',{name:'收好行记，继续',exact:true}).click();await page.getByRole('button',{name:'收起地点发现'}).click();
 await page.route('**/media/missing.png',route=>route.fulfill({status:404,body:'missing'}));
 await page.evaluate(()=>(window as any).__journey.media('liziba',{src:'media/missing.png'}));
 await place(page,'arrival',[5,6,-3],65);
 await expect(page.locator('#discovery-card')).toContainText('图片暂时无法显示');
 expect((await state(page)).paused).toBe(false);
 await page.getByRole('button',{name:/展开地点行记/}).click();await expect(page.getByRole('dialog')).toContainText('列车从楼中经过');
 await expect(page.getByRole('link',{name:'查看地标实景资料 ↗'})).toBeVisible();
});
