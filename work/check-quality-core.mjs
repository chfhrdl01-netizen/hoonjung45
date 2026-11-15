import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('./game-rules.mjs',import.meta.url),'utf8');
const rules=vm.runInNewContext('(function(){'+source+'\nreturn {...createArcadeMotionRules(),...createArcadeSkillRules(),...createArcadeCombatKartRules(),...createArcadeSocialRhythmRules(),...createArcadeBasketRules(),...createArcadeTrayRules()};})()');
const make=(game,n=2)=>{
 const w={game,elapsed:0,players:Array.from({length:n},(_,index)=>({id:'p'+index,name:'Player '+index,index,forfeited:false,eliminated:false,score:0,health:3})),objects:[],meta:{}};
 const rule=rules[game];rule.init(w,()=>.5);
 return {w,rule,controls:new Map(w.players.map(p=>[p.id,{held:new Set()}]))};
};

// Survival score rewards deliberate close dodges / clean jumps, not only waiting.
for(const [game,stat]of [['dodge','nearMisses'],['runner','cleared']]){
 const {w,rule,controls}=make(game);w.elapsed=10;w.meta.partyRespawn=false;w.meta.nextSpawnAt=99;w.players[0][stat]=3;
 rule.step(w,.02,controls,()=>.5);
 assert.ok(Math.abs(w.players[0].score-w.players[1].score-.003)<1e-8,game+' skill successes break survivor ties without outranking a longer life');
}

// A jump pressed 140 ms before landing launches once on contact; no mid-air jump.
{
 const {w,rule,controls}=make('runner'),p=w.players[0];w.elapsed=2;p.jumpHeight=4;p.jumpVy=-100;w.meta.nextSpawnAt=99;
 assert.equal(rule.input(w,p,'jump'),true);assert.ok(p.jumpQueuedUntil>w.elapsed);assert.equal(p.jumpVy,-100);
 w.elapsed+=.04;rule.step(w,.04,controls,()=>.5);assert.equal(p.jumpHeight,0);assert.equal(p.jumpVy,510);assert.equal(p.jumpQueuedUntil,0);
 w.elapsed+=.02;rule.step(w,.02,controls,()=>.5);assert.ok(p.jumpHeight>0);assert.equal(rule.input(w,p,'jump'),false,'rising jump cannot become a double jump');
 p.jumpHeight=4;p.jumpVy=-100;w.elapsed=3;rule.input(w,p,'jump');w.elapsed=3.2;rule.step(w,.04,controls,()=>.5);assert.equal(p.jumpVy,0,'expired queue cannot fire long after the press');
}

// A dash can connect after its button press, and can take only one coin.
{
 const {w,rule,controls}=make('coins'),[p,target]=w.players;w.elapsed=1;w.objects=[];w.meta.nextCoinAt=99;p.x=200;p.y=230;p.dirX=1;p.dirY=0;target.x=340;target.y=230;target.score=10;
 rule.input(w,p,'dash');assert.equal(p.stolen,0,'out-of-range button press does not steal');
 for(let i=0;i<9;i++){w.elapsed+=.02;rule.step(w,.02,controls,()=>.5);}
 assert.equal(p.stolen,1);assert.equal(p.score,1);assert.equal(target.score,9);assert.equal(p.dashStolen,true);
 rule.input(w,p,'dash');assert.equal(p.stolen,1,'cooldown cannot be bypassed');
}

// The timing game teaches a wide target before narrowing, and is still one shot.
{
 const {w,rule}=make('stamp'),p=w.players[0];const widths=[];
 for(const elapsed of [0,7.2,16.8]){w.elapsed=elapsed;rule.step(w);widths.push(w.meta.window);}
 assert.deepEqual(widths,[.30,.26,.22]);w.elapsed=.425;w.meta.targets[0]=.5;rule.step(w);rule.input(w,p,'hit');const score=p.score;assert.equal(score,100);rule.input(w,p,'hit');assert.equal(p.score,score);
}

// Staying idle no longer beats a player with the same survival time who lands hits.
{
 const {w,rule,controls}=make('brawl',3),[p,target,idle]=w.players;w.elapsed=5;w.meta.partyRespawn=false;p.x=300;p.y=230;p.faceX=1;p.faceY=0;target.x=365;target.y=230;idle.x=600;idle.y=400;
 rule.input(w,p,'hit');rule.step(w,.02,controls);assert.equal(p.damageDealt,28);assert.equal(p.knockouts,0);assert.ok(p.score>idle.score);
 w.elapsed=6;p.hitReadyAt=0;target.x=365;target.y=230;target.hp=16;target.hurtUntil=0;rule.input(w,p,'hit');assert.equal(p.damageDealt,44,'overkill does not inflate damage rewards');assert.equal(p.knockouts,1);assert.equal(target.deaths,1);assert.equal(target.eliminated,true);rule.step(w,.02,controls);assert.ok(p.score>target.score&&idle.score>target.score);
}
{
 const {w,rule,controls}=make('brawl'),[p,target]=w.players;w.elapsed=5;p.x=300;p.y=230;p.faceX=1;p.faceY=0;target.x=365;target.y=230;target.hp=16;target.damageDealt=999;target.knockouts=99;
 rule.input(w,p,'hit');rule.step(w,.02,controls);assert.equal(target.eliminated,true);assert.ok(p.score>target.score,'ordinary survival keeps last-survivor priority despite earlier offense');
}

// Fast kart finishers do not truncate the remaining players' points round.
for(const party of [false,true]){
 const {w,rule,controls}=make('kart');w.meta.partyRespawn=false;if(party)w.meta.pointsStage='regular';w.elapsed=20;w.meta.nextHazardAt=99;w.meta.firstFinishAt=15;w.players[0].finishAt=15;w.players[0].progress=3;w.players[1].progress=1;
 rule.step(w,.02,controls,()=>.5);assert.equal(w.meta.roundOver===true,!party);
}

// Secret choices remain hidden until reveal, and equal occupancy awards equally.
{
 const {w,rule}=make('doors');rule.input(w,w.players[0],'jump');rule.input(w,w.players[1],'jump');assert.equal(w.players[0].choice,-1);assert.equal(w.players[1].choice,-1);assert.deepEqual(Array.from(w.meta.counts),[0,0,0]);
 w.elapsed=3.2;rule.step(w);assert.equal(w.meta.phase,'reveal');assert.equal(w.players[0].score,w.players[1].score);assert.equal(w.players[0].choice,0);
}

// Rhythm uses an audible-countable steady pulse; repeated input cannot farm notes.
{
 const {w,rule}=make('rhythm'),p=w.players[0];for(let i=1;i<w.objects.length;i++)assert.ok(Math.abs(w.objects[i].hitAt-w.objects[i-1].hitAt-.84)<1e-9);
 const note=w.objects[0];w.elapsed=note.hitAt;const action=['jump','hit','dash'][note.lane];assert.equal(rule.input(w,p,action),true);const score=p.score;assert.equal(p.judge,'PERFECT');assert.equal(rule.input(w,p,action),false);assert.equal(p.score,score);
}

// The basketball crossing test scores a descending ball only once.
{
 const {w,rule,controls}=make('basket'),p=w.players[0];w.elapsed=1;const hoop=350+40*Math.sin(.99*.8);w.objects=[{id:'test-shot',kind:'basketBall',ownerId:p.id,x:hoop,y:149,vx:0,vy:100,shotAt:.8,scored:false,points:0}];
 rule.step(w,.02,controls);assert.equal(p.score,3);assert.equal(p.makes,1);w.elapsed+=.02;rule.step(w,.02,controls);assert.equal(p.score,3);
}

// Points survival keeps the same shrinking floor and gives wind a reaction window.
for(const party of [false,true]){
 const {w,rule,controls}=make('tray',8);w.elapsed=20;w.meta.partyRespawn=false;if(party)w.meta.pointsStage='regular';w.players.forEach((p,i)=>{p.x=345+i;p.y=230;});rule.step(w,.02,controls,()=>.5);
 assert.equal(w.objects.filter(tile=>tile.goneAt>w.duration).length,1);
 assert.equal(w.meta.gustApplied,false,'wind first exposes its direction rather than hitting immediately');assert.ok(Math.abs(w.meta.gustPushAt-w.elapsed-.8)<1e-9);assert.ok(w.meta.gustUntil>w.meta.gustPushAt);
}
{
 const {w,rule,controls}=make('tray');w.elapsed=20;w.players[0].x=333;w.players[0].y=230;w.players[1].x=367;w.players[1].y=230;rule.step(w,.02,controls,()=>.5);assert.equal(w.meta.gustApplied,false);
 w.elapsed=20.81;rule.step(w,.02,controls,()=>.5);assert.equal(w.meta.gustApplied,true,'warned wind applies after its reaction window');
}

console.log('PASS: core game quality—meaningful survival skill rewards, buffered landing jumps, one contact steal per dash, progressive stamp timing, offensive brawl scoring, complete points races, hidden fair choices, steady rhythm, single basketball scoring, and telegraphed wind, shrinking floor and round-only deaths.');
