import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const rules=fs.readFileSync(new URL('./game-rules.mjs',import.meta.url),'utf8');
const renderer=fs.readFileSync(new URL('./source/scripts/arcade-renderers.js',import.meta.url),'utf8');
const start=renderer.indexOf('const brainPackIds='),end=renderer.indexOf('/* END_ARCADE_BRAIN_PACK_UI_V1 */',start);
assert(start>=0&&end>start);
const ids=new Map();let allocations=0;
class Node{
 constructor(tag='div',cls='',text=''){allocations++;this.tagName=tag;this.className=cls;this.textContent=String(text??'');this.children=[];this.hidden=false;this.style={};this.dataset={};this.classList={toggle:(name,on)=>{const names=new Set(this.className.split(/\s+/));if(on)names.add(name);else names.delete(name);this.className=[...names].join(' ');}};}
 set id(value){this._id=value;ids.set(value,this);}get id(){return this._id;}
 append(...children){this.children.push(...children);}
 querySelector(){return new Node('i');}
}
for(const id of ['arcadeScenery','arcadeDpad','arcadeStatus','arcadeOwnStatus']){const node=new Node();node.id=id;}
const context=vm.createContext({Map,Set,Math,Number,String,Array,el:(...args)=>new Node(...args),$:id=>ids.get(id),arcadeBuildBoard:()=>{ids.get('arcadeScenery').children=[];},arcadeDrawWorld(){},arcadeSetText:(id,text)=>{const node=ids.get(id);if(node)node.textContent=text;}});
vm.runInContext(rules+'\n'+renderer.slice(start,end)+'\nthis.api={engine:createArcadeEngine(),build:arcadeBuildBoard,draw:arcadeDrawWorld,nodes:brainPackNodes};',context);
const {engine,build,draw,nodes}=context.api;
const w=engine.create({id:'stacker-clarity',game:'stacker',seed:9,participants:[{id:'me',name:'나'},{id:'friend',name:'친구'}]}),p=w.players[0],s={phase:'round'},g={hint:'블록 놓기'};
build(w);draw(s,w,g,'me');
const footing=nodes.get('stackStart'),target=nodes.get('stackTarget'),hint=nodes.get('stackHint'),moving=nodes.get('movingBlock');
assert(footing&&target&&hint,'the empty first frame has a footing, target and starting label');
assert.equal(footing.textContent,'START');assert.equal(hint.textContent,'여기서 시작');assert.equal(hint.hidden,false);
assert.equal(target.style.left,p.stackCenter/7+'%');assert.equal(target.style.width,p.stackWidth/7+'%');assert.equal(target.style.bottom,'9%');
assert.equal(moving.hidden,true,'the preparation delay is preserved');
assert.equal(engine.input(w,'me',{seq:1,action:'hit'},0),false,'countdown still blocks a premature drop');
w.phase='play';w.elapsed=.4;engine.step(w,.02,420);draw(s,w,g,'me');assert.equal(moving.hidden,false);assert.notEqual(moving.style.left,target.style.left,'moving block remains visually distinct from the fixed starting target');

// A real first placement raises the highlighted target to the next floor.
w.elapsed=Math.PI/(2*1.7);assert.equal(engine.input(w,'me',{seq:1,action:'hit'},1000),true);assert.equal(p.stackLevel,1);draw(s,w,g,'me');
assert.equal(hint.hidden,true);assert.equal(target.style.bottom,'17%');assert.equal(nodes.get('block0').hidden,false);assert(!footing.className.includes('is-start'));

// A narrow or off-centre tower shows its actual current overlap target, not the original centre.
p.stackCenter=430;p.stackWidth=77;p.stackRects=[[430,77,1]];p.movingX=430;draw(s,w,g,'me');
assert.equal(target.style.left,430/7+'%');assert.equal(target.style.width,77/7+'%');assert(target.className.includes('is-aligned'));
p.movingX=444;draw(s,w,g,'me');assert(!target.className.includes('is-aligned'));
const count=allocations,before=JSON.stringify(w);for(let i=0;i<100;i++)draw(s,w,g,'me');assert.equal(allocations,count,'steady frames reuse their visible cues');assert.equal(JSON.stringify(w),before,'visual guidance never mutates game state or scores');

// A real miss resets the footing and restores the first-placement hint.
w.elapsed=p.stackSpawnAt+Math.PI/1.84;assert.equal(engine.input(w,'me',{seq:2,action:'hit'},3000),true);assert.equal(p.stackLevel,0);draw(s,w,g,'me');
assert.equal(hint.hidden,false);assert(footing.className.includes('is-start'));assert.equal(target.style.bottom,'9%');assert.equal(target.style.left,'50%');
for(const node of [target,moving])for(const value of Object.values(node.style))assert(!/NaN|Infinity|undefined/.test(value));
const css=fs.readFileSync(new URL('./stacker-clarity.css',import.meta.url),'utf8');assert(css.includes('@container(max-height:220px)'));assert(css.includes('prefers-reduced-motion:reduce'));
console.log('PASS: visible first footing and target, real first drop and miss reset, actual narrow/off-centre tower alignment, preserved countdown and preparation, stable 100-frame DOM and unchanged simulation state.');
