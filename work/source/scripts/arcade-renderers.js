

/* TEN_GAME_VARIETY_UI */
Object.assign(arcadeGames,{
 brawl:{name:'식판 격투장',icon:'🥊',tag:'격투 · 주먹 한 방',hint:'방향키로 붙어서 Space로 펀치! 바라보는 방향으로 때려요. 마지막 생존자가 승리.',action:'펀치!',key:'SPACE / F',input:'hit',color:'#eaa38d'},
 kart:{name:'커피컵 카트 경주',icon:'🏎️',tag:'경주 · 컵 잡고 코너링',hint:'↑로 가속, ←/→로 코스 변경! 물웅덩이를 피하고 Space 터보로 3바퀴 먼저!',action:'터보!',key:'SPACE / F',input:'dash',color:'#9fced5'},
 basket:{name:'반찬 농구',icon:'🏀',tag:'스포츠 · 포물선 슛',hint:'←/→로 슛 각도를 맞추고 Space로 던져! 움직이는 골대에 넣으면 2점, 정중앙은 3점.',action:'슛!',key:'SPACE / F',input:'hit',color:'#eac673'},
 doors:{name:'빈 식당 눈치전',icon:'🚪',tag:'눈치 · 몰리면 손해',hint:'세 식당 중 하나를 몰래 골라! 적게 몰린 식당일수록 높은 점수. 선택은 공개 전까지 비밀.',action:'선택!',key:'A / W / D',input:'hit',color:'#c5a7d7'},
 rhythm:{name:'복사기 리듬전',icon:'🎵',tag:'리듬 액션 · 칼퇴 박자',hint:'음표가 아래 선에 오면 A / W / D! 왼쪽·가운데·오른쪽 박자를 맞춰 콤보를 쌓아.',action:'박자!',key:'A / W / D',input:'hit',color:'#abc985'}
});
let arcadeTenChoices=null;
const arcadeTenBuildBase=arcadeBuildBoard;
arcadeBuildBoard=function(w){
 arcadeTenBuildBase(w);const scene=$('arcadeScenery');
 if(w.game==='kart'){scene.append(el('div','ten-kart-track'),el('div','ten-kart-grass'),el('div','ten-kart-finish','START / FINISH'));}
 if(w.game==='basket'){scene.append(el('div','ten-basket-floor'));const hoop=el('div','ten-hoop');hoop.id='tenHoop';hoop.append(el('i'));scene.append(hoop);}
 if(w.game==='doors'){const room=el('div','ten-restaurants');for(let i=0;i<3;i++){const card=el('div','ten-restaurant');card.dataset.choice=i;card.append(el('span','','🚪'),el('b','',w.meta.labels[i]),el('strong','','?명'),el('small','','예약 '+(w.meta.reservedCounts?.[i]||0)+'명'));room.append(card);}scene.append(room);}
 if(w.game==='rhythm'){scene.append(el('div','ten-beat-lane lane-0'),el('div','ten-beat-lane lane-1'),el('div','ten-beat-lane lane-2'),el('div','ten-hit-line'));const judge=el('div','ten-rhythm-judge');judge.id='tenRhythmJudge';scene.append(judge);}
};
function arcadeTenEnsureControls(){
 if(arcadeTenChoices||!arcadeDialog)return;arcadeTenChoices=el('div','ten-choice-controls');arcadeTenChoices.hidden=true;
 for(let i=0;i<3;i++){const b=el('button','',i===0?'왼쪽':i===1?'가운데':'오른쪽');b.type='button';b.dataset.tenChoice=i;b.setAttribute('aria-label','오락실 선택 '+(i+1));b.append(el('kbd','',['A / ←','W / ↑','D / →'][i]));b.addEventListener('pointerdown',e=>{if(b.disabled)return;e.preventDefault();e.stopPropagation();arcadeInput(['jump','hit','dash'][i],true);});b.addEventListener('click',e=>{if(e.detail===0&&!b.disabled)arcadeInput(['jump','hit','dash'][i],true);});arcadeTenChoices.append(b);}
 $('arcadeControls').prepend(arcadeTenChoices);
}
const arcadeTenDrawBase=arcadeDrawWorld;
arcadeDrawWorld=function(s,w,g,self){
 arcadeTenDrawBase(s,w,g,self);arcadeDialog.dataset.game=w.game;arcadeTenEnsureControls();const t=w.elapsed,own=w.players.find(p=>p.id===self),play=s.phase==='round'&&w.phase==='play'&&own&&!own.eliminated&&!own.forfeited,objects=$('arcadeObjects');
 const choose=['doors','rhythm'].includes(w.game);arcadeTenChoices.hidden=!choose;arcadeDialog.querySelector('[data-arcade-control="action"]').hidden=choose;
 if(['brawl','kart','basket'].includes(w.game))$('arcadeDpad').hidden=false;
 const center=$('arcadeDpad').querySelector('i');center.textContent=w.game==='basket'?'각도':w.game==='kart'?'조향':'이동';
 for(const [i,b]of [...arcadeTenChoices.children].entries()){b.disabled=!play||(w.game==='doors'&&(w.meta.phase!=='choose'||own.locked));b.firstChild.textContent=w.game==='doors'?(w.meta.labels[i]||['왼쪽','가운데','오른쪽'][i]):['←','●','→'][i];}
 if(w.game==='brawl'){for(const p of w.players){const a=arcadeUIActors.get(p.id);a.querySelector('.five-actor-tag').textContent=(p.id===self?'▼ 내 메뉴 ':'')+Math.ceil(p.hp)+' HP';a.classList.toggle('is-punching',t<p.attackUntil);if(t<p.attackUntil){const punch=arcadeObjectNode('punch:'+p.id,'span','ten-punch','💥');punch.style.left=(p.x+p.faceX*55)/7+'%';punch.style.top=(p.y+p.faceY*55)/4.6+'%';}}}
 if(w.game==='kart'){for(const o of w.objects){if(!['puddle','boost'].includes(o.kind))continue;const n=arcadeObjectNode('kart:'+o.id,'span','ten-kart-object '+o.kind,o.kind==='puddle'?'💧':'⚡');n.style.left=o.x/7+'%';n.style.top=o.y/4.6+'%';n.classList.toggle('is-preview',t<o.readyAt);}for(const p of w.players){const a=arcadeUIActors.get(p.id);a.classList.add('is-kart');a.querySelector('.five-actor-tag').textContent=(p.id===self?'▼ ':'')+Math.min(3,Math.floor(p.progress)+1)+'/3바퀴';}}
 if(w.game==='basket'){const h=$('tenHoop');h.style.left=w.meta.hoopX/7+'%';h.style.top=w.meta.hoopY/4.6+'%';h.style.width=w.meta.hoopRadius*2/7+'%';for(const p of w.players){const aim=arcadeObjectNode('aim:'+p.id,'i','ten-basket-aim');aim.style.left=p.x/7+'%';aim.style.top=p.y/4.6+'%';aim.style.transform='rotate('+(-p.aim)+'deg)';}for(const o of w.objects){const ball=arcadeObjectNode('ball:'+o.id,'span','ten-basket-ball','🏀');ball.style.left=o.x/7+'%';ball.style.top=o.y/4.6+'%';}arcadeSetText('arcadeStatus',own?'슛 각도 '+Math.round(own.aim)+'° · '+own.makes+'골 / '+own.attempts+'슛':g.hint);}
 if(w.game==='doors'){const reveal=w.meta.phase==='reveal';for(const card of $('arcadeScenery').querySelectorAll('.ten-restaurant')){const i=Number(card.dataset.choice);card.querySelector('strong').textContent=reveal?w.meta.counts[i]+'명':'?명';card.querySelector('small').textContent=reveal?'총 '+(w.meta.totalCounts?.[i]??w.meta.counts[i])+'명':'예약 '+(w.meta.reservedCounts?.[i]||0)+'명 · 선택 비밀';card.classList.toggle('is-own',reveal&&own?.choice===i);}arcadeSetText('arcadeStatus','눈치 '+(w.meta.stage+1)+'/6 · '+(reveal?'공개! 다음 선택을 준비해':own?.locked?'선택 완료! 다른 사람을 기다려':'어느 식당이 덜 붐빌까?')+' · '+w.meta.stageLeft.toFixed(1)+'초');arcadeSetText('arcadeOwnStatus',own?Math.round(own.score)+'점'+(own.locked?' · 선택 완료':''):'관전 중');}
 if(w.game==='rhythm'){const resolved=new Set(own?.resolvedNotes||[]);for(const o of w.objects){const until=o.hitAt-t;if(resolved.has(o.id)||until>w.meta.travelTime||until<-.25)continue;const n=arcadeObjectNode('note:'+o.id,'span','ten-rhythm-note lane-'+o.lane,['◀','●','▶'][o.lane]);n.style.left=[20,50,80][o.lane]+'%';n.style.top=(8+(1-until/w.meta.travelTime)*72)+'%';}arcadeSetText('tenRhythmJudge',own?(t<own.judgeUntil?own.judge:own.combo+' COMBO'):'박자에 맞춰!');arcadeSetText('arcadeOwnStatus',own?Math.round(own.score)+'점 · '+own.combo+' COMBO':'관전 중');}
 if(['brawl','kart','basket'].includes(w.game)){const ready=own?(w.game==='brawl'?own.hitReadyAt:w.game==='basket'?own.shotReadyAt:own.dashReadyAt)||0:0,cool=Math.max(0,ready-t),b=arcadeDialog.querySelector('[data-arcade-control="action"]');b.disabled=!play||cool>.05;arcadeSetText('arcadeActionHint',cool>.05?cool.toFixed(1)+'초 뒤 다시':g.key);}
 arcadeObjectCleanup();
};
function arcadeTenInstall(){document.addEventListener('keydown',e=>{const w=arcadeState?.world;if(!arcadeDialog?.open||!['doors','rhythm'].includes(w?.game)||e.target?.matches?.('input,textarea,select,[contenteditable="true"]'))return;const i=['KeyA','ArrowLeft'].includes(e.code)?0:['KeyW','ArrowUp','Space','KeyF'].includes(e.code)?1:['KeyD','ArrowRight'].includes(e.code)?2:-1;if(i<0)return;e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)arcadeInput(['jump','hit','dash'][i],true);},true);}
/* END_TEN_GAME_VARIETY_UI */

/* ARCADE_TRAY_UI_V1 */
Object.assign(arcadeGames,{tray:{name:'식판 서바이벌',icon:'🍽️',tag:'서바이벌 · 무너지는 바닥',hint:'방향키로 이동, Space로 밀치기! 빨간 바닥은 곧 사라져. 떨어지면 탈락, 끝까지 식판을 지켜!',action:'밀쳐!',key:'SPACE / F',input:'dash',color:'#b4c4bd'}});
const arcadeTrayTiles=new Map();
const arcadeTrayBuildBase=arcadeBuildBoard;
arcadeBuildBoard=function(w){
 arcadeTrayBuildBase(w);arcadeTrayTiles.clear();if(w.game!=='tray')return;
 const scene=$('arcadeScenery'),rim=el('div','tray-arcade-rim'),caption=el('b','tray-arcade-caption','오늘의 식판은 한 명만 남는다');scene.append(rim,caption);
 for(const o of w.objects){if(o.kind!=='tray-tile')continue;const tile=el('div','tray-arcade-tile');tile.style.left=o.x/7+'%';tile.style.top=o.y/4.6+'%';tile.style.width='calc('+o.width/7+'% - 3px)';tile.style.height='calc('+o.height/4.6+'% - 3px)';tile.dataset.ring=String(o.ring);scene.append(tile);arcadeTrayTiles.set(o.id,tile);}
 const gust=el('div','tray-arcade-gust','후우우웅 →');gust.id='arcadeTrayGust';gust.hidden=true;scene.append(gust);
};
const arcadeTrayDrawBase=arcadeDrawWorld;
arcadeDrawWorld=function(s,w,g,self){
 arcadeTrayDrawBase(s,w,g,self);if(w.game!=='tray')return;
 const t=w.elapsed,own=w.players.find(p=>p.id===self),live=s.phase==='round'&&w.phase==='play',can=live&&own&&!own.eliminated&&!own.forfeited;
 for(const o of w.objects){const tile=arcadeTrayTiles.get(o.id);if(!tile)continue;tile.classList.toggle('is-warning',t>=o.warningAt&&t<o.goneAt);tile.classList.toggle('is-gone',t>=o.goneAt);}
 $('arcadeDpad').hidden=false;arcadeDialog.querySelector('[data-arcade-control="action"]').hidden=false;
 const gust=$('arcadeTrayGust');if(gust){gust.hidden=t>=w.meta.gustUntil;gust.style.rotate=Math.atan2(w.meta.gustY,w.meta.gustX)+'rad';}
 for(const p of w.players){const actor=arcadeUIActors.get(p.id);if(!actor)continue;actor.classList.toggle('is-tray-fall',p.eliminated||p.forfeited);actor.querySelector('.five-actor-tag').textContent=(p.id===self?'▼ 내 식판 ':'')+(p.forfeited?'기권':p.eliminated?'추락!':p.shoves+'번 밀침');}
 const remaining=w.players.filter(p=>!p.eliminated&&!p.forfeited).length,cool=own?Math.max(0,own.dashReadyAt-t):0;
 arcadeSetText('arcadeStatus',s.phase==='between'||s.phase==='done'?s.notice:remaining+'명 생존 · '+(w.meta.notice||g.hint));
 arcadeSetText('arcadeOwnStatus',!own?'관전 중':own.eliminated||own.forfeited?'추락 · 남은 친구 관전 중':own.shoves+'번 밀침 · 내 식판 사수 중');
 arcadeSetText('arcadeActionHint',cool>.05?cool.toFixed(1)+'초 뒤 다시':g.key);
 const action=arcadeDialog.querySelector('[data-arcade-control="action"]');action.disabled=!can||cool>.05;
};
/* END_ARCADE_TRAY_UI_V1 */

/* ARCADE_SPORTS_UI_V1 */
Object.assign(arcadeGames,{
 pong:{name:'식판 탁구',icon:'🏓',tag:'스포츠 · 반사 랠리',hint:'목표: 반사 점수! ↑/↓로 패들을 옮기고 Space로 스매시. 공이 닿는 위치로 반사각을 바꿔요.',action:'스매시!',key:'↑ / ↓ · SPACE',input:'hit',color:'#81c6bf',duel:true,controls:'standard'},
 curling:{name:'얼음컵 컬링',icon:'🥌',tag:'빙판 · 마찰과 정확도',hint:'목표: 3개 돌을 과녁 중심으로! ←/→ 조준, Space로 파워 시작 → 한 번 더 발사. 약한 힘도 중요해요.',action:'파워 / 발사',key:'← / → · SPACE 두 번',input:'hit',color:'#abd5df',duel:true,controls:'standard'},
 bowling:{name:'생수병 볼링',icon:'🎳',tag:'볼링 · 핀 연쇄 충돌',hint:'목표: 3프레임에 많은 핀! ←/→로 조준하고 Space 두 번으로 투구. 핀이 옆 핀도 쓰러뜨려요.',action:'파워 / 투구',key:'← / → · SPACE 두 번',input:'hit',color:'#dfb37e',duel:true,controls:'standard'},
 volley:{name:'풍선 배구',icon:'🎈',tag:'유지 액션 · 재서브',hint:'목표: 풍선 오래 받아치기! ←/→로 아래에 서서 Space. 떨어져도 잠깐 감점 뒤 다시 시작해요.',action:'받아쳐!',key:'← / → · SPACE',input:'hit',color:'#e9a8b6',duel:true,controls:'standard'},
 golf:{name:'식당 미니골프',icon:'⛳',tag:'미니골프 · 벽 반사',hint:'목표: 적은 타수로 3홀! ←/→ 방향, Space 두 번으로 파워 퍼팅. 장애물과 벽의 반사각을 이용해요.',action:'파워 / 퍼팅',key:'← / → · SPACE 두 번',input:'hit',color:'#a6c980',duel:true,controls:'standard'},
 parking:{name:'도시락 주차왕',icon:'🚗',tag:'운전 · 관성과 정렬',hint:'목표: 주차칸에 1초 안착! ↑/↓ 전후진, ←/→ 회전, Space 브레이크. 낮은 속도와 방향이 중요해요.',action:'브레이크!',key:'방향키 · SPACE',input:'hit',color:'#a9b5cf',duel:true,controls:'standard'}
});
const arcadeSportsKeys=new Set(['pong','curling','bowling','volley','golf','parking']);
let arcadeSportsBoard='';const arcadeSportsPanels=new Map();
function arcadeSportsPanel(w,p,self){
 const panel=el('section','sport-court'+(p.id===self?' is-own':''));panel.dataset.owner=p.id;panel.dataset.game=w.game;panel.style.setProperty('--sport-color',trayPalette[p.index%8]);
 const head=el('div','sport-head');head.append(el('b','',p.name+(p.id===self?' · 나':'')),el('strong','sport-points','0'));
 const field=el('div','sport-field'),layer=el('div','sport-items'),actor=el('div','sport-gremlin');actor.innerHTML=deptAvatarSvg(p.department||'business');field.append(layer,actor);
 const judge=el('small','sport-judge'),power=el('div','sport-power'),fill=el('i');power.append(fill);field.append(judge,power);const foot=el('small','sport-detail');panel.append(head,field,foot);
 return{panel,field,layer,actor,judge,power,fill,foot,score:head.lastChild,nodes:new Map(),used:new Set()};
}
function arcadeSportNode(view,key,cls,text){let node=view.nodes.get(key);if(!node){node=el('i',cls);view.nodes.set(key,node);view.layer.append(node);}if(node.className!==cls)node.className=cls;if(text!==undefined&&node.textContent!==String(text))node.textContent=String(text);view.used.add(key);return node;}
function arcadeSportPlace(node,x,y){node.style.left=(x/7)+'%';node.style.top=(y/4.6)+'%';}
function arcadeSportRect(node,r){arcadeSportPlace(node,r.x,r.y);node.style.width=(r.w/7)+'%';node.style.height=(r.h/4.6)+'%';}
const arcadeSportsBuildBase=arcadeBuildBoard;
arcadeBuildBoard=function(w){
 arcadeSportsBuildBase(w);arcadeSportsBoard='';arcadeSportsPanels.clear();if(!arcadeSportsKeys.has(w.game))return;
 arcadeSportsBoard=w.id+':'+w.game;const root=el('div','sports-courts');root.id='arcadeSportsCourts';root.dataset.count=String(w.players.length);root.classList.toggle('is-crowded',w.players.length>4);
 const self=arcadeSelf();for(const p of [...w.players].sort((a,b)=>Number(b.id===self)-Number(a.id===self))){const v=arcadeSportsPanel(w,p,self);arcadeSportsPanels.set(p.id,v);root.append(v.panel);}
 $('arcadeScenery').append(root);
};
const arcadeSportsDrawBase=arcadeDrawWorld;
arcadeDrawWorld=function(s,w,g,self){
 arcadeSportsDrawBase(s,w,g,self);if(!arcadeSportsKeys.has(w.game))return;
 if(arcadeSportsBoard!==w.id+':'+w.game||!$('arcadeSportsCourts'))arcadeBuildBoard(w);
 const own=w.players.find(p=>p.id===self),t=w.elapsed;
 for(const p of w.players){const v=arcadeSportsPanels.get(p.id);if(!v)continue;v.used.clear();v.panel.classList.toggle('is-out',p.forfeited||p.eliminated);v.score.textContent=Math.round(p.score)+'점';v.judge.textContent=t<p.judgeUntil?p.judge:'';v.power.hidden=p.phase!=='power';v.fill.style.width=(p.power*100)+'%';v.actor.classList.toggle('is-action',t<p.actionUntil);v.actor.hidden=!['pong','curling','bowling','volley'].includes(w.game);
  let detail='';
  if(w.game==='pong'){
   const paddle=arcadeSportNode(v,'paddle','sport-paddle');arcadeSportPlace(paddle,61,p.paddleY);paddle.style.height='26%';paddle.classList.toggle('is-smash',t<p.smashUntil);const back=arcadeSportNode(v,'wall','sport-pong-wall');arcadeSportRect(back,{x:664,y:26,w:9,h:408});arcadeSportPlace(v.actor,38,p.paddleY);detail=p.rallies+'회 반사 · 놓침 '+p.misses;
  }
  if(w.game==='curling'){
   arcadeSportPlace(arcadeSportNode(v,'target','sport-curl-target'),350,125);arcadeSportPlace(v.actor,350,425);const aim=arcadeSportNode(v,'aim','sport-aim sport-aim-up');arcadeSportPlace(aim,350,419);aim.style.transform='translate(-50%,-100%) rotate('+p.aim+'rad)';aim.hidden=!['ready','power'].includes(p.phase);detail=p.shots+'/3투 · '+(p.phase==='done'?'완료':p.phase==='power'?'한 번 더 눌러 발사':p.phase==='moving'?'미끄러지는 중':'조준 후 Space');
  }
  if(w.game==='bowling'){
   arcadeSportPlace(v.actor,350,425);const aim=arcadeSportNode(v,'aim','sport-aim sport-aim-up');arcadeSportPlace(aim,350,419);aim.style.transform='translate(-50%,-100%) rotate('+p.aim+'rad)';aim.hidden=!['ready','power'].includes(p.phase);detail=Math.min(3,p.completed+1)+'/3프레임 · 이번 '+p.framePins+'핀';
  }
  if(w.game==='volley'){arcadeSportPlace(v.actor,p.x,418);v.actor.classList.toggle('is-hitting',t<p.actionUntil);detail=p.hits+'번 살림 · 놓침 '+p.misses;}
  if(w.game==='golf'){
   const layout=w.meta.layouts[p.hole%3];arcadeSportPlace(arcadeSportNode(v,'hole','sport-golf-hole'),layout.hole.x,layout.hole.y);for(const [i,r]of layout.walls.entries())arcadeSportRect(arcadeSportNode(v,'barrier:'+i,'sport-golf-wall'),r);const aim=arcadeSportNode(v,'aim','sport-aim sport-aim-right');arcadeSportPlace(aim,p.x,p.y);aim.style.transform='translateY(-50%) rotate('+p.aim+'rad)';aim.hidden=!['ready','power'].includes(p.phase);detail=Math.min(3,p.hole+1)+'/3홀 · '+p.holeStrokes+'타';
  }
  if(w.game==='parking'){
   const target=w.meta.spots[p.target%w.meta.spots.length],slot=arcadeSportNode(v,'slot','sport-parking-slot','P');arcadeSportPlace(slot,target.x,target.y);slot.style.transform='translate(-50%,-50%) rotate('+target.angle+'rad)';slot.classList.toggle('is-parking',p.parkHold>0);const car=arcadeSportNode(v,'car','sport-car');arcadeSportPlace(car,p.x,p.y);car.style.transform='translate(-50%,-50%) rotate('+p.angle+'rad)';car.classList.toggle('is-braking',t<p.actionUntil);for(const [i,r]of w.meta.walls.entries())arcadeSportRect(arcadeSportNode(v,'barrier:'+i,'sport-parking-obstacle'),r);detail=p.parked+'대 주차 · '+Math.round(Math.abs(p.speed))+'km/h'+(p.parkHold>0?' · 정렬 '+Math.floor(p.parkHold*100)+'%':'');
  }
  for(const o of w.objects){if(o.ownerId!==p.id)continue;let cls='sport-ball sport-'+o.kind;if(o.down)cls+=' is-down';const node=arcadeSportNode(v,o.id,cls);arcadeSportPlace(node,o.x,o.y);node.hidden=w.game==='pong'||w.game==='volley'?t<(o.serveAt||0):false;if(o.kind==='curlStone')node.classList.toggle('is-settled',o.settled);}
  for(const [key,node]of v.nodes)if(!v.used.has(key)){node.remove();v.nodes.delete(key);}v.foot.textContent=detail;
 }
 if(own){arcadeSetText('arcadeOwnStatus',Math.round(own.score)+'점 · '+(t<own.judgeUntil?own.judge:own.phase==='power'?'파워 '+Math.round(own.power*100)+'%':''));const next=Math.max(0,(own.readyAt||0)-t),moving=['moving','between','done'].includes(own.phase)&&['curling','bowling','golf'].includes(w.game),button=arcadeDialog.querySelector('[data-arcade-control="action"]');button.disabled=s.phase!=='round'||w.phase!=='play'||!own||own.forfeited||own.eliminated||moving||next>.01;arcadeSetText('arcadeActionLabel',own.phase==='power'?'지금 발사!':g.action);arcadeSetText('arcadeActionHint',moving?'결과를 기다려요':next>.01?next.toFixed(1)+'초':g.key);if(s.phase==='round'&&w.phase==='play')arcadeSetText('arcadeStatus',t<own.judgeUntil?own.judge:own.phase==='power'?'파워 '+Math.round(own.power*100)+'% · 한 번 더 눌러 발사!':w.game==='parking'?'주차 '+own.parked+'대 · 낮은 속도 + 칸 방향 정렬 1초':w.game==='pong'?'반사 '+own.rallies+'회 · ↑/↓ 패들, Space 스매시':w.game==='volley'?'풍선 '+own.hits+'번 살림 · 풍선 아래에서 Space':w.game==='golf'?(own.hole+1)+'/3홀 · '+own.holeStrokes+'타 · 벽 반사로 우회':w.game==='bowling'?Math.min(3,own.completed+1)+'/3프레임 · 이번 '+own.framePins+'핀':own.shots+'/3투 · 과녁 중심을 노려요');}
 $('arcadeDpad').hidden=false;
};
/* END_ARCADE_SPORTS_UI_V1 */

/* ARCADE_ACTION_PACK_UI_V1 */
Object.assign(arcadeGames,{
 dodgeball:{name:'급식 피구대회',icon:'🏐',tag:'액션 · 공 던져 명중',hint:'방향키로 이동하며 던질 방향을 보고 Space! 명중 +100점, 맞으면 -18점 후 빠른 복귀.',action:'던져!',key:'SPACE / F',input:'hit',color:'#e5a38b',duel:true,controls:'standard'},
 crown:{name:'왕관은 내 밥',icon:'👑',tag:'쟁탈 · 왕관 오래 지키기',hint:'왕관을 잡고 오래 버텨! 방향키 이동, Space 돌진으로 빼앗기. 모서리에 오래 숨으면 왕관이 떨어져.',action:'뺏어!',key:'SPACE / F',input:'dash',color:'#e6cc7e',duel:true,controls:'standard'},
 lasers:{name:'레이저 야근실',icon:'🔴',tag:'회피 · 회전과 스윕',hint:'점선은 예고, 빨간 레이저는 위험! 방향키로 피하고 Space로 짧게 대시. 맞아도 다시 돌아와요.',action:'대시!',key:'SPACE / F',input:'dash',color:'#a9c6bc',duel:true,controls:'standard'},
 frogger:{name:'횡단보도 배달왕',icon:'🚦',tag:'횡단 · 왕복 배송',hint:'방향키로 한 칸씩, Space로 바라보는 쪽 두 칸 도약! 차량과 친구를 피해서 건너편까지 왕복 배달해.',action:'두 칸!',key:'SPACE / F',input:'dash',color:'#8dc9b5',duel:true,controls:'standard'},
 bridge:{name:'나무다리 공사판',icon:'🪵',tag:'건설 · 공용 나무 경쟁',hint:'아래 땅에서 나무를 모아 내 색 다리 입구로! Space로 한 칸 건설. 나무는 최대 3개, 먼저 다리를 완성해.',action:'놓아!',key:'SPACE / F',input:'hit',color:'#bfc294',duel:true,controls:'standard'},
 claw:{name:'탕비실 집게왕',icon:'🦾',tag:'집기 · 흔들리는 공용 상품',hint:'←/→로 집게를 조준하고 Space로 내려! 상품은 먼저 잡은 사람 것. 무거운 상품은 고득점이지만 회수가 느려.',action:'내려!',key:'SPACE / F',input:'hit',color:'#c7a9d7',duel:true,controls:'standard'}
});
const actionPackKeys=new Set(['dodgeball','crown','lasers','frogger','bridge','claw']),actionPackPalette=typeof trayPalette!=='undefined'&&Array.isArray(trayPalette)&&trayPalette.length?trayPalette:['#b9d67e','#c5a0df','#e6c675','#8dccca','#eda992','#a5b7dc','#dbaa93','#b9c49c'];
const actionPackNodes=new Map();let actionPackLayer=null,actionPackFrame=0;
function actionPackNode(key,tag,cls,text){let entry=actionPackNodes.get(key);if(!entry){entry={node:el(tag,cls),frame:0};actionPackNodes.set(key,entry);actionPackLayer.append(entry.node);}entry.frame=actionPackFrame;const n=entry.node;if(n.className!==cls)n.className=cls;if(text!==undefined&&n.textContent!==String(text))n.textContent=String(text);return n;}
function actionPackClean(){for(const[key,entry]of actionPackNodes)if(entry.frame!==actionPackFrame){entry.node.remove();actionPackNodes.delete(key);}}
function actionPackPosition(node,x,y){node.style.left=x/7+'%';node.style.top=y/4.6+'%';}
function actionPackStatic(cls,text){const node=el('div',cls,text);$('arcadeScenery').append(node);return node;}
const actionPackBuildBase=arcadeBuildBoard;
arcadeBuildBoard=function(w){
 actionPackBuildBase(w);actionPackNodes.clear();actionPackLayer=null;actionPackFrame=0;if(!actionPackKeys.has(w.game))return;
 if(w.game==='dodgeball'){actionPackStatic('ap-court');actionPackStatic('ap-center-line');actionPackStatic('ap-center-circle');actionPackStatic('ap-scene-title','급식실 피구 코트 · 맞아도 바로 복귀');}
 if(w.game==='crown'){actionPackStatic('ap-throne-circle');for(const corner of ['tl','tr','bl','br'])actionPackStatic('ap-corner '+corner,'캠핑 금지');actionPackStatic('ap-scene-title','👑 왕관 보유 시간으로 승부');}
 if(w.game==='lasers'){actionPackStatic('ap-laser-floor');actionPackStatic('ap-emitter left','◉');actionPackStatic('ap-emitter right','◉');actionPackStatic('ap-scene-title','WARNING · 빨간 선은 위험!');}
 if(w.game==='frogger'){
  for(let row=0;row<10;row++){const lane=actionPackStatic(w.meta.safeRows.includes(row)?'ap-traffic-safe':'ap-traffic-road');lane.style.top=(430-row*42-20)/4.6+'%';lane.style.height=40/4.6+'%';if(row===0||row===9)lane.textContent=row===9?'배달 도착 · 다시 아래로!':'출발 · 위로 배달해요';else if(row===4)lane.textContent='잠깐 쉬는 안전지대';}
 }
 if(w.game==='bridge'){
  actionPackStatic('ap-bridge-water');actionPackStatic('ap-bridge-land');actionPackStatic('ap-finish-bank','건너편 도착');
  for(const p of w.players){const lane=actionPackStatic('ap-bridge-outline');lane.style.left=p.laneX/7+'%';lane.style.width=Math.min(58,700/w.players.length*.65)/7+'%';lane.style.borderColor=actionPackPalette[p.index%8];const entry=actionPackStatic('ap-bridge-entry',p.name);entry.style.left=p.laneX/7+'%';entry.style.background=actionPackPalette[p.index%8];}
 }
 if(w.game==='claw'){actionPackStatic('ap-claw-cabinet');actionPackStatic('ap-claw-rail');actionPackStatic('ap-scene-title','탕비실 경품 · 먼저 집은 사람이 임자!');}
 actionPackLayer=el('div','action-pack-layer');$('arcadeScenery').append(actionPackLayer);
};
const actionPackDrawBase=arcadeDrawWorld;
arcadeDrawWorld=function(s,w,g,self){
 actionPackDrawBase(s,w,g,self);if(!actionPackKeys.has(w.game)||!actionPackLayer)return;
 const t=w.elapsed,own=w.players.find(p=>p.id===self),live=s.phase==='round'&&w.phase==='play',can=live&&own&&!own.eliminated&&!own.forfeited;actionPackFrame++;
 for(const p of w.players){const actor=arcadeUIActors.get(p.id);if(actor){actor.classList.toggle('is-respawning',t<(p.respawnUntil||0)||w.game==='frogger'&&t<p.stunUntil);actor.classList.toggle('has-crown',w.game==='crown'&&w.meta.ownerId===p.id);const tag=actor.querySelector('.five-actor-tag');if(tag)tag.textContent=(p.id===self?'▼ ':'')+(w.game==='dodgeball'?p.hits+'명중':w.game==='crown'?p.heldSeconds.toFixed(1)+'초':w.game==='lasers'?p.received+'피격':w.game==='frogger'?p.deliveries+'배송':w.game==='bridge'?p.bridgeSteps+'/'+w.meta.bridgeGoal+' · 🪵'+p.carried:p.catches+'개');}}
 if(w.game==='dodgeball')for(const o of w.objects){const ball=actionPackNode('ball:'+o.id,'span','ap-dodgeball','🏐');actionPackPosition(ball,o.x,o.y);ball.style.rotate=(t*380)+'deg';}
 if(w.game==='crown'){const o=w.objects[0],crown=actionPackNode('crown','span','ap-crown'+(w.meta.ownerId?' is-owned':''),'👑');actionPackPosition(crown,o.x,o.y);if(w.meta.ownerId&&t<w.meta.protectionUntil)crown.classList.add('is-protected');}
 if(w.game==='lasers')for(const o of w.objects){const laser=actionPackNode('laser:'+o.id,'i','ap-laser'+(t<o.activeAt?' is-warning':' is-active'));actionPackPosition(laser,o.x,o.y);laser.style.transform='translate(-50%,-50%) rotate('+o.angle+'rad)';}
 if(w.game==='frogger')for(const o of w.objects){const car=actionPackNode('car:'+o.id,'span','ap-traffic-car'+(o.vx<0?' is-left':''),o.emoji);actionPackPosition(car,o.x,o.y);car.style.width=o.width/7+'%';car.style.height=o.height/4.6+'%';}
 if(w.game==='bridge'){
  for(const p of w.players){const path=actionPackNode('bridge:'+p.id,'div','ap-bridge-path');path.style.left=p.laneX/7+'%';path.style.top=(258-p.bridgeSteps/w.meta.bridgeGoal*194)/4.6+'%';path.style.height=p.bridgeSteps/w.meta.bridgeGoal*194/4.6+'%';path.style.width=Math.min(54,700/w.players.length*.62)/7+'%';path.style.background=actionPackPalette[p.index%8];}
  for(const o of w.objects){if(!o.active)continue;const wood=actionPackNode('wood:'+o.id,'span','ap-bridge-wood','🪵');actionPackPosition(wood,o.x,o.y);}
 }
 if(w.game==='claw'){
  for(const p of w.players){const rope=actionPackNode('rope:'+p.id,'i','ap-claw-rope');rope.style.left=p.hookX/7+'%';rope.style.top=w.meta.hookTop/4.6+'%';rope.style.height=Math.max(5,p.hookY-w.meta.hookTop)/4.6+'%';rope.style.background=actionPackPalette[p.index%8];const hook=actionPackNode('hook:'+p.id,'span','ap-claw-hook','⌞⌟');actionPackPosition(hook,p.hookX,p.hookY);hook.style.color=actionPackPalette[p.index%8];}
  for(const o of w.objects){if(!o.active&&!o.ownerId)continue;const prize=actionPackNode('prize:'+o.id,'span','ap-claw-prize mass-'+o.mass,o.emoji+' '+o.value);actionPackPosition(prize,o.x,o.y);}
 }
 actionPackClean();
 $('arcadeDpad').hidden=false;const action=arcadeDialog.querySelector('[data-arcade-control="action"]');action.hidden=false;
 const ready=own?(w.game==='dodgeball'?own.throwReadyAt:w.game==='frogger'?own.leapReadyAt:w.game==='bridge'?own.buildReadyAt:w.game==='claw'?own.hookReadyAt:own.dashReadyAt)||0:0,cool=Math.max(0,ready-t),busy=w.game==='claw'&&own?.hookState!=='idle';
 action.disabled=!can||cool>.05||busy||w.game==='bridge'&&(!own?.carried||own?.finishedAt>=0);arcadeSetText('arcadeActionLabel',g.action);arcadeSetText('arcadeActionHint',busy?'회수 중…':cool>.05?cool.toFixed(1)+'초 뒤 다시':g.key);
 const status=!own?'이번 판 관전 중':w.game==='dodgeball'?own.hits+'명중 · '+own.received+'피격':w.game==='crown'?own.heldSeconds.toFixed(1)+'초 보유 · '+own.steals+'번 약탈':w.game==='lasers'?own.received+'피격 · 아슬아슬 '+own.nearMisses+'회':w.game==='frogger'?own.deliveries+'배송 · '+own.crashes+'충돌':w.game==='bridge'?own.bridgeSteps+'/'+w.meta.bridgeGoal+'칸 · 나무 '+own.carried+'/3':own.score+'점 · '+own.catches+'개 확보';
 arcadeSetText('arcadeOwnStatus',own&&t<(own.resultUntil||0)?own.lastResult:status);arcadeSetText('arcadeStatus',s.phase==='between'||s.phase==='done'?s.notice:w.meta.notice||g.hint);
};
/* END_ARCADE_ACTION_PACK_UI_V1 */

/* ARCADE_BRAIN_PACK_UI_V1 */
Object.assign(arcadeGames,{
 memory:{name:'복사기 기억력 검사',icon:'💡',tag:'기억 · 불빛 순서',hint:'불빛 순서를 보고 기다려요. 꺼지면 A / W / D로 같은 순서를 재현! 틀리면 다음 문제 대기.',action:'기억!',key:'A / W / D',input:'hit',color:'#d9c6e9',duel:true,controls:'choices'},
 sorter:{name:'서류 분류 컨베이어',icon:'📁',tag:'분류 · 바뀌는 규칙',hint:'서류 그림을 보고 A / W / D로 분류! 특별 규칙이면 원래 함보다 한 칸 오른쪽으로 보내요.',action:'분류!',key:'A / W / D',input:'hit',color:'#c9dfb8',duel:true,controls:'choices'},
 receipt:{name:'영수증 암산 결재',icon:'🧾',tag:'암산 · 합계 찾기',hint:'영수증의 작은 금액을 더해서 A / W / D로 정답 합계를 골라요. 빨리 맞힐수록 추가 점수!',action:'정산!',key:'A / W / D',input:'hit',color:'#efdbb1',duel:true,controls:'choices'},
 safe:{name:'탕비실 비밀 금고',icon:'🔐',tag:'기억 · 숫자 다이얼',hint:'잠깐 보이는 세 자리 번호를 기억! ← / →로 숫자를 맞추고 Space로 한 자리씩 확정해요.',action:'확정!',key:'← / → + SPACE',input:'hit',color:'#bdd5d7',duel:true,controls:'standard'},
 auction:{name:'마지막 간식 경매',icon:'✉️',tag:'눈치 · 비공개 입찰',hint:'예산 12로 A=0, W=1, D=3을 비밀 입찰! 유일한 최고 입찰만 상품 획득. 입찰금은 소모되고 남은 예산+상품 가치가 점수예요.',action:'입찰!',key:'A / W / D',input:'hit',color:'#d8c7e1',duel:true,controls:'choices'},
 stacker:{name:'보고서 탑 쌓기',icon:'📚',tag:'타이밍 · 겹친 만큼',hint:'움직이는 블록을 Space로 멈춰 쌓아요. 겹친 부분만 남아요! 무너지면 새 탑으로 다시 도전.',action:'쌓아!',key:'SPACE / F',input:'hit',color:'#b5d6e4',duel:true,controls:'action'},
 reaction:{name:'결재 신호 반응전',icon:'🚨',tag:'반응 · 가짜 신호 주의',hint:'「찍…지 마!」는 가짜! 초록색 「지금 찍어!」에서 Space. 먼저 정확하게 누를수록 높은 점수!',action:'찍어!',key:'SPACE / F',input:'hit',color:'#dfc6ac',duel:true,controls:'action'}
});
const brainPackIds=new Set(['memory','sorter','receipt','safe','auction','stacker','reaction']),brainPackNodes=new Map();
function brainPackNode(id,tag,cls,text){const node=el(tag,cls,text);node.id='brain_'+id;brainPackNodes.set(id,node);return node;}
function brainPackText(id,text){const node=brainPackNodes.get(id);if(node&&node.textContent!==String(text))node.textContent=String(text);}
const brainPackBuildBase=arcadeBuildBoard;
arcadeBuildBoard=function(w){
 brainPackBuildBase(w);if(!brainPackIds.has(w.game))return;brainPackNodes.clear();
 const layer=brainPackNode('layer','div','brain-layer brain-'+w.game),top=el('div','brain-top');top.append(brainPackNode('round','b','brain-round',''),brainPackNode('phase','span','brain-phase',''));layer.append(top);
 if(w.game==='memory'){
  layer.append(brainPackNode('instruction','h3','','불빛을 기억해요'));
  const lights=el('div','brain-memory-lights');for(let i=0;i<3;i++){const light=brainPackNode('light'+i,'div','brain-memory-light light-'+i);light.append(el('b','',['◀','●','▶'][i]),el('small','',['A · 왼쪽','W · 가운데','D · 오른쪽'][i]));lights.append(light);}layer.append(lights,brainPackNode('memoryProgress','div','brain-memory-progress',''));
 }
 if(w.game==='sorter'){
  layer.append(brainPackNode('rule','h3','brain-sort-rule',''));
  const belt=el('div','brain-conveyor'),doc=brainPackNode('doc','div','brain-document');doc.append(brainPackNode('docIcon','b','','📁'),brainPackNode('docName','span','',''));belt.append(doc);layer.append(belt);
  const boxes=el('div','brain-inboxes');for(let i=0;i<3;i++){const box=el('div','brain-inbox');box.append(el('b','',['📁','🧾','🎓'][i]),el('span','',['A · 행정함','W · 회계함','D · 학생함'][i]));boxes.append(box);}layer.append(boxes);
 }
 if(w.game==='receipt'){
  const ticket=el('div','brain-receipt-ticket');ticket.append(el('small','','LUNCH OFFICE · 영수증'),el('h3','','오늘의 소액 결재'));
  for(let i=0;i<3;i++){const row=brainPackNode('receiptRow'+i,'div','brain-receipt-row');row.append(el('span','','품목 '+(i+1)),brainPackNode('receiptNumber'+i,'b','',''));ticket.append(row);}
  const total=el('div','brain-receipt-total');total.append(el('span','','합계'),brainPackNode('receiptTotal','strong','','?원'));ticket.append(total);layer.append(ticket);
 }
 if(w.game==='safe'){
  const safe=el('div','brain-safe-door');safe.append(el('small','','탕비실 간식 금고'),brainPackNode('pin','div','brain-safe-pin','● ● ●'));
  const dial=el('div','brain-safe-dial');dial.append(brainPackNode('dial','strong','','0'),el('span','','← 돌리기 →'));safe.append(dial,brainPackNode('safeProgress','div','brain-safe-progress',''),el('small','','Space · 현재 숫자 확정'));layer.append(safe);
 }
 if(w.game==='auction'){
  const lot=el('div','brain-auction-lot');lot.append(el('b','','🍩'),el('div','','마지막 간식 한 상자'),brainPackNode('prize','strong','','상품 가치 0'));layer.append(lot);
  const people=el('div','brain-bidders');for(const p of w.players){const bidder=brainPackNode('bidder'+p.index,'div','brain-bidder');bidder.append(el('b','',p.name),brainPackNode('bid'+p.index,'span','',''),brainPackNode('budget'+p.index,'small','',''));people.append(bidder);}layer.append(people);
 }
 if(w.game==='stacker'){
  const construction=el('div','brain-construction');construction.append(el('div','brain-crane','멈추고, 쌓고, 칼퇴!'));
  const tower=el('div','brain-tower');for(let i=0;i<8;i++)tower.append(brainPackNode('block'+i,'i','brain-stack-block'));tower.append(brainPackNode('movingBlock','i','brain-stack-block is-moving'),el('div','brain-stack-ground'));construction.append(tower);layer.append(construction,brainPackNode('stackInfo','div','brain-stack-info',''));
 }
 if(w.game==='reaction'){
  layer.append(el('div','brain-reaction-sign','가짜 신호에 낚이지 말 것'));
  const signal=brainPackNode('signal','div','brain-reaction-signal');signal.append(el('span','brain-signal-dot'),brainPackNode('signalText','strong','','아직…'));layer.append(signal,brainPackNode('reactionRecord','div','brain-reaction-record',''));
 }
 layer.append(brainPackNode('feedback','p','brain-feedback',''));$('arcadeScenery').append(layer);
};
const brainPackDrawBase=arcadeDrawWorld;
arcadeDrawWorld=function(s,w,g,self){
 brainPackDrawBase(s,w,g,self);if(!brainPackIds.has(w.game))return;const own=w.players.find(p=>p.id===self)||w.players.find(p=>!p.forfeited)||w.players[0],t=w.elapsed;
 brainPackText('round',w.game==='stacker'?'최고의 탑에 도전':'ROUND '+((w.meta.stage||0)+1)+' / '+({memory:6,sorter:16,receipt:6,safe:3,auction:4,reaction:7}[w.game]||1));
 brainPackText('phase',w.meta.phase==='watch'?'관찰 시간':w.meta.phase==='reveal'?'결과 공개':w.meta.phase==='repeat'?'같은 순서 입력':w.meta.phase==='unlock'?'기억한 번호 입력':w.meta.phase==='choose'?(own.locked?'선택 완료':'내 선택은?'):'나의 차례');
 brainPackText('feedback',t<own.feedbackUntil?own.feedback:'');
 $('arcadeDpad').hidden=w.game!=='safe';if(w.game==='safe')$('arcadeDpad').querySelector('i').textContent='숫자';
 if(w.game==='memory'){
  brainPackText('instruction',w.meta.phase==='watch'?'순서를 기억해요':'방금 본 순서대로!');
  for(let i=0;i<3;i++)brainPackNodes.get('light'+i).classList.toggle('is-lit',w.meta.flashLane===i);
  brainPackText('memoryProgress',Array.from({length:w.meta.patternLength},(_,i)=>i<own.memoryIndex?'●':'○').join('  ')+(own.locked?' · 다음 문제 대기':''));
 }
 if(w.game==='sorter'){
  brainPackText('rule',w.meta.rule);brainPackText('docIcon',w.meta.docIcon);brainPackText('docName',w.meta.docName);
  brainPackNodes.get('doc').style.transform='translateX('+((w.meta.belt-.5)*110)+'%) rotate(-3deg)';brainPackNodes.get('layer').dataset.shift=String(w.meta.ruleShift);
 }
 if(w.game==='receipt'){
  for(let i=0;i<3;i++){brainPackNodes.get('receiptRow'+i).hidden=i>=w.meta.numbers.length;brainPackText('receiptNumber'+i,(w.meta.numbers[i]||0)+'원');}brainPackText('receiptTotal',w.meta.answer>=0?w.meta.answer+'원':'? 원');
 }
 if(w.game==='safe'){
  brainPackText('pin',w.meta.pinDisplay);brainPackText('dial',own.dial);brainPackText('safeProgress',Array.from({length:3},(_,i)=>i<own.safeProgress?'✓':'○').join('  ')+(own.locked?' · 열렸다!':''));brainPackNodes.get('layer').dataset.open=String(own.locked);
 }
 if(w.game==='auction'){
  brainPackText('prize','상품 가치 '+w.meta.prize+'점');const reveal=w.meta.phase==='reveal';
  for(const p of w.players){brainPackText('bid'+p.index,reveal?(p.bid>=0?p.bid+'장 입찰':'불참'):p.locked?'봉투 제출 ✓':'금액 비밀');brainPackText('budget'+p.index,'예산 '+p.budget+' · 상품 '+p.goods);brainPackNodes.get('bidder'+p.index).classList.toggle('is-winner',reveal&&w.meta.winnerId===p.id);}
 }
 if(w.game==='stacker'){
  const rects=own.stackRects||[];for(let i=0;i<8;i++){const block=brainPackNodes.get('block'+i),r=rects[i];block.hidden=!r;if(r){block.style.left=r[0]/7+'%';block.style.width=r[1]/7+'%';block.style.bottom=(9+i*8)+'%';}}
  const block=brainPackNodes.get('movingBlock');block.style.left=own.movingX/7+'%';block.style.width=own.movingWidth/7+'%';block.style.bottom=(9+Math.min(8,rects.length)*8)+'%';block.hidden=t<own.stackReadyAt;
  brainPackText('stackInfo','현재 '+own.stackLevel+'층 · 최고 '+own.bestLevel+'층 · PERFECT '+own.perfects);
 }
 if(w.game==='reaction'){
  brainPackNodes.get('signal').dataset.signal=w.meta.signal;brainPackText('signalText',w.meta.signalText);brainPackText('reactionRecord',own.locked?(own.reactionMs>=0?own.reactionMs+' ms · '+own.reactionRank+'번째':'성급한 입력! 다음 신호 대기'):'가짜 신호에는 손 떼기');
 }
 arcadeSetText('arcadeStatus',w.meta.notice||g.hint);arcadeSetText('arcadeOwnStatus',Math.round(own.score)+'점'+(w.game==='auction'?' · 남은 예산 '+own.budget:''));
};
/* END_ARCADE_BRAIN_PACK_UI_V1 */

/* ARCADE_EXTRA_CONTROLS_V1 */
let arcadeExtraChoices=null;
const arcadeFamilies={sports:['pong','curling','bowling','volley','golf','basket'],race:['kart','runner','sneak','parking','frogger'],action:['brawl','tray','dodge','coins','dodgeball','crown','lasers','bridge','claw'],brain:['doors','stamp','rhythm','memory','sorter','receipt','safe','auction','stacker','reaction']};
for(const [family,ids]of Object.entries(arcadeFamilies))for(const id of ids)if(arcadeGames[id])arcadeGames[id].family=family;
function arcadeExtraEnsureControls(){
 if(arcadeExtraChoices||!arcadeDialog)return;
 arcadeExtraChoices=el('div','extra-choice-controls');arcadeExtraChoices.id='arcadeExtraChoices';arcadeExtraChoices.hidden=true;
 for(let i=0;i<3;i++){const button=el('button','extra-choice-button');button.type='button';button.dataset.extraChoice=String(i);button.setAttribute('aria-label','게임 선택 '+(i+1));button.append(el('strong'),el('kbd','',['A / ←','W / ↑','D / →'][i]));button.addEventListener('click',()=>{if(!button.disabled&&arcadeState?.world&&arcadeGames[arcadeState.world.game]?.controls==='choices')arcadeInput(['hit','jump','dash'][i],true);});arcadeExtraChoices.append(button);}
 $('arcadeControls').append(arcadeExtraChoices);
}
const arcadeExtraDrawBase=arcadeDrawWorld;
arcadeDrawWorld=function(s,w,g,self){
 arcadeExtraDrawBase(s,w,g,self);arcadeExtraEnsureControls();if(!arcadeExtraChoices)return;arcadeExtraChoices.hidden=g.controls!=='choices';if(!g.controls)return;
 const own=w.players.find(p=>p.id===self),can=s.phase==='round'&&w.phase==='play'&&own&&!own.eliminated&&!own.forfeited;
 const choices=g.controls==='choices';arcadeExtraChoices.hidden=!choices;
 $('arcadeDpad').hidden=g.controls!=='standard';const action=arcadeDialog.querySelector('[data-arcade-control="action"]');action.hidden=choices;
 if(choices){const labels=own?.choiceLabels||w.meta.choiceLabels||['왼쪽','가운데','오른쪽'];for(const [i,button]of [...arcadeExtraChoices.children].entries()){const label=String(labels[i]??['왼쪽','가운데','오른쪽'][i]);if(button.firstChild.textContent!==label)button.firstChild.textContent=label;button.disabled=!can||own?.choiceLocked===true;}}
};
function arcadeExtraInstall(){
 const installFilters=()=>{if(!arcadeDialog||document.getElementById('arcadeFamilyFilters'))return;const grid=$('arcadeGameCards'),bar=el('div','extra-family-filters');bar.id='arcadeFamilyFilters';bar.setAttribute('aria-label','연습 게임 종류');for(const [family,label]of [['all','전체'],['action','액션'],['race','경주'],['sports','스포츠'],['brain','눈치·두뇌']]){const count=Object.values(arcadeGames).filter(g=>family==='all'||g.family===family).length,button=el('button','tiny-btn',label+' '+count);button.type='button';button.setAttribute('aria-pressed',String(family==='all'));button.addEventListener('click',()=>{for(const child of bar.children)child.setAttribute('aria-pressed',String(child===button));for(const card of grid.children)card.hidden=family!=='all'&&arcadeGames[card.dataset.game]?.family!==family;});bar.append(button);}grid.before(bar);};
 const ensureBase=arcadeEnsureUI;arcadeEnsureUI=function(){const result=ensureBase();installFilters();return result;};

 document.addEventListener('keydown',event=>{
  if(!arcadeDialog?.open||!arcadeState?.world||arcadeGames[arcadeState.world.game]?.controls!=='choices'||event.target?.matches?.('input,textarea,select,[contenteditable="true"]'))return;
  const index=['KeyA','ArrowLeft'].includes(event.code)?0:['KeyW','ArrowUp'].includes(event.code)?1:['KeyD','ArrowRight'].includes(event.code)?2:-1;
  if(index<0)return;event.preventDefault();event.stopImmediatePropagation();if(event.repeat)return;arcadeExtraEnsureControls();const button=arcadeExtraChoices?.children[index];if(button&&!button.disabled)arcadeInput(['hit','jump','dash'][index],true);
 },true);
}
/* END_ARCADE_EXTRA_CONTROLS_V1 */

