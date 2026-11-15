

/* PRACTICE_NORMAL_DIFFICULTY_V1 */
// Only the two legacy solo practices use these brains. Human multiplayer rules stay unchanged.
function practiceNormalSeed(value){let seed=2166136261;for(const c of String(value)){seed^=c.charCodeAt(0);seed=Math.imul(seed,16777619);}return seed>>>0;}
function practiceNormalRoll(brain){brain.randomState=(Math.imul(brain.randomState,1664525)+1013904223)>>>0;return brain.randomState/4294967296;}
function practiceNormalBrain(store,id,sessionId,t,index=0){
 let b=store.get(id);if(!b||b.normalSession!==sessionId||t<(b.lastTime??-1)-.05){
  b={seq:b?.seq||0,normalSession:sessionId,randomState:practiceNormalSeed(sessionId+':'+id),lastTime:t,targetId:'',targetUntil:0,next:t+.35+index*.08,attackNext:t+1.7+index*.2,beamNext:t+3.8+index*.5,jumpNext:t+.8,dash:t+2.8+index*.3};store.set(id,b);
 }
 b.lastTime=t;return b;
}
function practiceNormalTarget(brain,others,distance,t){
 let target=others.find(p=>p.id===brain.targetId);if(!target||t>=brain.targetUntil){const sorted=others.slice().sort((a,b)=>distance(a)-distance(b));target=sorted[practiceNormalRoll(brain)<.18&&sorted.length>1?1:0];brain.targetId=target?.id||'';brain.targetUntil=t+1.1+practiceNormalRoll(brain)*.65;}
 return target;
}
arcadeBotStep=function arcadeNormalBotStep(){
 const s=brawlState;if(netIsActive()||!arcadePractice||!s||s.phase!=='fight')return;const t=s.clock,alive=brawlAlive();
 for(const f of alive.filter(p=>p.id!=='practice-you')){
  const b=practiceNormalBrain(arcadePractice.bots,f.id,s.id,t,f.index);if(t<b.next)continue;b.next=t+.42+practiceNormalRoll(b)*.22;
  const send=(action,held=true)=>brawlHostInput(f.id,{seq:++b.seq,action,held}),other=practiceNormalTarget(b,alive.filter(p=>p!==f),p=>Math.abs(p.x-f.x),t);if(!other){send('sync',[]);continue;}
  // A missed read leaves a short opening instead of tracking perfectly every frame.
  if(t<(f.stun||0)||practiceNormalRoll(b)<.14){send('sync',[]);continue;}
  const dx=other.x-f.x+(practiceNormalRoll(b)-.5)*52,dy=other.y-f.y;send('sync',Math.abs(dx)>103?[dx>0?'right':'left']:[]);
  if(Math.abs(dx)<128&&Math.abs(dy)<70&&t>=b.attackNext){b.attackNext=t+1.65+practiceNormalRoll(b)*.75;if(practiceNormalRoll(b)<.74){send('attack');continue;}}
  const projectile=(s.projectiles||[]).some(p=>p.active&&p.owner!==f.id&&Math.abs(p.x-f.x)<85),canJump=(f.jumps||0)<2&&(f.jumps===0||practiceNormalRoll(b)<.35);
  if(canJump&&t>=b.jumpNext&&(dy>45||projectile&&practiceNormalRoll(b)<.35||Math.abs(dx)<105&&practiceNormalRoll(b)<.13)){send('jump');b.jumpNext=t+.9+practiceNormalRoll(b)*.55;continue;}
  if(Math.abs(dx)>250&&Math.abs(dx)<650&&Math.abs(dy)<65&&t>=b.beamNext){b.beamNext=t+4+practiceNormalRoll(b)*2;if(practiceNormalRoll(b)<.55)send('beam');}
 }
};
trayBotStep=function trayNormalBotStep(now){
 const w=trayState?.world;if(netIsActive()||!trayDemo||!w||w.phase!=='play')return;const t=w.elapsed,alive=w.players.filter(p=>!p.eliminated&&!p.forfeited),exists=z=>!!z&&(!Number.isFinite(z.goneAt)||z.goneAt>t),warned=z=>exists(z)&&Number.isFinite(z.warningAt)&&z.warningAt<=t;
 const tileAt=(x,y)=>{const col=Math.floor((x-70)/80),row=Math.floor((y-70)/80);return row>=0&&row<7&&col>=0&&col<7?w.tiles[row*7+col]:null;};
 for(const p of alive.filter(p=>p.id!=='tray-you')){
  const b=practiceNormalBrain(trayBotBrains,p.id,w.id,t,p.index);if(t<b.next)continue;b.next=t+.44+practiceNormalRoll(b)*.23;
  const send=(action,held)=>trayEngine.input(w,p.id,{seq:++b.seq,action,held},now),target=practiceNormalTarget(b,alive.filter(q=>q!==p),q=>Math.hypot(q.x-p.x,q.y-p.y),t);if(!target||practiceNormalRoll(b)<.12){send('sync',[]);continue;}
  let x=target.x+(practiceNormalRoll(b)-.5)*48,y=target.y+(practiceNormalRoll(b)-.5)*48,avoiding=false;
  const ahead=tileAt(p.x+Math.sign(x-p.x)*46,p.y+Math.sign(y-p.y)*46);
  // React to visible holes/red tiles, rather than reading their exact future collapse time.
  if(!exists(ahead)||warned(ahead)&&practiceNormalRoll(b)<.65){
   const safe=w.tiles.filter(z=>exists(z)&&!warned(z)).sort((a,b)=>Math.hypot(110+a.col*80-p.x,110+a.row*80-p.y)-Math.hypot(110+b.col*80-p.x,110+b.row*80-p.y))[0];
   if(safe){x=110+safe.col*80;y=110+safe.row*80;avoiding=true;}
  }
  const held=[];if(Math.abs(x-p.x)>26)held.push(x>p.x?'right':'left');if(Math.abs(y-p.y)>26)held.push(y>p.y?'down':'up');send('sync',held);
  if(!avoiding&&held.length&&Math.hypot(target.x-p.x,target.y-p.y)<91&&t>=b.dash){b.dash=t+4.2+practiceNormalRoll(b)*1.6;if(practiceNormalRoll(b)<.66)send('dash',true);}
 }
};
/* END_PRACTICE_NORMAL_DIFFICULTY_V1 */

/* COMBAT_ARENA_V1 */
const combatArenaCatalog={
 office:{name:'점심 직전 조교실',caption:'결재는 잠시. 내 메뉴부터.',sky:'#e3dfbd',floor:'#bea681',ink:'#625b46',platforms:[{left:145,right:335,y:65},{left:425,right:575,y:125},{left:665,right:855,y:65}],art:'<g stroke="#635a42" stroke-width="4"><rect x="180" y="47" width="220" height="118" rx="3" fill="#a7cad0"/><path d="M290 47v118m-110-58h220"/><rect x="650" y="37" width="210" height="135" fill="#cab48b"/><path d="M665 59h180m-180 31h180m-180 31h180" stroke="#f1e2b8"/><circle cx="532" cy="70" r="30" fill="#f6e8bd"/><path d="M532 49v23l15 7" fill="none" stroke-linecap="round"/></g><g stroke="#5c503b" stroke-width="4"><path d="M24 252h228v38H24zm711 0h247v38H735" fill="#a79168"/><path d="M50 290v32m174-32v32m537-32v32m191-32v32"/><path d="m45 226 88-8 8 34H39zm745-6 89 8-5 24h-91" fill="#f6eed1"/><path d="M64 237h48m697 0h44"/></g>'},
 cafeteria:{name:'급식실 최후의 반찬',caption:'반찬은 셀프. 승부도 셀프.',sky:'#f1d8ae',floor:'#a6b1a0',ink:'#7b573d',platforms:[{left:120,right:365,y:55},{left:420,right:580,y:100},{left:635,right:880,y:55}],art:'<g stroke="#72533f" stroke-width="4"><path d="M78 50h845v45H78z" fill="#d77d55"/><path d="M78 50h85v45H78zm170 0h85v45h-85zm170 0h85v45h-85zm170 0h85v45h-85zm170 0h85v45h-85z" fill="#f8e7bc"/><rect x="88" y="108" width="270" height="110" fill="#8ca9a0"/><path d="M223 108v110"/><rect x="653" y="106" width="246" height="109" fill="#796f56"/><path d="M681 131h95m-95 23h180m-180 23h153" stroke="#efe8bf"/><path d="M30 253h290v40H30zm650 0h320v40H650" fill="#b9c3b2"/><path d="M76 252v-39h84v39m-94-43h104" fill="#b4c4ba"/><path d="M834 252v-40h87v40m-98-44h108" fill="#b4c4ba"/></g>'},
 rooftop:{name:'옥상 바람 한 판',caption:'바람은 불어도 메뉴는 지킨다.',sky:'#a6c9cc',floor:'#aaa58c',ink:'#607078',platforms:[{left:155,right:315,y:85},{left:410,right:590,y:145},{left:685,right:845,y:85}],art:'<circle cx="785" cy="80" r="47" fill="#f3d19a"/><g fill="#8fa8ad" stroke="#61787f" stroke-width="3"><path d="M0 191h82v-56h69v56h77v-99h83v99h84v-48h88v48h83v-92h98v92h81v-61h82v61h78v-102h77v102h98v98H0z"/></g><g fill="none" stroke="#66777b" stroke-width="6"><path d="M0 240h1000M0 278h1000m-945-38v81m95-81v81m95-81v81m95-81v81m95-81v81m95-81v81m95-81v81m95-81v81m95-81v81m95-81v81"/></g><g stroke="#66705a" stroke-width="4"><path d="m25 287 92 0-9 35H34zm848 0h105l-11 35h-82" fill="#b98b66"/><path d="M57 284q-35-37 0-47 27 14 15 47m837 0q-25-48 8-47 30 24 18 47" fill="#91ab76"/></g>'},
 copier:{name:'복사실 용지 걸림',caption:'종이는 걸려도 승부는 안 걸린다.',sky:'#d6cce0',floor:'#b2a7b7',ink:'#72627d',platforms:[{left:105,right:310,y:65},{left:385,right:615,y:115},{left:690,right:895,y:65}],art:'<g stroke="#70637b" stroke-width="4"><path d="M0 90h1000" stroke="#a493b3"/><rect x="83" y="43" width="164" height="135" fill="#b1a2be"/><path d="M96 70h138m-138 36h138m-138 36h138"/><path d="M337 22h326v19H337z" fill="#f4edce"/><path d="M743 236v-69h184v69m-206 0h228v72H721z" fill="#a3a7b0"/><path d="M771 178h114v35H771z" fill="#dedccf"/><path d="M832 215h80v40h-80z" fill="#f6f0d9"/><path d="M40 279h205v39H40z" fill="#96879d"/><path d="m76 253 138 6-2 21H69z" fill="#f1ebd5"/><path d="m395 104 35-6 8 41-38 6zm207 58 43 8-7 36-41-8z" fill="#f4eed6"/></g>'},
 nightmarket:{name:'야시장 마지막 주문',caption:'불빛 아래 마지막 한 그릇.',sky:'#494d70',floor:'#948270',ink:'#4f485c',platforms:[{left:130,right:330,y:75},{left:425,right:575,y:120},{left:670,right:870,y:75}],art:'<circle cx="780" cy="66" r="31" fill="#ebdcaf"/><g fill="#eee0ac"><circle cx="323" cy="44" r="3"/><circle cx="590" cy="60" r="3"/><circle cx="714" cy="34" r="2"/><circle cx="888" cy="112" r="3"/></g><path d="M0 55q490 110 1000 0" fill="none" stroke="#342d45" stroke-width="5"/><g fill="#e4a368" stroke="#4e3f4d" stroke-width="3"><ellipse cx="116" cy="78" rx="13" ry="18"/><ellipse cx="287" cy="110" rx="13" ry="18"/><ellipse cx="482" cy="123" rx="13" ry="18"/><ellipse cx="690" cy="111" rx="13" ry="18"/><ellipse cx="887" cy="78" rx="13" ry="18"/></g><g stroke="#493b4b" stroke-width="4"><path d="M0 212 80 155h165l70 57z" fill="#b87666"/><path d="M15 212h285v100H15z" fill="#c0a076"/><path d="M40 237h235v42H40z" fill="#f0cc8d"/><path d="M687 212 753 151h169l78 61z" fill="#7d8b79"/><path d="M706 212h294v100H706z" fill="#af8d6e"/><path d="M735 237h232v42H735z" fill="#e7c182"/></g>'}
};
let combatFallbackArena='',combatFallbackMatch='';
function combatValidArena(id){return typeof id==='string'&&Object.prototype.hasOwnProperty.call(combatArenaCatalog,id);}
function combatChooseArena(previousId=''){
 const choices=Object.keys(combatArenaCatalog).filter(id=>id!==previousId);
 const index=typeof rand==='function'?rand(choices.length):Math.floor(Math.random()*choices.length);
 return choices[Math.max(0,Math.min(choices.length-1,index))];
}
function combatSeedArena(seed){let h=2166136261;for(const c of String(seed||'lunch')){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}const keys=Object.keys(combatArenaCatalog);return keys[(h>>>0)%keys.length];}
function combatArenaMarkup(id){const a=combatArenaCatalog[id];return '<svg class="combat-scenery-art" viewBox="0 0 1000 360" preserveAspectRatio="none" aria-hidden="true"><rect width="1000" height="360" fill="'+a.sky+'"/>'+a.art+'</svg>';}
function combatPaintStage(stage,id){
 if(!stage||!combatValidArena(id))return false;
 const a=combatArenaCatalog[id];stage.dataset.combatArena=id;stage.style.setProperty('--combat-floor',a.floor);stage.style.setProperty('--combat-trim',a.ink);
 let scene=stage.querySelector('.combat-scenery');
 if(!scene){scene=el('div','combat-scenery');scene.setAttribute('aria-hidden','true');stage.prepend(scene);}
 if(scene.dataset.arena!==id){scene.dataset.arena=id;scene.innerHTML=combatArenaMarkup(id);}
 let label=stage.querySelector('.combat-arena-sign');
 if(!label){label=el('div','combat-arena-sign');label.append(el('b'),el('span'));stage.append(label);}
 if(label.dataset.arena!==id){label.dataset.arena=id;label.querySelector('b').textContent=a.name;label.querySelector('span').textContent=a.caption;}
 stage.setAttribute('aria-label',a.name+' · 실시간 전투 경기장');return true;
}
function combatApplyArena(arenaId){
 const id=combatValidArena(arenaId)?arenaId:'office';
 for(const stageId of ['battleStage','brawlArena'])combatPaintStage($(stageId),id);
 return id;
}
function combatDuelArena(){
 const meta=typeof netDuelMeta!=='undefined'?netDuelMeta:null;
 if(combatValidArena(meta?.arenaId))return meta.arenaId;
 const match=meta?.id||(typeof duel!=='undefined'?duel?.id:'')||'local-duel';
 if(combatFallbackMatch!==match){combatFallbackMatch=match;combatFallbackArena=combatSeedArena(match);}
 return combatFallbackArena;
}
function combatDuelDepartment(side){
 const meta=typeof netDuelMeta!=='undefined'?netDuelMeta:null,id=side===0?meta?.challengerId:meta?.defenderId;
 if(id&&typeof netDepartment==='function')return netDepartment(id);
 const name=typeof duel!=='undefined'?duel?.[side===0?'challenger':'defender']:'';
 const member=typeof netMembers==='function'?netMembers().find(m=>m.name===name):null;
 return member&&typeof netDepartment==='function'?netDepartment(member.id):side===0?'business':'accounting';
}
function combatPaintDuel(){
 if(typeof duel==='undefined'||!duel?.fighters)return;
 combatPaintStage($('battleStage'),combatDuelArena());
 for(let i=0;i<2;i++){
  const actor=$('battleFighter'+i),sprite=actor?.querySelector('.battle-sprite');if(!actor||!sprite)continue;
  const department=combatDuelDepartment(i);
  if(actor.dataset.combatDepartment!==department){
   const holder=el('span');holder.innerHTML=deptAvatarSvg(department);const svg=holder.querySelector('svg'),old=sprite.querySelector('.battle-bowl');
   if(svg){svg.classList.add('battle-bowl','combat-gremlin');if(old)old.replaceWith(svg);else sprite.prepend(svg);actor.dataset.combatDepartment=department;}
  }
  actor.classList.add('combat-gremlin-fighter');
  actor.classList.toggle('is-punch',actor.classList.contains('is-attacking'));actor.classList.toggle('is-crouch',actor.classList.contains('is-guard'));actor.classList.toggle('is-jump',actor.classList.contains('is-air'));
 }
}
const combatPreviousActionRender=actionRender;
actionRender=function(...args){const out=combatPreviousActionRender(...args);combatPaintDuel();return out;};
function combatBrawlArena(spec){
 if(combatValidArena(spec?.arenaId))return spec.arenaId;
 if(typeof groupRoom!=='undefined'&&combatValidArena(groupRoom?.arenaId))return groupRoom.arenaId;
 return combatSeedArena(spec?.id||'practice');
}
function combatSetBrawlPlatforms(id){
 if(typeof arcadePlatforms==='undefined'||!Array.isArray(arcadePlatforms)||!combatValidArena(id))return;
 arcadePlatforms.splice(0,arcadePlatforms.length,...combatArenaCatalog[id].platforms.map(p=>({...p})));
}
const combatPreviousBrawlPrepare=brawlPrepare;
brawlPrepare=function(spec){
 const id=combatBrawlArena(spec);combatSetBrawlPlatforms(id);
 const out=combatPreviousBrawlPrepare(spec);if(out&&brawlState){brawlState.arenaId=id;combatPaintStage($('brawlArena'),id);}return out;
};
const combatPreviousBrawlRender=brawlRender;
brawlRender=function(...args){const out=combatPreviousBrawlRender(...args);if(typeof brawlState!=='undefined'&&brawlState){const id=combatValidArena(brawlState.arenaId)?brawlState.arenaId:combatBrawlArena(brawlState);combatPaintStage($('brawlArena'),id);}return out;};
/* END_COMBAT_ARENA_V1 */

/* WINNER_CEREMONY_V1 */
const awardSpeechMs=30000,awardHoldMs=4000,awardDraftIntervalMs=80;
let awardState=null,awardCompletion=null,awardClockOffset=0,awardInputSeq=0,awardLastInputSeq=0;
let awardDialog=null,awardUiKey='',awardDraftTimer=0,awardReturnFocus=null,awardLastPhase='';
let awardDraftLastSentAt=-Infinity,awardLastDraftText=null,awardComposing=false,awardConfirming=false;
function awardClone(value){return value?JSON.parse(JSON.stringify(value)):null;}
function awardText(value){return typeof value==='string'?Array.from(value.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim()).slice(0,100).join(''):null;}
function awardCurrent(){return !!awardState&&netIsActive()&&awardState.roomCode===String(netRoom.code||'')&&typeof result!=='undefined'&&result?.id===awardState.roundId;}
function awardBusy(){return awardCurrent()&&['speech','hold'].includes(awardState.phase);}
function awardPublicState(s){return awardClone({id:s.id,roomCode:s.roomCode,roundId:s.roundId,seq:s.seq,phase:s.phase,winnerId:s.winnerId,person:s.person,department:s.department,menu:s.menu,speech:s.speech,startAt:s.startAt,endAt:s.endAt,closeAt:s.closeAt});}
function awardGetState(){return awardCurrent()?{...awardPublicState(awardState),serverNow:Date.now()}:null;}
function awardPublish(){if(netIsHost()&&!netApplying)netPublish();}
function awardSetText(id,value){const node=$(id);if(node&&node.textContent!==String(value))node.textContent=String(value);}
function awardCancel(){
 clearTimeout(awardDraftTimer);awardDraftTimer=0;awardCompletion=null;awardState=null;awardClockOffset=0;awardInputSeq=0;awardLastInputSeq=0;awardDraftLastSentAt=-Infinity;awardLastDraftText=null;awardComposing=false;awardConfirming=false;awardUiKey='';awardLastPhase='';
 if(awardDialog?.open)awardDialog.close();if(awardReturnFocus?.isConnected)awardReturnFocus.focus({preventScroll:true});awardReturnFocus=null;
}
function awardStart(details,onComplete){
 if(!netIsHost()||!netIsActive()||!details||typeof result==='undefined'||result?.id!==details.roundId||typeof details.winnerId!=='string')return false;
 const winner=netMembers().find(m=>m.id===details.winnerId),menu=awardText(details.menu);
 if(!winner||!menu||Array.from(menu).length>20||typeof winner.name!=='string')return false;
 if(awardBusy()&&awardState.roundId===details.roundId&&awardState.winnerId===details.winnerId)return true;
 awardCancel();const now=Date.now();
 awardState={id:'award_'+now+'_'+rand(1000000),roomCode:String(netRoom.code||''),roundId:details.roundId,seq:1,phase:'speech',winnerId:winner.id,person:winner.name,department:typeof netDepartment==='function'?netDepartment(winner.id):String(details.department||'business'),menu,speech:'',startAt:now,endAt:now+awardSpeechMs,closeAt:now+awardSpeechMs+awardHoldMs};
 awardCompletion=typeof onComplete==='function'?onComplete:null;awardEnsureUI();awardRender();awardPublish();return true;
}
function awardCompleteFlow(reason='completed'){
 const state=awardState;if(!state)return;const complete=awardCompletion;
 const payload={roundId:state.roundId,winnerId:state.winnerId,menu:state.menu,speech:state.speech,reason};
 awardCompletion=null;awardCancel();awardPublish();if(complete)complete(payload);
}
function awardLock(){if(awardState?.phase!=='speech')return;awardState.phase='hold';awardState.seq++;awardRender();awardPublish();}
function awardHandle(senderId,cmd){
 if(typeof cmd?.t!=='string'||!cmd.t.startsWith('award'))return false;
 if(!netIsHost()||!awardCurrent()||!netMembers().some(m=>m.id===senderId))return true;
 const s=awardState;if(!['awardSpeech','awardConfirm'].includes(cmd.t)||cmd.awardId!==s.id||cmd.roundId!==s.roundId||senderId!==s.winnerId||!Number.isSafeInteger(cmd.seq)||cmd.seq<1||cmd.seq<=awardLastInputSeq)return true;
 const now=Date.now();if(s.phase!=='speech'||now>=s.endAt){if(s.phase==='speech')awardLock();return true;}
 const text=awardText(cmd.text);if(text===null)return true;
 awardLastInputSeq=cmd.seq;
 if(cmd.t==='awardConfirm'){s.speech=text;awardCompleteFlow();return true;}
 if(text===s.speech)return true;
 s.speech=text;s.seq++;awardRender();awardPublish();return true;
}
function awardValidate(data){
 if(!data||typeof data.id!=='string'||!data.id.startsWith('award_')||data.id.length>100||typeof data.roundId!=='string'||typeof result==='undefined'||data.roundId!==result?.id||data.roomCode!==String(netRoom.code||'')||!Number.isSafeInteger(data.seq)||data.seq<1||!['speech','hold'].includes(data.phase)||typeof data.winnerId!=='string'||typeof data.person!=='string'||Array.from(data.person).length>24||!data.person||typeof data.department!=='string'||data.department.length>50||typeof data.menu!=='string'||!data.menu||Array.from(data.menu).length>20||awardText(data.speech)!==data.speech)return false;
 if(!netMembers().some(m=>m.id===data.winnerId&&m.name===data.person)||![data.startAt,data.endAt,data.closeAt].every(n=>Number.isFinite(n)&&n>=0)||data.endAt-data.startAt!==awardSpeechMs||data.closeAt-data.endAt!==awardHoldMs)return false;
 return true;
}
function awardReceive(data){
 if(netIsHost())return false;if(!data){awardCancel();return false;}if(!netIsActive()||!awardValidate(data))return false;
 if(awardState&&(awardState.id===data.id?data.seq<awardState.seq:data.startAt<awardState.startAt))return false;
 const fresh=awardState?.id!==data.id;awardState=awardPublicState(data);awardCompletion=null;awardClockOffset=Number.isFinite(data.serverNow)?data.serverNow-Date.now():0;
 if(fresh){awardInputSeq=0;awardUiKey='';awardLastPhase='';clearTimeout(awardDraftTimer);awardDraftTimer=0;awardDraftLastSentAt=-Infinity;awardLastDraftText=null;awardComposing=false;awardConfirming=false;}
 awardEnsureUI();awardRender();return true;
}
function awardSendSpeech(){
 clearTimeout(awardDraftTimer);awardDraftTimer=0;const s=awardState;
 if(!awardCurrent()||awardConfirming||s.phase!=='speech'||s.winnerId!==netSelfId()||Date.now()+awardClockOffset>=s.endAt)return;
 const input=$('awardSpeechInput');if(!input)return;const text=awardText(input.value);if(text===null)return;
 if(!awardComposing&&Array.from(input.value).length>100)input.value=text;
 if(text===awardLastDraftText)return;awardLastDraftText=text;awardDraftLastSentAt=Date.now();
 netRoom.send({t:'awardSpeech',awardId:s.id,roundId:s.roundId,seq:++awardInputSeq,text});
}
function awardQueueSpeech(event){
 const s=awardState;if(!awardCurrent()||awardConfirming||s.phase!=='speech'||s.winnerId!==netSelfId()||Date.now()+awardClockOffset>=s.endAt)return;
 if(event?.isComposing===true)awardComposing=true;
 const input=$('awardSpeechInput');if(!input)return;
 awardSetText('awardSpeechMessage',awardText(input.value)||'우승자가 마이크를 잡고 있어요…');
 const delay=awardDraftIntervalMs-(Date.now()-awardDraftLastSentAt);
 if(delay<=0||s.endAt-(Date.now()+awardClockOffset)<250){awardSendSpeech();return;}
 if(!awardDraftTimer){const id=s.id,roundId=s.roundId;awardDraftTimer=setTimeout(()=>{awardDraftTimer=0;if(awardState?.id===id&&awardState.roundId===roundId)awardSendSpeech();},delay);}
}
function awardConfirmSpeech(){
 const s=awardState;if(!awardCurrent()||awardConfirming||s.phase!=='speech'||s.winnerId!==netSelfId()||Date.now()+awardClockOffset>=s.endAt)return;
 const input=$('awardSpeechInput'),text=awardText(input?.value);if(text===null)return;
 clearTimeout(awardDraftTimer);awardDraftTimer=0;awardComposing=false;awardConfirming=true;awardRender();
 // Carry the latest draft atomically, including text still waiting on the 80ms live update.
 const sent=netRoom.send({t:'awardConfirm',awardId:s.id,roundId:s.roundId,seq:++awardInputSeq,text});
 if(sent===false&&awardState?.id===s.id){awardConfirming=false;awardRender();}
}
function awardEnsureUI(){
 if(awardDialog)return;awardDialog=el('dialog','winner-award');awardDialog.id='winnerAwardDialog';awardDialog.setAttribute('aria-labelledby','awardTitle');
 awardDialog.innerHTML='<div class="award-spotlights" aria-hidden="true"></div><div class="award-confetti" aria-hidden="true">✦　▱　✧　▰　✦　▱　✧　▰　✦</div><header class="award-header"><span>THE LUNCH AWARDS · 오늘의 주인공</span><h2 id="awardTitle">잠시만요,<br><em>우승자 입장합니다.</em></h2><p id="awardMenu"></p></header><div class="award-body"><section class="award-stage" aria-label="우승 캐릭터 시상대"><div class="award-crown" aria-hidden="true">♛</div><div id="awardCharacter" class="award-character" aria-hidden="true"></div><div class="award-podium"><strong>1</strong><span id="awardWinnerName"></span></div><span class="award-stage-note">발표는 진지하게. 표정은 마음대로.</span></section><section class="award-speech" aria-labelledby="awardSpeechTitle"><div class="award-speech-heading"><h3 id="awardSpeechTitle">우승 소감</h3><span class="award-time"><b id="awardSeconds">30</b>초</span></div><p id="awardSpeechMessage" class="award-bubble" aria-live="polite"></p><div id="awardSpeechForm"><label for="awardSpeechInput">우승자만 30초 동안 입력할 수 있어요</label><textarea id="awardSpeechInput" rows="2" maxlength="200" placeholder="제 메뉴를 믿어주셔서… 아무도 안 믿었지만 감사합니다." aria-describedby="awardInputHint"></textarea><div class="award-input-row"><small id="awardInputHint">입력 즉시 자동 공유 · 100자까지</small><button id="awardSpeechConfirm" type="button">확인 · 다음으로</button></div></div><p id="awardAudience" class="award-audience"></p><p id="awardStatus" class="award-status" role="status"></p></section></div><footer class="award-footer"><span>점심결재 대작전</span><span>잠깐의 영광, 든든한 한 끼.</span></footer>';
 document.body.append(awardDialog);awardDialog.addEventListener('cancel',e=>e.preventDefault());
 $('awardSpeechInput').addEventListener('input',awardQueueSpeech);
 $('awardSpeechInput').addEventListener('compositionstart',()=>{awardComposing=true;});
 $('awardSpeechInput').addEventListener('compositionend',()=>{awardComposing=false;awardQueueSpeech();});
 $('awardSpeechConfirm').addEventListener('click',awardConfirmSpeech);
}
function awardRender(){
 if(!awardCurrent()){if(awardDialog?.open)awardDialog.close();return;}awardEnsureUI();const s=awardState,self=netSelfId(),own=s.winnerId===self,active=s.phase==='speech'&&Date.now()+awardClockOffset<s.endAt;
 if(awardUiKey!==s.id){awardUiKey=s.id;const shared=result?.scoreWinnerId===s.winnerId&&(result.scoreChampionIds?.length||0)>1,names=shared?scoreResultChampionNames():[];awardSetText('awardWinnerName',s.person+' 님'+(shared?' · 공동 1위 대표':''));awardSetText('awardMenu',shared?'공동 1위 '+names.join(' · ')+' · 대표 메뉴 '+s.menu:result?.leagueFormat==='points'?s.person+' 님 누적 점수 1위! · '+s.menu:s.person+' 님이 지켜낸 '+s.menu+'!');$('awardCharacter').innerHTML=deptAvatarSvg(s.department);$('awardSpeechInput').value=s.speech;}
 awardDialog.dataset.phase=s.phase;awardDialog.dataset.winner=String(own);awardSetText('awardSeconds',Math.max(0,Math.ceil((s.endAt-Date.now()-awardClockOffset)/1000)));
 const speech=own&&active?awardText($('awardSpeechInput').value):s.speech;
 awardSetText('awardSpeechMessage',speech||(active?'우승자가 마이크를 잡고 있어요…':'말보다 메뉴로 보여드리겠습니다.'));
 $('awardSpeechForm').hidden=!own;$('awardSpeechInput').disabled=!own||!active||awardConfirming;$('awardSpeechConfirm').disabled=!own||!active||awardConfirming;
 awardSetText('awardSpeechConfirm',awardConfirming?'이동 중…':'확인 · 다음으로');
 awardSetText('awardAudience',own?'소감을 쓴 뒤 확인을 누르면 바로 다음 순서로 이동해요.':s.person+' 님이 소감을 마치고 확인하면 다음 순서로 이어져요.');
 const phaseKey=s.phase+':'+String(awardConfirming);
 if(awardLastPhase!==phaseKey){awardLastPhase=phaseKey;awardSetText('awardStatus',awardConfirming?'확인을 전달하고 있어요…':s.phase==='speech'?'쓰는 대로 자동 공유 · 확인하지 않으면 시간이 끝난 뒤 자동으로 넘어가요.':'소감 마감! 박수와 함께 다음 순서로 넘어갑니다.');}
 if(!awardDialog.open){awardReturnFocus=document.activeElement;awardDialog.showModal();if(own&&active)$('awardSpeechInput').focus({preventScroll:true});else $('awardTitle').setAttribute('tabindex','-1'),$('awardTitle').focus({preventScroll:true});}
}
function awardHousekeep(){
 if(!awardState)return;if(!awardCurrent()){awardCancel();return;}
 if(netIsHost()){
  if(!netMembers().some(m=>m.id===awardState.winnerId)){awardCompleteFlow('winner-left');return;}
  if(awardState.phase==='speech'&&Date.now()>=awardState.endAt)awardLock();
  if(awardState?.phase==='hold'&&Date.now()>=awardState.closeAt){awardCompleteFlow();return;}
 }
 awardRender();
}
setInterval(awardHousekeep,100);netRoom.onDisconnect(event=>{if(event.self||event.hostLost)awardCancel();});
/* END_WINNER_CEREMONY_V1 */

/* CHAMPIONSHIP_FLOW_V1 */
// The five-round score ledger decides the championship. Menu objections are
// optional after the ceremony and never change this recorded score result.
let championshipLastArena='',championshipControlKey='';
const championshipAwardsSeen=new Set();
function championshipCurrent(){return netIsActive()&&lunchDecisionActive()&&lunchDecisionState?.championship===true;}
function championshipPresent(){return championshipCurrent()?lunchDecisionRequired():[];}
function championshipArena(){const id=typeof combatChooseArena==='function'?combatChooseArena(championshipLastArena):'office';championshipLastArena=id;return id;}
function championshipReview(notice){
 const s=lunchDecisionState;if(!netIsHost()||!championshipCurrent())return false;
 if(!championshipPresent().some(p=>p.id===s.winnerId))return lunchDecisionRetainScores()||lunchDecisionResetMeal('메뉴 제안자가 방을 나가 메뉴를 다시 고릅니다.');
 s.phase='review';s.duelKind='';s.duelId='';s.challengerId='';s.defenderId='';s.notice=notice||'누적 점수와 최종 순위가 확정됐어요. 점심 메뉴는 모두 승낙하거나 남은 1회의 메뉴 이의를 신청할 수 있어요. 메뉴 이의로 경기 순위는 바뀌지 않아요.';s.seq++;netPhase='result';netDuelMeta=null;
 renderResult();netPublish();return true;
}
function championshipAward(){
 const s=lunchDecisionState;if(!netIsHost()||!championshipCurrent())return false;
 const scoreWinnerId=result.scoreWinnerId||s.tournamentChampionId,winner=championshipPresent().find(p=>p.id===scoreWinnerId);
 if(!winner)return lunchDecisionRetainScores('점수전 대표 우승자가 방을 나갔어요.')||lunchDecisionResetMeal('점수전 대표 우승자가 방을 나가 메뉴를 다시 고릅니다.');
 const key=s.roundId+':score';
 if(championshipAwardsSeen.has(key))return championshipReview();championshipAwardsSeen.add(key);if(championshipAwardsSeen.size>120)championshipAwardsSeen.delete(championshipAwardsSeen.values().next().value);
 if(typeof groupCancel==='function')groupCancel();if(typeof cancelActionDuel==='function')cancelActionDuel();
 const shared=(result.scoreChampionIds||[]).map(id=>s.participants.find(p=>p.id===id)).filter(Boolean);
 s.phase='award';s.duelKind='';s.duelId='';s.challengerId='';s.defenderId='';s.notice=(shared.length>1?'누적 점수 공동 1위 '+shared.map(p=>p.name).join(' · ')+'! 추첨된 대표 '+winner.name+' 님의 우승 소감이에요.':winner.name+' 님이 누적 점수 1위! 우승 소감을 들려주세요.')+' 30초 안에 입력하고 확인하면 이어집니다.';s.seq++;netPhase='result';netDuelMeta=null;
 renderResult();
 const roundId=s.roundId;
 if(typeof awardStart!=='function'){championshipReview();return true;}
 const okay=awardStart({roundId,winnerId:winner.id,person:winner.name,menu:winner.menu,department:netDepartment(winner.id)},event=>{
  if(!netIsHost()||!championshipCurrent()||lunchDecisionState.roundId!==roundId||lunchDecisionState.phase!=='award')return;
  if(event?.reason==='winner-left'||!championshipPresent().some(p=>p.id===scoreWinnerId))lunchDecisionRetainScores('시상식 대표 우승자가 방을 나갔어요.')||lunchDecisionResetMeal('시상식 대표 우승자가 방을 나가 메뉴를 다시 고릅니다.');
  else championshipReview();
 });
 if(okay===false)championshipReview();else netPublish();return true;
}
function championshipBegin(){
 const s=lunchDecisionState;if(!netIsHost()||!lunchDecisionActive()||s.championship===true)return false;
 s.championship=true;s.qualifiedIds=[];s.qualifierId='';s.duelKind='';s.seq++;
 return championshipAward();
}
const championshipTournamentFinish=netFinishMenuTournament;
netFinishMenuTournament=function(state){const out=championshipTournamentFinish(state);if(out&&netIsHost()&&lunchDecisionActive())championshipBegin();return out;};
const championshipPrepareLocal=netPrepareLocal;
netPrepareLocal=function(...args){
 if(netIsHost()&&championshipCurrent()&&netDuelMeta){netDuelMeta.arenaId=netDuelMeta.arenaId||championshipArena();netDuelMeta.lunchDecisionId=lunchDecisionState.roundId;netDuelMeta.tournamentChampionId=lunchDecisionState.tournamentChampionId;netDuelMeta.duelKind='objection';netDuelMeta.qualifiedIds=[];}
 const out=championshipPrepareLocal(...args);championshipPaint();return out;
};
const championshipClear=lunchDecisionClear;
lunchDecisionClear=function(){championshipControlKey='';if(typeof awardCancel==='function')awardCancel();if(typeof groupCancel==='function')groupCancel();return championshipClear();};
function championshipPaint(){
 if(typeof document==='undefined')return;
 const s=championshipCurrent()?lunchDecisionState:null,key=s?[s.phase,duel?.phase,netPhase].join('|'):'';if(championshipControlKey===key)return;championshipControlKey=key;
 const cancel=$('duelCancelBtn');if(cancel){cancel.disabled=false;cancel.title='메뉴 이의를 취소해도 신청 기회는 사용됩니다. 누적 점수와 순위는 바뀌지 않아요.';}
}
setInterval(()=>{if(championshipCurrent())championshipPaint();},200);
/* END_CHAMPIONSHIP_FLOW_V1 */

/* LOBBY_MAIN_V1 */
let lobbyBonusGames=null;
function lobbyAttachBonus(){
 if(lobbyBonusGames&&!lobbyBonusGames.isConnected&&$('arcadeMenu'))$('arcadeMenu').append(lobbyBonusGames);
 if(lobbyBonusGames)lobbyBonusGames.hidden=netIsActive();
}
const lobbyEnsureArcade=arcadeEnsureUI;
arcadeEnsureUI=function(...args){const out=lobbyEnsureArcade(...args);lobbyAttachBonus();return out;};
const lobbyRenderArcade=arcadeRender;
arcadeRender=function(...args){const out=lobbyRenderArcade(...args);lobbyAttachBonus();return out;};
function lobbyMainInstall(){
 const copy=document.querySelector('#roomLobby .room-lobby-copy'),tray=copy?.querySelector('.arcade-try-tray'),home=$('fiveArcadeTryBtn');if(!copy||!tray||!home)return;
 home.className='btn lobby-play-button';home.textContent='게임 해보기';const arrow=el('span','','↗');arrow.setAttribute('aria-hidden','true');home.append(arrow);home.setAttribute('aria-haspopup','dialog');
 lobbyBonusGames=el('section','lobby-bonus-games');lobbyBonusGames.setAttribute('aria-labelledby','lobbyBonusTitle');const head=el('div','lobby-bonus-head'),title=el('h3','','조금 더 놀기');title.id='lobbyBonusTitle';head.append(title,el('p','','난투와 커피도 가볍게 맛봐요.'));const games=el('div','lobby-bonus-grid');
 for(const [id,label]of [['arcadeTryBtn','밤티 난투 ↗'],['arcadeCoffeeTryBtn','커피 폭탄 ☕'],['trayTryBtn','식판 서바이벌 ↗']]){const button=$(id);if(!button)continue;button.className='btn lobby-bonus-button';button.textContent=label;button.addEventListener('click',()=>{arcadeClearKeys();if(arcadeDialog?.open)arcadeDialog.close();},true);games.append(button);}
 lobbyBonusGames.append(head,games);tray.replaceChildren(home,el('small','','30종 미니게임 · 혼자 가볍게 한 판'));
 const art=el('div','lobby-friends');art.setAttribute('aria-hidden','true');art.append(el('span','lobby-friends-note','밥 먹고 하자.'));
 const scene=el('div','lobby-friends-scene');
 for(const [index,department]of ['accounting','business','hotel'].entries()){const friend=el('div','lobby-friend lobby-friend-'+index),sprite=el('div','lobby-friend-sprite');sprite.innerHTML=deptAvatarSvg(department);friend.append(el('span','lobby-friend-prop',['☕','🍚','🥄'][index]),sprite,el('i','lobby-friend-shadow'));scene.append(friend);}
 art.append(el('span','lobby-friends-star star-one','✦'),el('span','lobby-friends-star star-two','✧'),scene,el('span','lobby-friends-caption','오늘도 점심은 진심'));
 const intro=copy.querySelector('p');intro.textContent='메뉴 고민은 잠깐, 한 판 웃고 같이 밥 먹자!';intro.classList.add('lobby-welcome-line');intro.before(art);copy.classList.add('has-lobby-friends');
 const rules=copy.querySelector('.room-lobby-rules');if(rules)tray.after(rules);
 $('roomLobby').classList.add('lobby-with-friends');lobbyAttachBonus();
}
/* END_LOBBY_MAIN_V1 */

arcadeInstall();arcadeTenInstall();arcadeExtraInstall();lobbyMainInstall();
/* FIVE_NEW_GAMES_END */
