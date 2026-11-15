import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('game-rules.mjs',import.meta.url),'utf8');
const api=vm.runInNewContext('(function(){'+source+';return {rule:createArcadeSportsRules().bowling,engine:createArcadeEngine()};})()');
const roster=n=>Array.from({length:n},(_,index)=>({id:'p'+index,name:'P'+index,index,department:'business',forfeited:false,eliminated:false}));
const copy=value=>JSON.parse(JSON.stringify(value));
function fixture(){
 const w={id:'skill',game:'bowling',phase:'play',elapsed:0,players:roster(2),objects:[],meta:{}};api.rule.init(w);
 return {w,p:w.players[0],controls:new Map(w.players.map(p=>[p.id,{held:new Set()}]))};
}
function throwAt(g,power,aim){
 const {w,p}=g;p.aim=Math.max(-.45,Math.min(.45,aim));p.phase='power';p.readyAt=w.elapsed;p.chargeAt=w.elapsed-Math.acos(1-2*power)/4.1;api.rule.input(w,p,'hit');
}
function simulate({aimed=false,power=1,error=0,correct=false}={}){
 const g=fixture(),{w,p,controls}=g,frames=[],launches=[];let targetX=0,targetY=0,lastFrame=0,lastScore=0;
 while(w.elapsed<32&&p.phase!=='done'){
  const held=controls.get(p.id).held;held.clear();
  if(p.phase==='ready'&&w.elapsed+1e-9>=p.readyAt){targetX=p.bowlTargetX;targetY=p.bowlTargetY;const aim=aimed?Math.atan2(targetX-350,420-targetY)+error:0;throwAt(g,power,aim);launches.push({frame:p.completed,aim:p.aim,power:p.bowlPower});}
  const b=w.objects.find(o=>o.ownerId===p.id&&o.kind==='bowlingBall');
  if(correct&&b&&p.phase==='moving'&&w.elapsed-p.flightAt>.22&&b.y>targetY+25){const remaining=Math.max(0,(b.y-targetY)/Math.max(100,-b.vy)),forecast=b.x+b.vx*remaining,offset=targetX-forecast;if(Math.abs(offset)>3)held.add(offset>0?'right':'left');}
  w.elapsed+=.02;api.rule.step(w,.02,controls);
  if(p.completed!==lastFrame){frames.push(p.score-lastScore);lastFrame=p.completed;lastScore=p.score;}
 }
 assert.equal(p.completed,3,'a human-scale three-frame session finishes inside its deadline');
 return {score:p.score,frames,launches,seconds:w.elapsed};
}

// A new rack is a fresh decision, shared fairly by all participants.
{
 const g=fixture(),{w,p,controls}=g;
 const coordinates=id=>w.objects.filter(o=>o.ownerId===id&&o.kind==='bowlingPin').map(o=>[o.x,o.y]);
 assert.deepEqual(coordinates('p0'),coordinates('p1'));
 const first=coordinates(p.id);p.phase='between';p.completed=1;p.nextFrameAt=0;api.rule.step(w,.02,controls);const second=coordinates(p.id);
 p.phase='between';p.completed=2;p.nextFrameAt=0;api.rule.step(w,.02,controls);const third=coordinates(p.id);
 assert.notDeepEqual(first,second);assert.notDeepEqual(second,third);assert.equal(second.length,10);assert.equal(third.length,10);
 assert(second.every(([x])=>x<350),'second rack requires a leftward line');assert(third.every(([x])=>x>350),'third rack has two right-hand groups');
}

// Repeating the old "vertical, maximum force" strategy no longer clears every frame.
const blind=simulate(),aimed=simulate({aimed:true,power:.58});
assert(aimed.score>=300,'deliberate lines remain rewarding and achievable');
assert(aimed.score>blind.score+150,'reading and aiming at each rack beats maximum-force repetition materially');
assert.equal(blind.frames[1],0);assert.equal(blind.frames[2],0);
assert(aimed.launches.some(shot=>shot.aim<-.2)&&aimed.launches.some(shot=>shot.aim>.2));
assert(aimed.launches.filter(shot=>shot.frame===2).length===2,'split rack rewards planning the second line');

// The same small aiming error can be corrected more reliably with steering time.
const controlled=simulate({aimed:true,power:.58,error:.08,correct:true}),rushed=simulate({aimed:true,power:1,error:.08,correct:true});
assert(controlled.score>rushed.score+20,'moderate force gives a measurable correction advantage without a random miss penalty');
assert.deepEqual(simulate({aimed:true,power:.58,error:.08,correct:true}),controlled,'the skill outcome is deterministic');
{
 const a=fixture(),b=fixture();throwAt(a,.58,0);throwAt(b,.58,0);a.controls.get(a.p.id).held.add('right');
 for(let i=0;i<10;i++){a.w.elapsed+=.02;b.w.elapsed+=.02;api.rule.step(a.w,.02,a.controls);api.rule.step(b.w,.02,b.controls);}
 const ball=g=>g.w.objects.find(o=>o.kind==='bowlingBall'&&o.ownerId===g.p.id);
 assert(ball(a).x>ball(b).x+3,'held left/right changes the actual rolling path');assert.equal(a.p.score,b.p.score,'steering alone never grants points');
}

// Pin scoring is idempotent; second throws keep the real rack and strike/spare awards.
{
 const g=fixture(),{w,p,controls}=g;throwAt(g,.58,0);let ball=w.objects.find(o=>o.kind==='bowlingBall');ball.x=-100;p.framePins=4;p.score=40;
 const rack=w.objects.filter(o=>o.ownerId===p.id&&o.kind==='bowlingPin');rack.slice(0,4).forEach(pin=>pin.down=true);api.rule.step(w,.02,controls);
 assert.equal(p.phase,'ready');assert.equal(p.frameShots,1);assert(rack.every(pin=>w.objects.includes(pin)));
 w.elapsed+=.4;throwAt(g,.58,0);ball=w.objects.find(o=>o.kind==='bowlingBall');ball.x=-100;p.framePins=10;p.score=100;rack.forEach(pin=>pin.down=true);api.rule.step(w,.02,controls);assert.equal(p.score,108);assert.equal(p.completed,1);
 const score=p.score;api.rule.step(w,.02,controls);assert.equal(p.score,score,'settled pins cannot pay again');
}

// Actual engine sessions still finish with finite, bounded, repeatable host states.
function engineRun(n,seed){
 const engine=api.engine,w=engine.create({id:'bowling-'+n+'-'+seed,game:'bowling',seed,participants:roster(n)}),seq=new Map(w.players.map(p=>[p.id,0]));let now=0,nextThink=0,steps=0;
 while(w.phase!=='done'&&steps++<2500){now+=20;if(w.phase==='play'&&now>=nextThink){nextThink=now+180;for(const p of w.players){const intent=engine.bot(w,p.id);let s=seq.get(p.id);engine.input(w,p.id,{seq:++s,action:'sync',held:intent.held},now);if(intent.action)engine.input(w,p.id,{seq:++s,action:intent.action},now);seq.set(p.id,s);}}engine.step(w,.02,now);assert(w.objects.length<=88);for(const p of w.players){assert(Object.keys(p).length<=40);assert(Number.isFinite(p.score));assert(p.framePins>=0&&p.framePins<=10);}}
 assert.equal(w.phase,'done');assert.equal(w.ranking.length,n);const result=JSON.stringify(w);assert.equal(engine.input(w,'p0',{seq:999999,action:'hit'},now+20),false);assert.equal(JSON.stringify(w),result);return result;
}
for(const n of [2,8])for(const seed of [7,7191])assert.equal(engineRun(n,seed),engineRun(n,seed));
const renderer=fs.readFileSync(new URL('source/scripts/arcade-renderers.js',import.meta.url),'utf8'),css=fs.readFileSync(new URL('bowling-clarity.css',import.meta.url),'utf8');
assert(!renderer.includes('sport-bowl-pocket'),'no exact destination or answer marker is drawn');assert(!css.includes('45%')&&!css.includes('70%'),'force gauge has no optimal answer band');
console.log('PASS: three fair rack decisions, real impact deflection and pin chains, controllable rolling curve, maximum-vertical '+blind.score+' vs aimed '+aimed.score+', correction '+controlled.score+' vs rushed '+rushed.score+', retained racks and single spare awards, deterministic bounded 2/8-player sessions, no answer markers.');
