import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read=file=>fs.readFileSync(new URL(file,import.meta.url),'utf8');
const network=read('source/scripts/race-and-network.js'),session=read('source/scripts/menu-session.js');
function section(text,start,end){const a=text.indexOf(start),b=text.indexOf(end,a);assert(a>=0&&b>a,'source section exists: '+start);return text.slice(a,b);}
const helpers=section(network,'function netHasDepartment(id){','function netMembers(){');
const setup=section(network,'renderSetup=function(){','\nchoose=function');
const handle=section(network,'function netHandle(senderId,cmd){','function netReceive(s){');
const begin=section(session,'function netBeginMenuTournament(){','\nfunction netCancelMenuTournament');
const legacy=section(network,'function netBeginRace(){','\nfunction netEnterRace(){').replace('function netBeginRace(){','function legacyBeginRace(){');
const lifecycle=['netRoom.onReady(', 'netRoom.onDisconnect('].map(prefix=>network.split('\n').find(line=>line.startsWith(prefix))).join('\n');
const valid=read('source/scripts/app-core-and-combat.js').split('\n').find(line=>line.startsWith('function validName('));
const clone=value=>JSON.parse(JSON.stringify(value));

class Node{
 constructor(tag='',className='',text=''){this.tag=tag;this.className=className;this.textContent=text;this.children=[];this.dataset={};this.attributes={};this.hidden=false;this.disabled=false;this.value='';this.classList={toggle(){}};}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=nodes;}
 setAttribute(key,value){this.attributes[key]=value;}
}
const content=node=>[node.textContent,...node.children.map(content)].join(' ');
function environment({count=2,host=true}={}){
 const nodes=new Map(),stats={starts:0,publishes:0,locks:[],readyCallback:null,disconnectCallback:null};
 const roster=Array.from({length:count},(_,i)=>({id:'p'+i,name:'참가자'+i,consent:true,connected:true}));
 const e={console,Map,Set,Math,Number,String,Array,Object,JSON,Date,host,connected:true,netRoster:roster,netPicks:{},netReady:{},netDepartments:{},netPhase:'setup',netSpec:null,netDuelMeta:null,netLastSeq:0,netPendingPick:false,active:0,choices:[],arcadeState:null,arcadeDemo:false,result:null,mode:'setup',race:null,duel:null,
  $:id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);},el:(...args)=>new Node(...args),document:{createTextNode:text=>new Node('text','',text),querySelectorAll:()=>[]},
  netIsHost:()=>e.host,netIsActive:()=>e.connected,netSelfId:()=>roster[0]?.id||'',netMembers:()=>e.netRoster.filter(m=>m.consent===true&&m.connected!==false),
  netSyncRoster(){const members=e.netMembers();e.active=Math.max(0,members.findIndex(m=>m.id===e.netSelfId()));e.choices=members.map(m=>(e.netPicks[m.id]||[]).map(name=>({name})));},
  netRoom:{members:roster,setLocked:locked=>stats.locks.push(locked),onReady:fn=>stats.readyCallback=fn,onDisconnect:fn=>stats.disconnectCallback=fn},
  renderMenus(){},notify(){},showSetup(){e.renderSetup();},netPublish(){stats.publishes++;},deptCancel(){},cancelActionDuel(){},
  arcadeBusy:()=>false,arcadeCancel(){e.arcadeState=null;},arcadeMakeState:(mode,key,members)=>({id:'league',members,mode,key}),arcadeInitPoints(){},netEnterMenuTournament(){},arcadeOpen(){},arcadeStartWorld(){stats.starts++;},
  netEnterRace(){stats.starts++;},rand:()=>0,
 };
 for(const name of ['roomChatHandle','awardHandle','lunchDecisionHandle','deliveryHandle','arcadeHandle','trayHandle','coffeeHandle','groupHandle'])e[name]=()=>false;
 vm.createContext(e);vm.runInContext(read('departments.mjs')+'\n'+valid+'\n'+helpers+'\n'+setup+'\n'+begin+'\n'+legacy+'\n'+handle+'\n'+lifecycle+'\nnetBeginRace=netBeginMenuTournament;this.departmentIds=deptOptions.map(d=>d.id);',e);
 const command=(id,t,values={})=>e.netHandle(id,{t,...values});
 const select=(id,i=0)=>command(id,'department',{value:e.departmentIds[i]});
 const menu=(id,name='비빔밥')=>command(id,'pick',{name});
 const ready=id=>command(id,'ready',{value:true});
 return {e,stats,nodes,roster,command,select,menu,ready};
}

// A legacy simulation fallback cannot silently count as an explicit character choice.
{
 const t=environment();t.e.renderSetup();
 assert.equal(t.e.netDepartment('p0'),'business');assert.equal(t.e.netHasDepartment('p0'),false);
 assert.equal(t.nodes.get('netDepartment').value,'');assert.equal(t.nodes.get('startBtn').disabled,true);assert.equal(t.nodes.get('startBtn').textContent,'캐릭터를 먼저 골라주세요');
 for(const card of t.nodes.get('players').children){assert.equal(card.dataset.characterSelected,'false');assert.match(content(card),/\? 캐릭터 선택 대기/);assert(!content(card).includes('경영'));}
 const before=t.stats.publishes;t.ready('p0');assert.equal(t.e.netReady.p0,undefined);assert.equal(t.stats.publishes,before);
 t.menu('p0');t.ready('p0');assert.equal(t.e.netReady.p0,undefined);assert.equal(t.stats.starts,0);
 t.select('p0');assert.equal(t.nodes.get('netDepartment').value,t.e.departmentIds[0]);assert.equal(t.nodes.get('startBtn').disabled,false);assert.equal(t.nodes.get('players').children[0].dataset.characterSelected,'true');
 t.ready('p0');assert.equal(t.e.netReady.p0,true);assert.equal(t.stats.starts,0);assert.equal(t.nodes.get('startBtn').disabled,false,'ready participant can cancel');assert.equal(t.nodes.get('netDepartment').disabled,true);
 const first=t.e.netDepartments.p0;t.select('p0',1);assert.equal(t.e.netDepartments.p0,first,'ready choice is locked');
 t.command('p0','ready',{value:false});t.select('p0',1);assert.equal(t.e.netDepartments.p0,t.e.departmentIds[1]);
}

// The host rejects invalid selections, forged readiness, missing/invalid menus and outsiders.
{
 const t=environment();t.menu('p0');
 for(const value of ['',null,{},'unknown','constructor']){t.command('p0','department',{value});t.ready('p0');assert.equal(t.e.netHasDepartment('p0'),false);assert.equal(t.e.netReady.p0,undefined);}
 t.e.netDepartments=Object.create({p0:t.e.departmentIds[0]});assert.equal(t.e.netHasDepartment('p0'),false,'prototype value is not an explicit choice');
 t.e.netDepartments={p0:'unknown',p1:'unknown'};t.e.netReady={p0:true,p1:true};t.e.netPicks={p0:['비빔밥'],p1:['우동']};assert.equal(t.e.netBeginMenuTournament(),false);t.e.legacyBeginRace();assert.equal(t.stats.starts,0);
 t.e.netReady={};t.select('p0');for(const picks of [[],[''],['\u0000'],['가'.repeat(21)],['비빔밥','우동'],null]){t.e.netPicks.p0=picks;t.ready('p0');assert.equal(t.e.netReady.p0,undefined);}
 t.command('outsider','department',{value:t.e.departmentIds[0]});t.command('outsider','ready',{value:true});assert.equal(t.e.netDepartments.outsider,undefined);assert.equal(t.e.netReady.outsider,undefined);
 t.command('p0','ready',{value:'true'});assert.equal(t.e.netReady.p0,undefined);
 t.e.netReady.p0=true;t.e.netDepartments={};t.e.renderSetup();assert.equal(t.nodes.get('startBtn').disabled,false);t.command('p0','ready',{value:false});assert.equal(t.e.netReady.p0,false,'malformed ready state can still be cancelled');
}

// All supported room sizes start only after the last participant chooses and readies.
for(const count of [2,3,8]){
 const t=environment({count});
 for(let i=0;i<count;i++){const id=t.roster[i].id;t.menu(id,'점심'+i);t.ready(id);assert.equal(t.e.netReady[id],undefined);t.select(id,i);t.ready(id);assert.equal(t.stats.starts,i===count-1?1:0);}
 assert.equal(t.e.netPhase,'menuTournament');assert.equal(t.e.netSpec.participants.length,count);assert.deepEqual(clone(t.e.netSpec.participants.map(p=>p.department)),clone(t.e.departmentIds.slice(0,count)));assert.deepEqual(t.stats.locks,[true]);
 assert.equal(t.e.netBeginMenuTournament(),false);t.ready('p0');assert.equal(t.stats.starts,1,'repeated ready/start cannot start another game');
}
for(const count of [0,1,9]){const t=environment({count});for(const p of t.roster){t.e.netDepartments[p.id]=t.e.departmentIds[0];t.e.netPicks[p.id]=['비빔밥'];t.e.netReady[p.id]=true;}assert.equal(t.e.netBeginMenuTournament(),false);assert.equal(t.stats.starts,0);}
{
 const t=environment({host:false});t.menu('p0');t.select('p0');t.ready('p0');assert.deepEqual(t.e.netPicks,{});assert.deepEqual(t.e.netDepartments,{});assert.deepEqual(t.e.netReady,{});assert.equal(t.e.netBeginMenuTournament(),false);assert.equal(t.stats.starts,0);
}

// Fresh room lifecycle clears stale selections on hosts and guests; a same-room reset retains choices.
for(const host of [true,false]){
 const t=environment({host});t.e.netDepartments={p0:t.e.departmentIds[0]};t.e.netReady={p0:true};t.e.netPicks={p0:['비빔밥']};t.e.netPhase='result';t.stats.readyCallback();
 assert.deepEqual(clone(t.e.netDepartments),{});assert.deepEqual(clone(t.e.netReady),{});assert.deepEqual(clone(t.e.netPicks),{});assert.equal(t.e.netPhase,'setup');assert.equal(t.nodes.get('netDepartment').value,'');assert.equal(t.nodes.get('startBtn').disabled,true);
 t.e.netDepartments={p0:t.e.departmentIds[0]};t.stats.disconnectCallback({self:true});assert.deepEqual(clone(t.e.netDepartments),{});
}
{
 const t=environment();t.select('p0');const department=t.e.netDepartments.p0;t.e.netPhase='result';t.command('p0','reset');assert.equal(t.e.netDepartments.p0,department);assert.equal(t.e.netReady.p0,undefined);assert.equal(t.e.netPicks.p0,undefined);assert.equal(t.nodes.get('netDepartment').value,department);assert.equal(t.nodes.get('startBtn').disabled,true,'same-room replay still needs a new menu and ready');
}
console.log('PASS: explicit character and menu required before Ready; host/spoof validation, unknown setup UI, 2/3/8 participant starts, locked ready choices and fresh-room/reset lifecycle.');
