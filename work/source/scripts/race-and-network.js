
let deptRace=null,deptLoop=0,deptFrame=0,deptFinishTimer=0,deptView=null,deptRows=new Map(),deptRemoteAt=0,deptLastNotice='';
const deptCourseLength=1200,deptTickStep=.04,deptHardLimit=30;
const deptGateDefinitions=[
 {at:170,type:'hurdle',icon:'🚧',label:'과제 더미',penalty:.62},
 {at:350,type:'slime',icon:'🫠',label:'미끄러운 바닥',penalty:.75},
 {at:530,type:'turnstile',icon:'🚪',label:'닫히는 출입문',penalty:.68},
 {at:710,type:'fork',icon:'↗️',label:'운명의 갈림길',penalty:.6},
 {at:890,type:'portal',icon:'🌀',label:'점심 포털',penalty:0},
 {at:1070,type:'wind',icon:'💨',label:'역풍 구간',penalty:.5}
];
function deptHash(value){let h=2166136261;for(const ch of String(value)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}h^=h>>>16;h=Math.imul(h,2246822507);h^=h>>>13;return (h>>>0)/4294967296;}
function deptCourse(seed){return [...deptGateDefinitions].sort((a,b)=>deptHash(seed+':gate:'+a.type)-deptHash(seed+':gate:'+b.type)).map((gate,i)=>({...gate,id:'gate'+i,at:170+i*180+Math.round((deptHash(seed+':position:'+i)-.5)*36)}));}
function deptAuthority(){return typeof netIsHost==='function'?netIsHost():true;}
function deptOwnId(){return typeof netSelfId==='function'?String(netSelfId()||''):'';}
function deptOption(value){return deptById.get(value)||deptByName.get(deptSearchKey(value))||deptById.get('business');}
function deptText(node,value){if(node&&node.textContent!==String(value))node.textContent=String(value);}
function deptMake(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function deptFood(menu){const s=String(typeof menu==='object'?(menu?.name||''):menu||'');if(/피자/.test(s))return '🍕';if(/치킨|닭/.test(s))return '🍗';if(/버거/.test(s))return '🍔';if(/초밥|스시/.test(s))return '🍣';if(/돈[까가]스|카츠/.test(s))return '🍱';if(/면|국수|파스타|우동|라멘|짜장|짬뽕/.test(s))return '🍜';if(/샐러드/.test(s))return '🥗';if(/떡|분식/.test(s))return '🍢';if(/고기|삼겹|갈비/.test(s))return '🥩';if(/국|탕|찌개/.test(s))return '🍲';return '🍚';}
function deptMenuName(menu){return String(typeof menu==='object'?(menu?.name||'오늘의 메뉴'):menu||'오늘의 메뉴').slice(0,40);}
function deptEnsureUI(){
 if(deptView)return;
 deptView=deptMake('section','');deptView.id='deptRaceView';deptView.hidden=true;deptView.setAttribute('aria-label','실시간 전공 랜덤 레이스');
 deptView.innerHTML='<div class="dept-mast"><span>DAEGU UNIVERSITY · LUNCH GRAND PRIX</span><span class="dept-live">LIVE MULTIPLAYER</span></div><div class="dept-hero"><div><div class="dept-eyebrow">RANDOM COURSE / REAL PLAYERS</div><h2 class="dept-title" tabindex="-1">오늘의 점심은<br><em>달리는 자의 것.</em></h2><p class="dept-subtitle">랜덤 코스 × 전공 패시브 × 당신의 점프와 대시<br>레이스 1등은 왕관 획득! 이어지는 쟁탈전의 마지막 생존자가 메뉴를 결정해요.</p></div><div class="dept-clock"><b id="deptClock">3</b><span id="deptClockLabel">GET READY</span></div></div><div class="dept-announcer" role="status" aria-live="polite"><span id="deptAnnouncement">모두 같은 출발선! 각자 자신의 기기에서 조작해요.</span></div><div class="dept-arena"><div class="dept-lanes" id="deptLanes"></div><div class="dept-overlay" id="deptOverlay" aria-hidden="true"><b id="deptOverlayTitle">3</b><span id="deptOverlaySub">점프와 대시를 준비하세요</span></div></div><div class="dept-controls"><div class="dept-control-copy"><strong id="deptControlName">내 레이서 준비 중</strong><span id="deptControlHint">점프 Space · 대시 Shift<br>장애물 바로 앞에서 점프!</span></div><button class="dept-input" id="deptJump" data-action="jump" type="button">점프 ↑<small>SPACE · 준비 완료</small></button><button class="dept-input" id="deptDash" data-action="dash" type="button">대시 →<small>SHIFT · 준비 완료</small></button></div><div class="dept-credit">학과·전공 목록은 <a href="https://www.daegu.ac.kr/intro/1" target="_blank" rel="noopener noreferrer">대구대학교 공식 대학 안내</a>를 참고했습니다. 시설물관리는 별도 역할 캐릭터입니다. 모든 패시브는 전공·역할에서 착안한 게임 창작 능력이며, 같은 캐릭터도 함께 선택할 수 있어요.</div>';
 document.getElementById('game').append(deptView);
 deptView.querySelectorAll('.dept-input').forEach(button=>button.addEventListener('click',()=>deptInput(button.dataset.action)));
}
function deptBuildLanes(){
 const target=deptView.querySelector('#deptLanes');target.replaceChildren();deptRows.clear();
 for(const lane of deptRace.lanes){const option=deptOption(lane.department),row=deptMake('div','dept-lane');row.style.setProperty('--dept-color',option.color);row.dataset.own=String(lane.id===deptOwnId());
  const info=deptMake('div','dept-info'),person=deptMake('div','dept-person'),rank=deptMake('span','dept-rank','—'),name=deptMake('span','dept-name',lane.name);person.append(rank,name);const dep=deptMake('div','dept-department',option.icon+' '+option.short);dep.title=option.name;const passive=deptMake('div','dept-passive-label');passive.title=option.description;passive.append(deptMake('i'),deptMake('span','',option.passive));info.append(person,dep,passive);
  const track=deptMake('div','dept-track'),progress=deptMake('div','dept-progress'),next=deptMake('div','dept-next');track.append(progress,next);const gates=[];
  deptRace.obstacles.forEach(gate=>{const n=deptMake('span','dept-gate',gate.icon);n.style.left=(gate.at/deptCourseLength*100)+'%';n.title=gate.label;track.append(n);gates.push(n);});
  const runner=deptMake('div','dept-runner'),food=deptMake('span','dept-food',deptFood(lane.menu));runner.innerHTML=deptAvatarSvg(lane.department);runner.append(food);const fx=deptMake('span','dept-fx');fx.hidden=true;runner.append(fx);track.append(runner);
  const meters=deptMake('div','dept-meters');meters.append(deptMake('b','','0'),deptMake('small','',lane.menu));meters.title=lane.menu;row.append(info,track,meters);target.append(row);deptRows.set(lane.id,{row,rank,passive,track,runner,progress,next,fx,meters:meters.querySelector('b'),gates});
 }
}
function deptStart(spec){
 if(!spec||typeof spec.id!=='string'||!Array.isArray(spec.participants)||!spec.participants.length||spec.participants.length>8)return false;
 if(deptRace?.id===spec.id){deptEnsureUI();deptView.hidden=false;return true;}
 deptCancel();deptEnsureUI();const startAt=Number.isFinite(spec.startAt)?spec.startAt:Date.now()+3500;
 const participants=spec.participants.filter(p=>p&&typeof p.id==='string').slice(0,8);if(!participants.length||new Set(participants.map(p=>p.id)).size!==participants.length)return false;
 deptRace={id:spec.id,seed:String(spec.seed??spec.id),startAt,elapsed:0,phase:'countdown',seq:0,obstacles:deptCourse(String(spec.seed??spec.id)),lanes:participants.map((p,i)=>{const option=deptOption(p.department||(typeof netDepartment==='function'?netDepartment(p.id):'business'));return {id:p.id,name:String(p.name||'참가자').slice(0,24),menu:deptMenuName(p.menu),department:option.id,index:i,distance:0,speed:0,nextObstacle:0,jumpUntil:0,jumpReadyAt:0,dashUntil:0,dashReadyAt:0,stunUntil:0,boostUntil:0,passiveUsed:false,passiveAt:0,effect:'',effectUntil:0,finishedAt:null};}),winnerId:null,finishedAt:null};
 deptRemoteAt=performance.now();deptLastNotice='';deptBuildLanes();
 if(typeof cancelActionDuel==='function')cancelActionDuel();if(typeof frame!=='undefined')cancelAnimationFrame(frame);if(typeof mode!=='undefined')mode='race';
 for(const id of ['setupView','raceView','resultView','duelView']){const view=document.getElementById(id);if(view)view.hidden=true;}
 deptView.hidden=false;if(typeof setStep==='function')setStep(2);if(typeof playLayout==='function')playLayout(true);const status=document.getElementById('dossierStatus');if(status)status.textContent='실시간 전공 랜덤 레이스';
 deptView.querySelector('.dept-title').focus({preventScroll:true});deptRender();
 if(deptAuthority()){deptLoop=setInterval(deptHostTick,50);deptHostTick();}
 deptFrame=requestAnimationFrame(deptAnimate);return true;
}
function deptNotice(lane,text,t){lane.effect=text;lane.effectUntil=t+1.9;}
function deptUsePassive(lane,t,text){lane.passiveUsed=true;lane.passiveAt=t;deptNotice(lane,'✨ '+deptOption(lane.department).passive+' · '+text,t);}
function deptHazard(lane,gate,t){
 let penalty=gate.penalty;
 if((t<lane.jumpUntil&&gate.type!=='wind')||(t<lane.dashUntil&&gate.type==='wind')){deptNotice(lane,gate.type==='wind'?'💨 역풍 돌파!':'↑ 점프 성공!',t);return;}
 if(!lane.passiveUsed&&lane.department==='tourism'){deptUsePassive(lane,t,'우회 성공!');lane.distance+=10;return;}
 if(!lane.passiveUsed&&lane.department==='accounting'){penalty*=.5;deptUsePassive(lane,t,'감속 절반!');}
 else if(!lane.passiveUsed&&(lane.department==='business'||lane.department==='hotel')){lane.boostUntil=t+1.7;deptUsePassive(lane,t,'회복 부스트!');}
 else deptNotice(lane,gate.icon+' '+gate.label+'!',t);
 lane.stunUntil=Math.max(lane.stunUntil,t+penalty);
}
function deptGate(lane,gate,t){
 if(gate.type==='portal'){let bonus=15+deptHash(deptRace.seed+'portal'+lane.id)*14;if(!lane.passiveUsed&&lane.department==='international'){bonus+=18;deptUsePassive(lane,t,'지름길 발견!');}else deptNotice(lane,'🌀 포털 +'+Math.round(bonus)+'m',t);lane.distance+=bonus;return;}
 if(gate.type==='fork'){const unlucky=deptHash(deptRace.seed+'fork'+lane.id)<.5;if(!lane.passiveUsed&&lane.department==='korean'){deptUsePassive(lane,t,unlucky?'길 안내 성공!':'정확한 지름길!');lane.distance+=unlucky?8:22;return;}if(unlucky){deptNotice(lane,'↗️ 앗, 돌아가는 길!',t);lane.stunUntil=t+gate.penalty;}else{lane.distance+=15;deptNotice(lane,'↗️ 지름길 +15m!',t);}return;}
 deptHazard(lane,gate,t);
}
function deptSimulate(dt,t){
 const finishers=[];
 for(const lane of deptRace.lanes){if(lane.finishedAt!==null)continue;
  let roll=.94+deptHash(deptRace.seed+':speed:'+lane.id+':'+Math.floor(t/.75))*.12;
  if(!lane.passiveUsed&&lane.department==='economics'&&t>=3&&roll<.98){lane.boostUntil=t+1.25;deptUsePassive(lane,t,'안정 성장!');}
  if(!lane.passiveUsed&&lane.department==='japanese'&&t>=8){lane.boostUntil=t+1.25;deptUsePassive(lane,t,'집중 가속!');}
  if(!lane.passiveUsed&&t>=21){lane.distance+=17;deptUsePassive(lane,t,'막판 스퍼트!');}
  const before=lane.distance;let velocity=50*roll;if(t<lane.stunUntil)velocity*=.25;if(t<lane.dashUntil)velocity*=1.65;if(t<lane.boostUntil)velocity*=1.35;velocity*=deptItemVelocity(lane,t);lane.speed=velocity;lane.distance+=velocity*dt;
  while(lane.nextObstacle<deptRace.obstacles.length&&lane.distance>=deptRace.obstacles[lane.nextObstacle].at){const gate=deptRace.obstacles[lane.nextObstacle++];deptGate(lane,gate,t);}
  if(lane.distance>=deptCourseLength){lane.finishedAt=t-dt+dt*Math.min(1,Math.max(0,(deptCourseLength-before)/Math.max(.01,lane.distance-before)));lane.distance=deptCourseLength;lane.speed=0;finishers.push(lane);}
 }
 if(finishers.length){finishers.sort((a,b)=>a.finishedAt-b.finishedAt||deptHash(deptRace.seed+a.id)-deptHash(deptRace.seed+b.id));deptFinish(finishers[0],t);}
}
function deptHostTick(){
 if(!deptRace||!deptAuthority()||deptRace.phase==='finished')return;
 const target=Math.max(0,Math.min(deptHardLimit,(Date.now()-deptRace.startAt)/1000));
 if(Date.now()>=deptRace.startAt)deptRace.phase='running';
 while(deptRace.phase==='running'&&deptRace.elapsed+deptTickStep<=target+.00001){deptRace.elapsed=Math.round((deptRace.elapsed+deptTickStep)*100000)/100000;deptSimulate(deptTickStep,deptRace.elapsed);}
 if(deptRace.phase==='running'&&target>=deptHardLimit-.001){const sorted=[...deptRace.lanes].sort((a,b)=>b.distance-a.distance||deptHash(deptRace.seed+a.id)-deptHash(deptRace.seed+b.id));deptFinish(sorted[0],deptRace.elapsed);}
 deptRace.seq++;if(typeof netPublishRace==='function')netPublishRace(false);
}
function deptFinish(lane,t){
 if(!deptRace||deptRace.phase==='finished')return;deptRace.phase='finished';deptRace.winnerId=lane.id;deptRace.finishedAt=t;lane.finishedAt??=t;lane.distance=deptCourseLength;lane.speed=0;clearInterval(deptLoop);deptLoop=0;
 deptRender();if(typeof netPublishRace==='function')netPublishRace(true);
 const id=deptRace.id;deptFinishTimer=setTimeout(()=>{if(deptRace?.id===id&&deptAuthority()&&typeof netRaceFinished==='function')netRaceFinished(lane.id);},2700);
}
function deptHostInput(senderId,action){
 if(!deptRace||!deptAuthority()||deptRace.phase!=='running'||Date.now()<deptRace.startAt||!['jump','dash'].includes(action))return false;
 deptHostTick();const lane=deptRace?.lanes.find(x=>x.id===senderId);if(!lane||lane.finishedAt!==null||deptRace.phase!=='running')return false;const t=deptRace.elapsed;
 if(action==='jump'){if(t<lane.jumpReadyAt)return false;lane.jumpUntil=t+.83;lane.jumpReadyAt=t+1.42;}
 else{if(t<lane.dashReadyAt)return false;lane.dashUntil=t+.72;lane.dashReadyAt=t+4.1;deptNotice(lane,'⚡ 대시!',t);}
 deptRace.seq++;if(typeof netPublishRace==='function')netPublishRace(true);return true;
}
function deptGetState(){return deptRace?JSON.parse(JSON.stringify({...deptRace,sentAt:Date.now()})):null;}
function deptReceive(state){
 if(deptAuthority()||!state||typeof state.id!=='string'||!Array.isArray(state.lanes)||state.lanes.length<1||state.lanes.length>8||!Number.isFinite(state.elapsed)||!Number.isFinite(state.startAt)||!['countdown','running','finished'].includes(state.phase))return false;
 if(state.lanes.some(l=>!l||typeof l.id!=='string'||!Number.isFinite(l.distance)||!Number.isFinite(l.speed)))return false;
 if(deptRace&&deptRace.id!==state.id)return false;if(deptRace&&state.seq<deptRace.seq)return false;
 if(!deptRace)deptStart({id:state.id,seed:state.seed,startAt:state.startAt,participants:state.lanes.map(l=>({id:l.id,name:l.name,menu:l.menu,department:l.department}))});
 if(!deptRace)return false;deptRace=JSON.parse(JSON.stringify(state));deptRemoteAt=performance.now();if(!deptFrame)deptRender();return true;
}
function deptInput(action){
 if(!deptRace||deptRace.phase!=='running'||!deptRace.lanes.some(x=>x.id===deptOwnId()))return;
 if(typeof netSendRaceInput==='function')netSendRaceInput(action);else deptHostInput(deptOwnId(),action);
}
function deptAnimate(){if(!deptRace)return;deptRender();deptFrame=requestAnimationFrame(deptAnimate);}
function deptRender(){
 if(!deptRace||!deptView||deptView.hidden)return;
 const r=deptRace,t=deptSmoothFrame(),until=deptSmoothUntil(),own=r.lanes.find(l=>l.id===deptOwnId());deptSmoothMeasure();
 const order=[...r.lanes].sort((a,b)=>b.distance-a.distance||(a.finishedAt??Infinity)-(b.finishedAt??Infinity)||a.index-b.index);
 for(const lane of r.lanes){const nodes=deptRows.get(lane.id);if(!nodes)continue;const d=deptSmoothDistance(lane,t),pct=d/deptCourseLength*100;deptSmoothPlace(nodes,lane,d,t);nodes.runner.dataset.dash=String(deptSmoothDash(lane,t));nodes.runner.dataset.stun=String(t<lane.stunUntil);nodes.row.dataset.moving=String(r.phase==='running'&&lane.finishedAt===null);nodes.row.dataset.finished=String(lane.finishedAt!==null);deptText(nodes.rank,order.findIndex(x=>x.id===lane.id)+1);deptText(nodes.meters,Math.round(d)+'m');nodes.passive.dataset.used=String(lane.passiveUsed);nodes.fx.hidden=!(lane.effect&&t<lane.effectUntil);deptText(nodes.fx,lane.effect);nodes.gates.forEach((g,i)=>g.classList.toggle('passed',i<lane.nextObstacle));
  const gate=r.obstacles[lane.nextObstacle],gap=gate?gate.at-d:999;deptText(nodes.next,lane.id===deptOwnId()&&gap>0&&gap<100?(gap<32&&gate.type!=='portal'&&gate.type!=='fork'?(gate.type==='wind'?'대시 타이밍!':'지금 점프!'):gate.label+' '+Math.max(0,Math.round(gap))+'m'):'');
 }
 const overlay=deptView.querySelector('#deptOverlay'),overTitle=deptView.querySelector('#deptOverlayTitle'),overSub=deptView.querySelector('#deptOverlaySub');
 if(r.phase==='finished'){
  const winner=r.lanes.find(x=>x.id===r.winnerId);if(winner&&overlay.dataset.winner!==winner.id){overlay.dataset.winner=winner.id;overlay.className='dept-overlay dept-finale';overlay.replaceChildren();const conf=deptMake('div','dept-confetti');for(let i=0;i<28;i++){const p=deptMake('i');p.style.left=(deptHash(r.seed+'conf'+i)*100)+'%';p.style.background=deptOptions[i%deptOptions.length].color;p.style.animationDelay=(-deptHash(r.seed+'delay'+i)*2.3)+'s';conf.append(p);}overlay.append(conf,deptMake('div','dept-photo','PHOTO FINISH · FIRST SEED'),deptMake('div','dept-winner-food',deptFood(winner.menu)),deptMake('b','',winner.menu),deptMake('span','',winner.name+' 님 레이스 1등! 이어서 왕좌 쟁탈전이 시작돼요.'));}
  overlay.hidden=false;deptText(deptView.querySelector('#deptClock'),r.finishedAt.toFixed(1));deptText(deptView.querySelector('#deptClockLabel'),'FINISH');
 }else{overlay.className='dept-overlay';if(until>0){const n=Math.min(3,Math.max(1,Math.ceil(until)));overlay.hidden=false;deptText(overTitle,n);deptText(overSub,'내 메뉴를 싣고, 출발 준비!');deptText(deptView.querySelector('#deptClock'),n);deptText(deptView.querySelector('#deptClockLabel'),'GET READY');}
  else{overlay.hidden=t>.85;deptText(overTitle,'GO!');deptText(overSub,'점프! 대시! 오늘의 점심을 잡아요');deptText(deptView.querySelector('#deptClock'),t.toFixed(1));deptText(deptView.querySelector('#deptClockLabel'),'RACE TIME');}}
 let announcement='모두 같은 출발선! 각자 자신의 기기에서 조작해요.';
 if(r.phase==='running'){const latest=[...r.lanes].filter(l=>l.effect&&t<l.effectUntil).sort((a,b)=>(b.effectUntil||0)-(a.effectUntil||0))[0];announcement=latest?latest.name+' · '+latest.effect:(order[0]?.name||'')+' 선두! 장애물 앞에서 점프하고, 빈 구간은 대시하세요.';}
 if(r.phase==='finished')announcement='레이스 1등 결정! 모두 자동으로 최종 1등 쟁탈전에 진입합니다.';
 if(announcement!==deptLastNotice){deptLastNotice=announcement;deptText(deptView.querySelector('#deptAnnouncement'),announcement);}
 deptText(deptView.querySelector('#deptControlName'),own?own.name+' · '+own.menu:'지금은 관전 중이에요');deptText(deptView.querySelector('#deptControlHint'),own?'점프 Space · 대시 Shift / 장애물 앞에서 점프!':'참가자는 각자 자신의 기기에서 조작해요.');
 for(const action of ['jump','dash']){const button=deptView.querySelector(action==='jump'?'#deptJump':'#deptDash'),readyAt=own?(action==='jump'?own.jumpReadyAt:own.dashReadyAt):0,cool=Math.max(0,readyAt-t);button.disabled=!own||r.phase!=='running'||until>0||cool>.03||own.finishedAt!==null;deptText(button.querySelector('small'),!own?'관전 중':r.phase==='countdown'?'출발 대기':r.phase==='finished'?'레이스 종료':cool>.03?cool.toFixed(1)+'초 후 준비':(action==='jump'?'SPACE':'SHIFT')+' · 준비 완료');}
}
function deptCancel(){clearInterval(deptLoop);clearTimeout(deptFinishTimer);cancelAnimationFrame(deptFrame);deptLoop=0;deptFrame=0;deptFinishTimer=0;deptRace=null;deptRows.clear();if(deptView){deptView.hidden=true;const overlay=deptView.querySelector('#deptOverlay');if(overlay?.dataset.winner){delete overlay.dataset.winner;overlay.className='dept-overlay';overlay.innerHTML='<b id="deptOverlayTitle">3</b><span id="deptOverlaySub">점프와 대시를 준비하세요</span>';}}}
window.addEventListener('keydown',event=>{if(!deptRace||deptView?.hidden||!['Space','ShiftLeft','ShiftRight'].includes(event.code)||/INPUT|TEXTAREA|SELECT/.test(event.target?.tagName)||event.target?.isContentEditable)return;event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)deptInput(event.code==='Space'?'jump':'dash');},true);


/* ONLINE_GAME_V3 */
const netRoom=window.LunchRoom;
let netRoster=[],netPicks={},netReady={},netDepartments={},netPhase='setup',netSpec=null,netDuelMeta=null,netSeq=0,netLastSeq=-1,netInputSeq=0,netInputSeen={},netLastCombat=0,netLastRace=0,netApplying=false,netPendingPick=false;
let netPrepareLocal=prepareDuel;const netResultLocal=renderResult;
function netIsActive(){return !!netRoom?.active;}
function netIsHost(){return netIsActive()&&netRoom.isHost;}
function netSelfId(){return netRoom?.selfId||'';}
function netSelfSide(){if(!netDuelMeta)return -1;return netDuelMeta.challengerId===netSelfId()?0:netDuelMeta.defenderId===netSelfId()?1:-1;}
function netDepartment(id){return deptById.has(netDepartments[id])?netDepartments[id]:'business';}
function netMembers(){return netRoster.filter(m=>m.consent===true&&m.connected!==false);}
function netCopy(v){return JSON.parse(JSON.stringify(v));}
function netMenu(name){let item=pool.find(x=>x.name===name);if(!item){item={id:'remote_'+rand(10000000),name,category:'내 후보',owner:null,enabledFor:Array(8).fill(true),custom:true};pool.push(item);}return {...item};}
function netSyncRoster(){
 const list=netMembers();PEOPLE=list.map(m=>m.name);if(!PEOPLE.length)PEOPLE=['참가자'];
 active=Math.max(0,list.findIndex(m=>m.id===netSelfId()));
 choices=list.map(m=>(netPicks[m.id]||[]).map(netMenu));if(!choices.length)choices=[[]];
 pool.forEach(x=>{x.enabledFor=Array(8).fill(true);if(x.custom&&x.owner!==null)x.owner=active;});
}
safeRead=function(){try{const v=JSON.parse(localStorage.getItem(KEY)||'null');if(Array.isArray(v?.history))history=v.history.filter(x=>x&&validName(x.menu)&&validName(x.person)&&Number.isFinite(Date.parse(x.time))).slice(0,5);}catch{canStore=false;}};
save=function(){try{localStorage.setItem(KEY,JSON.stringify({version:3,history}));}catch{canStore=false;}};
visibleFor=function(item,p){return item.owner===null||item.owner===p;};
enabled=function(p=active,items=pool){return items.filter(x=>visibleFor(x,p)&&x.enabledFor[p]!==false);};
switchPerson=function(i){if(i!==active)notify('다른 참가자는 자신의 기기에서 메뉴를 골라요.');};
renderSetup=function(){
 netSyncRoster();$('players').replaceChildren();
 netMembers().forEach((m,i)=>{const selected=choices[i]||[],ready=!!netReady[m.id],b=el('div','player'+(active===i?' active':'')+(selected.length?' chosen':''));b.dataset.index=i%3;b.id='person_'+i;b.setAttribute('aria-label',m.name+(ready?' 준비 완료':' 메뉴 선택 중'));
 const top=el('div','player-top'),person=el('span','person');person.append(el('span','avatar',m.name[0]),document.createTextNode(m.name+(m.id===netSelfId()?' · 나':'')));top.append(person,el('span','player-status',ready?'READY ✓':selected.length+'/1 선택'));const names=el('strong','nominee'+(selected.length?'':' empty'));if(selected.length)selected.forEach(x=>names.append(el('span','choice-line',x.name)));else names.textContent='메뉴 미정';b.append(top,names,el('span','player-hint',deptOptions.find(d=>d.id===netDepartment(m.id))?.short+' · '+(ready?'출발 대기':'준비 중')));$('players').append(b);});
 $('menuPanel').setAttribute('aria-label','내 점심 메뉴 선택');$('pickPrompt').textContent=(netMembers()[active]?.name||'내')+' · 내가 걸고 싸울 메뉴 '+(choices[active]?.length||0)+'/1';$('personalAddLabel').textContent='먹고 싶은 메뉴를 직접 추가할 수 있어요.';$('personalMenuInput').setAttribute('aria-label','내 새 후보 메뉴');$('manageBtn').hidden=true;renderMenus();
 const self=netSelfId(),has=(netPicks[self]||[]).length>0,ready=!!netReady[self],n=netMembers().length,r=netMembers().filter(m=>netReady[m.id]).length;
 $('startBtn').disabled=!netIsActive()||!has||netPendingPick;$('startBtn').textContent=ready?'준비 취소 · 메뉴 다시 고르기':'내 메뉴로 준비 완료';$('startBtn').classList.toggle('net-ready',ready);$('dossierStatus').textContent='준비 완료 '+r+'/'+n+(n<2?' · 2명 이상 모이면 출발':'');
 $('netReadyHint').textContent=n<2?'초대 링크로 친구를 불러주세요. 최소 2명부터 시작해요.':r===n?'전원 준비 완료! 곧 출발합니다.':'모두 메뉴를 고르고 준비 완료를 누르면 자동으로 시작해요.';
 const sel=$('netDepartment');if(sel){sel.value=netDepartment(self);sel.disabled=ready;$('netPassiveDesc').textContent=deptOptions.find(d=>d.id===sel.value)?.description||'';}
 document.querySelectorAll('#menuGrid button,#personalAddForm input,#personalAddForm button').forEach(b=>b.disabled=ready||netPendingPick);
};
choose=function(item){if(!netIsActive()||mode!=='setup')return;if(netReady[netSelfId()]){notify('준비를 취소하면 메뉴를 바꿀 수 있어요.');return;}const list=netPicks[netSelfId()]||[];netRoom.send({t:'pick',name:item.name});};
showSetup=function(){cancelActionDuel();if(typeof deptCancel==='function')deptCancel();cancelAnimationFrame(frame);clearTimeout(duelTimer);race=null;duel=null;mode='setup';$('setupView').hidden=false;$('raceView').hidden=true;$('resultView').hidden=true;$('duelView').hidden=true;setStep(1);renderSetup();playLayout(false);};
function netSnapshot(){return {kind:'room-v3',seq:++netSeq,roster:netCopy(netRoster),picks:netCopy(netPicks),ready:netCopy(netReady),departments:netCopy(netDepartments),phase:netPhase,spec:netSpec&&netCopy(netSpec),result:result&&netCopy(result),duelMeta:netDuelMeta&&netCopy(netDuelMeta),combat:netPhase==='duel'?netGetCombatState():null,racing:netPhase==='race'?deptGetState():null,coffee:coffeeGetState(),tray:trayGetState(),chat:roomChatGetState(),arcade:arcadeGetState(),decision:lunchDecisionGetState(),delivery:deliveryGetState(),award:awardGetState(),finale:lunchFinaleGetState(),brawlRoom:groupGetState(),brawlFight:netPhase==='brawl'?brawlGetState():null};}
function netPublish(){if(netIsHost()&&!netApplying)netRoom.broadcast(netSnapshot());}
function netPublishCombat(force=false){if(!netIsHost()||netApplying||netPhase!=='duel')return;const now=performance.now();if(!force&&now-netLastCombat<50)return;netLastCombat=now;netPublish();}
function netPublishRace(force=false){if(!netIsHost()||netApplying||netPhase!=='race')return;const now=performance.now();if(!force&&now-netLastRace<80)return;netLastRace=now;netPublish();}
function netSendRaceInput(action){if(netPhase==='race')netRoom.send({t:'raceInput',raceId:netSpec?.id,action});}
function netSendCombat(action,held){if(netPhase==='duel'&&netSelfSide()>=0)netRoom.send({t:'combatInput',duelId:netDuelMeta?.id,seq:++netInputSeq,action,held});}
function netReadyToFight(){if(netSelfSide()>=0)netRoom.send({t:'combatReady',duelId:netDuelMeta?.id});}
function netRoundFinished(){if(!netIsHost())return;saveRound();netPublishCombat(true);}
function netBeginRace(){
 if(!netIsHost()||netPhase!=='setup')return;const members=netMembers();if(members.length<2||members.some(m=>!netReady[m.id]||!(netPicks[m.id]||[]).length))return;
 netPhase='race';netSpec={id:'round_'+Date.now()+'_'+rand(1000000),seed:rand(2147483647),participants:members.map(m=>({id:m.id,name:m.name,menu:netPicks[m.id][rand(netPicks[m.id].length)],department:netDepartment(m.id)})),startAt:Date.now()+3500};netDuelMeta=null;result=null;netRoom.setLocked(true);netEnterRace();netPublish();
}
function netEnterRace(){cancelActionDuel();mode='race';$('setupView').hidden=true;$('raceView').hidden=true;$('resultView').hidden=true;$('duelView').hidden=true;setStep(2);playLayout(true);$('dossierStatus').textContent='전원 준비 완료 · 캠퍼스 레이스';deptStart(netSpec);}
function netRaceFinished(winnerId){
 if(!netIsHost()||netPhase!=='race'||!netSpec)return;const p=netSpec.participants.find(x=>x.id===winnerId);if(!p)return;
 result={id:netSpec.id,menu:p.menu,person:p.name,winnerId:p.id,time:new Date().toISOString(),nominations:netSpec.participants.map(m=>({id:m.id,person:m.name,menus:[...(netPicks[m.id]||[])]})),source:'race',duelCount:0,mission:'함께 고른 점심, 맛있게 먹어요! 주문과 결제는 참가자끼리 진행해주세요.'};groupAutoRace();
}
renderResult=function(){if(typeof deptCancel==='function')deptCancel();netResultLocal();$('winningPerson').textContent='제안자 · '+result.person;$('objectBtn').hidden=result.winnerId===netSelfId();$('againBtn').hidden=!netIsHost();$('againBtn').textContent='다음 점심 · 모두 다시 준비';};
refreshChallengers=function(){const i=netMembers().findIndex(m=>m.id===netSelfId());challengerIndex=i;$('challengerChoices').replaceChildren(el('span','challenger-choice',netMembers()[i]?.name||''));$('duelMenuSelect').replaceChildren();(result?.nominations.find(n=>n.id===netSelfId())?.menus||[]).forEach(name=>{const o=el('option','',name);o.value=name;$('duelMenuSelect').append(o);});$('objectionError').textContent='내 메뉴를 걸고, 현재 우승자에게 직접 도전해요.';};
prepareDuel=function(p,menu){if(netApplying)return netPrepareLocal(p,menu);netRoom.send({t:'challenge',menu});};
function netNewDuel(senderId,menu){
 const challenger=netMembers().find(m=>m.id===senderId),idx=netMembers().findIndex(m=>m.id===senderId);if(!challenger||!result||senderId===result.winnerId||!(netPicks[senderId]||[]).includes(menu)||menu===result.menu)return;
 netDuelMeta={id:'duel_'+Date.now()+'_'+rand(100000),challengerId:senderId,defenderId:result.winnerId,readyIds:[]};netPhase='duel';netApplying=true;try{netPrepareLocal(idx,menu);duel.id=netDuelMeta.id;}finally{netApplying=false;}netInputSeen={};netPublish();
}
function netHandle(senderId,cmd){
 if(!netIsHost()||!cmd||typeof cmd!=='object'||JSON.stringify(cmd).length>3000)return;const member=netMembers().find(m=>m.id===senderId);if(!member)return;if(roomChatHandle(senderId,cmd))return;if(awardHandle(senderId,cmd))return;if(lunchDecisionHandle(senderId,cmd))return;if(deliveryHandle(senderId,cmd))return;if(arcadeHandle(senderId,cmd))return;if(trayHandle(senderId,cmd))return;if(coffeeHandle(senderId,cmd))return;if(groupHandle(senderId,cmd))return;
 if(cmd.t==='pick'&&netPhase==='setup'&&!netReady[senderId]&&validName(cmd.name)){const name=cmd.name.trim().normalize('NFC'),list=netPicks[senderId]||[];const i=list.findIndex(n=>n.toLocaleLowerCase()===name.toLocaleLowerCase());if(i>=0)list.splice(i,1);else list.splice(0,list.length,name);netPicks[senderId]=list;renderSetup();netPublish();return;}
 if(cmd.t==='department'&&netPhase==='setup'&&!netReady[senderId]&&deptOptions.some(d=>d.id===cmd.value)){netDepartments[senderId]=cmd.value;renderSetup();netPublish();return;}
 if(cmd.t==='ready'&&netPhase==='setup'&&typeof cmd.value==='boolean'){if(cmd.value&&!(netPicks[senderId]||[]).length)return;netReady[senderId]=cmd.value;renderSetup();netPublish();netBeginRace();return;}
 if(cmd.t==='reset'&&senderId===netSelfId()&&netPhase==='result'){netPhase='setup';netReady={};netPicks={};netSpec=null;netDuelMeta=null;result=null;netRoom.setLocked(false);showSetup();netPublish();return;}
 if(cmd.t==='raceInput'&&netPhase==='race'&&cmd.raceId===netSpec?.id&&['jump','dash','item','cheer'].includes(cmd.action)){deptHostInput(senderId,cmd.action);return;}
 if(cmd.t==='challenge'&&netPhase==='result'&&typeof cmd.menu==='string'){netNewDuel(senderId,cmd.menu);return;}
 if(netPhase!=='duel'||cmd.duelId!==netDuelMeta?.id)return;
 if(cmd.t==='combatCancel'&&duel?.phase==='done'){netPhase='result';cancelActionDuel();netDuelMeta=null;renderResult();netPublish();return;}
 const side=senderId===netDuelMeta.challengerId?0:senderId===netDuelMeta.defenderId?1:-1;if(side<0)return;
 if(cmd.t==='combatReady'&&['idle','paused'].includes(duel?.phase)){if(!netDuelMeta.readyIds.includes(senderId))netDuelMeta.readyIds.push(senderId);if(netDuelMeta.readyIds.length===2){netDuelMeta.readyIds=[];netStartCombatHost();}netUpdateCombatReady();netPublishCombat(true);return;}
 if(cmd.t==='combatInput'&&Number.isSafeInteger(cmd.seq)&&cmd.seq>(netInputSeen[senderId]||0)){netInputSeen[senderId]=cmd.seq;if(cmd.action==='pause'&&cmd.held===true){netDuelMeta.readyIds=[];actionPause('참가자가 잠시 멈췄어요. 두 사람 모두 다시 준비해주세요.');netPublishCombat(true);return;}netApplyCombatInput(side,cmd);return;}
 if(cmd.t==='combatCancel'&&!['fight','countdown'].includes(duel?.phase)){netPhase='result';cancelActionDuel();netDuelMeta=null;renderResult();netPublish();}
}
function netReceive(s){
 if(netIsHost()||!s||s.kind!=='room-v3'||!Number.isSafeInteger(s.seq)||s.seq<=netLastSeq||!Array.isArray(s.roster))return;netLastSeq=s.seq;
 const oldPhase=netPhase,oldRace=netSpec?.id,oldDuel=netDuelMeta?.id,oldCoffeeResult=result?result.id+'|'+result.time+'|'+result.menu+'|'+result.person+'|'+String(result.provisional):'';netApplying=true;
 try{netRoster=s.roster.filter(m=>m&&typeof m.id==='string'&&typeof m.name==='string'&&m.consent===true).slice(0,8);netPicks=s.picks||{};netReady=s.ready||{};netDepartments=s.departments||{};netPhase=s.phase;netSpec=s.spec;netDuelMeta=s.duelMeta;result=s.result;netSyncRoster();lunchDecisionReceive(s.decision);
 if(netPhase==='setup'){if(oldPhase!=='setup')showSetup();else renderSetup();}
 else if(netPhase==='menuTournament'){netEnterMenuTournament();}
 else if(netPhase==='brawlInvite'||netPhase==='brawl'){groupReceive(s.brawlRoom,s.brawlFight);}
 else if(netPhase==='race'){if(oldPhase!=='race'||oldRace!==netSpec?.id)netEnterRace();if(s.racing)deptReceive(s.racing);}
 else if(netPhase==='result'&&result){if(oldPhase!=='result'||oldCoffeeResult!==result.id+'|'+result.time+'|'+result.menu+'|'+result.person+'|'+String(result.provisional)){saveRound();renderResult();}}
 else if(netPhase==='duel'&&result&&s.combat){if(oldPhase!=='duel'||oldDuel!==netDuelMeta?.id){const idx=netMembers().findIndex(m=>m.id===netDuelMeta.challengerId);netPrepareLocal(idx,s.combat.duel.challengerMenu);duel.id=netDuelMeta.id;}netReceiveCombatState(s.combat);if(duel?.phase==='done')saveRound();}
 if(netPhase==='duel')netUpdateCombatReady();coffeeReceive(s.coffee);trayReceive(s.tray);roomChatReceive(s.chat);arcadeReceive(s.arcade);deliveryReceive(s.delivery);awardReceive(s.award);lunchFinaleReceive(s.finale);
 }finally{netApplying=false;}
}
function netUpdateCombatReady(){if(!netDuelMeta||!duel)return;const ids=netDuelMeta.readyIds||[],self=ids.includes(netSelfId());if(['idle','paused'].includes(duel.phase)){$('duelStartBtn').disabled=self;$('duelStartBtn').textContent=self?'상대방 준비를 기다리는 중…':'내 캐릭터 준비 완료';$('battleOverlaySub').textContent='두 참가자 모두 준비해야 시작해요. 준비 '+ids.length+'/2';}else $('duelStartBtn').disabled=false;}
// Capture old same-device actions before their original listeners execute.
document.addEventListener('click',e=>{const b=e.target?.closest?.('button');if(!b||!netIsActive())return;
 if(b.id==='startBtn'){e.preventDefault();e.stopImmediatePropagation();netRoom.send({t:'ready',value:!netReady[netSelfId()]});}
 if(b.id==='againBtn'){e.preventDefault();e.stopImmediatePropagation();if(netIsHost())netRoom.send({t:'reset'});}
 if(b.id==='objectBtn'){e.preventDefault();e.stopImmediatePropagation();if(netPhase==='result')groupOpenLocalInvite();}
 if(b.id==='duelCancelBtn'){e.preventDefault();e.stopImmediatePropagation();if(duel?.phase==='done'){if(netIsHost()){netPhase='result';netDuelMeta=null;renderResult();netPublish();}else netRoom.send({t:'combatCancel',duelId:netDuelMeta?.id});}else netRoom.send({t:'combatCancel',duelId:netDuelMeta?.id});}
 if(b.id==='duelFinishBtn'){e.preventDefault();e.stopImmediatePropagation();if(duel?.phase==='done'){if(netIsHost()){netPhase='result';netDuelMeta=null;renderResult();netPublish();}else netRoom.send({t:'combatCancel',duelId:netDuelMeta?.id});}}
},true);
document.addEventListener('submit',e=>{if(e.target.id!=='personalAddForm'||!netIsActive())return;e.preventDefault();e.stopImmediatePropagation();if(netReady[netSelfId()])return;const r=addPersonal($('personalMenuInput').value,active);if(r.error){notify(r.error);return;}$('personalMenuInput').value='';category='내 후보';if(!(netPicks[netSelfId()]||[]).includes(r.item.name))netRoom.send({t:'pick',name:r.item.name});else renderSetup();},true);
netRoom.onCommand(netHandle);netRoom.onState(netReceive);
netRoom.onReady(()=>{netLastSeq=-1;netRoster=netRoom.members;netSyncRoster();if(netIsHost()){netPhase='setup';netPicks={};netReady={};netDepartments={};netSpec=null;result=null;showSetup();netPublish();}else showSetup();});
netRoom.onPresence((members,event)=>{if(!netIsHost())return;netRoster=members;if(lunchDecisionPresence(event))return;if(arcadePresence(event))return;if(groupPresence(event))return;if(event.kind==='leave'){delete netPicks[event.memberId];delete netReady[event.memberId];delete netDepartments[event.memberId];if(netPhase!=='setup'){netPhase='setup';netReady={};netSpec=null;netDuelMeta=null;result=null;netRoom.setLocked(false);showSetup();notify('참가자가 나가서 이번 판을 멈췄어요. 남은 분들이 다시 준비해주세요.');}}
 if(netPhase==='setup'){netReady={};showSetup();if(event.kind==='join')notify('새 참가자가 들어왔어요. 모두 준비를 다시 확인해주세요.');}netPublish();});
netRoom.onDisconnect(event=>{if(event.self||event.hostLost){deptCancel();cancelActionDuel();netPhase='setup';netRoster=[];netPicks={};netReady={};netSpec=null;netDuelMeta=null;result=null;mode='setup';}});
// rAF sleeps in background tabs; continue host physics using bounded fixed steps.
setInterval(()=>{if(!netIsHost()||netPhase!=='duel'||!document.hidden||!duel||!['fight','countdown'].includes(duel.phase))return;const now=performance.now();let n=0;while(actionLast+16<now&&n++<90&&['fight','countdown'].includes(duel.phase)){cancelAnimationFrame(actionFrame);actionTick(actionLast+16);}cancelAnimationFrame(actionFrame);actionFrame=0;},80);
document.addEventListener('visibilitychange',()=>{if(netIsHost()&&netPhase==='duel'&&!document.hidden&&duel&&['fight','countdown'].includes(duel.phase)){cancelAnimationFrame(actionFrame);actionLast=performance.now();actionFrame=requestAnimationFrame(actionTick);}});
const netOldPause=actionPause;actionPause=function(reason){if(netIsHost()&&netDuelMeta)netDuelMeta.readyIds=[];const value=netOldPause(reason);if(netIsHost())netUpdateCombatReady();return value;};
const netOldFinish=actionFinish;actionFinish=function(winner,reason){if(netIsHost()&&result&&netDuelMeta&&!duel?.finishLocked)result.winnerId=winner===0?netDuelMeta.challengerId:netDuelMeta.defenderId;netOldFinish(winner,reason);if(netIsHost()&&duel?.finishLocked&&result)netPublishCombat(true);};
startRace=function(){if(netIsActive())netRoom.send({t:'ready',value:!netReady[netSelfId()]});};
$('randomBtn').hidden=true;$('motionBtn').hidden=true;$('manageBtn').hidden=true;
const netSelectWrap=deptPickerCreate();$('players').before(netSelectWrap);const hint=el('p','net-ready-hint');hint.id='netReadyHint';$('startBtn').parentElement.append(hint);
document.querySelectorAll('.hero-desc,.hero-sub,.subtitle').forEach(n=>{if(n.textContent.includes('공나영')||n.textContent.includes('세 사람'))n.textContent='점심 주문에 동의한 참가자들이 함께 고르고, 달리고, 직접 결투해요.';});
$('helpDialog').querySelector('.dialog-body')?.replaceChildren();

/* FUN_CORE_V1 */

/* RACE_ITEMS_V1 */
const deptItemTypes=[
 {id:'turbo',icon:'🚀',name:'불꽃 부스터',short:'부스터',description:'1.25초 동안 속도가 45% 올라가요.'},
 {id:'shield',icon:'🛡️',name:'철벽 도시락',short:'보호막',description:'4초 안에 만나는 장애물 또는 바나나를 1회 막고 짧게 가속해요.'},
 {id:'banana',icon:'🍌',name:'바나나 배달',short:'바나나',description:'가장 가까운 앞 참가자를 0.85초 감속시켜요. 선두라면 짧게 가속해요.'},
 {id:'portal',icon:'🌀',name:'순간 배달',short:'순간이동',description:'즉시 26m 전진해요. 도착 지점의 장애물은 그대로 적용돼요.'}
];
const deptCheerEmojis=['😋','🔥','💪','🍀','🤣'];
const deptItemBaseStart=deptStart,deptItemBaseSimulate=deptSimulate,deptItemBaseHazard=deptHazard,deptItemBaseInput=deptHostInput,deptItemBaseRender=deptRender;
function deptItemType(type){return deptItemTypes.find(item=>item.id===type);}
function deptItemEnsure(lane){
 if(lane.itemAwarded===undefined)Object.assign(lane,{itemType:null,itemAwarded:false,itemUsed:false,itemAwardedAt:null,itemUsedAt:null,itemTurboUntil:0,itemShieldUntil:0,itemShieldSpent:false,itemSlowUntil:0,cheerEmoji:'',cheerUntil:0,cheerReadyAt:0,cheerCount:0});
}
function deptItemPrepare(t){
 if(!deptRace||!deptAuthority())return;
 for(const lane of deptRace.lanes){deptItemEnsure(lane);if(lane.finishedAt!==null)continue;if(!lane.itemAwarded&&lane.distance>=380){lane.itemType=deptItemTypes[Math.min(3,Math.floor(deptHash(deptRace.seed+':item:'+lane.id)*4))].id;lane.itemAwarded=true;lane.itemAwardedAt=t;const item=deptItemType(lane.itemType);deptNotice(lane,'🎁 '+item.name+' 획득!',t);}}
 if(!deptRace.fever&&deptRace.lanes.some(lane=>lane.distance>=deptCourseLength-250)){deptRace.fever=true;deptRace.feverStartedAt=t;}
}
function deptItemVelocity(lane,t){
 let multiplier=deptRace?.fever?1.08:1;
 if(t<(lane.itemTurboUntil||0))multiplier*=lane.itemType==='shield'?1.2:1.45;
 if(t<(lane.itemSlowUntil||0))multiplier*=.6;
 return multiplier;
}
function deptApplyItem(lane,t){
 if(!deptAuthority()||!deptRace||deptRace.phase!=='running'||!lane||!deptRace.lanes.includes(lane)||lane.finishedAt!==null)return false;
 deptItemEnsure(lane);const item=deptItemType(lane.itemType);if(!lane.itemAwarded||lane.itemUsed||!item)return false;
 lane.itemUsed=true;lane.itemUsedAt=t;
 if(item.id==='turbo'){lane.itemTurboUntil=t+1.25;deptNotice(lane,'🚀 불꽃 부스터 발사!',t);}
 else if(item.id==='shield'){lane.itemShieldUntil=t+4;lane.itemShieldSpent=false;lane.itemTurboUntil=t+.5;deptNotice(lane,'🛡️ 철벽 도시락! 4초 방어',t);}
 else if(item.id==='banana'){
  const target=deptRace.lanes.filter(other=>other.id!==lane.id&&other.finishedAt===null&&other.distance>lane.distance).sort((a,b)=>a.distance-b.distance||a.index-b.index)[0];
  if(target){deptItemEnsure(target);if(t<target.itemShieldUntil&&!target.itemShieldSpent){target.itemShieldSpent=true;target.itemShieldUntil=0;deptNotice(target,'🛡️ 바나나를 막았어요!',t);deptNotice(lane,'🍌 앗! 보호막에 막혔어요',t);}else{target.itemSlowUntil=Math.max(target.itemSlowUntil,t+.85);deptNotice(target,'🍌 바나나 배달! 잠깐 감속',t);deptNotice(lane,'🍌 '+target.name+' 님에게 배달!',t);}}
  else{lane.itemTurboUntil=t+.6;deptNotice(lane,'🍌 선두 보너스! 미니 부스트',t);}
 }
 else if(item.id==='portal'){
  lane.distance=Math.min(deptCourseLength,lane.distance+26);deptNotice(lane,'🌀 순간 배달 +26m!',t);
  while(lane.nextObstacle<deptRace.obstacles.length&&lane.distance>=deptRace.obstacles[lane.nextObstacle].at){const gate=deptRace.obstacles[lane.nextObstacle++];deptGate(lane,gate,t);lane.distance=Math.min(deptCourseLength,lane.distance);}
  if(lane.distance>=deptCourseLength)deptFinish(lane,t);
 }
 return true;
}
deptStart=function(spec){const started=deptItemBaseStart(spec);if(started&&deptRace&&deptAuthority()){for(const lane of deptRace.lanes)deptItemEnsure(lane);deptRace.fever??=false;deptRace.feverStartedAt??=null;}if(started)deptItemUI();return started;};
deptSimulate=function(dt,t){deptItemPrepare(t);return deptItemBaseSimulate(dt,t);};
deptHazard=function(lane,gate,t){
 const alreadyAvoided=(t<lane.jumpUntil&&gate.type!=='wind')||(t<lane.dashUntil&&gate.type==='wind');
 if(!alreadyAvoided&&t<(lane.itemShieldUntil||0)&&!lane.itemShieldSpent){lane.itemShieldSpent=true;lane.itemShieldUntil=0;deptNotice(lane,'🛡️ '+gate.label+' 방어 성공!',t);return;}
 return deptItemBaseHazard(lane,gate,t);
};
deptHostInput=function(senderId,action){
 if(!['item','cheer'].includes(action))return deptItemBaseInput(senderId,action);
 if(!deptRace||!deptAuthority()||deptRace.phase!=='running'||Date.now()<deptRace.startAt)return false;
 deptHostTick();if(!deptRace||deptRace.phase!=='running')return false;const lane=deptRace.lanes.find(player=>player.id===senderId);if(!lane||lane.finishedAt!==null)return false;deptItemEnsure(lane);const t=deptRace.elapsed;
 if(action==='item'){if(!deptApplyItem(lane,t))return false;}
 else{if(t<lane.cheerReadyAt)return false;lane.cheerCount++;lane.cheerEmoji=deptCheerEmojis[Math.min(4,Math.floor(deptHash(deptRace.seed+':cheer:'+lane.id+':'+lane.cheerCount)*5))];lane.cheerUntil=t+1.5;lane.cheerReadyAt=t+3;}
 deptRace.seq++;if(typeof netPublishRace==='function')netPublishRace(true);return true;
};
function deptItemUI(){
 if(!deptView)return;const controls=deptView.querySelector('.dept-controls');if(!controls)return;
 if(!deptView.querySelector('#deptItem')){const item=deptMake('button','dept-input dept-item-button');item.id='deptItem';item.type='button';item.dataset.action='item';item.innerHTML='<span>🎁 아이템</span><small>E · 380m에서 획득</small>';item.addEventListener('click',()=>deptInput('item'));controls.append(item);const cheer=deptMake('button','dept-input');cheer.id='deptCheer';cheer.type='button';cheer.dataset.action='cheer';cheer.innerHTML='<span>😋 응원</span><small>R · 이모지 보내기</small>';cheer.addEventListener('click',()=>deptInput('cheer'));controls.append(cheer);}
 if(!deptView.querySelector('#deptFeverBanner')){const banner=deptMake('div','dept-fever-banner');banner.id='deptFeverBanner';banner.hidden=true;banner.setAttribute('aria-live','polite');banner.append(deptMake('strong','','🔥 FINAL 250m · 전원 피버!'),deptMake('small','','ALL RACERS +8%'));deptView.querySelector('.dept-arena').before(banner);}
}
function deptItemRender(){
 if(!deptRace||!deptView||deptView.hidden)return;deptItemUI();const r=deptRace,t=r.phase==='running'?r.elapsed+(deptAuthority()?0:Math.min(.7,Math.max(0,(performance.now()-deptRemoteAt)/1000))):r.elapsed,own=r.lanes.find(lane=>lane.id===deptOwnId()),running=r.phase==='running',fever=!!r.fever&&running;
 deptView.dataset.fever=String(fever);const banner=deptView.querySelector('#deptFeverBanner');if(banner)banner.hidden=!fever;
 if(fever){const leader=[...r.lanes].sort((a,b)=>b.distance-a.distance)[0],left=Math.max(0,Math.ceil(deptCourseLength-(leader?.distance||0)));deptText(banner?.querySelector('strong'),'🔥 LAST '+left+'m · 전원 피버!');const busy=r.lanes.some(lane=>lane.effect&&t<lane.effectUntil);if(!busy)deptText(deptView.querySelector('#deptAnnouncement'),'🔥 마지막 250m! 모두 8% 가속! 아이템과 대시로 결승선을 잡으세요.');}
 for(const lane of r.lanes){const nodes=deptRows.get(lane.id);if(!nodes)continue;let token=nodes.row.querySelector('.dept-item-token');if(!token){token=deptMake('span','dept-item-token');nodes.row.querySelector('.dept-info').append(token);}const item=deptItemType(lane.itemType);token.hidden=!lane.itemAwarded;token.dataset.used=String(!!lane.itemUsed);token.title=item?.description||'';deptText(token,item?item.icon+' '+item.short+(lane.itemUsed?' 사용 완료':' 준비'):'');nodes.row.classList.toggle('dept-item-pop',!!lane.itemAwarded&&t-lane.itemAwardedAt<.55);nodes.runner.dataset.shield=String(t<(lane.itemShieldUntil||0)&&!lane.itemShieldSpent);nodes.runner.dataset.turbo=String(t<(lane.itemTurboUntil||0));nodes.runner.dataset.slow=String(t<(lane.itemSlowUntil||0));let reaction=nodes.runner.querySelector('.dept-reaction');if(!reaction){reaction=deptMake('span','dept-reaction');reaction.setAttribute('aria-hidden','true');nodes.runner.append(reaction);}reaction.hidden=!(running&&lane.cheerEmoji&&t<(lane.cheerUntil||0));if(!reaction.hidden&&reaction.dataset.count!==String(lane.cheerCount)){reaction.dataset.count=String(lane.cheerCount);deptText(reaction,lane.cheerEmoji);reaction.style.animation='none';void reaction.offsetWidth;reaction.style.animation='';}}
 const itemButton=deptView.querySelector('#deptItem'),item=deptItemType(own?.itemType);if(itemButton){itemButton.disabled=!running||!own||own.finishedAt!==null||!own.itemAwarded||own.itemUsed;itemButton.title=item?.description||'380m를 지나면 랜덤 아이템을 1개 받아요.';itemButton.setAttribute('aria-label',item?item.name+' 사용: '+item.description:'랜덤 아이템, 380m에서 획득');deptText(itemButton.querySelector('span'),item?item.icon+' '+item.short:'🎁 아이템');deptText(itemButton.querySelector('small'),!own?'관전 중':!own.itemAwarded?'380m에서 획득':own.itemUsed?'사용 완료':'E · 지금 사용');}
 const cheerButton=deptView.querySelector('#deptCheer'),cool=Math.max(0,(own?.cheerReadyAt||0)-t);if(cheerButton){cheerButton.disabled=!running||!own||own.finishedAt!==null||cool>.03;deptText(cheerButton.querySelector('small'),!own?'관전 중':cool>.03?cool.toFixed(1)+'초 후 응원':'R · 이모지 보내기');}
 if(own)deptText(deptView.querySelector('#deptControlHint'),'Space 점프 · Shift 대시 · E 아이템 · R 응원');
}
deptRender=function(){deptItemBaseRender();deptItemRender();};
window.addEventListener('keydown',event=>{if(!deptRace||deptView?.hidden||!['KeyE','KeyR'].includes(event.code)||/INPUT|TEXTAREA|SELECT/.test(event.target?.tagName)||event.target?.isContentEditable)return;event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)deptInput(event.code==='KeyE'?'item':'cheer');},true);


/* DEPT_SMOOTH_RENDER_V1 */
let deptSmoothState=null,deptSmoothDt=1/60,deptSmoothDirty=true;
const deptSmoothWidths=new Map();
function deptSmoothReset(){deptSmoothState=null;deptSmoothWidths.clear();deptSmoothDirty=true;}
function deptSmoothFrame(){
 const r=deptRace,now=performance.now();if(!r)return 0;
 if(!deptSmoothState||deptSmoothState.id!==r.id){deptSmoothState={id:r.id,phase:r.phase,observed:r.elapsed,observedAt:now,last:now,time:r.elapsed,views:new Map(),predictions:new Map(),snap:false};}
 const s=deptSmoothState,gap=(now-s.last)/1000;deptSmoothDt=Math.max(0,Math.min(.05,gap));s.last=now;s.snap=gap>.25;
 if(r.elapsed!==s.observed||r.phase!==s.phase){s.observed=r.elapsed;s.observedAt=now;s.phase=r.phase;}
 if(r.phase==='running'){
  const target=r.elapsed+Math.min(.15,Math.max(0,(now-s.observedAt)/1000));
  if(s.snap||Math.abs(target-s.time)>.55)s.time=r.elapsed;
  else s.time+=deptSmoothDt*Math.max(.72,Math.min(1.22,1+(target-s.time)*3.5));
  s.time=Math.max(r.elapsed-.12,Math.min(r.elapsed+.18,s.time));
 }else s.time=r.phase==='finished'?(r.finishedAt??r.elapsed):r.elapsed;
 return s.time;
}
function deptSmoothDistance(lane,t){
 const s=deptSmoothState,r=deptRace;if(!s||!r)return lane.distance;
 let view=s.views.get(lane.id);if(!view){view={distance:lane.distance};s.views.set(lane.id,view);}
 const running=r.phase==='running'&&lane.finishedAt===null;
 const target=Math.min(running?deptCourseLength-1.5:deptCourseLength,lane.distance+(running?lane.speed*Math.max(0,Math.min(.15,t-r.elapsed)):0));
 if(s.snap||lane.finishedAt!==null)view.distance=lane.distance;
 else{const next=view.distance+(target-view.distance)*(1-Math.exp(-24*deptSmoothDt));view.distance=r.phase==='running'?Math.max(view.distance,next):next;}
 return Math.max(0,Math.min(deptCourseLength,view.distance));
}
function deptSmoothJumpY(lane,t){
 const p=deptSmoothState?.predictions.get(lane.id),now=performance.now();
 if(p&&lane.id===deptOwnId()&&p.jumpAt!==undefined){const u=Math.max(0,Math.min(1,(now-p.jumpAt)/830));return -Math.sin(u*Math.PI)*36;}
 return t<lane.jumpUntil?-Math.sin(Math.max(0,Math.min(1,1-(lane.jumpUntil-t)/.83))*Math.PI)*36:0;
}
function deptSmoothDash(lane,t){const p=deptSmoothState?.predictions.get(lane.id);return t<lane.dashUntil||t<lane.boostUntil||!!(p&&lane.id===deptOwnId()&&performance.now()<p.dashAt+720);}
function deptSmoothPredict(action){
 const r=deptRace,own=r?.lanes.find(l=>l.id===deptOwnId());if(!r||r.phase!=='running'||!own||own.finishedAt!==null)return false;
 const t=deptSmoothFrame(),now=performance.now(),s=deptSmoothState,p=s.predictions.get(own.id)||{};
 if(action==='jump'){if(t<own.jumpReadyAt-.025||now<(p.jumpReadyAt||0))return false;p.jumpAt=now;p.jumpReadyAt=now+1420;}
 else if(action==='dash'){if(t<own.dashReadyAt-.025||now<(p.dashReadyAt||0))return false;p.dashAt=now;p.dashReadyAt=now+4100;}
 else return true;s.predictions.set(own.id,p);return true;
}
function deptSmoothUntil(){
 const r=deptRace,s=deptSmoothState,now=performance.now();if(!r||r.phase!=='countdown')return 0;
 if(deptAuthority()||!Number.isFinite(r.sentAt)||!s)return (r.startAt-Date.now())/1000;
 if(s.countSent!==r.sentAt){s.countSent=r.sentAt;s.countDeadline=now+Math.max(0,r.startAt-r.sentAt);}
 return Math.max(0,(s.countDeadline-now)/1000);
}
function deptSmoothMeasure(){
 if(!deptSmoothDirty)return;
 // Read every track before any animation style is written. Resize only invalidates this cache.
 for(const [id,n]of deptRows)deptSmoothWidths.set(id,n.track.clientWidth||1);
 deptSmoothDirty=false;
}
function deptSmoothPlace(nodes,lane,d,t){
 const width=deptSmoothWidths.get(lane.id)||1,x=Math.max(12,Math.min(width-12,width*d/deptCourseLength));
 nodes.runner.style.transform='translate3d('+x.toFixed(2)+'px,'+deptSmoothJumpY(lane,t).toFixed(2)+'px,0)';
 nodes.progress.style.transform='scaleX('+Math.max(0,Math.min(1,d/deptCourseLength)).toFixed(5)+')';
}
function deptSmoothControls(){
 if(!deptRace||!deptView||deptView.hidden)return;const p=deptSmoothState?.predictions.get(deptOwnId());if(!p)return;
 const now=performance.now();for(const action of ['jump','dash']){const remaining=((p[action+'ReadyAt']||0)-now)/1000,button=deptView.querySelector(action==='jump'?'#deptJump':'#deptDash');if(button&&remaining>.03&&deptRace.phase==='running'){button.disabled=true;deptText(button.querySelector('small'),remaining.toFixed(1)+'초 후 준비');}}
}
const deptSmoothBaseBuild=deptBuildLanes;deptBuildLanes=function(){deptSmoothBaseBuild();deptSmoothDirty=true;for(const n of deptRows.values()){n.runner.style.left='0px';n.progress.style.width='100%';}};
const deptSmoothBaseCancel=deptCancel;deptCancel=function(){deptSmoothReset();return deptSmoothBaseCancel();};
const deptSmoothBaseInput=deptInput;deptInput=function(action){if(['jump','dash'].includes(action)&&!deptSmoothPredict(action))return;return deptSmoothBaseInput(action);};
const deptSmoothBaseRender=deptRender;deptRender=function(){deptSmoothBaseRender();deptSmoothControls();};
window.addEventListener('resize',()=>{deptSmoothDirty=true;},{passive:true});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){deptSmoothDirty=true;if(deptSmoothState)deptSmoothState.last=performance.now()-300;}});
// Activate touch controls on contact rather than waiting for finger release.
const deptSmoothPointerClicks=new WeakMap();
document.addEventListener('pointerdown',event=>{const button=event.target?.closest?.('#deptJump,#deptDash');if(!button||button.disabled||(event.pointerType==='mouse'&&event.button!==0)||deptView?.hidden)return;event.preventDefault();event.stopImmediatePropagation();deptSmoothPointerClicks.set(button,performance.now()+900);deptInput(button.id==='deptJump'?'jump':'dash');},true);
document.addEventListener('click',event=>{const button=event.target?.closest?.('#deptJump,#deptDash');if(button&&event.detail!==0&&performance.now()<(deptSmoothPointerClicks.get(button)||0)){event.preventDefault();event.stopImmediatePropagation();}},true);




