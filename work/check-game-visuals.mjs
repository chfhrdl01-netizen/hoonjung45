import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('./game-visuals.mjs',import.meta.url),'utf8'),rulesSource=fs.readFileSync(new URL('./game-rules.mjs',import.meta.url),'utf8');
const ids=new Map(),created=[];
class Node{
 constructor(tag='div',cls='',text=''){this.tagName=tag;this.className=cls;this.textContent=text;this.children=[];this.dataset={};this.attrs={};this.hidden=false;this.style={setProperty(key,value){this[key]=value;}};this.classList={add:(name)=>{this.className+=' '+name;}};created.push(this);}
 append(...nodes){this.children.push(...nodes);}setAttribute(key,value){this.attrs[key]=String(value);}getAttribute(key){return this.attrs[key]??null;}
}
const node=(id,tag='div')=>{const n=new Node(tag);ids.set(id,n);return n;},board=node('arcadeBoard'),scene=node('arcadeScenery'),courts=node('arcadeSportsCourts'),button=node('action','button');
const dpad=node('arcadeDpad'),directionNodes=Object.fromEntries(['up','down','left','right'].map(direction=>[direction,new Node('button')]));dpad.querySelector=selector=>directionNodes[selector.match(/="(\w+)"/)?.[1]]||null;
const actors=new Map(),panels=new Map();
let builds=0,draws=0;
const context=vm.createContext({document:{createElementNS:(_,tag)=>new Node(tag)},el:(...args)=>new Node(...args),$:id=>ids.get(id)||null,arcadeSelf:()=> 'p0',arcadeUIActors:actors,arcadeSportsPanels:panels,arcadeDialog:{querySelector:()=>button},arcadeSetText:(id,text)=>{const target=ids.get(id);if(target)target.textContent=text;},arcadeBuildBoard:()=>{builds++;},arcadeDrawWorld:()=>{draws++;}});
vm.runInContext(rulesSource+'\n'+source+'\nglobalThis.visualApi={kinds:gameVisualKinds,axes:gameVisualAxes,action:gameVisualAction,preview:gameVisualPreview,line:gameVisualLine,cone:gameVisualCone,engine:createArcadeEngine(),view:()=>gameVisualView};',context);
const {kinds,axes,action,preview,line,cone,engine}=context.visualApi;
const gameKeys=['sneak','dodge','coins','stamp','runner','brawl','kart','basket','doors','rhythm','tray','pong','curling','bowling','volley','golf','parking','dodgeball','crown','lasers','frogger','bridge','claw','memory','sorter','receipt','safe','auction','stacker','reaction'];
assert.deepEqual(Object.keys(kinds).sort(),[...gameKeys].sort(),'all thirty games have a visual family');
assert.deepEqual(Object.keys(axes).sort(),[...gameKeys].sort(),'all thirty games specify useful direction keys');
const players=Array.from({length:8},(_,i)=>({id:'p'+i,name:'Player '+i,department:'business'}));
const make=game=>{const w=engine.create({id:'visual-'+game,game,seed:7191,participants:players});w.phase='play';return w;};
for(const game of gameKeys){
 const w=make(game),p=w.players[0],ui=action(w,p,{action:'행동'}),cue=preview(w,p);
 assert.equal(typeof ui.verb,'string');assert.ok(ui.verb.length>0);assert.ok(ui.ready>=0&&ui.ready<=1);assert.ok(['ready','cooling','watch','recover','stop','charge'].includes(ui.state));
 for(const path of [cue.line,cue.zone])assert.ok(!/NaN|Infinity|undefined/.test(path),game+' visual paths are finite');
 for(const point of [cue.ring,cue.target])if(point)for(const key of ['x','y','r'])assert.ok(Number.isFinite(point[key]),game+' '+key);
 assert.equal(action({...w,phase:'countdown'},p).state,'watch');assert.equal(action(w,{...p,forfeited:true}).state,'watch');
}
assert.ok(!/NaN|Infinity/.test(line(100,200,0,0,40)));assert.ok(!/NaN|Infinity/.test(cone(100,200,0,0,84)));
{
 const w=make('brawl'),[p,target]=w.players;p.x=300;p.y=230;p.faceX=1;p.faceY=0;target.x=365;target.y=230;w.players.slice(2).forEach(q=>{q.x=600;q.y=400;});
 assert.equal(preview(w,p).target,null,'opponents are never automatically selected or highlighted');assert.equal(preview(w,p).zone,'','the exact attack range is not painted');
 p.hitReadyAt=1;w.elapsed=.725;assert.equal(action(w,p).state,'cooling');assert.ok(Math.abs(action(w,p).ready-.5)<1e-8);
}
{
 const w=make('curling'),p=w.players[0];assert.equal(action(w,p).verb,'파워 시작');p.phase='power';p.power=.7;assert.equal(action(w,p).state,'charge');assert.equal(action(w,p).ready,.7);p.phase='moving';assert.equal(action(w,p).verb,'슥슥 쓸기');
 const golf=make('golf');golf.players[0].phase='moving';assert.equal(action(golf,golf.players[0]).state,'watch');
}
{
 const w=make('frogger'),p=w.players[0];p.faceCol=1;p.faceRow=0;assert.equal(preview(w,p).target,null,'no future leap landing marker');
 for(const game of gameKeys){const world=make(game),cue=preview(world,world.players[0]);assert.equal(cue.zone,'',game+' has no assist range');assert.equal(cue.ring,null,game+' has no answer ring');assert.equal(cue.target,null,game+' has no predicted target');}
 for(const game of ['volley','pong','bridge']){const world=make(game);assert.equal(preview(world,world.players[0]).line,'',game+' does not reveal future contact or landing');}
}
{
 const w=make('reaction'),p=w.players[0];w.meta.signal='fake';assert.equal(action(w,p).state,'stop');w.meta.signal='go';assert.equal(action(w,p).verb,'지금 찍어!');p.locked=true;assert.equal(action(w,p).state,'watch');
}
// Stable SVG nodes: repeated rendering updates attributes, never rebuilds the UI.
{
 const w=make('brawl'),s={phase:'round'};actors.clear();for(const p of w.players)actors.set(p.id,new Node());context.arcadeBuildBoard(w);const count=created.length,view=context.visualApi.view();
 assert.equal(view.health.size,8);assert.equal(board.dataset.visualArena,'cafeteria');
 for(let i=0;i<100;i++){w.elapsed+=.01;context.arcadeDrawWorld(s,w,{action:'펀치!'},'p0');}
 assert.equal(created.length,count);assert.equal(builds,1);assert.equal(draws,100);assert.equal(view.main.svg.getAttribute('display'),'block');
 w.phase='countdown';context.arcadeDrawWorld(s,w,{},'p0');assert.equal(view.main.svg.getAttribute('display'),'none','SVG overlays really hide during countdown');
}
{
 const w=make('golf'),s={phase:'round'};panels.clear();for(const p of w.players)panels.set(p.id,{field:new Node()});context.arcadeBuildBoard(w);const view=context.visualApi.view();assert.equal(view.courts.size,1,'aim previews are local, rather than eight duplicated overlays');assert.equal(courts.style['--gv-rivals'],'7');
 context.arcadeDrawWorld(s,w,{},'p0');const count=created.length;for(let i=0;i<100;i++)context.arcadeDrawWorld(s,w,{},'p0');assert.equal(created.length,count);
}
for(const [game,expected]of [['bowling',['left','right']],['pong',['up','down']],['parking',['up','down','left','right']],['claw',['left','right']],['sneak',['up']]]){
 const w=make(game);context.arcadeBuildBoard(w);context.arcadeDrawWorld({phase:'round'},w,{},'p0');assert.deepEqual(Object.keys(directionNodes).filter(direction=>!directionNodes[direction].hidden).sort(),expected.sort(),game+' exposes only effective directions');
}
const css=fs.readFileSync(new URL('./game-visuals.css',import.meta.url),'utf8');assert.ok(css.includes('prefers-reduced-motion:reduce'));assert.ok(css.includes('@container (max-width:640px)'));assert.ok(css.includes('@container (max-height:300px)'));assert.ok(!css.includes('backdrop-filter')&&!css.includes('blur('));
console.log('PASS: all30 action states, finite bounded aim cues, local current-direction marks without predicted paths, landing points or automatic targets, cooldown/charge states, zero-direction leaps, real SVG hiding, stable repeated DOM, focused responsive courts and reduced motion.');
