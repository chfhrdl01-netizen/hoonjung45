import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('./game-rules.mjs',import.meta.url),'utf8');
const makeRules=vm.runInNewContext('(function(){'+source+'\nreturn createArcadeBrainPackRules;})()');
const actions=['hit','jump','dash'];
function create(game,random=()=>.5){
 const rule=makeRules()[game],w={id:'quality-'+game,game,phase:'play',elapsed:0,duration:24,players:Array.from({length:2},(_,index)=>({id:'p'+index,index,name:'참가자 '+index,x:0,y:0,score:0,health:3,eliminated:false,forfeited:false,stunUntil:0,actionUntil:0})),objects:[],meta:{}};
 rule.init(w,random);const controls=new Map(w.players.map(p=>[p.id,{held:new Set()}]));
 const at=t=>{w.elapsed=t;rule.step(w,.02,controls,random);};
 return {rule,w,controls,at};
}

// A memory retry is a second chance, never a way to farm the same partial prefix.
{
 const {rule,w,at}=create('memory'),[p,q]=w.players;
 assert.equal(w.duration,27);at(.1);assert.equal(w.meta.flashLane,1);at(.4);assert.equal(w.meta.flashLane,-1,'consecutive equal lights have a visible gap');
 assert.equal(rule.input(w,p,'jump'),false,'watching does not consume a turn');at(1.2);
 assert.equal(rule.input(w,p,'jump'),true);assert.equal(p.score,12);
 at(1.4);assert.equal(rule.input(w,p,'hit'),false);assert.equal(p.memoryRetryUsed,true);assert.equal(p.locked,false);assert.equal(p.memoryIndex,0);assert.equal(p.score,0);
 at(1.8);assert.equal(rule.input(w,p,'jump'),true);assert.equal(p.score,0,'a repeated prefix earns no points twice');
 at(2);assert.equal(rule.input(w,p,'jump'),true);assert.equal(p.locked,true);assert.equal(p.score,52);
 assert.equal(rule.input(w,q,'hit'),false);at(2.4);assert.equal(rule.input(w,q,'hit'),false);assert.equal(q.locked,true,'a second error waits for the next sequence');
 assert.equal(Object.hasOwn(w.meta,'pattern'),false,'the hidden sequence is not in the shared snapshot');
 at(17.99999999999979);assert.equal(w.meta.stage,4);assert.ok([-1,0,1,2].includes(w.meta.flashLane),'floating point round boundaries cannot produce an undefined light');assert.ok(w.meta.stageLeft<=4.5);
}

// The first changed sorting rule is previewed before any answer can cost points.
{
 const {rule,w,at}=create('sorter'),p=w.players[0];assert.equal(w.duration,27.2);
 at(6.8);assert.equal(w.meta.stage,4);assert.equal(w.meta.phase,'watch');assert.equal(p.choiceLocked,true);
 assert.equal(rule.input(w,p,'hit'),false);assert.equal(p.score,0);
 at(7.2);assert.equal(w.meta.phase,'choose');assert.equal(p.choiceLocked,false);
 assert.equal(rule.input(w,p,actions[(w.meta.docType+w.meta.ruleShift)%3]),true);assert.ok(p.score>=50&&p.score<=70);
}

// Receipt calculations build from two small amounts; correct streaks have a bounded bonus.
{
 const {rule,w,at}=create('receipt'),p=w.players[0];
 const answer=()=>actions[w.meta.choiceLabels.indexOf(w.meta.numbers.reduce((sum,n)=>sum+n,0)+'원')];
 assert.equal(w.meta.numbers.length,2);assert.ok(w.meta.numbers.every(n=>n>=1&&n<=5));
 at(.4);assert.equal(rule.input(w,p,answer()),true);const first=p.roundPoints;
 at(4.4);assert.equal(rule.input(w,p,answer()),true);assert.equal(p.roundPoints,first+10);assert.equal(p.receiptStreak,2);
 at(8.4);assert.equal(w.meta.numbers.length,3);assert.ok(w.meta.numbers.every(n=>n<=9));
 at(12.4);assert.equal(p.receiptStreak,0,'an unanswered receipt breaks the correct streak');
 at(16.4);assert.ok(w.meta.numbers.every(n=>n<=15));assert.equal(w.meta.answer,-1,'no explicit answer is shared before reveal');
 at(19.4);assert.equal(w.meta.answer,w.meta.numbers.reduce((sum,n)=>sum+n,0));
}

// The safe dial advances one notch on a tap and repeats predictably when held.
{
 const {rule,w,controls,at}=create('safe'),p=w.players[0],control=controls.get(p.id);
 at(1.4);control.held.add('right');at(1.42);assert.equal(p.dial,1);assert.equal(p.dialFloat,1);
 at(1.6);assert.equal(p.dial,1,'short taps cannot drift to the next number');at(1.72);assert.equal(p.dial,2);
 control.held.clear();at(1.74);control.held.add('left');at(1.76);assert.equal(p.dial,1,'direction reversal responds immediately');
 control.held.clear();at(2);p.dial=5;assert.equal(rule.input(w,p,'hit'),true);assert.equal(p.safeProgress,1);
 at(2.3);p.dial=4;p.score=30;assert.equal(rule.input(w,p,'hit'),false);assert.equal(p.safeProgress,1);assert.deepEqual([...p.entered],[true],'confirmed slots do not retain hidden PIN digits in the shared snapshot');assert.equal(p.score,22);
 at(2.8);p.dial=5;assert.equal(rule.input(w,p,'hit'),true);at(3.1);assert.equal(rule.input(w,p,'hit'),true);assert.equal(p.locked,true);assert.equal(p.roundPoints,229);assert.equal(p.score,30+229-8,'each mistake costs eight points once, including previously paid deductions');
 assert.equal(w.meta.pinDisplay,'● ● ●');assert.equal(Object.hasOwn(w.meta,'pin'),false);
}
{
 const {rule,w,at}=create('safe'),p=w.players[0];at(1.5);p.dial=4;assert.equal(rule.input(w,p,'hit'),false);assert.equal(p.score,0);assert.equal(p.safePenaltyPaid,0);
 p.dial=5;at(2);assert.equal(rule.input(w,p,'hit'),true);at(2.3);assert.equal(rule.input(w,p,'hit'),true);at(2.6);assert.equal(rule.input(w,p,'hit'),true);assert.equal(p.score,180+54-8,'a mistake at zero points is paid once from the eventual unlock reward');
}

// A revised sealed bid replaces the old amount, stays private, and is charged once at reveal.
{
 const {rule,w,at}=create('auction'),[p,q]=w.players;at(.4);
 assert.equal(rule.input(w,p,'dash'),true);assert.equal(p.locked,true);assert.equal(p.choiceLocked,false);assert.equal(p.bid,-1);assert.equal(p.budget,12);
 at(.7);assert.equal(rule.input(w,p,'jump'),true);assert.equal(p.bid,-1);assert.equal(q.bid,-1);assert.equal(w.meta.winnerId,'');assert.doesNotMatch(p.feedback,/1장|3장/,'public feedback cannot reveal the revised amount');
 at(1);assert.equal(rule.input(w,q,'hit'),true);at(4.8);
 assert.equal(p.bid,1);assert.equal(p.budget,11);assert.equal(p.goods,w.meta.prize);assert.equal(p.choiceLocked,true);assert.equal(q.budget,12);assert.equal(w.meta.winnerId,p.id);
 const frozen=JSON.stringify(w);assert.equal(rule.input(w,p,'dash'),false);assert.equal(JSON.stringify(w),frozen);
 at(5.5);assert.equal(p.budget,11,'the revealed bid is never charged a second time');
}

// Stacker timing is identical for participants and every block enters from an edge.
{
 const {rule,w,at}=create('stacker'),[p,q]=w.players;
 assert.equal(p.movingX,q.movingX);assert.ok(Math.abs(p.movingX-p.stackCenter)>p.stackWidth);
 assert.equal(rule.input(w,p,'hit'),false,'no automatic perfect from an immediate initial press');assert.equal(p.failures,0);
 at(Math.PI/(2*1.7));assert.equal(p.movingX,q.movingX);assert.equal(rule.input(w,p,'hit'),true);assert.equal(p.perfectChain,1);assert.equal(p.perfects,1);
 at(w.elapsed+.02);assert.ok(p.movingX<150,'the next block enters from the opposite edge');
 p.stackWidth=80;
 for(let n=0;n<2;n++){
  const speed=1.7+Math.min(10,p.stackLevel)*.14;at(p.stackSpawnAt+Math.PI/(2*speed));assert.equal(rule.input(w,p,'hit'),true);
 }
 assert.equal(p.perfectChain,3);assert.equal(p.stackWidth,92,'three accurate placements restore useful width');assert.match(p.feedback,/너비 회복/);
}

// Equal reaction times earn equal scores even if host input handling has a stable order.
{
 const {rule,w,at}=create('reaction'),[p,q]=w.players;at(1.9);assert.equal(w.meta.signal,'go');
 assert.equal(rule.input(w,p,'hit'),true);assert.equal(rule.input(w,q,'hit'),true);assert.equal(p.reactionMs,q.reactionMs);assert.equal(p.score,q.score,'arrival rank is no longer an extra score multiplier');
 at(3.6);assert.equal(rule.input(w,p,'hit'),false);assert.equal(p.roundPoints,-35);assert.equal(p.locked,true);
}

console.log('PASS: all seven brain games: readable memory flashes and non-farmable retry, sorting rule preview, progressive receipts and streak reset, precise safe dial and retained prefix, private revisable bids charged once, fair incoming stack blocks and perfect recovery, and equal reaction timing scores.');
