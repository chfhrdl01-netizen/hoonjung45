/* DUEL_SINGLE_CONTROLS_V1 */
let duelControlsLocalSide=0,duelControlsLastKey='',duelControlsView=null;
function duelControlsOnline(){return typeof netActionOnline==='function'?netActionOnline():typeof netIsActive==='function'&&netIsActive();}
function duelControlsSide(){if(!duelControlsOnline())return duelControlsLocalSide;const side=typeof netActionSide==='function'?netActionSide():typeof netSelfSide==='function'?netSelfSide():-1;return side===0||side===1?side:-1;}
function duelControlsElements(){
 const view=typeof $==='function'?$('duelView'):document.getElementById('duelView');if(!view)return null;
 if(duelControlsView?.view===view)return duelControlsView;
 const controls=view.querySelector('.battle-controls'),panels=controls?[...controls.querySelectorAll('.battle-control-panel')]:[];if(!controls||panels.length!==2)return null;
 const toolbar=document.createElement('div');toolbar.className='duel-control-toolbar';toolbar.id='duelControlToolbar';
 const label=document.createElement('label');label.htmlFor='duelControlSideSelect';label.textContent='터치 조작 대상';
 const select=document.createElement('select');select.id='duelControlSideSelect';select.setAttribute('aria-label','이 기기에서 터치로 조작할 캐릭터');
 for(const [value,text]of [[0,'도전자'],[1,'방어자']]){const option=document.createElement('option');option.value=String(value);option.textContent=text;select.append(option);}
 const note=document.createElement('span');note.id='duelControlPadNote';toolbar.append(label,select,note);controls.before(toolbar);
 const spectator=document.createElement('p');spectator.id='duelSpectatorControls';spectator.className='duel-spectator-controls';spectator.hidden=true;spectator.textContent='관전 중이에요. 두 선수의 승부를 지켜봐 주세요.';controls.after(spectator);
 select.addEventListener('change',()=>{if(duelControlsOnline())return;const side=Number(select.value);if(side!==0&&side!==1)return;if(typeof actionReleaseAll==='function')actionReleaseAll();duelControlsLocalSide=side;duelControlsLastKey='';duelControlsRefresh();});
 duelControlsView={view,controls,panels,toolbar,label,select,note,spectator};return duelControlsView;
}
function duelControlsRefresh(){
 if(typeof document==='undefined')return;const ui=duelControlsElements();if(!ui)return;
 if(typeof mode==='undefined'||mode!=='duel'||!duel||ui.view.hidden){ui.toolbar.hidden=true;ui.spectator.hidden=true;duelControlsLastKey='';return;}
 const online=duelControlsOnline(),side=duelControlsSide(),phase=duel.phase||'idle',names=[duel.challenger||'도전자',duel.defender||'방어자'];
 const key=[online,side,duel.id||'',phase,names.join('|')].join(':');if(key===duelControlsLastKey)return;duelControlsLastKey=key;
 ui.controls.dataset.singlePad='true';ui.controls.dataset.controlSide=String(side);ui.view.dataset.singleDuelPad='true';
 ui.controls.hidden=online&&side<0;ui.spectator.hidden=!ui.controls.hidden;ui.toolbar.hidden=online&&side<0;ui.label.hidden=online;ui.select.hidden=online;ui.select.value=String(duelControlsLocalSide);
 ui.note.textContent=online?'내 캐릭터 키패드 · 이동과 공격을 함께 누를 수 있어요.':'화면에는 선택한 캐릭터 키패드만 보여요. 두 사람의 키보드는 모두 사용할 수 있어요.';
 for(let i=0;i<2;i++){
  const panel=ui.panels[i],own=i===side;panel.hidden=!own;panel.setAttribute('aria-label',(online?'내 캐릭터':names[i])+' 조작 키패드');
  const title=panel.querySelector('strong');if(title)title.textContent=names[i]+(online?' · 내 조작':' · 터치 조작');
  const hint=panel.querySelector('.battle-key-hint');if(hint)hint.textContent=online?'A/D 또는 ←/→ 이동 · W/↑ 점프 · F/K 공격 · G/L 방어':i===0?'A / D 이동 · W 점프 · F 공격 · G 방어':'← / → 이동 · ↑ 점프 · K 공격 · L 방어';
  ui.select.options[i].textContent=(i===0?'도전자 · ':'방어자 · ')+names[i];
  for(const button of panel.querySelectorAll('[data-battle-action]')){
   const action=button.dataset.battleAction,labels={left:'왼쪽 이동',right:'오른쪽 이동',jump:'점프',attack:'공격',guard:'방어'},keys=online?{left:'A / ←',right:'D / →',jump:'W / ↑',attack:'F / K',guard:'G / L'}:i===0?{left:'A',right:'D',jump:'W',attack:'F',guard:'G'}:{left:'←',right:'→',jump:'↑',attack:'K',guard:'L'};
   button.setAttribute('aria-label',(online?'내 캐릭터':names[i])+' '+(labels[action]||action));const kbd=button.querySelector('kbd');if(kbd)kbd.textContent=keys[action]||'';
  }
 }
 const instructions=ui.view.querySelector('.battle-instructions');if(instructions)instructions.textContent=online?(side<0?'관전자에게는 조작 키패드가 표시되지 않아요.':'내 키패드 하나로 조작해요. 왼손은 이동, 오른손은 점프·공격·방어! 머리를 밟으면 추가 피해를 줘요.'):'터치 조작 대상을 바꿔 하나의 키패드로 조종해요. 키보드는 A/D/W/F/G와 방향키/K/L 두 사람 모두 그대로 사용할 수 있어요.';
 const intro=ui.view.querySelector('.battle-intro p');if(intro)intro.textContent=online?'내 기기에서는 내 캐릭터만 조작해요. 점프로 머리를 밟고, 방어로 공격을 버티세요.':'터치는 한 키패드로, 키보드는 두 사람 그대로! 점프와 공격으로 메뉴를 지켜요.';
 if(online&&['idle','paused'].includes(phase)){const status=typeof $==='function'?$('battleStatus'):document.getElementById('battleStatus');if(status)status.textContent=side<0?'관전 중 · 두 선수의 준비를 기다리고 있어요.':'내 캐릭터 준비 완료를 누르세요. 내 키패드만 표시되며 키보드는 두 방식 모두 사용할 수 있어요.';}
}
const duelControlsBaseActionControls=actionControls;
actionControls=function(...args){const out=duelControlsBaseActionControls(...args);duelControlsRefresh();return out;};
const duelControlsBaseNetRefresh=netRefreshCombatControls;
netRefreshCombatControls=function(...args){const out=duelControlsBaseNetRefresh(...args);duelControlsRefresh();return out;};
const duelControlsBaseRender=actionRender;
actionRender=function(...args){const out=duelControlsBaseRender(...args);duelControlsRefresh();return out;};
setInterval(duelControlsRefresh,200);
/* END_DUEL_SINGLE_CONTROLS_V1 */
