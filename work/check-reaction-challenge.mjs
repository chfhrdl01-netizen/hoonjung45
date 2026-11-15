import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read=name=>fs.readFileSync(new URL(name,import.meta.url),'utf8'),source=read('game-rules.mjs'),renderer=read('source/scripts/arcade-renderers.js');
const api=vm.runInNewContext('(function(){'+source+'\nreturn {brain:createArcadeBrainPackRules,engine:createArcadeEngine};})()');
const actions=['hit','jump','dash'];
function fixture(random=()=>.5,count=2){
 const rule=api.brain().reaction,w={id:'reaction-test',game:'reaction',phase:'play',elapsed:0,duration:24,players:Array.from({length:count},(_,index)=>({id:'p'+index,index,name:'참가자 '+index,x:0,y:0,score:0,health:3,eliminated:false,forfeited:false,stunUntil:0,actionUntil:0})),objects:[],meta:{}};
 rule.init(w,random);const controls=new Map(w.players.map(p=>[p.id,{held:new Set()}]));
 return {rule,w,at(t){w.elapsed=t;rule.step(w,.01,controls,random);}};
}
function rng(seed){let s=seed>>>0;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296;};}

// A three-signal cycle requires all three decisions and hides the instruction until GO.
{
 const {rule,w,at}=fixture(),seen=[];
 for(let stage=0;stage<7;stage++){
  at(stage*3.5+.1);assert.equal(w.meta.targetLane,-1);assert.equal(w.meta.reactionWindow,stage<2?1:stage<5?.86:.72);
  at(stage*3.5+1.7);assert.equal(w.meta.signal,'go');seen.push(w.meta.targetLane);assert.equal(rule.input(w,w.players[0],actions[w.meta.targetLane]),true);
 }
 for(const start of [0,3])assert.deepEqual(seen.slice(start,start+3).sort(),[0,1,2]);
 assert.equal(w.players[0].reactionHits,7);assert.equal(w.players[0].reactionErrors,0);
}
// Early, wrong and late inputs each consume at most one opportunity and never reward guessing.
{
 const f=fixture(),p=f.w.players[0];p.score=100;f.at(.3);assert.equal(f.w.meta.signal,'fake');assert.equal(f.rule.input(f.w,p,'jump'),false);assert.equal(p.score,65);assert.equal(p.reactionOutcome,'early');
 f.at(1.7);assert.equal(f.rule.input(f.w,p,actions[f.w.meta.targetLane]),false);assert.equal(p.score,65);
 const wrong=fixture(),q=wrong.w.players[0];q.score=100;wrong.at(1.7);const lane=wrong.w.meta.targetLane;assert.equal(wrong.rule.input(wrong.w,q,actions[(lane+1)%3]),false);assert.equal(q.score,65);assert.equal(q.reactionOutcome,'wrong');assert.equal(wrong.rule.input(wrong.w,q,actions[lane]),false);
 const late=fixture(),r=late.w.players[0];r.score=90;late.at(2.50001);assert.equal(r.reactionOutcome,'miss');assert.equal(r.locked,true);assert.equal(r.choiceLocked,true);assert.equal(late.rule.input(late.w,r,'hit'),false);assert.equal(r.score,90);assert.equal(r.reactionErrors,1);late.at(3);assert.equal(r.reactionErrors,1);
}
// Equal reaction time is equal score; command arrival order carries no extra points.
{
 const {rule,w,at}=fixture(),[p,q]=w.players;at(1.83);const action=actions[w.meta.targetLane];assert.equal(rule.input(w,p,action),true);assert.equal(rule.input(w,q,action),true);assert.equal(p.score,q.score);assert.equal(p.reactionMs,q.reactionMs);const score=p.score;assert.equal(rule.input(w,p,action),false);assert.equal(p.score,score);
}
// Always pressing the middle button cannot solve a varied sequence.
for(const seed of [7,7191,1123]){
 const run=middle=>{const f=fixture(rng(seed));for(let step=1;step<=2450;step++){f.at(step/100);const p=f.w.players[0];if(f.w.meta.signal==='go'&&!p.locked)f.rule.input(f.w,p,middle?'jump':actions[f.w.meta.targetLane]);}return f.w.players[0];};
 const middle=run(true),correct=run(false);assert.equal(correct.reactionHits,7);assert.ok(middle.reactionHits<=3);assert.ok(correct.score>middle.score+300);
}
// Real engine runs stay deterministic, bounded and authoritative for both player counts.
for(const count of [2,8])for(const seed of [7,7191]){
 function run(){const engine=api.engine(),participants=Array.from({length:count},(_,i)=>({id:'p'+i,name:'참가자 '+i,department:'business'})),w=engine.create({id:'actual-'+count+'-'+seed,game:'reaction',seed,participants}),seq=new Map(participants.map(p=>[p.id,0]));let now=0,nextThink=0;
  while(w.phase!=='done'&&now<40000){now+=20;if(w.phase==='play'&&now>=nextThink){nextThink=now+180;for(const p of w.players){const intent=engine.bot(w,p.id);if(intent.action){const cmd={seq:seq.get(p.id)+1,action:intent.action};seq.set(p.id,cmd.seq);assert.equal(engine.input(w,p.id,cmd,now),true);assert.equal(engine.input(w,p.id,cmd,now),false);}}}engine.step(w,.02,now);for(const p of w.players){assert.ok(Object.keys(p).length<=40);assert.ok(Number.isFinite(p.score));}assert.ok(Object.keys(w.meta).length<=40);}
  assert.equal(w.phase,'done');assert.ok(Math.abs(w.elapsed-w.duration)<1e-8);const frozen=JSON.stringify(w);assert.equal(engine.input(w,'p0',{seq:99999,action:'jump'},now+1),false);assert.equal(JSON.stringify(w),frozen);return frozen;
 }
 assert.equal(run(),run());
}
// Test the actual installed keyboard path, including Space on the game choices and ordinary UI focus.
{
 const start=renderer.indexOf('function arcadeExtraInstall(){'),end=renderer.indexOf('/* END_ARCADE_EXTRA_CONTROLS_V1 */',start),handlers=[],sent=[];
 const context={arcadeDialog:{open:true},arcadeState:{world:{game:'reaction'}},arcadeGames:{reaction:{controls:'choices'},memory:{controls:'choices'}},document:{addEventListener:(type,fn)=>{if(type==='keydown')handlers.push(fn);}},arcadeEnsureUI(){},arcadeExtraEnsureControls(){},arcadeExtraChoices:{children:[{disabled:false},{disabled:false},{disabled:false}]},arcadeInput:(...args)=>sent.push(args)};
 vm.runInNewContext(renderer.slice(start,end)+'\narcadeExtraInstall();',context);
 function press(code,{ui=false,pad=false,repeat=false}={}){const event={code,repeat,target:{matches:()=>false,closest:selector=>selector==='[data-extra-choice]'?(pad?{}:null):ui||pad?{}:null},preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};handlers[0](event);return event;}
 for(const [key,action]of [['KeyA','hit'],['Space','jump'],['KeyW','jump'],['KeyD','dash']]){const before=sent.length,event=press(key);assert.equal(sent.length,before+1);assert.deepEqual(sent.at(-1),[action,true]);assert.equal(event.prevented,true);}
 const before=sent.length;press('Space',{ui:true});press('Space',{repeat:true});assert.equal(sent.length,before);press('Space',{pad:true});assert.deepEqual(sent.at(-1),['jump',true]);
}
assert.match(renderer,/reaction:\{[^\n]*controls:'choices'/);assert.match(read('reaction-challenge.css'),/prefers-reduced-motion/);
console.log('PASS: three varied reaction choices, shrinking visible response windows, fake/wrong/late/single-attempt rules, equal-time scores, Space-only failure, actual keyboard/touch contract, deterministic 2/8-player engine rounds and bounded public state.');
