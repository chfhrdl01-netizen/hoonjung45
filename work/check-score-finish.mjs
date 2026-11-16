import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { readSource } from './assemble-source.mjs';

const read=file=>fs.readFileSync(new URL(file,import.meta.url),'utf8');
const base=readSource(),decision=read('lunch-decision.mjs');
function section(start,end){const a=base.indexOf(start),b=base.indexOf(end,a);assert(a>=0&&b>a,'source hook '+start);return base.slice(a,b);}
const finish=section('function netFinishMenuTournament(s){','\nconst menuTournamentPreviousSetup=showSetup;');
const newDuel=section('function netNewDuel(senderId,menu){','\nfunction netHandle(senderId,cmd)');
const flow=section('/* CHAMPIONSHIP_FLOW_V1 */','/* END_CHAMPIONSHIP_FLOW_V1 */');

function environment(count,{tied=false,guest=false,missingAward=false}={}){
 let now=100000;
 const members=Array.from({length:count},(_,i)=>({id:String(i),name:'Player '+i,menu:'Menu '+i,response:'join',department:'business'}));
 const shared=tied?members.slice(0,Math.min(2,count)).map(m=>m.id):['0'];
 const representative=tied?shared.at(-1):'0';
 const scores=Object.fromEntries(members.map((m,i)=>[m.id,shared.includes(m.id)?count*5:count*5-i*3]));
 const standings=members.map((m,i)=>({id:m.id,name:m.name,menu:m.menu,points:scores[m.id],rank:shared.includes(m.id)?1:i+1}));
 const state={id:'score-series-'+count+(tied?'-tie':''),mode:'tournament',purpose:'lunch',format:'points',phase:'done',members,activeIds:members.map(m=>m.id),championIds:shared,representativeId:representative,standings,history:[],totalPoints:scores,pointRounds:5,round:5,tieReason:tied?'누적 공동 1위 · 대표 메뉴 추첨':''};
 const noop=()=>{},env={console,JSON,Math,Number,String,Array,Object,Set,Map,Date:class extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}},
  host:!guest,netPhase:'menuTournament',arcadeState:state,result:null,netDuelMeta:null,netApplying:false,netInputSeen:{},duel:null,mode:'menuTournament',netReady:{},netSpec:{id:state.id},netPicks:Object.fromEntries(members.map(m=>[m.id,[m.menu]])),netDepartments:{},roster:members,
  awards:[],awardCallback:null,publishes:0,coffeeStarts:0,automaticBrawls:0,automaticFinals:0,delayedCallbacks:0,
  netIsActive:()=>true,netIsHost:()=>env.host,netSelfId:()=> '0',netMembers:()=>env.roster,netDepartment:()=> 'business',validName:s=>typeof s==='string'&&s.length>0,
  arcadeClone:s=>JSON.parse(JSON.stringify(s)),arcadePointsStandings:()=>standings.map(row=>({...row,member:members.find(m=>m.id===row.id)})),arcadeCancel:()=>{env.arcadeState=null;},menuTournamentHideView:noop,netCancelMenuTournament:()=>{throw Error('Unexpected series cancellation');},
  netRoom:{code:'SCORE1',setLocked:noop,onDisconnect:noop},renderResult:noop,netPublish:()=>env.publishes++,netPublishCombat:noop,saveRound:noop,netRoundFinished:noop,showSetup:noop,notify:noop,
  groupCancel:noop,brawlPrepare:()=>env.automaticBrawls++,netPrepareLocal:(index,menu)=>{env.duel={id:'',phase:'idle',finishLocked:false,challenger:env.roster[index].name,challengerMenu:menu};},cancelActionDuel:()=>{env.duel=null;},
  deliveryCancel:noop,deliveryGetState:()=>null,deliveryStart:()=>{env.coffeeStarts++;return true;},awardCancel:()=>{env.awardCallback=null;},
  awardStart:missingAward?undefined:(details,callback)=>{env.awards.push({...details});env.awardCallback=callback;return true;},
  combatChooseArena:()=> 'cafeteria',rand:()=>0,setInterval:noop,setTimeout:()=>{env.delayedCallbacks++;return 1;},clearTimeout:noop,
 };
 vm.createContext(env);vm.runInContext(finish+'\n'+newDuel+'\n'+decision+'\n'+flow+'\nthis.api={complete:netFinishMenuTournament,begin:championshipBegin,award:championshipAward,review:championshipReview,handle:lunchDecisionHandle,object:lunchDecisionObject,finished:lunchDecisionDuelFinished,returnReview:lunchDecisionReturnReview,tick:lunchDecisionTick,presence:lunchDecisionPresence,finalize:lunchDecisionFinalize,retain:lunchDecisionRetainScores,validate:lunchDecisionValidate,get state(){return lunchDecisionState;}};',env);
 return {env,state,advance(ms){now+=ms;env.api.tick();}};
}

for(const count of [2,3,8])for(const tied of [false,true]){
 const {env:e,state,advance}=environment(count,{tied});
 assert.equal(e.api.complete(state),true);
 assert.equal(e.netPhase,'result','the score series finishes directly on the results page');
 assert.equal(e.api.state.phase,'award','all player counts go directly to the score ceremony');
 assert.equal(e.automaticBrawls,0);assert.equal(e.automaticFinals,0);assert.equal(e.delayedCallbacks,0,'there is no delayed automatic qualifier/final');
 assert.equal(e.awards.length,1);assert.equal(e.awards[0].winnerId,state.representativeId);
 assert.deepEqual([...e.api.state.qualifiedIds],[],'no combat qualification rights are created');
 assert.deepEqual([...e.result.scoreChampionIds],[...state.championIds]);
 const ledger=JSON.stringify({champions:e.result.scoreChampionIds,winner:e.result.scoreWinnerId,scores:e.result.leagueScores,standings:e.result.scoreStandings});
 const initialCallback=e.awardCallback;e.awardCallback=null;initialCallback({reason:'completed'});
 assert.equal(e.api.state.phase,'review');
 if(tied)assert.match(e.awards.length?state.tieReason:'',/공동/);
 const defender=e.result.winnerId,challenger=e.roster.find(m=>m.id!==defender).id;
 assert.equal(e.api.object(challenger),true,'a manual menu-only appeal is still allowed after the score ceremony');
 assert.equal(e.netPhase,'duel');assert.equal(e.netDuelMeta.duelKind,'objection');
 e.result.winnerId=challenger;e.duel.phase='done';e.duel.finishLocked=true;
 assert.equal(e.api.finished(),true);advance(1900);
 assert.equal(e.api.state.phase,'review','an appeal goes back to menu approval, without a second score ceremony');
 assert.equal(e.result.winnerId,challenger,'the appeal may replace the suggested menu');
 assert.equal(JSON.stringify({champions:e.result.scoreChampionIds,winner:e.result.scoreWinnerId,scores:e.result.leagueScores,standings:e.result.scoreStandings}),ledger,'the immutable score winner and ledger survive a successful menu appeal');
 assert.equal(e.awards.length,1,'the menu challenger is never re-awarded as score champion');
 assert.equal(e.api.object(defender),false,'the defeated defender cannot chain another appeal');
 for(const m of e.roster)e.api.handle(m.id,{t:'lunchAccept',roundId:e.result.id,version:e.api.state.version});
 assert.equal(e.api.state.phase,'coffee','unanimous menu approval still starts the optional coffee flow');
 assert.equal(e.coffeeStarts,1);assert.equal(e.automaticBrawls,0);assert.equal(e.delayedCallbacks,0);
}
{
 const {env:e,state}=environment(3,{missingAward:true});assert.equal(e.api.complete(state),true);assert.equal(e.api.state.phase,'review','a missing ceremony never blocks menu approval');
}
{
 const {env:e,state}=environment(3,{guest:true});assert.equal(e.api.complete(state),false);assert.equal(e.awards.length,0,'a guest cannot decide the final ranking or ceremony');
}
const scoreLedger=result=>JSON.stringify({id:result.id,time:result.time,scoreWinnerId:result.scoreWinnerId,scoreChampionIds:result.scoreChampionIds,scoreStandings:result.scoreStandings,leagueScores:result.leagueScores,tournamentHistory:result.tournamentHistory});
for(const count of [2,3,8])for(const phase of ['award','review','duel']){
 const {env:e,state}=environment(count,{tied:true});e.api.complete(state);const ledger=scoreLedger(e.result),scoreWinner=e.result.scoreWinnerId,staleAward=e.awardCallback;
 if(phase!=='award'){e.awardCallback=null;staleAward({reason:'completed'});}
 if(phase==='duel'){assert.equal(e.api.object('0'),true);e.duel.phase='fight';}
 else e.api.state.acceptedIds=['0'];
 const beforeVersion=e.api.state.version;e.roster=e.roster.filter(p=>p.id!==scoreWinner);
 assert.equal(e.api.presence({kind:'leave',memberId:scoreWinner}),true);
 assert.equal(e.api.state.phase,'review',phase+' representative departure returns to menu review');assert.equal(e.netPhase,'result');
 assert.equal(e.result.winnerId,'0','a remaining joint champion takes over the proposed menu');assert.equal(e.api.state.version,beforeVersion+1);assert.deepEqual([...e.api.state.acceptedIds],[],'remaining players approve the transferred menu again');
 assert.equal(scoreLedger(e.result),ledger,'the completed standings, score winner, scores and history survive representative departure');assert.equal(e.duel,null);assert.equal(e.netDuelMeta,null);assert.equal(e.awardCallback,null);assert.equal(e.awards.length,1,'transferring a menu never starts a replacement ceremony');
 if(phase==='duel')assert(e.api.state.usedIds.includes('0'),'the interrupted challenger request remains spent');
 staleAward({reason:'winner-left'});assert.equal(e.api.state.phase,'review','a late ceremony callback cannot clear the retained score result');assert.equal(scoreLedger(e.result),ledger);
 assert.equal(e.api.validate(e.api.state),true,'the transferred decision remains a valid guest snapshot');
 for(const m of e.roster)e.api.handle(m.id,{t:'lunchAccept',roundId:e.result.id,version:e.api.state.version});
 assert.equal(e.api.state.phase,'coffee','even a sole remaining host can approve and continue to coffee');assert.equal(e.coffeeStarts,1);assert.equal(scoreLedger(e.result),ledger);
}
for(const path of ['award-callback','finalize','duel-finish','review']){
 const {env:e,state}=environment(3,{tied:true});e.api.complete(state);const ledger=scoreLedger(e.result),callback=e.awardCallback;
 if(path!=='award-callback'){e.awardCallback=null;callback({reason:'completed'});}
 if(path==='duel-finish'){e.api.object('0');e.duel.phase='done';e.duel.finishLocked=true;}
 e.roster=e.roster.filter(p=>p.id!=='1');
 if(path==='award-callback')callback({reason:'winner-left'});
 else if(path==='finalize')e.api.finalize();
 else if(path==='duel-finish')e.api.returnReview();
 else e.api.review();
 assert.equal(e.api.state.phase,'review',path+' fallback keeps a completed points match');assert.equal(e.result.winnerId,'0');assert.equal(scoreLedger(e.result),ledger);assert.equal(e.awards.length,1);
}
{
 const {env:e,state}=environment(3,{tied:true});state.members[2].menu=state.members[1].menu;e.api.complete(state);const ledger=scoreLedger(e.result);e.roster=e.roster.filter(p=>p.id!=='1');e.api.presence({kind:'leave',memberId:'1'});
 assert.equal(e.result.winnerId,'2','the same proposed menu can stay when another remaining participant nominated it');assert.equal(e.result.menu,'Menu 1');assert.equal(scoreLedger(e.result),ledger);
}
{
 const {env:e,state}=environment(3,{tied:true});e.api.complete(state);const cb=e.awardCallback;e.awardCallback=null;cb({reason:'completed'});const ledger=scoreLedger(e.result);e.api.object('2');e.roster=e.roster.filter(p=>p.id!=='2');e.api.presence({kind:'leave',memberId:'2'});
 assert.equal(e.api.state.phase,'review');assert.equal(e.result.winnerId,'1','a departing challenger keeps the current present menu representative');assert(e.api.state.usedIds.includes('2'));assert.equal(scoreLedger(e.result),ledger);
 e.api.handle('0',{t:'lunchReset',roundId:e.result.id,version:e.api.state.version});assert.equal(scoreLedger(e.result),ledger,'the removed reset command cannot discard the final score result');assert.equal(e.netPhase,'result');
}
{
 const {env:e,state}=environment(3,{tied:true});e.api.complete(state);e.result.leagueFormat='elimination';e.roster=e.roster.filter(p=>p.id!=='1');e.api.presence({kind:'leave',memberId:'1'});
 assert.equal(e.result,null,'legacy non-points menu decisions retain their existing departure reset');
}
console.log('PASS: 2/3/8-player score series, shared first representative, direct ceremony, immutable ledger through one-time appeals and representative departure during award/review/duel, same-menu transfer, stale callbacks, valid guest snapshots, sole-host coffee, removed reset command and non-points compatibility.');
