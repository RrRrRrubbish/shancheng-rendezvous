import {chromium} from '@playwright/test';
import {writeFile,mkdir} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto('http://127.0.0.1:5173/?test=1');await page.waitForFunction(()=>window.__journey);
 await page.evaluate(()=>window.__journey.unlockAll());const levels=[];
 for(const id of['liziba','crown-escalator','yangtze-cableway','huangjuewan']){
  await page.evaluate(id=>window.__journey.load(id),id);await page.getByRole('button',{name:/出发，慢慢走/}).click();
  const result=await page.evaluate(()=>window.__journey.auditCamera());levels.push({id,...result});
 }
 const report={date:new Date().toISOString(),version:browser.version(),levels,note:'Conservative camera volume samples at road controls and representative points in other levels; 12 horizontal directions around a full turn, 6 pitches (-12, 0, 15, 35, 55, 68 degrees). Safe external framing uses local fading when a thin occluder would collapse the camera. Not proof of every continuous position or real-device performance.'};
 await mkdir('artifacts/v0.6',{recursive:true});await writeFile('artifacts/v0.6/camera-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 if(levels.some(l=>l.failures.length))process.exitCode=1;
}finally{await browser.close();}
