import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { readSource } from './assemble-source.mjs';
const source=fs.readFileSync(new URL('duel-controls.mjs',import.meta.url),'utf8');
const base=readSource();
function between(a,b){const start=base.indexOf(a),end=base.indexOf(b,start);assert(start>=0&&end>start);return base.slice(start,end);}
const actualNetControls=between('function netRefreshCombatControls(){','\nactionRender=function');
const actualLocalControls=base.match(/^function actionControls\(on\)\{[^\n]+/m)[0];
const ids=new Map();let created=0;
class Node{
 constructor(tag='div'){created++;this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attrs={};this.listeners={};this.hidden=false;this.disabled=false;this.textContent='';this.value='';this.classes=new Set();this.classList={toggle:(n,on)=>{if(on)this.classes.add(n);else this.classes.delete(n);}};}
 set id(value){this._id=value;ids.set(value,this);}get id(){return this._id;}
 setAttribute(k,v){this.attrs[k]=String(v);}removeAttribute(k){delete this.attrs[k];}
 append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);}}
 before(node){node.parent=this.parent;this.parent?.children.splice(this.parent.children.indexOf(this),0,node);}
 after(node){node.parent=this.parent;this.parent?.children.splice(this.parent.children.indexOf(this)+1,0,node);}
 addEventListener(type,fn){this.listeners[type]=fn;}
 get options(){return this.children.filter(n=>n.tagName==='OPTION');}
 all(){return this.children.flatMap(n=>[n,...n.all()]);}
 querySelectorAll(selector){return this.all().filter(n=>selector==='[data-battle-action]'?!!n.dataset.battleAction:selector==='.battle-control-panel'?n.role==='panel':false);}
 querySelector(selector){if(selector==='strong')return this.title||null;if(selector==='.battle-key-hint')return this.hint||null;if(selector==='kbd')return this.kbd||null;if(selector==='.battle-controls')return this.controls||null;if(selector==='.battle-instructions')return this.instructions||null;if(selector==='.battle-intro p')return this.intro||null;return null;}
}
const view=new Node();view.id='duelView';view.hidden=false;
const controls=new Node();view.controls=controls;controls.parent=view;view.children.push(controls);
view.instructions=new Node('p');view.intro=new Node('p');
const actions=['left','right','jump','attack','guard'],panels=[],buttons=[];
for(let side=0;side<2;side++){
 const p=new Node();p.role='panel';p.title=new Node('strong');p.hint=new Node();p.append(p.title,p.hint);panels.push(p);controls.append(p);
 for(const action of actions){const b=new Node('button');b.dataset={battlePlayer:String(side),battleAction:action};b.kbd=new Node('kbd');b.append(b.kbd);p.append(b);buttons.push(b);}
}
for(const id of ['duelStartBtn','battlePauseBtn','duelCancelBtn','duelFinishBtn','battleStatus']){const n=new Node('button');n.id=id;}
const document={getElementById:id=>ids.get(id),createElement:tag=>new Node(tag),querySelectorAll:selector=>selector==='[data-battle-action]'?buttons:selector==='.battle-control-panel'?panels:[]};
const intervals=[],sent=[];
const env={document,console,Number,String,mode:'duel',duel:{id:'duel-1',phase:'idle',challenger:'Alpha',defender:'Beta'},online:true,side:0,releaseCount:0,renders:0,$:id=>ids.get(id),netActionOnline:()=>env.online,netIsActive:()=>env.online,netActionSide:()=>env.side,netSelfSide:()=>env.side,netActionHost:()=>false,actionReleaseAll:()=>env.releaseCount++,actionRender:()=>{env.renders++;return 'render-result';},netSendCombat:(...a)=>sent.push(a),setInterval:fn=>{intervals.push(fn);}};
vm.createContext(env);vm.runInContext(actualLocalControls+'\n'+actualNetControls+'\n'+source+'\nthis.pad={refresh:duelControlsRefresh,side:duelControlsSide};',env);
const buttonIdentity=[...buttons],dataBefore=buttons.map(b=>JSON.stringify(b.dataset));
env.netRefreshCombatControls();assert.deepEqual(panels.map(p=>p.hidden),[false,true]);assert.equal(controls.hidden,false);assert.equal(ids.get('duelControlSideSelect').hidden,true);assert.equal(buttons.every(b=>b.disabled),true,'waiting for ready remains non-interactive');assert.equal(ids.get('duelStartBtn').hidden,false);assert.equal(panels[0].title.textContent,'Alpha · 내 조작');
env.duel.phase='fight';env.netRefreshCombatControls();assert(buttons.slice(0,5).every(b=>!b.disabled));assert(buttons.slice(5).every(b=>b.disabled));assert.equal(buttons[3].kbd.textContent,'F / K');assert.equal(buttons[4].attrs['aria-label'],'내 캐릭터 방어');
env.side=1;env.netRefreshCombatControls();assert.deepEqual(panels.map(p=>p.hidden),[true,false]);assert(buttons.slice(0,5).every(b=>b.disabled));assert(buttons.slice(5).every(b=>!b.disabled));assert.equal(panels[1].title.textContent,'Beta · 내 조작');assert.equal(buttons[8].kbd.textContent,'F / K','either online key family operates the owner');assert.equal(buttons[5].kbd.textContent,'A / ←');
env.side=-1;env.netRefreshCombatControls();assert.equal(controls.hidden,true);assert(panels.every(p=>p.hidden));assert.equal(ids.get('duelSpectatorControls').hidden,false);assert.equal(ids.get('duelStartBtn').hidden,true);assert(buttons.every(b=>b.disabled),'spectator never gets an actionable pad');
env.online=false;env.actionControls(true);assert.equal(controls.hidden,false);assert.deepEqual(panels.map(p=>p.hidden),[false,true]);const select=ids.get('duelControlSideSelect');assert.equal(select.hidden,false);assert.equal(buttons[3].kbd.textContent,'F');assert.equal(buttons[8].kbd.textContent,'K');assert(buttons.every(b=>!b.disabled),'local keyboard still retains both original fighter input sets');
select.value='1';select.listeners.change();assert.equal(env.releaseCount,1,'changing local touch target releases held local buttons');assert.deepEqual(panels.map(p=>p.hidden),[true,false]);assert.equal(buttons[8].kbd.textContent,'K');assert.equal(select.options[1].textContent,'방어자 · Beta');
env.online=true;env.side=0;select.value='1';select.listeners.change();assert.equal(env.releaseCount,1,'online selector cannot choose the other fighter');env.duel.phase='paused';env.netRefreshCombatControls();assert.deepEqual(panels.map(p=>p.hidden),[false,true]);assert(buttons.every(b=>b.disabled));assert.equal(ids.get('duelStartBtn').hidden,false);
const allocationAfterSetup=created;for(let i=0;i<200;i++)assert.equal(env.actionRender(),'render-result');assert.equal(created,allocationAfterSetup,'render refresh must reuse the same pad and target selector');assert.equal(env.renders,200);assert.equal(intervals.length,1);assert.deepEqual(buttons,buttonIdentity);assert.deepEqual(buttons.map(b=>JSON.stringify(b.dataset).replace(/,"netRemote":"(?:true|false)"/,'')),dataBefore,'button ownership/action mappings remain unchanged');assert.equal(sent.length,0,'layout refresh cannot send combat or ready commands');
view.hidden=true;env.pad.refresh();assert.equal(ids.get('duelControlToolbar').hidden,true);view.hidden=false;env.duel={...env.duel,id:'duel-2',challenger:'Gamma',defender:'Delta'};env.side=1;env.pad.refresh();assert.equal(panels[1].title.textContent,'Delta · 내 조작','a new match refreshes owner/name rather than stale panel');
console.log('PASS: one owned keypad online, no spectator controls, correct keys for both sides, preserved ready/fight permissions and original button identities, switchable single local pad with both keyboard sets, release on local switch, cached render reuse and no generated combat commands.');
