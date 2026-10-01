import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const dir='docs/design/screenshots';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  await page.route('**/api/v1/auth/me',route=>route.fulfill({status:401,json:{detail:'Sign in'}}));
  await page.route('**/api/v1/auth/providers',route=>route.fulfill({json:{google:false,facebook:false}}));
  await page.goto('http://127.0.0.1:5173/');await page.getByRole('button',{name:'Sign in'}).waitFor();await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:dir+'/sign-in.png',fullPage:true});
  await page.unroute('**/api/v1/auth/me');await page.route('**/api/v1/auth/me',route=>route.fulfill({json:{id:'ui-fixture',name:'UI fixture',email:'fixture@example.com',csrf:'fixture'}}));
  await page.route('**/api/v1/projects',route=>route.fulfill({json:[]}));
  await page.goto('http://127.0.0.1:5173/');await page.getByRole('button',{name:'Choose video'}).waitFor();await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:dir+'/guided.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:dir+'/guided-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.route('**/api/v1/analytics*',route=>route.fulfill({json:{scope:'me',can_view_team:false,user_id:'ui-fixture',totals:{videos:0,shorts:0,exports:0,customized_shorts:0},funnel:[{label:'Videos imported',count:0},{label:'Videos prepared',count:0},{label:'Videos with shorts',count:0},{label:'Videos with exports',count:0}],jobs:[],daily:[],note:'UI fixture: no account activity.'}}));
  await page.goto('http://127.0.0.1:5173/activity');await page.getByText('Shorts generated',{exact:true}).waitFor();await page.screenshot({path:dir+'/activity.png',fullPage:true});
  console.log('Saved guided, sign-in, mobile and activity UI screenshots.');
} finally {await browser.close();}
