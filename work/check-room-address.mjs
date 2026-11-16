import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readSource, sourceManifest } from './assemble-source.mjs';
const source=[...readSource().matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).find(s=>s.includes('function installLunchRoom'));
const build=sourceManifest().build;
function environment({url='https://example.test/game/?v=old&room=RZH27X#old',clipboardWorks=true,historyWorks=true}={}){
 let now=0,nextTimer=1;const timers=new Map(),peers=[],nodes=new Map(),copied=[],addresses=[];
 class Emitter{constructor(){this.listeners=new Map();}on(type,fn){const list=this.listeners.get(type)||[];list.push(fn);this.listeners.set(type,list);return this;}emit(type,...args){for(const fn of this.listeners.get(type)||[])fn(...args);}}
 class Node extends Emitter{constructor(tag='div'){super();this.tagName=tag;this.value='';this.checked=false;this.disabled=false;this.hidden=false;this.textContent='';this.className='';this.children=[];this.classList={add(){},toggle(){}};}addEventListener(type,fn){this.on(type,fn);}append(...children){this.children.push(...children);}replaceChildren(...children){this.children=[...children];}focus(){}select(){}scrollIntoView(){}remove(){}async fire(type,event={}){for(const fn of this.listeners.get(type)||[])await fn(event);}}
 class Connection extends Emitter{constructor(peer){super();this.peer=peer;this.open=false;this.sent=[];}send(data){this.sent.push(JSON.parse(JSON.stringify(data)));}close(){if(this.open){this.open=false;this.emit('close');}}}
 class Peer extends Emitter{constructor(id,options){super();this.id=id||'guest-self';this.options=options;this.connections=[];this.destroyed=false;peers.push(this);}connect(id,options){const conn=new Connection(id);conn.options=options;this.connections.push(conn);return conn;}destroy(){this.destroyed=true;}reconnect(){}}
 const node=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);},location={href:url};
 const history={state:{retained:'state'},replaceState(state,title,next){if(!historyWorks)throw Error('history unavailable');this.state=state;location.href=next;addresses.push(next);}};
 const e={console,URL,TextEncoder,Uint32Array,Map,Set,Math,JSON,Peer,location,history,performance:{now:()=>now},crypto:{getRandomValues(values){values.forEach((_,i)=>values[i]=i);return values;}},navigator:{clipboard:{async writeText(value){if(!clipboardWorks)throw Error('clipboard blocked');copied.push(value);}}},document:{getElementById:node,createElement:tag=>new Node(tag),createTextNode:text=>text,body:new Node('body'),head:new Node('head'),addEventListener(){}},addEventListener(){},queueMicrotask:fn=>fn(),setTimeout(fn,delay){const id=nextTimer++;timers.set(id,{fn,at:now+delay});return id;},clearTimeout:id=>timers.delete(id),setInterval:()=>1};
 e.window=e;vm.createContext(e);new vm.Script(source,{filename:'production-room-transport.js'}).runInContext(e);
 const api=e.LunchRoom;
 return {e,api,node,peers,copied,addresses,location,history,async create(){node('roomNickname').value='방장';node('roomConsent').checked=true;await node('roomCreateBtn').fire('click');const peer=peers.at(-1);peer.emit('open',peer.id);return peer;},async join(value='MR67VX'){node('roomNickname').value='참가자';node('roomConsent').checked=true;node('roomCodeInput').value=value;await node('roomJoinBtn').fire('click');return peers.at(-1);},welcome(peer){peer.emit('open',peer.id);const conn=peer.connections[0];conn.open=true;conn.emit('open');conn.emit('data',{v:3,type:'welcome',presence:2,build,selfId:'guest-self',code:'MR67VX',members:[{id:'host-self',name:'방장',connected:true,consent:true},{id:'guest-self',name:'참가자',connected:true,consent:true}],locked:false});return conn;},advance(ms){now+=ms;for(const [id,t]of [...timers].sort((a,b)=>a[1].at-b[1].at))if(t.at<=now&&timers.has(id)){timers.delete(id);t.fn();}}};
}
function address(t){return new URL(t.location.href);}
{
 const t=environment();assert.equal(t.node('roomCodeInput').value,'RZH27X');await t.create();
 assert.equal(t.api.code,'ABCDEF');assert.equal(address(t).searchParams.get('room'),'ABCDEF','creating from an old invitation replaces its room code in the address bar');assert.equal(address(t).searchParams.get('v'),build);assert.equal(address(t).hash,'');assert.equal(t.node('roomCodeInput').value,t.api.code);assert.equal(t.history.state.retained,'state');
 await t.node('roomCopyBtn').fire('click');assert.equal(t.copied[0],t.location.href,'copy button and address bar share the same actual room');
 t.api.closeRoom();assert.equal(address(t).searchParams.has('room'),false);assert.equal(t.node('roomCodeInput').value,'');assert.equal(t.node('roomConsent').checked,false);assert.equal(t.api.active,false);
 await t.create();assert.equal(address(t).searchParams.get('room'),t.api.code,'a second room never reuses a retired invitation in the URL');
}
{
 const t=environment(),peer=await t.join(' mr67vx\n');assert.equal(address(t).searchParams.get('room'),'MR67VX','manual code entry supersedes the old URL before connecting');assert.equal(t.node('roomCodeInput').value,'MR67VX');assert.match(t.node('roomStatus').textContent,/MR67VX/);
 const conn=t.welcome(peer);assert.equal(t.api.active,true);assert.equal(address(t).searchParams.get('room'),t.api.code);assert.equal(conn.sent[0].build,build,'the invitation patch preserves existing protocol/build compatibility');assert.equal(conn.peer,'du-lunch-online-v3-MR67VX');
 await t.node('roomCopyBtn').fire('click');assert.equal(new URL(t.copied[0]).searchParams.get('room'),'MR67VX');
 conn.emit('data',{v:3,type:'ended',reason:'방장이 주문 참여를 취소했어요.'});assert.equal(t.api.active,false);assert.equal(address(t).searchParams.has('room'),false,'a closed room is not left in the address bar');
}
{
 const t=environment(),peer=await t.join();peer.emit('error',{type:'peer-unavailable'});assert.equal(t.api.active,false);assert.equal(t.node('roomNickname').disabled,false);assert.match(t.node('roomStatus').textContent,/해당 방을 찾을 수 없어요/);assert.equal(address(t).searchParams.get('room'),'MR67VX','a failed attempt retains only the requested room for an intentional retry');
}
{
 const t=environment(),peer=await t.join();t.advance(20001);assert.equal(t.api.active,false);assert.equal(peer.destroyed,true);assert.equal(t.node('roomNickname').disabled,false,'an unanswered join releases busy inputs');assert.match(t.node('roomStatus').textContent,/방에 연결하지 못했어요/);const before=t.location.href;peer.emit('open',peer.id);assert.equal(peer.connections.length,0,'a late open from a timed-out attempt cannot reconnect');assert.equal(t.location.href,before);
}
{
 const t=environment(),peer=await t.join(),conn=t.welcome(peer);conn.emit('data',{v:3,type:'reject',message:'이미 사용 중인 닉네임이에요. 다른 이름을 골라주세요.'});assert.equal(t.node('roomNickname').disabled,false);assert.match(t.node('roomStatus').textContent,/이미 사용 중인 닉네임/);assert.equal(address(t).searchParams.has('room'),false);
}
for(const historyWorks of [true,false]){
 const t=environment({clipboardWorks:false,historyWorks});await t.create();await t.node('roomCopyBtn').fire('click');assert.equal(t.node('roomCopyFallback').hidden,false);const invitation=new URL(t.node('roomCopyFallback').value);assert.equal(invitation.searchParams.get('room'),t.api.code,'manual copy fallback always uses the active room, even if history or clipboard is unavailable');assert.equal(invitation.searchParams.get('v'),build);assert.equal(t.api.active,true);
}
console.log('PASS: creating from stale invitations, manual-code joins, matching address/input/copy link, protocol compatibility, leave/ended cleanup, unavailable rooms, bounded timeout and late callbacks, duplicate-name rejection, and history/clipboard fallback.');
