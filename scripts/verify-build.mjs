import {chromium,expect} from '@playwright/test';
import{mkdir,readdir,readFile,stat,writeFile}from'node:fs/promises';
import{gzipSync}from'node:zlib';
await mkdir('artifacts/v0.6',{recursive:true});
const results=[];
for(const channel of['chrome','msedge']){
 const browser=await chromium.launch({channel,headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://127.0.0.1:4173/?test=1');expect(await page.evaluate(()=>typeof window.__journey)).toBe('undefined');
  await page.getByRole('button',{name:/开启山城旅程/}).click();await page.getByRole('button',{name:/出发，慢慢走/}).click();
  await expect(page.locator('#surface-name')).toHaveText('佛图关站附近街巷');
  await page.keyboard.press('KeyV');
  const hold=async(codes,done)=>{for(const code of codes)await page.keyboard.down(code);try{await done();}finally{for(const code of codes)await page.keyboard.up(code);}await page.waitForTimeout(100);};
  if(channel==='msedge'){
   await hold(['KeyD','KeyS'],()=>expect(page.locator('#interaction')).toContainText('乘坐直梯',{timeout:16000}));
   await page.keyboard.press('KeyE');await expect(page.locator('#surface-name')).toHaveText('直梯上层接驳步道',{timeout:7000});
   await hold(['KeyW','KeyD'],async()=>{await expect(page.locator('#surface-name')).toHaveText('佛图关站前',{timeout:16000});await page.waitForTimeout(450);});
   await hold(['KeyW','KeyA'],()=>expect(page.locator('#interaction')).toContainText('乘坐2号线',{timeout:7000}));
  }else{
   await hold(['KeyW','KeyD'],async()=>{await expect(page.locator('#surface-name')).toHaveText('佛图关站前',{timeout:14000});await page.waitForTimeout(480);});
   await hold(['KeyD','KeyS'],()=>expect(page.locator('#interaction')).toContainText('乘坐2号线',{timeout:7000}));
  }
  const beforeRail=Number(await page.locator('#stamina-value').textContent());
  await page.keyboard.press('KeyE');await expect(page.locator('canvas')).toHaveAttribute('data-camera','ride-overview');
  await page.waitForTimeout(5000);await page.screenshot({path:'artifacts/v0.6/production-'+channel+'-rail.png'});
  await expect(page.locator('#surface-name')).toHaveText('李子坝站出站平台',{timeout:18000});
  await expect(page.locator('canvas')).toHaveAttribute('data-camera','follow');
  expect(Number(await page.locator('#stamina-value').textContent())).toBe(Math.min(100,beforeRail+20));
  await page.keyboard.press('KeyV');
  const edge=async codes=>hold(codes,async()=>{
    let last='',stable=Date.now(),began=Date.now();
    while(Date.now()-began<14000){
      const value=await page.locator('#stamina-value').textContent();
      if(value!==last){last=value;stable=Date.now();}
      if(Date.now()-began>1800&&Date.now()-stable>1000)return;
      if(await page.getByRole('dialog').count())throw new Error('Unexpected stop at boundary '+await page.locator('#surface-name').textContent());
      await page.waitForTimeout(120);
    }throw new Error('Boundary was not reached');
  });
  // A deliberate boundary route makes the production smoke independent of wall-clock/FPS speed.
  await edge(['KeyD','KeyS']);
  await edge(['KeyS','KeyA']);await expect(page.locator('#surface-name')).toHaveText('李子坝观景步道');
  await edge(['KeyW','KeyA']);await edge(['KeyW','KeyD']);
  await hold(['KeyS'],()=>expect(page.getByRole('dialog')).toContainText('赴约成功',{timeout:12000}));
  const geometry=await page.locator('canvas').evaluate(c=>({drawCalls:Number(c.dataset.drawCalls),triangles:Number(c.dataset.triangles)}));
  await page.screenshot({path:'artifacts/v0.6/production-'+channel+'-success.png',fullPage:true});
  expect(errors).toEqual([]);results.push({channel,version:browser.version(),approach:channel==='chrome'?'stairs':'lift and upper walkway',route:'actual keyboard → Fotuguan → on-track ride overview → Liziba → exit stairs → observation plaza',beforeRail,...geometry,errors,devFixtureExposed:false});
 }finally{await browser.close();}
}
const list=async dir=>(await Promise.all((await readdir(dir)).map(async n=>{const p=dir+'/'+n;return(await stat(p)).isDirectory()?list(p):[p];}))).flat();
const files=await list('dist'),bytes=(await Promise.all(files.map(p=>readFile(p)))).reduce((a,b)=>({raw:a.raw+b.length,gzip:a.gzip+gzipSync(b).length}),{raw:0,gzip:0});
const report={date:new Date().toISOString(),browsers:results,build:{files:files.length,...bytes},note:'Production build, actual keyboard events, no dev fixtures; software rendering does not prove real-device FPS or loading performance.'};
await writeFile('artifacts/v0.6/production-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
