import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('lunch-finale.mjs',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('lunch-finale.css',import.meta.url),'utf8');
const copy=v=>JSON.parse(JSON.stringify(v));
function environment({guest=false,count=8,clock=100000}={}){
 let now=clock,serial=0;const nodes=new Map(),timers=new Map(),intervals=[],disconnects=[];
 class Node {
  constructor(tag='div',cls='',text=''){this.tagName=tag.toUpperCase();this.className=cls;this.children=[];this.parentElement=null;this.dataset={};this.attrs={};this.listeners={};this.hidden=false;this.open=false;this._text=String(text);this._html='';this.style={setProperty:(k,v)=>this.style[k]=v};this.clientWidth=1000;this.clientHeight=500;this.scrollHeight=900;this.classList={add:c=>{if(!this.className.split(/\s+/).includes(c))this.className+=' '+c;},toggle:(c,yes)=>{const set=new Set(this.className.split(/\s+/).filter(Boolean));if(yes===undefined?!set.has(c):yes)set.add(c);else set.delete(c);this.className=[...set].join(' ');}};}
  set id(v){this._id=v;nodes.set(v,this);}get id(){return this._id||'';}
  set textContent(v){this._text=String(v);this.children=[];this._html='';}get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}
  set innerHTML(html){this._html=String(html);this._text='';this.children=[];const stack=[this],voids=new Set(['BR','HR','IMG','INPUT','META','LINK']);for(const match of String(html).matchAll(/<\/?[^>]+>|[^<]+/g)){const token=match[0];if(token.startsWith('</')){if(stack.length>1)stack.pop();continue;}if(!token.startsWith('<')){stack.at(-1)._text+=token;continue;}const tag=token.match(/^<([\w-]+)/)?.[1];if(!tag)continue;const node=new Node(tag);for(const a of token.matchAll(/([\w-]+)(?:="([^"]*)")?/g)){const key=a[1],value=a[2]??'';if(key===tag)continue;node.setAttribute(key,value);}stack.at(-1).append(node);if(!voids.has(node.tagName)&&!token.endsWith('/>'))stack.push(node);}}
  get innerHTML(){return this._html;}
  get isConnected(){return this===document.body||!!this.parentElement?.isConnected;}
  setAttribute(k,v){this.attrs[k]=String(v);if(k==='id')this.id=v;if(k==='class')this.className=v;if(k==='hidden')this.hidden=true;if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=v;}
  append(...items){for(const item of items){const n=typeof item==='string'?new Node('span','',item):item;n.parentElement=this;this.children.push(n);}}
  replaceChildren(...items){this.children=[];this._text='';this.append(...items);}
  descendants(){return this.children.flatMap(n=>[n,...n.descendants()]);}
  querySelectorAll(selector){const all=this.descendants();if(selector==='[data-film-scene]')return all.filter(n=>n.dataset.filmScene!==undefined);if(selector.startsWith('.'))return all.filter(n=>n.className.split(/\s+/).includes(selector.slice(1)));if(selector==='button')return all.filter(n=>n.tagName==='BUTTON');return [];}
  querySelector(selector){if(selector==='.film-bottom>span:last-child'){const bottom=this.querySelector('.film-bottom');return bottom?.children.filter(n=>n.tagName==='SPAN').at(-1)||null;}return this.querySelectorAll(selector)[0]||null;}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
  dispatchEvent(event){for(const fn of this.listeners[event.type]||[])fn(event);return !event.defaultPrevented;}
  focus(){document.activeElement=this;}
  showModal(){this.open=true;}
  close(){this.open=false;this.dispatchEvent({type:'close'});}
 }
 const document={body:null,activeElement:null};document.body=new Node('body');
 const roster=Array.from({length:count},(_,i)=>({id:'p'+i,name:'동료 '+(i+1),drink:i===7?'<b>우유</b>':['아메리카노','아이스 라테','유자차'][i%3],response:'join',left:false}));
 const result={id:'meal-1',person:roster[0].name,winnerId:roster[0].id,menu:'비빔밥',provisional:false,nominations:roster.map(m=>({id:m.id,person:m.name,menus:['비빔밥']}))};
 const delivery={id:'delivery-1',roundId:result.id,phase:'done',needsRedraw:false,winnerId:roster[1]?.id||roster[0].id,members:copy(roster)};
 class TestDate extends Date{static now(){return now;}}
 const env={console,document,Date:TestDate,performance:{now:()=>now},Math,JSON,Array,Set,Number,String,Event:class{constructor(type){this.type=type;}},result,delivery,netPhase:'result',active:true,host:!guest,netApplying:false,closed:[],setupCalls:0,publishes:0,
  netRoom:{code:'ROOM12',onDisconnect:fn=>disconnects.push(fn),closeRoom:reason=>{env.closed.push(reason);env.active=false;}},
  netIsActive:()=>env.active,netIsHost:()=>env.active&&env.host,lunchDecisionGetState:()=>({phase:'coffee',roundId:env.result.id}),deliveryGetState:()=>env.delivery,
  $:id=>nodes.get(id)||null,el:(tag,cls='',text='')=>new Node(tag,cls,text),deptAvatarSvg:()=>'<svg></svg>',netDepartment:()=> 'business',actionFood:()=> '🍱',beep:()=>{},netPublish:()=>env.publishes++,showSetup:()=>env.setupCalls++,
  setInterval:fn=>{intervals.push(fn);return intervals.length;},setTimeout:(fn,ms=0)=>{const id=++serial;timers.set(id,{fn,due:now+ms});return id;},clearTimeout:id=>timers.delete(id)};
 for(const id of ['roomNickname','roomCodeInput','roomConsent','resultView']){const n=new Node('input');n.id=id;n.value='old';n.checked=true;document.body.append(n);}
 vm.createContext(env);vm.runInContext(source+'\nthis.api={timeline:lunchFinaleTimeline,data:lunchFinaleData,get:lunchFinaleGetState,validate:lunchFinaleValidate,receive:lunchFinaleReceive,tick:lunchFinaleTick,open:lunchFinaleOpen,close:lunchFinaleClose,reset:lunchFinaleReset,advance:lunchFinaleAdvance,sceneAt:lunchFinaleSceneAt,get dialog(){return lunchFinaleDialog;},get shared(){return lunchFinaleShared;},get localEnd(){return lunchFinaleLocalEnd;}};',env);
 env.node=id=>nodes.get(id)||null;env.now=()=>now;env.advance=ms=>{now+=ms;let guard=0;while([...timers.values()].some(t=>t.due<=now)){assert(++guard<100,'bounded timer processing');const [id,t]=[...timers].filter(([,v])=>v.due<=now).sort((a,b)=>a[1].due-b[1].due)[0];timers.delete(id);t.fn();}for(const fn of intervals)fn();};env.disconnect=()=>disconnects.forEach(fn=>fn({self:true}));return env;
}
function assertStayedInRoom(e){
 assert.equal(e.api.dialog.open,false);
 assert.equal(e.active,true);
 assert.equal(e.netPhase,'result');
 assert.equal(e.netRoom.code,'ROOM12');
 assert.equal(e.setupCalls,0);
 assert.equal(e.closed.length,0);
 assert.equal(e.node('roomNickname').value,'old');
 assert.equal(e.node('roomCodeInput').value,'old');
 assert.equal(e.node('roomConsent').checked,true);
}
{
 for(const count of [1,2,8]){const e=environment({count}),plan=e.api.timeline(e.api.data());assert.equal(plan.sceneTimes[3]-plan.sceneTimes[2],13000,'coffee announcement lasts 13 seconds');assert.equal(plan.duration,count===8?43500:count===1?40000:40500);assert.equal(plan.duration,plan.sceneTimes.at(-1)+4500);}
}
{
 const e=environment();e.api.tick();const film=e.api.dialog,s=e.api.get();assert.equal(film.open,true);assert.equal(s.endAt-s.startAt,43500);assert.equal(e.api.validate(s),true);assert.equal(film.attrs.closedby,'none');assert.equal(film.querySelectorAll('button').length,0,'no skip or return-to-results button');assert.equal(e.node('lunchFinaleOpenBtn'),null,'result page has no replay bypass control');
 const cancel={type:'cancel',defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};film.dispatchEvent(cancel);assert.equal(cancel.defaultPrevented,true);assert.equal(film.open,true,'ESC leaves mandatory ending open');
 const orders=e.node('lunchFinaleOrders');assert.equal(orders.children.length,8);assert.equal(e.node('lunchFinaleOrderCount').textContent,'8잔');assert.equal(orders.children.at(-1).children.at(-1).textContent,'<b>우유</b>');assert.equal(orders.children.at(-1).children.at(-1).innerHTML,'','orders use textContent rather than HTML');assert.equal(film.querySelector('.film-creator-card'),null,'no central promotional card');assert.equal(film.querySelector('.film-credit-instagram'),null,'no Instagram ID in the rolling credits');
 const secret=e.node('lunchFinaleSecret'),link=e.node('lunchFinaleSecretLink');assert.equal(secret.tagName,'DETAILS');assert.equal(secret.open,false,'each ending begins with the link folded away');assert.equal(secret.parentElement.className,'film-bottom');assert.equal(secret.children[0].tagName,'SUMMARY');assert.equal(secret.children[0].textContent,'✦');assert.equal(secret.children[0].attrs['aria-label'],'작은 별 살펴보기');assert.equal(link.href,'https://www.instagram.com/mid_jhs/');assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener noreferrer');assert.equal(film.descendants().filter(n=>n.tagName==='A').length,1,'the hidden corner is the only Instagram link');
 secret.open=true;e.api.tick();assert.equal(secret.open,true,'ordinary rendering does not close a discovered link');assert.equal(e.api.localEnd,s.endAt,'opening the local Easter egg never changes the shared deadline');assert.deepEqual(copy(e.api.get()),copy(s),'discovery never enters shared game state');e.api.close();assert.equal(secret.open,false,'close folds the link away');e.api.tick();assert.equal(film.open,true);assert.equal(secret.open,false,'reopening does not reveal an old discovery');
 e.advance(8300);assert.equal(film.dataset.scene,'2');e.advance(12999);assert.equal(film.dataset.scene,'2');e.advance(1);assert.equal(film.dataset.scene,'3','coffee scene does not advance early');
 film.close();assert.equal(film.open,false);e.api.tick();assert.equal(film.open,true,'unexpected browser dismissal cannot bypass the mandatory film');assert.equal(e.api.localEnd,s.endAt,'dismissal never restarts or extends the film');
 e.advance(s.endAt-e.now()-1);assert.equal(film.open,true);
 e.advance(1);assertStayedInRoom(e);
 assert.equal(e.api.get(),null,'completed schedules are no longer published');
 e.advance(100000);assertStayedInRoom(e);
 assert.equal(e.publishes,1,'the same round does not start another ending');
 e.result.id='meal-2';e.delivery.roundId=e.result.id;e.delivery.id='delivery-2';
 e.api.tick();assert.equal(film.open,true,'a new round can show its own ending in the same room');
 assert.equal(e.api.get().roundId,'meal-2');
}
{
 const host=environment(),schedule=host.api.get(),guest=environment({guest:true,clock:700000});assert.equal(guest.api.receive(schedule),true);guest.api.tick();assert.equal(guest.api.dialog.open,true);
 const end=guest.api.localEnd;guest.advance(700);const repeat=copy(schedule);repeat.serverNow+=700;assert.equal(guest.api.receive(repeat),true);assert.equal(guest.api.localEnd,end,'periodic snapshots do not postpone the end of the film');
 for(const mutate of [s=>s.duration-=8500,s=>s.sceneTimes[3]-=8500,s=>s.endAt+=1,s=>s.data.orders[0].drink='변조 주문',s=>s.data.orders.pop(),s=>{s.data.coffeeId='p2';s.data.coffeeName='동료 3';}]){const invalid=copy(repeat);mutate(invalid);assert.equal(guest.api.validate(invalid),false,'guest rejects timeline/order/winner tampering');}
 guest.advance(end-guest.now()-1);assert.equal(guest.api.dialog.open,true);
 guest.advance(1);assertStayedInRoom(guest);
 const late=copy(schedule);late.serverNow=schedule.endAt+100;
 assert.equal(guest.api.receive(late),true);guest.api.tick();assertStayedInRoom(guest);
 guest.advance(100000);assertStayedInRoom(guest);
}
{
 const e=environment();e.delivery.members.forEach(m=>m.response='pass');e.delivery.winnerId='';e.api.tick();assert.equal(e.node('lunchFinaleOrdersEmpty').hidden,false);assert.equal(e.node('lunchFinaleOrders').hidden,true);assert.equal(e.api.validate(e.api.get()),true,'all-pass scene remains a valid ending');e.api.reset();assert.equal(e.api.dialog.open,false,'internal cleanup can close and clear film');e.advance(100000);assert.equal(e.closed.length,0,'cancelled schedule never exits an unrelated room');
}
{
 const e=environment();e.api.tick();e.netRoom.code='OTHER1';e.result.id='meal-2';e.delivery.roundId='stale';e.api.tick();assert.equal(e.api.shared,null);assert.equal(e.api.dialog.open,false);e.advance(100000);assert.equal(e.closed.length,0,'old room deadline cannot close a new room');
 const f=environment();f.api.tick();f.disconnect();assert.equal(f.api.dialog.open,false);assert.equal(f.api.shared,null,'disconnect clears shared film');
}
assert.match(css,/\.film-easter-egg:not\(\[open\]\)>.film-secret-link\{display:none\}/,'closed link is absent from display and keyboard navigation');
assert.match(css,/\.film-coffee\{display:grid;grid-template-columns:/,'desktop coffee scene uses announcement and order columns');assert.match(css,/@media\(max-width:600px\)[\s\S]*grid-template-columns:minmax\(0,1fr\);grid-template-rows:/,'mobile places all orders below the announcement');
console.log('PASS: mandatory ending blocks ESC/buttons/result bypass, coffee lasts 13s, all 8 final orders render safely, shared 40–43.5s deadlines validate, replay cannot extend time, all-pass/reset/disconnect/stale contexts and host/guest room retention after credits pass.');
