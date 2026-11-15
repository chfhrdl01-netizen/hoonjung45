/* LUNCH_FINALE_V2 */
let lunchFinaleDialog=null,lunchFinaleReplay=null,lunchFinaleRoom='',lunchFinaleRound='',lunchFinaleShownKey='',lunchFinaleFocus=null,lunchFinaleSoundTimers=[],lunchFinaleStartedAt=0,lunchFinaleCurrentScene=-1;
let lunchFinaleSceneTimes=[0,2500,8000,21000,27000,39000],lunchFinaleDuration=43500;
let lunchFinaleShared=null,lunchFinaleLocalEnd=0,lunchFinaleLocalStart=0,lunchFinaleLeaveTimer=0,lunchFinaleLeaving=false;
const lunchFinaleHostGrace=600,lunchFinaleInstagram='https://www.instagram.com/mid_jhs/';
const lunchFinaleSeen=new Set(),lunchFinaleSceneLabels=['상영을 시작합니다','오늘의 점심','커피 원정대','밥친구 퍼레이드','오늘의 출연진','우리의 오후를 응원하며'];
function lunchFinaleData(){
 if(!netIsActive()||netPhase!=='result'||!result||result.provisional!==false||!result.id||typeof result.menu!=='string'||!result.menu||typeof result.person!=='string'||!result.person)return null;
 const decision=typeof lunchDecisionGetState==='function'?lunchDecisionGetState():null,delivery=typeof deliveryGetState==='function'?deliveryGetState():null;
 if(!decision||decision.phase!=='coffee'||decision.roundId!==result.id||!delivery||delivery.roundId!==result.id||delivery.phase!=='done'||delivery.needsRedraw||!Array.isArray(delivery.members))return null;
 const winner=delivery.winnerId?delivery.members.find(m=>m.id===delivery.winnerId&&m.response==='join'&&!m.left):null;
 if(delivery.winnerId&&!winner)return null;
 const mealNames=(result.nominations||[]).filter(m=>m&&typeof m.person==='string').map(m=>m.person);
 return {key:String(netRoom.code||'')+':'+result.id+':'+delivery.id+':'+(winner?.id||'pass'),roundId:result.id,deliveryId:delivery.id,menu:result.menu,person:result.person,winnerId:result.winnerId,coffeeName:winner?.name||'',coffeeId:winner?.id||'',names:[...new Set(mealNames)],orders:delivery.members.filter(m=>m.response==='join'&&!m.left).map(m=>({name:m.name,drink:m.drink})),nominations:result.nominations||[]};
}
function lunchFinaleNow(){return typeof performance!=='undefined'&&typeof performance.now==='function'?performance.now():Date.now();}
function lunchFinaleCopy(value){return value?JSON.parse(JSON.stringify(value)):null;}
function lunchFinaleTimeline(data){const count=Math.max(1,Math.min(8,Math.max(data.names?.length||0,data.orders?.length||0))),credits=Math.min(12000,8000+count*500),times=[0,2500,8000,21000,27000,27000+credits];return{sceneTimes:times,duration:times[5]+4500,credits};}
function lunchFinaleContext(){return{room:netIsActive()?String(netRoom.code||''):'',round:typeof result!=='undefined'?result?.id||'':''};}
function lunchFinaleScheduleCurrent(){const context=lunchFinaleContext();return !!lunchFinaleShared&&!!context.room&&context.room===lunchFinaleShared.roomCode&&context.round===lunchFinaleShared.roundId;}
function lunchFinaleSyncContext(){const context=lunchFinaleContext();if(context.room!==lunchFinaleRoom||context.round!==lunchFinaleRound){lunchFinaleReset();lunchFinaleRoom=context.room;lunchFinaleRound=context.round;}return context;}
function lunchFinaleMaybeLeave(){
 if(!lunchFinaleScheduleCurrent()||lunchFinaleLeaving)return false;const delay=netIsHost()?lunchFinaleHostGrace:0;if(lunchFinaleNow()<lunchFinaleLocalEnd+delay)return false;
 lunchFinaleLeaving=true;lunchFinaleClose();clearTimeout(lunchFinaleLeaveTimer);lunchFinaleLeaveTimer=0;
 // Use the ordinary room exit path so roster, input, consent and pending games are cleared together.
 if(typeof netRoom.closeRoom==='function')netRoom.closeRoom('finale');
 for(const id of ['roomNickname','roomCodeInput']){const input=$(id);if(input){input.value='';if(typeof Event==='function'&&typeof input.dispatchEvent==='function')input.dispatchEvent(new Event('input',{bubbles:true}));}}
 const consent=$('roomConsent');if(consent)consent.checked=false;if(typeof showSetup==='function')showSetup();const nick=$('roomNickname');nick?.focus?.({preventScroll:true});
 lunchFinaleReset();return true;
}
function lunchFinaleArmExit(){
 clearTimeout(lunchFinaleLeaveTimer);lunchFinaleLeaveTimer=0;if(!lunchFinaleScheduleCurrent())return;
 const id=lunchFinaleShared.id,room=lunchFinaleShared.roomCode,round=lunchFinaleShared.roundId,due=lunchFinaleLocalEnd+(netIsHost()?lunchFinaleHostGrace:0);
 lunchFinaleLeaveTimer=setTimeout(()=>{if(lunchFinaleShared?.id!==id||String(netRoom.code||'')!==room||result?.id!==round)return;if(!lunchFinaleMaybeLeave())lunchFinaleArmExit();},Math.max(0,due-lunchFinaleNow()));
}
function lunchFinaleInstallSchedule(data,serverNow){
 const same=lunchFinaleShared?.id===data.id,nextEnd=lunchFinaleNow()+data.endAt-serverNow;lunchFinaleShared=lunchFinaleCopy(data);
 lunchFinaleLocalEnd=same&&lunchFinaleLocalEnd?Math.min(lunchFinaleLocalEnd,nextEnd):nextEnd;lunchFinaleLocalStart=lunchFinaleLocalEnd-data.duration;if(same&&lunchFinaleDialog?.open)lunchFinaleStartedAt=lunchFinaleLocalStart;lunchFinaleLeaving=false;lunchFinaleArmExit();
}
function lunchFinaleEnsureSchedule(){
 if(!netIsHost()||!netIsActive())return false;lunchFinaleSyncContext();if(lunchFinaleScheduleCurrent())return false;const data=lunchFinaleData();if(!data)return false;
 const now=Date.now(),plan=lunchFinaleTimeline(data),startAt=now+300,shared={version:1,id:'finale:'+data.key,key:data.key,roomCode:String(netRoom.code||''),roundId:data.roundId,deliveryId:data.deliveryId,startAt,endAt:startAt+plan.duration,duration:plan.duration,sceneTimes:plan.sceneTimes,data:lunchFinaleCopy(data)};
 lunchFinaleInstallSchedule(shared,now);return true;
}
function lunchFinaleGetState(){
 lunchFinaleSyncContext();if(netIsHost())lunchFinaleEnsureSchedule();return lunchFinaleScheduleCurrent()?{...lunchFinaleCopy(lunchFinaleShared),serverNow:Date.now()}:null;
}
function lunchFinaleValidate(data){
 if(!data||data.version!==1||typeof data.id!=='string'||data.id.length>600||typeof data.key!=='string'||data.key.length>550||data.roomCode!==String(netRoom.code||'')||data.roundId!==result?.id||typeof data.deliveryId!=='string'||data.deliveryId.length>120||!Number.isFinite(data.startAt)||!Number.isFinite(data.endAt)||!Number.isFinite(data.serverNow)||!Number.isFinite(data.duration)||data.duration<40000||data.duration>43500||data.endAt-data.startAt!==data.duration||data.serverNow<data.startAt-10000||data.serverNow>data.endAt+10000||!Array.isArray(data.sceneTimes)||data.sceneTimes.length!==6)return false;
 const p=data.data,nominations=result?.nominations||[],names=nominations.map(n=>n.person),decision=typeof lunchDecisionGetState==='function'?lunchDecisionGetState():null,delivery=typeof deliveryGetState==='function'?deliveryGetState():null;
 if(!p||result.provisional!==false||netPhase!=='result'||decision?.roundId!==data.roundId||decision.phase!=='coffee'||delivery?.id!==data.deliveryId||delivery.roundId!==data.roundId||delivery.phase!=='done'||p.key!==data.key||p.roundId!==data.roundId||p.deliveryId!==data.deliveryId||p.menu!==result.menu||p.person!==result.person||p.winnerId!==result.winnerId||typeof p.coffeeName!=='string'||typeof p.coffeeId!=='string'||Array.from(p.coffeeName).length>24||!Array.isArray(p.names)||p.names.length<1||p.names.length>8||new Set(p.names).size!==p.names.length||p.names.some(n=>!names.includes(n))||!Array.isArray(p.orders)||p.orders.length>8||new Set(p.orders.map(o=>o?.name)).size!==p.orders.length||p.orders.some(o=>!o||!p.names.includes(o.name)||typeof o.drink!=='string'||!o.drink.trim()||Array.from(o.drink).length>20)||!Array.isArray(p.nominations)||JSON.stringify(p.nominations)!==JSON.stringify(nominations))return false;
 if(p.names.length!==new Set(names).size)return false;
 const expectedOrders=delivery.members.filter(m=>m.response==='join'&&!m.left).map(m=>({name:m.name,drink:m.drink})),coffee=delivery.winnerId?delivery.members.find(m=>m.id===delivery.winnerId&&m.response==='join'&&!m.left):null;
 if(delivery.needsRedraw||delivery.winnerId&&!coffee||p.coffeeId!==(coffee?.id||'')||p.coffeeName!==(coffee?.name||'')||JSON.stringify(p.orders)!==JSON.stringify(expectedOrders))return false;
 const plan=lunchFinaleTimeline(p),key=data.roomCode+':'+data.roundId+':'+data.deliveryId+':'+(p.coffeeId||'pass');if(data.key!==key||data.id!=='finale:'+key||plan.duration!==data.duration||plan.sceneTimes.some((t,i)=>data.sceneTimes[i]!==t))return false;
 return true;
}
function lunchFinaleReceive(data){
 if(netIsHost()||!netIsActive())return false;lunchFinaleSyncContext();if(!data||!lunchFinaleValidate(data))return false;
 if(lunchFinaleShared&&(lunchFinaleShared.id!==data.id||lunchFinaleShared.endAt!==data.endAt||JSON.stringify(lunchFinaleShared.data)!==JSON.stringify(data.data)))return false;
 const {serverNow,...shared}=data;lunchFinaleInstallSchedule(shared,serverNow);return true;
}
function lunchFinaleStopSound(){for(const timer of lunchFinaleSoundTimers)clearTimeout(timer);lunchFinaleSoundTimers=[];}
function lunchFinaleTone(scene){
 if(typeof beep!=='function')return;const notes=scene===0?[261.63,392,523.25]:scene===1?[392,523.25,659.25,783.99]:scene===2?[440,554.37,659.25]:scene===3?[392,440,392,523.25]:scene===5?[392,523.25,659.25,523.25]:[];
 for(const [i,f]of notes.entries())lunchFinaleSoundTimers.push(setTimeout(()=>{if(lunchFinaleDialog?.open)beep(f,i===notes.length-1?.25:.12);},i*210));
}
function lunchFinaleClose(){
 const secret=$('lunchFinaleSecret');if(secret)secret.open=false;
 lunchFinaleStopSound();lunchFinaleStartedAt=0;lunchFinaleCurrentScene=-1;if(lunchFinaleDialog?.open)lunchFinaleDialog.close();if(lunchFinaleFocus?.isConnected)lunchFinaleFocus.focus({preventScroll:true});
}
function lunchFinaleReset(){clearTimeout(lunchFinaleLeaveTimer);lunchFinaleLeaveTimer=0;lunchFinaleShared=null;lunchFinaleLocalEnd=0;lunchFinaleLocalStart=0;lunchFinaleLeaving=false;lunchFinaleClose();lunchFinaleShownKey='';if(lunchFinaleReplay)lunchFinaleReplay.hidden=true;}
function lunchFinaleEnsureUI(){
 if(lunchFinaleDialog)return;
 lunchFinaleDialog=el('dialog','lunch-finale-dialog');lunchFinaleDialog.id='lunchFinaleDialog';lunchFinaleDialog.setAttribute('aria-label','점심결재 대작전 엔딩 영화');lunchFinaleDialog.setAttribute('closedby','none');lunchFinaleDialog.tabIndex=-1;
 lunchFinaleDialog.innerHTML='<div class="film-grain" aria-hidden="true"></div><div class="film-letterbox film-letterbox-top" aria-hidden="true"></div><div class="film-letterbox film-letterbox-bottom" aria-hidden="true"></div><header class="film-top"><span>점심결재 대작전 <i>THE FINALE</i></span><span class="film-watch-note">함께 보는 엔딩 · 종료 후 로비로</span></header><main class="film-stage"><section class="film-scene film-intro" data-film-scene="0" aria-label="상영 시작"><div class="film-intro-spot" aria-hidden="true"></div><span class="film-eyebrow">A VERY SMALL · VERY SERIOUS LUNCH STORY</span><div class="film-intro-seal">결<br>재</div><h2>오늘도,<br><em>우리는 살아남았다.</em></h2><p>업무도. 메뉴 고민도. 방금 그 게임도.</p><div class="film-intro-credit">신정훈의 <b>점심결재 대작전</b></div></section><section class="film-scene film-lunch" data-film-scene="1" aria-label="오늘의 점심 발표" hidden><div class="film-spotlight" aria-hidden="true"></div><div class="film-lunch-crown">✦ TODAY’S CHAMPION ✦</div><div id="lunchFinaleChampion" class="film-champion" aria-hidden="true"></div><div class="film-receipt"><span class="film-receipt-kicker">축하합니다! · 오늘의 점심 메뉴는</span><small id="lunchFinalePerson"></small><div class="film-receipt-menu"><span id="lunchFinaleFood" aria-hidden="true"></span><h2 id="lunchFinaleMenu"></h2></div><p>입니다.</p><i class="film-approved" aria-hidden="true">점심<br>최종 승인</i></div><p class="film-lunch-caption" id="lunchFinaleLunchAnnounce"></p><div class="film-burst film-burst-a" aria-hidden="true">✷</div><div class="film-burst film-burst-b" aria-hidden="true">✧</div><div class="film-sparkles" aria-hidden="true">✦　·　✧　✦　·　✦　✧　·　✦</div></section><section class="film-scene film-coffee" data-film-scene="2" aria-label="커피 배달 당첨자 발표" hidden><div class="film-coffee-sun" aria-hidden="true"></div><div class="film-coffee-announcement"><span class="film-eyebrow">ONE MORE MISSION · 커피 원정대 출동</span><h2 id="lunchFinaleCoffeeTitle">오늘의 커피 배달은</h2><strong id="lunchFinaleCoffeeName"></strong><p id="lunchFinaleCoffeeText"></p><div class="film-coffee-road" aria-hidden="true"></div><div class="film-coffee-cart"><div id="lunchFinaleCourier" class="film-courier" aria-hidden="true"></div><div class="film-cart-body"><span>☕</span><b>CAFE<br>EXPRESS</b><span>☕</span><i class="film-wheel"></i><i class="film-wheel"></i></div><div class="film-cart-puff" aria-hidden="true">뿌　뿌　☁</div></div></div><aside class="film-coffee-orders" aria-label="최종 주문 음료 내역"><header><h3>오늘의 주문 내역</h3><span id="lunchFinaleOrderCount"></span></header><ol id="lunchFinaleOrders"></ol><p id="lunchFinaleOrdersEmpty" hidden>오늘은 모두 커피 패스.<br>가벼운 발걸음으로 맛점!</p></aside></section><section class="film-scene film-parade" data-film-scene="3" aria-label="밥친구 퍼레이드" hidden><span class="film-eyebrow">NOT PERFECT. STILL TOGETHER.</span><h2>잘했든, 망했든.<br><em>같이 밥 먹으면 됐지!</em></h2><p>오늘의 주인공, 전원 입장.</p><div class="film-parade-banner" aria-hidden="true">고 생 했 어 요　 밥 은 먹 고 합 시 다</div><div class="film-parade-track"><div id="lunchFinaleParade" class="film-parade-march"></div><div class="film-parade-ground" aria-hidden="true"></div></div><div class="film-parade-small">※ 행진이 조금 엉망이어도, 마음만은 진지합니다.</div><div class="film-parade-confetti" aria-hidden="true">▰　✧　▱　✦　▱　▰　✧　▱　✦　▰　▱</div></section><section class="film-scene film-credits" data-film-scene="4" aria-label="엔딩 크레딧" hidden><div class="film-credits-title"><span>THE PEOPLE WHO MADE LUNCH HAPPEN</span><h2>오늘의 출연진</h2></div><div class="film-credit-window"><div id="lunchFinaleCreditRoll" class="film-credit-roll"></div></div><div class="film-credits-warmth" aria-hidden="true">✦</div></section><section class="film-scene film-outro" data-film-scene="5" aria-label="감사 인사" hidden><div class="film-outro-glow" aria-hidden="true"></div><span class="film-eyebrow">TO EVERYONE WHO MADE IT TO LUNCH</span><h2>오늘도 일하시느라<br><em>고생 많으셨어요.</em></h2><p id="lunchFinaleThanks">저의 <b>점심결재 대작전</b>을<br>플레이해주셔서 감사합니다.</p><p class="film-outro-note">잠깐의 웃음과 든든한 한 끼가,<br>우리의 오후를 버티는 힘이 되길.</p><div id="lunchFinaleFinalMascots" class="film-outro-mascots" aria-hidden="true"></div><div class="film-end-title">점심결재 대작전<small>THE END · BUT LUNCH BEGINS</small></div></section></main><footer class="film-bottom"><span id="lunchFinaleSceneName">상영을 시작합니다</span><div class="film-progress" aria-hidden="true"><i id="lunchFinaleProgressFill"></i></div><span>SEE YOU NEXT LUNCH</span></footer>';
 lunchFinaleDialog.querySelector('.film-bottom>span:last-child').textContent='엔딩 후 모두 로비로';document.body.append(lunchFinaleDialog);lunchFinaleDialog.addEventListener('cancel',e=>e.preventDefault());
 const secret=el('details','film-easter-egg'),star=el('summary','','✦'),link=el('a','film-secret-link','@mid_jhs ↗');secret.id='lunchFinaleSecret';star.setAttribute('aria-label','작은 별 살펴보기');star.title='구석의 작은 별';link.id='lunchFinaleSecretLink';link.href=lunchFinaleInstagram;link.target='_blank';link.rel='noopener noreferrer';link.setAttribute('aria-label','제작자 인스타그램 @mid_jhs 새 창에서 보기');secret.append(star,link);lunchFinaleDialog.querySelector('.film-bottom').append(secret);
}
function lunchFinaleEnsureReplay(){if(lunchFinaleReplay)lunchFinaleReplay.hidden=true;}
function lunchFinaleCredit(label,value,extra=false){const row=el('div','film-credit-row'+(extra?' film-credit-extra':''));row.append(el('span','',label),el('b','',value));return row;}
function lunchFinaleDepartment(id,fallback='business'){return typeof netDepartment==='function'&&id?netDepartment(id):fallback;}
function lunchFinaleBuild(data){
 $('lunchFinaleSecret').open=false;
 $('lunchFinalePerson').textContent=data.person+' 님이 선택하신';$('lunchFinaleMenu').textContent=data.menu;$('lunchFinaleFood').textContent=typeof actionFood==='function'?actionFood(data.menu):'🍱';$('lunchFinaleLunchAnnounce').textContent='오늘의 점심 메뉴는 '+data.person+' 님이 선택하신 '+data.menu+'입니다.';
 $('lunchFinaleChampion').innerHTML=deptAvatarSvg(lunchFinaleDepartment(data.winnerId));$('lunchFinaleCourier').innerHTML=deptAvatarSvg(lunchFinaleDepartment(data.coffeeId,'accounting'));
 $('lunchFinaleCoffeeTitle').textContent=data.coffeeName?'오늘의 커피 배달은':'오늘의 커피는';$('lunchFinaleCoffeeName').textContent=data.coffeeName?data.coffeeName+' 님!':'잠깐 쉬어갑니다.';$('lunchFinaleCoffeeText').textContent=data.coffeeName?'당첨되셨습니다! 커피 원정대를 이끌어주세요.':'모두 커피 패스. 오늘은 가벼운 발걸음으로 맛점!';
 const orders=$('lunchFinaleOrders');orders.replaceChildren();$('lunchFinaleOrderCount').textContent=data.orders.length+'잔';$('lunchFinaleOrdersEmpty').hidden=data.orders.length!==0;orders.hidden=data.orders.length===0;
 for(const order of data.orders){const row=el('li','film-coffee-order'),name=el('span','film-coffee-order-name',order.name),drink=el('strong','film-coffee-order-drink',order.drink);row.append(name,drink);if(order.name===data.coffeeName){row.classList.add('is-courier');name.append(el('small','','배달'));}orders.append(row);}
 const names=data.names.length?data.names:[data.person],roll=$('lunchFinaleCreditRoll'),maker=lunchFinaleCredit('기획 · 제작','신정훈');roll.replaceChildren(maker,lunchFinaleCredit('오늘의 메뉴 수호대왕',data.person+' · '+data.menu),lunchFinaleCredit('커피 원정대장',data.coffeeName||'오늘은 모두 커피 패스'));
 if(result?.leagueFormat==='points'){const champions=scoreResultChampionNames();if(champions.length)roll.append(lunchFinaleCredit(champions.length>1?'누적 점수 공동 1위':'누적 점수 1위',champions.join(' · ')));}
 for(const name of names){const row=lunchFinaleCredit('오늘의 주연',name),order=data.orders.find(o=>o.name===name);if(order)row.append(el('small','film-credit-drink','주문 음료 · '+order.drink));roll.append(row);}
 const losing=data.nominations.filter(m=>m.id!==data.winnerId).map(m=>m.menus?.[0]).filter(Boolean);if(losing.length)roll.append(lunchFinaleCredit('함께 제안한 메뉴',[...new Set(losing)].join(' · '),true));
 roll.append(lunchFinaleCredit('특별 출연','아직 읽지 못한 메일',true),lunchFinaleCredit('소품 협찬','식판 · 도장 · 빈 커피잔',true),lunchFinaleCredit('가장 큰 공로','오늘도 자리를 지킨 여러분',true),lunchFinaleCredit('SPECIAL THANKS','같이 웃고, 같이 먹는 우리',true),el('p','film-credit-last','모두의 오후를 응원합니다. ✦'));
 const parade=$('lunchFinaleParade');parade.replaceChildren();const tags=[data.menu,'밥은 먹고 하자','오늘도 수고했어',data.coffeeName?'☕ '+data.coffeeName+' 출동':'커피는 잠깐 쉬어','메일은 잠시만','우리 모두 맛점!','점심은 진심','오후도 파이팅'],people=names.length<4?Array.from({length:4},(_,i)=>names[i%names.length]):names.slice(0,8);
 people.forEach((name,i)=>{const mascot=el('div','film-mascot');mascot.style.setProperty('--march-delay',(-i*.19)+'s');mascot.style.setProperty('--tilt',((i%2?1:-1)*(3+i%4))+'deg');mascot.style.setProperty('--mascot-color',['#b9d67e','#c5a0df','#eda992','#8dccca','#e6c675','#b6c6e4','#dcac98','#c1c7a0'][i%8]);mascot.dataset.odd=String(i%4);const sprite=el('div','film-mascot-sprite');sprite.innerHTML=deptAvatarSvg(['business','accounting','hotel','tourism','economics','japanese','translation','international'][i%8]);mascot.append(el('b','film-mascot-sign',tags[i%tags.length]),sprite,el('small','film-mascot-name',name));parade.append(mascot);});
 const final=$('lunchFinaleFinalMascots');final.innerHTML=deptAvatarSvg('business')+deptAvatarSvg('accounting')+deptAvatarSvg('hotel');
}
function lunchFinalePlan(data){
 const plan=lunchFinaleTimeline(data),creditDuration=plan.credits;lunchFinaleSceneTimes=plan.sceneTimes;lunchFinaleDuration=plan.duration;
 if(lunchFinaleDialog?.style?.setProperty)lunchFinaleDialog.style.setProperty('--film-credit-duration',creditDuration+'ms');
}
function lunchFinaleCreditLayout(){
 const roll=$('lunchFinaleCreditRoll'),window=roll?.parentElement;
 if(!roll?.style?.setProperty)return;
 roll.style.setProperty('--film-credit-start',Math.max(100,window?.clientHeight||300)+'px');
 roll.style.setProperty('--film-credit-end',(-Math.max(100,roll.scrollHeight||900))+'px');
}
function lunchFinaleSceneAt(elapsed){let scene=0;for(let i=1;i<lunchFinaleSceneTimes.length;i++)if(elapsed>=lunchFinaleSceneTimes[i])scene=i;return scene;}
function lunchFinaleAdvance(now=lunchFinaleNow()){
 if(!lunchFinaleDialog?.open)return;const elapsed=Math.max(0,now-lunchFinaleStartedAt);if(elapsed>=lunchFinaleDuration){lunchFinaleClose();return;}
 const scene=lunchFinaleSceneAt(elapsed);
 if(scene!==lunchFinaleCurrentScene){lunchFinaleCurrentScene=scene;lunchFinaleDialog.dataset.scene=String(scene);lunchFinaleDialog.style?.setProperty?.('--film-scene-delay',-Math.max(0,elapsed-lunchFinaleSceneTimes[scene])+'ms');lunchFinaleDialog.querySelectorAll('[data-film-scene]').forEach((node,i)=>{node.hidden=i!==scene;node.classList.toggle('is-current',i===scene);});$('lunchFinaleSceneName').textContent=lunchFinaleSceneLabels[scene];if(scene===3&&$('lunchFinaleParade').style?.setProperty)$('lunchFinaleParade').style.setProperty('--parade-start',Math.max(300,(lunchFinaleDialog.clientWidth||1000)-4)+'px');if(scene===4)lunchFinaleCreditLayout();lunchFinaleTone(scene);}
 $('lunchFinaleProgressFill').style.width=(elapsed/lunchFinaleDuration*100).toFixed(2)+'%';
}
function lunchFinaleOpen(replay=false){
 lunchFinaleSyncContext();if(netIsHost())lunchFinaleEnsureSchedule();const data=lunchFinaleScheduleCurrent()?lunchFinaleShared.data:null;if(!data||lunchFinaleNow()>=lunchFinaleLocalEnd||!replay&&lunchFinaleSeen.has(data.key))return false;
 lunchFinaleEnsureUI();lunchFinaleEnsureReplay();lunchFinaleBuild(data);lunchFinalePlan(data);lunchFinaleShownKey=data.key;lunchFinaleSeen.add(data.key);if(lunchFinaleSeen.size>20)lunchFinaleSeen.delete(lunchFinaleSeen.values().next().value);
 if(!lunchFinaleDialog.open)lunchFinaleFocus=document.activeElement;lunchFinaleStopSound();lunchFinaleCurrentScene=-1;lunchFinaleStartedAt=lunchFinaleLocalStart;if(!lunchFinaleDialog.open)lunchFinaleDialog.showModal();lunchFinaleAdvance();lunchFinaleDialog.focus({preventScroll:true});return true;
}
function lunchFinaleTick(){
 lunchFinaleSyncContext();const created=netIsHost()&&lunchFinaleEnsureSchedule();if(created&&typeof netPublish==='function'&&(typeof netApplying==='undefined'||!netApplying))netPublish();
 const data=lunchFinaleScheduleCurrent()?lunchFinaleShared.data:null;lunchFinaleEnsureReplay();if(lunchFinaleReplay)lunchFinaleReplay.hidden=true;
 if(!data){if(lunchFinaleDialog?.open)lunchFinaleClose();return;}if(lunchFinaleMaybeLeave())return;
 if(lunchFinaleDialog?.open&&lunchFinaleShownKey!==data.key)lunchFinaleClose();
 // A browser dismissal must never expose the result controls during the shared film.
 if(!lunchFinaleDialog?.open&&lunchFinaleNow()<lunchFinaleLocalEnd)lunchFinaleOpen(true);else lunchFinaleAdvance();
}
setInterval(lunchFinaleTick,100);netRoom.onDisconnect(e=>{if(e.self||e.hostLost)lunchFinaleReset();});
/* END_LUNCH_FINALE_V2 */
