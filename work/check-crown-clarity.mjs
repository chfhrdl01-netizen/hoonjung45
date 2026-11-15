import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const rules=fs.readFileSync(new URL('./game-rules.mjs',import.meta.url),'utf8');
const renderer=fs.readFileSync(new URL('./source/scripts/arcade-renderers.js',import.meta.url),'utf8');
const start=renderer.indexOf('function actionPackDrawCrown('),end=renderer.indexOf('const actionPackBuildBase=',start);
assert(start>=0&&end>start);
let allocations=0;
class Node{
 constructor(cls='',text=''){allocations++;this.className=cls;this.textContent=String(text);this.children=[];this.parentElement=null;this.dataset={};this.attrs={};this.style={};this.hidden=false;this.classList={toggle:(name,on)=>{const set=new Set(this.className.split(/\s+/).filter(Boolean));if(on)set.add(name);else set.delete(name);this.className=[...set].join(' ');}};}
 append(node){if(node.parentElement){const at=node.parentElement.children.indexOf(node);if(at>=0)node.parentElement.children.splice(at,1);}node.parentElement=this;this.children.push(node);}
 setAttribute(key,value){this.attrs[key]=String(value);}
}
const nodes=new Map(),actors=new Map(),layer=new Node('action-pack-layer'),actorLayer=new Node('actors');
const context=vm.createContext({Map,Set,Math,Number,String,Array,arcadeUIActors:actors,$:id=>id==='arcadeActors'?actorLayer:null,actionPackPosition:(node,x,y)=>{node.style.left=x/7+'%';node.style.top=y/4.6+'%';},actionPackNode:(key,tag,cls,text)=>{let node=nodes.get(key);if(!node){node=new Node(cls,text);nodes.set(key,node);layer.append(node);}node.className=cls;node.textContent=String(text);return node;}});
vm.runInContext(rules+'\n'+renderer.slice(start,end)+'\nthis.api={engine:createArcadeEngine(),draw:actionPackDrawCrown};',context);
const {engine,draw}=context.api;
const w=engine.create({id:'crown-clarity',game:'crown',seed:19,participants:[{id:'me',name:'정훈'},{id:'friend',name:'긴 이름 친구'}]});
for(const p of w.players){const actor=new Node('five-actor');actors.set(p.id,actor);actorLayer.append(actor);}
draw(w,'me');const badge=nodes.get('crownOwner'),mark=nodes.get('crown');assert.match(badge.textContent,/주인 없는 왕관/);assert.equal(mark.parentElement,actorLayer,'crown sits above character layers rather than behind avatars');assert.equal(badge.parentElement,actorLayer);assert.equal(mark.hidden,false);assert.equal(badge.attrs.role,'status');
assert([...actors.values()].every(actor=>actor.dataset.crownOwner==='false'));
// A real pickup switches the displayed ownership and attached marker.
w.phase='play';w.players[0].x=350;w.players[0].y=230;engine.step(w,.02,20);assert.equal(w.meta.ownerId,'me');draw(w,'me');
assert.equal(badge.textContent,'👑 왕관 보유 · 정훈 · 나');assert(badge.className.includes('is-own'));assert(actors.get('me').className.includes('is-crown-holder'));assert(mark.className.includes('is-owned'));assert.equal(mark.attrs['aria-label'],'정훈 님이 왕관 보유 중');assert.match(mark.style.top,/crown-owner-lift/);
// A real dash steal removes the old owner's ring and names the new holder.
w.elapsed=1.2;const thief=w.players[1],previous=w.players[0];thief.x=previous.x+40;thief.y=previous.y;thief.dx=-1;thief.dy=0;assert.equal(engine.input(w,'friend',{seq:1,action:'dash'},1220),true);engine.step(w,.02,1240);assert.equal(w.meta.ownerId,'friend');draw(w,'me');
assert.equal(badge.textContent,'👑 왕관 보유 · 긴 이름 친구');assert(!badge.className.includes('is-own'));assert(!actors.get('me').className.includes('is-crown-holder'));assert(actors.get('friend').className.includes('is-crown-holder'));
// The owner can approach a top corner without sending the crown offscreen.
thief.x=630;thief.y=75;draw(w,'me');assert.match(mark.style.left,/- 34px/);assert.match(mark.style.top,/- 20px/);
// A real camping drop restores the ground crown and clears all owner labels.
thief.cornerTime=1.2;w.elapsed=2.5;engine.step(w,.02,2520);assert.equal(w.meta.ownerId,'');draw(w,'me');assert.match(badge.textContent,/주인 없는 왕관/);assert(!mark.className.includes('is-owned'));assert.equal(mark.style.left,'50%');assert([...actors.values()].every(actor=>actor.dataset.crownOwner==='false'));
w.meta.ownerId='not-in-roster';const before=JSON.stringify(w),count=allocations;for(let i=0;i<100;i++)draw(w,'me');assert.equal(allocations,count,'ownership rendering reuses all three fixed nodes');assert.equal(JSON.stringify(w),before,'UI never changes the authoritative owner, scores or timers');assert.match(badge.textContent,/주인 없는 왕관/);
for(const value of Object.values(mark.style))assert(!/NaN|Infinity|undefined/.test(value));
const css=fs.readFileSync(new URL('./crown-clarity.css',import.meta.url),'utf8');assert(css.includes('max-width:calc(100% - 112px)'));assert(css.includes('@container(max-width:640px)'));assert(css.includes('prefers-reduced-motion:reduce'));assert(renderer.includes("if(w.game==='crown')actionPackDrawCrown(w,self);"));
console.log('PASS: real crown pickup, dash steal and drop update name/ring/above-avatar marker; unknown owners clear, top-edge crown stays inset, 100-frame stable DOM and unchanged game state.');
