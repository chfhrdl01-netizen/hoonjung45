import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('./game-rules.mjs',import.meta.url),'utf8');
const renderer=fs.readFileSync(new URL('./source/scripts/arcade-renderers.js',import.meta.url),'utf8');
const context=vm.createContext({Math,Map,Set,WeakMap,Number,Array,Object,String,Error});
vm.runInContext(source+'\nthis.api={rule:createArcadeSportsRules().parking,engine:createArcadeEngine()};',context);
const {rule,engine}=context.api;
const participants=count=>Array.from({length:count},(_,index)=>({id:'p'+index,name:'Driver '+index,department:'business'}));
function fixture(count=2){
 const w={game:'parking',id:'parking-test',phase:'play',elapsed:0,players:participants(count).map((p,index)=>({...p,index,eliminated:false,forfeited:false,stunUntil:0,actionUntil:0})),objects:[],meta:{}};
 rule.init(w);return{w,controls:new Map(w.players.map(p=>[p.id,{held:new Set()}]))};
}
const level=(w,p)=>w.meta.parkingLevels[Math.min(p.parked,w.meta.parkingLevels.length-1)];
const bay=(w,p)=>w.meta.spots[p.target%w.meta.spots.length];
const tick=(w,controls)=>{w.elapsed+=.02;rule.step(w,.02,controls);};

// Reaching the visible bay is sufficient in one frame, at speed and at any angle.
for(const angle of [0,Math.PI/2,Math.PI,-2.3]){
 const {w,controls}=fixture(),p=w.players[0],target=bay(w,p);
 Object.assign(p,{x:target.x,y:target.y,angle,speed:130});tick(w,controls);
 assert.equal(w.duration,32);assert.equal(p.parked,1);assert.equal(p.target,1);assert.equal(p.lastParkAt,.02);assert.equal(p.parkHold,0);
 assert(Math.hypot(p.x-target.x,p.y-target.y)<3,'the completed bay does not teleport the car');
 assert(Math.hypot(bay(w,p).x-p.x,bay(w,p).y-p.y)>400,'next bay requires meaningful travel');
 p.speed=0;const frozen={x:p.x,y:p.y,score:p.score};for(let i=0;i<60;i++)tick(w,controls);
 assert.equal(p.parked,1,'stationary input cannot farm successive parking bays');assert.equal(p.x,frozen.x);assert.equal(p.y,frozen.y);assert.equal(p.score,frozen.score);
}

// The rendered bay dimensions are the actual arrival threshold, without a hidden hold.
{
 const {w,controls}=fixture(),p=w.players[0],target=bay(w,p),width=level(w,p).width;
 Object.assign(p,{x:target.x-width/2-.1,y:target.y,speed:0});tick(w,controls);assert.equal(p.parked,0);
 p.x=target.x-width/2+.1;tick(w,controls);assert.equal(p.parked,1);
}

// Every player receives the same finite, progressively tighter challenge sequence.
const challenges=[];
for(const count of [2,8]){
 const {w,controls}=fixture(count),initial=w.players.map(p=>[p.x,p.y,p.angle,p.target]);
 assert(initial.every(start=>JSON.stringify(start)===JSON.stringify(initial[0])));
 assert.equal(w.meta.parkingLevels.length,8);let previous={width:Infinity,height:Infinity,walls:[]};
 for(const layout of w.meta.parkingLevels){
  assert(layout.width<=previous.width&&layout.height<=previous.height);assert(layout.walls.length>=previous.walls.length);
  assert(layout.width>=58&&layout.height>=40&&layout.walls.length<=4);previous=layout;
  // The perimeter circuit remains open for a full car, even at the highest stage.
  const corners=[{x:110,y:100},{x:590,y:100},{x:590,y:365},{x:110,y:365}];
  for(let i=0;i<corners.length;i++){
   const a=corners[i],b=corners[(i+1)%corners.length],length=Math.hypot(b.x-a.x,b.y-a.y);
   for(let sample=0;sample<=Math.ceil(length);sample++){
    const t=sample/Math.ceil(length),x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;
    assert(x>=32&&x<=668&&y>=42&&y<=425);
    for(const r of layout.walls)assert(!(x>r.x-18&&x<r.x+r.w+18&&y>r.y-18&&y<r.y+r.h+18),'perimeter route cannot be blocked');
   }
  }
  for(const target of w.meta.spots){
   assert(target.x-layout.width/2>32&&target.x+layout.width/2<668);assert(target.y-layout.height/2>42&&target.y+layout.height/2<425);
   for(const r of layout.walls)assert(!(target.x>r.x-18&&target.x<r.x+r.w+18&&target.y>r.y-18&&target.y<r.y+r.h+18));
  }
 }
 const sequence=[];
 for(let i=0;i<40;i++){
  sequence.push(JSON.stringify({target:bay(w,w.players[0]),layout:level(w,w.players[0])}));
  for(const p of w.players){assert.equal(p.parked,i);assert.equal(p.target,i);const target=bay(w,p);Object.assign(p,{x:target.x,y:target.y,speed:0});}
  tick(w,controls);assert(w.players.every(p=>p.parked===i+1));
 }
 assert(w.players.every(p=>p.parked===40));assert.equal(w.meta.parkingLevels.length,8);assert.equal(w.objects.length,0);assert(JSON.stringify(w).length<15000);challenges.push(sequence);
}
assert.deepEqual(challenges[0],challenges[1],'2/8 participants share exactly the same challenge sequence');

// A whole additional parking always beats every time bonus; equal counts reward speed.
{
 const {w,controls}=fixture(),[p,q]=w.players;w.elapsed=31.9;
 Object.assign(p,{parked:3,target:3,lastParkAt:31.9});Object.assign(q,{parked:2,target:2,lastParkAt:0});tick(w,controls);
 assert(p.score>q.score,'three late completions beat two early completions');
 Object.assign(p,{parked:4,target:2,lastParkAt:12});Object.assign(q,{parked:4,target:2,lastParkAt:18});tick(w,controls);assert(p.score>q.score,'faster final completion breaks equal-count ties');
 const before=JSON.stringify(p);p.forfeited=true;const frozen=JSON.stringify(p);controls.get(p.id).held.add('up');tick(w,controls);assert.equal(JSON.stringify(p),frozen);assert.notEqual(before,frozen);
}

function run(count,seed){
 const w=engine.create({id:'parking:'+count+':'+seed,game:'parking',participants:participants(count),seed}),seq=new Map(w.players.map(p=>[p.id,0]));let now=0,nextThink=0;
 assert.equal(engine.input(w,w.players[0].id,{seq:1,action:'hit'},now),false,'countdown cannot brake or score');
 while(w.phase!=='done'&&now<40000){
  now+=20;
  if(w.phase==='play'&&now>=nextThink){nextThink=now+160;for(const p of w.players){const intent=engine.bot(w,p.id);let s=seq.get(p.id);assert.equal(engine.input(w,p.id,{seq:++s,action:'sync',held:intent.held},now),true);if(intent.action)engine.input(w,p.id,{seq:++s,action:intent.action},now);seq.set(p.id,s);}}
  engine.step(w,.02,now);assert.equal(w.objects.length,0);assert.equal(w.meta.parkingLevels.length,8);
  for(const p of w.players){for(const key of ['x','y','angle','speed','score','parked'])assert(Number.isFinite(p[key]));assert(p.x>=32&&p.x<=668&&p.y>=42&&p.y<=425);assert(Object.keys(p).length<=40);assert(!p.eliminated);}
 }
 assert.equal(w.phase,'done');assert.equal(w.duration,32);assert.equal(w.ranking.length,count);assert(w.players.every(p=>p.parked>=5),'normal bots can navigate five increasingly difficult bays in a full round');assert(w.players.every(p=>p.parked===w.players[0].parked),'identical start and sequence preserve opportunity parity');assert(JSON.stringify(w).length<20000);return JSON.stringify(w);
}
for(const count of [2,8])for(const seed of [7,7191])assert.equal(run(count,seed),run(count,seed),'seeded count-rush rounds remain deterministic');

// Simulate beyond a regular round to ensure the capped hardest layout remains navigable.
{
 const {w,controls}=fixture();for(let frame=0;frame<6000;frame++){
  if(frame%8===0)for(const p of w.players){const intent=rule.bot(w,p);controls.get(p.id).held=new Set(intent.held);if(intent.action)rule.input(w,p,intent.action);}
  tick(w,controls);
 }
 assert(w.players.every(p=>p.parked>=15),'bots continue reaching destinations after the eighth difficulty stage');assert.equal(w.meta.parkingLevels.length,8);assert.equal(w.objects.length,0);
}
assert(renderer.includes("v.score.textContent=p.parked+'대'"));assert(renderer.includes("slot.style.width=layout.width/7+'%'"));assert(renderer.includes("slot.style.height=layout.height/4.6+'%'"));assert(!renderer.includes('정방향·후진 모두 1초 정렬'));assert(!renderer.includes('주차칸에 천천히 1초 안착'));
new vm.Script(renderer);
console.log('PASS: instant bay arrival at speed/any angle; no teleport or stationary farming; exact bay bounds; 8 bounded progressive layouts with open perimeter routes; equal 2/8-player sequences; count-first and speed tie scoring; inactive freeze; deterministic full-round bot navigation and hardest-stage continuation; count/difficulty HUD.');
