import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read=name=>fs.readFileSync(new URL(name,import.meta.url),'utf8');
const source=read('game-impact.mjs'),rules=read('game-rules.mjs'),css=read('game-impact.css');
new vm.Script(source);
let clock=0,created=0,baseDraws=0;
class Node{
 constructor(tag='div',className='',text=''){this.tagName=tag.toUpperCase();this.className=className;this.textContent=text;this.children=[];this.parentElement=null;this.dataset={};this.attrs={};this.hidden=false;this.style={setProperty:(k,v)=>this.style[k]=v};this.classList={add:c=>{if(!this.className.split(' ').includes(c))this.className+=' '+c;},remove:c=>{this.className=this.className.split(' ').filter(v=>v!==c).join(' ');}};created++;}
 append(...nodes){for(const node of nodes){node.remove();node.parentElement=this;this.children.push(node);}}
 remove(){if(this.parentElement){this.parentElement.children=this.parentElement.children.filter(n=>n!==this);this.parentElement=null;}}
 setAttribute(name,value){this.attrs[name]=String(value);}
}
const board=new Node(),actor=new Node(),actorMap=new Map([['p0',actor]]),sports=new Map();
const context=vm.createContext({console,Map,Set,WeakMap,Math,Date,JSON,Array,Number,String,Object,Error,performance:{now:()=>clock*1000},$:id=>id==='arcadeBoard'?board:null,el:(...args)=>new Node(...args),arcadeSelf:()=> 'p0',arcadeUIActors:actorMap,arcadeSportsPanels:sports,arcadeBuildBoard:()=>{},arcadeDrawWorld:()=>{baseDraws++;},sound:false,beeps:[],beep:(...args)=>context.beeps.push(args)});
vm.runInContext(rules+'\n'+source+'\nthis.test={games:gameImpactGames,read:gameImpactSample,event:gameImpactEvent,origin:gameImpactOrigin,get view(){return gameImpactView;},engine:createArcadeEngine()};',context);
const api=context.test,keys=['sneak','dodge','coins','stamp','runner','brawl','kart','basket','doors','rhythm','tray','pong','curling','bowling','volley','golf','parking','dodgeball','crown','lasers','frogger','bridge','claw','memory','sorter','receipt','safe','auction','stacker','reaction'];
assert.deepEqual(Object.keys(api.games).sort(),keys.sort());
const player=()=>({id:'p0',index:0,x:350,y:230,health:3,hp:100,score:0,eliminated:false,forfeited:false});
const world=(game,p)=>({id:'world-'+game,game,phase:'play',elapsed:1,players:[p,{id:'p1',index:1,x:500,y:230}],meta:{phase:'choose'},objects:[]});
const cases={sneak:[{finishAt:-1},{finishAt:1}],dodge:[{nearMisses:0},{nearMisses:1}],coins:[{coinsCollected:0},{coinsCollected:1}],stamp:[{lastStampStage:-1},{lastStampStage:0,stampResult:'perfect'}],runner:[{cleared:0},{cleared:1}],brawl:[{damageDealt:0},{damageDealt:28}],kart:[{finishAt:-1,dashReadyAt:0},{finishAt:-1,dashReadyAt:3}],basket:[{makes:0},{makes:1,lastShotResult:'깔끔한 3점!'}],doors:[{roundPoints:0},{roundPoints:50},'reveal'],rhythm:[{hits:0,misses:0},{hits:1,misses:0,judge:'PERFECT',combo:1}],tray:[{shoves:0},{shoves:1}],pong:[{rallies:0,misses:0},{rallies:1,misses:0}],curling:[{completed:0},{completed:1}],bowling:[{framePins:0,completed:0},{framePins:3,completed:0}],volley:[{hits:0,misses:0},{hits:1,misses:0}],golf:[{completed:0},{completed:1}],parking:[{parked:0},{parked:1}],dodgeball:[{hits:0},{hits:1}],crown:[{steals:0},{steals:1}],lasers:[{nearMisses:0},{nearMisses:1}],frogger:[{deliveries:0,crashes:0},{deliveries:1,crashes:0}],bridge:[{bridgeSteps:0,finishedAt:-1},{bridgeSteps:1,finishedAt:-1}],claw:[{catches:0},{catches:1}],memory:[{memoryBest:0},{memoryBest:1}],sorter:[{locked:false},{locked:true,roundPoints:50}],receipt:[{locked:false},{locked:true,roundPoints:80,receiptStreak:1}],safe:[{safeProgress:0,safeMistakes:0},{safeProgress:1,safeMistakes:0}],auction:[{goods:0},{goods:5,roundPoints:4},'reveal'],stacker:[{blocks:0,perfects:0,failures:0},{blocks:1,perfects:1,failures:0}],reaction:[{locked:false,reactionHits:0,reactionErrors:0},{locked:true,reactionMs:205,reactionOutcome:'hit',reactionHits:1,reactionErrors:0}]};
for(const [game,[start,end,phase]]of Object.entries(cases)){
 const p=Object.assign(player(),start),w=world(game,p),before=api.read(w,p);Object.assign(p,end);if(phase)w.meta.phase=phase;const after=api.read(w,p),event=api.event(game,before,after,w,p);assert(event,game+' actual success has a dedicated event');assert.equal(typeof event.label,'string');assert(event.label.length);const origin=api.origin(w,p,event);assert(Number.isFinite(origin.x)&&Number.isFinite(origin.y));assert(origin.x>=7&&origin.x<=93&&origin.y>=12&&origin.y<=90);
 assert.equal(api.event(game,after,after,w,p),null,game+' stable frames never repeat bursts');
}
// Survival raw scores are internal ordering tiers, never repeated visual rewards.
for(const game of ['dodge','runner','brawl','tray','dodgeball','lasers','frogger']){const p=player(),w=world(game,p);w.meta.roundSurvival=true;const before=api.read(w,p);p.score=1_000_000+20000;p.x+=5;assert.equal(api.event(game,before,api.read(w,p),w,p),null);}
{
 const p=player(),w=world('brawl',p),before=api.read(w,p);p.hp=72;assert.equal(api.event('brawl',before,api.read(w,p),w,p).kind,'hurt');p.eliminated=true;const event=api.event('brawl',before,api.read(w,p),w,p);assert.equal(event.kind,'out');assert.equal(api.event('brawl',api.read(w,p),api.read(w,p),w,p),null);
}
// Choice-reaction errors and team-table contacts are real outcomes, never early target hints.
{
 const p=Object.assign(player(),{locked:false,reactionMs:-1,reactionHits:0,reactionErrors:0,reactionOutcome:''}),w=world('reaction',p),before=api.read(w,p);
 for(const [outcome,label]of [['wrong','다른 버튼!'],['miss','신호 놓침!'],['early','가짜 신호!']]){p.locked=true;p.reactionErrors=1;p.reactionOutcome=outcome;const event=api.event('reaction',before,api.read(w,p),w,p);assert.equal(event.kind,'fail');assert.equal(event.label,label);}
 w.meta.targetLane=2;assert.equal(api.event('reaction',api.read(w,p),api.read(w,p),w,p),null,'displayed GO target alone creates no result burst');
 const right=Object.assign(player(),{team:1,x:642,paddleY:310,rallies:0,misses:0,goals:0}),pong=world('pong',right),sample=api.read(pong,right);right.rallies=1;const contact=api.event('pong',sample,api.read(pong,right),pong,right);assert.equal(api.origin(pong,right,contact).x,642/7,'right team hit stays at right paddle');assert.equal(api.origin(pong,right,contact).y,310/4.6);
 right.goals=1;const goal=api.event('pong',sample,api.read(pong,right),pong,right);assert.equal(goal.label,'우리 팀 득점!');assert.equal(goal.kind,'perfect');assert.equal(api.origin(pong,right,goal).x,50);
 const field=new Node(),paddle=new Node();context.arcadePongView={key:pong.id,field,paddles:new Map([['p0',paddle]])};context.arcadeBuildBoard(pong);assert.equal(api.view.anchor,field);assert.equal(api.view.actor,paddle);context.arcadePongView=null;
 const parking=Object.assign(player(),{parked:0}),car=world('parking',parking),old=api.read(car,parking);parking.parked=1;assert.equal(api.event('parking',old,api.read(car,parking),car,parking).label,'주차 완료!');
}
// A new scene samples existing state without pretending that it has just happened.
{
 const p=Object.assign(player(),{hits:10,misses:0,combo:10,judge:'PERFECT',lastHitLane:1}),w=world('rhythm',p),s={phase:'round'};context.arcadeBuildBoard(w);context.arcadeDrawWorld(s,w,{},'p0');assert.equal(api.view.lastEvent,null);assert(api.view.slots.every(slot=>slot.root.hidden));assert.equal(api.view.layer.attrs['aria-hidden'],'true');
 const before=JSON.stringify(w);const count=created;for(let i=0;i<100;i++)context.arcadeDrawWorld(s,w,{},'p0');assert.equal(created,count,'100 frames reuse all particle nodes');assert.equal(JSON.stringify(w),before,'feedback has no simulation authority');assert(baseDraws>=101);
 p.hits++;p.combo++;clock=1;w.elapsed=1.2;context.arcadeDrawWorld(s,w,{},'p0');assert.equal(api.view.lastEvent.kind,'perfect');assert.equal(api.view.slots.filter(slot=>!slot.root.hidden).length,1);assert.equal(context.beeps.length,0,'sound off stays silent');
 clock=2;context.arcadeDrawWorld(s,w,{},'p0');assert(api.view.slots.every(slot=>slot.root.hidden),'effects expire by local UI time, even if simulation is paused');
 const oldLayer=api.view.layer;w.id='next';context.arcadeBuildBoard(w);assert.equal(oldLayer.parentElement,null);assert.equal(board.children.filter(n=>n.className==='gi-layer').length,1);assert.equal(api.view.lastEvent,null);
}
// Real engine rhythm judgement drives a burst at its actual hit lane.
{
 const engine=api.engine,w=engine.create({id:'actual-rhythm',game:'rhythm',seed:9,participants:[{id:'p0',name:'나'},{id:'p1',name:'친구'}]}),s={phase:'round'};context.arcadeBuildBoard(w);let now=0;
 while(w.phase==='countdown'){now+=20;clock=now/1000;engine.step(w,.02,now);context.arcadeDrawWorld(s,w,{},'p0');}
 const note=w.objects[0];while(w.elapsed<note.hitAt-1e-7){now+=20;clock=now/1000;engine.step(w,.02,now);context.arcadeDrawWorld(s,w,{},'p0');}
 context.sound=true;assert(engine.input(w,'p0',{seq:1,action:['jump','hit','dash'][note.lane]},now));const snapshot=JSON.stringify(w);context.arcadeDrawWorld(s,w,{},'p0');assert.equal(api.view.lastEvent.kind,'perfect');assert.equal(api.view.lastEvent.label,'PERFECT!');assert.equal(api.view.slots[0].root.style.left,[20,50,80][note.lane]+'%');assert.equal(context.beeps.length,1);assert.equal(JSON.stringify(w),snapshot);
 w.players[0].misses++;w.elapsed+=.2;clock+=.2;context.arcadeDrawWorld(s,w,{},'p0');assert.equal(api.view.lastEvent.kind,'fail');
 w.players[0].eliminated=true;w.phase='done';s.phase='between';clock+=.2;w.elapsed+=.2;context.arcadeDrawWorld(s,w,{},'p0');assert.equal(api.view.lastEvent.kind,'out','the actual finishing hit gets feedback before the next round');assert(api.view.slots.some(slot=>!slot.root.hidden));clock+=1;context.arcadeDrawWorld(s,w,{},'p0');assert(api.view.slots.every(slot=>slot.root.hidden));
}
// Court effects use actual past contact coordinates rather than a future aiming pocket.
{
 const p=player(),w=world('bowling',p);p.bowlTargetX=650;p.bowlTargetY=50;w.objects=[{kind:'bowlingBall',ownerId:p.id,x:215,y:141}];assert.equal(api.origin(w,p,{}).x,215/7);assert.equal(api.origin(w,p,{}).y,141/4.6);
 const field=new Node(),sportActor=new Node();sports.set(p.id,{field,actor:sportActor});context.arcadeBuildBoard(w);assert.equal(api.view.anchor,field);assert.equal(api.view.layer.parentElement,field);sports.clear();
}
assert(css.includes('prefers-reduced-motion:reduce'));assert(css.includes('.gi-piece{display:none}'));assert(!/backdrop-filter|blur\(/.test(css));assert(!/getBoundingClientRect|offsetWidth|offsetHeight|requestAnimationFrame|setInterval|setTimeout|netPublish|arcadeInput/.test(source),'the impact module never forces layout, schedules its own loop or emits game commands');
console.log('PASS: all 30 actual event contracts, real rhythm PERFECT/lane and miss, ending-hit feedback, survival-score silence, bounded 3×12 pooled pieces, no 100-frame DOM growth, local-only state, sound toggle, UI-time expiry and reduced motion.');
