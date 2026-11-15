import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read=file=>fs.readFileSync(new URL(file,import.meta.url),'utf8');
const rules=read('game-rules.mjs'),controller=read('arcade-controller.mjs');
function environment({host=true,wallShift=0}={}){
 let mono=0,wall=1000000000+wallShift;
 const stats={steps:0,parses:0,publishes:0,clears:0,sent:[]},roster=[{id:'a',name:'A'},{id:'b',name:'B'}];
 const e={console,Map,Set,WeakMap,Math,Number,String,Array,Object,Error,Date:class extends Date{static now(){return wall+mono;}},performance:{now:()=>mono},JSON:{parse(...args){stats.parses++;return JSON.parse(...args);},stringify:JSON.stringify},setInterval(){},setTimeout(){},netApplying:false,netPhase:'setup',result:null,netSpec:null,netIsActive:()=>true,netIsHost:()=>host,netSelfId:()=>host?'a':'b',netMembers:()=>roster,netDepartment:()=> 'business',netPublish:()=>stats.publishes++,notify(){},arcadeRender(){},arcadeUpdateButtons(){},arcadeClearKeys(){stats.clears++;},arcadeHeld:()=>[],arcadeOpen(){},arcadeDialog:{open:false,close(){}},arcadeGames:{probe:{name:'Probe',duel:true}},rand:n=>Math.min(1,n-1),netRoom:{code:'CLOCK1',onDisconnect(){},send(cmd){stats.sent.push(cmd);return true;}}};
 vm.createContext(e);
 vm.runInContext(rules+`
const realMotion=createArcadeMotionRules;
createArcadeMotionRules=function(){return {...realMotion(),probe:{
 init(w){w.duration=24;w.meta={settledStages:0};for(const p of w.players){p.x=100;p.y=100;p.hits=0;p.hitTimes=[];}},
 input(w,p,action){if(action==='hit'){p.hits++;p.hitTimes.push(w.elapsed);}},
 step(w,dt,controls){while(w.meta.settledStages<Math.floor(w.elapsed+1e-7))w.meta.settledStages++;for(const p of w.players){if(controls.get(p.id).held.has('right'))p.x+=100*dt;p.score=w.meta.settledStages*10+p.hits;}},bot(){return {held:[]};}
}};};
const originalEngine=createArcadeEngine;
createArcadeEngine=function(){const engine=originalEngine(),step=engine.step;engine.step=function(...args){stats.steps++;return step(...args);};return engine;};
`,Object.assign(e,{stats}));
 vm.runInContext(controller+`
this.api={get state(){return arcadeState;},get previous(){return arcadePrevious;},engine:arcadeEngine,init(){arcadeState=arcadeMakeState('single','probe',netMembers().map(m=>({...m,response:'join'})));arcadeState.activeIds=arcadeState.members.map(m=>m.id);arcadeStartWorld();return arcadeState;},tick:arcadeHousekeep,advance:arcadeAdvanceWorld,handle:arcadeHandle,receive:arcadeReceive,getState:arcadeGetState,serverNow:arcadeServerNow,seconds:arcadeClockSeconds,input:arcadeInput};`,e);
 return {e,stats,api:e.api,now:()=>mono,set(value){mono=value;},wall(value){wall=value;},tick(value){mono=value;e.api.tick(value);},send(action='hit',seq=1){const s=e.api.state;return e.api.handle('a',{t:'arcadeInput',gameId:s.id,worldId:s.world.id,seq,action,held:action==='sync'?['right']:undefined});}};
}
{
 const t=environment(),s=t.api.init();t.tick(3000);assert.equal(s.world.phase,'play');const before=t.stats.steps;t.tick(4000);assert(Math.abs(s.world.elapsed-1)<.017,'a 1s stall must not become only75ms of game time');assert(t.stats.steps-before<=66,'catch-up work is bounded');assert.equal(t.api.seconds(s.world),23);
}
{
 const t=environment(),s=t.api.init();const before=t.stats.steps;t.tick(5000);assert.equal(s.world.phase,'play');assert(Math.abs(s.world.elapsed-2)<.017,'returning across countdown accounts for already elapsed play time');assert(t.stats.steps-before<=66);
}
{
 const t=environment(),s=t.api.init();t.set(2999);t.send('hit',1);assert.equal(s.world.players[0].hits,0,'countdown inputs are rejected');t.set(3000);t.send('hit',1);assert.equal(s.world.players[0].hits,1,'a new input is judged after reconciling the real countdown boundary');t.set(3500);t.send('hit',2);assert(s.world.players[0].hitTimes[1]>=.48,'new actions cannot be evaluated at a stale timing stage');
}
{
 const t=environment(),s=t.api.init();t.tick(3000);t.send('sync',1);const x=s.world.players[0].x;t.tick(5000);assert.equal(s.world.players[0].x,x,'held input older than900ms never resurrects during catch-up');t.send('sync',2);t.tick(5100);assert(s.world.players[0].x>x,'fresh held input remains responsive');
}
{
 const t=environment(),s=t.api.init();t.tick(3000);const before=t.stats.steps;t.tick(100000);assert(t.stats.steps-before<=66,'a long background suspension has bounded recovery cost');assert.equal(s.phase,'done');assert.equal(s.world.elapsed,24);assert.equal(s.world.meta.settledStages,24,'the last rule tick settles stage awards before ranking');assert.equal(s.world.ranking[0].score,240);assert.equal(s.history.length,1);t.tick(100032);t.tick(100064);assert.equal(s.history.length,1,'completion is resolved only once');
}
{
 const t=environment(),s=t.api.init();t.set(27000);t.send('hit',999);assert.equal(s.phase,'done');assert.equal(s.world.players[0].hits,0,'a delayed action arriving after the match deadline is never applied');assert.equal(s.world.ranking[0].score,240);
}
for(const shift of [-120000,120000]){
 const host=environment(),s=host.api.init();host.tick(3000);const packet=host.api.getState(),guest=environment({host:false,wallShift:shift});guest.set(3000);guest.api.receive(packet);assert.equal(guest.api.seconds(guest.api.state.world),24,'guests correct a two-minute clock skew');const steps=guest.stats.steps;guest.tick(5000);assert.equal(guest.stats.steps,steps,'guests never simulate an authoritative match');assert.equal(guest.api.seconds(guest.api.state.world),22);
 host.tick(5000);s.phase='between';s.nextAt=host.e.Date.now()+3500;guest.api.receive(host.api.getState());assert.equal(Math.ceil((guest.api.state.nextAt-guest.api.serverNow())/1000),4,'next-round countdown uses host time');
}
{
 const host=environment(),s=host.api.init();host.tick(3500);const first=host.api.getState(),guest=environment({host:false});guest.set(3500);guest.api.receive(first);guest.api.input('sync',['left']);host.tick(3600);const second=host.api.getState(),oldWorld=guest.api.state.world,before=guest.stats.parses;guest.set(3600);guest.api.receive(second);assert.equal(guest.stats.parses-before,1,'a snapshot clones its data once, without cloning the previous world again');assert.equal(guest.api.previous,oldWorld);guest.api.input('sync',['left']);assert.deepEqual(guest.stats.sent.map(c=>c.seq),[1,2],'ordinary snapshots do not reset the input nonce');const serverNow=guest.api.serverNow();guest.api.receive({...first,serverNow:first.serverNow+999999});assert.equal(guest.api.serverNow(),serverNow,'rejected stale packets cannot change the clock offset');assert.equal(guest.api.state.world.seq,second.world.seq);const publicCopy=host.api.getState();publicCopy.world.players[0].score=99999;assert.notEqual(s.world.players[0].score,99999,'published state remains an owned copy');
}
{
 const listeners=new Map(),inputs=[],node=()=>({addEventListener(){}}),context={
  console,Map,Set,Math,Number,String,el:node,setInterval(){},netIsActive:()=>false,netPhase:'setup',result:null,
  arcadeState:{world:{phase:'play'}},arcadeInput:(action,held)=>inputs.push({action,held:[...held]}),
  window:{addEventListener(type,listener){listeners.set(type,listener);}},
  document:{addEventListener(){},querySelector:()=>null},
  $:id=>id==='resultView'?{querySelector:()=>null}:null
 };
 vm.createContext(context);vm.runInContext(read('arcade-ui.mjs')+`
 arcadeInstall();
 this.hold=()=>{arcadeUIKeys.add('ArrowRight');arcadeUIPointers.set(7,'up');};
 this.held=arcadeHeld;
 `,context);
 for(const type of ['resize','orientationchange']){
  context.hold();assert.equal(context.held().length,2);listeners.get(type)();assert.equal(context.held().length,0,'rotation and resize clear keyboard and pointer state');assert.equal(inputs.at(-1).action,'sync');assert.deepEqual(inputs.at(-1).held,[],'the host receives the released control state');
  const count=inputs.length;listeners.get(type)();assert.equal(inputs.length,count,'layout callbacks without held controls do not send redundant releases');
 }
}
console.log('PASS: actual-engine bounded catch-up, zero-origin countdown, real-time deadlines and final stage scoring, stale/fresh input handling, guest clock skew and authority, snapshot ownership and nonce continuity, orientation/resize held-control release.');
