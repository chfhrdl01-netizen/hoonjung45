import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read=file=>fs.readFileSync(new URL(file,import.meta.url),'utf8');
const rules=read('game-rules.mjs'),controller=read('arcade-controller.mjs');
const keys=['sneak','dodge','coins','stamp','runner','brawl','kart','doors','rhythm','basket','tray','pong','curling','bowling','volley','golf','parking','dodgeball','crown','lasers','frogger','bridge','claw','memory','sorter','receipt','safe','auction','stacker','reaction'];
const copy=value=>JSON.parse(JSON.stringify(value));
function environment({host=true,count=3,game='coins',skew=0}={}){
 let mono=0,wall=1000000000+skew;
 const roster=Array.from({length:count},(_,i)=>({id:'p'+i,name:'Player '+i,menu:'Menu '+i,department:'business'}));
 const stats={publishes:0,clears:0,sent:[],finishes:0};
 const e={console,Map,Set,WeakMap,Math,Number,String,Array,Object,Error,JSON,Date:class extends Date{static now(){return wall+mono;}},performance:{now:()=>mono},setInterval(){},setTimeout(){},netApplying:false,netPhase:'menuTournament',result:null,netSpec:{participants:copy(roster)},netIsActive:()=>true,netIsHost:()=>host,netSelfId:()=>host?'p0':'p1',netMembers:()=>roster,netDepartment:()=> 'business',netPublish:()=>stats.publishes++,notify(){},validName:s=>typeof s==='string'&&!!s,arcadeRender(){},arcadeUpdateButtons(){},arcadeClearKeys:()=>stats.clears++,arcadeOpen(){},arcadeDialog:{open:true,close(){this.open=false;}},arcadeGames:Object.fromEntries(keys.map(key=>[key,{name:key}])),rand:n=>0,netRoom:{code:'PAUSE9',onDisconnect(){},send(cmd){stats.sent.push(copy(cmd));if(host)e.api.handle('p0',cmd);return true;}},netFinishMenuTournament:()=>stats.finishes++};
 vm.createContext(e);vm.runInContext([rules,controller,'arcadeRandomGame=()=>'+JSON.stringify(game)+';',
 "this.api={get state(){return arcadeState;},init(){arcadeState=arcadeMakeState('tournament','coins',netMembers().map(m=>({...m,response:'join'})));arcadeState.purpose='lunch';arcadeState.activeIds=arcadeState.members.map(m=>m.id);arcadeStartWorld();return arcadeState;},tick:arcadeHousekeep,advance:arcadeAdvanceWorld,seconds:arcadeClockSeconds,timeline:arcadeTimelineNow,fold:arcadeSetFolded,close:arcadeClose,handle:arcadeHandle,receive:arcadeReceive,getState:arcadeGetState,validate:arcadeValidate,start:arcadeStartWorld,resolve:arcadeResolveRound,engine:arcadeEngine,forfeit:arcadeForfeit};"].join('\n'),e);
 return {e,stats,roster,api:e.api,set(value){mono=value;},shift(ms){wall+=ms;},tick(value){mono=value;e.api.tick(value);},fold(id,value){const s=e.api.state;return e.api.handle(id,{t:'arcadeFold',gameId:s.id,folded:value});},input(id,seq,action='sync',held=['right']){const s=e.api.state;return e.api.handle(id,{t:'arcadeInput',gameId:s.id,worldId:s.world.id,seq,action,held});}};
}
let frozenScenarios=0;
// Every game freezes during countdown and play, including timing/physics/survival games.
for(const game of keys)for(const phase of ['countdown','play']){
 const t=environment({game}),s=t.api.init();t.tick(phase==='countdown'?1000:3500);t.fold('p1',true);
 assert.equal(s.world.phase,phase);assert.equal(t.api.validate(t.api.getState()),true,game+' paused snapshot validates');
 const world=JSON.stringify(s.world),seconds=t.api.seconds(s.world),points=JSON.stringify(s.totalPoints);
 t.tick(90000);t.input('p0',1,'hit');t.input('p2',1);assert.equal(t.api.advance(90000),0);
 assert.equal(JSON.stringify(s.world),world,game+' cannot move, score, lose health or complete while folded');assert.equal(JSON.stringify(s.totalPoints),points);assert.equal(t.api.seconds(s.world),seconds);
 t.fold('p1',false);assert.equal(t.api.seconds(s.world),seconds,'unfolding preserves the exact remaining duration');t.tick(90128);assert(t.api.seconds(s.world)<seconds);assert.equal(s.phase,'round');frozenScenarios++;
}
// A guest with a skewed wall clock freezes at the host snapshot, even after another publish.
for(const skew of [-120000,120000]){
 const host=environment(),s=host.api.init();host.tick(4500);host.fold('p1',true);const paused=host.api.getState(),guest=environment({host:false,skew});guest.set(4500);guest.api.receive(paused);const seconds=host.api.seconds(s.world);
 guest.tick(75000);assert.equal(guest.api.seconds(guest.api.state.world),seconds);host.tick(75000);guest.api.receive(host.api.getState());assert.equal(guest.api.seconds(guest.api.state.world),seconds);assert.equal(guest.api.state.world.elapsed,s.world.elapsed);
 host.fold('p1',false);const resumed=host.api.getState();guest.api.receive(resumed);assert.equal(guest.api.seconds(guest.api.state.world),seconds);guest.tick(75100);assert(guest.api.seconds(guest.api.state.world)<seconds);const revision=guest.api.state.pauseSeq;guest.api.receive(paused);assert.equal(guest.api.state.pauseSeq,revision,'an old equal-world-sequence pause cannot overwrite a resume');
}
// Multiple folded players each release their own pause; observers and malformed commands do not pause.
{
 const t=environment(),s=t.api.init();t.tick(4000);t.fold('p1',true);const pausedAt=s.pausedAt,elapsed=s.world.elapsed;t.set(5000);t.fold('p2',true);assert.deepEqual(copy(s.pausedBy),['p1','p2']);assert.equal(s.pausedAt,pausedAt);const seq=s.pauseSeq;t.fold('p2',true);assert.equal(s.pauseSeq,seq,'duplicate requests are idempotent');
 t.fold('p0',false);assert.equal(s.pausedBy.length,2,'another participant cannot release someone else');t.fold('p1',false);t.tick(10000);assert.equal(s.pausedBy.length,1);assert.equal(s.world.elapsed,elapsed);t.fold('p2',false);assert.equal(s.pausedAt,null);t.tick(10100);assert(s.world.elapsed>1.05);
 const before=s.pauseSeq;t.api.handle('unknown',{t:'arcadeFold',gameId:s.id,folded:true});t.api.handle('p0',{t:'arcadeFold',gameId:'stale-game',folded:true});t.api.handle('p0',{t:'arcadeFold',gameId:s.id,folded:'true'});assert.equal(s.pauseSeq,before);
 s.members[2].response='pass';s.activeIds=s.activeIds.filter(id=>id!=='p2');t.fold('p2',true);assert.equal(s.pausedBy.length,0,'spectators cannot stop the match');
}
// Breaks between rounds keep their remaining delay and cannot skip ahead while folded.
{
 const t=environment(),s=t.api.init();t.tick(4000);t.api.engine.complete(s.world);t.api.resolve();assert.equal(s.phase,'between');t.set(5000);t.fold('p1',true);const remaining=s.nextAt-t.api.timeline(),round=s.round;t.tick(80000);assert.equal(s.round,round);assert.equal(s.nextAt-t.api.timeline(),remaining);assert.equal(t.api.start(),false);
 t.fold('p1',false);assert.equal(s.nextAt-t.api.timeline(),remaining);t.tick(80000+remaining-1);assert.equal(s.phase,'between');t.tick(80000+remaining);assert.equal(s.phase,'round');assert.equal(s.round,round+1);assert.equal(s.world.countdown,3);
}
// All held input is released, including a pause shorter than the input expiry window.
{
 const t=environment(),s=t.api.init();t.tick(4000);t.input('p0',1);t.tick(4080);t.fold('p1',true);const x=s.world.players[0].x;t.set(4200);t.fold('p1',false);t.tick(4280);assert.equal(s.world.players[0].x,x,'a held key from before pause cannot resume moving on its own');t.input('p0',2);t.tick(4360);assert(s.world.players[0].x>x,'a fresh input remains responsive after resume');
}
// Disconnects still count as forfeits and release the departed player's pause.
{
 const t=environment({count:4}),s=t.api.init();t.tick(4000);t.fold('p1',true);t.fold('p2',true);t.roster.splice(t.roster.findIndex(m=>m.id==='p1'),1);t.tick(9000);assert.deepEqual(copy(s.pausedBy),['p2']);assert(s.members.find(m=>m.id==='p1').forfeited);t.roster.splice(t.roster.findIndex(m=>m.id==='p2'),1);t.tick(10000);assert.equal(s.pausedBy.length,0);assert.equal(t.api.validate(t.api.getState()),true);t.tick(10100);assert(s.world.elapsed>1.05);
}
{
 const t=environment({count:2}),s=t.api.init();t.tick(4000);t.fold('p1',true);t.roster.splice(1,1);t.tick(9000);assert.equal(s.phase,'done');assert.equal(s.pausedBy.length,0);assert.equal(t.stats.finishes,1);
}
// Closing uses the real fold command; a fast reopen sends release before its acknowledgement arrives.
{
 const host=environment(),s=host.api.init(),guest=environment({host:false});host.tick(4000);guest.set(4000);guest.api.receive(host.api.getState());guest.api.close();assert.equal(guest.e.arcadeDialog.open,false);guest.api.fold(false);assert.deepEqual(guest.stats.sent.map(c=>[c.t,c.folded]),[['arcadeFold',true],['arcadeFold',false]]);for(const cmd of guest.stats.sent)host.api.handle('p1',cmd);assert.equal(s.pausedBy.length,0);
 const forged=copy(host.api.getState());for(const mutate of [p=>p.pausedBy=['p1','p1'],p=>{p.pausedBy=['unknown'];p.pausedAt=100;p.pauseSeq++;},p=>p.pausedAt=NaN,p=>p.pauseSeq=-1]){const packet=copy(forged);mutate(packet);assert.equal(host.api.validate(packet),false);}
}
// The final UI wrapper runs after game renderers that can otherwise re-enable controls.
{
 const nodes=Object.fromEntries(['arcadeOverlay','arcadeOverlayTitle','arcadeOverlayHint','arcadeStatus','arcadeBottomNote'].map(id=>[id,{hidden:true,textContent:''}])),buttons=[{disabled:true},{disabled:true}],state={pausedBy:['p1'],members:[{id:'p1',name:'Player 1'}]};
 const e={arcadeState:state,arcadeDialog:{dataset:{},querySelectorAll:()=>buttons},arcadeIsPaused:s=>!!s?.pausedBy?.length,arcadeRender(){buttons.forEach(b=>b.disabled=false);nodes.arcadeOverlay.hidden=true;},$:id=>nodes[id],arcadeSetText:(id,text)=>nodes[id].textContent=text};vm.createContext(e);vm.runInContext(read('match-pause-ui.mjs'),e);e.arcadeRender();assert(buttons.every(b=>b.disabled));assert.equal(nodes.arcadeOverlay.hidden,false);assert.equal(nodes.arcadeOverlayTitle.textContent,'일시정지');assert.match(nodes.arcadeStatus.textContent,/Player 1/);state.pausedBy=[];e.arcadeRender();assert(buttons.every(b=>!b.disabled));assert.equal(e.arcadeDialog.dataset.matchPaused,'false');
}
console.log('PASS: '+frozenScenarios+' actual-engine freeze/resume scenarios across all 30 games; guest clock skew and stale snapshots, independent fold owners, between-round delays, held-input release, disconnect recovery, quick fold/open ordering, validation and final-render controls.');
