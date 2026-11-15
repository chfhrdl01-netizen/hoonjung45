/* ARCADE_MOTION_RULES_V1 */
function createArcadeMotionRules(){
 const W=700,H=460,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const unit=(x,y)=>{const d=Math.hypot(x,y);return d?[x/d,y/d]:[0,0];};
 const held=(controls,p)=>controls.get(p.id)?.held||new Set();
 const axes=keys=>unit(Number(keys.has('right'))-Number(keys.has('left')),Number(keys.has('down'))-Number(keys.has('up')));
 const active=p=>!p.eliminated&&!p.forfeited;
 const base=(w,p)=>{p.health=3;p.eliminated=false;p.stunUntil=0;p.actionUntil=0;p.score=0;p.deaths=0;p.respawnUntil=0;};
 const id=(w,prefix)=>prefix+'_'+(++w.meta.serial);
 function partyRecover(w,p){
  if(w.meta.partyRespawn!==true)return false;
  p.deaths=(p.deaths||0)+1;p.health=3;p.eliminated=false;p.respawnUntil=w.elapsed+1;p.stunUntil=p.respawnUntil;p.actionUntil=p.respawnUntil;
  if(w.game==='runner'){p.x=118;p.y=w.meta.groundY;p.jumpHeight=0;p.jumpVy=0;p.lastHurtAt=w.elapsed;}
  else{
   const hazards=w.objects.filter(o=>!o.resolved&&o.impactAt>=w.elapsed&&o.impactAt<w.elapsed+1.5),points=[{x:70,y:65},{x:350,y:65},{x:630,y:65},{x:70,y:230},{x:350,y:230},{x:630,y:230},{x:70,y:395},{x:350,y:395},{x:630,y:395}];
   let best=points[p.index%points.length],clearance=-Infinity;
   for(let i=0;i<points.length;i++){const point=points[(i+p.index)%points.length],margin=hazards.length?Math.min(...hazards.map(o=>Math.hypot(point.x-o.x,point.y-o.y)-o.radius-20)):0;if(margin>clearance){clearance=margin;best=point;}}
   p.x=best.x;p.y=best.y;p.dodgeUntil=p.respawnUntil;p.dashUntil=0;
  }
  w.meta.notice=p.name+' 님 삐끗! 바로 복귀 · 3,000점 감점';return true;
 }
 function survivalScore(w,p,bonus){return Math.max(0,Math.round(p.survived*1000)+p.health*4+bonus-(w.meta.partyRespawn===true?(p.deaths||0)*3000:0));}
 function sneakScore(w,p){p.score=p.finishAt>=0?10000+Math.round((w.duration-p.finishAt)*100):Math.round(p.progress*10);}
 const sneak={
  init(w,random){
   w.duration=24;w.objects=[];w.meta={width:W,height:H,serial:0,signal:'green',signalSerial:0,signalChangedAt:0,nextSwitchAt:1.65+random()*1.1,grace:.32,finishY:52,startY:406,roundOver:false};
   w.players.forEach((p,i)=>{base(w,p);p.x=58+(W-116)*(i+1)/(w.players.length+1);p.y=406;p.progress=0;p.finishAt=-1;p.lastCaughtSignal=-1;p.caughtUntil=0;});
  },
  input(){},
  step(w,dt,controls,random){
   dt=clamp(dt,0,.04);const m=w.meta;
   if(w.elapsed>=m.nextSwitchAt){m.signal=m.signal==='green'?'red':'green';m.signalSerial++;m.signalChangedAt=w.elapsed;m.nextSwitchAt=w.elapsed+(m.signal==='green'?1.35+random()*1.55:1.0+random()*1.35);}
   for(const p of w.players){
    if(!active(p)||p.finishAt>=0)continue;
    const keys=held(controls,p),moving=keys.has('up')||keys.has('right')||keys.has('left')||keys.has('down');
    if(m.signal==='red'&&w.elapsed-m.signalChangedAt>m.grace&&moving&&p.lastCaughtSignal!==m.signalSerial){
     p.lastCaughtSignal=m.signalSerial;p.progress=Math.max(0,p.progress-78);p.stunUntil=w.elapsed+.72;p.caughtUntil=w.elapsed+.72;p.actionUntil=p.caughtUntil;
    }
    if(w.elapsed>=p.stunUntil&&keys.has('up')&&(m.signal==='green'||w.elapsed-m.signalChangedAt<=m.grace))p.progress=Math.min(m.startY-m.finishY,p.progress+99*dt);
    p.y=m.startY-p.progress;
    if(p.progress>=m.startY-m.finishY){p.finishAt=w.elapsed;p.actionUntil=w.elapsed+.65;}
    sneakScore(w,p);
   }
   const contenders=w.players.filter(active);if(contenders.length&&contenders.every(p=>p.finishAt>=0))m.roundOver=true;
  },
  bot(w,p){return{held:w.meta.signal==='green'&&w.elapsed-w.meta.signalChangedAt>.1?['up']:[]};}
 };
 const dodge={
  init(w,random){
   w.duration=24;w.objects=[];w.meta={width:W,height:H,serial:0,nextSpawnAt:.35,roundOver:false};
   w.players.forEach((p,i)=>{base(w,p);const a=i/w.players.length*Math.PI*2;p.x=W/2+Math.cos(a)*86;p.y=H/2+Math.sin(a)*86;p.dx=0;p.dy=-1;p.dashUntil=0;p.dashReadyAt=0;p.dodgeUntil=0;p.nearMisses=0;p.survived=0;});
  },
  input(w,p,action){
   if(action!=='dash'||w.elapsed<p.dashReadyAt)return false;
   p.dashUntil=w.elapsed+.17;p.dashReadyAt=w.elapsed+1.8;p.dodgeUntil=w.elapsed+.22;p.actionUntil=p.dashUntil;return true;
  },
  step(w,dt,controls,random){
   dt=clamp(dt,0,.04);
   if(w.elapsed>=w.meta.nextSpawnAt){
    const living=w.players.filter(active),target=living.length?living[Math.floor(random()*living.length)]:null,aim=target&&random()<.36;
    const x=aim?target.x+(random()-.5)*66:40+random()*(W-80),y=aim?target.y+(random()-.5)*66:45+random()*(H-90);
    w.objects.push({id:id(w,'food'),kind:'food',x:clamp(x,38,W-38),y:clamp(y,38,H-38),radius:36+random()*18,spawnAt:w.elapsed,impactAt:w.elapsed+.88,endAt:w.elapsed+1.18,resolved:false,emoji:['🍙','🍖','🥔','🍤'][Math.floor(random()*4)]});
    w.meta.nextSpawnAt=w.elapsed+Math.max(.28,.66-w.elapsed*.011);
   }
   for(const p of w.players){
    if(!active(p))continue;
    let [dx,dy]=axes(held(controls,p));if(dx||dy){p.dx=dx;p.dy=dy;}if(w.elapsed<p.dashUntil){dx=p.dx;dy=p.dy;}
    const speed=w.elapsed<p.dashUntil?475:196;
    if(w.elapsed>=p.stunUntil){p.x=clamp(p.x+dx*speed*dt,18,W-18);p.y=clamp(p.y+dy*speed*dt,24,H-18);}
    p.survived=w.elapsed;
   }
   for(const o of w.objects){
    if(o.resolved||w.elapsed<o.impactAt)continue;o.resolved=true;
    for(const p of w.players){
     if(!active(p))continue;
     const d=Math.hypot(p.x-o.x,p.y-o.y);
     if(d<o.radius+13&&w.elapsed>=p.dodgeUntil&&w.elapsed>=p.stunUntil){
      p.health--;p.stunUntil=w.elapsed+.72;p.actionUntil=w.elapsed+.25;
      if(p.health<=0&&!partyRecover(w,p)){p.health=0;p.eliminated=true;p.fallAt=w.elapsed;}
     }else if(d>=o.radius+13&&d<o.radius+49)p.nearMisses++;
    }
   }
   w.objects=w.objects.filter(o=>w.elapsed<=o.endAt);
   for(const p of w.players)if(!p.forfeited)p.score=survivalScore(w,p,p.nearMisses*(w.meta.partyRespawn===true?80:.01));
   if(w.meta.partyRespawn===true)w.meta.roundOver=false;else if(w.players.filter(active).length<=1&&w.elapsed>1)w.meta.roundOver=true;
  },
  bot(w,p,random){
   const threats=w.objects.filter(o=>!o.resolved&&o.impactAt-w.elapsed<.8).sort((a,b)=>Math.hypot(p.x-a.x,p.y-a.y)-Math.hypot(p.x-b.x,p.y-b.y));
   let dx=(W/2-p.x)*.12,dy=(H/2-p.y)*.12;
   for(const o of threats){const d=Math.hypot(p.x-o.x,p.y-o.y);if(d<o.radius+100){const [ux,uy]=unit(p.x-o.x,p.y-o.y);dx+=ux*(o.radius+110-d);dy+=uy*(o.radius+110-d);}}
   const keys=[];if(dx>10)keys.push('right');if(dx< -10)keys.push('left');if(dy>10)keys.push('down');if(dy< -10)keys.push('up');
   const nearest=threats[0],urgent=nearest&&nearest.impactAt-w.elapsed<.3&&Math.hypot(p.x-nearest.x,p.y-nearest.y)<nearest.radius+22;
   return{held:keys,...urgent&&w.elapsed>=p.dashReadyAt&&random()<.65?{action:'dash'}:{}};
  }
 };
 function jump(w,p){if(p.jumpHeight>.01||w.elapsed<p.stunUntil)return false;p.jumpVy=510;p.jumpQueuedUntil=0;p.actionUntil=w.elapsed+.3;return true;}
 const runner={
  init(w,random){
   w.duration=24;w.objects=[];w.meta={width:W,height:H,serial:0,nextSpawnAt:.2,groundY:382,speed:218,roundOver:false};
   w.players.forEach(p=>{base(w,p);p.x=118;p.y=382;p.jumpHeight=0;p.jumpVy=0;p.jumpQueuedUntil=0;p.cleared=0;p.survived=0;p.lastHurtAt=-10;});
  },
  input(w,p,action){if(action!=='jump')return false;if(jump(w,p))return true;if(p.jumpVy<0&&w.elapsed>=p.stunUntil){p.jumpQueuedUntil=w.elapsed+.14;return true;}return false;},
  step(w,dt,controls,random){
   dt=clamp(dt,0,.04);w.meta.speed=218+Math.min(45,w.elapsed*2);
   if(w.elapsed>=w.meta.nextSpawnAt){
    w.objects.push({id:id(w,'hurdle'),kind:'hurdle',x:W+42,y:w.meta.groundY,width:26+random()*15,height:31+random()*18,speed:w.meta.speed,spawnAt:w.elapsed,hitIds:[],clearedIds:[],emoji:['📦','🧱','🖨️'][Math.floor(random()*3)]});
    w.meta.nextSpawnAt=w.elapsed+1.23+random()*.52;
   }
   for(const p of w.players){
    if(!active(p))continue;
    p.jumpVy-=1250*dt;p.jumpHeight+=p.jumpVy*dt;
    if(p.jumpHeight<=0){p.jumpHeight=0;p.jumpVy=0;if(p.jumpQueuedUntil>=w.elapsed&&p.jumpQueuedUntil>0)jump(w,p);}
    p.y=w.meta.groundY-p.jumpHeight;p.survived=w.elapsed;
   }
   for(const o of w.objects){
    o.x-=o.speed*dt;
    for(const p of w.players){
     if(!active(p))continue;
     const overlaps=Math.abs(o.x-p.x)<o.width/2+14;
     if(overlaps&&p.jumpHeight<o.height-3&&!o.hitIds.includes(p.id)){
      o.hitIds.push(p.id);
      if(w.elapsed-p.lastHurtAt>=.65&&(w.meta.partyRespawn!==true||w.elapsed>=p.respawnUntil)){p.health--;p.lastHurtAt=w.elapsed;p.stunUntil=w.elapsed+.24;p.actionUntil=w.elapsed+.3;if(p.health<=0&&!partyRecover(w,p)){p.health=0;p.eliminated=true;p.fallAt=w.elapsed;}}
     }
     if(o.x+o.width/2<p.x-14&&!o.clearedIds.includes(p.id)){o.clearedIds.push(p.id);if(!o.hitIds.includes(p.id))p.cleared++;}
    }
   }
   w.objects=w.objects.filter(o=>o.x> -65);
   for(const p of w.players)if(!p.forfeited)p.score=survivalScore(w,p,p.cleared*(w.meta.partyRespawn===true?80:.01));
   if(w.meta.partyRespawn===true)w.meta.roundOver=false;else if(w.players.filter(active).length<=1&&w.elapsed>1)w.meta.roundOver=true;
  },
  bot(w,p){
   const ahead=w.objects.filter(o=>!o.hitIds.includes(p.id)&&o.x>p.x-15).sort((a,b)=>a.x-b.x)[0];
   return{held:[],...ahead&&ahead.x-p.x<ahead.speed*.5&&ahead.x>p.x&&p.jumpHeight===0?{action:'jump'}:{}};
  }
 };
 return{sneak,dodge,runner};
}
/* END_ARCADE_MOTION_RULES_V1 */

/* ARCADE_SKILL_RULES_V1 */
function createArcadeSkillRules(){
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),tau=Math.PI*2;
 const alive=p=>!p.eliminated&&!p.forfeited;
 const held=(controls,id)=>controls.get(id)?.held||new Set();
 function direction(keys){let x=Number(keys.has('right'))-Number(keys.has('left')),y=Number(keys.has('down'))-Number(keys.has('up'));const d=Math.hypot(x,y)||1;return{x:x/d,y:y/d};}
 function coinSpawn(w,random,delay=.55){
  const n=++w.meta.coinSerial;
  w.objects.push({id:'coin_'+n,kind:'coin',x:38+random()*624,y:38+random()*384,readyAt:w.elapsed+delay,expiresAt:w.elapsed+delay+7.5,value:1});
 }
 function coinSteal(w,p,range){
  if(p.dashStolen||w.elapsed<p.shieldUntil)return false;
  const victims=w.players.filter(q=>q.id!==p.id&&alive(q)&&q.score>=1&&w.elapsed>=q.shieldUntil&&Math.hypot(q.x-p.x,q.y-p.y)<range).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y)||a.index-b.index),q=victims[0];
  if(!q)return false;p.dashStolen=true;q.score--;p.score++;p.stolen++;p.lastEvent='steal';q.lastEvent='stolen';p.shieldUntil=w.elapsed+.6;q.shieldUntil=w.elapsed+.6;q.actionUntil=w.elapsed+.3;w.meta.notice=p.name+' 님이 '+q.name+' 님 월급 한 닢 슬쩍!';return true;
 }
 const coins={
  init(w,random){
   w.duration=24;w.meta={coinSerial:0,nextCoinAt:.65,notice:'금색 동전을 줍고, 가까이 붙어서 Space로 월급 한 닢 슬쩍!'};w.objects=[];
   const n=w.players.length;
   w.players.forEach((p,i)=>{const a=-Math.PI/2+i*tau/n;p.x=350+Math.cos(a)*204;p.y=230+Math.sin(a)*138;p.score=0;p.health=3;p.dirX=-Math.cos(a);p.dirY=-Math.sin(a);p.dashReadyAt=0;p.dashUntil=0;p.dashStolen=false;p.shieldUntil=0;p.coinsCollected=0;p.stolen=0;p.lastEvent='';});
   for(let i=0;i<8;i++)coinSpawn(w,random,.65);
  },
  input(w,p,action){
   if(action!=='dash'&&action!=='hit')return;
   if(w.elapsed+1e-7<p.dashReadyAt)return;
   p.dashReadyAt=w.elapsed+2;p.dashUntil=w.elapsed+.18;p.dashStolen=false;p.actionUntil=p.dashUntil;p.lastEvent='dash';
   const norm=Math.hypot(p.dirX,p.dirY)||1;p.dirX/=norm;p.dirY/=norm;
   coinSteal(w,p,82);
  },
  step(w,dt,controls,random){
   for(const p of w.players){if(!alive(p))continue;const d=direction(held(controls,p.id));if(Math.hypot(d.x,d.y)>0&&w.elapsed>=p.dashUntil){p.dirX=d.x;p.dirY=d.y;}const isDash=w.elapsed<p.dashUntil,speed=isDash?540:188;const x=isDash?p.dirX:d.x,y=isDash?p.dirY:d.y;p.x=clamp(p.x+x*speed*dt,20,680);p.y=clamp(p.y+y*speed*dt,20,440);if(isDash)coinSteal(w,p,54);}
   while(w.elapsed>=w.meta.nextCoinAt&&w.meta.nextCoinAt<=w.duration){coinSpawn(w,random);w.meta.nextCoinAt+=.62;}
   const keep=[];
   for(const c of w.objects){
    if(w.elapsed>=c.expiresAt)continue;
    if(w.elapsed<c.readyAt){keep.push(c);continue;}
    const candidates=w.players.filter(p=>alive(p)&&Math.hypot(c.x-p.x,c.y-p.y)<=25);
    candidates.sort((a,b)=>Math.hypot(a.x-c.x,a.y-c.y)-Math.hypot(b.x-c.x,b.y-c.y)||((a.index+w.meta.coinSerial)%w.players.length)-((b.index+w.meta.coinSerial)%w.players.length));
    if(candidates[0]){const p=candidates[0];p.score+=c.value;p.coinsCollected++;p.lastEvent='coin';p.actionUntil=Math.max(p.actionUntil,w.elapsed+.18);}else keep.push(c);
   }
   w.objects=keep;
  },
  bot(w,p,random){
   const targets=w.objects.filter(c=>c.expiresAt>w.elapsed).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y));
   const t=targets[0],keys=[];if(t){if(t.x<p.x-7)keys.push('left');if(t.x>p.x+7)keys.push('right');if(t.y<p.y-7)keys.push('up');if(t.y>p.y+7)keys.push('down');}
   const victim=w.players.some(q=>q.id!==p.id&&alive(q)&&q.score>0&&Math.hypot(q.x-p.x,q.y-p.y)<78);
   return{held:keys,...(victim&&w.elapsed>=p.dashReadyAt&&random()<.6?{action:'dash'}:{})};
  }
 };
 const stampPeriod=1.7,stampStageLength=2.4;
 function stampPointer(t){const phase=((t/stampPeriod)%1+1)%1;return phase<.5?phase*2:2-phase*2;}
 function stampStage(w){
  const stage=Math.min(w.meta.targets.length-1,Math.floor((w.elapsed+1e-8)/stampStageLength));w.meta.stage=stage;w.meta.target=w.meta.targets[stage];w.meta.window=stage<3?.30:stage<7?.26:.22;w.meta.stageLeft=Math.max(0,stampStageLength-(w.elapsed-stage*stampStageLength));w.meta.pointer=stampPointer(w.elapsed);
  return stage;
 }
 const stamp={
  init(w,random){
   w.duration=24;w.objects=[];w.meta={stage:0,target:.5,window:.26,stageLength:stampStageLength,stageLeft:stampStageLength,pointer:0,targets:Array.from({length:10},()=>.18+random()*.64),notice:'초록 칸에 바늘이 들어올 때 Space! 한 칸마다 도장은 딱 한 번.'};
   stampStage(w);for(const p of w.players){p.x=350;p.y=230;p.score=0;p.health=3;p.pointer=0;p.lastStampStage=-1;p.stampAt=-1;p.stampPos=0;p.stampResult='';p.stampPoints=0;p.hits=0;p.misses=0;p.actionUntil=0;}
  },
  input(w,p,action){
   if(!['hit','dash','jump'].includes(action))return;const stage=stampStage(w);if(p.lastStampStage===stage)return;
   p.lastStampStage=stage;p.stampAt=w.elapsed;p.stampPos=stampPointer(w.elapsed);p.pointer=p.stampPos;const error=Math.abs(p.stampPos-w.meta.target),half=w.meta.window/2;p.actionUntil=w.elapsed+.48;
   if(error<=half+1e-7){const points=Math.round(60+40*(1-error/half));p.score+=points;p.hits++;p.stampResult=points>=93?'perfect':'hit';p.stampPoints=points;w.meta.notice=p.name+' 님 '+(points>=93?'정중앙 결재!':'결재 성공!');}else{p.score=Math.max(0,p.score-15);p.misses++;p.stampResult='miss';p.stampPoints=-15;w.meta.notice=p.name+' 님 반려! 다음 초록 칸을 노려요.';}
  },
  step(w,dt,controls,random){stampStage(w);for(const p of w.players){p.pointer=w.meta.pointer;}},
  bot(w,p,random){const stage=Math.floor((w.elapsed+1e-8)/stampStageLength),error=Math.abs(stampPointer(w.elapsed)-w.meta.target);return{held:[],...(p.lastStampStage!==stage&&error<.078&&random()<.78?{action:'hit'}:{})};}
 };
 return{coins,stamp};
}

/* ARCADE_COMBAT_KART_RULES_V1 */
function createArcadeCombatKartRules(){
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),tau=Math.PI*2,alive=p=>!p.eliminated&&!p.forfeited;
 const keys=(c,id)=>c.get(id)?.held||new Set();
 function direction(k){let x=Number(k.has('right'))-Number(k.has('left')),y=Number(k.has('down'))-Number(k.has('up'));const d=Math.hypot(x,y)||1;return{x:x/d,y:y/d};}
 function brawlScore(w,p){return Math.max(0,p.survived*1000+p.hp/10+(w.meta.partyRespawn===true?p.damageDealt*8+p.knockouts*600-p.deaths*800:0));}
 const brawl={
  init(w){w.duration=24;w.objects=[];w.meta={notice:'붙어서 Space! 주먹은 보는 방향으로 나가요. 마지막까지 살아남아라!'};const n=w.players.length;
   w.players.forEach((p,i)=>{const a=-Math.PI/2+i*tau/n;p.x=350+Math.cos(a)*190;p.y=230+Math.sin(a)*135;p.hp=100;p.health=3;p.score=0;p.faceX=-Math.cos(a);p.faceY=-Math.sin(a);p.vx=0;p.vy=0;p.attackUntil=0;p.hitReadyAt=0;p.hurtUntil=0;p.stunUntil=0;p.survived=0;p.deaths=0;p.respawnUntil=0;p.damageDealt=0;p.knockouts=0;});
  },
  input(w,p,action){
   if(action!=='hit'||w.elapsed<p.hitReadyAt||w.elapsed<p.stunUntil)return;
   p.hitReadyAt=w.elapsed+.55;p.attackUntil=w.elapsed+.18;p.actionUntil=p.attackUntil;
   const len=Math.hypot(p.faceX,p.faceY)||1,fx=p.faceX/len,fy=p.faceY/len;
   const victims=w.players.filter(q=>q!==p&&alive(q)&&w.elapsed>=q.hurtUntil).map(q=>{const dx=q.x-p.x,dy=q.y-p.y,d=Math.hypot(dx,dy);return{q,dx,dy,d,dot:d>0?(dx*fx+dy*fy)/d:1};}).filter(v=>v.d<=84&&v.dot>=.05).sort((a,b)=>a.d-b.d||a.q.index-b.q.index);
   const hit=victims[0];if(!hit)return;const q=hit.q,norm=hit.d||1,nx=hit.d?hit.dx/norm:fx,ny=hit.d?hit.dy/norm:fy;
   p.damageDealt+=Math.min(q.hp,28);q.hp=Math.max(0,q.hp-28);q.health=Math.min(3,Math.ceil(q.hp/34));q.vx=nx*255;q.vy=ny*255;q.stunUntil=w.elapsed+.16;q.hurtUntil=w.elapsed+.22;
   w.objects.push({kind:'punch',x:q.x,y:q.y,until:w.elapsed+.23});
   if(q.hp<=0){p.knockouts++;
    if(w.meta.partyRespawn===true){
     const candidates=Array.from({length:12},(_,i)=>{const a=i*tau/12;return{x:350+Math.cos(a)*245,y:230+Math.sin(a)*155};}),others=w.players.filter(r=>r!==q&&alive(r));
     const point=candidates.map((v,i)=>({...v,priority:Math.min(...others.map(r=>Math.hypot(v.x-r.x,v.y-r.y)),700),order:(i+q.index)%12})).sort((a,b)=>b.priority-a.priority||a.order-b.order)[0];
     q.x=point.x;q.y=point.y;q.hp=100;q.health=3;q.eliminated=false;q.deaths++;q.respawnUntil=w.elapsed+1;q.hurtUntil=q.respawnUntil;q.stunUntil=w.elapsed+.65;q.vx=0;q.vy=0;q.attackUntil=0;q.actionUntil=q.respawnUntil;q.survived=w.elapsed;q.score=brawlScore(w,q);w.meta.notice=q.name+' 님 다시 일어났다! · 800점 감점';
    }else{q.eliminated=true;q.survived=w.elapsed;q.score=brawlScore(w,q);w.meta.notice=p.name+' 님의 주먹! '+q.name+' 님 식판 퇴장.';}
   }
   p.survived=w.elapsed;p.score=brawlScore(w,p);
  },
  step(w,dt,controls){
   w.objects=w.objects.filter(o=>o.until>w.elapsed);
   for(const p of w.players){if(!alive(p))continue;const d=direction(keys(controls,p.id));
    if(Math.hypot(d.x,d.y)>0&&w.elapsed>=p.stunUntil){p.faceX=d.x;p.faceY=d.y;}
    const move=w.elapsed>=p.stunUntil?176:0;p.x=clamp(p.x+(d.x*move+p.vx)*dt,26,674);p.y=clamp(p.y+(d.y*move+p.vy)*dt,30,430);p.vx*=Math.exp(-9*dt);p.vy*=Math.exp(-9*dt);p.survived=w.elapsed;p.score=brawlScore(w,p);
   }
   const living=w.players.filter(alive);if(w.meta.partyRespawn===true)w.meta.roundOver=false;else if(living.length<=1){w.meta.roundOver=true;w.meta.notice=living[0]?living[0].name+' 님이 식판 격투장을 지켰어요!':'모두 넉다운!';}
  },
  bot(w,p){
   const target=w.players.filter(q=>q!==p&&alive(q)).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y)||a.index-b.index)[0];if(!target)return{held:[]};
   const dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy),held=[];
   if(d>47){if(dx>8)held.push('right');if(dx< -8)held.push('left');if(dy>8)held.push('down');if(dy< -8)held.push('up');}
   return{held,...(d<=81&&w.elapsed>=p.hitReadyAt?{action:'hit'}:{})};
  }
 };
 function project(angle,lane){return{x:350+Math.cos(angle)*(258+lane*27),y:230+Math.sin(angle)*(141+lane*22)};}
 function angularDistance(a,b){return Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));}
 function updateKart(p){p.angle=p.progress*tau-Math.PI/2;const q=project(p.angle+(p.visualOffset||0),p.lane);p.x=q.x;p.y=q.y;}
 const kart={
  init(w,random){w.duration=24;w.objects=[];w.meta={laps:3,totalProgress:3,nextHazardAt:.8,serial:0,firstFinishAt:-1,notice:'↑로 가속 · ←/→로 차선 변경 · Space로 터보! 물웅덩이를 피하세요.'};const n=w.players.length;
   w.players.forEach((p,i)=>{p.progress=0;p.lane=i%3-1;p.visualOffset=(Math.floor(i/3)-(Math.floor((n-1)/3))/2)*.095;p.angle=-Math.PI/2;p.speed=0;p.score=0;p.health=3;p.dashUntil=0;p.dashReadyAt=0;p.pickupUntil=0;p.laneReadyAt=0;p.stunUntil=0;p.finishAt=-1;p.hitCount=0;updateKart(p);});
  },
  input(w,p,action){if(action!=='dash'||p.finishAt>=0||w.elapsed<p.dashReadyAt)return;p.dashUntil=w.elapsed+.65;p.dashReadyAt=w.elapsed+2.4;p.actionUntil=p.dashUntil;},
  step(w,dt,controls,random){
   while(w.elapsed>=w.meta.nextHazardAt){const angle=random()*tau,lane=Math.floor(random()*3)-1,pos=project(angle,lane),kind=random()<.7?'puddle':'boost';w.objects.push({id:'kart_'+(++w.meta.serial),kind,angle,lane,x:pos.x,y:pos.y,readyAt:w.elapsed+.6,until:w.elapsed+4.2,hitIds:[]});w.meta.nextHazardAt+=.9;}
   w.objects=w.objects.filter(o=>o.until>w.elapsed);
   for(const p of w.players){if(!alive(p)||p.finishAt>=0)continue;const held=keys(controls,p.id),steer=Number(held.has('right'))-Number(held.has('left'));
    if(steer&&w.elapsed>=p.laneReadyAt){p.lane=clamp(p.lane+steer,-1,1);p.laneReadyAt=w.elapsed+.24;}
    const accelerated=held.has('up'),brake=held.has('down'),turbo=w.elapsed<p.dashUntil||w.elapsed<p.pickupUntil;
    const speed=w.elapsed<p.stunUntil?.042:turbo?.215:brake?.067:accelerated?.142:.102;p.speed=speed;p.progress=Math.min(w.meta.totalProgress,p.progress+speed*dt);updateKart(p);
    for(const o of w.objects){if(w.elapsed<o.readyAt||w.elapsed>=o.until||o.hitIds.includes(p.id)||o.lane!==p.lane||angularDistance(p.angle,o.angle)>.085)continue;o.hitIds.push(p.id);if(o.kind==='puddle'){p.stunUntil=w.elapsed+.62;p.hitCount++;w.meta.notice=p.name+' 님 물웅덩이! 차선을 바꿔 피해요.';}else{p.pickupUntil=w.elapsed+.8;o.until=w.elapsed;w.meta.notice=p.name+' 님 커피 부스트!';}break;}
    if(p.progress>=w.meta.totalProgress-1e-8){p.progress=w.meta.totalProgress;p.finishAt=w.elapsed;if(w.meta.firstFinishAt<0)w.meta.firstFinishAt=w.elapsed;w.meta.notice=p.name+' 님 '+w.meta.laps+'바퀴 완주!';}
    p.score=p.finishAt>=0?10000+(w.duration-p.finishAt)*100:p.progress*1000;
   }
   const racers=w.players.filter(alive);if(racers.length&&racers.every(p=>p.finishAt>=0)||w.meta.partyRespawn!==true&&w.meta.firstFinishAt>=0&&w.elapsed-w.meta.firstFinishAt>=3)w.meta.roundOver=true;
  },
  bot(w,p,random){const held=['up'],ahead=w.objects.filter(o=>o.lane===p.lane&&o.kind==='puddle'&&o.until>w.elapsed&&angularDistance(p.angle+Math.PI*.1,o.angle)<.43).sort((a,b)=>angularDistance(p.angle,a.angle)-angularDistance(p.angle,b.angle))[0];
   if(ahead){if(p.lane===-1)held.push('right');else if(p.lane===1)held.push('left');else held.push(p.index%2?'left':'right');}
   return{held,...(w.elapsed>=p.dashReadyAt&&random()<.88?{action:'dash'}:{})};
  }
 };
 return{brawl,kart};
}
/* END_ARCADE_COMBAT_KART_RULES_V1 */

/* ARCADE_SOCIAL_RHYTHM_RULES_V1 */
function createArcadeSocialRhythmRules(){
 const doorSecrets=new WeakMap(),rhythmSecrets=new WeakMap(),actions=['jump','hit','dash'];
 const alive=p=>!p.eliminated&&!p.forfeited;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 function doorBegin(w,s){
  s.choices.clear();s.resolved=false;
  const reserved=[0,1,2];for(let i=2;i>0;i--){const j=Math.floor(s.random()*(i+1));[reserved[i],reserved[j]]=[reserved[j],reserved[i]];}
  w.meta.stage=s.stage;w.meta.phase='choose';w.meta.stageLeft=3.15;w.meta.counts=[0,0,0];w.meta.totalCounts=[0,0,0];w.meta.reservedCounts=reserved;w.meta.notice='예약 손님 '+reserved.join(' / ')+'명. 덜 붐빌 식당을 골라! 남의 선택은 비밀.';
  for(const p of w.players){p.choice=-1;p.locked=false;p.roundPoints=0;p.x=350;p.y=96+p.index*38;}
 }
 function doorResolve(w,s){
  if(s.resolved)return;s.resolved=true;const counts=[0,0,0];
  for(const p of w.players)if(alive(p)&&s.choices.has(p.id))counts[s.choices.get(p.id)]++;
  w.meta.phase='reveal';w.meta.counts=counts;w.meta.totalCounts=counts.map((n,i)=>n+w.meta.reservedCounts[i]);
  for(const p of w.players){
   if(!alive(p))continue;const choice=s.choices.has(p.id)?s.choices.get(p.id):-1,points=choice<0?-10:Math.round(100/w.meta.totalCounts[choice]);
   p.choice=choice;p.roundPoints=points;p.score=Math.max(0,p.score+points);p.x=choice<0?350:115+choice*235;p.y=110+p.index*32;p.actionUntil=w.elapsed+.45;
  }
  const occupied=counts.filter(n=>n>0),least=occupied.length?Math.min(...occupied):0;
  w.meta.notice=least?'전체 손님 '+w.meta.totalCounts.join(' / ')+'명! 예약 손님까지 합쳐 덜 붐비면 높은 점수.':'아무도 못 골랐다. 다음에는 손 좀 빨리!';
 }
 const doors={
  init(w,random){
   w.duration=24;w.objects=[];w.meta={phase:'choose',stage:0,stageLeft:3.15,stageLength:4,chooseLength:3.15,counts:[0,0,0],labels:['왼쪽 식당','가운데 식당','오른쪽 식당'],notice:''};
   for(const p of w.players){p.score=0;p.health=3;p.eliminated=false;p.choice=-1;p.locked=false;p.roundPoints=0;}
   const s={stage:0,choices:new Map(),resolved:false,random:typeof random==='function'?random:()=>.5};doorSecrets.set(w,s);doorBegin(w,s);
  },
  input(w,p,action){
   const s=doorSecrets.get(w),choice=actions.indexOf(action);
   if(!s||choice<0||!alive(p)||w.meta.phase!=='choose'||w.elapsed-s.stage*4>=3.15||s.choices.has(p.id))return false;
   s.choices.set(p.id,choice);p.locked=true;p.actionUntil=w.elapsed+.18;return true;
  },
  step(w){
   const s=doorSecrets.get(w);if(!s)return false;const stage=Math.min(5,Math.max(0,Math.floor(w.elapsed/4)));
   while(s.stage<stage){doorResolve(w,s);s.stage++;doorBegin(w,s);}
   const local=w.elapsed-s.stage*4;
   if(local>=3.15)doorResolve(w,s);
   w.meta.stage=s.stage;w.meta.stageLeft=Math.max(0,(s.resolved?4:3.15)-local);
   return true;
  },
  bot(w,p,random){
   if(!doorSecrets.has(w)||w.meta.phase!=='choose'||p.locked||!alive(p)||w.elapsed-w.meta.stage*4<.55+p.index*.13)return{held:[]};
   return{held:[],action:actions[Math.floor(random()*3)%3]};
  }
 };
 function rhythmJudge(p,name,t){p.judge=name;p.judgeUntil=t+.55;p.actionUntil=t+.16;}
 function rhythmResolve(p,secret,note){secret.resolved.add(note.id);p.resolvedNotes.push(note.id);}
 const rhythm={
  init(w,random){
   w.duration=24;w.meta={travelTime:1.65,hitWindow:.24,perfectWindow:.09,noteTotal:26,notice:'왼쪽 A · 가운데 W/Space · 오른쪽 D. 복사기 박자에 맞춰 눌러!'};
   const phrases=[[0,1,2,1],[0,0,1,2],[2,1,0,1],[1,2,1,0],[0,2,0,2],[1,1,0,2]],chart=[];
   for(let phrase=0;phrase<7;phrase++){const pattern=phrases[Math.floor(random()*phrases.length)],rotate=Math.floor(random()*3);chart.push(...pattern.map(lane=>(lane+rotate)%3));}
   w.objects=Array.from({length:26},(_,i)=>({id:'beat_'+i,kind:'note',lane:chart[i],hitAt:1.4+i*.84}));
   const people=new Map();
   for(const p of w.players){p.x=350;p.y=230;p.score=0;p.health=3;p.combo=0;p.judge='';p.judgeUntil=0;p.hits=0;p.misses=0;p.lastHitLane=-1;p.resolvedNotes=[];people.set(p.id,{resolved:new Set(),nextActionAt:0});}
   rhythmSecrets.set(w,{people});
  },
  input(w,p,action){
   const state=rhythmSecrets.get(w),secret=state?.people.get(p.id),lane=actions.indexOf(action),t=w.elapsed;
   if(!secret||lane<0||!alive(p)||t+1e-7<secret.nextActionAt)return false;secret.nextActionAt=t+.12;p.lastHitLane=lane;
   const candidates=w.objects.filter(n=>!secret.resolved.has(n.id)&&n.lane===lane&&Math.abs(t-n.hitAt)<=w.meta.hitWindow+1e-7).sort((a,b)=>Math.abs(t-a.hitAt)-Math.abs(t-b.hitAt));
   const note=candidates[0];
   if(!note){p.combo=0;p.misses++;p.score=Math.max(0,p.score-8);rhythmJudge(p,'MISS',t);return false;}
   const error=Math.abs(t-note.hitAt),perfect=error<=w.meta.perfectWindow+1e-7;
   p.combo++;p.hits++;p.score+=(perfect?100:Math.round(65+25*(1-error/w.meta.hitWindow)))+Math.min(20,(p.combo-1)*2);
   rhythmResolve(p,secret,note);rhythmJudge(p,perfect?'PERFECT':'GOOD',t);return true;
  },
  step(w){
   const state=rhythmSecrets.get(w);if(!state)return false;
   for(const p of w.players){const secret=state.people.get(p.id);if(!secret||!alive(p))continue;
    for(const note of w.objects)if(!secret.resolved.has(note.id)&&w.elapsed>note.hitAt+w.meta.hitWindow+1e-7){rhythmResolve(p,secret,note);p.combo=0;p.misses++;p.score=Math.max(0,p.score-10);rhythmJudge(p,'MISS',w.elapsed);}
   }
   return true;
  },
  bot(w,p,random){
   const state=rhythmSecrets.get(w),secret=state?.people.get(p.id);if(!secret||!alive(p))return{held:[]};
   const note=w.objects.filter(n=>!secret.resolved.has(n.id)).sort((a,b)=>Math.abs(w.elapsed-a.hitAt)-Math.abs(w.elapsed-b.hitAt))[0];
   if(note&&Math.abs(w.elapsed-note.hitAt)<.15&&random()<.83)return{held:[],action:actions[note.lane]};
   return{held:[]};
  }
 };
 return{doors,rhythm};
}
/* END_ARCADE_SOCIAL_RHYTHM_RULES_V1 */

/* ARCADE_BASKET_RULES_V1 */
function createArcadeBasketRules(){
 const gravity=560,ballSpeed=590,hoopY=150,hoopRadius=27,shotGap=.78;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const alive=p=>!p.eliminated&&!p.forfeited;
 const hoopAt=t=>350+40*Math.sin(t*.8);
 function arrival(angle,launchY=370){const a=angle*Math.PI/180,vy=-ballSpeed*Math.sin(a),d=vy*vy-2*gravity*(launchY-hoopY);return d>0?(-vy+Math.sqrt(d))/gravity:null;}
 function aimFor(x,t){
  let best=90,error=Infinity;
  for(let angle=66;angle<=114;angle+=.25){const flight=arrival(angle);if(!flight)continue;const landed=x+ballSpeed*Math.cos(angle*Math.PI/180)*flight,miss=Math.abs(landed-hoopAt(t+flight));if(miss<error){error=miss;best=angle;}}
  return best;
 }
 const basket={
  init(w,random){
   w.duration=24;w.objects=[];w.meta={hoopX:hoopAt(0),hoopY,hoopRadius,gravity,ballSpeed,ballSerial:0,notice:'←/→로 슛 각도 조절, Space로 던져! 정중앙으로 넣으면 3점.'};
   const n=w.players.length;
   for(let i=0;i<n;i++){const p=w.players[i];p.x=n===1?350:180+i*340/(n-1);p.y=400;p.aim=aimFor(p.x,0);p.score=0;p.health=3;p.shotReadyAt=0;p.lastShotResult='';p.lastScoreAt=-1;p.makes=0;p.attempts=0;p.actionUntil=0;p.botAimOffset=(random()-.5)*1.6;}
  },
  input(w,p,action){
   if(!alive(p)||!['hit','jump','dash'].includes(action)||w.elapsed+1e-8<p.shotReadyAt)return;
   p.shotReadyAt=w.elapsed+shotGap;p.actionUntil=w.elapsed+.25;p.attempts++;p.lastShotResult='슛!';
   const a=clamp(p.aim,66,114)*Math.PI/180;
   w.objects.push({id:'basket_'+(++w.meta.ballSerial),kind:'basketBall',ownerId:p.id,x:p.x,y:p.y-30,vx:ballSpeed*Math.cos(a),vy:-ballSpeed*Math.sin(a),shotAt:w.elapsed,scored:false,points:0});
  },
  step(w,dt,controls){
   w.meta.hoopX=hoopAt(w.elapsed);
   for(const p of w.players){if(!alive(p))continue;const keys=controls.get(p.id)?.held||new Set(),steer=Number(keys.has('left'))-Number(keys.has('right'));p.aim=clamp(p.aim+steer*32*dt,66,114);}
   const keep=[];
   for(const ball of w.objects){
    const beforeX=ball.x,beforeY=ball.y;ball.vy+=gravity*dt;ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;
    if(!ball.scored&&ball.vy>0&&beforeY<=hoopY&&ball.y>=hoopY){
     const f=(hoopY-beforeY)/Math.max(1e-9,ball.y-beforeY),crossX=beforeX+(ball.x-beforeX)*f;
     const crossTime=w.elapsed-dt+f*dt,miss=Math.abs(crossX-hoopAt(crossTime));
     if(miss<=hoopRadius){
      const player=w.players.find(p=>p.id===ball.ownerId);
      ball.scored=true;ball.points=miss<=7?3:2;
      if(player&&alive(player)){player.score+=ball.points;player.makes++;player.lastScoreAt=w.elapsed;player.lastShotResult=ball.points===3?'깔끔한 3점!':'골인! +2';player.actionUntil=w.elapsed+.5;w.meta.notice=player.name+' 님 '+(ball.points===3?'정중앙 3점!':'골인!');}
     }
    }
    if(ball.y<495&&ball.x> -70&&ball.x<770&&w.elapsed-ball.shotAt<3.1)keep.push(ball);
    else if(!ball.scored){const player=w.players.find(p=>p.id===ball.ownerId);if(player&&alive(player)&&w.elapsed-player.lastScoreAt>.35)player.lastShotResult='아깝다! 다시 한 번.';}
   }
   w.objects=keep;
  },
  bot(w,p,random){
   if(!alive(p))return{held:[]};
   const wanted=aimFor(p.x,w.elapsed)+p.botAimOffset,delta=wanted-p.aim,held=delta> .45?['left']:delta<-.45?['right']:[];
   const fire=w.elapsed>=p.shotReadyAt&&Math.abs(delta)<1.4&&random()<.8;
   return{held,...(fire?{action:'hit'}:{})};
  }
 };
 return{basket};
}
/* END_ARCADE_BASKET_RULES_V1 */

/* ARCADE_TRAY_RULES_V1 */
function createArcadeTrayRules(){
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),active=p=>!p.eliminated&&!p.forfeited;
 const rect={x:70,y:62,cols:7,rows:7,tileW:80,tileH:48};
 function direction(keys){let x=Number(keys.has('right'))-Number(keys.has('left')),y=Number(keys.has('down'))-Number(keys.has('up'));const d=Math.hypot(x,y)||1;return{x:x/d,y:y/d};}
 function tileAt(w,x,y){const col=Math.floor((x-rect.x)/rect.tileW),row=Math.floor((y-rect.y)/rect.tileH);return col<0||col>=7||row<0||row>=7?null:w.objects[row*7+col];}
 const onFloor=(w,x,y,ahead=0)=>{const tile=tileAt(w,x,y);return !!tile&&w.elapsed+ahead<tile.goneAt;};
 function score(w,p){if(!p.forfeited)p.score=Math.max(0,Math.round(p.survived*1000)+(active(p)?3:0)+p.shoves*(w.meta.partyRespawn===true?120:.01)-(w.meta.partyRespawn===true?p.deaths*3000:0));}
 function finishFall(w,p){
  if(w.meta.partyRespawn===true){
   const tiles=w.objects.filter(o=>o.goneAt>w.elapsed+.5),others=w.players.filter(q=>q!==p&&active(q));
   const tile=tiles.map((o,i)=>({tile:o,safety:Math.min(o.goneAt-w.elapsed,6)*30+Math.min(...others.map(q=>Math.hypot(o.x+40-q.x,o.y+24-q.y)),700)*.1-Math.hypot(o.x+40-350,o.y+24-230)*.05,order:(i+p.index)%Math.max(1,tiles.length)})).sort((a,b)=>b.safety-a.safety||a.order-b.order)[0]?.tile;
   p.x=tile?tile.x+40:350;p.y=tile?tile.y+24:230;p.health=3;p.eliminated=false;p.deaths++;p.respawnUntil=w.elapsed+1;p.stunUntil=p.respawnUntil;p.hurtUntil=p.respawnUntil;p.vx=0;p.vy=0;p.dashUntil=0;p.pushHits=[];p.actionUntil=p.respawnUntil;p.survived=w.elapsed;score(w,p);w.meta.notice=p.name+' 님 식판으로 복귀! · 3,000점 감점';return;
  }
  p.eliminated=true;p.health=0;p.fallAt=w.elapsed;p.survived=w.elapsed;p.dashUntil=0;p.actionUntil=0;score(w,p);
 }
 function collide(w,a,b){
  if(w.meta.partyRespawn===true&&(w.elapsed<a.respawnUntil||w.elapsed<b.respawnUntil))return;
  let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(d>=38)return;
  if(d<.001){const angle=(a.index+1)*1.43+(b.index+1)*.7;dx=Math.cos(angle);dy=Math.sin(angle);d=1;}
  const nx=dx/d,ny=dy/d,gap=(38-d)/2;a.x-=nx*gap;a.y-=ny*gap;b.x+=nx*gap;b.y+=ny*gap;
  function strike(from,to,sx,sy){
   if(w.elapsed>=from.dashUntil||from.pushHits.includes(to.id)||w.elapsed<to.hurtUntil)return false;
   from.pushHits.push(to.id);from.shoves++;to.vx+=sx*480;to.vy+=sy*480;to.stunUntil=Math.max(to.stunUntil,w.elapsed+.24);to.hurtUntil=w.elapsed+.18;from.vx*=.82;from.vy*=.82;
   w.meta.notice=from.name+' 님의 식판 밀치기!';return true;
  }
  const hitA=strike(a,b,nx,ny),hitB=strike(b,a,-nx,-ny);
  if(!hitA&&!hitB){const closing=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;if(closing>0){const impulse=closing*.45;a.vx-=nx*impulse;a.vy-=ny*impulse;b.vx+=nx*impulse;b.vy+=ny*impulse;}}
 }
 const tray={
  init(w,random){
   w.duration=28;w.meta={...rect,width:700,height:460,roundOver:false,notice:'빨간 바닥은 곧 무너져요. Space로 밀쳐 마지막까지 식판을 지켜요!',nextGustAt:20,gustUntil:0,gustX:0,gustY:0,gustPushAt:0,gustApplied:true,partyFloorAdapted:false};
   const holes=[];w.objects=[];
   for(let row=0;row<7;row++)for(let col=0;col<7;col++){
    const ring=Math.max(Math.abs(row-3),Math.abs(col-3)),goneAt=ring===3?7:ring===2?13:ring===1?19:29;
    const tile={id:'tile_'+row+'_'+col,kind:'tray-tile',row,col,ring,x:rect.x+col*rect.tileW,y:rect.y+row*rect.tileH,width:rect.tileW,height:rect.tileH,warningAt:goneAt-1.25,goneAt};
    w.objects.push(tile);if(ring>0&&ring<3)holes.push({tile,key:random()});
   }
   holes.sort((a,b)=>a.key-b.key);holes.slice(0,5).forEach(({tile},i)=>{tile.goneAt=Math.min(tile.goneAt,5.5+i*2.1);tile.warningAt=tile.goneAt-1.25;});
   w.players.forEach((p,i)=>{const a=-Math.PI/2+i*Math.PI*2/w.players.length;p.x=350+Math.cos(a)*135;p.y=230+Math.sin(a)*84;p.vx=0;p.vy=0;p.dx=-Math.cos(a);p.dy=-Math.sin(a);p.health=3;p.eliminated=false;p.forfeited=false;p.dashUntil=0;p.dashReadyAt=0;p.hurtUntil=0;p.stunUntil=0;p.actionUntil=0;p.pushHits=[];p.shoves=0;p.survived=0;p.fallAt=-1;p.score=3;p.deaths=0;p.respawnUntil=0;});
  },
  input(w,p,action){
   if(action!=='dash'||w.elapsed<p.dashReadyAt||w.elapsed<p.stunUntil||!active(p))return false;
   p.dashUntil=w.elapsed+.17;p.dashReadyAt=w.elapsed+2.1;p.actionUntil=p.dashUntil;p.pushHits=[];p.vx=p.dx*430;p.vy=p.dy*430;return true;
  },
  step(w,dt,controls,random){
   const living=w.players.filter(active),t=w.elapsed;
   if(w.meta.partyRespawn===true&&!w.meta.partyFloorAdapted){for(const tile of w.objects)if(tile.ring<=1){tile.goneAt=w.duration+1;tile.warningAt=tile.goneAt-1.25;}w.meta.partyFloorAdapted=true;}
   if(w.meta.partyRespawn!==true&&living.length<=1){for(const p of living){p.survived=t;score(w,p);}w.meta.roundOver=true;return;}
   if(t>=w.meta.nextGustAt){const a=random()*Math.PI*2;w.meta.gustX=Math.cos(a);w.meta.gustY=Math.sin(a);w.meta.gustPushAt=t+.8;w.meta.gustUntil=t+1.3;w.meta.gustApplied=false;w.meta.nextGustAt=t+3;w.meta.notice='바람 예고! 화살표를 보고 반대쪽으로 자리를 잡아요!';}
   if(!w.meta.gustApplied&&t>=w.meta.gustPushAt){w.meta.gustApplied=true;for(const p of living){if(w.meta.partyRespawn===true&&t<p.respawnUntil)continue;p.vx+=w.meta.gustX*140;p.vy+=w.meta.gustY*140;}w.meta.notice='식판 흔들린다! 가운데에서 버티고 밀쳐요!';}
   for(const p of living){
    if(w.meta.partyRespawn===true&&t<p.respawnUntil){p.vx=0;p.vy=0;p.survived=t;score(w,p);continue;}
    const d=direction(controls.get(p.id)?.held||new Set());
    if(t>=p.stunUntil&&t>=p.dashUntil){if(d.x||d.y){p.dx=d.x;p.dy=d.y;}const alpha=Math.min(1,dt*11);p.vx+=(d.x*158-p.vx)*alpha;p.vy+=(d.y*158-p.vy)*alpha;}
    else if(t<p.dashUntil&&t>=p.stunUntil){p.vx=p.dx*430;p.vy=p.dy*430;}
    else{p.vx*=Math.exp(-3.5*dt);p.vy*=Math.exp(-3.5*dt);}
    p.vx=clamp(p.vx,-850,850);p.vy=clamp(p.vy,-850,850);p.x=clamp(p.x+p.vx*dt,-30,730);p.y=clamp(p.y+p.vy*dt,-30,490);p.survived=t;
   }
   for(let i=0;i<living.length;i++)for(let j=i+1;j<living.length;j++)collide(w,living[i],living[j]);
   for(const p of living){p.x=clamp(p.x,-30,730);p.y=clamp(p.y,-30,490);if(!onFloor(w,p.x,p.y))finishFall(w,p);else score(w,p);}
   const remaining=living.filter(active);if(w.meta.partyRespawn===true)w.meta.roundOver=false;else if(remaining.length<=1){w.meta.roundOver=true;w.meta.notice=remaining.length?remaining[0].name+' 님 식판 사수!':'동반 추락! 동점이면 다른 게임으로 재경기해요.';}
   else if(w.objects.some(o=>t>=o.warningAt&&t<o.goneAt)&&t>=w.meta.gustUntil)w.meta.notice='빨간 칸에서 나와요! Space로 밀칠 때는 앞바닥도 확인!';
  },
  bot(w,p){
   const t=w.elapsed,tile=tileAt(w,p.x,p.y),safeHere=tile&&t+.65<tile.goneAt;
   let target=null,dx=0,dy=0;
   if(!safeHere){
    target=w.objects.filter(o=>o.goneAt>t+.9).sort((a,b)=>Math.hypot(a.x+40-p.x,a.y+24-p.y)-Math.hypot(b.x+40-p.x,b.y+24-p.y))[0];
    if(target){dx=target.x+40-p.x;dy=target.y+24-p.y;}
   }else{
    const other=w.players.filter(q=>q!==p&&active(q)).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
    const centerWeight=t>14?.85:.35;dx=(350-p.x)*centerWeight;dy=(230-p.y)*centerWeight;
    if(other&&Math.hypot(other.x-p.x,other.y-p.y)<140){const ox=other.x-p.x,oy=other.y-p.y;if(onFloor(w,p.x+Math.sign(ox)*28,p.y+Math.sign(oy)*28,.5)){dx=ox*.8+(350-p.x)*.12;dy=oy*.8+(230-p.y)*.12;}}
   }
   const held=[];if(dx>11)held.push('right');if(dx< -11)held.push('left');if(dy>9)held.push('down');if(dy< -9)held.push('up');
   const near=w.players.some(q=>q!==p&&active(q)&&Math.hypot(q.x-p.x,q.y-p.y)<75),frontSafe=onFloor(w,p.x+p.dx*62,p.y+p.dy*62,.35);
   return{held,...near&&safeHere&&frontSafe&&t>=p.dashReadyAt?{action:'dash'}:{}};
  }
 };
 return{tray};
}
/* END_ARCADE_TRAY_RULES_V1 */

/* ARCADE_SPORTS_RULES_V1 */
function createArcadeSportsRules(){
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),live=p=>!p.eliminated&&!p.forfeited,keys=(controls,p)=>controls.get(p.id)?.held||new Set(),wave=(t,at)=>.5+.5*Math.sin((t-at)*4.1-Math.PI/2),dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),angleDiff=a=>Math.atan2(Math.sin(a),Math.cos(a));
 const own=(w,p,kind)=>w.objects.find(o=>o.ownerId===p.id&&(!kind||o.kind===kind));
 function setup(w,duration,notice){w.duration=duration;w.objects=[];w.meta={serial:0,notice};for(const p of w.players){Object.assign(p,{x:350,y:400,score:0,health:3,phase:'ready',readyAt:0,aim:0,power:0,chargeAt:0,shots:0,completed:0,judge:'',judgeUntil:0});}}
 function say(w,p,text){p.judge=text;p.judgeUntil=w.elapsed+.8;p.actionUntil=w.elapsed+.23;}
 // A player's Nth serve has the same trajectory as every other player's Nth serve.
 function serveRandom(w,attempt,salt){let seed=(w.meta.serveSeed^Math.imul(attempt+1,0x9e3779b1)^salt)>>>0;seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;}
 function powerInput(w,p,action,launch){if(!live(p)||action!=='hit'||w.elapsed<p.readyAt)return;if(p.phase==='ready'){p.phase='power';p.chargeAt=w.elapsed;p.power=0;p.readyAt=w.elapsed+.14;say(w,p,'한 번 더 눌러 발사!');}else if(p.phase==='power'){p.power=wave(w.elapsed,p.chargeAt);launch();}}
 function ball(w,p,kind,x,y,extra={}){const o={id:'sport_'+(++w.meta.serial),kind,ownerId:p.id,x,y,vx:0,vy:0,active:true,...extra};w.objects.push(o);return o;}
 function settleMotion(o,dt,friction){o.x+=o.vx*dt;o.y+=o.vy*dt;const f=Math.exp(-friction*dt);o.vx*=f;o.vy*=f;for(const [axis,min,max]of [['x',30,670],['y',38,430]])if(o[axis]<min||o[axis]>max){o[axis]=clamp(o[axis],min,max);o[axis==='x'?'vx':'vy']*= -.55;}return Math.hypot(o.vx,o.vy)<13;}
 const pong={
  init(w,rng){setup(w,26,'↑/↓로 패들을 움직여 반사! Space 스매시는 짧은 순간만 강해요.');const serveY=150+rng()*150,serveVy=(rng()-.5)*210;w.meta.serveSeed=Math.floor(rng()*4294967296);for(const p of w.players){p.x=62;p.y=230;p.paddleY=230;p.rallies=0;p.misses=0;p.smashUntil=0;ball(w,p,'pongBall',410,serveY,{vx:-235,vy:serveVy,serveAt:0});}},
  input(w,p,a){if(!live(p)||a!=='hit'||w.elapsed<p.readyAt)return;p.smashUntil=w.elapsed+.24;p.readyAt=w.elapsed+.68;say(w,p,'스매시!');},
  step(w,dt,controls,rng){for(const p of w.players){if(!live(p))continue;const k=keys(controls,p);p.paddleY=clamp(p.paddleY+(Number(k.has('down'))-Number(k.has('up')))*310*dt,64,396);p.y=p.paddleY;const b=own(w,p);if(w.elapsed<b.serveAt)continue;const before=b.x;b.x+=b.vx*dt;b.y+=b.vy*dt;if(b.y<22||b.y>438){b.y=clamp(b.y,22,438);b.vy*= -1;}if(b.x>660){b.x=660;b.vx=-Math.abs(b.vx);}if(b.vx<0&&before>=78&&b.x<78&&Math.abs(b.y-p.paddleY)<60){const smash=w.elapsed<p.smashUntil;b.x=78;b.vx=Math.min(480,Math.abs(b.vx)*(smash?1.32:1.04));b.vy=clamp((b.y-p.paddleY)*4,-260,260);p.score+=smash?7:4;p.rallies++;say(w,p,smash?'강스매시 +7':'반사 +4');}if(b.x<12){p.score=Math.max(0,p.score-2);p.misses++;Object.assign(b,{x:410,y:100+serveRandom(w,p.misses,1)*260,vx:-235,vy:(serveRandom(w,p.misses,2)-.5)*210,serveAt:w.elapsed+.55});say(w,p,'놓쳤다! 곧 재서브');}}},
  bot(w,p){const b=own(w,p),dy=b.y-p.paddleY;return{held:Math.abs(dy)>15?[dy>0?'down':'up']:[],...(b.x<155&&b.vx<0&&w.elapsed>=p.readyAt?{action:'hit'}:{})};}
 };
 const curling={
  init(w){setup(w,26,'←/→ 조준, Space 두 번으로 발사! 굴러갈 때 Space로 쓸면 더 멀리. 3개 돌의 합계!');for(const p of w.players){p.y=422;p.activeShot='';p.finishedIds=[];p.sweepUntil=0;}},
  input(w,p,a){if(a==='hit'&&live(p)&&p.phase==='moving'&&w.elapsed>=p.readyAt){p.sweepUntil=w.elapsed+.28;p.readyAt=w.elapsed+.22;say(w,p,'슥슥! 마찰을 줄여 더 멀리');return;}powerInput(w,p,a,()=>{const speed=240+p.power*500,o=ball(w,p,'curlStone',350,418,{vx:Math.sin(p.aim)*speed,vy:-Math.cos(p.aim)*speed,settled:false,points:0,shot:p.shots+1});p.activeShot=o.id;p.shots++;p.phase='moving';p.readyAt=w.elapsed+.3;say(w,p,'미끄러진다! Space로 쓸기');});},
  step(w,dt,controls){for(const p of w.players){if(!live(p))continue;const k=keys(controls,p);if(['ready','power'].includes(p.phase))p.aim=clamp(p.aim+(Number(k.has('right'))-Number(k.has('left')))*.75*dt,-.6,.6);if(p.phase==='power')p.power=wave(w.elapsed,p.chargeAt);const stones=w.objects.filter(o=>o.ownerId===p.id);for(const o of stones)if(!o.settled){if(settleMotion(o,dt,o.id===p.activeShot&&w.elapsed<p.sweepUntil?.82:1.32)){o.vx=0;o.vy=0;o.settled=true;if(!p.finishedIds.includes(o.id)){p.finishedIds.push(o.id);if(o.id===p.activeShot){p.completed++;p.phase=p.shots>=3?'done':'ready';p.readyAt=w.elapsed+.4;say(w,p,'중심에서 '+Math.round(Math.hypot(o.x-350,o.y-125))+'px');}}}}
    for(let i=0;i<stones.length;i++)for(let j=i+1;j<stones.length;j++){const a=stones[i],b=stones[j],d=dist(a,b);if(d>=29||d<.01||a.settled&&b.settled)continue;const nx=(b.x-a.x)/d,ny=(b.y-a.y)/d,rv=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;if(rv>0){a.vx-=rv*nx*.8;a.vy-=rv*ny*.8;b.vx+=rv*nx*.8;b.vy+=rv*ny*.8;a.settled=false;b.settled=false;}const overlap=(29-d)/2;a.x-=nx*overlap;a.y-=ny*overlap;b.x+=nx*overlap;b.y+=ny*overlap;}
    p.score=stones.reduce((sum,o)=>sum+(o.settled?Math.max(0,Math.round(110-Math.hypot(o.x-350,o.y-125)*.34)):0),0);
   }if(w.elapsed>=20&&w.players.filter(live).every(p=>p.phase==='done')&&w.objects.every(o=>o.settled))w.meta.roundOver=true;},
  bot(w,p){return{held:p.aim>.035?['left']:p.aim<-.035?['right']:[],...((p.phase==='ready'&&w.elapsed>=p.readyAt)||(p.phase==='power'&&(p.power>=.34||w.elapsed-p.chargeAt>1.3))?{action:'hit'}:{})};}
 };
 function pins(w,p){w.objects=w.objects.filter(o=>o.ownerId!==p.id);p.framePins=0;p.frameShots=0;let serial=0;for(let row=0;row<4;row++)for(let c=0;c<=row;c++)ball(w,p,'bowlingPin',350+(c-row/2)*25,112-row*23,{id:'pin_'+p.id+'_'+p.completed+'_'+serial++,down:false,active:false,vx:0,vy:0});}
 const bowling={
  init(w){setup(w,27,'한 프레임에 최대 두 번! ←/→ 조준, Space 두 번 투구. 스트라이크 +15 · 스페어 +8!');for(const p of w.players){p.y=420;p.framePins=0;p.flightAt=0;p.nextFrameAt=0;p.phase='ready';pins(w,p);}},
  input(w,p,a){powerInput(w,p,a,()=>{const speed=390+p.power*420;ball(w,p,'bowlingBall',350,420,{vx:Math.sin(p.aim)*speed,vy:-Math.cos(p.aim)*speed});p.shots++;p.frameShots++;p.flightAt=w.elapsed;p.phase='moving';say(w,p,p.frameShots===1?'첫 번째 투구!':'남은 핀을 노려!');});},
  step(w,dt,controls){for(const p of w.players){if(!live(p))continue;const k=keys(controls,p);if(['ready','power'].includes(p.phase))p.aim=clamp(p.aim+(Number(k.has('right'))-Number(k.has('left')))*.5*dt,-.38,.38);if(p.phase==='power')p.power=wave(w.elapsed,p.chargeAt);const b=own(w,p,'bowlingBall');if(p.phase==='moving'&&b){b.x+=b.vx*dt;b.y+=b.vy*dt;const ps=w.objects.filter(o=>o.ownerId===p.id&&o.kind==='bowlingPin');const knocked=[];for(const pin of ps)if(!pin.down&&dist(b,pin)<24){pin.down=true;pin.vx=b.vx*.28+(pin.x-b.x)*4;pin.vy=b.vy*.22;knocked.push(pin);p.score+=10;p.framePins++;say(w,p,'핀 '+p.framePins+'개!');}for(const pin of ps)if(pin.down){pin.x=clamp(pin.x+pin.vx*dt,20,680);pin.y=clamp(pin.y+pin.vy*dt,25,435);pin.vx*=Math.exp(-3*dt);pin.vy*=Math.exp(-3*dt);if(Math.hypot(pin.vx,pin.vy)>20)for(const next of ps)if(!next.down&&dist(pin,next)<23){next.down=true;next.vx=pin.vx*.65;next.vy=pin.vy*.65;p.score+=10;p.framePins++;}}
      if(b.y<20||b.x<20||b.x>680||w.elapsed-p.flightAt>2.1){const complete=p.framePins===10||p.frameShots>=2;if(complete){p.completed++;if(p.framePins===10){const bonus=p.frameShots===1?15:8;p.score+=bonus;say(w,p,p.frameShots===1?'스트라이크! +15':'스페어! +8');}p.phase=p.completed>=3?'done':'between';p.nextFrameAt=w.elapsed+.7;}else{p.phase='ready';p.readyAt=w.elapsed+.35;say(w,p,'남은 '+(10-p.framePins)+'핀 · 한 번 더!');}w.objects=w.objects.filter(o=>o.id!==b.id);}
    }if(p.phase==='between'&&w.elapsed>=p.nextFrameAt){pins(w,p);p.phase='ready';p.readyAt=w.elapsed;}}
   if(w.elapsed>=20&&w.players.filter(live).every(p=>p.phase==='done'))w.meta.roundOver=true;},
  bot(w,p){return{held:p.aim>.025?['left']:p.aim<-.025?['right']:[],...((p.phase==='ready'&&w.elapsed>=p.readyAt)||(p.phase==='power'&&p.power>.64)?{action:'hit'}:{})};}
 };
 function volleyReceive(w,p,b){if(w.elapsed<b.serveAt||b.vy<=0||b.y<=205||b.y>=442||Math.abs(b.x-p.x)>=90||w.elapsed-b.lastHitAt<=.4)return false;const precise=b.y>=330&&Math.abs(b.x-p.x)<35,points=precise?10:7;b.vy=-270;b.vx=clamp((b.x-p.x)*2.3,-160,160);b.lastHitAt=w.elapsed;p.bufferUntil=0;p.hits++;p.score+=points;say(w,p,precise?'정확한 리시브! +10':'살렸다! +7');return true;}
 const volley={
  init(w,rng){setup(w,26,'내려오는 풍선 아래에서 Space! 낮은 위치에서 정중앙 리시브는 +10, 일반 +7.');const serveX=230+rng()*240,serveVx=(rng()-.5)*70;w.meta.serveSeed=Math.floor(rng()*4294967296);for(const p of w.players){p.x=350;p.y=410;p.hits=0;p.misses=0;p.bufferUntil=0;ball(w,p,'volleyBall',serveX,95,{vx:serveVx,vy:0,serveAt:0,lastHitAt:-1});}},
  input(w,p,a){if(!live(p)||a!=='hit'||w.elapsed<p.readyAt)return;p.readyAt=w.elapsed+.42;p.actionUntil=w.elapsed+.23;const b=own(w,p);if(!volleyReceive(w,p,b)){p.bufferUntil=w.elapsed+.18;say(w,p,b.vy<0?'올라갈 땐 기다려요':'조금 더 기다려 받아쳐!');}},
  step(w,dt,controls,rng){for(const p of w.players){if(!live(p))continue;const k=keys(controls,p);p.x=clamp(p.x+(Number(k.has('right'))-Number(k.has('left')))*280*dt,45,655);const b=own(w,p);if(w.elapsed<b.serveAt)continue;b.vy+=185*dt;b.x+=b.vx*dt;b.y+=b.vy*dt;b.vx*=Math.exp(-.1*dt);if(b.x<25||b.x>675){b.x=clamp(b.x,25,675);b.vx*= -1;}if(b.y<27){b.y=27;b.vy=Math.abs(b.vy)*.6;}if(w.elapsed<=p.bufferUntil)volleyReceive(w,p,b);if(b.y>438){p.score=Math.max(0,p.score-5);p.misses++;p.bufferUntil=0;Object.assign(b,{x:200+serveRandom(w,p.misses,3)*300,y:95,vx:(serveRandom(w,p.misses,4)-.5)*75,vy:0,serveAt:w.elapsed+.55});say(w,p,'툭… 다시 띄워요!');}}},
  bot(w,p){const b=own(w,p),dx=b.x-p.x;return{held:Math.abs(dx)>20?[dx>0?'right':'left']:[],...(b.y>285&&b.vy>0&&Math.abs(dx)<80&&w.elapsed>=p.readyAt?{action:'hit'}:{})};}
 };
 const golfLayouts=[{start:{x:90,y:360},hole:{x:600,y:105},walls:[{x:295,y:145,w:50,h:220}]},{start:{x:90,y:110},hole:{x:595,y:360},walls:[{x:300,y:40,w:46,h:210}]},{start:{x:110,y:355},hole:{x:585,y:105},walls:[{x:270,y:220,w:180,h:38},{x:470,y:50,w:40,h:160}]}];
 function golfPlace(w,p){const layout=golfLayouts[p.hole%3];let b=own(w,p);if(!b)b=ball(w,p,'golfBall',layout.start.x,layout.start.y,{vx:0,vy:0});Object.assign(b,{x:layout.start.x,y:layout.start.y,vx:0,vy:0});p.x=b.x;p.y=b.y;p.aim=Math.atan2(layout.hole.y-b.y,layout.hole.x-b.x);p.holeStrokes=0;p.phase='ready';p.readyAt=w.elapsed+.25;}
 const golf={
  init(w){setup(w,32,'←/→로 방향 조준, Space 두 번으로 퍼팅. 벽을 튕겨 3홀! 적은 타수일수록 높은 점수.');w.meta.layouts=golfLayouts;for(const p of w.players){p.hole=0;p.baseScore=0;p.holeStrokes=0;p.nextHoleAt=0;golfPlace(w,p);}},
  input(w,p,a){powerInput(w,p,a,()=>{const b=own(w,p),speed=200+p.power*620;b.vx=Math.cos(p.aim)*speed;b.vy=Math.sin(p.aim)*speed;p.phase='moving';p.holeStrokes++;p.shots++;say(w,p,p.holeStrokes+'타!');});},
  step(w,dt,controls){for(const p of w.players){if(!live(p)||p.phase==='done')continue;const k=keys(controls,p);if(['ready','power'].includes(p.phase))p.aim=angleDiff(p.aim+(Number(k.has('right'))-Number(k.has('left')))*1.15*dt);if(p.phase==='power')p.power=wave(w.elapsed,p.chargeAt);const layout=golfLayouts[p.hole%3],b=own(w,p);if(p.phase==='moving'){const x0=b.x,y0=b.y;const stopped=settleMotion(b,dt,1.52);for(const r of layout.walls)if(b.x>r.x-8&&b.x<r.x+r.w+8&&b.y>r.y-8&&b.y<r.y+r.h+8){if(x0<=r.x-8||x0>=r.x+r.w+8){b.x=x0<=r.x-8?r.x-8:r.x+r.w+8;b.vx*= -.8;}else{b.y=y0<=r.y-8?r.y-8:r.y+r.h+8;b.vy*= -.8;}}
      if(dist(b,layout.hole)<21&&Math.hypot(b.vx,b.vy)<185){b.vx=0;b.vy=0;b.x=layout.hole.x;b.y=layout.hole.y;p.baseScore+=Math.max(20,130-p.holeStrokes*15);p.completed++;p.phase=p.completed>=3?'done':'between';p.nextHoleAt=w.elapsed+.7;say(w,p,'홀인! '+p.holeStrokes+'타');}else if(stopped){p.phase='ready';p.readyAt=w.elapsed+.2;}
    }if(p.phase==='between'&&w.elapsed>=p.nextHoleAt){p.hole++;golfPlace(w,p);}p.x=b.x;p.y=b.y;p.score=p.baseScore+(p.phase==='done'||p.phase==='between'?0:Math.max(0,Math.round(80-dist(b,layout.hole)*.13-p.holeStrokes*3)));}
   if(w.elapsed>=20&&w.players.filter(live).every(p=>p.phase==='done'))w.meta.roundOver=true;},
  bot(w,p){if(!['ready','power'].includes(p.phase))return{held:[]};const b=own(w,p),l=golfLayouts[p.hole%3];let target=l.hole;for(const r of l.walls)if(b.x<r.x-15&&l.hole.x>r.x&&b.y>r.y-40&&b.y<r.y+r.h+40){target={x:r.x+40,y:r.y>170?r.y-40:r.y+r.h+45};break;}const desired=Math.atan2(target.y-b.y,target.x-b.x),d=angleDiff(desired-p.aim),power=clamp((dist(b,target)*1.52-200)/620,.08,.92);return{held:Math.abs(d)>.08?[d>0?'right':'left']:[],...((p.phase==='ready'&&Math.abs(d)<.1&&w.elapsed>=p.readyAt)||(p.phase==='power'&&(p.power>=power||w.elapsed-p.chargeAt>1.4))?{action:'hit'}:{})};}
 };
 const parkingSpots=[{x:590,y:105,angle:-Math.PI/2},{x:120,y:100,angle:Math.PI},{x:575,y:360,angle:Math.PI/2},{x:120,y:350,angle:0}],parkingWalls=[{x:285,y:165,w:130,h:90}];
 const parking={
  init(w){setup(w,32,'↑/↓ 전후진, ←/→ 조향, Space 브레이크. 정방향·후진 모두 주차칸에 1초!');w.meta.spots=parkingSpots;w.meta.walls=parkingWalls;for(const p of w.players){p.x=120;p.y=350;p.angle=-.7;p.speed=0;p.target=0;p.parkHold=0;p.bumpAt=-1;p.baseScore=0;p.parked=0;}},
  input(w,p,a){if(!live(p)||a!=='hit'||w.elapsed<p.readyAt)return;p.speed*=.18;p.readyAt=w.elapsed+.25;say(w,p,'끼익! 브레이크');},
  step(w,dt,controls){for(const p of w.players){if(!live(p))continue;const k=keys(controls,p),gas=Number(k.has('up'))-Number(k.has('down')),steer=Number(k.has('right'))-Number(k.has('left'));p.speed=clamp((p.speed+gas*210*dt)*Math.exp(-.75*dt),-100,185);p.angle=angleDiff(p.angle+steer*1.9*dt*(p.speed< -6?-1:1)*Math.max(.45,Math.min(1,Math.abs(p.speed)/55)));const x0=p.x,y0=p.y;p.x+=Math.cos(p.angle)*p.speed*dt;p.y+=Math.sin(p.angle)*p.speed*dt;let bump=p.x<32||p.x>668||p.y<42||p.y>425;for(const r of parkingWalls)if(p.x>r.x-18&&p.x<r.x+r.w+18&&p.y>r.y-18&&p.y<r.y+r.h+18)bump=true;if(bump){p.x=clamp(x0,32,668);p.y=clamp(y0,42,425);p.speed*= -.22;if(w.elapsed-p.bumpAt>.5){p.bumpAt=w.elapsed;p.baseScore=Math.max(0,p.baseScore-4);say(w,p,'콩! 조금 천천히');}}
    const target=parkingSpots[p.target%parkingSpots.length],d=dist(p,target),rawError=Math.abs(angleDiff(p.angle-target.angle)),error=Math.min(rawError,Math.PI-rawError);p.parkHold=d<32&&error<.38&&Math.abs(p.speed)<20?p.parkHold+dt:Math.max(0,p.parkHold-dt*2);if(p.parkHold>=1){p.baseScore+=100;p.parked++;p.target++;p.parkHold=0;say(w,p,'주차 완료! +100');}p.score=p.baseScore+Math.max(0,Math.round(35-d*.065));}
  },
  bot(w,p){const target=parkingSpots[p.target%parkingSpots.length],d=dist(p,target),wall=parkingWalls[0];let waypoint=target;if(p.x<wall.x-15&&target.x>wall.x&&p.y>wall.y-25&&p.y<wall.y+wall.h+110)waypoint={x:wall.x-45,y:wall.y-55};const nav=dist(p,waypoint),desired=waypoint===target&&d<45?target.angle:Math.atan2(waypoint.y-p.y,waypoint.x-p.x),delta=angleDiff(desired-p.angle),held=[];if(Math.abs(delta)>.09)held.push(delta>0?'right':'left');if(nav>26&&Math.abs(delta)<1.0)held.push('up');else if(d<18&&Math.abs(delta)>.6)held.push('down');return{held,...((d<65&&Math.abs(p.speed)>18)||Math.abs(delta)>1.1&&Math.abs(p.speed)>35?{action:'hit'}:{})};}
 };
 return{pong,curling,bowling,volley,golf,parking};
}
/* END_ARCADE_SPORTS_RULES_V1 */

/* ARCADE_ACTION_PACK_RULES_V1 */
function createArcadeActionPackRules(){
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),active=p=>!p.eliminated&&!p.forfeited,tau=Math.PI*2;
 const axes=k=>{const x=Number(k.has('right'))-Number(k.has('left')),y=Number(k.has('down'))-Number(k.has('up')),d=Math.hypot(x,y)||1;return{x:x/d,y:y/d};};
 const held=(controls,p)=>controls.get(p.id)?.held||new Set();
 function base(p){Object.assign(p,{health:3,eliminated:false,forfeited:false,stunUntil:0,actionUntil:0,respawnUntil:0,invincibleUntil:0,score:0});}
 function pointTo(dx,dy){const keys=[];if(dx>10)keys.push('right');if(dx< -10)keys.push('left');if(dy>10)keys.push('down');if(dy< -10)keys.push('up');return keys;}
 function courtSpawn(p,n){return{x:p.index%2?604:96,y:100+(Math.floor(p.index/2)+1)/(Math.ceil(n/2)+1)*285};}
 const dodgeball={
  init(w){w.duration=26;w.objects=[];w.meta={serial:0,notice:'방향키로 조준하고 Space로 공! 맞아도 금방 돌아와요.'};w.players.forEach(p=>{base(p);const spawn=courtSpawn(p,w.players.length);Object.assign(p,{...spawn,faceX:p.index%2?-1:1,faceY:0,throwReadyAt:0,hits:0,received:0});});},
  input(w,p,action){if(action!=='hit'||!active(p)||w.elapsed<p.throwReadyAt||w.elapsed<p.stunUntil||w.elapsed<p.respawnUntil)return false;p.throwReadyAt=w.elapsed+.72;p.actionUntil=w.elapsed+.2;const d=Math.hypot(p.faceX,p.faceY)||1;w.objects.push({id:'ball_'+(++w.meta.serial),kind:'dodgeball',ownerId:p.id,x:p.x+p.faceX*23,y:p.y+p.faceY*23,vx:p.faceX/d*355,vy:p.faceY/d*355,until:w.elapsed+1.9,bounces:0,hitIds:[]});return true;},
  step(w,dt,controls){
   const t=w.elapsed;
   for(const p of w.players){if(!active(p)||t<p.stunUntil||t<p.respawnUntil)continue;const d=axes(held(controls,p));if(d.x||d.y){p.faceX=d.x;p.faceY=d.y;}p.x=clamp(p.x+d.x*184*dt,36,664);p.y=clamp(p.y+d.y*184*dt,74,418);}
   for(const o of w.objects){if(o.until<=t)continue;o.x+=o.vx*dt;o.y+=o.vy*dt;if(o.x<25||o.x>675){o.x=clamp(o.x,25,675);o.vx*=-1;o.bounces++;}if(o.y<62||o.y>430){o.y=clamp(o.y,62,430);o.vy*=-1;o.bounces++;}if(o.bounces>1){o.until=t;continue;}
    const victim=w.players.filter(p=>active(p)&&p.id!==o.ownerId&&t>=p.invincibleUntil&&t>=p.respawnUntil&&!o.hitIds.includes(p.id)&&Math.hypot(p.x-o.x,p.y-o.y)<29).sort((a,b)=>Math.hypot(a.x-o.x,a.y-o.y)-Math.hypot(b.x-o.x,b.y-o.y)||((a.index+o.id.length+Math.floor(t*20))%w.players.length)-((b.index+o.id.length+Math.floor(t*20))%w.players.length))[0];if(!victim)continue;
    o.hitIds.push(victim.id);o.until=t;victim.received++;victim.stunUntil=t+.36;victim.respawnUntil=t+.55;victim.invincibleUntil=t+1.15;Object.assign(victim,courtSpawn(victim,w.players.length));const thrower=w.players.find(p=>p.id===o.ownerId);if(thrower)thrower.hits++;w.meta.notice=(thrower?.name||'누군가')+' 님 명중! '+victim.name+' 님은 바로 복귀해요.';
   }
   w.objects=w.objects.filter(o=>o.until>t);for(const p of w.players)p.score=p.hits*100-p.received*18;
  },
  bot(w,p){const target=w.players.filter(q=>q!==p&&active(q)&&w.elapsed>=q.respawnUntil).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];if(!target)return{held:[]};const dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy),keys=pointTo(dx,dy),aligned=(dx*p.faceX+dy*p.faceY)/(d||1)>.78;return{held:d>125?keys:Math.floor(w.elapsed*2+p.index)%3===0?pointTo(-dy,dx):keys,...d<380&&aligned&&w.elapsed>=p.throwReadyAt?{action:'hit'}:{}};}
 };
 const crown={
  init(w){w.duration=26;w.objects=[{id:'the-crown',kind:'crown',x:350,y:230}];w.meta={ownerId:'',protectionUntil:0,notice:'왕관을 잡고 버텨! Space 돌진으로 빼앗고, 모서리에는 오래 숨지 마!'};w.players.forEach((p,i)=>{base(p);const a=-Math.PI/2+i*tau/w.players.length;Object.assign(p,{x:350+Math.cos(a)*180,y:230+Math.sin(a)*120,dx:-Math.cos(a),dy:-Math.sin(a),dashUntil:0,dashReadyAt:0,heldSeconds:0,steals:0,cornerTime:0});});},
  input(w,p,action){if(action!=='dash'||!active(p)||w.elapsed<p.dashReadyAt||w.elapsed<p.stunUntil)return false;p.dashUntil=w.elapsed+.16;p.dashReadyAt=w.elapsed+2.25;p.actionUntil=p.dashUntil;return true;},
  step(w,dt,controls){
   const t=w.elapsed,m=w.meta,o=w.objects[0];let owner=w.players.find(p=>p.id===m.ownerId&&active(p));if(!owner){m.ownerId='';owner=null;}
   for(const p of w.players){if(!active(p)||t<p.stunUntil)continue;const d=axes(held(controls,p));if(d.x||d.y){p.dx=d.x;p.dy=d.y;}const dash=t<p.dashUntil,speed=dash?395:p.id===m.ownerId?140:175;p.x=clamp(p.x+(dash?p.dx:d.x)*speed*dt,55,645);p.y=clamp(p.y+(dash?p.dy:d.y)*speed*dt,75,405);}
   if(owner){
    const challenger=w.players.filter(p=>p!==owner&&active(p)&&t>=p.stunUntil&&t<p.dashUntil&&t>=m.protectionUntil&&Math.hypot(p.x-owner.x,p.y-owner.y)<48).sort((a,b)=>Math.hypot(a.x-owner.x,a.y-owner.y)-Math.hypot(b.x-owner.x,b.y-owner.y)||((a.index+Math.floor(t*20))%w.players.length)-((b.index+Math.floor(t*20))%w.players.length))[0];
    if(challenger){m.ownerId=challenger.id;m.protectionUntil=t+.85;challenger.steals++;challenger.cornerTime=0;owner.stunUntil=t+.16;owner=challenger;m.notice=owner.name+' 님 왕관 낚아채기! 잠깐의 보호 시간!';}
   }else{const pickup=w.players.filter(p=>active(p)&&t>=p.stunUntil&&Math.hypot(p.x-o.x,p.y-o.y)<29).sort((a,b)=>Math.hypot(a.x-o.x,a.y-o.y)-Math.hypot(b.x-o.x,b.y-o.y)||((a.index+Math.floor(t*20))%w.players.length)-((b.index+Math.floor(t*20))%w.players.length))[0];if(pickup){owner=pickup;m.ownerId=pickup.id;m.protectionUntil=t+.85;m.notice=pickup.name+' 님 왕관 획득!';}}
   if(owner){
    const corner=(owner.x<120||owner.x>580)&&(owner.y<125||owner.y>345);owner.cornerTime=corner?owner.cornerTime+dt:Math.max(0,owner.cornerTime-dt*2);
    if(owner.cornerTime>=1.1){m.notice=owner.name+' 님, 모서리 캠핑 금지! 왕관이 중앙으로 돌아와요.';owner.cornerTime=0;m.ownerId='';owner=null;m.protectionUntil=t+.35;o.x=350;o.y=230;}
    else{owner.heldSeconds+=dt;o.x=owner.x;o.y=owner.y-29;}
   }
   for(const p of w.players)p.score=Math.floor(p.heldSeconds*100)+p.steals*8;
  },
  bot(w,p){if(w.meta.ownerId===p.id){const a=w.elapsed*.72+p.index;return{held:pointTo(350+Math.cos(a)*90-p.x,230+Math.sin(a)*65-p.y)};}const owner=w.players.find(q=>q.id===w.meta.ownerId),target=owner||w.objects[0],dx=target.x-p.x,dy=(owner?target.y:target.y)-p.y,d=Math.hypot(dx,dy);return{held:pointTo(dx,dy),...owner&&d<135&&w.elapsed>=p.dashReadyAt?{action:'dash'}:{}};}
 };
 function laserDistance(o,p){return Math.abs((p.x-o.x)*Math.sin(o.angle)-(p.y-o.y)*Math.cos(o.angle));}
 function laserSpawn(w,p){let best={x:100,y:100},bestSafety=-1;for(const v of [{x:90,y:95},{x:610,y:95},{x:90,y:390},{x:610,y:390},{x:190,y:145},{x:510,y:330}]){const safety=Math.min(...w.objects.filter(o=>o.activeAt<=w.elapsed&&o.endAt>w.elapsed).map(o=>laserDistance(o,v)),500);if(safety>bestSafety){bestSafety=safety;best=v;}}p.x=best.x;p.y=best.y;}
 const lasers={
  init(w){w.duration=26;w.objects=[];w.meta={serial:0,nextPatternAt:.8,patternIndex:0,notice:'점선은 예고, 빨간 선은 위험! Space 짧은 대시로 빠져나와요.'};w.players.forEach((p,i)=>{base(p);const a=-Math.PI/2+i*tau/w.players.length;Object.assign(p,{x:350+Math.cos(a)*135,y:230+Math.sin(a)*100,dx:0,dy:-1,dashUntil:0,dashReadyAt:0,dodgeUntil:0,received:0,nearMisses:0});});},
  input(w,p,action){if(action!=='dash'||!active(p)||w.elapsed<p.dashReadyAt||w.elapsed<p.stunUntil)return false;p.dashUntil=w.elapsed+.14;p.dashReadyAt=w.elapsed+1.65;p.dodgeUntil=w.elapsed+.24;p.actionUntil=p.dashUntil;return true;},
  step(w,dt,controls,random){
   const t=w.elapsed,m=w.meta;
   if(t>=m.nextPatternAt){const index=m.patternIndex++,mode=index%3===1?'sweep':'rotate',base=random()*Math.PI,axesCount=index%3===2?2:1;for(let i=0;i<axesCount;i++)w.objects.push({id:'laser_'+(++m.serial),kind:'laser',mode,x:350,y:230,angle:mode==='sweep'?Math.PI/2:base+i*Math.PI/2,baseAngle:base+i*Math.PI/2,spin:index%2?.58:-.58,bornAt:t,activeAt:t+.85,endAt:t+3.35,hitIds:[],nearIds:[]});m.nextPatternAt=t+3.25;m.notice=mode==='sweep'?'가로질러 오는 레이저! 틈을 보고 대시!':axesCount===2?'십자 회전! 두 줄 사이로 움직여요!':'회전 레이저! 선을 따라 뛰지 마!';}
   for(const o of w.objects){if(o.mode==='sweep'){o.x=65+clamp((t-o.activeAt)/2.5,0,1)*570;o.y=230;}else{o.angle=o.baseAngle+Math.max(0,t-o.activeAt)*o.spin;o.x=350;o.y=230;}}
   for(const p of w.players){if(!active(p)||t<p.respawnUntil)continue;const d=axes(held(controls,p));if(d.x||d.y){p.dx=d.x;p.dy=d.y;}if(t>=p.stunUntil){const dash=t<p.dashUntil,speed=dash?415:185;p.x=clamp(p.x+(dash?p.dx:d.x)*speed*dt,35,665);p.y=clamp(p.y+(dash?p.dy:d.y)*speed*dt,68,420);}}
   for(const o of w.objects){if(t<o.activeAt||t>=o.endAt)continue;for(const p of w.players){if(!active(p)||t<p.respawnUntil)continue;const distance=laserDistance(o,p);if(distance<23&&t>=p.invincibleUntil&&t>=p.dodgeUntil&&!o.hitIds.includes(p.id)){o.hitIds.push(p.id);p.received++;p.stunUntil=t+.3;p.respawnUntil=t+.45;p.invincibleUntil=t+1.05;laserSpawn(w,p);m.notice=p.name+' 님 레이저 터치! 잠깐 쉬고 다시 도전!';}else if(distance>=24&&distance<45&&!o.nearIds.includes(p.id)){o.nearIds.push(p.id);p.nearMisses++;}}}
   w.objects=w.objects.filter(o=>o.endAt>t);for(const p of w.players)p.score=Math.max(0,Math.round(t*20)-p.received*65+p.nearMisses*10);
  },
  bot(w,p){let dx=(350-p.x)*.08,dy=(230-p.y)*.08,urgent=false;for(const o of w.objects){if(w.elapsed<o.activeAt-.25)continue;const side=(p.x-o.x)*Math.sin(o.angle)-(p.y-o.y)*Math.cos(o.angle),distance=Math.abs(side);if(distance<85){const sign=side>=0?1:-1;dx+=Math.sin(o.angle)*sign*(95-distance);dy-=Math.cos(o.angle)*sign*(95-distance);if(distance<29&&w.elapsed>=o.activeAt)urgent=true;}}return{held:pointTo(dx,dy),...urgent&&w.elapsed>=p.dashReadyAt?{action:'dash'}:{}};}
 };
 return{dodgeball,crown,lasers,...createArcadeTransitRules()};
}
/* END_ARCADE_ACTION_PACK_RULES_V1 */

/* TRANSIT ACTION PACK RULES
 frogger: player col,row,goalRow,deliveries,crashes,leapUntil; objects kind=trafficCar with x,y,width,height,vx; meta grid geometry.
 bridge: player laneX,carried,bridgeSteps,finishedAt,collected; objects kind=bridgeWood with active,readyAt,ownerId; meta bridgeGoal/firstFinishAt.
 claw: player hookX,hookY,hookState,hookPrizeId,hookReadyAt,catches; shared kind=clawPrize objects have active,ownerId,mass,value,baseX,baseY,amplitude,speed,phase.
 */
function createArcadeTransitRules(){
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),active=p=>!p.eliminated&&!p.forfeited;
 const keys=(controls,p)=>controls.get(p.id)?.held||new Set();
 const axes=k=>{const x=Number(k.has('right'))-Number(k.has('left')),y=Number(k.has('down'))-Number(k.has('up')),d=Math.hypot(x,y)||1;return{x:x/d,y:y/d};};
 const guide=(dx,dy)=>{const held=[];if(dx>8)held.push('right');if(dx< -8)held.push('left');if(dy>8)held.push('down');if(dy< -8)held.push('up');return held;};
 function frogPosition(p){p.x=50+p.col*50;p.y=430-p.row*42;}
 function frogHop(w,p,dx,dy,length=1){
  const col=clamp(p.col+dx*length,0,12),row=clamp(p.row+dy*length,0,9);if(col===p.col&&row===p.row)return false;
  if(!w.meta.safeRows.includes(row)&&w.players.some(q=>q!==p&&active(q)&&q.col===col&&q.row===row))return false;
  p.col=col;p.row=row;p.faceCol=dx;p.faceRow=dy;frogPosition(p);p.moveReadyAt=w.elapsed+.17;p.actionUntil=w.elapsed+.15;
  if(p.row===p.goalRow){p.deliveries++;p.goalRow=p.goalRow===9?0:9;p.lastResult='배송 완료! 반대편으로 한 번 더';p.resultUntil=w.elapsed+.8;w.meta.notice=p.name+' 님 배송 성공!';}
  return true;
 }
 function frogScore(p){const progress=p.goalRow===9?p.row:9-p.row;p.score=Math.max(0,p.deliveries*20-p.crashes*2)+progress/100;}
 const frogger={
  init(w,random){
   w.duration=26;w.meta={gridX:50,gridBottom:430,tileW:50,tileH:42,cols:13,rows:10,safeRows:[0,4,9],notice:'차 사이로 위아래 한 칸씩! 끝까지 배송하고 돌아오면 또 득점. Space로 두 칸 도약!'};w.objects=[];
   for(const row of [1,2,3,5,6,7,8]){const dir=row%2?1:-1,speed=(70+random()*55)*dir,width=48+random()*32;for(let i=0;i<2;i++)w.objects.push({id:'traffic_'+row+'_'+i,kind:'trafficCar',row,x:70+i*360+random()*45,y:430-row*42,width,height:28,vx:speed,emoji:['🚕','🚚','🚌'][Math.floor(random()*3)]});}
   w.players.forEach((p,i)=>{Object.assign(p,{col:Math.round((i+1)*12/(w.players.length+1)),row:0,goalRow:9,deliveries:0,crashes:0,faceCol:0,faceRow:1,moveReadyAt:0,leapReadyAt:0,leapUntil:0,invulnUntil:0,lastResult:'',resultUntil:0,health:3,score:0,eliminated:false});frogPosition(p);});
  },
  input(w,p,action){if(action!=='dash'||!active(p)||w.elapsed<p.leapReadyAt||w.elapsed<p.stunUntil)return false;const dx=p.faceCol||0,dy=p.faceRow||(dx?0:1);if(!frogHop(w,p,dx,dy,2))return false;p.leapReadyAt=w.elapsed+1.25;p.leapUntil=w.elapsed+.2;p.actionUntil=p.leapUntil;frogScore(p);return true;},
  step(w,dt,controls){
   for(const car of w.objects){car.x+=car.vx*dt;if(car.x>790)car.x=-90;if(car.x< -90)car.x=790;}
   for(const p of w.players){if(!active(p))continue;const held=keys(controls,p);if(w.elapsed>=p.stunUntil&&w.elapsed>=p.moveReadyAt){let dx=0,dy=0;if(held.has('up'))dy=1;else if(held.has('down'))dy=-1;else if(held.has('left'))dx=-1;else if(held.has('right'))dx=1;if(dx||dy){p.faceCol=dx;p.faceRow=dy;frogHop(w,p,dx,dy);}}
    if(w.elapsed>=p.invulnUntil&&w.elapsed>=p.leapUntil){const car=w.objects.find(o=>o.row===p.row&&Math.abs(o.x-p.x)<o.width/2+12&&Math.abs(o.y-p.y)<24);if(car){p.crashes++;p.row=p.goalRow===9?0:9;p.moveReadyAt=w.elapsed+.6;p.stunUntil=w.elapsed+.55;p.invulnUntil=w.elapsed+1;p.leapUntil=0;p.lastResult='꽝! 잠깐 쉬고 다시 배송';p.resultUntil=w.elapsed+.8;frogPosition(p);w.meta.notice=p.name+' 님 교통사고! 배송은 다시 출발해요.';}}
    frogScore(p);
   }
  },
  bot(w,p){
   if(w.elapsed<p.stunUntil)return{held:[]};const dir=p.goalRow>p.row?1:-1,nextRow=p.row+dir,next2=clamp(p.row+dir*2,0,9),blocked=(row,col)=>w.objects.some(o=>o.row===row&&Math.abs(o.x+o.vx*.22-(50+col*50))<o.width/2+19);
   const occupied=w.players.some(q=>q!==p&&active(q)&&q.col===p.col&&q.row===nextRow);
   if(!blocked(nextRow,p.col)&&!occupied)return{held:[dir>0?'up':'down']};
   if(!blocked(next2,p.col)&&w.elapsed>=p.leapReadyAt&&p.faceRow===dir&&!w.players.some(q=>q!==p&&active(q)&&q.col===p.col&&q.row===next2))return{held:[],action:'dash'};
   for(const side of p.index%2?[1,-1]:[-1,1])if(p.col+side>=0&&p.col+side<=12&&!blocked(p.row,p.col+side)&&!w.players.some(q=>q!==p&&active(q)&&q.col===p.col+side&&q.row===p.row))return{held:[side>0?'right':'left']};
   return{held:[]};
  }
 };
 function woodPosition(o,random){o.x=38+random()*624;o.y=340+random()*80;o.active=true;o.ownerId='';}
 const bridge={
  init(w,random){
   w.duration=28;w.meta={bridgeGoal:16,entryY:258,finishY:64,firstFinishAt:-1,notice:'나무는 세 개까지만! 내 색 다리 입구에서 Space로 놓아 길을 이어요.'};w.objects=[];
   for(let i=0;i<13;i++){const o={id:'wood_'+i,kind:'bridgeWood',x:0,y:0,active:true,readyAt:0,ownerId:'',generation:0};woodPosition(o,random);w.objects.push(o);}
   w.players.forEach((p,i)=>{p.laneX=(i+.5)*700/w.players.length;p.x=p.laneX;p.y=400;p.carried=0;p.bridgeSteps=0;p.finishedAt=-1;p.buildReadyAt=0;p.collected=0;p.health=3;p.score=0;p.lastResult='';p.resultUntil=0;p.eliminated=false;});
  },
  input(w,p,action){
   if(action!=='hit'||!active(p)||p.finishedAt>=0||w.elapsed<p.buildReadyAt||p.carried<1||p.y>286||Math.abs(p.x-p.laneX)>Math.min(36,700/w.players.length*.43))return false;
   p.carried--;p.bridgeSteps++;p.buildReadyAt=w.elapsed+.28;p.actionUntil=w.elapsed+.23;p.lastResult='+1 다리!';p.resultUntil=w.elapsed+.55;
   if(p.bridgeSteps>=w.meta.bridgeGoal){p.bridgeSteps=w.meta.bridgeGoal;p.finishedAt=w.elapsed;p.x=p.laneX;p.y=w.meta.finishY;p.lastResult='다리 완성! 건너편 도착';p.resultUntil=w.elapsed+3;if(w.meta.firstFinishAt<0)w.meta.firstFinishAt=w.elapsed;w.meta.notice=p.name+' 님 다리 완성! 남은 친구들도 서둘러요.';}
   p.score=p.finishedAt>=0?w.meta.bridgeGoal*8+Math.max(0,w.duration-p.finishedAt)*2:p.bridgeSteps*8+p.carried*.01;return true;
  },
  step(w,dt,controls,random){
   for(const p of w.players){if(!active(p)||p.finishedAt>=0)continue;const d=axes(keys(controls,p));p.x=clamp(p.x+d.x*188*dt,22,678);p.y=clamp(p.y+d.y*188*dt,254,432);}
   for(const o of w.objects){if(!o.active&&w.elapsed>=o.readyAt)woodPosition(o,random);if(!o.active)continue;
    const pick=w.players.filter(p=>active(p)&&p.finishedAt<0&&p.carried<3&&Math.hypot(p.x-o.x,p.y-o.y)<25).sort((a,b)=>Math.hypot(a.x-o.x,a.y-o.y)-Math.hypot(b.x-o.x,b.y-o.y)||a.index-b.index)[0];
    if(pick){o.active=false;o.ownerId=pick.id;o.readyAt=w.elapsed+1.15;o.generation++;pick.carried++;pick.collected++;pick.actionUntil=w.elapsed+.13;}
   }
   for(const p of w.players)if(active(p))p.score=p.finishedAt>=0?w.meta.bridgeGoal*8+Math.max(0,w.duration-p.finishedAt)*2:p.bridgeSteps*8+p.carried*.01;
   const racers=w.players.filter(active);if(w.elapsed>=20&&(racers.length&&racers.every(p=>p.finishedAt>=0)||w.meta.firstFinishAt>=0&&w.elapsed-w.meta.firstFinishAt>=3))w.meta.roundOver=true;
  },
  bot(w,p){
   if(p.finishedAt>=0)return{held:[]};const need=Math.min(3,w.meta.bridgeGoal-p.bridgeSteps);
   if(p.carried>=need||p.carried>0&&p.y<290){const dx=p.laneX-p.x,dy=260-p.y;return{held:guide(dx,dy),...(p.y<=284&&Math.abs(dx)<=Math.min(34,700/w.players.length*.41)&&w.elapsed>=p.buildReadyAt?{action:'hit'}:{})};}
   const target=w.objects.filter(o=>o.active).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];return{held:target?guide(target.x-p.x,target.y-p.y):guide(p.laneX-p.x,350-p.y)};
  }
 };
 function prizeAt(o,t){return{x:clamp(o.baseX+Math.sin(t*o.speed+o.phase)*o.amplitude,34,666),y:o.baseY+Math.sin(t*o.speed*.6+o.phase)*11};}
 const claw={
  init(w,random){
   w.duration=26;w.meta={hookTop:86,hookBottom:382,serial:0,notice:'←/→로 집게를 맞추고 Space! 무거운 상품은 비싸지만 끌어올리는 데 오래 걸려요.'};w.objects=[];
   for(let i=0;i<14;i++){const mass=1+Math.floor(random()*3),o={id:'prize_'+i,kind:'clawPrize',baseX:50+random()*600,baseY:176+random()*158,amplitude:15+random()*30,speed:.65+random()*.8,phase:random()*Math.PI*2,mass,value:mass===1?5:mass===2?9:14,emoji:mass===1?'🍬':mass===2?'🍱':'🧸',x:0,y:0,active:true,ownerId:'',readyAt:0,generation:0};Object.assign(o,prizeAt(o,0));w.objects.push(o);}
   w.players.forEach((p,i)=>{p.x=50+(i+.5)*600/w.players.length;p.y=80;p.hookX=p.x;p.hookY=86;p.hookState='idle';p.hookPrizeId='';p.hookReadyAt=0;p.catches=0;p.attempts=0;p.health=3;p.score=0;p.lastResult='';p.resultUntil=0;p.eliminated=false;});
  },
  input(w,p,action){if(action!=='hit'||!active(p)||w.elapsed<p.hookReadyAt)return false;if(p.hookState==='down'){p.hookState='up';p.lastResult='빈 집게 조기 회수!';p.resultUntil=w.elapsed+.65;return true;}if(p.hookState!=='idle')return false;p.hookState='down';p.hookY=w.meta.hookTop;p.hookX=p.x;p.hookPrizeId='';p.attempts++;p.actionUntil=w.elapsed+.2;return true;},
  step(w,dt,controls){
   const t=w.elapsed;
   for(const o of w.objects){if(o.ownerId&&!w.players.some(p=>p.id===o.ownerId&&active(p))){o.ownerId='';o.active=false;o.readyAt=t+.45;}
    if(!o.active&&!o.ownerId&&t>=o.readyAt){o.active=true;o.generation++;}
    if(o.active)Object.assign(o,prizeAt(o,t));
   }
   for(const p of w.players){if(!active(p))continue;
    if(p.hookState==='idle'){const held=keys(controls,p),dx=Number(held.has('right'))-Number(held.has('left'));p.x=clamp(p.x+dx*178*dt,30,670);p.hookX=p.x;p.hookY=w.meta.hookTop;continue;}
    const oldY=p.hookY;if(p.hookState==='down'){const held=keys(controls,p);p.x=clamp(p.x+(Number(held.has('right'))-Number(held.has('left')))*72*dt,30,670);}p.hookX=clamp(p.x+Math.sin(t*3+p.index*.6)*9,27,673);
    if(p.hookState==='down'){
     p.hookY=Math.min(w.meta.hookBottom,p.hookY+238*dt);
     const caught=w.objects.filter(o=>o.active&&!o.ownerId&&Math.abs(o.x-p.hookX)<25&&o.y>=oldY-15&&o.y<=p.hookY+15).sort((a,b)=>a.y-b.y||Math.abs(a.x-p.hookX)-Math.abs(b.x-p.hookX))[0];
     if(caught){caught.active=false;caught.ownerId=p.id;p.hookPrizeId=caught.id;p.hookState='up';p.lastResult='잡았다! '+caught.value+'점 상품';p.resultUntil=t+.8;}
     else if(p.hookY>=w.meta.hookBottom)p.hookState='up';
    }else{
     const prize=w.objects.find(o=>o.id===p.hookPrizeId&&o.ownerId===p.id),speed=prize?prize.mass===1?218:prize.mass===2?156:116:275;p.hookY=Math.max(w.meta.hookTop,p.hookY-speed*dt);
     if(p.hookY<=w.meta.hookTop){if(prize){p.score+=prize.value;p.catches++;p.lastResult='획득! +'+prize.value;prize.ownerId='';prize.active=false;prize.readyAt=t+1;w.meta.notice=p.name+' 님 '+prize.emoji+' 획득!';}else p.lastResult='헛손질! 다시 조준';p.resultUntil=t+.9;p.hookState='idle';p.hookPrizeId='';p.hookReadyAt=t+.4;}
    }
    const heldPrize=w.objects.find(o=>o.id===p.hookPrizeId&&o.ownerId===p.id);if(heldPrize){heldPrize.x=p.hookX;heldPrize.y=p.hookY+13;}
   }
  },
  bot(w,p){
   if(p.hookState!=='idle')return{held:[]};
   const target=w.objects.filter(o=>o.active&&!o.ownerId).map(o=>{const future=w.elapsed+(o.y-w.meta.hookTop)/238,position=prizeAt(o,future);return{o,x:position.x,cost:Math.abs(position.x-p.x)/178+o.mass*.16};}).sort((a,b)=>a.cost-b.cost)[0];if(!target)return{held:[]};const dx=target.x-p.x;return{held:dx>7?['right']:dx< -7?['left']:[],...(Math.abs(dx)<15&&w.elapsed>=p.hookReadyAt?{action:'hit'}:{})};
  }
 };
 return{frogger,bridge,claw};
}

/* ARCADE_BRAIN_PACK_RULES_V1 */
function createArcadeBrainPackRules(){
 const privateGames=new WeakMap(),actions=['hit','jump','dash'];
 const alive=p=>!p.eliminated&&!p.forfeited,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const keys=(controls,id)=>controls.get(id)?.held||new Set();
 function feedback(w,p,text){p.feedback=text;p.feedbackUntil=w.elapsed+.85;p.actionUntil=w.elapsed+.2;}
 function players(w){for(const p of w.players){p.x=75+p.index*550/Math.max(1,w.players.length-1);p.y=395;p.score=0;p.health=3;p.locked=false;p.choiceLocked=false;p.nextInputAt=0;p.feedback='';p.feedbackUntil=0;p.roundPoints=0;}}
 function align(w,s,length,total,begin,resolve){const stage=Math.min(total-1,Math.floor((w.elapsed+1e-8)/length));while(s.stage<stage){if(resolve)resolve(w,s);s.stage++;begin(w,s);}const local=Math.max(0,w.elapsed-s.stage*length);w.meta.stage=s.stage;w.meta.stageLeft=clamp(length-local,0,length);return local;}
 function choice(w,p,action){const lane=actions.indexOf(action);return alive(p)&&lane>=0&&w.elapsed+1e-8>=p.nextInputAt?lane:-1;}
 function setReady(w,p,gap=.13){p.nextInputAt=w.elapsed+gap;}
 function memoryBegin(w,s){s.pattern=Array.from({length:2+Math.floor(s.stage/2)},()=>Math.floor(s.random()*3));w.meta.patternLength=s.pattern.length;w.meta.showLength=s.pattern.length*.48+.18;w.meta.phase='watch';w.meta.flashLane=-1;for(const p of w.players){p.memoryIndex=0;p.memoryBest=0;p.memoryRetryUsed=false;p.locked=false;p.choiceLocked=false;p.roundPoints=0;}}
 function memoryUpdate(w,s){const local=align(w,s,4.5,6,memoryBegin);w.meta.phase=local<w.meta.showLength?'watch':local<4.2?'repeat':'reveal';const tick=Math.floor(local/.48);w.meta.flashLane=w.meta.phase==='watch'&&tick<s.pattern.length&&local%.48<.36?s.pattern[tick]:-1;for(const p of w.players)p.choiceLocked=p.locked||w.meta.phase!=='repeat';w.meta.notice=w.meta.phase==='watch'?'불빛 순서를 기억해! 아직 누르지 말고.':w.meta.phase==='repeat'?'방금 본 순서대로 A / W / D! 한 번은 다시 도전할 수 있어요.':'다음 기억을 준비해요.';return local;}
 const memory={
  init(w,random){w.duration=27;w.objects=[];players(w);w.meta={stage:0,stageLeft:4.5,phase:'watch',patternLength:2,showLength:1.14,flashLane:-1,choiceLabels:['◀ 왼쪽','● 가운데','▶ 오른쪽'],notice:''};const s={stage:0,pattern:[],random};privateGames.set(w,s);memoryBegin(w,s);memoryUpdate(w,s);},
  input(w,p,action){const s=privateGames.get(w);if(!s)return false;memoryUpdate(w,s);const lane=choice(w,p,action);if(lane<0||p.locked||w.meta.phase!=='repeat')return false;setReady(w,p);if(lane!==s.pattern[p.memoryIndex]){p.score=Math.max(0,p.score-12);p.roundPoints-=12;if(!p.memoryRetryUsed){p.memoryRetryUsed=true;p.memoryIndex=0;setReady(w,p,.32);feedback(w,p,'한 번 더! 처음 불빛부터 다시 눌러요.');}else{p.locked=true;p.choiceLocked=true;feedback(w,p,'다음 문제에서 다시 도전!');}return false;}p.memoryIndex++;if(p.memoryIndex>p.memoryBest){p.memoryBest=p.memoryIndex;p.score+=12;p.roundPoints+=12;}if(p.memoryIndex===s.pattern.length){const bonus=40+s.stage*10;p.score+=bonus;p.roundPoints+=bonus;p.locked=true;p.choiceLocked=true;feedback(w,p,'순서 재현! +'+p.roundPoints);}else feedback(w,p,p.memoryIndex+'/'+s.pattern.length+' 기억 성공');return true;},
  step(w){const s=privateGames.get(w);if(s)memoryUpdate(w,s);},
  bot(w,p,random){const s=privateGames.get(w);if(!s||p.locked||w.meta.phase!=='repeat'||w.elapsed<p.nextInputAt||random()>.8)return{held:[]};return{held:[],action:actions[s.pattern[p.memoryIndex]]};}
 };
 const docNames=['행정 서류','회계 전표','학생 신청서'],docIcons=['📁','🧾','🎓'];
 function sorterBegin(w,s){s.type=Math.floor(s.random()*3);s.shift=Math.floor(s.stage/4)%2;w.meta.docType=s.type;w.meta.docIcon=docIcons[s.type];w.meta.docName=docNames[s.type];w.meta.ruleShift=s.shift;w.meta.rule=s.shift?'특별 규칙 · 원래 함보다 한 칸 오른쪽!':'기본 규칙 · 서류와 같은 그림 함!';for(const p of w.players){p.locked=false;p.choiceLocked=false;p.roundPoints=0;}}
 function sorterUpdate(w,s){const local=align(w,s,1.7,16,sorterBegin),preview=s.stage>0&&s.stage%4===0&&local<.36;w.meta.ruleChanged=s.stage>0&&s.stage%4===0;w.meta.phase=preview?'watch':local<1.45?'choose':'reveal';w.meta.belt=local/1.7;for(const p of w.players)p.choiceLocked=p.locked||w.meta.phase!=='choose';w.meta.notice=preview?'규칙 변경! 새 분류 방법을 먼저 확인해요.':w.meta.rule;return local;}
 const sorter={
  init(w,random){w.duration=27.2;w.objects=[];players(w);w.meta={stage:0,stageLeft:1.7,phase:'choose',docType:0,docIcon:'📁',docName:'행정 서류',ruleShift:0,rule:'',belt:0,choiceLabels:['📁 행정함','🧾 회계함','🎓 학생함'],notice:''};const s={stage:0,type:0,shift:0,random};privateGames.set(w,s);sorterBegin(w,s);sorterUpdate(w,s);},
  input(w,p,action){const s=privateGames.get(w);if(!s)return false;const local=sorterUpdate(w,s),lane=choice(w,p,action);if(lane<0||p.locked||w.meta.phase!=='choose')return false;p.locked=true;p.choiceLocked=true;setReady(w,p);const start=w.meta.ruleChanged ? .36 : 0,correct=lane===(s.type+s.shift)%3,points=correct?50+Math.round(20*(1-(local-start)/(1.45-start))):-12;p.score=Math.max(0,p.score+points);p.roundPoints=points;feedback(w,p,correct?'분류 완료! +'+points:'함이 달라! 특별 규칙도 확인해.');return correct;},
  step(w){const s=privateGames.get(w);if(s)sorterUpdate(w,s);},
  bot(w,p,random){const s=privateGames.get(w);return s&&!p.locked&&w.meta.phase==='choose'&&w.elapsed-s.stage*1.7>.32+p.index*.015&&random()<.8?{held:[],action:actions[(s.type+s.shift)%3]}:{held:[]};}
 };
 function receiptBegin(w,s){const count=s.stage<2?2:3,max=s.stage<2?5:s.stage<4?9:15,numbers=Array.from({length:count},()=>1+Math.floor(s.random()*max)),total=numbers.reduce((a,b)=>a+b,0),options=[total,total+1+Math.floor(s.random()*4),Math.max(1,total-1-Math.floor(s.random()*3))];for(let i=2;i>0;i--){const j=Math.floor(s.random()*(i+1));[options[i],options[j]]=[options[j],options[i]];}s.answer=options.indexOf(total);s.total=total;w.meta.numbers=numbers;w.meta.choiceLabels=options.map(n=>n+'원');w.meta.answer=-1;for(const p of w.players){if(s.stage>0&&!p.locked)p.receiptStreak=0;p.locked=false;p.choiceLocked=false;p.roundPoints=0;}}
 function receiptUpdate(w,s){const local=align(w,s,4,6,receiptBegin);w.meta.phase=local<3.3?'choose':'reveal';w.meta.answer=w.meta.phase==='reveal'?s.total:-1;w.meta.notice=w.meta.phase==='choose'?'영수증 금액을 더해서 합계를 골라요. 계산기는 마음속에!':'정답은 '+s.total+'원! 다음 영수증이 나와요.';return local;}
 const receipt={
  init(w,random){w.duration=24;w.objects=[];players(w);for(const p of w.players)p.receiptStreak=0;w.meta={stage:0,stageLeft:4,phase:'choose',numbers:[],choiceLabels:[],answer:-1,notice:''};const s={stage:0,answer:0,total:0,random};privateGames.set(w,s);receiptBegin(w,s);receiptUpdate(w,s);},
  input(w,p,action){const s=privateGames.get(w);if(!s)return false;const local=receiptUpdate(w,s),lane=choice(w,p,action);if(lane<0||p.locked||w.meta.phase!=='choose')return false;p.locked=true;p.choiceLocked=true;setReady(w,p);const correct=lane===s.answer;p.receiptStreak=correct?p.receiptStreak+1:0;const bonus=correct?Math.min(3,p.receiptStreak-1)*10:0,points=correct?70+Math.round(30*(1-local/3.3))+bonus:-15;p.score=Math.max(0,p.score+points);p.roundPoints=points;feedback(w,p,correct?'정산 일치! +'+points+(bonus?' · 연속 정답 +'+bonus:''):'한 번 더 더해볼걸…');return correct;},
  step(w){const s=privateGames.get(w);if(s)receiptUpdate(w,s);},
  bot(w,p,random){const s=privateGames.get(w);return s&&!p.locked&&w.meta.phase==='choose'&&w.elapsed-s.stage*4>.65+p.index*.035&&random()<.65?{held:[],action:actions[s.answer]}:{held:[]};}
 };
 function safeBegin(w,s){s.pin=Array.from({length:3},()=>Math.floor(s.random()*10));for(const p of w.players){p.dialFloat=0;p.dial=0;p.dialDirection=0;p.dialRepeatAt=0;p.safeProgress=0;p.safeMistakes=0;p.safePenaltyPaid=0;p.entered=[];p.locked=false;p.choiceLocked=false;p.roundPoints=0;}}
 function safeUpdate(w,s){const local=align(w,s,8,3,safeBegin);w.meta.phase=local<1.35?'watch':'unlock';w.meta.pinDisplay=w.meta.phase==='watch'?s.pin.join(' '):'● ● ●';w.meta.notice=w.meta.phase==='watch'?'금고 비밀번호 세 자리를 기억해요!':'←/→로 숫자를 맞추고 Space로 한 자리씩 확정!';return local;}
 const safe={
  init(w,random){w.duration=24;w.objects=[];players(w);w.meta={stage:0,stageLeft:8,phase:'watch',pinDisplay:'',notice:''};const s={stage:0,pin:[],random};privateGames.set(w,s);safeBegin(w,s);safeUpdate(w,s);},
  input(w,p,action){const s=privateGames.get(w);if(!s)return false;const local=safeUpdate(w,s);if(!['hit','dash','jump'].includes(action)||!alive(p)||p.locked||w.meta.phase!=='unlock'||w.elapsed<p.nextInputAt)return false;setReady(w,p,.24);const digit=p.dial;p.dialFloat=digit;if(digit!==s.pin[p.safeProgress]){p.safeMistakes++;const before=p.score;p.score=Math.max(0,p.score-8);p.safePenaltyPaid+=before-p.score;setReady(w,p,.42);feedback(w,p,'이 자리가 달라요! 맞힌 숫자는 유지돼요.');return false;}p.entered.push(true);p.safeProgress++;if(p.safeProgress===3){const unpaid=Math.max(0,p.safeMistakes*8-p.safePenaltyPaid),points=Math.max(0,180+Math.round((8-local)*10)-unpaid);p.score+=points;p.roundPoints=points;p.locked=true;p.choiceLocked=true;feedback(w,p,'찰칵! 금고 열림 +'+points);}else feedback(w,p,p.safeProgress+'번째 숫자 통과');return true;},
  step(w,dt,controls){const s=privateGames.get(w);if(!s)return;safeUpdate(w,s);for(const p of w.players){if(!alive(p)||p.locked||w.meta.phase!=='unlock'){p.dialDirection=0;continue;}const held=keys(controls,p.id),d=Number(held.has('right'))-Number(held.has('left'));if(d&&(d!==p.dialDirection||w.elapsed+1e-8>=p.dialRepeatAt)){p.dial=(p.dial+d+10)%10;p.dialFloat=p.dial;p.dialRepeatAt=w.elapsed+(d!==p.dialDirection ? .28 : .16);}p.dialDirection=d;}},
  bot(w,p,random){const s=privateGames.get(w);if(!s||p.locked||w.meta.phase!=='unlock')return{held:[]};const target=s.pin[p.safeProgress],delta=(target-p.dial+10)%10;if(delta===0)return{held:[],...(w.elapsed>=p.nextInputAt&&random()<.9?{action:'hit'}:{})};return{held:delta>5?['left']:['right']};}
 };
 function auctionBegin(w,s){s.choices.clear();s.resolved=false;w.meta.prize=3+Math.floor(s.random()*5);w.meta.phase='choose';w.meta.winnerId='';w.meta.choiceLabels=['0 · 불참','1 · 한 장','3 · 세 장'];for(const p of w.players){p.bid=-1;p.locked=false;p.choiceLocked=false;p.roundPoints=0;}}
 function auctionResolve(w,s){if(s.resolved)return;s.resolved=true;w.meta.phase='reveal';const chosen=w.players.filter(p=>alive(p)&&s.choices.has(p.id)),highest=Math.max(0,...chosen.map(p=>s.choices.get(p.id))),leaders=chosen.filter(p=>s.choices.get(p.id)===highest),winner=highest>0&&leaders.length===1?leaders[0]:null;w.meta.winnerId=winner?.id||'';for(const p of w.players){if(!alive(p))continue;const bid=s.choices.get(p.id)??0;p.bid=s.choices.has(p.id)?bid:-1;p.choiceLocked=true;p.budget-=bid;if(winner?.id===p.id)p.goods+=w.meta.prize;p.score=p.budget+p.goods;p.roundPoints=(winner?.id===p.id?w.meta.prize:0)-bid;feedback(w,p,winner?.id===p.id?'단독 최고 입찰! 상품 +'+w.meta.prize:bid?'입찰금 '+bid+' 소비. 낙찰은 다음에!':'예산을 아꼈다.');}w.meta.notice=winner?winner.name+' 님 낙찰! '+w.meta.prize+'점 상품 획득.':'최고 입찰이 겹쳤어요. 이번 상품은 유찰!';}
 function auctionUpdate(w,s){const local=align(w,s,6,4,auctionBegin,auctionResolve);if(local>=4.7)auctionResolve(w,s);w.meta.phase=s.resolved?'reveal':'choose';if(!s.resolved)w.meta.notice='마감 전에는 봉투를 다시 고를 수 있어요. 입찰금은 돌려주지 않고, 유일한 최고 입찰만 상품 획득!';return local;}
 const auction={
  init(w,random){w.duration=24;w.objects=[];players(w);for(const p of w.players){p.budget=12;p.goods=0;p.bid=-1;p.score=12;}w.meta={stage:0,stageLeft:6,phase:'choose',prize:3,winnerId:'',choiceLabels:[],notice:''};const s={stage:0,choices:new Map(),resolved:false,random};privateGames.set(w,s);auctionBegin(w,s);auctionUpdate(w,s);},
  input(w,p,action){const s=privateGames.get(w);if(!s)return false;auctionUpdate(w,s);const lane=choice(w,p,action);if(lane<0||w.meta.phase!=='choose')return false;const bid=[0,1,3][lane];if(bid>p.budget){feedback(w,p,'예산이 부족해! 더 작은 금액을 골라요.');return false;}const revised=s.choices.has(p.id);s.choices.set(p.id,bid);p.locked=true;p.choiceLocked=false;setReady(w,p);feedback(w,p,revised?'봉투 수정 완료. 금액은 공개 전까지 비밀!':'봉투 제출 완료. 마감 전에는 수정할 수 있어요!');return true;},
  step(w){const s=privateGames.get(w);if(s)auctionUpdate(w,s);},
  bot(w,p,random){const s=privateGames.get(w);if(!s||p.locked||w.meta.phase!=='choose'||w.elapsed-s.stage*6<.6+p.index*.12)return{held:[]};const affordable=[0,1,3].filter(n=>n<=p.budget),bid=affordable[Math.floor(random()*affordable.length)];return{held:[],action:actions[[0,1,3].indexOf(bid)]};}
 };
 function stackReset(w,p,delay=0){p.stackWidth=150;p.stackCenter=350;p.stackLevel=0;p.perfectChain=0;p.stackRects=[];p.stackSpawnAt=w.elapsed;p.stackReadyAt=w.elapsed+delay;p.movingX=585;p.movingWidth=150;}
 function stackUpdate(w,p){const speed=1.7+Math.min(10,p.stackLevel)*.14,side=(p.blocks+p.failures)%2?-1:1;p.movingX=350+Math.cos((w.elapsed-p.stackSpawnAt)*speed)*235*side;p.movingWidth=p.stackWidth;}
 const stacker={
  init(w){w.duration=24;w.objects=[];players(w);w.meta={notice:'양쪽에서 오는 블록을 Space로 멈춰요. PERFECT 3연속이면 너비 회복!'};for(const p of w.players){p.blocks=0;p.perfects=0;p.failures=0;p.bestLevel=0;stackReset(w,p,.3);stackUpdate(w,p);}},
  input(w,p,action){if(!['hit','dash','jump'].includes(action)||!alive(p)||w.elapsed<p.nextInputAt||w.elapsed<p.stackReadyAt)return false;setReady(w,p,.23);stackUpdate(w,p);const difference=Math.abs(p.movingX-p.stackCenter),perfect=difference<=Math.max(5,p.stackWidth*.06),overlap=perfect?p.stackWidth:p.stackWidth-difference;if(overlap<=6){p.failures++;p.score=Math.max(0,p.score-12);feedback(w,p,'와르르! 새 탑으로 다시 도전.');stackReset(w,p,.65);return false;}const left=Math.max(p.stackCenter-p.stackWidth/2,p.movingX-p.stackWidth/2),right=Math.min(p.stackCenter+p.stackWidth/2,p.movingX+p.stackWidth/2);p.stackCenter=perfect?p.stackCenter:(left+right)/2;p.perfectChain=perfect?p.perfectChain+1:0;p.stackWidth=Math.min(150,overlap+(p.perfectChain>0&&p.perfectChain%3===0?12:0));p.stackLevel++;p.blocks++;p.bestLevel=Math.max(p.bestLevel,p.stackLevel);if(perfect)p.perfects++;const points=25+Math.round(overlap/6)+(perfect?20:0);p.score+=points;p.stackRects.push([p.stackCenter,p.stackWidth,p.stackLevel]);p.stackRects=p.stackRects.slice(-8);p.stackSpawnAt=w.elapsed;feedback(w,p,perfect?'PERFECT '+p.perfectChain+'연속! +'+points+(p.perfectChain%3===0?' · 너비 회복!':''):'남은 너비 '+Math.round(overlap)+' · +'+points);return true;},
  step(w){for(const p of w.players)if(alive(p))stackUpdate(w,p);},
  bot(w,p,random){return w.elapsed>=p.stackReadyAt&&w.elapsed>=p.nextInputAt&&Math.abs(p.movingX-p.stackCenter)<22&&random()<.85?{held:[],action:'hit'}:{held:[]};}
 };
 function reactionBegin(w,s){s.goAt=.95+s.random()*1.35;s.order=0;for(const p of w.players){p.locked=false;p.choiceLocked=false;p.reactionMs=-1;p.reactionRank=0;p.roundPoints=0;}w.meta.signal='wait';w.meta.signalText='아직…';}
 function reactionUpdate(w,s){const local=align(w,s,3.5,7,reactionBegin);w.meta.phase=local<3.15?'react':'reveal';if(local>=3.15){w.meta.signal='reveal';w.meta.signalText='다음 신호 준비';}else if(local>=s.goAt){w.meta.signal='go';w.meta.signalText='지금 찍어!';}else if(local>.28&&local<.55||local>s.goAt-.5&&local<s.goAt-.24){w.meta.signal='fake';w.meta.signalText='찍…지 마!';}else{w.meta.signal='wait';w.meta.signalText='아직…';}w.meta.notice='가짜 신호에는 참아요. 초록색 「지금 찍어!」에서 Space!';return local;}
 const reaction={
  init(w,random){w.duration=24.5;w.objects=[];players(w);w.meta={stage:0,stageLeft:3.5,phase:'react',signal:'wait',signalText:'아직…',notice:''};const s={stage:0,goAt:1,order:0,random};privateGames.set(w,s);reactionBegin(w,s);reactionUpdate(w,s);},
  input(w,p,action){const s=privateGames.get(w);if(!s)return false;const local=reactionUpdate(w,s);if(!['hit','jump','dash'].includes(action)||!alive(p)||p.locked||local>=3.15||w.elapsed<p.nextInputAt)return false;p.locked=true;p.choiceLocked=true;setReady(w,p);if(local<s.goAt){p.score=Math.max(0,p.score-35);p.roundPoints=-35;feedback(w,p,'성급했다! 이번 신호는 대기.');return false;}p.reactionMs=Math.max(0,Math.round((local-s.goAt)*1000));p.reactionRank=++s.order;const points=Math.round(150-Math.min(120,(local-s.goAt)*110));p.score+=points;p.roundPoints=points;feedback(w,p,p.reactionMs+'ms · +'+points);return true;},
  step(w){const s=privateGames.get(w);if(s)reactionUpdate(w,s);},
  bot(w,p,random){const s=privateGames.get(w);return s&&!p.locked&&w.meta.signal==='go'&&w.elapsed-s.stage*3.5>s.goAt+.18+p.index*.018&&random()<.8?{held:[],action:'hit'}:{held:[]};}
 };
 return{memory,sorter,receipt,safe,auction,stacker,reaction};
}
/* END_ARCADE_BRAIN_PACK_RULES_V1 */

/* ARCADE_ENGINE_V1 */
function createArcadeEngine(){
 const rules={...createArcadeMotionRules(),...createArcadeSkillRules(),...(typeof createArcadeCombatKartRules==='function'?createArcadeCombatKartRules():{}),...(typeof createArcadeSocialRhythmRules==='function'?createArcadeSocialRhythmRules():{}),...(typeof createArcadeBasketRules==='function'?createArcadeBasketRules():{}),...(typeof createArcadeTrayRules==='function'?createArcadeTrayRules():{}),...(typeof createArcadeSportsRules==='function'?createArcadeSportsRules():{}),...(typeof createArcadeActionPackRules==='function'?createArcadeActionPackRules():{}),...(typeof createArcadeBrainPackRules==='function'?createArcadeBrainPackRules():{})},privateWorlds=new WeakMap(),directions=new Set(['up','down','left','right']);
 function rng(seed){let s=(seed>>>0)||0x15f00d;return ()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return (s>>>0)/4294967296;};}
 function ranked(w){const list=[...w.players].sort((a,b)=>Number(a.forfeited)-Number(b.forfeited)||b.score-a.score||a.index-b.index);let rank=0,last=null;return list.map((p,i)=>{const key=String(!!p.forfeited)+':'+p.score;if(key!==last)rank=i+1;last=key;return {id:p.id,score:p.score,rank,forfeited:!!p.forfeited};});}
 function finish(w){if(w.phase==='done')return;w.phase='done';w.countdown=0;w.ranking=ranked(w);const eligible=w.ranking.filter(p=>!p.forfeited);w.winnerIds=eligible.filter(p=>p.rank===eligible[0]?.rank).map(p=>p.id);}
 function create(options){
  if(!options||typeof options.id!=='string'||!rules[options.game]||!Array.isArray(options.participants)||options.participants.length<2||options.participants.length>8||options.participants.some(p=>!p||typeof p.id!=='string'||!p.id)||new Set(options.participants.map(p=>p.id)).size!==options.participants.length)throw Error('Invalid arcade participants or game');
  const random=rng(options.seed),w={id:options.id,game:options.game,seed:options.seed>>>0,phase:'countdown',countdown:3,elapsed:0,seq:0,duration:24,players:options.participants.map((p,index)=>({id:p.id,name:String(p.name||'참가자').slice(0,24),department:String(p.department||'business'),index,x:100+index*50,y:230,score:0,health:3,eliminated:false,forfeited:false,stunUntil:0,actionUntil:0})),objects:[],meta:{},winnerIds:[],ranking:[]};
  rules[w.game].init(w,random);privateWorlds.set(w,{random,controls:new Map(w.players.map(p=>[p.id,{held:new Set(),seq:0,seenAt:-Infinity}]))});return w;
 }
 function input(w,id,cmd,now){
  const secret=privateWorlds.get(w);if(!secret||w.phase!=='play'||!Number.isFinite(now)||!cmd||!Number.isSafeInteger(cmd.seq)||cmd.seq<1)return false;
  const p=w.players.find(p=>p.id===id),control=secret.controls.get(id);if(!p||!control||p.eliminated||p.forfeited||cmd.seq<=control.seq||!['sync','jump','dash','hit'].includes(cmd.action))return false;
  if(cmd.action==='sync'&&(!Array.isArray(cmd.held)||cmd.held.length>4||cmd.held.some(k=>!directions.has(k))))return false;
  control.seq=cmd.seq;control.seenAt=now;if(cmd.action==='sync')control.held=new Set(cmd.held);else rules[w.game].input(w,p,cmd.action,secret.random);return true;
 }
 function step(w,dt,now){
  const secret=privateWorlds.get(w);if(!secret||w.phase==='done'||!Number.isFinite(dt)||dt<=0||!Number.isFinite(now))return false;dt=Math.min(.04,dt);
  w.seq++;if(w.phase==='countdown'){w.countdown=Math.max(0,w.countdown-dt);if(w.countdown<=1e-8){w.phase='play';w.countdown=0;}return true;}
  w.elapsed=Math.min(w.duration,w.elapsed+dt);for(const c of secret.controls.values())if(now-c.seenAt>900)c.held.clear();
  rules[w.game].step(w,dt,secret.controls,secret.random);
  for(const p of w.players){if(!Number.isFinite(p.score))p.score=0;for(const k of ['x','y','health','stunUntil','actionUntil'])if(!Number.isFinite(p[k]))p[k]=0;}
  if(w.elapsed>=w.duration-1e-8||w.meta.roundOver===true||w.players.every(p=>p.eliminated||p.forfeited))finish(w);return true;
 }
 function forfeit(w,id){if(!privateWorlds.has(w)||w.phase==='done')return false;const p=w.players.find(p=>p.id===id);if(!p||p.forfeited)return false;p.forfeited=true;p.eliminated=true;p.health=0;privateWorlds.get(w).controls.get(id)?.held.clear();if(w.players.every(p=>p.eliminated||p.forfeited))finish(w);return true;}
 function bot(w,id){const secret=privateWorlds.get(w);if(!secret||w.phase!=='play')return {held:[]};const p=w.players.find(p=>p.id===id);if(!p||p.eliminated||p.forfeited)return {held:[]};return rules[w.game].bot(w,p,secret.random)||{held:[]};}
 function complete(w){if(!privateWorlds.has(w))return false;finish(w);return true;}
 return {create,input,step,forfeit,bot,complete};
}
/* END_ARCADE_ENGINE_V1 */
