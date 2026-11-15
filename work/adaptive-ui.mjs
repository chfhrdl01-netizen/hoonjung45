/* DEVICE_UI_V1: presentation preferences stay on this device, outside room state. */
function deviceLayoutFor(width,height,coarse,wideFine){
 if(wideFine&&width>=1100&&height>=650)return 'desktop';
 if(width<=720)return 'phone';
 if(coarse||(width<1100&&height<=600))return 'touch-wide';
 return 'compact';
}
const deviceCoarse=matchMedia('(pointer:coarse)'),deviceWideFine=matchMedia('(min-width:1100px) and (min-height:650px) and (hover:hover) and (pointer:fine)');
let deviceLayout='',deviceInfoOpen=false,deviceRoomMode='create',deviceResizeFrame=0;
function deviceIsTouchLayout(){return deviceLayout==='phone'||deviceLayout==='touch-wide';}
function deviceSetText(node,value){if(node&&node.textContent!==value)node.textContent=value;}
function deviceTouchRule(text=''){
 return text.replace(/Space/gi,'액션 버튼').replace(/방향키/g,'이동 버튼').replace(/A\s*\/\s*W\s*\/\s*D/g,'왼쪽·가운데·오른쪽 버튼').replace(/←\s*\/\s*→/g,'좌우 버튼').replace(/↑\s*\/\s*↓/g,'위아래 버튼').replace(/↑로/g,'위 버튼으로').replace(/\bA\b/g,'왼쪽 버튼').replace(/\bW\b/g,'가운데 버튼').replace(/\bD\b/g,'오른쪽 버튼').replace(/버튼로/g,'버튼으로').replace(/버튼를/g,'버튼을').replace(/버튼는/g,'버튼은').replace(/버튼가/g,'버튼이').replace(/버튼와/g,'버튼과');
}
function deviceSetRoomMode(mode,focus=false){
 if(!['create','join'].includes(mode)||$('roomNickname')?.disabled)return false;
 deviceRoomMode=mode;deviceRenderRoom();
 if(focus)$(mode==='create'?'deviceCreateTab':'deviceJoinTab')?.focus();
 return true;
}
function deviceRenderRoom(){
 const lobby=$('roomLobby');if(!lobby||!$('deviceRoomTabs'))return;
 const mobile=deviceIsTouchLayout(),busy=!!$('roomNickname')?.disabled;
 lobby.dataset.roomMode=deviceRoomMode;
 for(const mode of ['create','join']){
  const tab=$(mode==='create'?'deviceCreateTab':'deviceJoinTab'),pane=$(mode==='create'?'deviceCreatePane':'deviceJoinPane'),selected=mode===deviceRoomMode;
  tab.disabled=busy;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;
  if(mobile){pane.setAttribute('role','tabpanel');pane.setAttribute('aria-labelledby',tab.id);}
  else{pane.removeAttribute('role');pane.removeAttribute('aria-labelledby');}
 }
}
function deviceInstallRoom(){
 const form=document.querySelector('.room-lobby-form'),create=$('roomCreateBtn'),divider=form?.querySelector('.room-divider'),codeLabel=form?.querySelector('label[for="roomCodeInput"]'),joinRow=form?.querySelector('.room-join-row');
 if(!form||!create||!divider||!codeLabel||!joinRow||$('deviceRoomTabs'))return;
 const tabs=el('div','device-room-tabs');tabs.id='deviceRoomTabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','점심방 참여 방법');
 const createPane=el('section','device-room-pane'),joinPane=el('section','device-room-pane');createPane.id='deviceCreatePane';joinPane.id='deviceJoinPane';
 form.insertBefore(tabs,create);form.insertBefore(createPane,create);createPane.append(create);form.insertBefore(joinPane,divider);joinPane.append(divider,codeLabel,joinRow);
 for(const [mode,label,id,pane]of [['create','새 방 만들기','deviceCreateTab',createPane],['join','초대 코드로 입장','deviceJoinTab',joinPane]]){
  const button=el('button','device-room-tab',label);button.id=id;button.type='button';button.dataset.deviceUiControl='true';button.setAttribute('role','tab');button.setAttribute('aria-controls',pane.id);button.addEventListener('click',()=>deviceSetRoomMode(mode));
  button.addEventListener('keydown',event=>{let next;if(['ArrowLeft','Home'].includes(event.key))next='create';else if(['ArrowRight','End'].includes(event.key))next='join';if(next){event.preventDefault();deviceSetRoomMode(next,true);}});tabs.append(button);
 }
 deviceRoomMode=$('roomCodeInput').value.trim()?'join':'create';
 // Observe transport-owned busy fields, never the new buttons themselves.
 const observer=new MutationObserver(deviceRenderRoom);for(const id of ['roomNickname','roomConsent'])observer.observe($(id),{attributes:true,attributeFilter:['disabled']});
 $('roomNickname').addEventListener('keydown',event=>{if(event.key!=='Enter'||!deviceIsTouchLayout())return;event.preventDefault();event.stopImmediatePropagation();const button=$(deviceRoomMode==='create'?'roomCreateBtn':'roomJoinBtn');if(!button.disabled)button.click();},true);
 deviceRenderRoom();
}
function deviceEnsureGameUI(){
 if(!arcadeDialog)return;
 const strip=arcadeDialog.querySelector('.five-round-strip');if(!strip||$('deviceInfoToggle'))return;
 const own=el('span','device-own-summary');own.id='deviceOwnSummary';
 const hint=el('span','device-input-hint');hint.id='deviceInputHint';
 const rule=el('p','device-rule-summary');rule.id='deviceRuleSummary';
 const toggle=el('button','device-info-toggle','규칙·점수');toggle.id='deviceInfoToggle';toggle.type='button';toggle.dataset.deviceUiControl='true';toggle.setAttribute('aria-controls','arcadeHelp arcadeRoster');toggle.addEventListener('click',()=>{deviceInfoOpen=!deviceInfoOpen;deviceRenderGame();});
 strip.append(own,hint,toggle,rule);deviceRenderGame();
}
function deviceRenderGame(){
 if(!arcadeDialog)return;
 const state=arcadeState,phase=state?.phase||'menu',mobile=deviceIsTouchLayout(),expanded=!mobile||deviceInfoOpen||phase==='done';
 arcadeDialog.dataset.deviceLayout=deviceLayout;arcadeDialog.dataset.infoOpen=String(deviceInfoOpen);arcadeDialog.dataset.sessionPhase=phase;
 const toggle=$('deviceInfoToggle');if(!toggle)return;
 toggle.setAttribute('aria-expanded',String(expanded));toggle.hidden=!mobile||!state||phase==='invite'||phase==='done';deviceSetText(toggle,expanded?'정보 접기':'규칙·점수');
 const game=arcadeGames[state?.world?.game||state?.chosen],self=arcadeSelf(),own=state?.members.find(member=>member.id===self),player=state?.world?.players.find(p=>p.id===self);
 const points=state?.format==='points',summary=!own||own.response!=='join'?'관전':points?'내 누적 '+(state.totalPoints?.[self]||0)+'점':'내 점수 '+Math.round(player?.score||0)+'점';
 const rules=game?.hint||'매판 순위 점수를 더해요.';deviceSetText($('deviceOwnSummary'),summary);deviceSetText($('deviceRuleSummary'),mobile?deviceTouchRule(rules):rules);if(mobile)deviceSetText($('arcadeHelp'),deviceTouchRule(rules));
 const dpad=$('arcadeDpad'),keys=(dpad&&!dpad.hidden?'이동 WASD / 방향키 · ':'')+(game?.key||'Space');deviceSetText($('deviceInputHint'),mobile?'화면 버튼으로 조작':keys);
 if(mobile&&game){
  const hint=$('arcadeActionHint'),current=hint?.textContent||'';
  // Preserve live cooldown/retrieval feedback; only replace the keyboard prompt.
  deviceSetText(hint,current===game.key?(game.key?.includes('두 번')||game.key?.includes('두번')?'두 번 눌러 조절':state?.world?.game==='sneak'?'길게 누르기':'버튼을 눌러 실행'):deviceTouchRule(current));
  const status=$('arcadeStatus');if(status)deviceSetText(status,deviceTouchRule(status.textContent));
 }
}
function deviceRefreshLayout(){
 deviceResizeFrame=0;const next=deviceLayoutFor(innerWidth,innerHeight,deviceCoarse.matches,deviceWideFine.matches);
 if(next!==deviceLayout){deviceLayout=next;document.body.dataset.deviceLayout=next;document.body.dataset.inputMode=deviceIsTouchLayout()?'touch':'keyboard';if(typeof arcadeClearKeys==='function')arcadeClearKeys();}
 deviceRenderRoom();deviceRenderGame();
}
const deviceBaseEnsureArcade=arcadeEnsureUI;
arcadeEnsureUI=function(...args){const value=deviceBaseEnsureArcade(...args);deviceEnsureGameUI();return value;};
const deviceBaseRenderArcade=arcadeRender;
arcadeRender=function(...args){const value=deviceBaseRenderArcade(...args);deviceRenderGame();return value;};
const scheduleDeviceLayout=()=>{if(!deviceResizeFrame)deviceResizeFrame=requestAnimationFrame(deviceRefreshLayout);};
window.addEventListener('resize',scheduleDeviceLayout);for(const query of [deviceCoarse,deviceWideFine])query.addEventListener('change',scheduleDeviceLayout);
deviceRefreshLayout();deviceInstallRoom();
/* END_DEVICE_UI_V1 */
