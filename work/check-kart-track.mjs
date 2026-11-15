import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const source=fs.readFileSync(new URL('./game-rules.mjs',import.meta.url),'utf8');
const renderer=fs.readFileSync(new URL('./source/scripts/arcade-renderers.js',import.meta.url),'utf8');
const context=vm.createContext({Math,Map,Set,WeakMap,Number,Array,Object,String,Error});
vm.runInContext(source+'\nthis.api={point:arcadeKartTrackPoint,path:arcadeKartTrackPath,data:arcadeKartTrackData,engine:createArcadeEngine(),rule:createArcadeCombatKartRules().kart};',context);
const {point,path,data,engine,rule}=context.api,tau=Math.PI*2;
const near=(a,b,message)=>assert(Math.abs(a-b)<1e-7,message);
assert(data().length>1400&&data().length<2300,'the circuit has a complete driving loop');
const straightSamples=[];
for(let i=0;i<1000;i++){
 const angle=i/1000*tau-Math.PI/2,p=point(angle),plus=point(angle,1),minus=point(angle,-1);
 for(const q of [p,plus,minus]){assert(Number.isFinite(q.x)&&Number.isFinite(q.y));assert(q.x>40&&q.x<660&&q.y>40&&q.y<420);near(Math.hypot(q.tx,q.ty),1,'normalized course tangent');}
 near(Math.hypot(plus.x-p.x,plus.y-p.y),24,'outer lane follows the same normal');near(Math.hypot(minus.x-p.x,minus.y-p.y),24,'inner lane follows the same normal');
 near((plus.x-p.x)*p.tx+(plus.y-p.y)*p.ty,0,'lanes stay perpendicular to the course');
 if(Math.abs(p.ty)<1e-7)straightSamples.push(p);
 const closed=point(angle+tau,1);near(closed.x,plus.x,'closed circuit x');near(closed.y,plus.y,'closed circuit y');
}
assert(straightSamples.length>150,'long horizontal straights replace the continuously turning ellipse');
assert(straightSamples.some(p=>p.y>265&&p.y<270),'the inward bottom chicane is part of the driving line');
assert(!/NaN|Infinity|undefined/.test(path(0)));assert(path().startsWith('M')&&path().endsWith(' Z'));
const participants=n=>Array.from({length:n},(_,i)=>({id:'p'+i,name:'Racer '+i,department:'business'}));
// A visibly aligned puddle must hit even in a staggered starting row.
{
 const w={game:'kart',elapsed:1,players:participants(8).map((p,index)=>({...p,index,forfeited:false,eliminated:false})),objects:[],meta:{}};rule.init(w,()=>.5);w.meta.nextHazardAt=99;w.elapsed=1;
 const p=w.players[6],dt=.02;p.progress=.5;const angle=(p.progress+.142*dt)*tau-Math.PI/2+p.visualOffset,pos=point(angle,p.lane);
 w.objects=[{id:'aligned',kind:'puddle',angle,lane:p.lane,x:pos.x,y:pos.y,readyAt:0,until:10,hitIds:[]}];
 const controls=new Map(w.players.map(p=>[p.id,{held:new Set(['up'])}]));rule.step(w,dt,controls,()=>.5);assert.equal(p.hitCount,1,'collision uses the actual displayed car position');
 near(p.x,pos.x);near(p.y,pos.y);rule.step(w,dt,controls,()=>.5);assert.equal(p.hitCount,1,'one hazard cannot charge the same racer repeatedly');
}
function run(count,seed){
 const w=engine.create({id:'kart:'+count+':'+seed,game:'kart',participants:participants(count),seed});w.meta.partyRespawn=false;w.meta.pointsStage='regular';const seq=new Map(w.players.map(p=>[p.id,0]));let now=0,nextThink=0;
 while(w.phase!=='done'&&now<30000){
  now+=20;
  if(w.phase==='play'&&now>=nextThink){nextThink=now+160;for(const p of w.players){const intent=engine.bot(w,p.id),s=seq.get(p.id);engine.input(w,p.id,{seq:s+1,action:'sync',held:intent.held},now);if(intent.action)engine.input(w,p.id,{seq:s+2,action:intent.action},now);seq.set(p.id,s+2);}}
  engine.step(w,.02,now);
  for(const p of w.players){const q=point(p.angle+(p.visualOffset||0),p.lane);near(p.x,q.x);near(p.y,q.y);assert(!p.eliminated);assert(p.progress>=0&&p.progress<=3);}
  for(const o of w.objects){const q=point(o.angle,o.lane);near(o.x,q.x,'hazard x on course');near(o.y,q.y,'hazard y on course');}
 }
 assert.equal(w.phase,'done');assert.equal(w.ranking.length,count);assert(w.players.some(p=>p.finishAt>=0),'accelerating bots can finish the circuit');assert(JSON.stringify(w).length<65536);return JSON.stringify(w);
}
for(const count of [2,8])for(const seed of [7,7191])assert.equal(run(count,seed),run(count,seed),'seeded races are deterministic');
// Validate the actual renderer's generated vector surface against the shared geometry.
const begin=renderer.indexOf('function arcadeKartCircuitSvg(){'),end=renderer.indexOf('\nlet arcadeTenChoices=',begin);assert(begin>=0&&end>begin);
vm.runInContext(renderer.slice(begin,end),context);const svg=context.arcadeKartCircuitSvg();
assert(svg.includes(path())&&svg.includes(path(-.5))&&svg.includes(path(.5)),'road and both dividers use the same projection as the racers');
assert(svg.includes('START / FINISH')&&svg.includes('kart-finish-line')&&svg.includes('kart-track-guard'));
assert(!renderer.includes("scene.append(el('div','ten-kart-track')"),'the obsolete ellipse is not built');
execFileSync('python3',['-c','import sys,xml.etree.ElementTree as E; root=E.fromstring(sys.stdin.read()); assert root.attrib["viewBox"]=="0 0 700 460"'],{input:svg});
new vm.Script(renderer);
console.log('PASS: shared closed arc-length circuit, long straights and chicane, three normal-offset lanes, finite bounds, aligned hazard contacts, 2/8-player deterministic completion, and actual SVG rails/dividers/start line use the same course.');
