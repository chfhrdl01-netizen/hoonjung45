

(()=>{
'use strict';
let PEOPLE=['참가자'];
const BASE=[['돈가스','양식'],['국밥','한식'],['비빔밥','한식'],['제육덮밥','한식'],['김치찌개','한식'],['된장찌개','한식'],['짜장면','중식'],['짬뽕','중식'],['쌀국수','아시안'],['파스타','양식'],['햄버거','간편식'],['김밥','간편식'],['순두부찌개','한식'],['부대찌개','한식'],['육개장','한식'],['갈비탕','한식'],['설렁탕','한식'],['냉면','한식'],['칼국수','한식'],['수제비','한식'],['김치볶음밥','한식'],['불고기덮밥','한식'],['초밥','일식'],['회덮밥','일식'],['우동','일식'],['라멘','일식'],['메밀소바','일식'],['가츠동','일식'],['마라탕','중식'],['마파두부덮밥','중식'],['중화비빔밥','중식'],['볶음밥','중식'],['카레','일식'],['팟타이','아시안'],['나시고렝','아시안'],['포케','가벼운식'],['샐러드','가벼운식'],['샌드위치','간편식'],['토스트','간편식'],['피자','양식'],['리조토','양식'],['오므라이스','양식']];
const INITIAL=BASE.map((x,i)=>({id:'default_'+i,name:x[0],category:x[1],enabledFor:[true,true,true],owner:null,custom:false}));
const KEY='du-lunch-online-v3', $=id=>document.getElementById(id);
let reduced=false;
$('motionBtn').setAttribute('aria-pressed',String(reduced));$('motionBtn').textContent='빠른 추첨 '+(reduced?'ON':'OFF');
let pool=INITIAL.map(x=>({...x,enabledFor:[...x.enabledFor]})),history=[],choices=[[],[],[]],active=0,mode='setup',draft=[],race=null,result=null,frame=0,cheers=0,sound=false,audio=null,toastTimer,canStore=true,category='전체',query='',expanded=false,managerPerson=0,duel=null,duelTimer=0,challengerIndex=0;
function validName(x){return typeof x==='string'&&[...x.trim()].length>0&&[...x.trim()].length<=20&&!/[\u0000-\u001f\u007f]/.test(x);}
function visibleFor(item,p){return item.owner===null||item.owner===p;}
function enabled(p=active,items=pool){return items.filter(x=>visibleFor(x,p)&&x.enabledFor[p]);}
function safeRead(){try{const v=JSON.parse(localStorage.getItem(KEY)||'null');if(!v||v.version!==2)return;
 if(Array.isArray(v.pool)){const p=v.pool.filter(x=>x&&/^[-a-zA-Z0-9_]+$/.test(x.id)&&validName(x.name)&&Array.isArray(x.enabledFor)&&x.enabledFor.length===3&&x.enabledFor.every(v=>typeof v==='boolean')&&(x.owner===null||[0,1,2].includes(x.owner))).slice(0,120).map(x=>({id:x.id,name:x.name.trim(),category:typeof x.category==='string'&&BASE.some(b=>b[1]===x.category)?x.category:'내 후보',enabledFor:[...x.enabledFor],owner:x.owner,custom:!!x.custom}));const unique=p.filter((x,i)=>p.findIndex(y=>y.id===x.id)===i);if(PEOPLE.every((_,i)=>enabled(i,unique).length))pool=unique;}
 if(Array.isArray(v.history))history=v.history.filter(x=>x&&validName(x.menu)&&PEOPLE.includes(x.person)&&Number.isFinite(Date.parse(x.time))).slice(0,5).map(x=>({id:typeof x.id==='string'?x.id:x.time,menu:x.menu,person:x.person,time:x.time,source:x.source==='duel'?'duel':'race'}));
 if(Array.isArray(v.choices)&&v.choices.length===3)choices=v.choices.map((ids,p)=>Array.isArray(ids)?[...new Set(ids)].map(id=>enabled(p).find(x=>x.id===id)).filter(Boolean).slice(0,2).map(x=>({...x})):[]);
 }catch{canStore=false;}}
function save(){try{localStorage.setItem(KEY,JSON.stringify({version:2,pool,history,choices:choices.map(list=>list.map(x=>x.id))}));}catch{canStore=false;}if(!canStore)$('storageNote').textContent='이번 게임은 정상 진행돼요. 이 환경에서는 기록 저장이 제한돼요.';}
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function rand(n){if(!Number.isInteger(n)||n<1)throw Error('Empty draw');try{const a=new Uint32Array(1),limit=Math.floor(4294967296/n)*n;do{crypto.getRandomValues(a);}while(a[0]>=limit);return a[0]%n;}catch{return Math.floor(Math.random()*n);}}
function notify(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,2500);}
function timeText(time){return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(time));}
function setStep(i){[1,2,3].forEach(n=>$('step'+n).classList.toggle('active',n===i));}
function switchPerson(i){active=i;category='전체';query='';expanded=false;$('menuSearch').value='';renderSetup();}
function renderSetup(){
 $('players').replaceChildren();
 PEOPLE.forEach((name,i)=>{const selected=choices[i];const b=el('button','player'+(active===i?' active':'')+(selected.length?' chosen':''));b.type='button';b.dataset.index=i;b.id='person_'+i;b.setAttribute('role','tab');b.setAttribute('aria-selected',String(active===i));b.setAttribute('aria-controls','menuPanel');b.setAttribute('aria-label',name+' 조교, '+(selected.length?selected.map(x=>x.name).join(', '):'메뉴 미정')+', '+selected.length+'개 선택');b.tabIndex=active===i?0:-1;
 const top=el('div','player-top'),person=el('span','person');person.append(el('span','avatar',name[0]),document.createTextNode(name));top.append(person,el('span','player-status',selected.length?selected.length+'/2 선택':'후보 대기'));const names=el('strong','nominee'+(selected.length?'':' empty'));if(selected.length)selected.forEach(x=>names.append(el('span','choice-line',x.name)));else names.textContent='메뉴 미정';b.append(top,names,el('span','player-hint',active===i?(selected.length===2?'2개 선택 완료 · 다시 누르면 해제':'최대 2개까지 골라주세요'):'눌러서 메뉴 고르기'));b.addEventListener('click',()=>switchPerson(i));b.addEventListener('keydown',e=>{if(['ArrowRight','ArrowLeft','Home','End'].includes(e.key)){e.preventDefault();const n=e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowRight'?1:2))%3;switchPerson(n);$('person_'+n).focus();}});$('players').append(b);});
 $('menuPanel').setAttribute('aria-labelledby','person_'+active);
 $('pickPrompt').replaceChildren(el('span','',PEOPLE[active]+' 조교'),document.createTextNode('의 후보 · '+choices[active].length+'/2'));
 $('personalAddLabel').textContent=PEOPLE[active]+' 조교만의 후보를 직접 추가하세요.';
 $('personalMenuInput').setAttribute('aria-label',PEOPLE[active]+' 조교의 새 후보 메뉴');
 $('manageBtn').textContent=PEOPLE[active]+' 후보 편집';
 renderMenus();
 const count=choices.filter(list=>list.length>0).length,ready=count===3;$('startBtn').disabled=!ready;$('startBtn').replaceChildren(document.createTextNode(ready?'결재 레이스 시작':'세 사람 모두 1개 이상 골라주세요'),el('span','','→'));$('dossierStatus').textContent=ready?'결재 레이스 준비 완료':'후보 제출 중 · '+count+'/3';
}
function renderMenus(){
 const cats=['전체','한식','중식','일식','양식','아시안','간편식','가벼운식','내 후보'];$('categoryFilters').replaceChildren();cats.forEach(c=>{const b=el('button','category-btn',c);b.type='button';b.setAttribute('aria-pressed',String(c===category));b.addEventListener('click',()=>{category=c;expanded=false;renderMenus();});$('categoryFilters').append(b);});
 const available=enabled().filter(x=>(category==='전체'||(category==='내 후보'?x.owner===active:x.category===category))&&x.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 const show=expanded?available:available.slice(0,12);$('menuGrid').replaceChildren();
 show.forEach(item=>{const selected=choices[active].some(x=>x.id===item.id);const b=el('button','menu-btn'+(selected?' selected':''));b.type='button';b.id='menu_'+item.id;b.setAttribute('aria-pressed',String(selected));b.append(el('span','menu-category',item.owner===active?'내 후보':item.category),el('span','',item.name));b.addEventListener('click',()=>choose(item));$('menuGrid').append(b);});
 if(!available.length)$('menuGrid').append(el('div','menu-empty',category==='내 후보'?'아래에서 나만의 후보를 추가해보세요.':'검색한 메뉴가 없어요. 직접 추가할 수 있어요.'));
 $('moreMenusBtn').hidden=available.length<=12;$('moreMenusBtn').textContent=expanded?'후보 메뉴 접기':'후보 '+(available.length-12)+'개 더 보기';
}
function choose(item){if(mode!=='setup')return;const who=active,list=choices[who],idx=list.findIndex(x=>x.id===item.id);if(idx>=0){list.splice(idx,1);save();renderSetup();$('menu_'+item.id)?.focus({preventScroll:true});notify(item.name+' 선택을 해제했어요.');return;}if(list.length>=2){notify('한 사람당 최대 2개예요. 선택한 메뉴를 다시 눌러 해제하세요.');return;}list.push({...item});beep(440,.045);save();notify(PEOPLE[who]+' 조교, '+item.name+' 선택!');if(list.length===2){const next=choices.findIndex((v,i)=>i!==who&&v.length===0);if(next>=0){switchPerson(next);$('person_'+next).focus({preventScroll:true});return;}}renderSetup();const focusMenu=$('menu_'+item.id);if(focusMenu)focusMenu.focus({preventScroll:true});}
$('menuSearch').addEventListener('input',e=>{query=e.target.value;expanded=false;renderMenus();});$('moreMenusBtn').addEventListener('click',()=>{expanded=!expanded;renderMenus();});
function addPersonal(name,p,items=pool){name=name.trim().normalize('NFC');if(!validName(name))return {error:'메뉴 이름을 1~20자로 입력해주세요.'};const existing=items.find(x=>visibleFor(x,p)&&x.name.normalize('NFC').toLocaleLowerCase()===name.toLocaleLowerCase());if(existing){existing.enabledFor[p]=true;return {item:existing,exists:true};}if(items.filter(x=>x.owner===p).length>=20)return {error:'직접 추가한 메뉴는 한 사람당 20개까지 보관할 수 있어요.'};const item={id:'custom_'+Date.now()+'_'+rand(1000000),name,category:'내 후보',enabledFor:[false,false,false],owner:p,custom:true};item.enabledFor[p]=true;items.push(item);return {item};}
$('personalAddForm').addEventListener('submit',e=>{e.preventDefault();const who=active,r=addPersonal($('personalMenuInput').value,who);if(r.error){notify(r.error);return;}$('personalMenuInput').value='';const already=choices[who].some(x=>x.id===r.item.id);if(!already&&choices[who].length<2)choices[who].push({...r.item});save();category='내 후보';query='';$('menuSearch').value='';renderSetup();notify(r.exists?'이미 있는 메뉴를 내 후보에 반영했어요.':PEOPLE[who]+' 조교의 후보를 추가했어요.');});
function playLayout(playing){document.body.classList.toggle('in-play',playing);$('motionBtn').disabled=mode==='race'||mode==='duel';window.scrollTo(0,0);}
$('motionBtn').addEventListener('click',()=>{if(mode==='race'||mode==='duel')return;reduced=!reduced;$('motionBtn').setAttribute('aria-pressed',String(reduced));$('motionBtn').textContent='빠른 추첨 '+(reduced?'ON':'OFF');notify(reduced?'짧은 추첨으로 진행해요.':'역전 연출이 있는 레이스로 진행해요.');});
function showSetup(){cancelActionDuel();cancelAnimationFrame(frame);clearTimeout(duelTimer);race=null;duel=null;mode='setup';$('setupView').hidden=false;$('raceView').hidden=true;$('resultView').hidden=true;$('duelView').hidden=true;setStep(1);renderSetup();playLayout(false);}
function beep(freq,duration=.08){if(!sound)return;try{if(!audio)audio=new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume().catch(()=>{});const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.value=freq;g.gain.setValueAtTime(.045,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+duration);}catch{}}
function startRace(quick=false){
 if(mode!=='setup')return;if(PEOPLE.some((_,i)=>!enabled(i).length)){notify('세 사람의 메뉴 후보를 확인해주세요.');return;}
 if(quick)choices=PEOPLE.map((_,i)=>{const a=[...enabled(i)],out=[];for(let n=0;n<Math.min(2,a.length+out.length);n++)out.push({...a.splice(rand(a.length),1)[0]});return out;});
 if(choices.some(x=>!x.length))return;save();mode='race';cheers=0;$('cheerCount').textContent='0';$('setupView').hidden=true;$('resultView').hidden=true;$('duelView').hidden=true;$('raceView').hidden=false;setStep(2);$('dossierStatus').textContent='결재 레이스 진행 중';$('raceTitle').textContent='점심 먹으러, 출발!';$('countdown').textContent=reduced?'추첨 중':'3';$('raceComment').textContent=reduced?'차분하게 오늘 점심을 추첨하고 있어요.':'각자 고른 후보 중 대표 메뉴가 출발합니다.';$('raceCourse').replaceChildren();
 const nominated=choices.map(list=>({...list[rand(list.length)]}));
 PEOPLE.forEach((name,i)=>{const lane=el('div','lane'),label=el('div','lane-label');label.append(el('span','',name+' 조교'),el('span','','FINISH · 점심 승인'));const track=el('div','track');const token=el('div','runner');token.dataset.index=i;token.append(el('span','avatar',name[0]),el('span','runner-menu',nominated[i].name));track.append(token);lane.append(label,track);$('raceCourse').append(lane);});
 playLayout(true);race={winner:rand(3),nominated,selections:choices.map(list=>list.map(x=>({...x}))),start:performance.now(),cue:-1,done:false,seeds:[Math.random()*7,Math.random()*7,Math.random()*7]};$('raceTitle').focus({preventScroll:true});frame=requestAnimationFrame(tick);
}
const COMMENTS=['메일은 잠시만, 점심부터!','결재판을 뚫고 질주 중!','역전 가능! 아직 아무도 모릅니다.','식사 시간은 기다려주지 않는다!','마지막 도장, 누가 먼저 찍을까요?','최종 결재선이 보입니다!'];
function tick(){if(!race||mode!=='race')return;const elapsed=performance.now()-race.start,cd=reduced?0:2400,duration=reduced?1200:6000;if(elapsed<cd){const n=3-Math.floor(elapsed/800);$('countdown').textContent=String(n);if(race.cue!==n){race.cue=n;beep(300+n*100,.08);}}else{const t=Math.min(1,(elapsed-cd)/duration);$('countdown').textContent=reduced?'추첨 중':t<.12?'출발!':t<.9?'질주 중':'결재 임박';const cue=Math.min(COMMENTS.length-1,Math.floor(t*COMMENTS.length));if(race.cue!==100+cue){race.cue=100+cue;$('raceComment').textContent=reduced?'세 사람의 후보를 같은 확률로 추첨합니다.':COMMENTS[cue];}document.querySelectorAll('.runner').forEach((token,i)=>{const raw=t+.12*Math.sin(Math.PI*t)*Math.sin(t*10+race.seeds[i]);const p=t<.78?raw:((1-(t-.78)/.22)*(.78+.12*Math.sin(Math.PI*.78)*Math.sin(.78*10+race.seeds[i]))+((t-.78)/.22)*(i===race.winner?1:.84+i*.025));token.style.transform='translateX('+(reduced?0:Math.max(0,Math.min(1,p))*(token.parentElement.clientWidth-token.offsetWidth-10))+'px)';});if(elapsed>=cd+duration+(reduced?0:450)){finish();return;}}frame=requestAnimationFrame(tick);}
function saveRound(){history=history.filter(h=>h.id!==result.id);history.unshift({id:result.id,menu:result.menu,person:result.person,time:result.time,source:result.source,...(result.leagueFormat==='points'?{leagueFormat:'points',leagueRounds:result.leagueRounds,leagueScores:{...result.leagueScores},scoreWinnerId:result.scoreWinnerId,scoreChampionIds:[...(result.scoreChampionIds||[])],scoreStandings:(result.scoreStandings||[]).map(row=>({...row}))}:{})});history=history.slice(0,5);save();}
function finish(){if(!race||race.done)return;race.done=true;cancelAnimationFrame(frame);const r=race,missions=['메뉴 고민은 여기까지. 서로 맛있게 먹기!','식사하면서 오늘의 소소한 좋은 일 하나씩 나누기.','오늘은 서로의 메뉴 취향을 하나씩 알아가기.','업무 이야기는 잠시 접고, 점심 이야기 한 가지 나누기.'];result={id:'round_'+Date.now()+'_'+rand(1000000),menu:r.nominated[r.winner].name,person:PEOPLE[r.winner],time:new Date().toISOString(),nominations:r.selections.map((list,i)=>({person:PEOPLE[i],menus:list.map(x=>x.name)})),source:'race',duelCount:0,mission:missions[rand(missions.length)]};saveRound();renderResult();beep(659,.14);if(!reduced)confetti();}
function renderResult(){cancelActionDuel();mode='result';playLayout(true);$('setupView').hidden=true;$('raceView').hidden=true;$('duelView').hidden=true;$('resultView').hidden=false;setStep(3);$('winningMenu').textContent=result.menu;$('winningPerson').textContent='제안자 · '+result.person+' 조교';$('winningDate').textContent=timeText(result.time)+' · KST';$('dossierStatus').textContent='최종 승인 · '+result.menu;$('resultNominations').replaceChildren();result.nominations.forEach(x=>{const row=el('div','submitted-row'+(x.person===result.person?' winner':''));row.append(el('span','',x.person),el('strong','',x.menus.join(' · ')));$('resultNominations').append(row);});$('missionText').textContent=result.mission;$('duelVerdict').hidden=result.source!=='duel';$('duelVerdict').textContent=result.source==='duel'?'액션 결투 '+result.duelCount+'회 · '+result.verdict:'';$('winningMenu').focus({preventScroll:true});}
function confetti(){const box=el('div','confetti');box.setAttribute('aria-hidden','true');for(let i=0;i<35;i++){const p=el('i');p.style.left=Math.random()*100+'%';p.style.background=['#ed5b32','#93baa4','#e8c46c','#afa3c9'][i%4];p.style.animationDelay=Math.random()*.5+'s';box.append(p);}document.body.append(box);setTimeout(()=>box.remove(),3300);}
function openDialog(id){const d=$(id);if(!d.open)d.showModal();}
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
function renderDraft(){const list=$('manageList');list.replaceChildren();draft.filter(item=>visibleFor(item,managerPerson)).forEach(item=>{const row=el('div','manage-row'),label=el('label');const check=document.createElement('input');check.type='checkbox';check.checked=item.enabledFor[managerPerson];check.addEventListener('change',()=>{item.enabledFor[managerPerson]=check.checked;$('menuError').textContent='';});label.append(check,document.createTextNode(item.name));row.append(label);if(item.custom&&item.owner===managerPerson){const remove=el('button','remove-menu','삭제');remove.type='button';remove.setAttribute('aria-label',item.name+' 후보 삭제');remove.addEventListener('click',()=>{draft=draft.filter(x=>x.id!==item.id);renderDraft();});row.append(remove);}list.append(row);});}
$('manageBtn').addEventListener('click',()=>{if(mode!=='setup')return;managerPerson=active;draft=pool.map(x=>({...x,enabledFor:[...x.enabledFor]}));$('manageHeading').textContent=PEOPLE[managerPerson]+' 조교의 후보';$('newMenuInput').value='';$('menuError').textContent='체크 상태와 직접 추가한 메뉴는 이 조교의 후보에만 적용돼요.';renderDraft();openDialog('manageDialog');});
$('addForm').addEventListener('submit',e=>{e.preventDefault();const r=addPersonal($('newMenuInput').value,managerPerson,draft);if(r.error){$('menuError').textContent=r.error;return;}$('newMenuInput').value='';$('menuError').textContent=r.exists?'이미 있는 메뉴를 체크했어요.':'내 후보를 추가했어요. 아래 버튼을 누르면 적용돼요.';renderDraft();$('newMenuInput').focus();});
$('saveMenusBtn').addEventListener('click',()=>{if(!enabled(managerPerson,draft).length){$('menuError').textContent='후보 메뉴를 하나 이상 체크해주세요.';return;}pool=draft.map(x=>({...x,enabledFor:[...x.enabledFor]}));choices=choices.map((list,p)=>list.filter(x=>enabled(p).some(y=>y.id===x.id)));save();renderSetup();$('manageDialog').close();notify(PEOPLE[managerPerson]+' 조교의 후보를 저장했어요.');});
$('startBtn').addEventListener('click',()=>startRace());$('randomBtn').addEventListener('click',()=>startRace(true));$('againBtn').addEventListener('click',()=>{choices=[[],[],[]];active=0;category='전체';query='';expanded=false;$('menuSearch').value='';save();showSetup();$('person_0').focus({preventScroll:true});});
$('cheerBtn').addEventListener('click',()=>{if(mode!=='race')return;cheers++;$('cheerCount').textContent=String(cheers);beep(450+cheers%5*60,.045);notify(['밥심으로 달려라!','오늘 점심, 우리가 정한다!','결재는 신속하게, 식사는 여유롭게!'][cheers%3]);});
$('helpBtn').addEventListener('click',()=>openDialog('helpDialog'));$('historyBtn').addEventListener('click',()=>{$('historyList').replaceChildren();if(!history.length)$('historyList').append(el('div','empty-history','아직 결재된 점심이 없어요. 첫 5판 점수전을 시작해보세요!'));history.forEach(h=>{const row=el('div','history-item');row.append(el('strong','',h.menu),el('span','',h.person+' 제안 · '+(h.leagueFormat==='points'?'5판 누적 점수전 · ':h.source==='tournament'?'토너먼트 확정 · ':h.source==='duel'?'결투 확정 · ':'')+timeText(h.time)));$('historyList').append(row);});openDialog('historyDialog');});
$('soundBtn').addEventListener('click',()=>{sound=!sound;$('soundBtn').setAttribute('aria-pressed',String(sound));$('soundState').textContent=sound?'ON':'OFF';if(sound)beep(520,.1);});
function resultText(){const scores=result.leagueFormat==='points'?'\n최종 누적 순위 ('+(result.leagueRounds||5)+'판)\n'+scoreResultStandings().map(row=>(row.left?'퇴장':row.forfeited?'기권':row.rank+'위')+' '+row.name+' '+row.points+'점').join('\n')+'\n메뉴 이의전 이후에도 점수와 순위는 유지됩니다.':'';return '[대구대학교 점심 결재서]\n오늘 점심: '+result.menu+'\n제안자: '+result.person+'\n함께하는 사람: '+result.nominations.map(n=>n.person).join(' · ')+'\n확정 방식: '+(result.leagueFormat==='points'?'전원 5판 누적 점수전'+(result.duelCount?' · 메뉴 이의전 '+result.duelCount+'회':''):result.source==='tournament'?'랜덤 게임 토너먼트':result.source==='duel'?'액션 결투 · '+result.verdict:'결재 레이스')+scores+'\n'+timeText(result.time)+' (한국 시간)\n점심 결재 완료. 맛있게 먹어요!';}
$('copyBtn').addEventListener('click',async()=>{if(!result)return;const text=resultText();try{if(!navigator.clipboard?.writeText)throw Error();await navigator.clipboard.writeText(text);notify('점심 결재 결과를 복사했어요!');}catch{$('copyText').value=text;openDialog('copyDialog');$('copyText').focus();$('copyText').select();}});$('selectCopyBtn').addEventListener('click',()=>{$('copyText').focus();$('copyText').select();notify('전체 선택했어요. 복사 명령을 눌러주세요.');});
function refreshChallengers(){$('challengerChoices').replaceChildren();PEOPLE.forEach((name,i)=>{if(name===result.person)return;const b=el('button','challenger-choice',name);b.type='button';b.setAttribute('aria-pressed',String(challengerIndex===i));b.addEventListener('click',()=>{challengerIndex=i;refreshChallengers();});$('challengerChoices').append(b);});$('duelMenuSelect').replaceChildren();result.nominations[challengerIndex].menus.forEach(name=>{const option=document.createElement('option');option.value=name;option.textContent=name;$('duelMenuSelect').append(option);});$('objectionError').textContent='';}
$('objectBtn').addEventListener('click',()=>{if(mode!=='result')return;challengerIndex=PEOPLE.findIndex(name=>name!==result.person);refreshChallengers();openDialog('objectionDialog');});
$('prepareDuelBtn').addEventListener('click',()=>{const menu=$('duelMenuSelect').value;if(menu===result.menu){$('objectionError').textContent='같은 메뉴예요. 다른 메뉴나 다른 도전자를 골라주세요.';return;}if(!result.nominations[challengerIndex].menus.includes(menu))return;$('objectionDialog').close();prepareDuel(challengerIndex,menu);});
/* ACTION_DUEL_V1 */
let actionFrame=0,actionLast=0,actionKeys=new Set(),actionPointers=new Map(),actionSeenKeys=new Set();
const ACTION_BINDINGS={KeyA:[0,'left'],KeyD:[0,'right'],KeyW:[0,'jump'],KeyF:[0,'attack'],KeyG:[0,'guard'],ArrowLeft:[1,'left'],ArrowRight:[1,'right'],ArrowUp:[1,'jump'],KeyK:[1,'attack'],KeyL:[1,'guard']};
function actionFood(menu){const m=[[/돈가스|가츠/,'🍖'],[/국밥|갈비탕|설렁탕|찌개|육개장/,'🍲'],[/김밥|초밥|회덮밥/,'🍣'],[/비빔밥|덮밥|볶음밥|카레|오므라이스/,'🍛'],[/파스타|리조토/,'🍝'],[/햄버거/,'🍔'],[/피자/,'🍕'],[/포케|샐러드/,'🥗'],[/샌드위치|토스트/,'🥪'],[/면|국수|우동|라멘|소바|짬뽕|짜장|마라탕|팟타이/,'🍜']];return m.find(x=>x[0].test(menu))?.[1]||'🍱';}
function actionFighter(i){return {x:i===0?255:745,y:0,vy:0,vx:0,face:i===0?1:-1,hp:100,energy:100,attackAt:-100,attackHit:false,cooldown:0,stun:0,flash:0,label:'',labelUntil:0,guardSince:-100,wasGuard:false,guard:false,moving:false};}
function actionReleaseAll(){actionKeys.clear();actionSeenKeys.clear();actionPointers.clear();document.querySelectorAll('[data-battle-action]').forEach(b=>b.classList.remove('is-held'));}
function cancelActionDuel(){cancelAnimationFrame(actionFrame);actionFrame=0;clearTimeout(duelTimer);actionReleaseAll();}
function actionHeld(p,a){if([...actionKeys].some(code=>{const b=ACTION_BINDINGS[code];return b&&b[0]===p&&b[1]===a;}))return true;return [...actionPointers.values()].some(v=>v.p===p&&v.a===a);}
function prepareDuel(p,menu){cancelActionDuel();duel={challenger:PEOPLE[p],challengerMenu:menu,defender:result.person,defenderMenu:result.menu,phase:'idle',fighters:[actionFighter(0),actionFighter(1)],clock:0,sudden:false,finishLocked:false,freezeTo:0,noticeAt:-100,notice:'',overlayUntil:0};mode='duel';playLayout(true);$('setupView').hidden=true;$('raceView').hidden=true;$('resultView').hidden=true;$('duelView').hidden=false;setStep(3);[duel.challenger,duel.defender].forEach((n,i)=>{$('battleName'+i).textContent=n;$('battleControlName'+i).textContent=n+' · '+(i===0?'A/D/W/F/G':'←/→/↑/K/L');$('battleMenu'+i).textContent=duel[i===0?'challengerMenu':'defenderMenu'];$('battleFood'+i).textContent=actionFood(duel[i===0?'challengerMenu':'defenderMenu']);$('battleFighter'+i).setAttribute('aria-label',n+'의 '+duel[i===0?'challengerMenu':'defenderMenu']+' 캐릭터');$('battleHp'+i).setAttribute('aria-label',n+' 체력');});$('battleFx').replaceChildren();$('battleStage').classList.remove('shake','is-paused');$('duelStartBtn').hidden=false;$('duelStartBtn').textContent='두 사람 준비 완료 · 결투 시작';$('duelFinishBtn').hidden=true;$('battlePauseBtn').hidden=true;$('duelCancelBtn').textContent='결투 취소 · 기존 점심 유지';actionOverlay('READY?','직접 움직여 공격하고 점프로 머리를 밟으세요. 숙이면 높은 공격을 피해요.');$('battleStatus').textContent='도전자 A/D 이동 · W 점프 · F 공격 · G 숙이기 / 방어자 방향키 이동·점프 · K 공격 · L 숙이기';actionControls(false);actionRender();$('duelHeading').focus({preventScroll:true});}
function actionOverlay(title,sub,flash=false){$('battleOverlay').hidden=false;$('battleOverlay').className='battle-overlay'+(flash?' fight-flash':'');$('battleOverlayTitle').textContent=title;$('battleOverlaySub').textContent=sub;}
function actionControls(on){document.querySelectorAll('[data-battle-action]').forEach(b=>b.disabled=!on);}
function actionStart(){if(mode!=='duel'||!duel||!['idle','paused'].includes(duel.phase))return;window.scrollTo(0,0);const resume=duel.phase==='paused';actionReleaseAll();$('battleStage').classList.remove('is-paused');$('duelStartBtn').hidden=true;$('duelFinishBtn').hidden=true;$('battlePauseBtn').hidden=false;if(resume){duel.phase='fight';actionOverlay('FIGHT!','계속! 서로의 메뉴를 걸고 싸워요.',true);duel.overlayUntil=duel.clock+.7;actionControls(true);actionLast=performance.now();actionFrame=requestAnimationFrame(actionTick);return;}duel.fighters=[actionFighter(0),actionFighter(1)];duel.clock=0;duel.phase='countdown';duel.countStart=performance.now();duel.countCue=-1;actionControls(false);actionRender();actionLast=performance.now();actionFrame=requestAnimationFrame(actionTick);}
function actionPause(reason='잠시 쉬어가요. 준비되면 계속하세요.'){if(mode!=='duel'||!duel||!['fight','countdown'].includes(duel.phase))return;cancelAnimationFrame(actionFrame);actionFrame=0;const wasCountdown=duel.phase==='countdown';duel.phase=wasCountdown?'idle':'paused';actionReleaseAll();actionControls(false);$('battleStage').classList.add('is-paused');$('battlePauseBtn').hidden=true;$('duelStartBtn').hidden=false;$('duelStartBtn').textContent=wasCountdown?'두 사람 준비 완료 · 결투 시작':'두 사람 준비 완료 · 계속하기';actionOverlay('PAUSE',reason);$('battleStatus').textContent=reason;}
function actionDo(p,a){if(mode!=='duel'||!duel||duel.phase!=='fight')return;const f=duel.fighters[p],t=duel.clock;if(f.hp<=0||t<f.stun)return;if(a==='jump'&&f.y<=.2){f.vy=700;beep(p===0?470:520,.045);}if(a==='attack'&&t>=f.cooldown&&!actionHeld(p,'guard')){f.attackAt=t;f.attackHit=false;f.cooldown=t+.52;beep(p===0?240:280,.035);}}
function actionNotice(text){if(!duel)return;$('battleStatus').textContent=text;duel.noticeAt=duel.clock;}
function actionImpact(x,y,text,target){const f=duel.fighters[target];f.label=text;f.labelUntil=duel.clock+.55;const fx=el('i','battle-impact');fx.style.left=x/10+'%';fx.style.bottom=(35+y/360*$('battleStage').clientHeight+40)+'px';$('battleFx').append(fx);setTimeout(()=>fx.remove(),350);if(!reduced){$('battleStage').classList.remove('shake');void $('battleStage').offsetWidth;$('battleStage').classList.add('shake');}}
function actionResolveHit(i){const t=duel.clock,a=duel.fighters[i],b=duel.fighters[1-i],dx=b.x-a.x;if(a.attackHit||t-a.attackAt<.09||t-a.attackAt>.23)return;if(Math.abs(dx)>150||Math.abs(a.y-b.y)>76||dx*a.face<0)return;a.attackHit=true;let damage=18,label='HIT!';if(b.guard&&b.energy>3&&a.y-b.y>26){b.energy=Math.max(0,b.energy-3);b.label='DUCK!';b.labelUntil=t+.5;actionImpact(b.x,b.y+44,'DUCK!',1-i);actionNotice('숙이기 성공! 머리 위 공격을 피했어요.');beep(650,.035);return;}if(b.guard&&b.energy>12){if(t-b.guardSince<.14){damage=0;label='PARRY!';a.stun=t+.4;a.vx=-a.face*230;b.energy=Math.max(0,b.energy-8);actionNotice((i===0?duel.defender:duel.challenger)+' 패링! 타이밍 방어 성공!');}else{damage=4;label='BLOCK';b.energy=Math.max(0,b.energy-18);actionNotice('방어 성공! 피해를 줄였어요. 기력도 확인하세요.');}}else if(b.guard){damage=24;label='BREAK!';b.energy=0;b.guard=false;actionNotice('가드 브레이크! 기력이 떨어지면 방어가 깨져요.');}else actionNotice((i===0?duel.challenger:duel.defender)+'의 공격 적중!');b.hp=Math.max(0,b.hp-damage);b.flash=t+.18;if(damage){b.vx=a.face*(label==='BREAK!'?330:240);b.stun=t+(label==='BREAK!'?.35:.16);duel.freezeTo=t+.055;}actionImpact((a.x+b.x)/2,(a.y+b.y)/2,label,1-i);beep(damage?150:760,.06);duel.hitsThisFrame.push({attacker:i,damage});}
function actionSuddenTie(){duel.sudden=true;duel.fighters.forEach((f,i)=>{f.hp=1;f.x=i===0?255:745;f.y=0;f.vy=0;f.vx=0;f.attackAt=-100;f.cooldown=duel.clock+.65;f.stun=duel.clock+.3;f.guard=false;});actionReleaseAll();actionOverlay('DOUBLE K.O.','동시 적중! 체력 1로 서든데스 재대결!',true);duel.overlayUntil=duel.clock+1.4;actionNotice('동시 적중은 무승부! 다음 유효타로 직접 승부를 내세요.');}
function actionTick(now){if(mode!=='duel'||!duel||!['countdown','fight'].includes(duel.phase))return;if(document.hidden&&!netActionOnline()){actionPause('화면을 벗어나 결투를 멈췄어요. 준비되면 계속하세요.');return;}if(document.querySelector('dialog[open]')&&!netActionOnline()){actionPause('도움말을 확인하는 동안 잠시 멈췄어요.');return;}if(duel.phase==='countdown'){const left=3-Math.floor((now-duel.countStart)/500);if(left>0){if(duel.countCue!==left){duel.countCue=left;actionOverlay(String(left),'키를 확인하세요! 1P: A/D/W/F/G · 2P: 방향키/K/L');beep(350+left*80,.07);}actionLast=now;actionFrame=requestAnimationFrame(actionTick);return;}duel.phase='fight';actionReleaseAll();actionControls(true);actionOverlay('FIGHT!','직접 움직이고 공격하세요!',true);duel.overlayUntil=.75;actionNotice('시작! 두 사람이 직접 조작해야 승부가 납니다.');actionLast=now;beep(680,.12);}
 const dt=Math.min(.04,Math.max(0,(now-actionLast)/1000));actionLast=now;duel.clock+=dt;const t=duel.clock;
 if(t>=duel.freezeTo){duel.fighters.forEach((f,i)=>{const other=duel.fighters[1-i];f.face=other.x>=f.x?1:-1;const guard=actionHeld(i,'guard')&&f.energy>0&&t-f.attackAt>.25&&f.y<5&&t>=f.stun;if(guard&&!f.wasGuard)f.guardSince=t;f.wasGuard=guard;f.guard=guard;f.energy=Math.max(0,Math.min(100,f.energy+(guard?-22:18)*dt));const moving=(actionHeld(i,'right')?1:0)-(actionHeld(i,'left')?1:0);f.moving=!!moving&&t>=f.stun;if(t>=f.stun){f.vx=moving*(guard?85:320);if(t-f.attackAt<.23)f.vx*=.25;}else f.vx*=Math.pow(.1,dt);f.prevY=f.y;f.x+=f.vx*dt;f.vy-=1700*dt;f.y+=f.vy*dt;if(f.y<=0){f.y=0;f.vy=0;}f.x=Math.max(100,Math.min(900,f.x));});
 const a=duel.fighters[0],b=duel.fighters[1],d=b.x-a.x;duel.hitsThisFrame=[];actionResolveStomp(0);actionResolveStomp(1);if(Math.abs(d)<108&&Math.abs(a.y-b.y)<(a.guard||b.guard?40:70)){const push=(108-Math.abs(d))/2,s=d>=0?1:-1;a.x=Math.max(100,Math.min(900,a.x-push*s));b.x=Math.max(100,Math.min(900,b.x+push*s));}actionResolveHit(0);actionResolveHit(1);const hits=duel.hitsThisFrame.filter(h=>h.damage>0);if(a.hp<=0&&b.hp<=0){actionSuddenTie();}else if(a.hp<=0||b.hp<=0){actionFinish(a.hp>0?0:1,'K.O.');}else if(duel.sudden&&hits.length){if(hits.length>1)actionSuddenTie();else actionFinish(hits[0].attacker,'서든데스 유효타');}
 }
 if(duel.phase!=='fight')return;if(duel.clock>=45&&!duel.sudden){const [a,b]=duel.fighters;if(Math.abs(a.hp-b.hp)>.1){actionFinish(a.hp>b.hp?0:1,'시간 종료 · 남은 체력 우세');return;}duel.sudden=true;actionOverlay('SUDDEN DEATH','체력 동률! 다음 유효타를 먼저 맞히면 승리!',true);duel.overlayUntil=t+1.4;actionNotice('서든데스! 다음 유효타 한 번으로 승부가 납니다.');beep(850,.15);}
 if(t>duel.overlayUntil)$('battleOverlay').hidden=true;actionRender();actionFrame=requestAnimationFrame(actionTick);
}
function actionRender(){if(!duel?.fighters)return;const h=$('battleStage').clientHeight;duel.fighters.forEach((f,i)=>{const n=$('battleFighter'+i);n.style.left=f.x/10+'%';n.style.bottom=35+f.y/360*h+'px';n.classList.toggle('is-moving',f.moving&&f.y<1);n.classList.toggle('is-air',f.y>1);n.classList.toggle('is-guard',f.guard&&duel.phase==='fight');n.classList.toggle('is-attacking',duel.phase==='fight'&&duel.clock-f.attackAt>=.05&&duel.clock-f.attackAt<.25);n.classList.toggle('is-hit',duel.clock<f.flash);n.classList.toggle('is-ko',f.hp<=0);n.querySelector('.battle-sprite').style.scale=f.face+' 1';n.querySelector('.battle-hit-label').style.scale=f.face+' 1';n.querySelector('.battle-shield').style.scale=f.face+' 1';$('battleHpFill'+i).style.width=f.hp+'%';$('battleHp'+i).setAttribute('aria-valuenow',String(Math.round(f.hp)));$('battleHpText'+i).textContent=String(Math.round(f.hp));$('battleEnergy'+i).style.width=f.energy+'%';$('battleHit'+i).textContent=duel.clock<f.labelUntil?f.label:'';});$('battleTime').textContent=duel.sudden?'SD':String(Math.max(0,Math.ceil(45-duel.clock)));$('battleTime').parentElement.classList.toggle('danger',45-duel.clock<10||duel.sudden);}
function actionFinish(winner,reason){if(!duel||duel.finishLocked)return;duel.finishLocked=true;duel.phase='done';cancelAnimationFrame(actionFrame);actionFrame=0;actionReleaseAll();actionControls(false);const name=winner===0?duel.challenger:duel.defender,menu=winner===0?duel.challengerMenu:duel.defenderMenu;result.person=name;result.menu=menu;result.source='duel';result.duelCount=(result.duelCount||0)+1;result.time=new Date().toISOString();result.verdict=name+' 액션 결투 승리 · '+reason+' · 남은 체력 '+Math.ceil(duel.fighters[winner].hp);saveRound();actionRender();actionOverlay(name+' 승리!','최종 점심: '+menu+' · '+reason);$('battleStatus').textContent='승부 확정! '+name+'의 '+menu+' 메뉴가 최종 점심입니다.';$('duelStartBtn').hidden=true;$('battlePauseBtn').hidden=true;$('duelFinishBtn').hidden=false;$('duelCancelBtn').textContent='확정된 결과로 돌아가기';beep(780,.18);if(!reduced)confetti();}
$('duelStartBtn').addEventListener('click',()=>actionStart());$('battlePauseBtn').addEventListener('click',()=>actionPause());$('duelFinishBtn').addEventListener('click',()=>{cancelActionDuel();renderResult();});$('duelCancelBtn').addEventListener('click',()=>{cancelActionDuel();if(duel)duel.phase='cancelled';renderResult();});
function actionTyping(e){return !!document.querySelector('dialog[open]')||e.target?.matches?.('input,textarea,select,[contenteditable="true"]');}
document.addEventListener('keydown',e=>{const b=ACTION_BINDINGS[e.code];if(!b||mode!=='duel'||actionTyping(e)||!duel||duel.phase!=='fight')return;e.preventDefault();if(e.repeat||actionSeenKeys.has(e.code))return;actionSeenKeys.add(e.code);actionKeys.add(e.code);if(['attack','jump'].includes(b[1]))actionDo(b[0],b[1]);});
document.addEventListener('keyup',e=>{if(ACTION_BINDINGS[e.code]){actionKeys.delete(e.code);actionSeenKeys.delete(e.code);if(mode==='duel')e.preventDefault();}});
document.querySelectorAll('[data-battle-action]').forEach(button=>{button.type='button';const p=Number(button.dataset.battlePlayer),a=button.dataset.battleAction;button.addEventListener('pointerdown',e=>{if(button.disabled||mode!=='duel'||duel?.phase!=='fight'||(e.pointerType==='mouse'&&e.button!==0))return;e.preventDefault();try{button.setPointerCapture(e.pointerId);}catch{}actionPointers.set(e.pointerId,{p,a,button});button.classList.add('is-held');if(['attack','jump'].includes(a))actionDo(p,a);});const release=e=>{actionPointers.delete(e.pointerId);if(![...actionPointers.values()].some(v=>v.button===button))button.classList.remove('is-held');};button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);button.addEventListener('click',e=>{if(e.detail===0&&!button.disabled){e.preventDefault();if(['attack','jump'].includes(a))actionDo(p,a);}});});
window.addEventListener('pointerup',e=>{const v=actionPointers.get(e.pointerId);if(v){actionPointers.delete(e.pointerId);v.button.classList.remove('is-held');}});window.addEventListener('pointercancel',()=>actionReleaseAll());window.addEventListener('blur',()=>{if(netActionOnline())netReleaseLocalCombat();else actionPause('화면 포커스를 벗어나 잠시 멈췄어요. 준비되면 계속하세요.');});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&mode==='race'){cancelAnimationFrame(frame);tick();}if(document.hidden&&mode==='duel'){if(netActionOnline())netReleaseLocalCombat();else actionPause('화면을 벗어나 결투를 멈췄어요. 다시 준비하고 계속하세요.');}});


/* ONLINE_ACTION_BRIDGE_V1 */
// Feet crossing the opponent's actual head height on the way down is a real
// collision. Crouching lowers that head/hitbox and softens the landing blow.
function actionResolveStomp(i){
 if(!duel||duel.phase!=='fight')return;
 const a=duel.fighters[i],b=duel.fighters[1-i],t=duel.clock,head=b.y+(b.guard?44:78),oldHead=(b.prevY??b.y)+(b.guard?44:78);
 if(a.hp<=0||b.hp<=0||a.vy>=-65||t<a.stun||t<(a.stompAfter||0)||Math.abs(a.x-b.x)>86||(a.prevY??a.y)<oldHead-1||a.y>head)return;
 const guarded=b.guard&&b.energy>15,damage=guarded?8:26;
 a.y=head+2;a.vy=490;a.stompAfter=t+.6;a.stompUntil=t+.38;
 b.hp=Math.max(0,b.hp-damage);b.flash=t+.24;b.stun=t+(guarded?.14:.28);b.vx=(b.x>=a.x?1:-1)*190;
 if(guarded)b.energy=Math.max(0,b.energy-20);
 duel.freezeTo=t+.045;
 actionImpact(b.x,head,guarded?'CROUCH BLOCK':'STOMP! -26',1-i);
 actionNotice((i===0?duel.challenger:duel.defender)+(guarded?'의 내려찍기! 숙여서 피해를 줄였어요.':'의 머리 밟기! 26 피해 + 다시 점프!'));
 beep(guarded?340:120,.08);duel.hitsThisFrame.push({attacker:i,damage});
}
let netCombatHeld=[new Set(),new Set()],netCombatInputAt=[0,0];
const netActionKeys=new Set(),netActionPointers=new Map();
let netActionApplying=false,netActionFlushQueued=false;
const netActionMap={KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',KeyW:'jump',ArrowUp:'jump',KeyF:'attack',KeyK:'attack',KeyG:'guard',KeyL:'guard'};
const netHeldActions=['left','right','guard'];
const netOfflineActionHeld=actionHeld,netOfflineActionDo=actionDo,netOfflineActionRender=actionRender,netOfflineActionTick=actionTick,netOfflineActionFinish=actionFinish,netOfflineActionStart=actionStart,netOfflineActionPause=actionPause,netOfflineCancelAction=cancelActionDuel,netOfflinePrepareDuel=prepareDuel;
function netActionOnline(){return typeof netIsActive==='function'&&netIsActive();}
function netActionHost(){return typeof netIsHost==='function'&&netIsHost();}
function netActionSide(){const side=typeof netSelfSide==='function'?netSelfSide():-1;return side===0||side===1?side:-1;}
function netActionSend(action,held){if(netActionOnline()&&typeof netSendCombat==='function')netSendCombat(action,held);}
function netActionLocalHeld(){const held=new Set();for(const code of netActionKeys){const a=netActionMap[code];if(netHeldActions.includes(a))held.add(a);}for(const value of netActionPointers.values())if(netHeldActions.includes(value.action))held.add(value.action);return [...held];}
function netActionFlush(){netActionFlushQueued=false;if(!netActionOnline()||mode!=='duel'||netActionSide()<0)return;netActionSend('sync',netActionLocalHeld());}
function netActionQueueFlush(){if(netActionFlushQueued)return;netActionFlushQueued=true;queueMicrotask(netActionFlush);}
function netReleaseLocalCombat(){netActionKeys.clear();netActionPointers.clear();document.querySelectorAll('[data-battle-action]').forEach(b=>b.classList.remove('is-held'));if(netActionOnline()&&netActionSide()>=0)netActionSend('sync',[]);}
function netReleaseCombatSide(side){if(side!==0&&side!==1)return;netCombatHeld[side].clear();netCombatInputAt[side]=0;}
function netResetCombatInputs(){netReleaseLocalCombat();netReleaseCombatSide(0);netReleaseCombatSide(1);}
function netApplyCombatInput(side,packet){
 if(!netActionOnline()||!netActionHost()||(side!==0&&side!==1)||!packet||typeof packet!=='object')return false;
 const action=packet.action;
 if(action==='sync'){
  if(!Array.isArray(packet.held)||packet.held.length>3||packet.held.some(a=>!netHeldActions.includes(a)))return false;
  // Releases are accepted even while paused/counting down, so no key can stick.
  netCombatHeld[side]=new Set(packet.held);netCombatInputAt[side]=performance.now();return true;
 }
 if(netHeldActions.includes(action)){
  if(typeof packet.held!=='boolean')return false;
  if(packet.held)netCombatHeld[side].add(action);else netCombatHeld[side].delete(action);
  netCombatInputAt[side]=performance.now();return true;
 }
 if(!['attack','jump'].includes(action)||packet.held!==true||mode!=='duel'||!duel||duel.phase!=='fight')return false;
 netCombatInputAt[side]=performance.now();netActionApplying=true;try{netOfflineActionDo(side,action);}finally{netActionApplying=false;}return true;
}
actionHeld=function(side,action){
 if(!netActionOnline())return netOfflineActionHeld(side,action);
 if(!netActionHost()||(side!==0&&side!==1))return false;
 if(performance.now()-netCombatInputAt[side]>900)netCombatHeld[side].clear();
 return netCombatHeld[side].has(action);
};
actionDo=function(side,action){
 if(!netActionOnline()||netActionApplying)return netOfflineActionDo(side,action);
 if(netActionSide()>=0&&['attack','jump'].includes(action))netActionSend(action,true);
};
function netRefreshCombatControls(){
 if(!netActionOnline()||!duel)return;
 const side=netActionSide(),fighting=duel.phase==='fight';
 document.querySelectorAll('[data-battle-action]').forEach(button=>{
  const own=Number(button.dataset.battlePlayer)===side;
  button.disabled=!fighting||!own;
  button.dataset.netRemote=String(!own);
  if(!own)button.title=side<0?'이번 결투를 관전 중이에요.':'상대방이 자신의 기기에서 조작해요.';else button.removeAttribute('title');
 });
 const ready=$('duelStartBtn');
 if(ready){ready.hidden=!['idle','paused'].includes(duel.phase)||side<0;ready.textContent=duel.phase==='paused'?'내 캐릭터 계속할 준비 완료':'내 캐릭터 준비 완료';}
 const pause=$('battlePauseBtn');if(pause){pause.hidden=!['fight','countdown'].includes(duel.phase)||(side<0&&!netActionHost());pause.disabled=false;}
 const cancel=$('duelCancelBtn');if(cancel)cancel.hidden=side<0&&!netActionHost()&&duel.phase!=='done';
 const finish=$('duelFinishBtn');if(finish)finish.hidden=duel.phase!=='done';
 document.querySelectorAll('.battle-control-panel').forEach((panel,i)=>{panel.classList.toggle('net-control-own',side===i);panel.classList.toggle('net-control-other',side!==i);});
}
actionRender=function(){
 netOfflineActionRender();
 if(duel?.fighters)duel.fighters.forEach((fighter,i)=>{const node=$('battleFighter'+i);node.classList.toggle('is-crouching',fighter.guard&&duel.phase==='fight');node.classList.toggle('is-falling',fighter.y>2&&fighter.vy<-65);node.classList.toggle('is-stomping',duel.clock<(fighter.stompUntil||0));});
 if(netActionOnline()){
  netRefreshCombatControls();
  if(netActionHost()&&!netActionApplying&&typeof netPublishCombat==='function')netPublishCombat(false);
 }
};
actionTick=function(now){
 if(netActionOnline()&&!netActionHost()){cancelAnimationFrame(actionFrame);actionFrame=0;return;}
 const value=netOfflineActionTick(now);if(netActionOnline()&&netActionHost()&&typeof netPublishCombat==='function')netPublishCombat(false);return value;
};
actionFinish=function(winner,reason){
 if(netActionOnline()&&!netActionHost())return;
 const wasFinished=duel?.finishLocked;
 netOfflineActionFinish(winner,reason);
 if(netActionOnline()&&!wasFinished&&duel?.finishLocked&&typeof netRoundFinished==='function')netRoundFinished();
};
actionStart=function(){
 if(netActionOnline()){if(netActionSide()>=0&&typeof netReadyToFight==='function')netReadyToFight();return;}
 return netOfflineActionStart();
};
function netStartCombatHost(){
 if(!netActionOnline()||!netActionHost()||mode!=='duel'||!duel)return false;
 if(!['idle','paused'].includes(duel.phase))return false;
 netResetCombatInputs();netOfflineActionStart();netRefreshCombatControls();if(typeof netPublishCombat==='function')netPublishCombat(true);return true;
}
actionPause=function(reason){
 if(!netActionOnline())return netOfflineActionPause(reason);
 netReleaseLocalCombat();
 if(netActionHost()){netOfflineActionPause(reason);netRefreshCombatControls();if(typeof netPublishCombat==='function')netPublishCombat(true);}
 else if(netActionSide()>=0)netActionSend('pause',true);
};
cancelActionDuel=function(){netResetCombatInputs();return netOfflineCancelAction();};
prepareDuel=function(...args){
 netResetCombatInputs();netActionApplying=true;let value;try{value=netOfflinePrepareDuel(...args);}finally{netActionApplying=false;}
 netRefreshCombatControls();return value;
};
function netGetCombatState(){
 if(!duel)return null;
 return {duel:JSON.parse(JSON.stringify(duel)),overlay:{title:$('battleOverlayTitle')?.textContent||'',sub:$('battleOverlaySub')?.textContent||'',hidden:!!$('battleOverlay')?.hidden},status:$('battleStatus')?.textContent||'',paused:duel.phase==='paused'};
}
function netReceiveCombatState(data){
 if(!netActionOnline()||netActionHost()||mode!=='duel'||!data||typeof data!=='object'||!data.duel)return false;
 const incoming=data.duel;
 if(!Array.isArray(incoming.fighters)||incoming.fighters.length!==2||!['idle','countdown','fight','paused','done'].includes(incoming.phase)||!Number.isFinite(incoming.clock))return false;
 if(duel?.id&&incoming.id&&duel.id!==incoming.id)return false;
 if(incoming.fighters.some(f=>!f||['x','y','vy','vx','hp','energy','attackAt','cooldown','stun','flash','labelUntil'].some(k=>!Number.isFinite(f[k]))))return false;
 cancelAnimationFrame(actionFrame);actionFrame=0;
 const copy=JSON.parse(JSON.stringify(incoming));copy.clock=Math.max(0,copy.clock);
 copy.fighters.forEach(f=>{f.x=Math.max(0,Math.min(1000,f.x));f.y=Math.max(0,Math.min(240,f.y));f.hp=Math.max(0,Math.min(100,f.hp));f.energy=Math.max(0,Math.min(100,f.energy));f.label=String(f.label||'').slice(0,32);});
 duel=copy;netActionApplying=true;
 try{
  actionRender();
  const overlay=data.overlay||{};$('battleOverlayTitle').textContent=String(overlay.title||'').slice(0,80);$('battleOverlaySub').textContent=String(overlay.sub||'').slice(0,200);$('battleOverlay').hidden=!!overlay.hidden;$('battleOverlay').className='battle-overlay';
  $('battleStatus').textContent=(netActionSide()<0?'관전 중 · ':'')+String(data.status||'').slice(0,220);
  $('battleStage').classList.toggle('is-paused',duel.phase==='paused');netRefreshCombatControls();
 }finally{netActionApplying=false;}
 return true;
}

// Stop the original two-person keyboard/pointer listeners before they run in
// online rooms. Both control key families now operate ONLY the sender's fighter.
document.addEventListener('keydown',e=>{
 if(!netActionOnline()||mode!=='duel'||!netActionMap[e.code]||actionTyping(e))return;
 e.preventDefault();e.stopImmediatePropagation();
 if(netActionSide()<0||!duel||duel.phase!=='fight'||e.repeat||netActionKeys.has(e.code))return;
 netActionKeys.add(e.code);const action=netActionMap[e.code];
 if(action==='attack'||action==='jump')netActionSend(action,true);else netActionQueueFlush();
},true);
document.addEventListener('keyup',e=>{
 if(!netActionOnline()||!netActionMap[e.code])return;
 const had=netActionKeys.delete(e.code);
 if(mode==='duel'&&!actionTyping(e)){e.preventDefault();e.stopImmediatePropagation();}
 if(had)netActionQueueFlush();
},true);
document.addEventListener('pointerdown',e=>{
 if(!netActionOnline()||mode!=='duel')return;
 const button=e.target?.closest?.('[data-battle-action]');if(!button)return;
 e.preventDefault();e.stopImmediatePropagation();
 const side=netActionSide(),action=button.dataset.battleAction;
 if(side<0||Number(button.dataset.battlePlayer)!==side||button.disabled||duel?.phase!=='fight'||(e.pointerType==='mouse'&&e.button!==0))return;
 try{button.setPointerCapture(e.pointerId);}catch{}
 netActionPointers.set(e.pointerId,{action,button});button.classList.add('is-held');
 if(action==='attack'||action==='jump')netActionSend(action,true);else netActionQueueFlush();
},true);
function netActionPointerRelease(e){
 if(!netActionOnline())return;const prior=netActionPointers.get(e.pointerId);if(!prior)return;
 e.preventDefault();e.stopImmediatePropagation();netActionPointers.delete(e.pointerId);
 if(![...netActionPointers.values()].some(x=>x.button===prior.button))prior.button.classList.remove('is-held');netActionQueueFlush();
}
window.addEventListener('pointerup',netActionPointerRelease,true);window.addEventListener('pointercancel',netActionPointerRelease,true);document.addEventListener('lostpointercapture',netActionPointerRelease,true);
document.addEventListener('click',e=>{
 if(!netActionOnline()||mode!=='duel')return;const button=e.target?.closest?.('[data-battle-action]');if(!button)return;
 e.preventDefault();e.stopImmediatePropagation();
 if(e.detail!==0||button.disabled||Number(button.dataset.battlePlayer)!==netActionSide()||duel?.phase!=='fight')return;
 const action=button.dataset.battleAction;
 if(action==='attack'||action==='jump')netActionSend(action,true);
},true);
window.addEventListener('blur',()=>{if(netActionOnline()&&mode==='duel')netReleaseLocalCombat();},true);
document.addEventListener('visibilitychange',()=>{if(netActionOnline()&&document.hidden)netReleaseLocalCombat();},true);
setInterval(()=>{if(netActionOnline()&&mode==='duel'&&duel?.phase==='fight'&&netActionSide()>=0)netActionFlush();},200);


/* DEPARTMENT_RACE_V1 */
