/* WONKY_ARCADE_V2 */
const arcadePlatforms=[{left:180,right:350,y:65},{left:425,right:575,y:130},{left:650,right:820,y:65}];
let arcadePractice=null,arcadePracticeSeq=0;
const arcadeBaseAuthority=brawlAuthority,arcadeBaseMe=brawlMe,arcadeBaseInput=netBrawlInput,arcadeBaseBuild=brawlBuildActors,arcadeBaseRender=brawlRender,arcadeBaseFinish=netBrawlFinished;
brawlAuthority=function(){return !!arcadePractice||arcadeBaseAuthority();};
brawlMe=function(){return arcadePractice?'practice-you':arcadeBaseMe();};
netBrawlInput=function(action,held){if(arcadePractice)return brawlHostInput('practice-you',{seq:++arcadePracticeSeq,action,held});return arcadeBaseInput(action,held);};
netBrawlFinished=function(id,reason){if(!arcadePractice)return arcadeBaseFinish(id,reason);};
brawlBuildActors=function(){arcadeBaseBuild();const arena=$('brawlArena');arena.querySelectorAll('.arcade-platform').forEach(n=>n.remove());for(const p of arcadePlatforms){const n=el('div','arcade-platform');n.style.left=p.left/10+'%';n.style.width=(p.right-p.left)/10+'%';n.style.bottom='calc(34px + '+p.y/360*100+'%)';n.setAttribute('aria-hidden','true');arena.append(n);}for(const f of brawlState.fighters){const n=brawlNodes.get(f.id);n.actor.dataset.hitStamp='';}arcadePracticeControls();};
brawlRender=function(){arcadeBaseRender();if(!brawlState||$('brawlView')?.hidden)return;const t=brawlState.clock;for(const f of brawlState.fighters){const n=brawlNodes.get(f.id);if(!n)continue;n.actor.classList.toggle('is-diving',!!f.diving);if(t<f.flash&&n.actor.dataset.hitStamp!==String(f.flash)){n.actor.dataset.hitStamp=String(f.flash);if(!reduced){const fx=el('i','arcade-hit-star','✷');fx.style.left=f.x/10+'%';fx.style.bottom='calc(70px + '+f.y/360*100+'%)';$('brawlArena').append(fx);setTimeout(()=>fx.remove(),420);}beep(120+Math.floor(f.hp),.055);}}const replay=$('arcadePracticeReplay');if(replay)replay.hidden=!arcadePractice||brawlState.phase!=='finished';};
function arcadePracticeControls(){let bar=$('arcadePracticeBar');if(!bar){bar=el('div','arcade-practice-bar');bar.id='arcadePracticeBar';bar.innerHTML='<span>연습 난투 · 컴퓨터 두 그릇과 한 판</span><div><button id="arcadePracticeReplay" type="button" class="btn primary" hidden>한 판 더</button><button id="arcadePracticeExit" type="button" class="tiny-btn">연습 끝내기</button></div>';$('brawlView').prepend(bar);$('arcadePracticeReplay').addEventListener('click',arcadePracticeStart);$('arcadePracticeExit').addEventListener('click',arcadePracticeExit);}bar.hidden=!arcadePractice;}
function arcadePracticeStart(){if(netIsActive())return;arcadePractice={bots:new Map(),startedAt:performance.now()};arcadePracticeSeq=0;document.body.classList.add('arcade-practice');const nick=$('roomNickname').value.trim().slice(0,12)||'내 그릇';brawlPrepare({id:'practice-'+Date.now(),participants:[{id:'practice-you',name:nick,menu:'내 밥',department:'business'},{id:'practice-a',name:'밥줘',menu:'남의 국밥',department:'accounting'},{id:'practice-b',name:'숟가락',menu:'남의 돈가스',department:'hotel'}]});brawlStart();}
function arcadePracticeExit(){brawlCancel();if(vfxLayer){vfxLayer.remove();vfxLayer=null;}clearTimeout(vfxCleanup);arcadePractice=null;document.body.classList.remove('arcade-practice');showSetup();$('arcadeTryBtn').focus();}
function arcadeBotStep(){const s=brawlState,t=s.clock;for(const f of brawlAlive().filter(f=>f.id!=='practice-you')){let brain=arcadePractice.bots.get(f.id);if(!brain){brain={next:0,attackNext:1.8,seq:0};arcadePractice.bots.set(f.id,brain);}if(t<brain.next)continue;brain.next=t+.24;const other=brawlAlive().filter(x=>x!==f).sort((a,b)=>Math.abs(a.x-f.x)-Math.abs(b.x-f.x))[0];if(!other)continue;const dx=other.x-f.x,dy=other.y-f.y;const send=(action,held=true)=>brawlHostInput(f.id,{seq:++brain.seq,action,held});send('sync',Math.abs(dx)>88?[dx>0?'right':'left']:[]);if(Math.abs(dx)<135&&Math.abs(dy)<70&&t>=brain.attackNext){send('attack');brain.attackNext=t+1.15;}if((dy>32||Math.abs(dx)<95&&Math.sin(t*2.8+f.index)>0.7||s.projectiles.some(p=>p.active&&p.owner!==f.id&&Math.abs(p.x-f.x)<100))&&(f.jumps||0)<2)send('jump');if(Math.abs(dx)>235&&Math.abs(dy)<70&&Math.sin(t+f.index)>.25)send('beam');}}
const arcadeTry=el('button','btn arcade-try','혼자 바로 난투  ↗');arcadeTry.id='arcadeTryBtn';arcadeTry.type='button';arcadeTry.addEventListener('click',arcadePracticeStart);const arcadeCoffeeTry=el('button','tiny-btn arcade-coffee-try','커피 폭탄도 맛보기 ☕');arcadeCoffeeTry.id='arcadeCoffeeTryBtn';arcadeCoffeeTry.type='button';arcadeCoffeeTry.addEventListener('click',()=>coffeeDemoStart());const arcadeTray=el('div','arcade-try-tray');arcadeTray.append(arcadeTry,arcadeCoffeeTry,el('small','','방 만들기 전에, 일단 한 판'));$('roomLobby').querySelector('.room-lobby-copy').append(arcadeTray);


/* PARTY_MINIGAMES_START */
function createTrayEngine() {
  const sessions = new WeakMap();
  const allowed = new Set(['left', 'right', 'up', 'down']);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  function hash(s) {
    let h = 2166136261;
    for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967296;
  }
  function floor(seed) {
    const tiles = [];
    for (let row = 0; row < 7; row++) for (let col = 0; col < 7; col++) {
      const ring = Math.max(Math.abs(row - 3), Math.abs(col - 3));
      const goneAt = ring === 3 ? 10 : ring === 2 ? 20 : ring === 1 ? 30 : 1e9;
      tiles.push({ id: row * 7 + col, row, col, warningAt: goneAt - .9, goneAt });
    }
    const inner = tiles.filter(t => t.goneAt < 1e9 && Math.max(Math.abs(t.row - 3), Math.abs(t.col - 3)) < 3)
      .sort((a, b) => hash(seed + ':' + a.id) - hash(seed + ':' + b.id));
    inner.slice(0, 6).forEach((t, i) => { t.goneAt = Math.min(t.goneAt, 6.5 + i * 3.1); t.warningAt = t.goneAt - .9; });
    return tiles;
  }
  function place(p, i, n, seed, rematch = false) {
    const a = -Math.PI / 2 + i * Math.PI * 2 / n + (rematch ? hash(seed + ':turn') * 1.8 : 0);
    const r = rematch ? 75 + hash(seed + ':' + p.id) * 85 : 130 + (i % 3) * 20;
    Object.assign(p, { x: 350 + Math.cos(a) * r, y: 350 + Math.sin(a) * r, vx: 0, vy: 0,
      dx: -Math.cos(a) || 0, dy: -Math.sin(a) || 0, eliminated: false, fallAt: 0,
      dashUntil: 0, dashReadyAt: 0, stunUntil: 0, forfeited: false });
  }
  function create(spec) {
    if (!spec || typeof spec.id !== 'string' || !Array.isArray(spec.participants) ||
      spec.participants.length < 2 || spec.participants.length > 8 ||
      new Set(spec.participants.map(p => p && p.id)).size !== spec.participants.length ||
      spec.participants.some(p => !p || typeof p.id !== 'string' || !p.id || typeof p.name !== 'string')) return null;
    const seed = String(spec.seed ?? spec.id);
    const players = spec.participants.map((p, index) => ({ id: p.id, name: p.name.slice(0, 24),
      department: String(p.department || 'business').slice(0, 60), index }));
    players.forEach((p, i) => place(p, i, players.length, seed));
    const world = { id: spec.id, seed, phase: 'countdown', countdown: 3, elapsed: 0, seq: 0,
      players, tiles: floor(seed), winnerIds: [], notice: '밀치고 피하고, 식판 위에서 살아남아라!' };
    sessions.set(world, { inputs: new Map(), sequences: new Map(), hitSets: new Map(), nextGust: 31, rematches: 0 });
    return world;
  }
  function controls(world, id, nowMs) {
    const rec = sessions.get(world).inputs.get(id);
    if (!rec || nowMs - rec.at > 900) return { x: 0, y: 0 };
    const x = Number(rec.held.has('right')) - Number(rec.held.has('left'));
    const y = Number(rec.held.has('down')) - Number(rec.held.has('up'));
    const size = Math.hypot(x, y) || 1;
    return { x: x / size, y: y / size };
  }
  function input(world, senderId, packet, nowMs) {
    const session = sessions.get(world);
    if (!session || !packet || !Number.isFinite(nowMs) || !Number.isSafeInteger(packet.seq) ||
      packet.seq < 1 || packet.seq <= (session.sequences.get(senderId) || 0)) return false;
    const p = world.players.find(p => p.id === senderId && !p.eliminated && !p.forfeited);
    if (!p || !['countdown', 'play'].includes(world.phase)) return false;
    if (packet.action === 'sync') {
      if (!Array.isArray(packet.held) || packet.held.length > 4 || packet.held.some(a => !allowed.has(a)) ||
        world.phase !== 'play' && packet.held.length) return false;
      session.sequences.set(senderId, packet.seq);
      session.inputs.set(senderId, { held: new Set(packet.held), at: nowMs });
      return true;
    }
    if (packet.action !== 'dash' || packet.held !== true || world.phase !== 'play') return false;
    session.sequences.set(senderId, packet.seq);
    if (world.elapsed < p.dashReadyAt || world.elapsed < p.stunUntil) return false;
    const c = controls(world, senderId, nowMs);
    if (c.x || c.y) { p.dx = c.x; p.dy = c.y; }
    p.dashUntil = world.elapsed + .18;
    p.dashReadyAt = world.elapsed + 2.5;
    p.vx = p.dx * 560; p.vy = p.dy * 560;
    session.hitSets.set(p.id, new Set());
    return true;
  }
  function finish(world, alive, reason) {
    world.phase = 'done'; world.winnerIds = alive.map(p => p.id);
    world.notice = alive.length === 1 ? alive[0].name + ' 님 식판 사수!' : reason;
    world.seq++;
  }
  function onFloor(world, p) {
    const col = Math.floor((p.x - 70) / 80), row = Math.floor((p.y - 70) / 80);
    if (row < 0 || row > 6 || col < 0 || col > 6) return false;
    return world.elapsed < world.tiles[row * 7 + col].goneAt;
  }
  function rematch(world, lastAlive) {
    const session = sessions.get(world), eligible = lastAlive.filter(p => !p.forfeited);
    if (!eligible.length) { finish(world, [], '남은 참가자가 없어요.'); return; }
    session.rematches++; session.inputs.clear(); session.hitSets.clear(); session.nextGust = 31;
    const seed = world.seed + ':rematch:' + session.rematches;
    world.elapsed = 0; world.phase = 'countdown'; world.countdown = 1.4;
    world.tiles = floor(seed); world.winnerIds = [];
    eligible.forEach((p, i) => place(p, i, eligible.length, seed, true));
    world.notice = '동반 침몰! 방금 살아 있던 사람들끼리 한 번 더!';
  }
  function bump(world, a, b) {
    let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    if (d >= 42) return;
    if (d < .001) { const angle = hash(a.id + ':' + b.id) * Math.PI * 2; dx = Math.cos(angle); dy = Math.sin(angle); d = 1; }
    const nx = dx / d, ny = dy / d, push = (42 - d) / 2;
    a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
    const t = world.elapsed, session = sessions.get(world);
    const strike = (from, to, sx, sy) => {
      const hits = session.hitSets.get(from.id);
      if (t >= from.dashUntil || !hits || hits.has(to.id)) return false;
      hits.add(to.id);
      to.vx += sx * 620; to.vy += sy * 620;
      to.stunUntil = Math.max(to.stunUntil, t + .27);
      from.vx *= .85; from.vy *= .85;
      return true;
    };
    const ahit = strike(a, b, nx, ny), bhit = strike(b, a, -nx, -ny);
    if (!ahit && !bhit) {
      const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (closing > 0) {
        const impulse = closing * .58;
        a.vx -= nx * impulse; a.vy -= ny * impulse;
        b.vx += nx * impulse; b.vy += ny * impulse;
        if (closing > 65) {
          b.stunUntil = Math.max(b.stunUntil, t + .12);
          a.stunUntil = Math.max(a.stunUntil, t + .045);
        }
      }
    }
  }
  function step(world, dt, nowMs) {
    const session = sessions.get(world);
    if (!session || !Number.isFinite(dt) || dt <= 0 || !Number.isFinite(nowMs) ||
      !['countdown', 'play'].includes(world.phase)) return false;
    dt = Math.min(.04, dt);
    if (world.phase === 'countdown') {
      world.countdown = Math.max(0, world.countdown - dt);
      if (!world.countdown) { world.phase = 'play'; world.elapsed = 0; session.inputs.clear(); }
      world.seq++; return true;
    }
    const alive = world.players.filter(p => !p.eliminated && !p.forfeited);
    if (alive.length <= 1) { finish(world, alive, '남은 참가자가 없어요.'); return true; }
    world.elapsed += dt;
    const t = world.elapsed;
    if (t >= session.nextGust) {
      const a = hash(world.seed + ':gust:' + Math.floor(session.nextGust)) * Math.PI * 2;
      const force = Math.min(620, 260 + (t - 30) * 12);
      for (const p of alive) {
        p.vx += Math.cos(a) * force; p.vy += Math.sin(a) * force;
        p.stunUntil = Math.max(p.stunUntil, t + .3);
      }
      session.nextGust = t + 1.7;
      world.notice = '후우우! 식판에 바람이 분다!';
    }
    for (const p of alive) {
      const c = controls(world, p.id, nowMs);
      if (t < p.stunUntil) { p.vx *= Math.exp(-2.2 * dt); p.vy *= Math.exp(-2.2 * dt); }
      else if (t < p.dashUntil) { p.vx = p.dx * 560; p.vy = p.dy * 560; }
      else {
        if (c.x || c.y) { p.dx = c.x; p.dy = c.y; }
        const alpha = Math.min(1, dt * ((c.x || c.y) ? 15 : 10));
        p.vx += (c.x * 180 - p.vx) * alpha; p.vy += (c.y * 180 - p.vy) * alpha;
      }
      p.vx = clamp(p.vx, -1000, 1000); p.vy = clamp(p.vy, -1000, 1000);
      p.x = clamp(p.x + p.vx * dt, 0, 700); p.y = clamp(p.y + p.vy * dt, 0, 700);
    }
    for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) bump(world, alive[i], alive[j]);
    for (const p of alive) {
      p.x = clamp(p.x, 0, 700); p.y = clamp(p.y, 0, 700);
      if (!onFloor(world, p)) { p.eliminated = true; p.fallAt = t; p.dashUntil = 0; }
    }
    const remaining = alive.filter(p => !p.eliminated);
    if (!remaining.length) rematch(world, alive);
    else if (remaining.length === 1) finish(world, remaining, '');
    world.seq++;
    return true;
  }
  function forfeit(world, id) {
    const session = sessions.get(world);
    if (!session || !world || !Array.isArray(world.players)) return false;
    const p = world.players.find(p => p.id === id);
    if (!p || p.forfeited || world.phase === 'done') return false;
    p.forfeited = true; p.eliminated = true; p.fallAt = world.elapsed; p.dashUntil = 0;
    session.inputs.delete(id);
    const alive = world.players.filter(p => !p.eliminated && !p.forfeited);
    if (alive.length <= 1) finish(world, alive, '남은 참가자가 없어요.');
    else world.seq++;
    return true;
  }
  return { create, input, step, forfeit };
}


/* TRAY_SURVIVAL_V1 */
const trayEngine=createTrayEngine(),trayPalette=['#b9d67e','#c5a0df','#e6c675','#8dccca','#eda992','#a5b7dc','#dbaa93','#b9c49c'];
let trayState=null,trayDialog=null,trayDemo=false,trayContext='',trayInputSeq=0,trayLastSend=0,trayFrame=0,trayPrevious=null,trayReceivedAt=0,trayPumpAt=0,trayAccum=0,trayBotBrains=new Map();
const trayKeyMap={KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',KeyW:'up',ArrowUp:'up',KeyS:'down',ArrowDown:'down'},trayKeys=new Set(),trayPointers=new Map(),trayActors=new Map(),trayTiles=new Map();
function traySelf(){return trayDemo?'tray-you':netSelfId();}
function trayHost(){return trayDemo||netIsHost();}
function trayClone(v){return v?JSON.parse(JSON.stringify(v)):null;}
function trayBaseContext(){return netPhase+':'+(result?.id||'setup');}
function trayBusy(){return !!trayState&&(trayState.phase==='invite'||['countdown','play'].includes(trayState.world?.phase));}
function trayGetState(){return !trayDemo&&netIsActive()&&trayState?trayClone(trayState):null;}
function trayPublish(force=false){if(trayDemo||!netIsHost()||netApplying)return;const n=performance.now();if(!force&&n-trayLastSend<80)return;trayLastSend=n;netPublish();}
function traySend(cmd){if(trayDemo)trayHandle(traySelf(),cmd);else netRoom.send(cmd);}
function trayInput(action,held){if(!trayState?.world)return;traySend({t:'trayInput',gameId:trayState.id,seq:++trayInputSeq,action,held});}
function trayHeld(){return [...new Set([...trayKeys].map(k=>trayKeyMap[k]).filter(Boolean).concat([...trayPointers.values()].map(v=>v.action).filter(a=>a!=='dash')))];}
function trayClearKeys(){trayKeys.clear();trayPointers.clear();document.querySelectorAll('[data-tray-action]').forEach(b=>b.classList.remove('is-held'));if(trayState?.world?.phase==='play')trayInput('sync',[]);}
function trayEnsureUI(){
 if(trayDialog)return;trayDialog=el('dialog','tray-dialog');trayDialog.id='trayDialog';trayDialog.setAttribute('aria-labelledby','trayTitle');
 trayDialog.innerHTML='<div class="tray-head"><div><span>NEW GAME · 떨어지면 밥 쏟음</span><h2 id="trayTitle">식판 서바이벌</h2></div><button id="trayCloseBtn" class="tiny-btn" type="button" aria-label="식판 게임 닫기">닫기</button></div><p class="tray-help">바닥 빨개지면 도망. 붙었을 때 <b>Space로 밀쳐!</b><br>마지막까지 식판 위에 남으면 승리.</p><div id="trayRoster" class="tray-roster"></div><section id="trayInvite" class="tray-invite"><div class="tray-invite-art"></div><h3>밥은 먹고 싸우자</h3><p>이동 W/A/S/D 또는 방향키<br>Space / F 밀치기 · 떨어지면 탈락</p><div><button id="trayJoinBtn" class="btn primary" type="button">나도 올라간다 · 준비</button><button id="trayPassBtn" class="btn" type="button">식판 밖에서 구경</button></div><small id="trayInviteHint"></small></section><section id="trayPlay" hidden><div class="tray-arena" id="trayBoard" aria-label="사라지는 식판 경기장"><div id="trayFloor" class="tray-floor"></div><div class="tray-under-label">여기 떨어지면 설거지행</div><div id="trayActors" class="tray-actors"></div><div id="trayOverlay" class="tray-overlay"><strong id="trayOverlayTitle"></strong><span id="trayOverlayHint"></span></div><span id="trayAlive" class="tray-alive"></span></div><p id="trayStatus" class="tray-status" role="status" aria-live="polite"></p><div class="tray-controls"><div class="tray-dpad" aria-label="식판 이동 조작"><button data-tray-action="up" aria-label="식판 위쪽 이동">▲<kbd>W / ↑</kbd></button><button data-tray-action="left" aria-label="식판 왼쪽 이동">◀<kbd>A / ←</kbd></button><i>이동</i><button data-tray-action="right" aria-label="식판 오른쪽 이동">▶<kbd>D / →</kbd></button><button data-tray-action="down" aria-label="식판 아래쪽 이동">▼<kbd>S / ↓</kbd></button></div><button data-tray-action="dash" class="tray-dash" aria-label="식판 밀치기">밀쳐!<small id="trayDashReady">SPACE / F</small></button><div class="tray-control-note"><strong id="trayMyState"></strong><span>가던 방향으로 돌진해요.<br>빈 바닥은 밟지 마세요.</span></div></div></section><div class="tray-bottom"><span id="trayBottomNote"></span><button id="trayReplayBtn" class="btn primary" type="button" hidden>한 판 더</button><button id="trayCancelBtn" class="tiny-btn" type="button">게임 접기</button></div>';
 document.body.append(trayDialog);trayDialog.querySelector('.tray-invite-art').innerHTML=deptAvatarSvg('accounting')+deptAvatarSvg('business')+deptAvatarSvg('hotel');
 $('trayCloseBtn').addEventListener('click',trayClose);trayDialog.addEventListener('cancel',e=>{e.preventDefault();trayClose();});
 $('trayJoinBtn').addEventListener('click',()=>traySend({t:'trayReply',gameId:trayState?.id,response:'join'}));$('trayPassBtn').addEventListener('click',()=>traySend({t:'trayReply',gameId:trayState?.id,response:'pass'}));
 $('trayCancelBtn').addEventListener('click',()=>traySend({t:'trayCancel',gameId:trayState?.id}));$('trayReplayBtn').addEventListener('click',()=>{if(trayDemo)trayDemoStart();else traySend({t:'trayInvite'});});
 trayDialog.addEventListener('pointerdown',e=>{const b=e.target.closest('[data-tray-action]');if(!b||b.disabled||e.pointerType==='mouse'&&e.button!==0)return;e.preventDefault();const action=b.dataset.trayAction;try{b.setPointerCapture(e.pointerId);}catch{}trayPointers.set(e.pointerId,{action,button:b});b.classList.add('is-held');if(action==='dash')trayInput('dash',true);else trayInput('sync',trayHeld());});
 const release=e=>{const v=trayPointers.get(e.pointerId);if(!v)return;e.preventDefault();trayPointers.delete(e.pointerId);v.button.classList.remove('is-held');trayInput('sync',trayHeld());};
 trayDialog.addEventListener('pointerup',release);trayDialog.addEventListener('pointercancel',release);trayDialog.addEventListener('lostpointercapture',release);
 trayDialog.addEventListener('click',e=>{const b=e.target.closest('[data-tray-action]');if(b&&e.detail===0&&!b.disabled&&b.dataset.trayAction==='dash')trayInput('dash',true);});
}
function trayClose(){trayClearKeys();if(trayDemo){trayCancel();return;}const m=trayState?.members.find(m=>m.id===traySelf());if(m?.response==='pending')traySend({t:'trayReply',gameId:trayState.id,response:'pass'});if(trayState?.world?.phase==='play'&&m?.response==='join')traySend({t:'trayForfeit',gameId:trayState.id});trayDialog?.close();}
function trayOpen(){trayEnsureUI();if(!trayState)return;trayRender();if(!trayDialog.open)trayDialog.showModal();if(!trayFrame)trayFrame=requestAnimationFrame(trayAnimate);}
function trayCancel(){trayClearKeys();trayState=null;trayDemo=false;trayPrevious=null;trayContext='';trayBotBrains.clear();trayActors.clear();trayTiles.clear();cancelAnimationFrame(trayFrame);trayFrame=0;trayDialog?.close();trayUpdateButtons();}
function trayInvite(senderId){
 if(!netIsHost()||!['setup','result'].includes(netPhase)||netMembers().length<2)return false;
 if(coffeeState&&['invite','play'].includes(coffeeState.phase)){notify('커피 게임을 마친 뒤 식판에 올라와주세요.');return false;}
 if(trayBusy())return true;
 trayState={id:'tray_'+Date.now()+'_'+rand(1000000),context:trayBaseContext(),phase:'invite',members:netMembers().map(m=>({id:m.id,name:m.name,department:netDepartment(m.id),response:'pending'})),world:null};
 trayContext=trayState.context;trayInputSeq=0;trayPrevious=null;trayOpen();trayPublish(true);return true;
}
function trayMaybeStart(){
 if(!trayHost()||trayState?.phase!=='invite'||trayState.members.some(m=>m.response==='pending'))return;const joined=trayState.members.filter(m=>m.response==='join');if(joined.length<2)return;
 trayState.world=trayEngine.create({id:trayState.id,participants:joined,seed:Date.now()>>>0});trayState.phase='game';trayInputSeq=0;trayBotBrains.clear();trayPumpAt=performance.now();trayAccum=0;trayPrevious=null;trayActors.clear();trayTiles.clear();trayRender();trayPublish(true);
}
function trayHandle(senderId,cmd){
 if(typeof cmd?.t!=='string')return false;const isTray=cmd.t.startsWith('tray');
 if(!isTray)return trayBusy();
 if(!trayHost()||!trayDemo&&(!netIsActive()||!netMembers().some(m=>m.id===senderId)))return true;
 if(cmd.t==='trayInvite'){trayInvite(senderId);return true;}
 if(!trayState||cmd.gameId!==trayState.id)return true;const m=trayState.members.find(m=>m.id===senderId);if(!m)return true;
 if(cmd.t==='trayReply'&&trayState.phase==='invite'&&['join','pass'].includes(cmd.response)){m.response=cmd.response;trayRender();trayPublish(true);trayMaybeStart();return true;}
 if(cmd.t==='trayCancel'&&senderId===traySelf()){trayCancel();if(netIsHost())netPublish();return true;}
 if(cmd.t==='trayInput'&&m.response==='join'&&trayState.world){if(trayEngine.input(trayState.world,senderId,cmd,performance.now())){trayRender();trayPublish(false);}return true;}
 if(cmd.t==='trayForfeit'&&m.response==='join'&&trayState.world){trayEngine.forfeit(trayState.world,senderId);trayRender();trayPublish(true);return true;}
 return true;
}
function trayValidate(data){
 if(!data||typeof data.id!=='string'||!['invite','game'].includes(data.phase)||!Array.isArray(data.members)||data.members.length<2||data.members.length>8)return false;
 if(data.members.some(m=>!m||typeof m.id!=='string'||typeof m.name!=='string'||!['pending','join','pass'].includes(m.response))||new Set(data.members.map(m=>m.id)).size!==data.members.length)return false;
 const w=data.world;if(!w)return data.phase==='invite';if(w.id!==data.id||!['countdown','play','done'].includes(w.phase)||!Number.isFinite(w.elapsed)||w.elapsed<0||!Number.isFinite(w.countdown)||!Number.isSafeInteger(w.seq)||!Array.isArray(w.players)||w.players.length<2||w.players.length>8||!Array.isArray(w.tiles)||w.tiles.length!==49)return false;
 if(w.players.some(p=>!p||typeof p.id!=='string'||typeof p.name!=='string'||!Number.isInteger(p.index)||p.index<0||p.index>7||!data.members.some(m=>m.id===p.id&&m.response==='join')||['x','y','vx','vy','dx','dy','dashUntil','dashReadyAt','stunUntil'].some(k=>!Number.isFinite(p[k])))||new Set(w.players.map(p=>p.id)).size!==w.players.length)return false;
 return w.tiles.every(t=>t&&Number.isInteger(t.id)&&t.id>=0&&t.id<49&&Number.isInteger(t.row)&&t.row>=0&&t.row<7&&Number.isInteger(t.col)&&t.col>=0&&t.col<7&&(t.goneAt===null||Number.isFinite(t.goneAt))&&(t.warningAt===null||Number.isFinite(t.warningAt)))&&new Set(w.tiles.map(t=>t.id)).size===49&&Array.isArray(w.winnerIds)&&w.winnerIds.every(id=>w.players.some(p=>p.id===id));
}
function trayReceive(data){
 if(trayDemo||netIsHost())return;if(!data){if(trayState)trayCancel();return;}if(!trayValidate(data))return;
 const fresh=trayState?.id!==data.id;trayPrevious=!fresh&&trayState?.world?trayClone(trayState.world):null;trayState=trayClone(data);trayContext=data.context;trayReceivedAt=performance.now();if(fresh){trayInputSeq=0;trayActors.clear();trayTiles.clear();trayOpen();}else trayRender();
}
function trayBuildWorld(){
 const world=trayState.world,board=$('trayFloor');board.replaceChildren();$('trayActors').replaceChildren();trayTiles.clear();trayActors.clear();
 for(const tile of world.tiles){const n=el('i','tray-tile');n.style.left=(70+tile.col*80)/7+'%';n.style.top=(70+tile.row*80)/7+'%';n.style.width=80/7+'%';n.style.height=80/7+'%';n.dataset.alt=String((tile.row+tile.col)%2);board.append(n);trayTiles.set(tile.id,n);}
 for(const p of world.players){const n=el('div','tray-actor');n.dataset.player=p.id;n.style.setProperty('--tray-color',trayPalette[p.index%8]);n.innerHTML=deptAvatarSvg(p.department||'business');n.append(el('b','tray-player-name',p.name),el('span','tray-me-tag',p.id===traySelf()?'▼ 나':''));$('trayActors').append(n);trayActors.set(p.id,n);}
}
function trayRender(){
 trayUpdateButtons();if(!trayState||!trayDialog)return;const s=trayState,w=s.world,self=traySelf(),own=s.members.find(m=>m.id===self);
 $('trayInvite').hidden=!!w;$('trayPlay').hidden=!w;$('trayCancelBtn').hidden=!trayHost();$('trayReplayBtn').hidden=!(w?.phase==='done'&&(trayDemo||netIsHost()));$('trayBottomNote').textContent=trayDemo?'연습 · 컴퓨터와 한 판':'같은 방의 참가자들과 함께 · 점심 메뉴는 그대로';
 const roster=$('trayRoster');if(roster.dataset.id!==s.id){roster.dataset.id=s.id;roster.replaceChildren();for(const m of s.members){const n=el('span','tray-chip');n.dataset.member=m.id;n.append(el('b','',m.name+(m.id===self?' · 나':'')),el('small'));roster.append(n);}}
 for(const n of roster.children){const m=s.members.find(m=>m.id===n.dataset.member),p=w?.players.find(p=>p.id===m.id);if(!m)continue;n.classList.toggle('is-out',!!p?.eliminated||m.response==='pass');n.querySelector('small').textContent=p?.eliminated?'밥 쏟음':w?m.response==='join'?'생존':'관전':{join:'준비 ✓',pass:'관전',pending:'고르는 중'}[m.response];}
 if(!w){$('trayJoinBtn').textContent=own?.response==='join'?'준비 완료 ✓':'나도 올라간다 · 준비';$('trayPassBtn').textContent=own?.response==='pass'?'관전 중 ✓':'식판 밖에서 구경';const pending=s.members.filter(m=>m.response==='pending').length;$('trayInviteHint').textContent=pending?'참가 또는 관전을 골라요 · 아직 '+pending+'명 선택 중':'2명 이상 참가하면 출발해요.';return;}
 if(trayActors.size!==w.players.length||trayTiles.size!==49)trayBuildWorld();
 const t=w.elapsed,alpha=trayHost()?1:Math.min(1,(performance.now()-trayReceivedAt)/80);
 for(const tile of w.tiles){const n=trayTiles.get(tile.id),gone=Number.isFinite(tile.goneAt)&&t>=tile.goneAt,warning=!gone&&Number.isFinite(tile.warningAt)&&t>=tile.warningAt;n.classList.toggle('is-gone',gone);n.classList.toggle('is-warning',warning);}
 for(const p of w.players){const n=trayActors.get(p.id),prev=trayPrevious?.players.find(x=>x.id===p.id),x=prev&&!trayHost()?prev.x+(p.x-prev.x)*alpha:p.x,y=prev&&!trayHost()?prev.y+(p.y-prev.y)*alpha:p.y;n.style.left=x/7+'%';n.style.top=y/7+'%';n.classList.toggle('is-own',p.id===self);n.classList.toggle('is-dashing',t<p.dashUntil);n.classList.toggle('is-moving',!p.eliminated&&Math.hypot(p.vx,p.vy)>30);n.classList.toggle('is-out',p.eliminated);n.style.opacity=p.eliminated?String(Math.max(.12,1-(t-(p.fallAt||0))/.6)):'';}
 const overlay=$('trayOverlay');overlay.hidden=w.phase==='play';
 if(w.phase==='countdown'){$('trayOverlayTitle').textContent=Math.max(1,Math.ceil(w.countdown));$('trayOverlayHint').textContent='방향키로 이동 · Space로 밀쳐!';}
 if(w.phase==='done'){$('trayOverlayTitle').textContent=w.winnerIds.length?w.players.find(p=>p.id===w.winnerIds[0])?.name+' 생존!':'동반 침몰';$('trayOverlayHint').textContent=w.winnerIds.length?'밥 한 톨도 안 흘림.':'다음 판에는 식판 좀 지켜줘요.';}
 $('trayAlive').textContent=w.players.filter(p=>!p.eliminated).length+' / '+w.players.length+' 생존';$('trayStatus').textContent=w.notice||'바닥 빨개지면 도망! 상대를 식판 밖으로 밀쳐요.';
 const player=w.players.find(p=>p.id===self),can=w.phase==='play'&&player&&!player.eliminated,cool=player?Math.max(0,player.dashReadyAt-t):0;
 $('trayMyState').textContent=!player?'관전 중':player.eliminated?'밥 쏟음 · 관전 중':'내 식판은 내가 지킨다';$('trayDashReady').textContent=cool>.05?cool.toFixed(1)+'초 뒤 다시':'SPACE / F';trayDialog.querySelectorAll('[data-tray-action]').forEach(b=>b.disabled=!can||b.dataset.trayAction==='dash'&&cool>.05);
}
function trayAnimate(){trayFrame=0;if(!trayState||!trayDialog?.open)return;trayRender();trayFrame=requestAnimationFrame(trayAnimate);}
function trayDemoStart(){
 if(netIsActive())return;trayCancel();trayDemo=true;trayState={id:'tray_demo_'+Date.now(),context:'demo',phase:'game',members:[{id:'tray-you',name:'내 식판',department:'business',response:'join'},{id:'tray-a',name:'밥줘',department:'accounting',response:'join'},{id:'tray-b',name:'숟가락',department:'hotel',response:'join'},{id:'tray-c',name:'국물',department:'economics',response:'join'}],world:null};
 trayState.world=trayEngine.create({id:trayState.id,participants:trayState.members,seed:Date.now()>>>0});trayContext='demo';trayInputSeq=0;trayPumpAt=performance.now();trayAccum=0;trayOpen();
}
function trayBotStep(now){
 const w=trayState.world,t=w.elapsed,alive=w.players.filter(p=>!p.eliminated),solid=w.tiles.filter(z=>!Number.isFinite(z.goneAt)||z.goneAt>t+.7);
 for(const p of alive.filter(p=>p.id!=='tray-you')){let b=trayBotBrains.get(p.id);if(!b){b={seq:0,next:0,dash:2+p.index*.4};trayBotBrains.set(p.id,b);}if(t<b.next)continue;b.next=t+.22;const target=alive.filter(q=>q!==p).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];if(!target)continue;let x=target.x,y=target.y;const futureX=p.x+Math.sign(x-p.x)*60,futureY=p.y+Math.sign(y-p.y)*60;if(!solid.some(z=>futureX>=70+z.col*80&&futureX<=150+z.col*80&&futureY>=70+z.row*80&&futureY<=150+z.row*80)){const z=solid.slice().sort((a,b)=>Math.hypot(110+a.col*80-p.x,110+a.row*80-p.y)-Math.hypot(110+b.col*80-p.x,110+b.row*80-p.y))[0];if(z){x=110+z.col*80;y=110+z.row*80;}}
 const held=[];if(Math.abs(x-p.x)>18)held.push(x>p.x?'right':'left');if(Math.abs(y-p.y)>18)held.push(y>p.y?'down':'up');trayEngine.input(w,p.id,{seq:++b.seq,action:'sync',held},now);if(Math.hypot(target.x-p.x,target.y-p.y)<110&&t>=b.dash){trayEngine.input(w,p.id,{seq:++b.seq,action:'dash',held:true},now);b.dash=t+3.4;}
 }
}
function trayPump(){
 if(!trayState?.world||!trayHost())return;const w=trayState.world,now=performance.now();if(!['countdown','play'].includes(w.phase)){trayPumpAt=now;return;}trayAccum+=Math.min(1.2,Math.max(0,(now-trayPumpAt)/1000));trayPumpAt=now;if(trayDemo&&w.phase==='play')trayBotStep(now);let n=0;while(trayAccum>=.016&&n++<75&&['countdown','play'].includes(w.phase)){trayEngine.step(w,.016,now);trayAccum-=.016;}if(n>=75)trayAccum=0;trayPublish(false);
}
function trayHousekeep(){
 trayUpdateButtons();if(!trayState)return;if(!trayDemo&&(!netIsActive()||!['setup','result'].includes(netPhase)||trayContext!==trayBaseContext())){trayCancel();if(netIsHost())netPublish();return;}
 if(!trayHost())return;const current=trayDemo?trayState.members:netMembers();let changed=false;for(const m of trayState.members)if(!current.some(p=>p.id===m.id)&&!m.left){m.left=true;if(!trayState.world)m.response='pass';if(trayState.world)trayEngine.forfeit(trayState.world,m.id);changed=true;}
 if(changed){trayRender();trayPublish(true);trayMaybeStart();}
 if(trayState.world?.phase==='play'&&trayHeld().length)trayInput('sync',trayHeld());
}
function trayUpdateButtons(){
 const active=netIsActive()&&['setup','result'].includes(netPhase);for(const id of ['trayRoomBtn','trayResultBtn']){const b=$(id);if(b){b.hidden=!active;b.disabled=netMembers().length<2;}}
}
function trayEntry(){if(trayState){trayOpen();return;}traySend({t:'trayInvite'});}
const trayTry=el('button','btn tray-try','식판 서바이벌 맛보기 ↗');trayTry.id='trayTryBtn';trayTry.type='button';trayTry.addEventListener('click',trayDemoStart);const trayHome=document.querySelector('.arcade-try-tray');trayHome?.insertBefore(trayTry,trayHome.querySelector('small'));
const trayRoomButton=el('button','tiny-btn','식판 서바이벌');trayRoomButton.id='trayRoomBtn';trayRoomButton.type='button';trayRoomButton.addEventListener('click',trayEntry);document.querySelector('.room-banner-actions')?.prepend(trayRoomButton);
const trayResultButton=el('button','btn tray-result-button','한 판 더 놀자 · 식판 서바이벌');trayResultButton.id='trayResultBtn';trayResultButton.type='button';trayResultButton.addEventListener('click',trayEntry);$('resultView').querySelector('.result-actions')?.append(trayResultButton);
document.addEventListener('keydown',e=>{if(!trayDialog?.open||!trayState?.world||e.target?.matches?.('input,textarea,select,[contenteditable="true"]'))return;const move=trayKeyMap[e.code],dash=['Space','KeyF'].includes(e.code);if(!move&&!dash)return;e.preventDefault();e.stopImmediatePropagation();if(e.repeat)return;if(dash)trayInput('dash',true);else{trayKeys.add(e.code);trayInput('sync',trayHeld());}},true);
document.addEventListener('keyup',e=>{if(!trayKeyMap[e.code])return;const had=trayKeys.delete(e.code);if(trayDialog?.open){e.preventDefault();e.stopImmediatePropagation();if(had)trayInput('sync',trayHeld());}},true);
window.addEventListener('blur',trayClearKeys);document.addEventListener('visibilitychange',()=>{if(document.hidden)trayClearKeys();});netRoom.onDisconnect(e=>{if(e.self||e.hostLost)trayCancel();});
setInterval(trayPump,32);setInterval(trayHousekeep,200);setInterval(()=>{if(trayDialog?.open&&trayState?.world?.phase==='play'&&trayHeld().length)trayInput('sync',trayHeld());},200);trayUpdateButtons();


/* ROOM_CHAT_MODEL_V1 */
const roomChatLimit=40,roomChatMaxChars=180,roomChatGap=600;
let roomChatKey='',roomChatSeq=0,roomChatMessages=[],roomChatSendSeq=0,roomChatLocalSentAt=-Infinity;
const roomChatLastAt=new Map(),roomChatSeenInput=new Map();
function roomChatText(value){if(typeof value!=='string')return null;const text=value.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();return text&&Array.from(text).length<=roomChatMaxChars?text:null;}
function roomChatReset(key=''){roomChatKey=key;roomChatSeq=0;roomChatMessages=[];roomChatSendSeq=0;roomChatLocalSentAt=-Infinity;roomChatLastAt.clear();roomChatSeenInput.clear();if(typeof roomChatChanged==='function')roomChatChanged([],true);}
function roomChatSyncRoom(){const key=netIsActive()?String(netRoom.code||''):'';if(key!==roomChatKey)roomChatReset(key);return key;}
function roomChatGetState(){if(!roomChatSyncRoom())return null;return {roomCode:roomChatKey,seq:roomChatSeq,messages:roomChatMessages.map(m=>({...m}))};}
function roomChatHandle(senderId,cmd){
 if(typeof cmd?.t!=='string'||!cmd.t.startsWith('roomChat'))return false;
 if(cmd.t!=='roomChatSend'||!netIsActive()||!netIsHost())return true;
 const room=roomChatSyncRoom(),member=netMembers().find(m=>m.id===senderId);
 if(!member||!room||cmd.roomCode!==room||!Number.isSafeInteger(cmd.seq)||cmd.seq<1||cmd.seq<=(roomChatSeenInput.get(senderId)||0))return true;
 const text=roomChatText(cmd.text);if(!text)return true;roomChatSeenInput.set(senderId,cmd.seq);
 const now=Date.now(),last=roomChatLastAt.get(senderId);if(last!==undefined&&now-last<roomChatGap)return true;roomChatLastAt.set(senderId,now);
 roomChatSeq++;const message={id:room+':'+roomChatSeq,senderId,name:Array.from(String(member.name||'참가자')).slice(0,24).join(''),text,ts:now};roomChatMessages.push(message);if(roomChatMessages.length>roomChatLimit)roomChatMessages.splice(0,roomChatMessages.length-roomChatLimit);
 if(typeof roomChatChanged==='function')roomChatChanged([message],false);if(!netApplying)netPublish();return true;
}
function roomChatReceive(data){
 if(netIsHost())return false;const room=roomChatSyncRoom();if(!room)return false;if(!data){if(roomChatMessages.length)roomChatReset(room);return false;}
 if(data.roomCode!==room||!Number.isSafeInteger(data.seq)||data.seq<0||!Array.isArray(data.messages)||data.messages.length>roomChatLimit||data.seq<data.messages.length||data.seq<roomChatSeq)return false;
 if(data.messages.some(m=>!m||typeof m.id!=='string'||m.id.length>100||!m.id.startsWith(room+':')||typeof m.senderId!=='string'||!m.senderId||m.senderId.length>128||typeof m.name!=='string'||!m.name||Array.from(m.name).length>24||!Number.isFinite(m.ts)||m.ts<0||roomChatText(m.text)!==m.text)||new Set(data.messages.map(m=>m.id)).size!==data.messages.length)return false;
 if(data.seq===roomChatSeq)return true;
 const previous=new Set(roomChatMessages.map(m=>m.id));roomChatSeq=data.seq;roomChatMessages=data.messages.map(m=>({id:m.id,senderId:m.senderId,name:m.name,text:m.text,ts:m.ts}));const fresh=roomChatMessages.filter(m=>!previous.has(m.id));if(typeof roomChatChanged==='function')roomChatChanged(fresh,false);return true;
}
/* END_ROOM_CHAT_MODEL_V1 */

let roomChatDock=null,roomChatPanel=null,roomChatList=null,roomChatInput=null,roomChatToggle=null,roomChatCounter=null,roomChatHint=null,roomChatOpen=false,roomChatUnread=0,roomChatRendered=-1,roomChatRehomeQueued=false;
function roomChatBuildMessage(message){const row=el('div','room-chat-message');row.dataset.sender=message.senderId;row.classList.toggle('room-chat-own',message.senderId===netSelfId());const top=el('div','room-chat-message-head'),author=el('b','',message.name+(message.senderId===netSelfId()?' · 나':'')),time=el('time','',new Date(message.ts).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}));time.dateTime=new Date(message.ts).toISOString();top.append(author,time);row.append(top,el('p','',message.text));return row;}
function roomChatEnsureUI(){
 if(roomChatDock)return;
 roomChatDock=el('aside','room-chat-dock');roomChatDock.id='roomChatDock';roomChatDock.hidden=true;roomChatDock.setAttribute('aria-label','같은 방 채팅');
 roomChatToggle=el('button','room-chat-toggle','💬 채팅');roomChatToggle.id='roomChatToggle';roomChatToggle.type='button';roomChatToggle.setAttribute('aria-expanded','false');roomChatToggle.setAttribute('aria-controls','roomChatPanel');
 roomChatPanel=el('section','room-chat-panel');roomChatPanel.id='roomChatPanel';roomChatPanel.hidden=true;roomChatPanel.setAttribute('aria-label','방 채팅 메시지');
 const header=el('div','room-chat-head');header.append(el('strong','','같은 방 채팅'),el('span','','지금 함께 있는 사람들'));
 roomChatList=el('div','room-chat-messages');roomChatList.id='roomChatMessages';roomChatList.setAttribute('role','log');roomChatList.setAttribute('aria-live','polite');roomChatList.setAttribute('aria-relevant','additions text');roomChatList.tabIndex=0;
 const form=el('form','room-chat-form');form.id='roomChatForm';roomChatInput=el('input','room-chat-input');roomChatInput.id='roomChatInput';roomChatInput.type='text';roomChatInput.maxLength=360;roomChatInput.autocomplete='off';roomChatInput.placeholder='한마디 남기기 · 180자';roomChatInput.setAttribute('aria-label','같은 방 채팅 입력');roomChatInput.setAttribute('enterkeyhint','send');
 const send=el('button','room-chat-send','보내기');send.type='submit';send.setAttribute('aria-label','채팅 보내기');form.append(roomChatInput,send);
 const foot=el('div','room-chat-foot');roomChatHint=el('span','','방을 나가면 대화는 남기지 않아요.');roomChatHint.id='roomChatHint';roomChatHint.setAttribute('role','status');roomChatCounter=el('small','','0 / 180');foot.append(roomChatHint,roomChatCounter);
 roomChatPanel.append(header,roomChatList,form,foot);roomChatDock.append(roomChatPanel,roomChatToggle);document.body.append(roomChatDock);
 roomChatToggle.addEventListener('click',()=>{roomChatOpen=!roomChatOpen;if(roomChatOpen)roomChatUnread=0;roomChatRender();if(roomChatOpen)roomChatInput.focus({preventScroll:true});});
 roomChatInput.addEventListener('input',()=>{const chars=Array.from(roomChatInput.value);if(chars.length>roomChatMaxChars)roomChatInput.value=chars.slice(0,roomChatMaxChars).join('');roomChatCounter.textContent=Array.from(roomChatInput.value).length+' / 180';});
 roomChatInput.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();roomChatOpen=false;roomChatRender();roomChatToggle.focus({preventScroll:true});return;}if(e.key==='Enter'&&!e.isComposing&&e.keyCode!==229){e.preventDefault();roomChatSubmit();}});
 roomChatInput.addEventListener('keyup',e=>e.stopPropagation());form.addEventListener('submit',e=>{e.preventDefault();e.stopPropagation();roomChatSubmit();});
 new MutationObserver(records=>{if(records.some(r=>r.target.tagName==='DIALOG'))roomChatQueueRehome();}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
 document.addEventListener('focusin',e=>{if(!roomChatDock.contains(e.target))roomChatQueueRehome();});
 roomChatRehome();roomChatRender();
}
function roomChatSubmit(){
 if(!netIsActive()||!roomChatInput)return;roomChatSyncRoom();const text=roomChatText(roomChatInput.value);if(!text){roomChatHint.textContent='메시지는 1~180자로 입력해주세요.';return;}
 const now=Date.now();if(now-roomChatLocalSentAt<650){roomChatHint.textContent='조금만 천천히 보내주세요.';return;}
 const sent=netRoom.send({t:'roomChatSend',roomCode:roomChatKey,seq:++roomChatSendSeq,text});if(sent===false){roomChatHint.textContent='연결을 확인하고 다시 보내주세요.';return;}
 roomChatLocalSentAt=now;roomChatInput.value='';roomChatCounter.textContent='0 / 180';roomChatHint.textContent='방을 나가면 대화는 남기지 않아요.';roomChatInput.focus({preventScroll:true});
}
function roomChatChanged(fresh,reset){
 if(reset){roomChatUnread=0;roomChatOpen=false;roomChatRendered=-1;if(roomChatInput){roomChatInput.value='';roomChatCounter.textContent='0 / 180';}}
 else if(!roomChatOpen)roomChatUnread=Math.min(roomChatLimit,roomChatUnread+fresh.filter(m=>m.senderId!==netSelfId()).length);
 if(roomChatDock)roomChatRender();
}
function roomChatRender(){
 if(!roomChatDock)return;roomChatDock.hidden=!netIsActive();roomChatPanel.hidden=!roomChatOpen;roomChatToggle.setAttribute('aria-expanded',String(roomChatOpen));roomChatToggle.textContent='💬 채팅'+(!roomChatOpen&&roomChatUnread?' · '+roomChatUnread:'');
 if(roomChatRendered===roomChatSeq)return;const stick=roomChatList.scrollHeight-roomChatList.clientHeight-roomChatList.scrollTop<40,ownLast=roomChatMessages.at(-1)?.senderId===netSelfId();roomChatList.replaceChildren();if(!roomChatMessages.length)roomChatList.append(el('p','room-chat-empty','같은 방 친구들에게 한마디 해보세요.'));else for(const message of roomChatMessages)roomChatList.append(roomChatBuildMessage(message));roomChatRendered=roomChatSeq;if(stick||ownLast)roomChatList.scrollTop=roomChatList.scrollHeight;
}
function roomChatQueueRehome(){if(roomChatRehomeQueued)return;roomChatRehomeQueued=true;queueMicrotask(()=>{roomChatRehomeQueued=false;roomChatRehome();});}
function roomChatRehome(){if(!roomChatDock)return;const dialogs=[...document.querySelectorAll('dialog[open]')],focused=document.activeElement?.closest?.('dialog[open]'),target=focused||dialogs.at(-1)||document.body;if(roomChatDock.parentElement!==target)target.append(roomChatDock);roomChatDock.dataset.inDialog=String(target!==document.body);}
function roomChatTick(){roomChatSyncRoom();if(!roomChatDock)roomChatEnsureUI();roomChatRender();roomChatRehome();}
netRoom.onReady(()=>{roomChatSyncRoom();roomChatTick();});netRoom.onDisconnect(e=>{if(e.self||e.hostLost){roomChatReset('');roomChatTick();}});setInterval(roomChatTick,250);roomChatTick();

/* PARTY_MINIGAMES_END */




















/* FIVE_NEW_GAMES_START */
