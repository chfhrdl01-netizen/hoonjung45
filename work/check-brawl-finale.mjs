import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');
const source=read('game-rules.mjs')+'\n'+read('arcade-controller.mjs');
const keys=['sneak','dodge','runner','coins','stamp','brawl','kart','doors','rhythm','basket','tray','pong','curling','bowling','volley','golf','parking','dodgeball','crown','lasers','frogger','bridge','claw','memory','sorter','receipt','safe','auction','stacker','reaction'];
const copy=value=>JSON.parse(JSON.stringify(value));
function setup(count,purpose='arcade',host=true){
 let now=0,finishes=0;const roster=Array.from({length:count},(_,i)=>({id:'p'+i,name:'Player '+i,menu:'menu-'+i,department:i%2?'accounting':'business'}));
 const e={console,Map,Set,WeakMap,Math,Number,String,Array,Object,Error,JSON,Date:class extends Date{static now(){return 1e9+now;}},performance:{now:()=>now},setInterval(){},setTimeout(){},netApplying:false,netPhase:purpose==='lunch'?'menuTournament':'setup',result:null,netSpec:{participants:roster},netIsActive:()=>true,netIsHost:()=>host,netSelfId:()=> 'p0',netMembers:()=>roster,netDepartment:()=> 'business',netPublish(){},notify(){},arcadeRender(){},arcadeUpdateButtons(){},arcadeClearKeys(){},arcadeOpen(){},arcadeDialog:{open:false,close(){}},arcadeGames:Object.fromEntries(keys.map(key=>[key,{name:key}])),validName:s=>typeof s==='string'&&s.length>0,rand:n=>Math.max(0,n-1),deptPracticeRequire:()=>true,deptPracticeChoice:'accounting',netRoom:{code:'BRAWL5',onDisconnect(){},send(){return true;}},netFinishMenuTournament(){finishes++;}};
 vm.createContext(e);vm.runInContext(source+`\nthis.api={get state(){return arcadeState;},get clock(){return arcadeClock;},engine:arcadeEngine,start:arcadeStartWorld,resolve:arcadeResolveRound,forfeit:arcadeForfeit,validate:arcadeValidate,handle:arcadeHandle,demo:arcadeDemoStart,init(mode='tournament'){arcadeState=arcadeMakeState(mode,'brawl',netMembers().map(m=>({...m,response:'join'})));arcadeState.purpose=${JSON.stringify(purpose)};arcadeState.activeIds=arcadeState.members.map(m=>m.id);arcadeStartWorld();return arcadeState;}};`,e);
 return {api:e.api,e,roster,get finishes(){return finishes;},setNow:value=>{now=value;},finish(scores){for(const [i,p]of e.api.state.world.players.entries())p.score=scores?.[p.id]??(count-i)*10;e.api.engine.complete(e.api.state.world);e.api.resolve();}};
}
for(const count of [2,3,8])for(const purpose of ['lunch','arcade']){
 const t=setup(count,purpose),s=t.api.init(),randomGames=[];
 for(let round=0;round<4;round++){
  assert.equal(s.world.players.length,count);assert.equal(s.world.meta.partyRespawn,true);assert.equal(s.world.meta.finale,false);assert.notEqual(s.world.game,'brawl');randomGames.push(s.world.game);
  t.finish();assert.equal(s.pointRounds,round+1);assert.equal(s.phase,'between');assert(s.world.players.every(p=>!p.forfeited));t.api.start();
 }
 assert.equal(new Set(randomGames).size,4,'the first four games are distinct and exclude the finale');
 assert.equal(s.world.game,'brawl');assert.equal(s.world.meta.finale,true);assert.equal(s.world.duration,30);assert.equal(t.api.clock.end-t.api.clock.countdownEnd,30000,'the host deadline includes all thirty seconds');assert.equal(s.world.players.length,count);assert(s.world.players.every(p=>p.hp===100&&p.health===3&&!p.eliminated));
 const before={...s.totalPoints};t.finish();assert.equal(s.pointRounds,5);assert.equal(s.phase,'done');assert.equal(s.history.length,5);assert.equal(s.history[4].game,'brawl');assert(s.history.every(h=>!h.outIds.length));
 for(const [i,p]of s.members.entries())assert.equal(s.totalPoints[p.id]-before[p.id],count-i,'finale uses ordinary rank points with no multiplier');
 assert.equal(t.api.validate(copy(s)),true);assert.equal(t.api.start(),false,'there is no sixth round or winner-only duel');assert.equal(t.finishes,purpose==='lunch'?1:0);
}
// A departed player does not force repeats or remove the remaining players from the finale.
{
 const t=setup(8),s=t.api.init();t.finish();for(const p of t.roster.slice(2))t.api.forfeit(p.id);
 while(s.phase==='between'){t.api.start();assert.equal(s.world.players.length,2);t.finish();}
 assert.equal(s.pointRounds,5);assert.equal(s.history[4].game,'brawl');assert.equal(new Set(s.history.slice(0,4).map(h=>h.game)).size,4);assert.equal(t.api.validate(copy(s)),true);assert(s.championIds.every(id=>['p0','p1'].includes(id)));
}
// The actual solo entry point uses the same finale and the explicitly chosen avatar.
{
 const t=setup(4);assert.equal(t.api.demo('coins','tournament'),true);const s=t.api.state;assert.equal(s.members[0].department,'accounting');
 while(s.phase!=='done'){if(s.phase==='between')t.api.start();t.finish();}
 assert.equal(s.history.length,5);assert.equal(s.history[4].game,'brawl');assert(s.history.slice(0,4).every(h=>h.game!=='brawl'));
}
// Points brawl rewards an attacking trade and returns a knocked-out player safely.
{
 const t=setup(3),s=t.api.init();for(let i=0;i<4;i++){t.finish();t.api.start();}const w=s.world,[attacker,target,idle]=w.players;
 w.phase='play';w.elapsed=5;attacker.x=300;attacker.y=230;attacker.faceX=1;attacker.faceY=0;target.x=365;target.y=230;target.hp=16;idle.x=630;idle.y=400;
 t.api.engine.input(w,attacker.id,{seq:1,action:'hit'},5000);assert.equal(target.deaths,1);assert.equal(target.eliminated,false);assert.equal(target.hp,100);assert.equal(target.hurtUntil,6);assert(Math.hypot(target.x-attacker.x,target.y-attacker.y)>100);assert.match(w.meta.notice,/800점/);
 attacker.deaths=1;attacker.damageDealt=100;attacker.knockouts=1;attacker.hp=100;t.api.engine.step(w,.02,5020);assert(attacker.score>idle.score,'one KO and one death still rewards active damage over camping');
 let now=5020;while(w.phase!=='done'){now+=20;t.api.engine.step(w,.02,now);}assert(Math.abs(w.elapsed-30)<1e-8);assert(w.players.every(p=>!p.eliminated&&!p.forfeited),'all players remain eligible until the deadline');
}
// Ordinary single brawl keeps survival rules, and guest attempts cannot run the series.
{
 const t=setup(2),s=t.api.init('single');assert.equal(s.world.game,'brawl');assert.equal(s.world.duration,24);assert.notEqual(s.world.meta.partyRespawn,true);
 const guest=setup(3,'arcade',false),g=guest.api.init(),before=copy(g);assert.equal(guest.api.start(),false);guest.api.handle('p0',{t:'arcadeInput',gameId:g.id,worldId:'forged',seq:1,action:'hit'});assert.deepEqual(copy(g),before);
}
console.log('PASS: 4 distinct random non-brawl games then a 30-second whole-party brawl for 2/3/8 players and solo; ordinary final-round points, no sixth round, shared participation, forfeits, active-trade reward, protected respawn, preserved single survival and host authority.');
