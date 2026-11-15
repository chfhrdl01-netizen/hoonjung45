import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read=file=>fs.readFileSync(new URL(file,import.meta.url),'utf8');
const picker=read('department-picker.mjs'),controller=read('arcade-controller.mjs'),party=read('source/scripts/practice-and-party-games.js');
const gameKeys=['sneak','dodge','runner','coins','stamp','brawl','kart','doors','rhythm','basket','tray','pong','curling','bowling','volley','golf','parking','dodgeball','crown','lasers','frogger','bridge','claw','memory','sorter','receipt','safe','auction','stacker','reaction'];
const between=(source,start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const entryPoints=between(controller,'function arcadeDemoStart(','\nfunction arcadeHandle(')+'\n'+party.split('\n').find(line=>line.startsWith('function arcadePracticeStart('))+'\n'+between(party,'function trayDemoStart(','\nfunction trayBotStep(');
function environment(){
 const ids=new Map(),events=[],commands=[],starts=[];let document,online=false;
 class Node{
  constructor(tag='div',cls='',text=''){this.tagName=tag.toUpperCase();this.className=cls;this.textContent=text;this.children=[];this.parentNode=null;this.dataset={};this.attrs={};this.listeners=new Map();this.value='';this.hidden=false;this.disabled=false;this.open=false;this.classList={add(){}};}
  set id(value){this._id=value;ids.set(value,this);}get id(){return this._id||'';}
  setAttribute(key,value){this.attrs[key]=String(value);if(key==='id')this.id=value;if(key==='class')this.className=value;}
  getAttribute(key){return this.attrs[key]??null;}
  append(...nodes){for(const node of nodes){if(node.tagName==='#FRAGMENT'){this.append(...node.children.slice());continue;}node.remove();node.parentNode=this;this.children.push(node);}}
  remove(){if(this.parentNode){const siblings=this.parentNode.children;const index=siblings.indexOf(this);if(index>=0)siblings.splice(index,1);}this.parentNode=null;}
  replaceChildren(...nodes){for(const child of this.children)child.parentNode=null;this.children=[];this.append(...nodes);}
  before(node){const parent=this.parentNode,index=parent.children.indexOf(this);node.remove();node.parentNode=parent;parent.children.splice(index,0,node);}
  all(){return this.children.flatMap(node=>[node,...node.all()]);}
  matches(selector){return selector.startsWith('#')?this.id===selector.slice(1):selector.startsWith('.')?this.className.split(/\s+/).includes(selector.slice(1)):this.tagName===selector.toUpperCase();}
  querySelector(selector){return this.all().find(node=>node.matches(selector))||null;}
  get isConnected(){for(let node=this;node;node=node.parentNode)if(node===document.body)return true;return false;}
  set innerHTML(value){this._html=value;this.replaceChildren();const stack=[this],tags=/<\/?([a-z][\w-]*)\b([^>]*?)>/gi;let match;
   while((match=tags.exec(value))){const [full,tag,attrs]=match;if(full.startsWith('</')){if(stack.length>1)stack.pop();continue;}const node=new Node(tag);for(const attr of attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g))node.setAttribute(attr[1],attr[2]||'');stack.at(-1).append(node);if(!['input','br','hr','img'].includes(tag.toLowerCase())&&!full.endsWith('/>'))stack.push(node);}
  }
  get innerHTML(){return this._html||'';}
  addEventListener(type,listener){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(listener);}
  dispatchEvent(event){event.target=this;for(const fn of this.listeners.get(event.type)||[])fn(event);return true;}
  click(){if(!this.disabled)this.dispatchEvent({type:'click'});}
  focus(){document.activeElement=this;}
  showModal(){this.open=true;}
  close(){if(!this.open)return;this.open=false;events.push(()=>this.dispatchEvent({type:'close'}));}
 }
 const body=new Node('body'),menu=new Node('section'),tournament=new Node('button'),nickname=new Node('input');menu.id='arcadeMenu';tournament.id='arcadeTournamentBtn';nickname.id='roomNickname';nickname.value='테스터';body.append(menu,nickname);menu.append(tournament);
 document={body,activeElement:body,querySelector:selector=>body.querySelector(selector),createDocumentFragment:()=>new Node('#fragment')};
 const e={console,Map,Set,Math,Date,performance:{now:()=>100},document,$:id=>ids.get(id)||null,el:(...args)=>new Node(...args),Event:class{constructor(type){this.type=type;}},netReady:{},netDepartments:{},netSelfId:()=> 'self',netIsActive:()=>online,netRoom:{send:cmd=>commands.push(cmd)},renderSetup(){},arcadeEnsureUI(){},arcadeRender(){},deptAvatarSvg:id=>'<svg data-avatar="'+id+'"></svg>',deptUnselectedSvg:()=>'<svg data-avatar="unselected">?</svg>',arcadeGameKeys:gameKeys,arcadeBusy:()=>false,arcadeMakeState:(mode,game,members)=>({mode,chosen:game,members}),arcadeOpen(){},arcadeStartWorld(){starts.push({kind:'arcade'});},brawlPrepare:spec=>starts.push({kind:'brawl',spec}),brawlStart(){},trayCancel(){},trayEngine:{create:({participants})=>({participants})},trayOpen(){starts.push({kind:'tray'});}};
 vm.createContext(e);vm.runInContext(read('departments.mjs')+`\nfunction deptOption(value){return deptById.get(value)||deptById.get('business');}function netHasDepartment(id){return deptById.has(netDepartments[id]);}function netDepartment(id){return netHasDepartment(id)?netDepartments[id]:'business';}\n`+
 // Function declarations are hoisted in the real app: online setup creates its picker before this module's state initializes.
 'this.initialWrap=deptPickerCreate();\n'+picker+`\nlet arcadeState=null,arcadeDemo=false,arcadePractice=null,arcadePracticeSeq=0,trayDemo=false,trayState=null,trayContext='',trayInputSeq=0,trayPumpAt=0,trayAccum=0;function arcadeCancel(){arcadeState=null;}\n`+entryPoints+`\nthis.api={get choice(){return deptPracticeChoice;},get state(){return arcadeState;},get tray(){return trayState;},demo:arcadeDemoStart,brawl:arcadePracticeStart,trayStart:trayDemoStart,require:deptPracticeRequire,open:deptPickerOpen,select:deptPickerSelect,cancel:deptPickerCancel,sync:deptPickerSync,practiceSync:deptPracticeSync,reset(){deptPracticeChoice='';arcadeState=null;deptPracticeSync();}};`,e);
 body.append(e.initialWrap);e.api.sync();e.api.practiceSync();
 return {e,api:e.api,commands,starts,ids,online(value){online=value;},flush(){while(events.length)events.shift()();},cards(){return ids.get('deptCharacterCards')?.children||[];}};
}
{
 const t=environment();assert.equal(t.api.choice,'');assert.equal(t.ids.get('netDepartment').value,'');assert.equal(t.ids.get('netDepartment').children[0].value,'');assert.equal(t.ids.get('deptPracticeBar').dataset.department,'unselected');assert.equal(t.ids.get('arcadeMenu').children[0].id,'deptPracticeBar');
 t.api.open('network');assert(t.cards().every(card=>card.getAttribute('aria-pressed')==='false'),'no department card is preselected');t.api.select('hotel');assert.equal(t.commands.length,1);assert.equal(t.commands[0].value,'hotel');assert.equal(t.ids.get('netDepartment').value,'','pending network selection stays unselected until acknowledged');assert.equal(t.api.choice,'','network choice never selects offline character');t.flush();
 t.e.netDepartments.self='hotel';t.api.sync();assert.equal(t.ids.get('netDepartment').value,'hotel');t.e.netReady.self=true;t.api.open('network');assert.equal(t.ids.get('deptPickerDialog').open,false,'ready participant cannot change character');
}
{
 const t=environment();let launched=0;t.api.require(()=>launched++);assert.equal(t.ids.get('deptPickerDialog').dataset.context,'practice');t.api.cancel();t.flush();t.api.open('practice');t.api.select('accounting');assert.equal(launched,0);t.flush();assert.equal(launched,0,'cancelled launch cannot run after a later selection');assert.equal(t.commands.length,0);assert.equal(Object.keys(t.e.netDepartments).length,0,'offline choice does not modify room state');
}
{
 const t=environment();let launched=0;t.api.require(()=>launched++);t.ids.get('deptPickerDialog').dispatchEvent({type:'cancel'});t.ids.get('deptPickerDialog').close();t.flush();t.api.open('practice');t.api.select('hotel');t.flush();assert.equal(launched,0,'Escape cancellation clears pending launch');
}
for(const game of gameKeys){
 const t=environment();assert.equal(t.api.demo(game,'single'),false);assert.equal(t.api.state,null,'no match starts before explicit choice');assert(t.cards().every(card=>card.getAttribute('aria-pressed')==='false'));t.api.select('hotel');assert.equal(t.ids.get('deptPickerDialog').open,false);assert.equal(t.starts.length,0,'launch waits until picker has closed');t.flush();assert.equal(t.starts.length,1);assert.equal(t.api.state.members.find(member=>member.id==='arcade-you').department,'hotel');assert.equal(t.api.state.chosen,game);t.api.select('accounting');t.flush();assert.equal(t.starts.length,1,'stale card event cannot launch twice');assert.equal(t.commands.length,0);
 assert.equal(t.api.demo(game,'tournament'),true,'a chosen character persists for later practice');assert.equal(t.api.state.mode,'tournament');assert.equal(t.api.state.members[0].department,'hotel');
}
for(const kind of ['brawl','trayStart']){
 const t=environment();t.api[kind]();assert.equal(t.starts.length,0);t.api.select('accounting');t.flush();assert.equal(t.starts.length,1);const member=kind==='brawl'?t.starts[0].spec.participants[0]:t.api.tray.members[0];assert.equal(member.department,'accounting');assert.equal(t.commands.length,0);
}
{
 const t=environment();t.api.demo('coins','tournament');t.online(true);t.api.select('hotel');t.flush();assert.equal(t.starts.length,0,'joining a room during selection cannot start an offline match');assert.equal(t.api.choice,'');
}
console.log('PASS: initial unknown characters, canonical network acknowledgement, ready lock, offline isolation, cancel safety, all 30 practice games, five-round series and bonus brawl/tray explicit selection.');
