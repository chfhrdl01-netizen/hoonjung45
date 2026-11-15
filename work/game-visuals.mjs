/* GAME_VISUALS_V1 — local, bounded aiming cues and readable action states. */
const gameVisualKinds={sneak:'race',dodge:'arena',coins:'arena',stamp:'timing',runner:'race',brawl:'arena',kart:'race',basket:'aim',doors:'decision',rhythm:'timing',tray:'arena',pong:'court',curling:'court',bowling:'court',volley:'court',golf:'court',parking:'court',dodgeball:'arena',crown:'arena',lasers:'arena',frogger:'race',bridge:'race',claw:'aim',memory:'decision',sorter:'decision',receipt:'decision',safe:'decision',auction:'decision',stacker:'timing',reaction:'timing'};
const gameVisualAxes={sneak:'up',dodge:'all',coins:'all',stamp:'none',runner:'none',brawl:'all',kart:'all',basket:'horizontal',doors:'none',rhythm:'none',tray:'all',pong:'vertical',curling:'horizontal',bowling:'horizontal',volley:'horizontal',golf:'horizontal',parking:'all',dodgeball:'all',crown:'all',lasers:'all',frogger:'all',bridge:'all',claw:'horizontal',memory:'none',sorter:'none',receipt:'none',safe:'horizontal',auction:'none',stacker:'none',reaction:'none'};
const gameVisualCooldowns={dodge:['dashReadyAt',1.8],coins:['dashReadyAt',2],brawl:['hitReadyAt',.55],kart:['dashReadyAt',2.4],basket:['shotReadyAt',.78],tray:['dashReadyAt',2.1],dodgeball:['throwReadyAt',.72],crown:['dashReadyAt',2.25],lasers:['dashReadyAt',1.65],frogger:['leapReadyAt',1.25],bridge:['buildReadyAt',.28],claw:['hookReadyAt',.4],pong:['readyAt',.68],volley:['readyAt',.42],parking:['readyAt',.25]};
function gameVisualNumber(value,fallback=0){return Number.isFinite(value)?value:fallback;}
function gameVisualAction(w,p,g={}){
 const t=gameVisualNumber(w.elapsed),game=w.game,base=g.action||'시작!',out={verb:base,state:'ready',ready:1};
 if(!p||p.forfeited||p.eliminated)return{verb:'관전 중',state:'watch',ready:0};
 if(w.phase!=='play')return{verb:w.phase==='countdown'?'준비!':'한 판 끝',state:'watch',ready:0};
 if(t<gameVisualNumber(p.respawnUntil)||t<gameVisualNumber(p.stunUntil))return{verb:'회복 중',state:'recover',ready:0};
 const spec=gameVisualCooldowns[game];if(spec){const left=Math.max(0,gameVisualNumber(p[spec[0]])-t);out.ready=Math.max(0,Math.min(1,1-left/spec[1]));if(left>.02)out.state='cooling';}
 if(game==='sneak'){out.verb=w.meta.signal==='green'?'달려!':'손 떼기';out.state=w.meta.signal==='green'?'ready':'stop';}
 if(game==='runner')out.verb=p.jumpHeight>.01?(p.jumpVy<0?'착지 예약':'점프 중'):'점프!';
 if(game==='coins')out.verb='돌진!';
 if(game==='brawl')out.verb='펀치!';
 if(game==='stamp'&&p.lastStampStage===w.meta.stage){out.verb='다음 도장';out.state='watch';}
 if(['curling','bowling','golf'].includes(game)){
  out.verb=p.phase==='power'?(game==='bowling'?'투구!':game==='golf'?'퍼팅!':'발사!'):game==='curling'&&p.phase==='moving'?'슥슥 쓸기':'파워 시작';
  if(p.phase==='power'){out.state='charge';out.ready=Math.max(0,Math.min(1,gameVisualNumber(p.power)));}
  else if(['between','done'].includes(p.phase)||p.phase==='moving'&&game!=='curling'){out.state='watch';out.verb=p.phase==='done'?'완료!':'이동 중';}
  if(game==='bowling'&&p.phase==='moving')out.verb='←→ 커브';
 }
 if(game==='volley')out.verb='받아쳐!';
 if(game==='parking')out.verb='브레이크';
 if(game==='bridge'){out.verb=p.finishedAt>=0?'완성!':p.carried?'다리 놓기':'나무 줍기';if(!p.carried||p.finishedAt>=0)out.state='watch';}
 if(game==='claw'){out.verb=p.hookState==='down'?'조기 회수':p.hookState==='up'?'회수 중':'집게 내리기';if(p.hookState==='up')out.state='watch';}
 if(['memory','safe'].includes(game)&&w.meta.phase==='watch'){out.state='watch';out.verb='보고 기억!';}
 if(game==='reaction'){out.state=p.locked?'watch':w.meta.signal==='go'?'ready':w.meta.signal==='fake'?'stop':'watch';out.verb=p.locked?'다음 신호':w.meta.signal==='go'?'지금 찍어!':'아직 기다려';}
 if(['doors','memory','sorter','receipt','auction'].includes(game)&&(p.locked||p.choiceLocked)&&game!=='auction'){out.state='watch';out.verb='선택 완료';}
 if(game==='safe'&&p.locked){out.state='watch';out.verb='금고 열림!';}
 if(['doors','memory','sorter','receipt','safe','auction'].includes(game)&&w.meta.phase==='reveal'){out.state='watch';out.verb='결과 확인';}
 return out;
}
function gameVisualLine(x,y,dx,dy,length){
 const d=Math.hypot(dx,dy)||1,ux=dx/d,uy=dy/d,ex=x+ux*length,ey=y+uy*length;
 return 'M'+x.toFixed(2)+' '+y.toFixed(2)+' L'+ex.toFixed(2)+' '+ey.toFixed(2)+' M'+(ex-ux*12-uy*7).toFixed(2)+' '+(ey-uy*12+ux*7).toFixed(2)+' L'+ex.toFixed(2)+' '+ey.toFixed(2)+' L'+(ex-ux*12+uy*7).toFixed(2)+' '+(ey-uy*12-ux*7).toFixed(2);
}
function gameVisualCone(x,y,dx,dy,radius,halfAngle=1.52){
 const angle=Math.atan2(dy,dx),a=angle-halfAngle,b=angle+halfAngle;
 return 'M'+x.toFixed(2)+' '+y.toFixed(2)+' L'+(x+Math.cos(a)*radius).toFixed(2)+' '+(y+Math.sin(a)*radius).toFixed(2)+' A'+radius+' '+radius+' 0 0 1 '+(x+Math.cos(b)*radius).toFixed(2)+' '+(y+Math.sin(b)*radius).toFixed(2)+' Z';
}
function gameVisualPreview(w,p){
 const out={line:'',zone:'',ring:null,target:null,caption:''};if(!p)return out;
 const x=gameVisualNumber(p.x),y=gameVisualNumber(p.y),game=w.game;
 // Only show the direction already chosen. Future paths, landing points and hit targets stay hidden.
 if(['curling','bowling','golf'].includes(game)&&['ready','power'].includes(p.phase)){
  const aim=gameVisualNumber(p.aim),golf=game==='golf';out.line=gameVisualLine(golf?x:350,golf?y:418,golf?Math.cos(aim):Math.sin(aim),golf?Math.sin(aim):-Math.cos(aim),65);
 }else if(game==='basket'){
  const aim=gameVisualNumber(p.aim,90)*Math.PI/180;out.line=gameVisualLine(x,y-30,Math.cos(aim),-Math.sin(aim),45);
 }else if(game==='parking'){
  const aim=gameVisualNumber(p.angle);out.line=gameVisualLine(x,y,Math.cos(aim),Math.sin(aim),32);
 }else if(['brawl','coins','tray','dodgeball','crown','dodge','lasers'].includes(game)){
  const dx=gameVisualNumber(p.faceX,gameVisualNumber(p.dirX,gameVisualNumber(p.dx,1))),dy=gameVisualNumber(p.faceY,gameVisualNumber(p.dirY,gameVisualNumber(p.dy)));
  out.line=gameVisualLine(x,y,dx,dy,32);
 }else if(game==='frogger')out.line=gameVisualLine(x,y,gameVisualNumber(p.faceCol),gameVisualNumber(p.faceRow,1),22);
 else if(game==='claw')out.line=gameVisualLine(gameVisualNumber(p.hookX,350),gameVisualNumber(p.hookY,100),0,p.hookState==='up'?-1:1,24);
 return out;
}
let gameVisualView=null;
function gameVisualAttr(node,key,value){const next=String(value);if(node.getAttribute(key)!==next)node.setAttribute(key,next);}
function gameVisualSvg(parent){
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.classList.add('gv-field-lines');svg.setAttribute('viewBox','0 0 700 460');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');
 const zone=document.createElementNS(ns,'path'),line=document.createElementNS(ns,'path'),ring=document.createElementNS(ns,'circle'),target=document.createElementNS(ns,'circle');zone.classList.add('gv-range-zone');line.classList.add('gv-aim-line');ring.classList.add('gv-target-ring');target.classList.add('gv-contact-target');svg.append(zone,line,ring,target);parent.append(svg);return{svg,zone,line,ring,target};
}
function gameVisualBuild(w){
 const board=$('arcadeBoard');if(!board)return;board.dataset.visualKind=gameVisualKinds[w.game]||'arena';board.dataset.visualArena=w.game==='brawl'?['cafeteria','rooftop','office'][(gameVisualNumber(w.seed)>>>0)%3]:'';
 const view={key:w.id+':'+w.game,main:null,courts:new Map(),health:new Map()};gameVisualView=view;
 if(['basket','brawl','coins','tray','dodgeball','crown','dodge','lasers','frogger','bridge','claw'].includes(w.game))view.main=gameVisualSvg($('arcadeScenery'));
 if(typeof arcadeSportsPanels!=='undefined'&&gameVisualKinds[w.game]==='court'){
  const root=$('arcadeSportsCourts');if(root&&w.players.some(p=>p.id===arcadeSelf())){root.classList.add('gv-focused');root.style.setProperty('--gv-rivals',String(Math.max(1,w.players.length-1)));}
  for(const p of w.players){const panel=arcadeSportsPanels.get(p.id);if(!panel||p.id!==arcadeSelf())continue;view.courts.set(p.id,gameVisualSvg(panel.field));}
 }
 if(w.game==='brawl')for(const p of w.players){const actor=arcadeUIActors.get(p.id);if(!actor)continue;const bar=el('span','gv-health'),fill=el('i');bar.setAttribute('role','meter');bar.setAttribute('aria-label',p.name+' 체력');bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax','100');bar.append(fill);actor.append(bar);view.health.set(p.id,{bar,fill});}
}
function gameVisualPaint(shape,preview,visible,state){
 gameVisualAttr(shape.svg,'display',visible?'block':'none');shape.svg.dataset.state=state;if(!visible)return;gameVisualAttr(shape.line,'d',preview.line);gameVisualAttr(shape.zone,'d',preview.zone);
 for(const [node,point]of [[shape.ring,preview.ring],[shape.target,preview.target]]){gameVisualAttr(node,'display',point?'block':'none');if(point){gameVisualAttr(node,'cx',point.x.toFixed(2));gameVisualAttr(node,'cy',point.y.toFixed(2));gameVisualAttr(node,'r',point.r);}}
}
const gameVisualBuildBase=arcadeBuildBoard;
arcadeBuildBoard=function(w){const result=gameVisualBuildBase(w);gameVisualBuild(w);return result;};
const gameVisualDrawBase=arcadeDrawWorld;
arcadeDrawWorld=function(s,w,g,self){
 const result=gameVisualDrawBase(s,w,g,self);if(!gameVisualView||gameVisualView.key!==w.id+':'+w.game)gameVisualBuild(w);const view=gameVisualView,own=w.players.find(p=>p.id===self);if(!view)return result;
 const action=gameVisualAction(w,own,g),playing=s.phase==='round'&&w.phase==='play',visible=!!own&&!own.eliminated&&!own.forfeited;
 const board=$('arcadeBoard');if(board){board.dataset.visualState=action.state;board.dataset.visualPhase=String(w.meta.phase||'play');}
 if(view.main)gameVisualPaint(view.main,own?gameVisualPreview(w,own):{line:'',zone:'',ring:null,target:null},visible&&playing,action.state);
 for(const [id,shape]of view.courts){const p=w.players.find(player=>player.id===id);gameVisualPaint(shape,p?gameVisualPreview(w,p):{line:'',zone:'',ring:null,target:null},!!p&&playing&&!p.forfeited,action.state);}
 for(const p of w.players){const health=view.health.get(p.id);if(!health)continue;const hp=Math.max(0,Math.min(100,gameVisualNumber(p.hp)));health.fill.style.width=hp+'%';health.bar.dataset.low=String(hp<=28);gameVisualAttr(health.bar,'aria-valuenow',Math.ceil(hp));}
 const dpad=$('arcadeDpad');if(dpad){const axes=gameVisualAxes[w.game]||'all';dpad.dataset.visualAxes=axes;for(const direction of ['up','down','left','right']){const key=dpad.querySelector('[data-arcade-control="'+direction+'"]');if(!key)continue;const used=axes==='all'||axes==='horizontal'&&['left','right'].includes(direction)||axes==='vertical'&&['up','down'].includes(direction)||axes==='up'&&direction==='up';key.hidden=!used;}if(axes==='none')dpad.hidden=true;}
 const button=arcadeDialog?.querySelector('[data-arcade-control="action"]');if(button){button.dataset.visualState=action.state;button.style.setProperty('--gv-ready',action.ready.toFixed(3));gameVisualAttr(button,'aria-label',action.verb);if(playing&&own&&!button.hidden)arcadeSetText('arcadeActionLabel',action.verb);}
 return result;
};
/* END_GAME_VISUALS_V1 */
