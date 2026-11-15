import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('./game-rules.mjs',import.meta.url),'utf8');
const rules=vm.runInNewContext('(function(){'+source+';return {...createArcadeSportsRules(),...createArcadeActionPackRules()};})()');
function game(key,n=3){
 const w={game:key,id:'quality-'+key,phase:'play',elapsed:5,players:Array.from({length:n},(_,index)=>({id:'p'+index,name:'P'+index,index,x:0,y:0,score:0,health:3,eliminated:false,forfeited:false,stunUntil:0,actionUntil:0})),objects:[],meta:{}};
 let randomValue=.13;const random=()=>{randomValue=(randomValue+.173)%1;return randomValue;};
 const rule=rules[key];rule.init(w,random);return {w,rule,random,controls:new Map(w.players.map(p=>[p.id,{held:new Set()}]))};
}
const object=(w,p,kind)=>w.objects.find(o=>o.ownerId===p.id&&(!kind||o.kind===kind));

// Everyone faces the same serve sequence, even with a nonconstant seeded RNG.
for(const key of ['pong','volley']){
 const {w,rule,controls,random}=game(key,8),first=object(w,w.players[0]);
 for(const p of w.players){const b=object(w,p);assert.deepEqual([b.x,b.y,b.vx,b.vy],[first.x,first.y,first.vx,first.vy]);}
 for(const p of w.players){const b=object(w,p);if(key==='pong')b.x=-100;else b.y=500;}
 rule.step(w,.02,controls,random);const next=object(w,w.players[0]);
 for(const p of w.players){const b=object(w,p);assert.equal(p.misses,1);assert.deepEqual([b.x,b.y,b.vx,b.vy],[next.x,next.y,next.vx,next.vy],'same numbered re-serve must retain opportunity parity');}
}

// Bowling leaves the rack in place for a second attempt and distinguishes a spare.
{
 const {w,rule,controls}=game('bowling'),p=w.players[0];
 const launch=()=>{p.phase='power';p.chargeAt=w.elapsed;p.readyAt=0;rule.input(w,p,'hit');const b=object(w,p,'bowlingBall');assert.ok(b);b.x=-100;};
 launch();p.framePins=4;p.score=40;
 const rack=w.objects.filter(o=>o.ownerId===p.id&&o.kind==='bowlingPin');rack.slice(0,4).forEach(o=>o.down=true);
 rule.step(w,.02,controls);assert.equal(p.phase,'ready');assert.equal(p.completed,0);assert.equal(p.frameShots,1);assert.equal(p.framePins,4);assert.ok(rack.every(o=>w.objects.includes(o)),'second throw retains the actual rack');
 w.elapsed+=.4;launch();p.framePins=10;p.score=100;rack.forEach(o=>o.down=true);rule.step(w,.02,controls);
 assert.equal(p.completed,1);assert.equal(p.score,108);assert.equal(p.phase,'between');assert.match(p.judge,/스페어/);
 w.elapsed+=1;rule.step(w,.02,controls);assert.equal(p.framePins,0);assert.equal(p.frameShots,0);assert.equal(w.objects.filter(o=>o.ownerId===p.id&&o.kind==='bowlingPin').length,10);
}
{
 const {w,rule,controls}=game('bowling'),p=w.players[0];p.phase='power';p.chargeAt=w.elapsed;rule.input(w,p,'hit');const b=object(w,p,'bowlingBall');b.x=-100;p.framePins=10;p.score=100;w.objects.filter(o=>o.ownerId===p.id&&o.kind==='bowlingPin').forEach(o=>o.down=true);rule.step(w,.02,controls);assert.equal(p.score,115);assert.equal(p.completed,1);assert.match(p.judge,/스트라이크/);
}

// Sweeping changes friction on the launched stone, obeys a cooldown, and adds no free points.
{
 const a=game('curling'),b=game('curling');
 for(const g of [a,b]){const p=g.w.players[0];p.phase='power';p.chargeAt=g.w.elapsed;g.rule.input(g.w,p,'hit');g.w.elapsed+=.4;}
 const pa=a.w.players[0],pb=b.w.players[0];a.rule.input(a.w,pa,'hit');const until=pa.sweepUntil;a.w.elapsed+=.1;a.rule.input(a.w,pa,'hit');assert.equal(pa.sweepUntil,until);
 a.rule.step(a.w,.02,a.controls);b.rule.step(b.w,.02,b.controls);
 const sa=object(a.w,pa),sb=object(b.w,pb);assert.ok(Math.hypot(sa.vx,sa.vy)>Math.hypot(sb.vx,sb.vy));assert.equal(pa.score,pb.score);
}

// Volley rewards one descending receive rather than repeatedly punching an ascending ball.
{
 const {w,rule,controls}=game('volley'),p=w.players[0],b=object(w,p);
 Object.assign(b,{x:p.x,y:340,vy:100,lastHitAt:0});rule.input(w,p,'hit');assert.equal(p.hits,1);assert.equal(p.score,10);
 w.elapsed+=.5;rule.input(w,p,'hit');assert.equal(p.hits,1);assert.equal(p.score,10,'rising-ball input cannot farm points');
 p.readyAt=0;p.bufferUntil=0;Object.assign(b,{x:p.x,y:203,vy:40,lastHitAt:0});rule.input(w,p,'hit');assert.equal(p.hits,1);w.elapsed+=.04;rule.step(w,.04,controls,()=>.5);w.elapsed+=.02;rule.step(w,.02,controls,()=>.5);assert.equal(p.hits,2,'slightly early input is buffered into a descending receive');assert.equal(p.score,17);
}

// A bay accepts both orientations, while tiny drift decays rather than erases its hold.
{
 const {w,rule,controls}=game('parking'),p=w.players[0],target=w.meta.spots[0];assert.equal(w.duration,32);
 Object.assign(p,{x:target.x,y:target.y,angle:target.angle+Math.PI,speed:0});
 for(let i=0;i<51;i++){w.elapsed+=.02;rule.step(w,.02,controls);}assert.equal(p.parked,1);assert.ok(p.baseScore>=100,'reverse parking completes normally');
 const next=w.meta.spots[1];Object.assign(p,{x:next.x+34,y:next.y,angle:next.angle,speed:0,parkHold:.5});w.elapsed+=.02;rule.step(w,.02,controls);assert.ok(p.parkHold>0&&p.parkHold<.5);
 assert.equal(game('golf').w.duration,32,'humans have extra time to aim through three holes');
}

// Shared-object collisions choose the closest actual contact rather than roster order.
{
 const {w,rule,controls}=game('dodgeball'),[thrower,far,near]=w.players;Object.assign(far,{x:350,y:230});Object.assign(near,{x:360,y:230});w.objects=[{id:'quality-ball',kind:'dodgeball',ownerId:thrower.id,x:361,y:230,vx:0,vy:0,until:10,bounces:0,hitIds:[]}];rule.step(w,.02,controls);assert.equal(far.received,0);assert.equal(near.received,1);assert.equal(thrower.hits,1);
}
{
 const {w,rule,controls}=game('crown'),[far,near,stunned]=w.players;Object.assign(far,{x:376,y:230});Object.assign(near,{x:355,y:230});Object.assign(stunned,{x:100,y:100,stunUntil:6});controls.get(stunned.id).held.add('right');const start=stunned.x;rule.step(w,.02,controls);assert.equal(w.meta.ownerId,near.id);assert.equal(stunned.x,start,'steal stun actually prevents movement');
}

// Safe islands can be shared; a waiting player cannot block an entire crossing lane.
{
 const {w,rule,controls}=game('frogger'),[p,q]=w.players;Object.assign(p,{col:5,row:3,x:300,y:304});Object.assign(q,{col:5,row:4,x:300,y:262});controls.get(p.id).held.add('up');rule.step(w,.02,controls);assert.equal(p.row,4);assert.equal(q.row,4);
}

// The claw can correct its descent and retract an empty miss without another attempt.
{
 const {w,rule,controls}=game('claw'),p=w.players[0];w.objects=[];assert.equal(rule.input(w,p,'hit'),true);const start=p.x;controls.get(p.id).held.add('right');rule.step(w,.02,controls);assert.ok(p.x>start);assert.equal(p.hookState,'down');assert.equal(rule.input(w,p,'hit'),true);assert.equal(p.hookState,'up');assert.equal(p.attempts,1);assert.equal(rule.input(w,p,'hit'),false,'recovery cannot launch another hook');
}

console.log('PASS: fair opening serves; bowling two-throw frames, retained racks, strikes/spares; curling sweep agency and cooldown; volley descending-only and early-input buffer; reverse parking and drift grace; closest-contact arbitration and real crown stun; shared safe islands; controllable claw descent/early return.');
