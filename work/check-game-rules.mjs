import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('./game-rules.mjs',import.meta.url),'utf8');
new vm.Script(source);
const api=vm.runInNewContext('(function(){'+source+'\nreturn {engine:createArcadeEngine(),rules(){return {...createArcadeMotionRules(),...createArcadeSkillRules(),...createArcadeCombatKartRules(),...createArcadeSocialRhythmRules(),...createArcadeBasketRules(),...createArcadeTrayRules(),...createArcadeSportsRules(),...createArcadeActionPackRules(),...createArcadeBrainPackRules()};}};})()');
const expected=['sneak','dodge','runner','coins','stamp','brawl','kart','doors','rhythm','basket','tray','pong','curling','bowling','volley','golf','parking','dodgeball','crown','lasers','frogger','bridge','claw','memory','sorter','receipt','safe','auction','stacker','reaction'];
assert.deepEqual(Object.keys(api.rules()).sort(),[...expected].sort(),'all thirty games, including the transit pack, must be actual registered rules');
const participants=n=>Array.from({length:n},(_,index)=>({id:'p'+index,name:'Player '+index,department:'business'}));
const copy=v=>JSON.parse(JSON.stringify(v));
function assertFinite(v,path='world'){
 if(typeof v==='number')assert.ok(Number.isFinite(v),'non-finite number at '+path);
 else if(Array.isArray(v))v.forEach((item,i)=>assertFinite(item,path+'['+i+']'));
 else if(v&&typeof v==='object')for(const [key,value]of Object.entries(v))assertFinite(value,path+'.'+key);
}
function world(game,{party=false,n=2,elapsed=5}={}){
 const rule=api.rules()[game],w={id:'focused-'+game,game,phase:'play',elapsed,duration:24,players:participants(n).map((p,index)=>({...p,index,x:0,y:0,score:0,health:3,eliminated:false,forfeited:false,stunUntil:0,actionUntil:0})),objects:[],meta:{}};
 rule.init(w,()=>.5);if(party)w.meta.partyRespawn=true;
 return {w,rule,controls:new Map(w.players.map(p=>[p.id,{held:new Set()}]))};
}

// A late finisher must still beat a bridge that has not reached the far bank.
{
 const {w,rule,controls}=world('bridge',{elapsed:27.8}),[finisher,unfinished]=w.players;
 finisher.x=finisher.laneX;finisher.y=260;finisher.bridgeSteps=15;finisher.carried=1;
 unfinished.bridgeSteps=15;unfinished.carried=3;
 assert.equal(rule.input(w,finisher,'hit'),true);assert.equal(finisher.finishedAt,27.8);
 rule.step(w,.02,controls,()=>.5);
 assert.ok(finisher.score>unfinished.score,'crossing the bridge at the deadline cannot score less than an unfinished bridge');
 const late=finisher.score;finisher.finishedAt=12;rule.step(w,.02,controls,()=>.5);assert.ok(finisher.score>late,'earlier completion still has its time bonus');
}
// Zero is a valid vertical facing value: horizontal frog leaps stay horizontal.
for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){
 const {w,rule}=world('frogger'),p=w.players[0];p.col=5;p.row=4;p.faceCol=dx;p.faceRow=dy;p.x=300;p.y=262;w.players[1].col=0;w.players[1].row=0;
 assert.equal(rule.input(w,p,'dash'),true);assert.equal(p.col,5+dx*2);assert.equal(p.row,4+dy*2);
 assert.equal(rule.input(w,p,'dash'),false,'two-cell leaps still obey their cooldown');
}
// The points rounds recover players; ordinary survival and 1v1 rules retain knockouts.
for(const party of [false,true]){
 const {w,rule,controls}=world('brawl',{party}),[attacker,target]=w.players;
 attacker.x=300;attacker.y=230;attacker.faceX=1;attacker.faceY=0;target.x=365;target.y=230;target.hp=16;
 rule.input(w,attacker,'hit');
 if(!party){assert.equal(target.eliminated,true);assert.equal(target.hp,0);rule.step(w,.02,controls);assert.equal(w.meta.roundOver,true);}
 else{
  assert.equal(target.eliminated,false);assert.equal(target.hp,100);assert.equal(target.health,3);assert.equal(target.deaths,1);assert.ok(target.hurtUntil>=w.elapsed+1);assert.ok(Math.hypot(target.x-attacker.x,target.y-attacker.y)>100);
  rule.step(w,.02,controls);assert.equal(w.meta.roundOver,false);assert.ok(attacker.score>target.score,'a knockout recovery must cost points rather than offer a free heal');
  w.elapsed=7;attacker.hitReadyAt=0;target.x=365;target.y=230;target.hp=16;rule.input(w,attacker,'hit');assert.equal(target.deaths,2);assert.equal(target.eliminated,false);assert.ok(target.score>=0);assertFinite(w);
 }
 const tray=world('tray',{party}),falling=tray.w.players[0];falling.x=-30;falling.y=230;tray.rule.step(tray.w,.02,tray.controls,()=>.5);
 if(!party){assert.equal(falling.eliminated,true);assert.equal(tray.w.meta.roundOver,true);}
 else{
  assert.equal(falling.eliminated,false);assert.equal(falling.deaths,1);assert.equal(falling.health,3);assert.equal(tray.w.meta.roundOver,false);
  const tile=tray.w.objects.find(o=>falling.x>=o.x&&falling.x<o.x+o.width&&falling.y>=o.y&&falling.y<o.y+o.height);assert.ok(tile&&tile.goneAt>tray.w.elapsed+.5,'return to a floor tile that is still safe');
  const position=[falling.x,falling.y];tray.w.elapsed+=.2;tray.controls.get(falling.id).held.add('right');tray.rule.step(tray.w,.02,tray.controls,()=>.5);assert.deepEqual([falling.x,falling.y],position,'the recovery shield must prevent another immediate shove/fall');
  tray.w.elapsed+=1.1;falling.x=-30;tray.rule.step(tray.w,.02,tray.controls,()=>.5);assert.equal(falling.deaths,2);assert.equal(falling.eliminated,false);assertFinite(tray.w);
 }
}
{
 const tray=world('tray',{party:true,n:8});for(const p of tray.w.players){p.x=-30;p.y=-30;}tray.rule.step(tray.w,.02,tray.controls,()=>.5);
 assert.ok(tray.w.players.every(p=>!p.eliminated&&p.deaths===1));assert.equal(tray.w.meta.roundOver,false);assertFinite(tray.w);
}

// Rank ties are shared and a forfeited high score can never win.
{
 const w=api.engine.create({id:'ranking',game:'coins',seed:19,participants:participants(4)});w.players[0].score=9;w.players[1].score=9;w.players[2].score=1;w.players[3].score=999;api.engine.forfeit(w,'p3');api.engine.complete(w);
 assert.deepEqual([...w.winnerIds],['p0','p1']);assert.deepEqual(Array.from(w.ranking,p=>p.rank),[1,1,3,4]);assert.equal(w.ranking.at(-1).id,'p3');
 const frozen=JSON.stringify(w);assert.equal(api.engine.input(w,'p0',{seq:1,action:'hit'},5000),false);assert.equal(api.engine.step(w,.02,5000),false);assert.equal(JSON.stringify(w),frozen,'the result cannot change after the finish');
}

function run(game,n,seed,party){
 const w=api.engine.create({id:game+':'+n+':'+seed+':'+party,game,seed,participants:participants(n)});if(party)w.meta.partyRespawn=true;
 const seq=new Map(w.players.map(p=>[p.id,0]));let now=0,nextThink=0,maxObjects=0,maxSnapshot=0,steps=0;
 assert.ok(w.duration>0&&w.duration<=60);assert.equal(w.phase,'countdown');
 assert.equal(api.engine.input(w,'p0',{seq:1,action:'hit'},0),false,'countdown never accepts a premature action');
 const clone=copy(w),cloneBefore=JSON.stringify(clone);assert.equal(api.engine.step(clone,.02,20),false);assert.equal(api.engine.complete(clone),false);assert.equal(api.engine.forfeit(clone,'p0'),false);assert.equal(JSON.stringify(clone),cloneBefore,'a guest snapshot has no simulation authority');
 while(w.phase!=='done'&&steps<4000){
  now+=20;steps++;
  if(w.phase==='play'&&now>=nextThink){nextThink=now+180;for(const p of w.players){if(p.eliminated||p.forfeited)continue;const intent=api.engine.bot(w,p.id);assert.ok(Array.isArray(intent.held),game+' bot direction contract');let s=seq.get(p.id);assert.equal(api.engine.input(w,p.id,{seq:++s,action:'sync',held:[...intent.held]},now),true);if(intent.action)assert.equal(api.engine.input(w,p.id,{seq:++s,action:intent.action},now),true);assert.equal(api.engine.input(w,p.id,{seq:s,action:'hit'},now),false,'replayed commands must be ignored');seq.set(p.id,s);}}
  api.engine.step(w,.02,now);maxObjects=Math.max(maxObjects,w.objects.length);assert.ok(w.objects.length<=220,game+' snapshot object cap');assert.ok(w.elapsed<=w.duration+1e-8);assert.ok(w.countdown>=0);
  for(const p of w.players){assert.ok(Number.isFinite(p.score));assert.ok(Number.isInteger(p.health)&&p.health>=0&&p.health<=3);assert.ok(p.x>=-100&&p.x<=800&&p.y>=-100&&p.y<=560,game+' public actor bounds');if(party){assert.equal(p.eliminated,false,game+' points round must never sideline a player');assert.equal(p.forfeited,false,game+' rules must not turn a mistake into a series forfeit');}}
  if(steps%20===0){assertFinite(w);maxSnapshot=Math.max(maxSnapshot,JSON.stringify(w).length);}
 }
 assert.equal(w.phase,'done',game+' must reach a terminal result');assert.ok(now<=64000,game+' must have a bounded round time');assert.equal(w.ranking.length,n);assert.equal(new Set(w.ranking.map(p=>p.id)).size,n);assert.equal(new Set(w.ranking.map(p=>p.id)).size,w.players.length);
 const eligible=Array.from(w.ranking).filter(p=>!p.forfeited),top=eligible[0]?.score;assert.deepEqual([...w.winnerIds].sort(),eligible.filter(p=>p.score===top).map(p=>p.id).sort());for(let i=1;i<w.ranking.length;i++)assert.ok(w.ranking[i-1].score>=w.ranking[i].score);
 if(party&&['brawl','tray','dodge','runner'].includes(game))assert.ok(w.elapsed>=w.duration-1e-8,game+' points round continues to its deadline');assertFinite(w);assert.ok(maxSnapshot<65536,game+' guest snapshot size');
 const result=JSON.stringify(w);api.engine.input(w,'p0',{seq:999999,action:'hit'},now+20);api.engine.step(w,.02,now+20);assert.equal(JSON.stringify(w),result,'a late action cannot alter the ranked finish');
 return {result,summary:{game,players:n,seed,party,seconds:Number(w.elapsed.toFixed(2)),objects:maxObjects,bytes:maxSnapshot,winners:w.winnerIds.length}};
}
const summaries=[];
for(const game of expected)for(const n of [2,8])for(const seed of [7,7191])for(const party of [false,true]){
 const first=run(game,n,seed,party),repeat=run(game,n,seed,party);assert.equal(first.result,repeat.result,game+' must replay identically with the same seed and inputs');summaries.push(first.summary);
}
console.log('PASS: 30 actual rule factories, 2/8 players, two seeds and survival/points variants finish deterministically; finite bounded snapshots, host authority, input expiry, exact rankings/ties, bridge completion precedence, four-direction leaps, safe party brawl/tray recoveries, and no permanent points-round eliminations or rule-triggered forfeits across all 30 games.');
console.log(JSON.stringify({rounds:summaries.length*2,longest:Math.max(...summaries.map(s=>s.seconds)),largestSnapshot:Math.max(...summaries.map(s=>s.bytes)),largestObjects:Math.max(...summaries.map(s=>s.objects))}));
