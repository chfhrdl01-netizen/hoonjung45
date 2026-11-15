/* CAMPUS_DEPARTMENT_PICKER */
let deptPracticeChoice='',deptPracticePending=null,deptPickerAfterClose=null,deptPickerReturnFocus=null;
function deptPickerNetworkChoice(){const self=netSelfId();return netHasDepartment(self)?netDepartment(self):'';}
function deptPickerCreate(){
 const wrap=el('div','net-department-wrap');
 wrap.innerHTML='<div class="campus-picker-heading"><label for="deptPickerOpen">내 캐릭터 · 학과/전공</label><span>학과·전공 118개</span></div><button id="deptPickerOpen" class="campus-picker-open" type="button" aria-haspopup="dialog"><span>직접 골라야 출전할 수 있어요</span><strong>? 캐릭터 선택</strong><b aria-hidden="true">선택 →</b></button><select id="netDepartment" aria-label="내 캐릭터 · 학과/전공" hidden tabindex="-1"></select><p id="netPassiveDesc"></p><small>학과별 옷과 소품을 고르는 선택이에요. 경기 능력치는 모두 같아요. <a href="https://www.daegu.ac.kr/intro/0" target="_blank" rel="noopener">학교 공식 학과 안내 ↗</a></small>';
 const select=wrap.querySelector('#netDepartment'),blank=el('option','','캐릭터를 선택해주세요');blank.value='';select.append(blank);
 for(const d of deptOptions){const option=el('option','',d.name);option.value=d.id;select.append(option);}select.value='';
 select.addEventListener('change',event=>{const value=event.target.value;if(!netReady[netSelfId()]&&deptById.has(value))netRoom.send({t:'department',value});deptPickerSync();if(typeof deptAvatarPreview==='function')deptAvatarPreview();});
 wrap.querySelector('#deptPickerOpen').addEventListener('click',()=>deptPickerOpen('network'));return wrap;
}
function deptPickerEnsureDialog(){
 let dialog=$('deptPickerDialog');if(dialog)return dialog;
 dialog=el('dialog','campus-picker-dialog');dialog.id='deptPickerDialog';dialog.setAttribute('aria-labelledby','deptPickerTitle');
 dialog.innerHTML='<header class="campus-picker-head"><div><span>오늘의 밥친구</span><h2 id="deptPickerTitle">학과를 닮은 캐릭터</h2></div><button id="deptPickerClose" class="tiny-btn" type="button" aria-label="학과 선택 닫기">닫기</button></header><div class="campus-picker-tools"><label for="deptSearch">학과 찾기</label><input id="deptSearch" type="search" autocomplete="off" placeholder="학과명 또는 예전 학과명으로 검색" aria-describedby="deptSearchCount"><div id="deptCollegeButtons" class="campus-colleges" role="group" aria-label="대학·학부별 보기"></div><output id="deptSearchCount" aria-live="polite"></output></div><div id="deptCharacterCards" class="campus-character-cards" aria-label="학과 캐릭터 선택"></div><footer class="campus-picker-footer"><button id="deptPickerMore" class="tiny-btn" type="button">더 보기</button><span>같은 학과도 함께 선택할 수 있어요.</span></footer>';
 document.body.append(dialog);dialog.dataset.college='';dialog.dataset.limit='24';
 for(const name of ['',...new Set(deptOptions.map(d=>d.college))]){const button=el('button','campus-college',name||'전체');button.type='button';button.dataset.college=name;button.setAttribute('aria-pressed',String(!name));button.addEventListener('click',()=>{dialog.dataset.college=name;dialog.dataset.limit='24';deptPickerFilter();});$('deptCollegeButtons').append(button);}
 $('deptSearch').addEventListener('input',()=>{dialog.dataset.limit='24';deptPickerFilter();});
 $('deptPickerMore').addEventListener('click',()=>{dialog.dataset.limit=String(Number(dialog.dataset.limit)+24);deptPickerFilter();});
 $('deptPickerClose').addEventListener('click',deptPickerCancel);
 dialog.addEventListener('cancel',()=>{deptPracticePending=null;deptPickerAfterClose=null;});
 dialog.addEventListener('close',()=>{
  const resume=deptPickerAfterClose,focus=deptPickerReturnFocus;deptPracticePending=null;deptPickerAfterClose=null;deptPickerReturnFocus=null;
  if(resume)resume();else if(focus?.isConnected)focus.focus({preventScroll:true});
 });return dialog;
}
function deptPickerCancel(){deptPracticePending=null;deptPickerAfterClose=null;$('deptPickerDialog')?.close();}
function deptPickerOpen(context='network',pending=null){
 if(context==='practice'?netIsActive():netReady[netSelfId()])return;
 const dialog=deptPickerEnsureDialog();deptPracticePending=context==='practice'&&typeof pending==='function'?pending:null;deptPickerAfterClose=null;deptPickerReturnFocus=document.activeElement;
 dialog.dataset.context=context;dialog.dataset.limit='24';deptPickerFilter();if(!dialog.open)dialog.showModal();$('deptSearch').focus({preventScroll:true});
}
function deptPracticeRequire(callback){
 if(netIsActive())return false;if(deptById.has(deptPracticeChoice))return true;deptPickerOpen('practice',callback);return false;
}
function deptPickerSelect(id){
 const dialog=$('deptPickerDialog');if(!dialog?.open||!deptById.has(id))return;
 if(dialog.dataset.context==='practice'){
  if(netIsActive()){deptPickerCancel();return;}deptPracticeChoice=id;deptPracticeSync();deptPickerAfterClose=deptPracticePending;deptPracticePending=null;dialog.close();return;
 }
 if(netReady[netSelfId()])return;const select=$('netDepartment');select.value=id;select.dispatchEvent(new Event('change',{bubbles:true}));dialog.close();
}
function deptPickerFilter(){
 const dialog=$('deptPickerDialog');if(!dialog)return;const query=deptSearchKey($('deptSearch').value),college=dialog.dataset.college,current=dialog.dataset.context==='practice'?deptPracticeChoice:deptPickerNetworkChoice();
 const found=deptOptions.filter(d=>(!college||d.college===college)&&(!query||deptSearchKey([d.name,d.short,d.college,...d.aliases].join(' ')).includes(query)));
 const cards=$('deptCharacterCards'),fragment=document.createDocumentFragment(),limit=Number(dialog.dataset.limit||24);
 for(const d of found.slice(0,limit)){const button=el('button','campus-character-card');button.type='button';button.dataset.department=d.id;button.setAttribute('aria-pressed',String(d.id===current));button.setAttribute('aria-label',d.name+' 캐릭터 선택');const portrait=el('span','campus-character-art');portrait.innerHTML=deptAvatarSvg(d.id);button.append(portrait,el('strong','',d.name),el('small','',d.college));if(/모집중지|2027|계약/.test(d.status))button.append(el('em','',/모집중지/.test(d.status)?'재학생 전공':d.status));button.addEventListener('click',()=>deptPickerSelect(d.id));fragment.append(button);}
 cards.replaceChildren(fragment);$('deptSearchCount').textContent=found.length?found.length+'개 중 '+Math.min(limit,found.length)+'개 표시 · 캐릭터를 누르면 선택돼요':'찾는 학과가 없어요. 다른 이름으로 검색해주세요.';
 $('deptPickerMore').hidden=found.length<=limit;
 for(const button of $('deptCollegeButtons').children)button.setAttribute('aria-pressed',String(button.dataset.college===college));
}
function deptPickerSync(){
 const wrap=document.querySelector('.net-department-wrap');if(!wrap)return;const ready=!!netReady[netSelfId()],select=$('netDepartment'),current=deptPickerNetworkChoice();select.value=current;
 const option=current?deptOption(current):null,button=$('deptPickerOpen');button.disabled=ready;button.dataset.selected=String(!!option);button.querySelector('strong').textContent=option?option.name:'? 캐릭터 선택';button.querySelector('b').textContent=ready?'준비 완료':option?'변경 →':'선택 →';button.setAttribute('aria-label',option?'학과·캐릭터 고르기 · 현재 '+option.name:'캐릭터 미선택 · 캐릭터 선택하기');
 const dialog=$('deptPickerDialog');if(ready&&dialog?.open&&dialog.dataset.context!=='practice')deptPickerCancel();
}
function deptPracticeSync(){
 const menu=$('arcadeMenu');if(!menu)return;let bar=$('deptPracticeBar');
 if(!bar){bar=el('div','campus-practice-character');bar.id='deptPracticeBar';bar.innerHTML='<span class="campus-practice-art" aria-hidden="true"></span><div><small>연습할 내 캐릭터</small><strong id="deptPracticeName"></strong><span id="deptPracticeHint"></span></div><button id="deptPracticeOpen" type="button" class="tiny-btn" aria-haspopup="dialog"></button>';$('arcadeTournamentBtn').before(bar);$('deptPracticeOpen').addEventListener('click',()=>deptPickerOpen('practice'));}
 bar.hidden=netIsActive();const chosen=deptById.has(deptPracticeChoice),signature=chosen?deptPracticeChoice:'unselected';
 if(bar.dataset.department!==signature){bar.dataset.department=signature;bar.querySelector('.campus-practice-art').innerHTML=chosen?deptAvatarSvg(deptPracticeChoice):deptUnselectedSvg();$('deptPracticeName').textContent=chosen?deptOption(deptPracticeChoice).name:'? 캐릭터를 골라주세요';$('deptPracticeHint').textContent=chosen?'선택한 캐릭터로 모든 연습 게임에 참가해요.':'먼저 고르면 컴퓨터 친구들과 한 판 시작!';$('deptPracticeOpen').textContent=chosen?'캐릭터 변경':'? 캐릭터 선택';}
}
const deptPickerSetupBase=renderSetup;renderSetup=function(){const out=deptPickerSetupBase.apply(this,arguments);deptPickerSync();return out;};
const deptPracticeEnsureBase=arcadeEnsureUI;arcadeEnsureUI=function(){const out=deptPracticeEnsureBase.apply(this,arguments);deptPracticeSync();return out;};
const deptPracticeRenderBase=arcadeRender;arcadeRender=function(){const out=deptPracticeRenderBase.apply(this,arguments);deptPracticeSync();return out;};
/* END_CAMPUS_DEPARTMENT_PICKER */
