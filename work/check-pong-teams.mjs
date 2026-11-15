import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('./game-rules.mjs',import.meta.url),'utf8');
const api=vm.runInNewContext('(function(){'+source+';return {rule:createArcadeSportsRules().pong,engine:createArcadeEngine()};})()');
const participants=n=>Array.from({length:n},(_,index)=>({id:'p'+index,name:'Player '+index,department:'business'}));
function match(n=4){
 let seed=7191;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};
 const w={id:'focused-pong',game:'pong',phase:'play',elapsed:1,players:participants(n).map((p,index)=>({...p,index,x:0,y:0,score:0,health:3,eliminated:false,forfeited:false,stunUntil:0,actionUntil:0})),objects:[],meta:{}};
 api.rule.init(w,random);const controls=new Map(w.players.map(p=>[p.id,{held:new Set()}]));return{w,controls,random,rule:api.rule};
}
// Every match has a real shared ball and balanced teams, with equal equipment for equal sides.
for(const n of [2,3,4,5,6,7,8]){
 const {w}=match(n),counts=[0,0];for(const p of w.players)counts[p.team]++;
 assert.equal(w.objects.length,1);assert.equal(w.objects[0].kind,'pongBall');assert.equal(w.objects[0].ownerId,'');
 assert.equal(counts[0]+counts[1],n);assert(Math.abs(counts[0]-counts[1])<=1);assert.equal(w.duration,28);
 for(const side of [0,1]){const members=w.players.filter(p=>p.team===side);assert(members.every(p=>p.paddleHeight===members[0].paddleHeight&&p.moveSpeed===members[0].moveSpeed));}
 if(n%2===0){assert.equal(w.meta.handicapTeam,-1);assert.equal(w.players[0].paddleHeight,w.players.at(-1).paddleHeight);assert.equal(w.players[0].moveSpeed,w.players.at(-1).moveSpeed);}
 else{const small=w.players.find(p=>p.team===w.meta.handicapTeam),other=w.players.find(p=>p.team!==w.meta.handicapTeam);assert(small.paddleHeight>other.paddleHeight);assert(small.moveSpeed>other.moveSpeed);}
}
// Roster order does not permanently award the host the single-player handicap.
{
 const outcomes=new Set();for(let sample=1;sample<=24;sample++){const seed=Math.imul(sample,0x9e3779b1)>>>0,w=api.engine.create({id:'team-draw',game:'pong',participants:participants(3),seed});outcomes.add(w.players[0].team===w.meta.handicapTeam);}assert.equal(outcomes.size,2);
}
// Both physical sides reflect the same ball, with a timed smash and deliberate contact angle.
{
 const {w,controls,rule,random}=match(2),left=w.players.find(p=>p.team===0),right=w.players.find(p=>p.team===1),ball=w.objects[0];
 left.paddleY=right.paddleY=230;Object.assign(ball,{x:80,y:230,vx:-400,vy:0,serveAt:0});rule.step(w,.02,controls,random);
 assert(ball.vx>0);assert.equal(left.rallies,1);assert.equal(right.rallies,0);assert.equal(left.score,right.score,'a rally alone cannot split teammates or decide a team match');
 assert.equal(rule.input(w,right,'hit'),true);Object.assign(ball,{x:620,y:260,vx:400,vy:0});rule.step(w,.02,controls,random);
 assert(ball.vx<0);assert(ball.vy>0,'the actual contact point controls the return angle');assert.equal(right.rallies,1);assert.match(right.judge,/스매시/);assert(Math.hypot(ball.vx,ball.vy)>450);
 const ready=right.readyAt;assert.equal(rule.input(w,right,'hit'),false);assert.equal(right.readyAt,ready,'smash cooldown cannot be bypassed');
}
// A missed return awards one team goal, then a neutral pause and alternating serve.
{
 const {w,controls,rule,random}=match(4),ball=w.objects[0],firstDirection=Math.sign(ball.vx);Object.assign(ball,{x:2,y:230,vx:-300,vy:0,serveAt:0});rule.step(w,.02,controls,random);
 assert.deepEqual([...w.meta.teamGoals],[0,1]);assert.equal(w.objects.length,1);assert.equal(Math.sign(ball.vx),-firstDirection);
 for(const p of w.players){assert.equal(p.score,p.team?100:0);assert.equal(p.misses,p.team?0:1);}
 const state=JSON.stringify(w.meta.teamGoals),position=[ball.x,ball.y];w.elapsed+=.1;rule.step(w,.02,controls,random);assert.equal(JSON.stringify(w.meta.teamGoals),state);assert.deepEqual([ball.x,ball.y],position);
}
// Each human controls only their own paddle; the smaller side really travels faster.
{
 const {w,controls,rule,random}=match(3),small=w.players.find(p=>p.team===w.meta.handicapTeam),other=w.players.find(p=>p.team!==w.meta.handicapTeam),idle=w.players.find(p=>p!==small&&p!==other);small.paddleY=other.paddleY=230;const idleY=idle.paddleY;controls.get(small.id).held.add('down');controls.get(other.id).held.add('down');const ball=w.objects[0];ball.serveAt=100;rule.step(w,.04,controls,random);assert(small.paddleY-230>other.paddleY-230);assert.equal(idle.paddleY,idleY);
}
// Team members receive equal results and the ordinary engine preserves host authority.
{
 const w=api.engine.create({id:'shared-ranking',game:'pong',participants:participants(4),seed:7});w.phase='play';w.elapsed=1;for(const side of [0,0,1]){Object.assign(w.objects[0],{x:side?2:698,y:230,vx:side?-300:300,vy:0,serveAt:0});api.engine.step(w,.02,1000);}api.engine.complete(w);
 const winning=w.ranking.filter(p=>w.players.find(q=>q.id===p.id).team===0),losing=w.ranking.filter(p=>w.players.find(q=>q.id===p.id).team===1);
 assert(winning.every(p=>p.rank===1&&p.score===200));assert(losing.every(p=>p.rank===3&&p.score===100));
 const saved=JSON.stringify(w);assert.equal(api.engine.input(w,'p0',{seq:999,action:'hit'},2000),false);assert.equal(JSON.stringify(w),saved);
 const guest=JSON.parse(saved);assert.equal(api.engine.step(guest,.02,2000),false);assert.equal(api.engine.complete(guest),false);
}
{
 const {w,controls,rule,random}=match(4),left=w.players.filter(p=>p.team===0),right=w.players.filter(p=>p.team===1);left[0].forfeited=true;rule.step(w,.02,controls,random);assert.equal(w.meta.handicapTeam,0);assert(left[1].paddleHeight>right[0].paddleHeight);left[1].forfeited=true;rule.step(w,.02,controls,random);assert.equal(w.meta.roundOver,true);assert(w.meta.teamGoals[1]>w.meta.teamGoals[0]);
}
function simulate(n,seed){
 const w=api.engine.create({id:'pong-'+n+'-'+seed,game:'pong',participants:participants(n),seed}),seq=new Map(w.players.map(p=>[p.id,0]));let now=0;
 for(let tick=0;tick<2000&&w.phase!=='done';tick++){
  now+=20;if(w.phase==='play'&&tick%6===0)for(const p of w.players){const intent=api.engine.bot(w,p.id);api.engine.input(w,p.id,{seq:seq.set(p.id,seq.get(p.id)+1).get(p.id),action:'sync',held:intent.held},now);if(intent.action)api.engine.input(w,p.id,{seq:seq.set(p.id,seq.get(p.id)+1).get(p.id),action:intent.action},now);}
  api.engine.step(w,.02,now);assert.equal(w.objects.length,1);for(const p of w.players){assert(Object.keys(p).length<=40);assert(Number.isFinite(p.score)&&Number.isFinite(p.paddleY));assert(p.y>=-100&&p.y<=560);}
 }
 assert.equal(w.phase,'done');assert.equal(w.ranking.length,n);assert(w.elapsed<=28);assert(JSON.stringify(w).length<65536);return JSON.stringify(w);
}
for(const n of [2,3,4,8])for(const seed of [7,7191])assert.equal(simulate(n,seed),simulate(n,seed),'same seed and controls replay the shared rally exactly');
const renderer=fs.readFileSync(new URL('./source/scripts/arcade-renderers.js',import.meta.url),'utf8'),css=fs.readFileSync(new URL('./pong-team.css',import.meta.url),'utf8');
assert(renderer.includes("court.id='pongTeamCourt'"));assert(renderer.includes("w.game==='pong'){arcadePongBuild(w);return;}"));assert(renderer.includes('소수 팀 · 큰 패들 + 빠른 이동'));assert(css.includes('pong-team-field')&&css.includes('orientation:portrait'));
// The shared renderer updates one field and a bounded set of paddles without mutating the match.
{
 const ids=new Map();let allocated=0;
 class Node{constructor(tag='div',cls='',text=''){allocated++;this.tagName=tag;this.className=cls;this.textContent=text;this.children=[];this.dataset={};this.style={};this.hidden=false;this.attrs={};this.classList={toggle:(name,on)=>{const classes=new Set(this.className.split(' '));if(on)classes.add(name);else classes.delete(name);this.className=[...classes].join(' ');}};}set id(value){this._id=value;ids.set(value,this);}get id(){return this._id;}append(...nodes){this.children.push(...nodes);}setAttribute(key,value){this.attrs[key]=value;}}
 for(const id of ['arcadeScenery','arcadeDpad','arcadeOwnStatus','arcadeStatus','arcadeActionLabel','arcadeActionHint']){const node=new Node();node.id=id;}
 const button=new Node('button'),ui={el:(...args)=>new Node(...args),$:id=>ids.get(id),deptAvatarSvg:()=>'<svg/>',arcadeNodeText:(node,text)=>{node.textContent=text;},arcadePosition:(node,x,y)=>{node.style.left=x+'%';node.style.top=y+'%';},arcadeSetText:(id,text)=>{ids.get(id).textContent=text;},arcadeDialog:{querySelector:()=>button}};
 vm.createContext(ui);const start=renderer.indexOf('let arcadePongView=null;'),end=renderer.indexOf('const arcadeSportsBuildBase',start);assert(start>0&&end>start);vm.runInContext(renderer.slice(start,end)+';this.ui={build:arcadePongBuild,draw:arcadePongDraw};',ui);
 const {w}=match(8);ui.ui.build(w);const count=allocated,saved=JSON.stringify(w);for(let i=0;i<100;i++)ui.ui.draw({phase:'round'},w,{},'p0');assert.equal(allocated,count);assert.equal(JSON.stringify(w),saved);assert.equal(ids.get('pongTeamCourt').children[0].children.length,3);assert.equal(ids.get('pongTeamCourt').children[1].children[1].children.length,9,'one ball plus eight controlled paddles');
}
console.log('PASS: shared-table 1v1/2v2 and 2–8 team draws; smaller-team size/speed compensation, real two-way rallies and smash angle, one goal per miss, alternating serves, independent human paddles, shared team ranks, deterministic completion and guest/late-input authority.');
