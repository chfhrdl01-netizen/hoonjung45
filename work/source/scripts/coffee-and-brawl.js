/* COFFEE_HOT_POTATO_V2 */
/* COFFEE_HIDDEN_FUSE_V3 */
let coffeeState=null,coffeeDialog=null,coffeeDemo=false,coffeeDemoNext=0,coffeeOffset=0,coffeeDeadline=0;
function coffeeClone(v){return v?JSON.parse(JSON.stringify(v)):null;}
function coffeeHost(){return coffeeDemo||netIsHost();}
function coffeeSelf(){return coffeeDemo?'coffee-you':netSelfId();}
function coffeeMember(){return coffeeState?.members.find(m=>m.id===coffeeSelf());}
function coffeeElement(tag,cls,text){return el(tag,cls,text);}
function coffeePublicState(s){return coffeeClone({id:s.id,roundId:s.roundId,phase:s.phase,createdAt:s.createdAt,notice:s.notice,members:s.members,holderId:s.holderId,previousHolderId:s.previousHolderId,startAt:s.startAt,passReadyAt:s.passReadyAt,passes:s.passes,loserId:s.loserId});}
function coffeeGetState(){return !coffeeDemo&&netIsActive()&&netPhase==='result'&&coffeeState?{...coffeePublicState(coffeeState),serverNow:Date.now()}:null;}
function coffeePublish(){coffeeRender();if(!coffeeDemo&&netIsHost())netPublish();}
function coffeeSend(cmd){if(coffeeDemo)coffeeHandle(coffeeSelf(),cmd);else netRoom.send(cmd);}
function coffeeCancel(){coffeeState=null;coffeeOffset=0;coffeeDeadline=0;if(coffeeDialog?.open)coffeeDialog.close();coffeeDemo=false;coffeeUpdateButton();}
function coffeeMakeInvite(notice=''){coffeeDeadline=0;coffeeState={id:'cup_'+Date.now()+'_'+rand(100000),roundId:result?.id,phase:'invite',createdAt:Date.now(),notice,members:netMembers().map(m=>({id:m.id,name:m.name,response:'pending'})),holderId:'',previousHolderId:'',startAt:0,passReadyAt:0,passes:0,loserId:''};}
function coffeeMatchIfReady(){if(!coffeeHost()||coffeeState?.phase!=='invite'||coffeeState.members.some(m=>m.response==='pending'))return;const joined=coffeeState.members.filter(m=>m.response==='join');if(joined.length<2)return;const now=Date.now();coffeeState.phase='play';coffeeState.holderId=joined[rand(joined.length)].id;coffeeState.startAt=now+2400;coffeeDeadline=coffeeState.startAt+6000+rand(20001);coffeeState.passReadyAt=coffeeState.startAt;coffeeState.notice='컵이 터지는 순간 들고 있으면 커피 당첨!';coffeePublish();}
function coffeeMembersChanged(){if(!netIsHost()||!coffeeState||netPhase!=='result')return false;const now=netMembers();if(now.length===coffeeState.members.length&&now.every(m=>coffeeState.members.some(x=>x.id===m.id)))return true;if(now.length<2){coffeeCancel();return false;}coffeeMakeInvite('참가자가 바뀌어 컵을 새로 준비했어요. 참가 여부를 다시 골라주세요.');coffeePublish();return true;}
function coffeeHandle(senderId,cmd){
 if(typeof cmd.t!=='string'||!cmd.t.startsWith('coffee'))return false;
 if(!coffeeHost()||!coffeeDemo&&(netPhase!=='result'||!result||!netMembers().some(m=>m.id===senderId)))return true;
 if(cmd.t==='coffeeInvite'){if(!coffeeState||coffeeState.phase==='done')coffeeMakeInvite();coffeePublish();return true;}
 if(!coffeeState||cmd.eventId!==coffeeState.id)return true;const s=coffeeState,m=s.members.find(x=>x.id===senderId);if(!m)return true;
 if(cmd.t==='coffeeRespond'&&s.phase==='invite'&&['join','pass'].includes(cmd.response)){m.response=cmd.response;coffeePublish();coffeeMatchIfReady();return true;}
 if(cmd.t==='coffeeThrow'&&s.phase==='play'){
  const now=Date.now(),target=s.members.find(x=>x.id===cmd.targetId&&x.response==='join'&&x.id!==senderId);
  if(senderId!==s.holderId||m.response!=='join'||!target||now<s.startAt||now>=coffeeDeadline||now<s.passReadyAt)return true;
  const joined=s.members.filter(x=>x.response==='join');if(joined.length>2&&target.id===s.previousHolderId)return true;
  s.previousHolderId=senderId;s.holderId=target.id;s.passReadyAt=now+780;s.passes++;s.notice=m.name+' → '+target.name+'  뜨거운 컵 배달';if(coffeeDemo)coffeeDemoNext=now+1000+rand(350);coffeePublish();return true;
 }
 if(cmd.t==='coffeeCancel'&&senderId===coffeeSelf()){coffeeCancel();if(netIsHost())netPublish();return true;}
 return true;
}
function coffeeReceive(data){if(coffeeDemo||netIsHost())return;if(!data){if(coffeeState)coffeeCancel();return;}if(netPhase!=='result'||typeof data.id!=='string'||!['invite','play','done'].includes(data.phase)||!Array.isArray(data.members)||data.members.length<1||data.members.length>8)return;if(data.members.some(m=>!m||typeof m.id!=='string'||typeof m.name!=='string'||!['pending','join','pass'].includes(m.response)))return;if(['play','done'].includes(data.phase)&&(!Number.isFinite(data.startAt)||!Number.isFinite(data.passReadyAt)||!data.members.some(m=>m.id===data.holderId&&m.response==='join')))return;const fresh=coffeeState?.id!==data.id;coffeeState=coffeePublicState(data);coffeeOffset=Number.isFinite(data.serverNow)?data.serverNow-Date.now():0;coffeeRender();if(fresh)coffeeOpen();}
function coffeeEnsureUI(){
 if(coffeeDialog)return;coffeeDialog=el('dialog','cup-dialog');coffeeDialog.id='coffeeEventDialog';coffeeDialog.setAttribute('aria-labelledby','coffeeTitle');coffeeDialog.innerHTML='<div class="cup-head"><div><span>식후 랜덤 폭탄 게임</span><h2 id="coffeeTitle">커피는 네가 ☕</h2></div><button type="button" id="coffeeCloseBtn" class="tiny-btn" aria-label="커피 게임 닫기">닫기</button></div><div class="cup-body"><p class="cup-intro">컵이 터질 때 들고 있는 사람, 오늘의 커피 담당.<br>내 차례면 <b>던질 사람을 눌러요.</b> 3명 이상이면 방금 준 사람에게 반송 불가!</p><section id="coffeeSetup"><div class="cup-join-actions"><button id="coffeeJoinBtn" class="btn primary" type="button">콜. 참가하기</button><button id="coffeePassBtn" class="btn" type="button">난 구경</button></div></section><div id="coffeeCupStage" class="cup-stage"><div id="coffeeCup" class="cup-art">☕<span id="coffeeCupFace">ㅡ_ㅡ</span></div><strong id="coffeeCupCaption">뜨거운 컵 준비 중</strong><span id="coffeeCupHint">언제 터질지는 아무도 몰라요.</span></div><div id="coffeeTargets" class="cup-targets"></div><p id="coffeeError" class="cup-notice" role="status" aria-live="polite"></p><div class="cup-foot"><span>실제 주문·결제는 자동 진행하지 않아요.</span><button id="coffeeAgainBtn" class="tiny-btn" type="button" hidden>한 번 더</button><button id="coffeeCancelBtn" class="tiny-btn" type="button">게임 접기</button></div></div>';
 document.body.append(coffeeDialog);$('coffeeCloseBtn').addEventListener('click',()=>{if(coffeeDemo)coffeeCancel();else coffeeDialog.close();});coffeeDialog.addEventListener('cancel',()=>{if(coffeeDemo){coffeeState=null;coffeeDemo=false;}});$('coffeeJoinBtn').addEventListener('click',()=>coffeeSend({t:'coffeeRespond',eventId:coffeeState?.id,response:'join'}));$('coffeePassBtn').addEventListener('click',()=>coffeeSend({t:'coffeeRespond',eventId:coffeeState?.id,response:'pass'}));$('coffeeCancelBtn').addEventListener('click',()=>coffeeSend({t:'coffeeCancel',eventId:coffeeState?.id}));$('coffeeAgainBtn').addEventListener('click',()=>{if(coffeeDemo)coffeeDemoStart();else coffeeSend({t:'coffeeInvite'});});
 $('coffeeTargets').addEventListener('click',e=>{const b=e.target.closest('[data-cup-target]');if(b&&!b.disabled)coffeeSend({t:'coffeeThrow',eventId:coffeeState?.id,targetId:b.dataset.cupTarget});});
}
function coffeeUpdateButton(){let b=$('coffeeEventBtn');if(!b&&$('resultView')){b=el('button','btn coffee-result-button','커피 폭탄 돌리기 ☕');b.type='button';b.id='coffeeEventBtn';$('againBtn').parentElement.append(b);b.addEventListener('click',()=>{if(!coffeeState)coffeeSend({t:'coffeeInvite'});coffeeOpen();});}if(b){b.hidden=!netIsActive()||netPhase!=='result';b.textContent=coffeeState?.phase==='play'?'커피 폭탄 진행 중 ☕':'커피 폭탄 돌리기 ☕';}}
function coffeeOpen(){coffeeEnsureUI();if(!coffeeState)return;if(!coffeeDialog.open)coffeeDialog.showModal();coffeeRender();}
function coffeeRender(){
 coffeeUpdateButton();if(!coffeeState)return;coffeeEnsureUI();const s=coffeeState,now=Date.now()+coffeeOffset,own=coffeeMember(),holder=s.members.find(m=>m.id===s.holderId),joined=s.members.filter(m=>m.response==='join'),mine=s.holderId===coffeeSelf(),playing=s.phase==='play',started=now>=s.startAt;
 $('coffeeSetup').hidden=s.phase!=='invite';$('coffeeCancelBtn').hidden=!coffeeHost();$('coffeeAgainBtn').hidden=s.phase!=='done'||!coffeeHost();$('coffeeJoinBtn').textContent=own?.response==='join'?'참가 완료 ✓':'콜. 참가하기';$('coffeePassBtn').textContent=own?.response==='pass'?'관전 중':'난 구경';
 const stage=$('coffeeCupStage');stage.dataset.hot=String(playing&&mine);stage.dataset.exploded=String(s.phase==='done');
 $('coffeeCupCaption').textContent=s.phase==='invite'?'커피 한 잔에 목숨 거는 중':s.phase==='done'?(s.members.find(m=>m.id===s.loserId)?.name||'')+' 님 커피 당첨 ㅋㅋ':!started?Math.max(1,Math.ceil((s.startAt-now)/1000))+'초 후 컵 배달':mine?'네 컵이다. 빨리 던져!':holder?.name+' 님이 컵 들고 있음';
 $('coffeeCupFace').textContent=s.phase==='done'?'X﹏X':mine?'⊙_⊙':'ㅡ_ㅡ';
 $('coffeeCupHint').textContent=s.phase==='invite'?'참가 또는 관전을 골라요 · 최소 2명':s.phase==='done'?'컵 터짐. 오늘의 커피 담당 결정.':!started?'손가락 풀고 기다려요':'언제 터질지는 아무도 몰라요.';
 const roster=$('coffeeTargets');if(roster.dataset.event!==s.id){roster.dataset.event=s.id;roster.replaceChildren();for(const [i,m] of s.members.entries()){const b=el('button','cup-person');b.type='button';b.dataset.cupTarget=m.id;b.innerHTML=deptAvatarSvg(deptOptions[i%deptOptions.length].id);b.append(el('strong','',m.name+(m.id===coffeeSelf()?' · 나':'')),el('small'));roster.append(b);}}
 for(const b of roster.children){const m=s.members.find(x=>x.id===b.dataset.cupTarget),blocked=joined.length>2&&m.id===s.previousHolderId;b.classList.toggle('is-holder',playing&&m.id===s.holderId);b.classList.toggle('is-out',m.response==='pass');b.disabled=!playing||!started||!mine||now<s.passReadyAt||m.response!=='join'||m.id===coffeeSelf()||blocked;b.querySelector('small').textContent=s.phase==='invite'?{join:'준비 완료',pass:'관전',pending:'고르는 중'}[m.response]:m.response==='pass'?'관전':m.id===s.loserId?'당첨 ☕':s.phase==='done'?'생존':m.id===s.holderId&&playing?'☕ 뜨거운 컵':blocked&&mine?'반송 금지':mine&&m.id!==coffeeSelf()?'여기로 던져':'생존 중';}
 $('coffeeError').textContent=s.phase==='invite'?(s.members.some(m=>m.response==='pending')?'모두 참가 또는 관전을 고르면 출발!':joined.length<2?'둘 이상이어야 컵을 돌려요.':s.notice):s.notice;
}
function coffeeTick(){if(!coffeeState)return;if(!coffeeDemo&&(!netIsActive()||netPhase!=='result'||!result||result.id!==coffeeState.roundId)){coffeeCancel();return;}if(coffeeHost()&&coffeeState.phase==='play'){const s=coffeeState,now=Date.now();if(now>=coffeeDeadline){s.phase='done';s.loserId=s.holderId;s.notice='총 '+s.passes+'번 돌린 컵의 최종 목적지. 축하... 드립니다 ☕';coffeePublish();beep(150,.2);return;}if(coffeeDemo&&s.holderId!==coffeeSelf()&&now>=Math.max(s.startAt,s.passReadyAt,coffeeDemoNext)){const targets=s.members.filter(m=>m.response==='join'&&m.id!==s.holderId&&(s.members.filter(x=>x.response==='join').length<3||m.id!==s.previousHolderId));const target=targets[rand(targets.length)];if(target)coffeeHandle(s.holderId,{t:'coffeeThrow',eventId:s.id,targetId:target.id});coffeeDemoNext=now+1100+rand(400);}}if(coffeeDialog?.open)coffeeRender();}
function coffeeDemoStart(){if(netIsActive())return;coffeeDemo=true;coffeeOffset=0;coffeeDemoNext=Date.now()+2500;coffeeState={id:'cup-demo-'+Date.now(),phase:'invite',createdAt:Date.now(),notice:'컴퓨터와 돌려보는 연습이에요.',members:[{id:'coffee-you',name:'나',response:'join'},{id:'coffee-a',name:'밥줘',response:'join'},{id:'coffee-b',name:'숟가락',response:'join'}],holderId:'',previousHolderId:'',startAt:0,passReadyAt:0,passes:0,loserId:''};coffeeMatchIfReady();coffeeState.holderId='coffee-you';coffeeOpen();}
const coffeePreviousRenderResult=renderResult;renderResult=function(){const out=coffeePreviousRenderResult();coffeeUpdateButton();return out;};
netRoom.onDisconnect(event=>{if(event.self||event.hostLost)coffeeCancel();});
setInterval(coffeeTick,100);setInterval(()=>{if(!coffeeDemo&&netIsHost()&&coffeeState)coffeeMembersChanged();},500);

/* VICTORY_IMPACT_V1 */
const vfxSeen=new Set();let vfxLastDetail=null,vfxLayer=null,vfxCleanup=0,vfxImpactCleanup=0,vfxFocusCleanup=0;
const vfxOriginalRaceRender=deptRender,vfxOriginalCombatRender=actionRender,vfxOriginalResultRender=renderResult;
function vfxReduced(){return typeof reduced==='boolean'?reduced:!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;}
function vfxMake(tag,cls,text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;}
function vfxHash(text){let h=2166136261;for(const ch of String(text)){h^=ch.codePointAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function vfxNoise(seed,i){return (vfxHash(seed+':'+i)%10000)/10000;}
function vfxFood(menu){if(typeof deptFood==='function')return deptFood(menu);if(typeof actionFood==='function')return actionFood(menu);return '🍽️';}
function vfxFanfare(){
 if(typeof sound!=='undefined'&&!sound)return;
 if(typeof beep!=='function')return;
 [[523,0,.08],[659,95,.09],[784,190,.1],[1047,320,.24],[659,320,.22],[784,320,.22]].forEach(([note,delay,duration])=>setTimeout(()=>beep(note,duration),delay));
}
function vfxImpactStage(kind,still){
 const stage=kind==='duel'?$('battleStage'):(typeof deptView!=='undefined'?deptView:null);
 if(!stage)return;
 clearTimeout(vfxImpactCleanup);document.querySelectorAll('.vfx-stage-impact').forEach(n=>n.classList.remove('vfx-stage-impact'));
 if(still)return;stage.classList.remove('vfx-stage-impact');void stage.offsetWidth;stage.classList.add('vfx-stage-impact');
 vfxImpactCleanup=setTimeout(()=>stage.classList.remove('vfx-stage-impact'),780);
}
function vfxCelebrate(detail){
 if(!detail||typeof detail.id!=='string'||!detail.id||!['race','duel','tournament'].includes(detail.kind)||!detail.name||!detail.menu)return false;
 const id=detail.id.slice(0,180);if(!detail.force&&vfxSeen.has(id))return false;
 if(!detail.force){vfxSeen.add(id);if(vfxSeen.size>64)vfxSeen.delete(vfxSeen.values().next().value);}
 const clean={id,kind:detail.kind,name:String(detail.name).slice(0,60),menu:String(detail.menu).slice(0,80),reason:String(detail.reason||'').slice(0,100)};
 vfxLastDetail=clean;clearTimeout(vfxCleanup);clearTimeout(vfxFocusCleanup);if(vfxLayer)vfxLayer.remove();
 const still=vfxReduced(),layer=vfxMake('div','vfx-victory vfx-'+clean.kind+(still?' vfx-reduced':''));vfxLayer=layer;
 layer.setAttribute('aria-hidden','true');layer.dataset.victoryId=id;
 const shade=vfxMake('div','vfx-shade'),flash=vfxMake('div','vfx-one-flash'),rays=vfxMake('div','vfx-rays'),ring=vfxMake('div','vfx-shock-ring');
 const poster=vfxMake('div','vfx-poster');
 poster.append(vfxMake('span','vfx-eyebrow',clean.kind==='tournament'?'RANDOM LUNCH · CHAMPION':clean.kind==='duel'?'FOOD FIGHT · VICTORY':'LUNCH GRAND PRIX · FINISH'));
 const title=vfxMake('strong','vfx-title',clean.kind==='tournament'?'WINNER!':clean.kind==='duel'?'K.O.':'1ST!');title.dataset.echo=title.textContent;poster.append(title);
 const art=vfxMake('div','vfx-art');
 const trophy=vfxMake('div','vfx-trophy');trophy.innerHTML='<svg viewBox="0 0 200 190" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M51 40H20v28c0 28 28 40 49 28M149 40h31v28c0 28-28 40-49 28" stroke="#241b24" stroke-width="12" stroke-linecap="round"/><path d="M51 40H20v28c0 28 28 40 49 28M149 40h31v28c0 28-28 40-49 28" stroke="#ffbf39" stroke-width="7" stroke-linecap="round"/><path d="M48 19h104v40c0 37-23 61-52 61S48 96 48 59V19Z" fill="#ffc94a" stroke="#241b24" stroke-width="7"/><path d="M59 29h17v30c0 25 8 42 21 52-23-4-38-24-38-52V29Z" fill="#ffe99a"/><path d="m100 43 7 14 16 2-12 12 3 16-14-8-14 8 3-16-12-12 16-2 7-14Z" fill="#fff9e2" stroke="#ba721b" stroke-width="3"/><path d="M91 120h18v29H91z" fill="#e99b26" stroke="#241b24" stroke-width="6"/><path d="M70 149h60l10 25H60l10-25Z" fill="#ffc94a" stroke="#241b24" stroke-width="7"/><path d="M51 176h98" stroke="#241b24" stroke-width="9" stroke-linecap="round"/></svg>';
 const food=vfxMake('span','vfx-food',vfxFood(clean.menu));art.append(trophy,food,vfxMake('i','vfx-spark vfx-spark-a','✦'),vfxMake('i','vfx-spark vfx-spark-b','✦'));poster.append(art);
 poster.append(vfxMake('b','vfx-name',clean.name+(clean.kind==='tournament'?' 토너먼트 우승!':clean.kind==='duel'?' 최종 승리!':' 레이스 1등!')),vfxMake('span','vfx-menu',clean.menu),vfxMake('span','vfx-caption',clean.kind==='tournament'?'내 메뉴, 끝까지 살아남았다!':clean.kind==='duel'?'승부 끝! 오늘 점심을 지배하다.':'왕관 썼다고 안 봐줌. 다음은 밥그릇 난투.'));
 const ticker=vfxMake('div','vfx-ticker');ticker.append(vfxMake('span','',clean.kind==='tournament'?'CHAMPION • 오늘의 우승 메뉴':clean.kind==='duel'?'VICTORY • 점심 쟁탈전 승리 • VICTORY • 점심 쟁탈전 승리':'FIRST SEED • 왕좌 쟁탈전 진출 • FIRST SEED • 왕좌 쟁탈전 진출'));
 const particles=vfxMake('div','vfx-particles');
 for(let i=0;i<(still?10:58);i++){
  const p=vfxMake('i',i%7===0?'vfx-confetti vfx-confetti-star':'vfx-confetti');
  p.style.setProperty('--left',(vfxNoise(id,i)*100)+'%');p.style.setProperty('--drift',((vfxNoise(id,i+90)-.5)*340)+'px');p.style.setProperty('--turn',((i%2?1:-1)*(400+vfxNoise(id,i+180)*600))+'deg');p.style.setProperty('--delay',(vfxNoise(id,i+270)*.5)+'s');p.style.setProperty('--fall',(2+vfxNoise(id,i+360)*.8)+'s');p.style.setProperty('--color',['#ffce54','#ff684a','#a8edc9','#c7b7ff','#fff7d7'][i%5]);if(i%7===0)p.textContent='✦';particles.append(p);
 }
 layer.append(shade,rays,ring,flash,particles,poster,ticker);document.body.append(layer);
 vfxImpactStage(clean.kind,still);vfxFanfare();
 // Independent of CSS animation support, the readable game/results reappear
 // within two seconds; only light, noninteractive particles may linger.
 vfxFocusCleanup=setTimeout(()=>{for(const node of [shade,rays,ring,flash,poster,ticker])node.remove();},1900);
 vfxCleanup=setTimeout(()=>{layer.remove();if(vfxLayer===layer)vfxLayer=null;},still?1950:3100);
 vfxEnsureReplay();return true;
}
function vfxDuelDetail(){
 if(typeof duel==='undefined'||!duel||duel.phase!=='done'||!duel.fighters?.length)return null;
 const fromResult=typeof result!=='undefined'&&result?.source==='duel';
 const side=fromResult?(result.person===duel.challenger?0:1):(duel.fighters[0].hp>=duel.fighters[1].hp?0:1);
 return {id:'duel:'+(duel.id||((typeof result!=='undefined'&&result?.id)||'local')+':'+((typeof result!=='undefined'&&result?.duelCount)||0)),kind:'duel',name:side===0?duel.challenger:duel.defender,menu:side===0?duel.challengerMenu:duel.defenderMenu,reason:'결투 승리'};
}
function vfxResultDetail(){
 if(typeof result==='undefined'||!result)return null;
 if(result.source==='tournament')return {id:'tournament:'+result.id,kind:'tournament',name:result.person,menu:result.menu};
 if(result.brawlId)return {id:'brawl:'+result.brawlId,kind:'duel',name:result.person,menu:result.menu};
 if(result.source==='duel'){const d=vfxDuelDetail();return d||{id:'duel:'+result.id+':'+(result.duelCount||0),kind:'duel',name:result.person,menu:result.menu};}
 return {id:'race:'+result.id,kind:'race',name:result.person,menu:result.menu};
}
function vfxEnsureReplay(){
 const view=$('resultView');if(!view)return;
 let replay=$('vfxReplayBtn');
 if(!replay){replay=vfxMake('button','vfx-replay','✦ 승리 세리머니 다시 보기');replay.id='vfxReplayBtn';replay.type='button';replay.addEventListener('click',()=>{const detail=vfxResultDetail()||vfxLastDetail;if(detail)vfxCelebrate({...detail,force:true});});const actions=view.querySelector('.result-actions');if(actions)actions.append(replay);else view.append(replay);}
 replay.hidden=!(typeof result!=='undefined'&&result);return replay;
}
deptRender=function(...args){
 const value=vfxOriginalRaceRender(...args);
 if(typeof deptRace!=='undefined'&&deptRace?.phase==='finished'){
  const winner=deptRace.lanes.find(l=>l.id===deptRace.winnerId);
  if(winner)vfxCelebrate({id:'race:'+deptRace.id,kind:'race',name:winner.name,menu:winner.menu});
 }
 return value;
};
actionRender=function(...args){const value=vfxOriginalCombatRender(...args);const detail=vfxDuelDetail();if(detail)vfxCelebrate(detail);return value;};
renderResult=function(...args){const value=vfxOriginalResultRender(...args);vfxEnsureReplay();const detail=vfxResultDetail();if(detail)vfxCelebrate(detail);return value;};


/* EXTRA_ROLES_V1 */
const deptRoleBaseSimulate=deptSimulate,deptRoleBaseHazard=deptHazard;
deptSimulate=function(dt,t){
 if(deptAuthority()&&deptRace?.phase==='running')for(const lane of deptRace.lanes){
 }
 return deptRoleBaseSimulate(dt,t);
};
deptHazard=function(lane,gate,t){
 const avoided=(t<lane.jumpUntil&&gate.type!=='wind')||(t<lane.dashUntil&&gate.type==='wind');
 if(deptAuthority()&&deptRace?.phase==='running'&&lane.department==='facility'&&!lane.passiveUsed&&lane.finishedAt===null&&!avoided){deptUsePassive(lane,t,'장애물 안전 통과!');return;}
 return deptRoleBaseHazard(lane,gate,t);
};


/* GROUP_BRAWL_V1 */
/* BRAWL_PROJECTILES_V1 */
/* BRAWL_DUCK_RECOVERY_V1 */
let brawlState=null,brawlTimer=0,brawlFrame=0,brawlLast=0,brawlAccumulator=0,brawlRemotePrev=null,brawlRemoteAt=0,brawlLocalKeys=new Set(),brawlPointerInputs=new Map(),brawlFlushQueued=false;
const brawlInputs=new Map(),brawlInputAt=new Map(),brawlInputSeq=new Map(),brawlNodes=new Map(),brawlSoundSeen=new Map();
const brawlKeys={KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',KeyW:'jump',ArrowUp:'jump',Space:'jump',KeyF:'attack',KeyK:'attack',KeyS:'duck',ArrowDown:'duck',KeyG:'duck',KeyL:'duck',KeyE:'beam'};
const brawlHeld=['left','right','duck'],brawlColors=['#ade8c8','#cfbaf0','#ffd47f','#ffa99b','#8bdbe8','#d3df91','#edb8db','#b4c8fa'];

const brawlOrbNodes=new Map();
function brawlSpawnOrb(f){
 const s=brawlState;s.projectiles??=[];s.projectileSeq=(s.projectileSeq||0)+1;
 s.projectiles.push({id:s.id+':orb:'+s.projectileSeq,owner:f.id,x:f.x+f.beamFace*36,y:f.y+68,baseY:f.y+68,vx:f.beamFace*200,vy:60,age:0,ttl:3.8,radius:13,active:true,hit:false,hitId:null,impactUntil:0});
}
function brawlSegmentRect(x0,y0,x1,y1,left,right,bottom,top){
 let near=0,far=1;for(const [start,end,min,max] of [[x0,x1,left,right],[y0,y1,bottom,top]]){const d=end-start;if(Math.abs(d)<1e-7){if(start<min||start>max)return null;continue;}let a=(min-start)/d,b=(max-start)/d;if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);if(near>far)return null;}return near;
}
function brawlAdvanceOrbs(dt,hits,alive){
 const s=brawlState,t=s.clock;for(const p of s.projectiles||[]){if(!p.active)continue;const x0=p.x,y0=p.y;p.age+=dt;p.x+=p.vx*dt;p.vy=(p.vy||0)-650*dt;p.y+=p.vy*dt;if(p.y<19){p.y=19;p.vy=265;}for(const floor of arcadePlatforms)if(p.x>=floor.left&&p.x<=floor.right&&y0-13>=floor.y&&p.y-13<=floor.y&&p.vy<0){p.y=floor.y+13;p.vy=235;break;}
  let contact=null,first=Infinity;for(const f of alive){if(f.id===p.owner||f.eliminated||f.forfeited)continue;const r=p.radius,at=brawlSegmentRect(x0,y0,p.x,p.y,f.x-32-r,f.x+32+r,f.y+6-r,f.y+(f.guard?38:82)+r);if(at!==null&&at<first){first=at;contact=f;}}
  if(contact){p.x=x0+(p.x-x0)*first;p.y=y0+(p.y-y0)*first;p.active=false;p.hit=true;p.hitId=contact.id;p.impactUntil=t+.18;const owner=s.fighters.find(f=>f.id===p.owner);if(owner)brawlHit(hits,{...owner,beamFace:p.vx>0?1:-1},contact,30,'뜨거 ㅋㅋ','beam');}
  else if(p.age>=p.ttl||p.x<-35||p.x>1035)p.active=false;
 }
 s.projectiles=(s.projectiles||[]).filter(p=>p.active||p.hit&&t<p.impactUntil);
}
function brawlRenderOrbs(alpha,width,height){
 let layer=$('brawlOrbs');if(!layer){layer=brawlMake('div','brawl-orbs');layer.id='brawlOrbs';layer.setAttribute('aria-hidden','true');$('brawlArena').append(layer);}
 const visible=new Set();for(const p of brawlState.projectiles||[]){if(!p.active&&!p.hit)continue;visible.add(p.id);let n=brawlOrbNodes.get(p.id);if(!n){n=brawlMake('i','brawl-orb');n.append(brawlMake('i','brawl-orb-tail'),brawlMake('b','brawl-orb-core'));layer.append(n);brawlOrbNodes.set(p.id,n);}
  const prev=brawlRemotePrev?.projectiles?.find(q=>q.id===p.id),x=prev&&!brawlAuthority()?prev.x+(p.x-prev.x)*alpha:p.x,y=prev&&!brawlAuthority()?prev.y+(p.y-prev.y)*alpha:p.y;
  n.style.transform='translate3d('+(x/1000*width)+'px,'+(-y/360*height+13)+'px,0) translateX(-50%) scaleX('+(p.vx>0?1:-1)+')';n.classList.toggle('is-impact',p.hit);n.style.opacity=p.hit?String(Math.max(0,(p.impactUntil-brawlState.clock)/.18)):'';
 }
 for(const [id,node] of brawlOrbNodes)if(!visible.has(id)){node.remove();brawlOrbNodes.delete(id);}
}

function brawlAuthority(){return typeof netIsHost==='function'?netIsHost():true;}
function brawlMe(){return typeof netSelfId==='function'?netSelfId():brawlState?.participants[0]?.id||'';}
function brawlClock(){return performance.now();}
function brawlMake(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function brawlText(n,t){if(n&&n.textContent!==String(t))n.textContent=String(t);}
function brawlClone(v){return JSON.parse(JSON.stringify(v));}
function brawlFood(menu){return typeof deptFood==='function'?deptFood(menu):typeof actionFood==='function'?actionFood(menu):'🍽️';}
function brawlPublish(force=false){if(brawlAuthority()&&typeof netBrawlPublish==='function')netBrawlPublish(force);}
function brawlSend(action,held){if(typeof netBrawlInput==='function')netBrawlInput(action,held);}
function brawlOwn(){return brawlState?.fighters.find(f=>f.id===brawlMe());}
function brawlAlive(){return brawlState?brawlState.fighters.filter(f=>!f.eliminated&&!f.forfeited&&f.hp>0):[];}
function brawlClearHeld(){brawlLocalKeys.clear();brawlPointerInputs.clear();document.querySelectorAll('[data-brawl-action]').forEach(n=>n.classList.remove('is-held'));if(brawlState&&brawlOwn())brawlSend('sync',[]);}
function brawlHeldList(){const out=new Set();for(const code of brawlLocalKeys){const a=brawlKeys[code];if(brawlHeld.includes(a))out.add(a);}for(const v of brawlPointerInputs.values())if(brawlHeld.includes(v.action))out.add(v.action);return [...out];}
function brawlFlush(){brawlFlushQueued=false;if(brawlState&&brawlOwn())brawlSend('sync',brawlHeldList());}
function brawlQueueFlush(){if(brawlFlushQueued)return;brawlFlushQueued=true;queueMicrotask(brawlFlush);}
function brawlHolding(id,action){if(brawlClock()-(brawlInputAt.get(id)||0)>900)brawlInputs.delete(id);return brawlInputs.get(id)?.has(action)||false;}
function brawlSpawn(i,n){return n===2?280+i*440:n===3?170+i*330:110+i*780/(n-1);}
function brawlFighter(p,i,n,championId){const champion=p.id===championId;return {champion,jumps:0,dropUntil:0,dashUntil:0,attackFace:1,diving:false,maxHp:100,id:p.id,name:p.name,menu:p.menu,department:p.department||'',index:i,x:brawlSpawn(i,n),y:0,prevY:0,vx:0,vy:0,face:i<n/2?1:-1,hp:100,energy:100,guard:false,guardSince:-100,guardBreakUntil:0,wasGuard:false,moving:false,attackAt:-100,attackReadyAt:0,attackHitIds:[],stun:0,flash:0,label:'',labelUntil:0,stompAfter:0,stompUntil:0,beamReadyAt:0,beamChargeAt:0,beamUntil:0,beamFace:1,beamFired:true,beamHitIds:[],eliminated:false,forfeited:false};}
function brawlEnsureView(){
 let view=$('brawlView');if(view)return view;
 view=brawlMake('section','brawl-view');view.id='brawlView';view.hidden=true;view.setAttribute('aria-label','모두 함께 조작하는 점심 난투');
 view.innerHTML='<div class="board-head"><div class="section-label"><small>EVERYONE VS EVERYONE</small> 1등 쟁탈전</div><span class="pill">2–8명 · 밟고 튕기고 밥 지키기</span></div><div class="brawl-intro"><div><span>왕관은 장식. 밥 앞에서는 모두 체력 100.</span><h2 id="brawlHeading" tabindex="-1">밥 먹자고 이러는 중</h2></div><div class="brawl-clock"><b id="brawlClock">60</b><small id="brawlClockCaption">SECONDS</small></div></div><div class="brawl-scores" id="brawlScores"></div><div class="brawl-arena" id="brawlArena" aria-label="다인 실시간 난투 경기장"><div class="brawl-backdrop"><i class="brawl-sun"></i><div class="brawl-grid"></div><span class="brawl-arena-label">DAEGU UNIVERSITY · LUNCH BRAWL</span><div class="brawl-floor"></div></div><div id="brawlActors" class="brawl-actors"></div><div class="brawl-overlay" id="brawlOverlay"><b id="brawlOverlayTitle">READY?</b><span id="brawlOverlaySub">모든 참가자가 직접 움직여요.</span></div></div><div class="brawl-notice" id="brawlNotice" role="status" aria-live="polite"></div><div class="brawl-own"><div><strong id="brawlOwnName"></strong><span id="brawlOwnHint">A/D 이동 · W 점프 · F 공격 · S 숙이기 · E 에네르기파</span></div><span id="brawlBeamStatus"></span></div><div class="brawl-touch" id="brawlControls"><button data-brawl-action="left" aria-label="내 캐릭터 왼쪽 이동">◀<kbd>A / ←</kbd></button><button data-brawl-action="right" aria-label="내 캐릭터 오른쪽 이동">▶<kbd>D / →</kbd></button><button data-brawl-action="jump" aria-label="내 캐릭터 점프와 머리 밟기">점프<kbd>W / ↑</kbd></button><button data-brawl-action="attack" aria-label="내 캐릭터 근접 공격">공격<kbd>F</kbd></button><button data-brawl-action="duck" aria-label="내 캐릭터 숙이기 방어">숙이기<kbd>S / ↓</kbd></button><button class="brawl-beam-button" data-brawl-action="beam" aria-label="내 캐릭터 에네르기파">에네르기파<small id="brawlBeamCooldown">E · 기력 40</small></button></div><div class="brawl-bottom"><span>점프 두 번 · 공중에서 S로 내리찍기 · F로 밀치기 · 불덩이는 천천히 통통</span><button id="brawlReadyBtn" class="btn primary" type="button">내 캐릭터 준비 완료</button></div>';
 ($('game')||document.body).append(view);$('brawlReadyBtn').addEventListener('click',()=>{if(typeof netBrawlReady==='function')netBrawlReady();});
 return view;
}
function brawlBuildActors(){
 brawlNodes.clear();$('brawlActors').replaceChildren();$('brawlScores').replaceChildren();
 brawlState.fighters.forEach((f,i)=>{
  const row=brawlMake('div','brawl-score');row.dataset.id=f.id;row.style.setProperty('--brawl-color',brawlColors[i%8]);const name=brawlMake('strong','',(f.champion?'👑 ':'')+f.name+(f.id===brawlMe()?' · 나':'')),hp=brawlMake('b','','100'),bar=brawlMake('span','brawl-mini-health'),fill=brawlMake('i');bar.append(fill);row.append(name,hp,bar,brawlMake('small','',f.menu));$('brawlScores').append(row);
  const actor=brawlMake('div','brawl-actor');actor.style.setProperty('--brawl-color',brawlColors[i%8]);actor.dataset.id=f.id;actor.setAttribute('aria-label',f.name+'의 '+f.menu+' 캐릭터');
  actor.innerHTML='<i class="brawl-stomp-ring"></i><div class="brawl-charge"></div><div class="brawl-energy-beam"><i></i><b></b></div><span class="brawl-float-label"></span><span class="brawl-player-name"></span><div class="brawl-art"><span class="brawl-food"></span><svg viewBox="0 0 140 120" aria-hidden="true"><ellipse cx="70" cy="109" rx="45" ry="6" fill="#211b2633"/><path d="m42 89-7 18m63-18 7 18" stroke="#211b26" stroke-width="8" stroke-linecap="round"/><path d="M22 45Q4 45 10 70M118 45q18 0 12 25" stroke="#211b26" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M22 42q2 57 48 57t48-57Z" fill="var(--brawl-color)" stroke="#211b26" stroke-width="5"/><ellipse cx="70" cy="42" rx="48" ry="10" fill="#fff6dc" stroke="#211b26" stroke-width="5"/><circle cx="53" cy="65" r="4" fill="#211b26"/><circle cx="87" cy="65" r="4" fill="#211b26"/><path d="M57 79q13 12 26 0" stroke="#211b26" stroke-width="4" fill="none" stroke-linecap="round"/></svg><i class="brawl-arm"></i><i class="brawl-punch"></i></div>';
  if(typeof deptAvatarSvg==='function'){actor.querySelector('.brawl-art').innerHTML=deptAvatarSvg(f.department)+'<i class="brawl-punch"></i>';actor.classList.add('has-dept-avatar');const badge=brawlMake('span','brawl-food-badge',brawlFood(f.menu));badge.setAttribute('aria-hidden','true');actor.append(badge);}else brawlText(actor.querySelector('.brawl-food'),brawlFood(f.menu));
  brawlText(actor.querySelector('.brawl-player-name'),(f.champion?'👑 ':'')+f.name);$('brawlActors').append(actor);
  brawlNodes.set(f.id,{actor,row,hp,fill,name,art:actor.querySelector('.brawl-art'),beam:actor.querySelector('.brawl-energy-beam'),label:actor.querySelector('.brawl-float-label')});
 });
}
function brawlPrepare(spec){
 if(!spec||typeof spec.id!=='string'||!spec.id||!Array.isArray(spec.participants)||spec.participants.length<2||spec.participants.length>8)return false;
 if(spec.participants.some(p=>!p||typeof p.id!=='string'||typeof p.name!=='string'||typeof p.menu!=='string')||new Set(spec.participants.map(p=>p.id)).size!==spec.participants.length)return false;
 brawlCancel();const participants=spec.participants.map(p=>({id:p.id,name:p.name.slice(0,24),menu:p.menu.slice(0,40),department:String(p.department||'').slice(0,60)}));
 brawlState={id:spec.id,participants,phase:'lobby',readyIds:Array.isArray(spec.readyIds)?spec.readyIds.filter(id=>participants.some(p=>p.id===id)):[],championId:participants.some(p=>p.id===spec.championId)?spec.championId:null,fighters:participants.map((p,i)=>brawlFighter(p,i,participants.length,spec.championId)),clock:0,countdown:3,sudden:false,projectiles:[],projectileSeq:0,seq:0,winnerId:null,reason:'',notice:'직접 움직이고 공격하세요. 자동 전투는 없어요.',finishLocked:false};
 const view=brawlEnsureView();['setupView','raceView','resultView','duelView','deptRaceView'].forEach(id=>{const n=$(id);if(n)n.hidden=true;});if(typeof deptView!=='undefined'&&deptView)deptView.hidden=true;view.hidden=false;
 if(typeof playLayout==='function')playLayout(true);if(typeof setStep==='function')setStep(3);mode='brawl';brawlBuildActors();brawlLast=brawlClock();brawlRemoteAt=brawlLast;brawlRemotePrev=null;brawlRender();brawlFrame=requestAnimationFrame(brawlAnimate);
 brawlTimer=setInterval(brawlPump,32);return true;
}
function brawlStart(){if(!brawlAuthority()||!brawlState||brawlState.phase!=='lobby')return false;brawlState.phase='countdown';brawlState.countdown=3;brawlState.clock=0;brawlState.notice='3초 뒤 시작! 내 캐릭터를 확인하세요.';brawlInputs.clear();brawlInputAt.clear();brawlLast=brawlClock();brawlAccumulator=0;brawlState.seq++;brawlRender();brawlPublish(true);return true;}
function brawlSetReady(ids){if(!brawlState||!Array.isArray(ids))return false;brawlState.readyIds=[...new Set(ids.filter(id=>brawlState.participants.some(p=>p.id===id)))];brawlRender();return true;}
function brawlHostInput(senderId,packet){
 if(!brawlAuthority()||!brawlState||!packet||typeof packet!=='object'||!Number.isSafeInteger(packet.seq)||packet.seq<1||packet.seq<=(brawlInputSeq.get(senderId)||0))return false;
 const f=brawlState.fighters.find(f=>f.id===senderId);if(!f||f.eliminated||f.forfeited||f.hp<=0)return false;
 const action=packet.action;
 if(action==='sync'){
  if(!Array.isArray(packet.held)||packet.held.length>3||packet.held.some(a=>!brawlHeld.includes(a)))return false;
  if(packet.held.length&&brawlState.phase!=='fight')return false;
  brawlInputSeq.set(senderId,packet.seq);brawlInputs.set(senderId,new Set(packet.held));brawlInputAt.set(senderId,brawlClock());return true;
 }
 if(brawlHeld.includes(action)){
  if(typeof packet.held!=='boolean'||packet.held&&brawlState.phase!=='fight')return false;
  brawlInputSeq.set(senderId,packet.seq);const held=brawlInputs.get(senderId)||new Set();if(packet.held)held.add(action);else held.delete(action);brawlInputs.set(senderId,held);brawlInputAt.set(senderId,brawlClock());return true;
 }
 if(!['jump','attack','beam'].includes(action)||packet.held!==true||brawlState.phase!=='fight')return false;
 brawlInputSeq.set(senderId,packet.seq);brawlInputAt.set(senderId,brawlClock());const t=brawlState.clock;if(t<f.stun)return false;
 if(action==='jump'){if((f.jumps||0)>=2)return false;f.jumps=(f.jumps||0)+1;f.vy=f.jumps===1?780:650;f.guard=false;f.diving=false;f.label=f.jumps===2?'한 번 더 ㅋㅋ':'';f.labelUntil=t+.45;return true;}
 if(action==='attack'){if(t<f.attackReadyAt||brawlHolding(f.id,'duck')||!f.beamFired||t<f.beamUntil)return false;f.attackAt=t;f.attackReadyAt=t+.48;f.attackFace=f.face;f.dashUntil=t+.12;f.attackHitIds=[];return true;}
 if(t<f.beamReadyAt||f.energy<40||!f.beamFired||t<f.beamUntil)return false;
 f.energy-=40;f.beamReadyAt=t+7;f.beamChargeAt=t+.7;f.beamUntil=0;f.beamFace=f.face;f.beamFired=false;f.beamHitIds=[];f.label='에너지 충전!';f.labelUntil=t+.7;return true;
}
function brawlNotice(text){if(brawlState)brawlState.notice=text;}
function brawlHit(hits,a,b,damage,label,kind='punch'){
 hits.push({attacker:a.id,target:b.id,damage,dir:kind==='beam'?a.beamFace:(b.x>=a.x?1:-1),kind});b.label=label;b.labelUntil=brawlState.clock+.58;b.flash=brawlState.clock+.18;b.hitKind=kind;
}
function brawlResolve(hits,alive){
 const t=brawlState.clock;
 for(const a of alive){
  if(!a.beamFired&&t>=a.beamChargeAt){a.beamFired=true;a.beamUntil=t+.16;a.label='에네르기파 발사!';a.labelUntil=t+.55;brawlSpawnOrb(a);brawlNotice(a.name+'의 느린 에네르기파! 점프하거나 숙여서 피하세요.');}
  for(const b of alive){if(a===b)continue;const dx=b.x-a.x;
   if(t-a.attackAt>=.09&&t-a.attackAt<=.24&&!a.attackHitIds.includes(b.id)&&Math.abs(dx)<128&&Math.abs(a.y-b.y)<76&&dx*a.face>=0){
    a.attackHitIds.push(b.id);
    if(b.guard&&a.y-b.y>26){b.label='회피!';b.labelUntil=t+.45;b.energy=Math.max(0,b.energy-3);}
    else if(b.guard&&b.energy>12){const parry=t-b.guardSince<.12;b.energy=Math.max(0,b.energy-(parry?8:16));if(parry){a.stun=Math.max(a.stun,t+.25);a.vx=-a.face*180;}brawlHit(hits,a,b,parry?0:4,parry?'패링!':'방어!');}
    else brawlHit(hits,a,b,18,['억','아니 잠깐','밥 내놔'][Math.floor(t*3)%3]);
   }
   const head=b.y+(b.guard?44:78),oldHead=b.prevY+(b.guard?44:78);
   if(a.vy<-65&&t>=a.stun&&t>=a.stompAfter&&Math.abs(dx)<84&&a.prevY>=oldHead-1&&a.y<=head){
    const guarded=b.guard&&b.energy>15;a.y=head+2;a.vy=610;a.jumps=1;a.stompAfter=t+.4;a.stompUntil=t+.38;if(guarded)b.energy=Math.max(0,b.energy-20);brawlHit(hits,a,b,guarded?8:a.diving?34:26,guarded?'납작 방어':a.diving?'밥그릇 찍기!':'납작 ㅋㅋ','stomp');a.diving=false;
   }
   // A released skill travels as a host-authoritative projectile.
  }
 }
}
function brawlResetSurvivors(fighters,notice){
 const t=brawlState.clock;fighters.forEach((f,i)=>{f.hp=1;f.energy=100;f.eliminated=false;f.x=brawlSpawn(i,fighters.length);f.y=f.prevY=f.vy=f.vx=0;f.jumps=0;f.diving=false;f.dropUntil=0;f.attackAt=-100;f.attackReadyAt=t+.5;f.stun=t+.4;f.guard=false;f.wasGuard=false;f.guardBreakUntil=0;f.beamFired=true;f.beamUntil=0;f.beamChargeAt=0;f.beamReadyAt=t+.8;f.stompAfter=t+.5;});brawlInputs.clear();brawlState.projectiles=[];brawlState.notice=notice;
}
function brawlFinish(winner,reason){
 if(!brawlState||brawlState.finishLocked)return;brawlState.finishLocked=true;brawlState.phase='finished';brawlState.winnerId=winner?.id||null;brawlState.reason=reason;brawlState.notice=winner?winner.name+' 우승! 오늘 점심은 '+winner.menu:reason;brawlState.seq++;brawlInputs.clear();brawlRender();brawlPublish(true);if(winner&&typeof netBrawlFinished==='function')netBrawlFinished(winner.id,reason);
}

function brawlStep(dt){
 if(!brawlAuthority()||!brawlState||!['countdown','fight'].includes(brawlState.phase)||!Number.isFinite(dt)||dt<=0)return false;dt=Math.min(.04,dt);
 if(brawlState.phase==='countdown'){brawlState.countdown=Math.max(0,brawlState.countdown-dt);if(brawlState.countdown<=0){brawlState.phase='fight';brawlState.clock=0;brawlState.notice='밥 먹자고 이러는 중';brawlInputs.clear();}brawlState.seq++;return true;}
 brawlState.clock+=dt;const t=brawlState.clock,alive=brawlAlive();if(alive.length<=1){brawlFinish(alive[0],alive.length?'마지막 밥그릇':'참가자가 없어요.');return true;}
 if(arcadePractice)arcadeBotStep();
 for(const f of alive){
  const moving=(brawlHolding(f.id,'right')?1:0)-(brawlHolding(f.id,'left')?1:0),can=t>=f.stun,duck=brawlHolding(f.id,'duck');
  const others=alive.filter(x=>x!==f).sort((a,b)=>Math.abs(a.x-f.x)-Math.abs(b.x-f.x));
  if(!f.beamFired||t<f.beamUntil)f.face=f.beamFace;else if(t-f.attackAt<.26)f.face=f.attackFace||f.face;else if(moving&&can)f.face=moving;else if(others[0])f.face=others[0].x>=f.x?1:-1;
  const supported=f.y<.5||arcadePlatforms.some(p=>Math.abs(f.y-p.y)<2&&f.x>=p.left-15&&f.x<=p.right+15);
  if(duck&&supported&&f.y>1&&can){f.dropUntil=t+.35;f.y-=4;f.vy=-110;f.jumps=1;}
  const guard=duck&&f.energy>0&&t>=(f.guardBreakUntil||0)&&f.y<5&&t-f.attackAt>.25&&can&&f.beamFired&&t>=f.beamUntil;
  if(guard&&!f.wasGuard)f.guardSince=t;f.guard=guard;f.wasGuard=guard;
  if(duck&&!supported&&f.y>30&&can&&f.vy<180){f.vy=-1100;f.diving=true;}
  const charging=!f.beamFired||t<f.beamUntil;f.energy=Math.max(0,Math.min(100,f.energy+(guard?-22:charging?3:16)*dt));
  if(guard&&f.energy<=0){f.guard=false;f.wasGuard=false;f.guardBreakUntil=t+.8;}
  f.moving=!!moving&&can;
  if(can){const desired=t<f.dashUntil?f.attackFace*680:moving*(guard?95:charging?140:arcadePractice&&f.id!=='practice-you'?265:405);f.vx+=(desired-f.vx)*Math.min(1,dt*(moving||t<f.dashUntil?24:14));}
  else f.vx*=Math.pow(.18,dt);
  f.prevY=f.y;f.x+=f.vx*dt;
  if(f.x<55||f.x>945){const wall=f.x<55?55:945;f.x=wall;if(Math.abs(f.vx)>350&&t<f.stun){f.vx=-f.vx*.55;f.label='벽이 왜 여기';f.labelUntil=t+.6;}}
  f.vy-=1700*dt;f.y+=f.vy*dt;
  if(f.y>240){f.y=240;f.vy=Math.min(0,f.vy);}
  if(f.vy<=0&&t>=(f.dropUntil||0))for(const p of [...arcadePlatforms].sort((a,b)=>b.y-a.y)){
   if(f.x>=p.left-15&&f.x<=p.right+15&&f.prevY>=p.y-1&&f.y<=p.y){f.y=p.y;f.vy=0;f.jumps=0;f.diving=false;break;}
  }
  if(f.y<=0){f.y=0;f.vy=0;f.jumps=0;f.diving=false;}
 }
 const hits=[];brawlResolve(hits,alive);brawlAdvanceOrbs(dt,hits,alive);
 for(let i=0;i<alive.length;i++)for(let j=i+1;j<alive.length;j++){const a=alive[i],b=alive[j],dx=b.x-a.x;if(Math.abs(dx)<75&&Math.abs(a.y-b.y)<(a.guard||b.guard?35:62)){const push=(75-Math.abs(dx))/2,s=dx>=0?1:-1;a.x=Math.max(55,Math.min(945,a.x-push*s));b.x=Math.max(55,Math.min(945,b.x+push*s));}}
 for(const hit of hits){const b=brawlState.fighters.find(f=>f.id===hit.target);b.hp=Math.max(0,b.hp-hit.damage);if(hit.damage){b.stun=Math.max(b.stun,t+(hit.kind==='beam'?.34:.24));b.vx=hit.dir*(hit.kind==='beam'?720:hit.kind==='stomp'?470:570)+(100-b.hp)*hit.dir*2;b.vy=Math.max(b.vy,hit.kind==='beam'?330:hit.kind==='stomp'?150:225);b.guard=false;b.jumps=Math.max(1,b.jumps||0);}}
 const survivors=alive.filter(f=>f.hp>0&&!f.forfeited);
 if(!survivors.length){brawlState.sudden=true;brawlResetSurvivors(alive.filter(f=>!f.forfeited),'둘 다 뻗음. 한 대만 더!');}
 else{alive.forEach(f=>{if(f.hp<=0){f.eliminated=true;f.guard=false;f.label='밥은 먹고 다녀라';f.labelUntil=t+2;}});if(survivors.length===1){brawlFinish(survivors[0],'마지막 밥그릇');return true;}
  if(t>=45&&!brawlState.sudden){const max=Math.max(...survivors.map(f=>f.hp)),tied=survivors.filter(f=>Math.abs(f.hp-max)<.01);if(tied.length===1){brawlFinish(tied[0],'시간 종료 · 남은 체력 우세');return true;}brawlState.sudden=true;survivors.filter(f=>!tied.includes(f)).forEach(f=>{f.eliminated=true;f.label='밥심 부족';f.labelUntil=t+2;});brawlResetSurvivors(tied,'동점이라니. 한 대만 더!');}
 }
 brawlState.seq++;return true;
}

function brawlPump(){
 if(!brawlState||!brawlAuthority()||!['countdown','fight'].includes(brawlState.phase)){brawlLast=brawlClock();return;}
 const now=brawlClock();brawlAccumulator+=Math.min(1.2,Math.max(0,(now-brawlLast)/1000));brawlLast=now;let steps=0;while(brawlAccumulator>=.016&&steps++<75&&['countdown','fight'].includes(brawlState.phase)){brawlStep(.016);brawlAccumulator-=.016;}if(steps>=75)brawlAccumulator=0;brawlPublish(false);
}
function brawlGetState(){return brawlState?brawlClone(brawlState):null;}
function brawlReceive(state){
 if(brawlAuthority()||!state||!brawlState||state.id!==brawlState.id||!Number.isSafeInteger(state.seq)||state.seq<brawlState.seq||!['lobby','countdown','fight','finished'].includes(state.phase)||!Array.isArray(state.fighters)||state.fighters.length<2||state.fighters.length>8)return false;
 if(new Set(state.fighters.map(f=>f?.id)).size!==state.fighters.length||state.fighters.some(f=>!f||!brawlState.participants.some(p=>p.id===f.id)||['x','y','vx','vy','hp','energy','attackAt','attackReadyAt','stun','flash','labelUntil','beamReadyAt','beamChargeAt','beamUntil','beamFace'].some(k=>!Number.isFinite(f[k]))))return false;
 if(!Number.isFinite(state.clock)||!Number.isFinite(state.countdown))return false;
 if(!Array.isArray(state.projectiles)||state.projectiles.length>32||state.projectiles.some(p=>!p||typeof p.id!=='string'||!state.fighters.some(f=>f.id===p.owner)||['x','y','baseY','vx','age','ttl','radius','impactUntil'].some(k=>!Number.isFinite(p[k]))||Math.abs(p.vx)>250||p.radius<8||p.radius>20||p.ttl<0||p.ttl>4))return false;
 brawlRemotePrev=brawlGetState();brawlState=brawlClone(state);brawlRemoteAt=brawlClock();brawlState.fighters.forEach(f=>{f.x=Math.max(0,Math.min(1000,f.x));f.y=Math.max(0,Math.min(700,f.y));f.maxHp=100;f.hp=Math.max(0,Math.min(f.maxHp,f.hp));f.energy=Math.max(0,Math.min(100,f.energy));});brawlRender();return true;
}
function brawlRemoveMember(id){
 if(!brawlAuthority()||!brawlState||brawlState.finishLocked)return false;const f=brawlState.fighters.find(f=>f.id===id);if(!f||f.forfeited)return false;f.forfeited=true;f.eliminated=true;f.hp=0;f.guard=false;f.beamUntil=0;f.beamFired=true;f.label='연결 종료';f.labelUntil=brawlState.clock+1000;brawlInputs.delete(id);brawlState.readyIds=brawlState.readyIds.filter(x=>x!==id);brawlState.seq++;const alive=brawlAlive();if(alive.length<=1)brawlFinish(alive[0],alive.length?'상대 참가자 연결 종료':'남은 참가자가 없어요.');else brawlPublish(true);return true;
}
function brawlRender(){
 if(!brawlState||!$('brawlView')||$('brawlView').hidden)return;const s=brawlState,t=s.clock,own=brawlOwn(),alive=brawlAlive(),arena=$('brawlArena'),width=arena.clientWidth||1000,height=arena.clientHeight||330,alpha=brawlAuthority()?1:Math.min(1,Math.max(0,(brawlClock()-brawlRemoteAt)/70));
 for(const f of s.fighters){const n=brawlNodes.get(f.id);if(!n)continue;const prev=brawlRemotePrev?.fighters.find(x=>x.id===f.id),x=prev&&!brawlAuthority()?prev.x+(f.x-prev.x)*alpha:f.x,y=prev&&!brawlAuthority()?prev.y+(f.y-prev.y)*alpha:f.y;
  n.actor.style.transform='translate3d('+(x/1000*width)+'px,'+(-y/360*height)+'px,0) translateX(-50%)';n.actor.style.zIndex=String(Math.round(5+y));n.art.style.scale=f.face+' 1';n.actor.classList.toggle('is-own',f.id===brawlMe());n.actor.classList.toggle('is-out',f.eliminated||f.forfeited);n.actor.classList.toggle('is-moving',f.moving&&f.y<2);n.actor.classList.toggle('is-air',f.y>2);n.actor.classList.toggle('is-jump',f.y>2);n.actor.classList.toggle('is-duck',f.guard);n.actor.classList.toggle('is-crouch',f.guard);n.actor.classList.toggle('is-hit',t<f.flash);n.actor.classList.toggle('is-windup',t-f.attackAt>=0&&t-f.attackAt<.09);n.actor.classList.toggle('is-attacking',t-f.attackAt>=.09&&t-f.attackAt<=.24);n.actor.classList.toggle('is-punch',t-f.attackAt>=.09&&t-f.attackAt<=.24);n.actor.classList.toggle('is-recovery',t-f.attackAt>.24&&t-f.attackAt<.5);n.actor.classList.toggle('is-beam-hit',t<f.flash&&f.hitKind==='beam');n.actor.classList.toggle('is-stomp',t<f.stompUntil);n.actor.classList.toggle('is-charging',!f.beamFired&&!f.eliminated);n.actor.classList.toggle('is-beaming',f.beamFired&&t<f.beamUntil&&!f.eliminated);n.row.classList.toggle('is-out',f.eliminated||f.forfeited);n.row.classList.toggle('is-own',f.id===brawlMe());
  n.beam.style.width=(460/1000*width)+'px';n.beam.style.left='58%';n.beam.style.right='auto';n.beam.style.transform=f.beamFace<0?'scaleX(-1)':'';n.fill.style.width=(f.hp/(f.maxHp||100)*100)+'%';brawlText(n.hp,f.eliminated?'OUT':Math.ceil(f.hp));brawlText(n.label,t<f.labelUntil?f.label:'');if(n.label.dataset.flash!==String(f.flash)&&t<f.flash){n.label.dataset.flash=String(f.flash);n.label.classList.remove('is-pop');void n.label.offsetWidth;n.label.classList.add('is-pop');}
  const cue=!f.beamFired?'charge:'+f.beamChargeAt:t<f.beamUntil?'beam:'+f.beamUntil:'';if(cue&&brawlSoundSeen.get(f.id)!==cue){brawlSoundSeen.set(f.id,cue);if(typeof beep==='function')beep(!f.beamFired?410:920,!f.beamFired?.07:.16);}
 }
 brawlRenderOrbs(alpha,width,height);
 brawlText($('brawlClock'),s.sudden?'한 대':Math.max(0,Math.ceil(45-t)));brawlText($('brawlClockCaption'),s.sudden?'SUDDEN DEATH':alive.length+' / '+s.fighters.length+' ALIVE');brawlText($('brawlNotice'),s.notice);
 const overlay=$('brawlOverlay');overlay.hidden=s.phase==='fight';
 if(s.phase==='lobby'){brawlText($('brawlOverlayTitle'),'READY?');brawlText($('brawlOverlaySub'),'참가 준비 '+s.readyIds.length+' / '+s.participants.length);}
 if(s.phase==='countdown'){brawlText($('brawlOverlayTitle'),Math.max(1,Math.ceil(s.countdown)));brawlText($('brawlOverlaySub'),'내 캐릭터를 확인하세요! 점프 · 공격 · 숙이기 · 에네르기파');}
 if(s.phase==='finished'){const win=s.fighters.find(f=>f.id===s.winnerId);brawlText($('brawlOverlayTitle'),win?win.name+' 우승!':'난투 종료');brawlText($('brawlOverlaySub'),win?'오늘 점심: '+win.menu+' · '+s.reason:s.reason);}
 const can=own&&!own.eliminated&&!own.forfeited&&s.phase==='fight';brawlText($('brawlOwnName'),own?(own.eliminated?'탈락 · 관전 중':own.name+' · '+own.menu):'관전 중');brawlText($('brawlOwnHint'),own&&!own.eliminated?'이동 A/D · 2단 점프 W · 밀치기 F · 찍기/숙이기 S · 불덩이 E':'남은 밥그릇들을 지켜보세요.');
 const cool=own?Math.max(0,own.beamReadyAt-t):0;brawlText($('brawlBeamStatus'),own?'기력 '+Math.floor(own.energy)+' / 100':'');brawlText($('brawlBeamCooldown'),!own?'관전 중':cool>.05?cool.toFixed(1)+'초':'E · 기력 40');
 document.querySelectorAll('[data-brawl-action]').forEach(b=>b.disabled=!can||(b.dataset.brawlAction==='beam'&&(own.energy<40||cool>.05||!own.beamFired||t<own.beamUntil)));$('brawlReadyBtn').hidden=s.phase!=='lobby'||!own;$('brawlReadyBtn').disabled=s.readyIds.includes(brawlMe());
}
function brawlAnimate(){if(!brawlState)return;brawlRender();brawlFrame=requestAnimationFrame(brawlAnimate);}
function brawlCancel(){for(const node of brawlOrbNodes.values())node.remove();brawlOrbNodes.clear();brawlClearHeld();clearInterval(brawlTimer);cancelAnimationFrame(brawlFrame);brawlTimer=brawlFrame=0;brawlState=null;brawlRemotePrev=null;brawlAccumulator=0;brawlInputs.clear();brawlInputAt.clear();brawlInputSeq.clear();brawlSoundSeen.clear();brawlNodes.clear();const view=$('brawlView');if(view)view.hidden=true;}
function brawlTyping(e){return e.target?.matches?.('input,textarea,select,[contenteditable="true"]')||!!document.querySelector('dialog[open]');}
document.addEventListener('keydown',e=>{if(!brawlState||$('brawlView')?.hidden||!brawlKeys[e.code]||brawlTyping(e))return;e.preventDefault();e.stopImmediatePropagation();const own=brawlOwn();if(!own||own.eliminated||brawlState.phase!=='fight'||e.repeat||brawlLocalKeys.has(e.code))return;brawlLocalKeys.add(e.code);const action=brawlKeys[e.code];if(brawlHeld.includes(action))brawlQueueFlush();else brawlSend(action,true);},true);
document.addEventListener('keyup',e=>{if(!brawlKeys[e.code])return;const had=brawlLocalKeys.delete(e.code);if(brawlState&&!brawlTyping(e)){e.preventDefault();e.stopImmediatePropagation();}if(had)brawlQueueFlush();},true);
document.addEventListener('pointerdown',e=>{if(!brawlState||$('brawlView')?.hidden)return;const b=e.target?.closest?.('[data-brawl-action]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();if(b.disabled||brawlState.phase!=='fight'||e.pointerType==='mouse'&&e.button!==0)return;try{b.setPointerCapture(e.pointerId);}catch{}const action=b.dataset.brawlAction;brawlPointerInputs.set(e.pointerId,{action,button:b});b.classList.add('is-held');if(brawlHeld.includes(action))brawlQueueFlush();else brawlSend(action,true);},true);
function brawlPointerUp(e){const v=brawlPointerInputs.get(e.pointerId);if(!v)return;e.preventDefault();e.stopImmediatePropagation();brawlPointerInputs.delete(e.pointerId);v.button.classList.remove('is-held');brawlQueueFlush();}
window.addEventListener('pointerup',brawlPointerUp,true);window.addEventListener('pointercancel',brawlPointerUp,true);document.addEventListener('lostpointercapture',brawlPointerUp,true);
document.addEventListener('click',e=>{const b=e.target?.closest?.('[data-brawl-action]');if(!b||!brawlState)return;e.preventDefault();e.stopImmediatePropagation();if(e.detail===0&&!b.disabled&&!brawlHeld.includes(b.dataset.brawlAction))brawlSend(b.dataset.brawlAction,true);},true);
window.addEventListener('blur',()=>{if(brawlState)brawlClearHeld();});document.addEventListener('visibilitychange',()=>{if(brawlState&&document.hidden)brawlClearHeld();});setInterval(()=>{if(brawlState?.phase==='fight'&&brawlOwn()&&!brawlOwn().eliminated)brawlFlush();},200);
/* END_GROUP_BRAWL_V1 */


/* GROUP_BRAWL_ROOM_V1 */
let groupRoom=null,groupLobby=null,groupFightId='',groupInputSeq=0,groupInputSeen={},groupLastPublish=0,groupFinishTimer=0,groupFinishing=false;
function groupGetState(){return groupRoom?netCopy(groupRoom):null;}
function groupEnsureUI(){if(groupLobby)return;groupLobby=el('section','group-lobby');groupLobby.id='groupBrawlLobby';groupLobby.hidden=true;groupLobby.innerHTML='<div class="group-mast">LUNCH THRONE · MULTIPLAYER BRAWL</div><div class="group-lobby-body"><span class="group-eyebrow">점심 왕좌, 다시 도전!</span><h2 tabindex="-1" id="groupLobbyTitle">1등 쟁탈전</h2><p>참가할 사람은 내 메뉴를 고르고 준비해주세요.<br>최대 8명이 함께 싸우고, 마지막 생존자가 메뉴를 가져갑니다.</p><div id="groupReadyRoster" class="group-ready-roster"></div><div class="group-my-choice"><label for="groupMenuSelect">내가 걸고 싸울 메뉴</label><select id="groupMenuSelect"></select><div class="group-reply-buttons"><button id="groupJoinBtn" class="btn primary" type="button">이 메뉴로 참가 · 준비 완료</button><button id="groupPassBtn" class="btn" type="button">이번엔 관전</button></div><p id="groupReadyNote" role="status"></p></div><button id="groupCancelBtn" class="link-btn" type="button">쟁탈전 취소 · 기존 점심 유지</button></div>';
 $('resultView').parentElement.append(groupLobby);$('groupJoinBtn').addEventListener('click',()=>netRoom.send({t:'brawlReply',brawlId:groupRoom?.id,response:'join',menu:$('groupMenuSelect').value}));$('groupPassBtn').addEventListener('click',()=>netRoom.send({t:'brawlReply',brawlId:groupRoom?.id,response:'pass'}));$('groupCancelBtn').addEventListener('click',()=>netRoom.send({t:'brawlCancel',brawlId:groupRoom?.id}));}
function groupShowInvite(){groupEnsureUI();if(typeof deptCancel==='function')deptCancel();cancelActionDuel();brawlCancel();mode='brawlInvite';playLayout(true);setStep(3);for(const id of ['setupView','raceView','resultView','duelView'])$(id).hidden=true;groupLobby.hidden=false;
 const self=groupRoom?.members.find(m=>m.id===netSelfId()),roster=$('groupReadyRoster');roster.replaceChildren();for(const m of groupRoom?.members||[]){const row=el('div','group-ready-card');row.dataset.ready=String(m.response==='join');row.append(el('strong','',m.name+(m.id===netSelfId()?' · 나':'')),el('span','',m.response==='join'?'READY ✓ · '+m.menu:m.response==='pass'?'이번엔 관전':'준비 중'));roster.append(row);}
 const select=$('groupMenuSelect'),previous=select.value;select.replaceChildren();for(const name of self?.menus||[]){const o=el('option','',name);o.value=name;select.append(o);}select.value=self?.menu||previous||self?.menus[0]||'';$('groupJoinBtn').disabled=!self||!self.menus.length;$('groupJoinBtn').textContent=self?.response==='join'?'참가 준비 완료 ✓ · 메뉴 변경 가능':'이 메뉴로 참가 · 준비 완료';$('groupPassBtn').textContent=self?.response==='pass'?'관전 선택 완료 ✓':'이번엔 관전';const n=groupRoom?.members.filter(m=>m.response==='pending').length||0;$('groupReadyNote').textContent=n?'아직 '+n+'명이 참가 여부를 선택하고 있어요.':'2명 이상 참가하면 자동 시작해요. 참가 여부를 바꿀 수 있어요.';$('groupCancelBtn').hidden=!(netIsHost()||groupRoom?.creatorId===netSelfId());$('dossierStatus').textContent='1등 쟁탈전 · 준비 대기';}
function groupOpenLocalInvite(){if(netPhase==='result')netRoom.send({t:'brawlInvite'});}
function groupInvite(senderId){if(!netIsHost()||netPhase!=='result'||!result)return;groupRoom={id:'brawl_'+Date.now()+'_'+rand(100000),creatorId:senderId,automatic:false,championId:result.winnerId,members:netMembers().map(m=>({id:m.id,name:m.name,department:netDepartment(m.id),menus:[...(netPicks[m.id]||[])],menu:'',response:'pending'})),spec:null};groupFightId='';groupInputSeen={};groupFinishing=false;netPhase='brawlInvite';groupShowInvite();netPublish();}
function groupAutoRace(){
 if(!netIsHost()||!result||!netSpec)return;const current=new Set(netMembers().map(m=>m.id));const participants=netSpec.participants.filter(p=>current.has(p.id));if(participants.length<2){groupResetToSetup();return;}
 groupRoom={id:'brawl_'+result.id,creatorId:netSelfId(),automatic:true,championId:result.winnerId,members:participants.map(p=>({id:p.id,name:p.name,department:p.department,menus:[...(netPicks[p.id]||[])],menu:p.menu,response:'join'})),spec:null};groupStart();
}
function groupStart(){if(!netIsHost()||!groupRoom)return;const joined=groupRoom.members.filter(m=>m.response==='join'&&netMembers().some(p=>p.id===m.id));if(joined.length<2)return;groupRoom.spec={id:groupRoom.id,championId:groupRoom.championId,participants:joined.map(m=>({id:m.id,name:m.name,menu:m.menu,department:m.department})),readyIds:joined.map(m=>m.id)};groupFinishing=false;groupInputSeen={};groupFightId=groupRoom.id;netPhase='brawl';mode='brawl';groupLobby&&(groupLobby.hidden=true);cancelActionDuel();netApplying=true;try{brawlPrepare(groupRoom.spec);brawlSetReady(groupRoom.spec.readyIds);brawlStart();}finally{netApplying=false;}netPublish();}
function groupMaybeStart(){if(!groupRoom||groupRoom.members.some(m=>m.response==='pending'))return;if(groupRoom.members.filter(m=>m.response==='join').length>=2)groupStart();}
function groupResetToSetup(){netPhase='setup';result=null;netReady={};groupCancel();netRoom.setLocked(false);showSetup();netPublish();}
function groupRestoreResult(){groupCancel();if(result&&netMembers().some(m=>m.id===result.winnerId)){netPhase='result';renderResult();netPublish();}else groupResetToSetup();}
function groupHandle(senderId,cmd){
 if(!netIsHost())return false;
 if(['brawlInvite','challenge'].includes(cmd.t)){if(netPhase==='result')groupInvite(senderId);return true;}
 if(!['brawlReply','brawlCancel','brawlInput'].includes(cmd.t))return false;
 if(!groupRoom||cmd.brawlId!==groupRoom.id)return true;const member=groupRoom.members.find(m=>m.id===senderId);if(!member)return true;
 if(cmd.t==='brawlReply'&&netPhase==='brawlInvite'){if(cmd.response==='join'&&typeof cmd.menu==='string'&&member.menus.includes(cmd.menu)){member.response='join';member.menu=cmd.menu;}else if(cmd.response==='pass'){member.response='pass';member.menu='';}else return true;groupShowInvite();netPublish();groupMaybeStart();return true;}
 if(cmd.t==='brawlCancel'&&netPhase==='brawlInvite'&&(senderId===groupRoom.creatorId||senderId===netSelfId())){groupRestoreResult();return true;}
 if(cmd.t==='brawlInput'&&netPhase==='brawl'&&member.response==='join'&&Number.isSafeInteger(cmd.seq)&&cmd.seq>(groupInputSeen[senderId]||0)&&['left','right','jump','attack','duck','guard','beam','sync'].includes(cmd.action)){groupInputSeen[senderId]=cmd.seq;brawlHostInput(senderId,{action:cmd.action,held:cmd.held,seq:cmd.seq});return true;}
 return true;
}
function netBrawlInput(action,held){if(netPhase==='brawl'&&groupRoom)netRoom.send({t:'brawlInput',brawlId:groupRoom.id,seq:++groupInputSeq,action,held});}
function netBrawlReady(){/* The first battle inherits the already confirmed lunch readiness. */}
function netBrawlPublish(force=false){if(!netIsHost()||netApplying||netPhase!=='brawl')return;const now=performance.now();if(!force&&now-groupLastPublish<50)return;groupLastPublish=now;netPublish();}
function netBrawlFinished(winnerId,reason){
 if(!netIsHost()||netPhase!=='brawl'||!groupRoom||groupFinishing)return;const winner=groupRoom.members.find(m=>m.id===winnerId&&m.response==='join');if(!winner||!netMembers().some(m=>m.id===winnerId))return;groupFinishing=true;groupRoom.winnerId=winnerId;groupRoom.reason=String(reason||'마지막 생존자');netBrawlPublish(true);const id=groupRoom.id;
 clearTimeout(groupFinishTimer);groupFinishTimer=setTimeout(()=>{if(!netIsHost()||netPhase!=='brawl'||groupRoom?.id!==id)return;if(!netMembers().some(m=>m.id===winnerId)){groupResetToSetup();return;}result={...result,person:winner.name,menu:winner.menu,winnerId,time:new Date().toISOString(),source:'duel',brawlId:id,duelCount:(result.duelCount||0)+1,verdict:'1등 쟁탈전 · '+winner.name+' 승리 · '+groupRoom.reason,nominations:result.nominations.filter(n=>netMembers().some(m=>m.id===n.id))};saveRound();netPhase='result';renderResult();netPublish();},2200);
}
function groupReceive(meta,fight){if(!meta)return;const previous=groupRoom?.id;groupRoom=netCopy(meta);if(netPhase==='brawlInvite'){groupFightId='';groupShowInvite();return;}if(netPhase==='brawl'&&groupRoom.spec){groupLobby&&(groupLobby.hidden=true);mode='brawl';if(previous!==groupRoom.id||groupFightId!==groupRoom.id){brawlPrepare(groupRoom.spec);groupFightId=groupRoom.id;}if(fight)brawlReceive(fight);}}
function groupPresence(event){
 if(!['brawlInvite','brawl'].includes(netPhase))return false;if(event.kind!=='leave'){netPublish();return true;}const id=event.memberId;delete netPicks[id];delete netReady[id];delete netDepartments[id];netSyncRoster();
 if(netPhase==='brawlInvite'){if(netMembers().length<2){groupResetToSetup();return true;}groupRoom.members=groupRoom.members.filter(m=>m.id!==id);groupShowInvite();netPublish();groupMaybeStart();return true;}
 if(groupFinishing){if(groupRoom.winnerId===id){groupResetToSetup();return true;}groupRoom.members=groupRoom.members.filter(m=>m.id!==id);netBrawlPublish(true);return true;}groupRoom.members=groupRoom.members.filter(m=>m.id!==id);brawlRemoveMember(id);netBrawlPublish(true);notify('나간 참가자는 기권 처리했어요. 남은 사람들이 계속 싸웁니다.');return true;
}
function groupCancel(){clearTimeout(groupFinishTimer);groupFinishTimer=0;groupFinishing=false;groupRoom=null;groupFightId='';groupInputSeen={};groupLobby&&(groupLobby.hidden=true);if(typeof brawlCancel==='function')brawlCancel();}
const groupPreviousSetup=showSetup;showSetup=function(){groupCancel();return groupPreviousSetup();};
const groupPreviousResult=renderResult;renderResult=function(){groupCancel();const out=groupPreviousResult();$('objectBtn').hidden=false;$('objectBtn').textContent='1등 쟁탈전 다시 도전';return out;};
netRoom.onDisconnect(event=>{if(event.self||event.hostLost)groupCancel();});


