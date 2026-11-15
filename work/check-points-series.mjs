import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read=file=>fs.readFileSync(new URL(file,import.meta.url),'utf8');
const rules=read('game-rules.mjs'),controller=read('arcade-controller.mjs');
const keys=['sneak','dodge','runner','coins','stamp','brawl','kart','doors','rhythm','basket','tray','pong','curling','bowling','volley','golf','parking','dodgeball','crown','lasers','frogger','bridge','claw','memory','sorter','receipt','safe','auction','stacker','reaction'];
const copy=value=>JSON.parse(JSON.stringify(value));
function environment({count=3,purpose='arcade',host=true}={}){
 let mono=0;const stats={finishes:[],draws:[]},roster=Array.from({length:count},(_,i)=>({id:'p'+i,name:'Player '+i,department:'business',menu:'menu-'+i}));
 const e={console,Map,Set,WeakMap,Math,Number,String,Array,Object,Error,JSON,deptPracticeRequire:()=>true,deptPracticeChoice:'business',Date:class extends Date{static now(){return 1000000000+mono;}},performance:{now:()=>mono},setInterval(){},setTimeout(){},netApplying:false,netPhase:purpose==='lunch'?'menuTournament':'setup',result:null,netSpec:{participants:roster},netIsActive:()=>true,netIsHost:()=>host,netSelfId:()=> 'p0',netMembers:()=>roster,netDepartment:()=> 'business',netPublish(){},notify(){},arcadeRender(){},arcadeUpdateButtons(){},arcadeClearKeys(){},arcadeOpen(){},arcadeDialog:{open:false,close(){}},arcadeGames:Object.fromEntries(keys.map(key=>[key,{name:key}])),validName:value=>typeof value==='string'&&value.length>0,rand:n=>{stats.draws.push(n);return Math.max(0,n-1);},netRoom:{code:'POINTS',onDisconnect(){},send(){return true;}},netFinishMenuTournament:s=>stats.finishes.push(copy(s))};
 vm.createContext(e);vm.runInContext(rules+'\n'+controller+`
 this.api={get state(){return arcadeState;},init(mode='tournament'){arcadeState=arcadeMakeState(mode,'coins',netMembers().map(m=>({...m,response:'join'})));arcadeState.purpose=${JSON.stringify(purpose)};arcadeState.activeIds=arcadeState.members.map(m=>m.id);arcadeStartWorld();return arcadeState;},invite:arcadeInvite,demo:arcadeDemoStart,start:arcadeStartWorld,resolve:arcadeResolveRound,finish:arcadePointsFinish,final:arcadePointsFinal,standings:arcadePointsStandings,forfeit:arcadeForfeit,validate:arcadeValidate,receive:arcadeReceive,handle:arcadeHandle,getState:arcadeGetState,engine:arcadeEngine};`,e);
 return {e,api:e.api,roster,stats,set(value){mono=value;},complete(scores){const s=e.api.state;for(const p of s.world.players){const raw=scores[p.id]??0;p.score=raw;if(s.world.meta.roundSurvival){p.eliminated=true;p.health=0;if('hp' in p)p.hp=0;p.fallAt=raw/1000;p.survived=p.fallAt;}}e.api.engine.complete(s.world);e.api.resolve();return s;}};
}
function runFive(t,scoreForRound){
 const s=t.api.init();for(let round=0;round<5;round++){
  assert.equal(s.phase,'round');assert.equal(s.world.players.length,t.roster.length,'low scorers remain in every round');assert.equal(s.world.meta.partyRespawn,false);assert.equal(s.world.meta.tiebreak,false);
  t.complete(Object.fromEntries(t.roster.map((p,i)=>[p.id,scoreForRound(round,i)])));
  assert.equal(s.pointRounds,round+1);assert.equal(s.history.length,round+1);assert(s.history.every(h=>!h.outIds.length&&!h.tiebreak));assert.equal(t.api.validate(copy(s)),true,'a complete legitimate series snapshot validates');
  if(round<4){assert.equal(s.phase,'between');assert.equal(s.activeIds.length,t.roster.length);t.api.start();}
 }
 assert.equal(s.phase,'done');assert.equal(s.round,5);assert.equal(s.pointsTiebreaks,0);assert.equal(s.pointsStage,'regular');assert.equal(s.tiebreakIds.length,0);return s;
}

// Both shared lunch and ordinary practice use the same five-round score rules.
for(const purpose of ['lunch','arcade'])for(let count=2;count<=8;count++){
 const t=environment({count,purpose}),s=runFive(t,(round,i)=>round===0?i*10:i===0?1000:((i+round)%(count-1))*10);
 const best=Math.max(...Object.values(s.totalPoints));assert(s.championIds.length);assert(s.championIds.every(id=>s.totalPoints[id]===best));assert(s.championIds.includes(s.representativeId));
 assert.equal(t.stats.finishes.length,purpose==='lunch'?1:0);assert.equal(t.api.start(),false,'no sixth or finalist-only game can start');
 const before=copy(s),draws=t.stats.draws.length;t.api.finish();t.api.final(s);assert.deepEqual(copy(s),before,'repeated completion cannot change the winner or draw again');assert.equal(t.stats.draws.length,draws);
}
// A rough first game does not remove anyone, and a player can still recover to first.
{
 const t=environment(),s=runFive(t,(round,i)=>round===0?[0,20,10][i]:[30,20,10][i]);
 assert.deepEqual(copy(s.championIds),['p0']);assert.deepEqual(copy(s.totalPoints),{p0:13,p1:11,p2:6});assert.equal(s.history[0].results.find(p=>p.id==='p0').rank,3);assert.equal(t.api.standings(s)[0].id,'p0');
}
// Equal in-game results receive equal points, and equal totals keep a shared final rank.
{
 const t=environment({count:4,purpose:'lunch'}),s=runFive(t,()=>100);
 assert.deepEqual(copy(s.totalPoints),{p0:20,p1:20,p2:20,p3:20});assert.deepEqual(copy(s.championIds),['p0','p1','p2','p3']);assert.equal(s.representativeId,'p3');assert.match(s.tieReason,/공동 1위/);assert.equal(t.api.standings(s).filter(p=>p.rank===1).length,4);
 assert.equal(s.history.length,5);assert.equal(s.round,5);assert.equal(t.stats.finishes.length,1);
 const forged=mutate=>{const packet=copy(s);mutate(packet);assert.equal(t.api.validate(packet),false);};
 forged(p=>p.totalPoints.p0++);forged(p=>p.championIds=['p0']);forged(p=>p.representativeId='missing');forged(p=>p.pointsStage='tiebreak');forged(p=>p.tiebreakIds=['p0','p1']);forged(p=>p.pointRounds=6);forged(p=>p.history[0].outIds=['p0']);forged(p=>p.world.meta.partyRespawn=true);forged(p=>{p.activeIds=p.activeIds.slice(1);});forged(p=>{delete p.format;});
 forged(p=>{p.history[0].results[1].rank=2;p.history[0].pointAwards[1].points=3;p.totalPoints.p1--;p.championIds=p.championIds.filter(id=>id!=='p1');});
 forged(p=>{p.history[0].results=p.history[0].results.filter(r=>r.id!=='p0');p.history[0].pointAwards=p.history[0].pointAwards.filter(r=>r.id!=='p0');p.totalPoints.p0-=4;p.championIds=p.championIds.filter(id=>id!=='p0');});
}
// A lower total may never be promoted by a forged final state.
{
 const t=environment(),s=runFive(t,(_,i)=>30-i*10),packet=copy(s);packet.championIds=['p2'];packet.representativeId='p2';assert.equal(t.api.validate(packet),false);
}
// Leaving is a real forfeit, not a ranking elimination: remaining players still finish.
{
 const t=environment({count:4}),s=t.api.init();t.complete({p0:0,p1:20,p2:10,p3:100});const earned=s.totalPoints.p3;t.api.forfeit('p3');assert.equal(s.phase,'between');
 for(let round=1;round<5;round++){t.api.start();assert.equal(s.world.players.length,3);assert(!s.world.players.some(p=>p.id==='p3'));t.complete({p0:30,p1:20,p2:10});assert.equal(t.api.validate(copy(s)),true);}
 const departed=t.api.standings(s).find(p=>p.id==='p3');assert.equal(departed.points,earned);assert.equal(departed.rank,null);assert.equal(departed.forfeited,true);assert(!s.championIds.includes('p3'));assert.equal(s.round,5);
}
{
 const t=environment(),s=t.api.init();s.world.players.find(p=>p.id==='p2').score=999;t.api.forfeit('p2');t.complete({p0:20,p1:10,p2:999});assert.equal(s.totalPoints.p2,0,'forfeiting cannot bank a high raw score');assert.equal(s.activeIds.length,2);assert.equal(t.api.validate(copy(s)),true);
 t.api.forfeit('p1');assert.equal(s.phase,'done');assert.deepEqual(copy(s.championIds),['p0']);assert.match(s.notice,/기권/);assert.equal(t.api.validate(copy(s)),true);
}
// Random-series invitations are already score-based; observers do not get a rank.
{
 const t=environment();assert.equal(t.api.invite('p0','tournament','coins'),true);const s=t.api.state;assert.equal(t.api.validate(copy(s)),true);for(const [id,response]of [['p0','join'],['p1','join'],['p2','pass']])t.api.handle(id,{t:'arcadeReply',gameId:s.id,response});
 assert.equal(s.phase,'round');assert.equal(s.format,'points');assert.equal(s.world.players.length,2);assert.equal(t.api.standings(s).length,2);assert.equal(t.api.validate(copy(s)),true);
}
{
 const t=environment();assert.equal(t.api.demo('coins','tournament'),true);assert.equal(t.api.state.format,'points');assert.equal(t.api.state.world.meta.partyRespawn,false);assert.equal(t.api.state.difficulty,'normal');
 const single=environment();assert.equal(single.api.init('single').format,undefined);assert.equal(single.api.validate(copy(single.api.state)),true,'single games retain their own rules');
}
{
 const host=environment(),s=host.api.init(),guest=environment({host:false});guest.api.receive(host.api.getState());const packet=copy(guest.api.state);guest.api.handle('p0',{t:'arcadeForfeit',gameId:s.id});assert.deepEqual(copy(guest.api.state),packet,'guests cannot mutate authoritative series outcomes');
}
console.log('PASS: five complete rounds for every participant in 2–8 player lunch/practice series; comeback wins, equal-rank points and shared champions without extra games, one representative draw, forfeits, spectators, guest authority and forged cumulative/leaderboard snapshots.');
