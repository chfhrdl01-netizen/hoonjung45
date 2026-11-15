import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { readProduction } from './read-production.mjs';
const root=new URL('../',import.meta.url),html=readProduction();
const decision=fs.readFileSync(new URL('lunch-decision.mjs',import.meta.url),'utf8');
function between(a,b){const start=html.indexOf(a),end=html.indexOf(b,start);assert(start>=0&&end>start,'source hook '+a);return html.slice(start,end);}
const originalFinish=between('function actionFinish(winner,reason){',"\n$('duelStartBtn')");
const onlineFinish=between("actionFinish=function(winner,reason){\n if(netActionOnline()",'\nactionStart=function');
const outerFinish=between('const netOldFinish=actionFinish;','\nstartRace=function');
const newDuel=between('function netNewDuel(senderId,menu){','\nfunction netHandle(senderId,cmd)');
const flow=between('/* CHAMPIONSHIP_FLOW_V1 */','/* END_CHAMPIONSHIP_FLOW_V1 */');
function environment({guest=false,withAward=false}={}){
 let now=100000,serial=1;
 class TestDate extends Date{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}}
 const noop=()=>{},roster=['a','b','c','d'].map(id=>({id,name:'Person '+id,consent:true,connected:true})),nodes=new Map(),intervals=[],disconnects=[];
 const env={console,JSON,Math,Number,String,Array,Set,Map,Date:TestDate,active:true,host:!guest,roster,netPhase:'result',netSpec:null,netDuelMeta:null,netReady:{},netPicks:Object.fromEntries(roster.map(p=>[p.id,['menu-'+p.id]])),netDepartments:{},netApplying:false,netInputSeen:{},duel:null,actionFrame:0,reduced:true,mode:'result',saved:[],publishes:0,awards:[],awardCallback:null,groupRoom:null,groupLobby:null,groupFinishing:false,brawlState:null,
  result:{id:'meal-one',winnerId:'a',person:'Person a',menu:'menu-a',time:'before',source:'tournament',provisional:true,nominations:roster.map(p=>({id:p.id,person:p.name,menus:['menu-'+p.id]})),tournamentHistory:[]},
  netRoom:{code:'ROOM12',onDisconnect:fn=>disconnects.push(fn),setLocked:noop},
  netIsActive:()=>env.active,netIsHost:()=>env.active&&env.host,netSelfId:()=>guest?'b':'a',netMembers:()=>env.roster.filter(p=>p.connected!==false),netDepartment:()=> 'business',netCopy:x=>JSON.parse(JSON.stringify(x)),validName:s=>typeof s==='string'&&s.length>0,
  rand:n=>serial++%n,renderResult:noop,showSetup:noop,notify:noop,saveRound:()=>env.saved.push(JSON.parse(JSON.stringify(env.result))),netPublish:()=>env.publishes++,netRoundFinished:noop,netPublishCombat:()=>env.publishes++,
  cancelActionDuel:()=>{env.duel=null;},cancelAnimationFrame:noop,actionReleaseAll:noop,actionControls:noop,actionRender:noop,actionOverlay:noop,beep:noop,confetti:noop,netActionOnline:()=>env.active,netActionHost:()=>env.host,
  deliveryCancel:noop,deliveryGetState:()=>null,deliveryStart:()=>true,
  $:id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:''});return nodes.get(id);},
  setInterval:fn=>{intervals.push(fn);return intervals.length;},setTimeout:()=>1,clearTimeout:noop,
  groupCancel:()=>{env.groupRoom=null;env.brawlState=null;},groupReceive:noop,netBrawlFinished:noop,
  awardCancel:()=>{env.awardCallback=null;},awardStart:(details,callback)=>{env.awards.push({...details});env.awardCallback=callback;return true;},
  netFinishMenuTournament:()=>true
 };
 env.netPrepareLocal=(index,menu)=>{env.duel={challenger:env.roster[index].name,challengerMenu:menu,defender:env.result.person,defenderMenu:env.result.menu,phase:'idle',finishLocked:false,fighters:[{hp:100},{hp:100}]};env.mode='duel';};
 vm.createContext(env);vm.runInContext(originalFinish+'\nconst netOfflineActionFinish=actionFinish;\n'+onlineFinish+'\n'+outerFinish+'\n'+newDuel+'\n'+decision+(withAward?'\n'+flow:'')+'\nthis.api={begin:lunchDecisionBegin,object:lunchDecisionObject,finish:lunchDecisionDuelFinished,review:lunchDecisionReturnReview,handle:lunchDecisionHandle,validate:lunchDecisionValidate,receive:lunchDecisionReceive,get:lunchDecisionGetState,presence:lunchDecisionPresence,clear:lunchDecisionClear,tick:lunchDecisionTick,get state(){return lunchDecisionState;}};',env);
 env.api.begin(env.result);
 env.advance=ms=>{now+=ms;for(const fn of intervals)fn();};env.disconnect=()=>disconnects.forEach(fn=>fn({self:true}));
 env.complete=side=>env.actionFinish(side,'actual finish pipeline');
 env.returnReview=()=>{env.advance(1900);assert.equal(env.api.state.phase,'review','menu appeals return to approval without another score ceremony');};
 env.send=(id,version=env.api.state.version)=>env.api.handle(id,{t:'lunchObject',roundId:env.result.id,version});
 return env;
}
{
 const e=environment();const s=e.api.state;
 e.send('b');assert.deepEqual([...s.usedIds],['b']);e.complete(0);assert.equal(e.result.winnerId,'b');assert.deepEqual([...s.usedIds],['b','a']);assert.deepEqual([...s.defeatedIds],['a']);
 e.returnReview();assert.equal(e.api.object('a'),false,'defeated former winner cannot retaliate even with correct new menu version');e.send('a');assert.equal(s.phase,'review');e.send('a',1);assert.equal(s.phase,'review');assert(!s.usedIds.includes('c'));assert(!s.usedIds.includes('d'));
 e.send('c');e.complete(0);e.returnReview();assert.deepEqual([...s.defeatedIds],['a','b']);assert.equal(e.api.object('a'),false);assert.equal(e.api.object('b'),false);assert.equal(e.api.object('c'),false,'successful initiator has still used its personal request');assert.equal(e.api.object('d'),true,'non-participant retains its one request');
 e.complete(1);e.returnReview();assert.deepEqual([...s.defeatedIds],['a','b'],'defense winner is not additionally disqualified');assert.equal(new Set(s.usedIds).size,s.usedIds.length,'repeated resolution never duplicates consumption');
}
{
 const e=environment();e.send('b');e.complete(1);e.returnReview();assert.deepEqual([...e.api.state.usedIds],['b']);assert.deepEqual([...e.api.state.defeatedIds],[]);assert(!e.api.state.usedIds.includes('a'),'winning a defense does not consume an unspent request');
}
{
 const e=environment();e.send('b');e.netPhase='result';e.duel=null;e.api.review();assert.deepEqual([...e.api.state.usedIds],['b']);assert.deepEqual([...e.api.state.defeatedIds],[],'cancellation does not count as defender loss');assert.equal(e.api.object('b'),false);assert.equal(e.api.object('c'),true);
}
{
 const e=environment();e.send('b');e.roster=e.roster.filter(p=>p.id!=='a');e.api.presence({kind:'leave',memberId:'a'});assert.equal(e.result.winnerId,'b');assert(e.api.state.defeatedIds.includes('a'),'forfeiting defense has the same no-revenge result');e.returnReview();e.roster.push({id:'a',name:'Person a',consent:true,connected:true});assert.equal(e.api.object('a'),false,'rejoining does not restore a spent defense right');
}
{
 const e=environment();e.send('b');e.roster=e.roster.filter(p=>p.id!=='b');e.api.presence({kind:'leave',memberId:'b'});e.returnReview();assert.deepEqual([...e.api.state.usedIds],['b']);assert.deepEqual([...e.api.state.defeatedIds],[],'challenger forfeit does not remove defender rights');
}
{
 const e=environment();e.netNewDuel=()=>{};assert.equal(e.api.object('b'),false);assert.deepEqual([...e.api.state.usedIds],[],'failed preparation refunds only the attempted request');assert.deepEqual([...e.api.state.defeatedIds],[]);
}
{
 const e=environment();e.send('b');e.api.state.duelKind='final';e.api.state.usedIds=[];e.complete(0);e.returnReview();assert.deepEqual([...e.api.state.usedIds],[]);assert.deepEqual([...e.api.state.defeatedIds],[],'automatic title final is not a manual objection');
}
{
 const host=environment();host.send('b');host.complete(0);
 const first=host.api.get(),guest=environment({guest:true});guest.result=JSON.parse(JSON.stringify(host.result));guest.netPhase='duel';guest.netDuelMeta=JSON.parse(JSON.stringify(host.netDuelMeta));assert.equal(guest.api.receive(first),true);assert.equal(guest.api.object('c'),false,'guest cannot initiate host mutations');
 const missingLoser=JSON.parse(JSON.stringify(first));missingLoser.defeatedIds=[];assert.equal(guest.api.validate(missingLoser),false,'finished winning objection must record the defeated defender');
 host.returnReview();guest.result=JSON.parse(JSON.stringify(host.result));guest.netPhase='result';guest.netDuelMeta=null;assert.equal(guest.api.receive(host.api.get()),true);
 const erased=host.api.get();erased.seq+=10;erased.version++;erased.usedIds=erased.usedIds.filter(id=>id!=='a');erased.defeatedIds=[];assert.equal(guest.api.validate(erased),false);assert.equal(guest.api.receive(erased),false,'newer sequence cannot erase used or defeated rights within a round');
 const malformed=host.api.get();malformed.seq+=20;malformed.defeatedIds=['d'];assert.equal(guest.api.validate(malformed),false,'loss must be represented in usedIds');
 const outsider=host.api.get();outsider.defeatedIds=['outsider'];assert.equal(guest.api.validate(outsider),false);
 guest.disconnect();assert.equal(guest.api.state,null,'room/host disconnection clears the abandoned round');
}
{
 const e=environment({withAward:true});e.api.state.championship=true;e.result.scoreWinnerId='a';e.result.scoreChampionIds=['a'];e.send('b');e.complete(0);e.returnReview();assert.deepEqual([...e.api.state.defeatedIds],['a']);assert.equal(e.api.object('a'),false,'score ceremony and review never restore former menu winner rights');assert.equal(e.awards.length,0,'a successful menu appeal does not start another score ceremony');assert.equal(e.result.scoreWinnerId,'a');assert.deepEqual([...e.result.scoreChampionIds],['a'],'the recorded cumulative champion stays unchanged');
 const next={...e.result,id:'meal-two',winnerId:'a',person:'Person a',menu:'menu-a',provisional:true};e.result=next;assert.equal(e.api.begin(next),true);assert.deepEqual([...e.api.state.usedIds],[]);assert.deepEqual([...e.api.state.defeatedIds],[],'new meal explicitly resets both rights sets');assert.equal(e.api.object('b'),true);
}
console.log('PASS: each manual request stays once; defeated defenders cannot retaliate through commands, rejoin, award or newer snapshots; winning defenders/non-participants stay eligible; cancellation, preparation failure, forfeits, automatic final, guest authority and explicit new-round reset retain their proper rights.');
