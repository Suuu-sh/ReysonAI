import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
let server,PlayerAnalysis,PlayStyleDashboard,playerRead,analyzePlayer;
const previousWindow=globalThis.window;
before(async()=>{server=await createServer({configFile:false,root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true,watch:null,hmr:false,ws:false},appType:'custom'});({PlayerAnalysis}=await server.ssrLoadModule('/src/trainer/PlayerAnalysis.tsx'));({PlayStyleDashboard}=await server.ssrLoadModule('/src/agent/PlayStyleDashboard.tsx'));({playerRead}=await server.ssrLoadModule('/src/agent/player-read.ts'));({analyzePlayer}=await server.ssrLoadModule('/src/trainer/player-analysis.ts'));});
after(async()=>{globalThis.window=previousWindow;await server?.close()});
const hands=n=>Array.from({length:n},(_,i)=>({at:i,returnBb:0,vpip:i%3===0,pfr:i%5===0,threeBetOpp:true,threeBet:i%10===0,facedThreeBet:false,foldedToThreeBet:false,sawFlop:false,showdown:false,wonShowdown:false}));
const history=Array.from({length:12},(_,i)=>({spotId:i<4?'UTG_open':i<8?'BB_vs_BTN':'CO_vs_UTG',hand:['AA','KK','QQ','JJ'][i%4],action:i<4?'open':'three_bet',result:'best',score:1}));
for(const locale of ['en','ja','zh-CN','es'])test(`both callers use the same complete map in ${locale}, retaining populations and point coordinates`,()=>{
 globalThis.window={localStorage:{getItem:()=>locale}};
 const read=playerRead(hands(30)),model=analyzePlayer(history);
 const drill=new JSDOM(renderToStaticMarkup(React.createElement(PlayerAnalysis,{history,onStart(){}}))).window.document;
 const agent=new JSDOM(renderToStaticMarkup(React.createElement(PlayStyleDashboard,{read}))).window.document;
 for(const [doc,source]of[[drill,'drills'],[agent,'agent']]){const map=doc.querySelector('.shared-style-map');assert.equal(map.dataset.styleSource,source);assert.equal(map.querySelectorAll('figure.play-style-map').length,1);assert.ok(map.querySelector('.shared-style-map-head h2').textContent);assert.equal(map.querySelectorAll('.shared-style-map-legend span').length,2);assert.ok(map.querySelector('.analysis-info-body p').textContent);assert.ok(map.querySelector('.play-style-map-point').getAttribute('aria-label').length>10);}
 const drillPoint=drill.querySelector('.play-style-map-point'),agentPoint=agent.querySelector('.play-style-map-point');assert.equal(drillPoint.style.left,`${model.plot.x}%`);assert.equal(drillPoint.style.top,`${model.plot.y}%`);assert.equal(agentPoint.style.left,`${50+read.map.x*44}%`);assert.equal(agentPoint.style.top,`${50-read.map.y*44}%`);
 assert.notEqual(drill.querySelector('.shared-style-map-metrics').textContent,agent.querySelector('.shared-style-map-metrics').textContent);
});
test('empty/small samples never invent a point; thresholds and clipping disclosure remain source-specific',()=>{
 globalThis.window=undefined;
 for(const n of [0,1,29]){const html=renderToStaticMarkup(React.createElement(PlayStyleDashboard,{read:playerRead(hands(n))}));assert.doesNotMatch(html,/class="play-style-map-point/);assert.match(html,/30ハンド以上で表示/)}
 const few=renderToStaticMarkup(React.createElement(PlayerAnalysis,{history:history.slice(0,9),onStart(){}}));assert.doesNotMatch(few,/class="play-style-map-point/);
 const enough=renderToStaticMarkup(React.createElement(PlayerAnalysis,{history,onStart(){}}));assert.match(enough,/あなた · 暫定/);const extreme=renderToStaticMarkup(React.createElement(PlayerAnalysis,{history:history.map(entry=>({...entry,action:'fold'})),onStart(){}}));assert.match(extreme,/記録値は変更していません/);
 const settled=renderToStaticMarkup(React.createElement(PlayStyleDashboard,{read:playerRead(hands(300))}));assert.doesNotMatch(settled,/あなた · 暫定/);
});
test('both components import StyleMap; duplicate frame/point renderers are absent',async()=>{
 const drill=await readFile(new URL('../src/trainer/PlayerAnalysis.tsx',import.meta.url),'utf8'),agent=await readFile(new URL('../src/agent/PlayStyleDashboard.tsx',import.meta.url),'utf8');
 for(const source of[drill,agent]){assert.match(source,/import \{ StyleMap, type StyleZone \} from ".*\/StyleMap\.tsx"/);assert.match(source,/<StyleMap source=/);assert.doesNotMatch(source,/function StyleMap\(|StyleMapFrame|className=.?play-style-map-point/)}
});
