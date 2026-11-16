


/* MENU_TOURNAMENT_UI_V1 */
function arcadeDisplayName(p,s=arcadeState){return s?.purpose==='lunch'?(s.members.find(m=>m.id===p.id)?.menu||p.name):p.name;}
function menuTournamentEnsureView(){
 if($('menuTournamentView'))return;
 const view=el('section','menu-tournament-view');view.id='menuTournamentView';view.hidden=true;view.setAttribute('aria-label','전원 누적 점수전 진행');
 view.innerHTML='<span class="menu-tournament-kicker">FIVE ROUNDS · EVERYONE PLAYS</span><h2>다 같이 5판, 끝까지 함께!</h2><p>매판 게임은 랜덤! 다섯 판의 순위 점수를 합산해 최종 순위를 정해요.<br>동점은 공동 순위, 점심 메뉴는 공동 1위 중 추첨합니다.</p><div class="menu-tournament-progress"><strong id="menuTournamentRound"></strong><span id="menuTournamentCount"></span></div><div id="menuTournamentCandidates" class="menu-tournament-candidates"></div><button id="menuTournamentResumeBtn" class="btn primary" type="button">경기 화면 열기 →</button><small id="menuTournamentPauseNote" role="status">경기 화면을 접으면 모두 일시정지해요. 다시 열면 남은 시간부터 이어집니다.</small>';
 $('game').append(view);$('menuTournamentResumeBtn').addEventListener('click',()=>{if(arcadeState?.purpose==='lunch')arcadeOpen();});
}
function menuTournamentRenderBackground(){
 const s=arcadeState;menuTournamentEnsureView();const view=$('menuTournamentView');view.hidden=netPhase!=='menuTournament';if(view.hidden||!s||s.purpose!=='lunch')return;
 const key=s.id+':'+s.round+':'+s.phase+':'+s.activeIds.join(',')+':'+s.lastGame+':'+JSON.stringify(s.totalPoints)+':'+(s.pauseSeq||0);if(view.dataset.key===key)return;view.dataset.key=key;
 arcadeSetText('menuTournamentRound',('ROUND '+Math.min(s.pointRoundLimit||5,(s.pointRounds||0)+1)+' / '+(s.pointRoundLimit||5))+' · '+(arcadeGames[s.world?.game]?.name||'랜덤 게임'));
 arcadeSetText('menuTournamentCount',s.activeIds.length+'명 함께 참여 · '+(arcadeIsPaused(s)?'일시정지':'누적 점수'));
 const paused=arcadeIsPaused(s),names=(s.pausedBy||[]).map(id=>s.members.find(m=>m.id===id)?.name||'참가자').join(' · '),ownPause=s.pausedBy?.includes(arcadeSelf());
 arcadeSetText('menuTournamentResumeBtn',ownPause?'경기 이어하기 →':paused?'일시정지된 경기 보기 →':'경기 화면 열기 →');
 arcadeSetText('menuTournamentPauseNote',paused?names+' 님이 경기 화면을 접었어요. 모두 다시 열면 남은 시간부터 이어져요.':'경기 화면을 접으면 모두 일시정지해요. 다시 열면 남은 시간부터 이어집니다.');
 const list=$('menuTournamentCandidates');list.replaceChildren();for(const m of [...s.members].sort((a,b)=>(s.totalPoints?.[b.id]||0)-(s.totalPoints?.[a.id]||0))){const card=el('div','menu-tournament-candidate');card.classList.toggle('is-out',m.left||m.forfeited);card.append(el('span','',actionFood(m.menu)),el('b','',m.menu),el('small','',m.name+(m.id===arcadeSelf()?' · 내 메뉴':'')),el('strong','',m.left?'퇴장':(s.totalPoints?.[m.id]||0)+'점'));list.append(card);}
}
function netRenderMenuTournament(){menuTournamentRenderBackground();}
function scoreResultStandings(value=result){
 if(Array.isArray(value?.scoreStandings))return value.scoreStandings;
 const rows=(value?.nominations||[]).map(n=>({id:n.id,name:n.person,menu:n.menus?.[0]||'',points:value?.leagueScores?.[n.id]||0})).sort((a,b)=>b.points-a.points);let rank=0,last=null;return rows.map((row,index)=>{if(row.points!==last)rank=index+1;last=row.points;return {...row,rank};});
}
function scoreResultChampionNames(value=result){const ids=value?.scoreChampionIds||[];return scoreResultStandings(value).filter(row=>ids.includes(row.id)).map(row=>row.name);}
const menuTournamentResultBase=renderResult;
renderResult=function(...args){
 const out=menuTournamentResultBase(...args);$('resultView').dataset.lunchFlow=String(!!result?.tournamentHistory);const heading=$('resultView').querySelector('.result-details h3');if(heading)heading.textContent=result?.leagueFormat==='points'?'최종 점수와 순위를 확인해주세요':result?.provisional?'우승 메뉴를 확인해주세요':'오늘 점심, 이걸로 확정!';$('resultNominations').hidden=result?.leagueFormat==='points';$('menuTournamentView')&&($('menuTournamentView').hidden=true);
 if($('menuTournamentResultLedger'))$('menuTournamentResultLedger').hidden=true;
 if(result?.source!=='tournament'&&!result?.tournamentHistory)return out;
 $('objectBtn').hidden=true;$('duelVerdict').hidden=false;$('duelVerdict').textContent='전원 '+(result.leagueRounds||5)+'판 누적 점수전 완료'+(result.duelCount?' · 메뉴 이의전 '+result.duelCount+'회 · 최종 순위 유지':'')+' · 현재 점심 메뉴 '+result.menu;
 let ledger=$('menuTournamentResultLedger');if(!ledger){ledger=el('section','menu-tournament-ledger');ledger.id='menuTournamentResultLedger';$('resultNominations').before(ledger);}ledger.hidden=false;ledger.replaceChildren(el('b','','우승 메뉴가 올라온 과정'));
 if(result.leagueFormat==='points'){
  ledger.firstChild.textContent='누적 점수로 결정된 최종 순위';const standings=scoreResultStandings(),table=el('table','score-result-table');table.setAttribute('aria-label',(result.leagueRounds||5)+'판 최종 누적 점수 순위');const head=el('thead'),header=el('tr');for(const label of ['순위','참가자 · 메뉴','점수']){const th=el('th','',label);th.scope='col';header.append(th);}head.append(header);const body=el('tbody');for(const row of standings){const shared=row.rank!==null&&standings.filter(other=>other.rank===row.rank).length>1,line=el('tr',row.rank===1?'score-first':''),person=el('td');person.append(el('strong','',row.name),el('small','',row.menu));line.append(el('td','',row.left?'퇴장':row.forfeited?'기권':(shared?'공동 ':'')+row.rank+'위'),person,el('td','',row.points+'점'));body.append(line);}table.append(head,body);ledger.append(table);
  if(result.tieReason)ledger.append(el('p','',result.tieReason+' · 공동 순위는 그대로 유지해요.'));
  ledger.append(el('p','','메뉴 이의전은 점심 메뉴만 바꿀 수 있어요. 이 최종 점수와 순위는 유지됩니다.'));
 }else for(const h of result.tournamentHistory||[]){const names=(h.outIds||[]).map(id=>{const m=result.nominations.find(n=>n.id===id);return m?.menus?.[0]||m?.person||'메뉴';});ledger.append(el('p','','R'+h.round+' · '+(arcadeGames[h.game]?.name||'랜덤 게임')+' → '+(names.length?names.join(', ')+' 탈락':'동점 재경기')));}
 return out;
};
/* END_MENU_TOURNAMENT_UI_V1 */

const menuTournamentSetupLabels=renderSetup;
renderSetup=function(){const out=menuTournamentSetupLabels.apply(this,arguments);const desc=$('netPassiveDesc');if(desc)desc.textContent='다섯 판을 함께할 내 캐릭터예요. 누적 점수로 최종 순위를 정해요.';return out;};
const menuTournamentTrayButtons=trayUpdateButtons;
trayUpdateButtons=function(){menuTournamentTrayButtons();for(const id of ['trayRoomBtn','trayResultBtn']){const b=$(id);if(b&&netPhase!=='result'||b&&result?.tournamentHistory)b.hidden=true;}};

/* COFFEE_DELIVERY_V1 */
let deliveryState=null,deliveryDeadline=0,deliveryClockOffset=0,deliverySendSeq=0,deliveryUiId='',deliveryPanel=null,deliveryRosterKey='',deliveryOrdersKey='',deliveryScrolledId='',deliveryTargetsKey='';
let deliveryStageActive=false,deliveryStageHome=null,deliveryStageSibling=null,deliveryStageReturnFocus=null,deliveryStageFocusKey='',deliveryStageBackdrop=null;
const deliveryStageInert=[];
const deliverySeen=new Map(),deliveryDrinks=['아이스 아메리카노','따뜻한 아메리카노','카페라테','디카페인','차'];
function deliveryClone(v){return v?JSON.parse(JSON.stringify(v)):null;}
function deliveryDrink(value){if(typeof value!=='string')return null;const s=value.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();return s&&Array.from(s).length<=20?s:null;}
function deliveryCurrent(){return !!deliveryState&&netIsActive()&&deliveryState.roomCode===String(netRoom.code||'')&&result?.id===deliveryState.roundId;}
function deliveryCancel(){deliverySetStage(false);deliveryState=null;deliveryDeadline=0;deliveryClockOffset=0;deliverySendSeq=0;deliveryUiId='';deliverySeen.clear();deliveryRosterKey='';deliveryOrdersKey='';deliveryScrolledId='';deliveryTargetsKey='';if(deliveryPanel)deliveryPanel.hidden=true;}
function deliveryPublish(){if(netIsHost()&&!netApplying)netPublish();}
function deliveryChanged(){if(deliveryState)deliveryState.seq++;deliveryRender();deliveryPublish();}
function deliveryCandidates(){return deliveryState?.members.filter(m=>m.response==='join'&&!m.left)||[];}
function deliveryStart(roundId,members=netMembers()){
 if(!netIsHost()||!netIsActive()||typeof roundId!=='string'||result?.id!==roundId)return false;
 if(deliveryCurrent()&&deliveryState.roundId===roundId)return true;
 const present=new Set(netMembers().map(m=>m.id)),list=(Array.isArray(members)?members:[]).filter(m=>m&&typeof m.id==='string'&&typeof m.name==='string'&&present.has(m.id)).slice(0,8);
 if(!list.length||new Set(list.map(m=>m.id)).size!==list.length)return false;
 deliveryCancel();deliveryState={id:'delivery_'+Date.now()+'_'+rand(1000000),roundId,roomCode:String(netRoom.code||''),seq:0,phase:'invite',members:list.map(m=>({id:m.id,name:m.name,response:'pending',drink:'',left:false})),winnerId:'',holderId:'',previousHolderId:'',startAt:0,passReadyAt:0,passes:0,needsRedraw:false,notice:'커피를 마실 사람은 메뉴를 고르고, 안 마실 사람은 패스를 골라주세요.'};
 deliveryEnsureUI();deliveryChanged();return true;
}
function deliveryFinish(winnerId,notice=''){
 const s=deliveryState;if(!s||!netIsHost())return;
 const winner=deliveryCandidates().find(m=>m.id===winnerId);s.phase='done';s.winnerId=winner?.id||'';s.holderId='';s.previousHolderId='';s.passReadyAt=0;s.needsRedraw=false;deliveryDeadline=0;
 s.notice=notice||(winner?winner.name+' 님 컵이 터졌어요! 오늘의 커피 배달 담당입니다. 참가자들이 고른 음료를 함께 가져와주세요.':'오늘은 모두 커피 패스! 배달 담당도 없어요.');
}
function deliveryBeginBomb(){
 const s=deliveryState;if(!netIsHost()||!s)return;const joined=deliveryCandidates();s.winnerId='';s.needsRedraw=false;s.previousHolderId='';s.passes=0;s.startAt=0;
 if(joined.length<2){deliveryFinish(joined[0]?.id||'',joined.length?joined[0].name+' 님만 커피에 참가했어요. 오늘은 내 음료를 직접 가져와요 ☕':'');return;}
 const now=Date.now();s.phase='spin';s.startAt=now;s.holderId=joined[rand(joined.length)].id;s.passReadyAt=now+650;
 // The fuse exists only on the host. Passing or losing a participant never resets it.
 deliveryDeadline=now+7000+rand(19001);s.notice='컵이 터질 때 들고 있으면 커피 배달 담당! 내 차례에는 받을 사람을 눌러요.';
}
function deliveryMaybeSpin(){
 const s=deliveryState;if(!netIsHost()||!s||s.phase!=='invite'||s.members.some(m=>m.response==='pending'&&!m.left))return;
 deliveryBeginBomb();deliveryChanged();
}
function deliveryHandle(senderId,cmd){
 if(typeof cmd?.t!=='string'||!cmd.t.startsWith('delivery'))return false;
 if(!netIsHost()||!deliveryCurrent()||!netMembers().some(m=>m.id===senderId))return true;
 const s=deliveryState,m=s.members.find(m=>m.id===senderId);
 if(!m||m.left||cmd.deliveryId!==s.id||cmd.roundId!==s.roundId||!Number.isSafeInteger(cmd.seq)||cmd.seq<1||cmd.seq<=(deliverySeen.get(senderId)||0))return true;
 if(cmd.t==='deliveryThrow'&&s.phase==='spin'){
  const now=Date.now();if(now>=deliveryDeadline){deliveryFinish(s.holderId);deliveryChanged();return true;}
  const joined=deliveryCandidates(),target=joined.find(p=>p.id===cmd.targetId),present=new Set(netMembers().map(p=>p.id));
  if(senderId!==s.holderId||m.response!=='join'||!target||target.id===senderId||!present.has(target.id)||now<s.passReadyAt||joined.length>2&&target.id===s.previousHolderId)return true;
  deliverySeen.set(senderId,cmd.seq);s.previousHolderId=senderId;s.holderId=target.id;s.passReadyAt=now+650;s.passes++;s.notice=m.name+' → '+target.name+' 님에게 컵 배달!';deliveryChanged();return true;
 }
 if(cmd.t==='deliveryReply'&&s.phase==='invite'&&['join','pass'].includes(cmd.response)){
  const drink=cmd.response==='join'?deliveryDrink(cmd.drink):'';if(cmd.response==='join'&&!drink)return true;
  deliverySeen.set(senderId,cmd.seq);m.response=cmd.response;m.drink=drink;s.notice=m.name+' 님 '+(m.response==='join'?'커피 참가!':'커피 패스!');deliveryChanged();deliveryMaybeSpin();return true;
 }
 if(cmd.t==='deliveryRedraw'&&senderId===netSelfId()&&s.phase==='done'&&s.needsRedraw&&deliveryCandidates().length){
  deliverySeen.set(senderId,cmd.seq);deliveryBeginBomb();deliveryChanged();return true;
 }
 return true;
}
function deliveryPublicState(s){return deliveryClone({id:s.id,roundId:s.roundId,roomCode:s.roomCode,seq:s.seq,phase:s.phase,members:s.members.map(m=>({id:m.id,name:m.name,response:m.response,drink:m.drink,left:m.left})),winnerId:s.winnerId,holderId:s.holderId,previousHolderId:s.previousHolderId,startAt:s.startAt,passReadyAt:s.passReadyAt,passes:s.passes,needsRedraw:s.needsRedraw,notice:s.notice});}
function deliveryGetState(){if(!deliveryCurrent()){if(deliveryState)deliveryCancel();return null;}return {...deliveryPublicState(deliveryState),serverNow:Date.now()};}
function deliveryValidate(data){
 if(!data||typeof data.id!=='string'||data.id.length>100||typeof data.roundId!=='string'||data.roundId!==result?.id||data.roomCode!==String(netRoom.code||'')||!Number.isSafeInteger(data.seq)||data.seq<0||!['invite','spin','done'].includes(data.phase)||!Array.isArray(data.members)||data.members.length<1||data.members.length>8||typeof data.winnerId!=='string'||typeof data.holderId!=='string'||typeof data.previousHolderId!=='string'||!Number.isFinite(data.startAt)||data.startAt<0||!Number.isFinite(data.passReadyAt)||data.passReadyAt<0||!Number.isSafeInteger(data.passes)||data.passes<0||typeof data.notice!=='string'||data.notice.length>300||typeof data.needsRedraw!=='boolean')return false;
 if(data.members.some(m=>!m||typeof m.id!=='string'||!m.id||m.id.length>128||typeof m.name!=='string'||!m.name||Array.from(m.name).length>24||!['pending','join','pass'].includes(m.response)||typeof m.left!=='boolean'||(m.response==='join'?deliveryDrink(m.drink)!==m.drink:m.drink!==''))||new Set(data.members.map(m=>m.id)).size!==data.members.length)return false;
 if(data.phase!=='done'&&data.winnerId)return false;
 if(data.winnerId&&!data.members.some(m=>m.id===data.winnerId&&m.response==='join'&&!m.left))return false;
 if(data.previousHolderId&&!data.members.some(m=>m.id===data.previousHolderId))return false;
 if(data.needsRedraw&&(data.phase!=='done'||data.winnerId||!data.members.some(m=>m.response==='join'&&!m.left)))return false;
 if(data.phase==='spin'&&(!data.startAt||data.needsRedraw||data.members.some(m=>m.response==='pending'&&!m.left)||data.members.filter(m=>m.response==='join'&&!m.left).length<2||!data.members.some(m=>m.id===data.holderId&&m.response==='join'&&!m.left)))return false;
 if(data.phase!=='spin'&&(data.holderId||data.previousHolderId||data.passReadyAt))return false;
 return true;
}
function deliveryReceive(data){
 if(netIsHost())return false;if(!data){deliveryCancel();return false;}if(!deliveryValidate(data))return false;
 if(deliveryState?.id===data.id&&data.seq<deliveryState.seq)return false;const fresh=deliveryState?.id!==data.id;deliveryState=deliveryPublicState(data);deliveryDeadline=0;deliveryClockOffset=Number.isFinite(data.serverNow)?data.serverNow-Date.now():0;
 if(fresh){deliverySendSeq=0;deliveryUiId='';deliverySeen.clear();deliveryRosterKey='';deliveryOrdersKey='';deliveryTargetsKey='';}
 deliveryEnsureUI();deliveryRender();return true;
}
function deliverySend(cmd){if(!deliveryState)return;netRoom.send({...cmd,deliveryId:deliveryState.id,roundId:deliveryState.roundId,seq:++deliverySendSeq});}
function deliveryStageChatContains(node){return !!node&&!!document.getElementById('roomChatDock')?.contains(node);}
function deliveryStageFocusable(){
 const dock=document.getElementById('roomChatDock'),selector='button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])';
 return [deliveryPanel,dock].filter(Boolean).flatMap(root=>[...root.querySelectorAll(selector)]).filter(n=>!n.hidden&&!n.closest('[hidden]')&&!n.closest('[inert]')&&n.getClientRects().length);
}
function deliverySetStage(active){
 if(typeof document==='undefined'||!deliveryPanel)return;
 if(active&&!deliveryStageActive){
  deliveryStageActive=true;deliveryStageHome=deliveryPanel.parentElement;deliveryStageSibling=deliveryPanel.nextSibling;deliveryStageReturnFocus=document.activeElement;deliveryStageFocusKey='';
  // Keep the coffee invite and actual game in one compact body-level popup.
  if(!deliveryStageBackdrop){deliveryStageBackdrop=document.createElement('div');deliveryStageBackdrop.className='delivery-popup-backdrop';deliveryStageBackdrop.id='coffeeDeliveryBackdrop';deliveryStageBackdrop.setAttribute('aria-hidden','true');document.body.append(deliveryStageBackdrop);}deliveryStageBackdrop.hidden=false;
  document.body.append(deliveryPanel);document.body.classList.add('delivery-game-active');deliveryPanel.dataset.popup='true';deliveryPanel.setAttribute('role','dialog');deliveryPanel.setAttribute('aria-modal','true');deliveryPanel.setAttribute('aria-describedby','deliveryPopupHelp');deliveryPanel.tabIndex=-1;
  const dock=document.getElementById('roomChatDock');for(const n of document.body.children){if(n===deliveryPanel||n===deliveryStageBackdrop||n===dock||n.contains(dock)||['SCRIPT','STYLE','LINK'].includes(n.tagName))continue;if('inert'in n){deliveryStageInert.push({node:n,value:n.inert});n.inert=true;}}
  deliveryPanel.focus({preventScroll:true});
 }else if(!active&&deliveryStageActive){
  deliveryStageActive=false;document.body.classList.remove('delivery-game-active');delete deliveryPanel.dataset.popup;deliveryPanel.removeAttribute('role');deliveryPanel.removeAttribute('aria-modal');deliveryPanel.removeAttribute('aria-describedby');if(deliveryStageBackdrop)deliveryStageBackdrop.hidden=true;for(const entry of deliveryStageInert)entry.node.inert=entry.value;deliveryStageInert.length=0;
  if(deliveryStageHome?.isConnected){deliveryStageHome.insertBefore(deliveryPanel,deliveryStageSibling?.parentNode===deliveryStageHome?deliveryStageSibling:null);}else document.getElementById('resultView')?.append(deliveryPanel);
  const prior=deliveryStageReturnFocus;deliveryStageHome=null;deliveryStageSibling=null;deliveryStageReturnFocus=null;deliveryStageFocusKey='';
  if(!deliveryStageChatContains(document.activeElement)&&prior?.isConnected&&!prior.disabled&&!prior.closest('[hidden],[inert]'))prior.focus?.({preventScroll:true});
 }
 if(active&&deliveryStageActive){
  const s=deliveryState,mine=s?.holderId===netSelfId(),ready=Date.now()+deliveryClockOffset>=(s?.passReadyAt||0),key=s?.holderId+':'+s?.passes;
  if(s?.phase==='invite'&&deliveryStageFocusKey!==s.id+':invite'&&!deliveryStageChatContains(document.activeElement)){const choice=deliveryStageFocusable().find(n=>deliveryPanel.contains(n));if(choice)choice.focus({preventScroll:true});deliveryStageFocusKey=s.id+':invite';}
  else if(mine&&ready&&deliveryStageFocusKey!==key&&!deliveryStageChatContains(document.activeElement)){const target=deliveryStageFocusable().find(n=>n.matches('[data-delivery-target]'));if(target){target.focus({preventScroll:true});deliveryStageFocusKey=key;}}
  else if(document.activeElement?.disabled&&deliveryPanel.contains(document.activeElement))deliveryPanel.focus({preventScroll:true});
 }
}
function deliveryStageKeydown(event){
 if(!deliveryStageActive||event.key!=='Tab')return;const list=deliveryStageFocusable(),current=document.activeElement,index=list.indexOf(current);event.preventDefault();
 const next=index<0?(event.shiftKey?list.length-1:0):(index+(event.shiftKey?-1:1)+list.length)%list.length;(list.length?list[next]:deliveryPanel).focus({preventScroll:true});
}
function deliveryEnsureUI(){
 if(deliveryPanel)return;const view=$('resultView');if(!view)return;
 deliveryPanel=el('section','coffee-delivery');deliveryPanel.id='coffeeDeliveryPanel';deliveryPanel.hidden=true;deliveryPanel.setAttribute('aria-labelledby','deliveryTitle');
 deliveryPanel.innerHTML='<header class="delivery-head"><div><span>AFTER LUNCH · 자율 참가</span><h3 id="deliveryTitle">커피는 자유 참가 ☕</h3><p>마실 메뉴를 고르면, 참가자 중 한 명이 커피 배달 담당!</p></div><b class="delivery-cup" aria-hidden="true">☕</b></header><div class="delivery-body"><div class="delivery-main"><div id="deliveryPick" class="delivery-pick"><label for="deliveryDrinkSelect">내 커피 메뉴</label><select id="deliveryDrinkSelect" aria-label="내 커피 메뉴"></select><input id="deliveryCustomDrink" type="text" maxlength="40" placeholder="마실 메뉴 · 20자까지" aria-label="직접 입력할 커피 메뉴" hidden><div class="delivery-choice-actions"><button id="deliveryJoinBtn" class="btn primary" type="button">이 메뉴로 커피 참가</button><button id="deliveryPassBtn" class="btn" type="button">이번엔 안 마실래</button></div><small id="deliveryMyChoice"></small></div><div id="deliveryDraw" class="delivery-draw" hidden><span id="deliveryDrawCaption"></span><strong id="deliveryDrawName"></strong><small id="deliveryDrawHint"></small><button id="deliveryRedrawBtn" class="btn primary" type="button" hidden>배달 담당 다시 뽑기</button></div><p id="deliveryNotice" class="delivery-notice" role="status" aria-live="polite"></p><div id="deliveryRoster" class="delivery-roster"></div></div><aside class="delivery-order-box"><h4>함께 가져올 메뉴</h4><div id="deliveryOrders"></div><p id="deliveryCount"></p></aside></div>';
 const cup=el('div','delivery-bomb-art');cup.id='deliveryBombArt';cup.setAttribute('aria-hidden','true');cup.innerHTML='<i>☕</i><b>⊙_⊙</b>';const draw=deliveryPanel.querySelector('#deliveryDraw');draw.insertBefore(cup,draw.firstChild);
 deliveryPanel.querySelector('.delivery-head p').id='deliveryPopupHelp';
 const targets=el('div','delivery-targets');targets.id='deliveryTargets';targets.setAttribute('aria-label','커피 컵을 받을 사람');draw.append(targets);
 view.append(deliveryPanel);
 const select=$('deliveryDrinkSelect');if(select&&!select.options.length)for(const d of [...deliveryDrinks,'직접 입력']){const o=el('option','',d);o.value=d;select.append(o);}
 select.addEventListener('change',()=>{$('deliveryCustomDrink').hidden=select.value!=='직접 입력';deliveryRenderControls();});
 $('deliveryCustomDrink').addEventListener('input',deliveryRenderControls);
 $('deliveryJoinBtn').addEventListener('click',()=>{const drink=deliveryDrink(select.value==='직접 입력'?$('deliveryCustomDrink').value:select.value);if(!drink){$('deliveryMyChoice').textContent='마실 메뉴를 1~20자로 적어주세요.';return;}deliverySend({t:'deliveryReply',response:'join',drink});});
 $('deliveryPassBtn').addEventListener('click',()=>deliverySend({t:'deliveryReply',response:'pass'}));
 $('deliveryRedrawBtn').addEventListener('click',()=>deliverySend({t:'deliveryRedraw'}));
 targets.addEventListener('click',event=>{const b=event.target.closest('[data-delivery-target]');if(b&&!b.disabled)deliverySend({t:'deliveryThrow',targetId:b.dataset.deliveryTarget});});
 document.addEventListener('keydown',deliveryStageKeydown,true);
 document.addEventListener('focusin',event=>{if(deliveryStageActive&&!deliveryPanel.contains(event.target)&&!deliveryStageChatContains(event.target))deliveryPanel.focus({preventScroll:true});});
 deliveryRender();
}
function deliveryRenderControls(){
 if(!deliveryPanel||!deliveryState)return;const own=deliveryState.members.find(m=>m.id===netSelfId()),can=deliveryState.phase==='invite'&&own&&!own.left,custom=$('deliveryDrinkSelect').value==='직접 입력';
 $('deliveryDrinkSelect').disabled=!can;$('deliveryCustomDrink').disabled=!can;$('deliveryCustomDrink').hidden=!custom;$('deliveryJoinBtn').disabled=!can||custom&&!deliveryDrink($('deliveryCustomDrink').value);$('deliveryPassBtn').disabled=!can;
}
function deliveryRender(){
 if(!deliveryPanel)return;const s=deliveryState;deliveryPanel.hidden=!s||!deliveryCurrent()||netPhase!=='result';if(deliveryPanel.hidden){deliverySetStage(false);return;}
 deliveryPanel.dataset.phase=s.phase;const own=s.members.find(m=>m.id===netSelfId());if(deliveryUiId!==s.id){deliveryUiId=s.id;const drink=own?.drink||deliveryDrinks[0],preset=deliveryDrinks.includes(drink);$('deliveryDrinkSelect').value=preset?drink:'직접 입력';$('deliveryCustomDrink').value=preset?'':drink;}
 $('deliveryPick').hidden=s.phase!=='invite'||!own||own.left;$('deliveryDraw').hidden=s.phase==='invite';deliveryRenderControls();
 $('deliveryMyChoice').textContent=own?.response==='join'?'내 선택: '+own.drink+' · 참가 중':own?.response==='pass'?'내 선택: 이번에는 커피 패스':'참가 또는 패스를 고르면, 모두 선택한 뒤 자동으로 돌려요.';
 $('deliveryNotice').textContent=s.notice;$('deliveryRedrawBtn').hidden=!(netIsHost()&&s.phase==='done'&&s.needsRedraw&&deliveryCandidates().length);
 const rosterKey=s.members.map(m=>m.id+':'+m.response+':'+m.drink+':'+m.left).join('|');
 if(rosterKey!==deliveryRosterKey){deliveryRosterKey=rosterKey;const list=$('deliveryRoster');list.replaceChildren();for(const m of s.members){const chip=el('span','delivery-chip');chip.classList.toggle('is-pass',m.response==='pass'||m.left);chip.append(el('b','',m.name+(m.id===netSelfId()?' · 나':'')),el('small','',m.left?'나감':m.response==='pending'?'고르는 중':m.response==='pass'?'패스':m.drink));list.append(chip);}}
 const joined=deliveryCandidates(),orders=new Map();for(const m of joined)orders.set(m.drink,(orders.get(m.drink)||0)+1);const orderKey=JSON.stringify([...orders]);if(orderKey!==deliveryOrdersKey){deliveryOrdersKey=orderKey;const list=$('deliveryOrders');list.replaceChildren();if(!orders.size)list.append(el('p','delivery-empty','참가자가 고른 메뉴가 여기에 모여요.'));for(const [drink,count]of orders){const line=el('div','delivery-order');line.append(el('span','',drink),el('strong','',count+'잔'));list.append(line);}}
 $('deliveryCount').textContent='커피 참가 '+joined.length+'명 · 총 '+joined.length+'잔';
 deliveryRenderDraw();
 $('deliveryTitle').textContent=s.phase==='spin'?'커피 폭탄 떠넘기기 ☕':'커피는 자유 참가 ☕';$('deliveryPopupHelp').textContent=s.phase==='spin'?'컵이 터질 때 들고 있으면 커피 배달 담당! 받을 사람을 눌러 넘겨요.':'마실 음료를 고르거나 패스하세요. 모두 선택하면 컵 돌리기가 시작돼요.';deliverySetStage(['invite','spin'].includes(s.phase));
 if(!deliveryStageActive&&deliveryScrolledId!==s.id&&typeof requestAnimationFrame==='function'&&typeof deliveryPanel.scrollIntoView==='function'){const revealId=s.id;deliveryScrolledId=revealId;requestAnimationFrame(()=>{if(deliveryState?.id!==revealId||!deliveryCurrent()||deliveryPanel?.hidden||deliveryStageActive)return;const still=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;deliveryPanel.scrollIntoView({behavior:still?'auto':'smooth',block:'start'});});}
}
function deliveryRenderDraw(){
 const s=deliveryState;if(!s||!deliveryPanel||deliveryPanel.hidden||s.phase==='invite')return;const joined=deliveryCandidates();deliveryPanel.dataset.phase=s.phase;
 const playing=s.phase==='spin',mine=playing&&s.holderId===netSelfId(),ready=Date.now()+deliveryClockOffset>=s.passReadyAt,holder=joined.find(m=>m.id===s.holderId);deliveryPanel.dataset.mine=String(mine);$('deliveryBombArt').hidden=!playing&&(!s.winnerId||!s.startAt);$('deliveryBombArt').querySelector('b').textContent=playing?(mine?'⊙_⊙':'ㅡ_ㅡ'):'X﹏X';
 if(playing){$('deliveryDrawCaption').textContent=mine?'내 컵이다. 받을 사람을 눌러!':'컵을 피하는 중…';$('deliveryDrawName').textContent=(holder?.name||'')+' 님이 컵 들고 있음';$('deliveryDrawHint').textContent='언제 터질지는 아무도 몰라요. '+(joined.length>2?'방금 준 사람에게 반송 금지!':'서로 번갈아 넘겨요!');}
 else{const winner=s.members.find(m=>m.id===s.winnerId);$('deliveryDrawCaption').textContent=winner?'오늘의 커피 배달 담당':s.needsRedraw?'배달 담당을 다시 골라주세요':'오늘은 커피 패스';$('deliveryDrawName').textContent=winner?winner.name+' ☕':s.needsRedraw?'다시 돌릴까?':'각자 맛점!';$('deliveryDrawHint').textContent=winner?'아래 메뉴 '+joined.length+'잔을 함께 가져와주세요.':s.needsRedraw?'남은 참가자 중에서 다시 뽑을 수 있어요.':'모두의 선택을 반영했어요.';}
 const targets=$('deliveryTargets');targets.hidden=!playing;const targetKey=joined.map(m=>m.id+':'+m.name).join('|');if(targetKey!==deliveryTargetsKey){deliveryTargetsKey=targetKey;targets.replaceChildren();for(const m of joined){const b=el('button','delivery-target');b.type='button';b.title=m.name;b.dataset.deliveryTarget=m.id;b.append(el('strong','',m.name+(m.id===netSelfId()?' · 나':'')),el('small'));targets.append(b);}}
 for(const b of targets.children){const id=b.dataset.deliveryTarget,blocked=joined.length>2&&id===s.previousHolderId;b.classList.toggle('is-holder',playing&&id===s.holderId);b.disabled=!playing||!mine||!ready||id===netSelfId()||blocked;b.querySelector('small').textContent=id===s.holderId?'☕ 컵 보유':mine&&blocked?'반송 금지':mine?'여기로 넘기기':'컵 피하는 중';}
}
function deliveryHousekeep(){
 const s=deliveryState;if(!s)return;if(!deliveryCurrent()){deliveryCancel();return;}if(!netIsHost())return;
 const present=new Set(netMembers().map(m=>m.id));let changed=false;
 for(const m of s.members)if(!m.left&&!present.has(m.id)){m.left=true;m.response='pass';m.drink='';changed=true;}
 if(changed){
  const joined=deliveryCandidates();
  if(s.phase==='spin'){
   if(joined.length<2)deliveryFinish(joined[0]?.id||'',joined.length?joined[0].name+' 님만 남았어요. 오늘의 커피 배달 담당입니다 ☕':'커피 참가자가 없어 배달 담당 없이 마쳤어요.');
   else if(!joined.some(m=>m.id===s.holderId)){s.holderId=joined[rand(joined.length)].id;s.previousHolderId='';s.passReadyAt=Date.now()+650;s.notice='컵을 들던 사람이 나가 남은 참가자에게 컵을 넘겼어요.';}
  }
  if(s.phase==='done'&&s.winnerId&&!joined.some(m=>m.id===s.winnerId)){s.winnerId='';s.needsRedraw=joined.length>0;s.notice=joined.length?'배달 담당이 나갔어요. 남은 참가자 중에서 다시 뽑아주세요.':'커피 참가자가 모두 나갔어요.';}
  deliveryChanged();deliveryMaybeSpin();
 }
 if(s.phase==='spin'&&Date.now()>=deliveryDeadline){deliveryFinish(s.holderId);deliveryChanged();}
}
setInterval(()=>{deliveryHousekeep();deliveryRender();},200);netRoom.onDisconnect(e=>{if(e.self||e.hostLost)deliveryCancel();});
/* END_COFFEE_DELIVERY_V1 */

