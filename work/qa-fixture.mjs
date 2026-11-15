// Isolated preview fixture. Never included in index.html.
setTimeout(()=>{
 const query=new URL(location.href).searchParams,phase=query.get('phase')||'setup',count=Math.max(2,Math.min(8,Number(query.get('count')||8)));
 if(phase==='lobby')return;
 netIsActive=()=>true;netIsHost=()=>true;netSelfId=()=> 'qa0';
 netRoom.broadcast=()=>{};netRoom.setLocked=()=>{};netRoom.send=cmd=>{netHandle('qa0',cmd);return true;};
 Object.defineProperty(netRoom,'code',{get:()=> 'QA8888'});
 netRoster=Array.from({length:count},(_,i)=>({id:'qa'+i,name:['정훈','밥친구','공나영','점심친구','마케팅친구','커피친구','오늘의메뉴','함께놀자'][i],consent:true,connected:true}));
 netDepartments=Object.fromEntries(netRoster.map((m,i)=>[m.id,deptOptions[(i*11+8)%deptOptions.length].id]));
 if(phase==='unselected')netDepartments={};
 netReady={};netPicks=Object.fromEntries(netRoster.map((m,i)=>[m.id,[['김치찌개','돈가스','제육덮밥'][i%3]]]));netPhase='setup';
 document.body.classList.remove('online-pending');$('roomLobby').hidden=true;showSetup();
 const qaFreeze=()=>{arcadeAdvanceWorld=()=>0;arcadeClockSeconds=()=>20;};if(['audit','game','practice-series'].includes(phase))qaFreeze();
 const qaInfo=()=>{if(query.get('info')==='open'&&$('deviceInfoToggle')?.getAttribute('aria-expanded')==='false')$('deviceInfoToggle').click();};
 if(phase==='menu'){arcadeEntry();return;}
 if(phase==='scores'){
  arcadeHousekeep=()=>{};netReady=Object.fromEntries(netRoster.map(m=>[m.id,true]));netBeginMenuTournament();
  for(let round=0;round<5;round++){
   const session=arcadeState,world=session.world,others=netRoster.slice(1),offset=Math.max(0,(round-1)*2)%others.length,rotated=others.slice(offset).concat(others.slice(0,offset)),order=round===0?others.concat(netRoster[0]):[netRoster[0],...rotated];
   world.phase='play';world.players.forEach(p=>{p.score=(count-order.findIndex(m=>m.id===p.id))*100;});arcadeEngine.complete(world);arcadeResolveRound();if(arcadeState?.phase==='between')arcadeStartWorld();
  }
  if(query.get('scene')==='results')awardCompleteFlow();return;
 }
 if(phase==='practice-series'){
  netIsActive=()=>false;netIsHost=()=>false;deptPracticeChoice='business';arcadeDemoStart('coins','tournament');arcadeHousekeep=()=>{};arcadeRender();qaInfo();return;
 }
 if(phase==='audit'){
  arcadeHousekeep=()=>{};const rows=[],keys=[...arcadeGameKeys];let index=0;
  const next=()=>{if(index===keys.length){const output=el('output');output.id='qaLayoutReport';output.style.cssText='position:fixed;left:4px;top:4px;z-index:10000;padding:8px;background:#fff;color:#211;max-width:95vw;max-height:40vh;overflow:auto;font:11px monospace;white-space:pre-wrap';output.textContent=JSON.stringify({width:innerWidth,height:innerHeight,count,checked:rows.length,issues:rows.filter(r=>!r.ok||r.over.length),rows});document.body.append(output);return;}
   const key=keys[index++];arcadeCancel();netPhase='setup';netReady=Object.fromEntries(netRoster.map(m=>[m.id,true]));arcadeRandomGame=()=>key;netBeginMenuTournament();arcadeState.world.phase='play';arcadeState.world.elapsed=2;arcadeRender();qaInfo();
   requestAnimationFrame(()=>requestAnimationFrame(()=>{const board=$('arcadeBoard'),b=board.getBoundingClientRect(),h=($('gameGuide')||$('arcadeHelp')).getBoundingClientRect(),c=$('arcadeControls').getBoundingClientRect(),hit=(a,b)=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1;const over=[...board.querySelectorAll('.brain-layer,.brain-receipt-ticket,.brain-safe-door,.brain-memory-lights,.brain-bidders,.sports-courts,.sport-court.is-own,.ten-restaurants,.ten-restaurant,.ap-traffic-safe,.five-meter-row.is-own')].filter(e=>e.clientHeight&&e.scrollHeight>e.clientHeight+1).map(e=>[e.className,e.scrollHeight-e.clientHeight]);rows.push({game:key,ok:!hit(b,h)&&!hit(b,c)&&c.right<=innerWidth+1&&c.bottom<=innerHeight+1,noSelection:[...$('arcadeControls').querySelectorAll('button')].every(e=>getComputedStyle(e).userSelect==='none'),over});next();}));
  };next();return;
 }
 if(phase==='game'){
  netReady=Object.fromEntries(netRoster.map(m=>[m.id,true]));const game=query.get('game')||'frogger';arcadeRandomGame=()=>game;netBeginMenuTournament();arcadeState.world.phase='play';arcadeState.world.elapsed=2;arcadeHousekeep=()=>{};
  const w=arcadeState.world,p=w.players[0];
  if(game==='crown'&&query.get('scene')==='owner'){p.x=350;p.y=230;arcadeEngine.step(w,.02,2020);}
  if(game==='tray'&&query.get('scene')==='fallen'){p.x=-30;arcadeEngine.step(w,.02,2020);}
  arcadeRender();qaInfo();return;
 }
 if(phase==='gallery'){
  const dialog=el('dialog');dialog.style.cssText='max-width:96vw;width:1100px;max-height:94dvh;padding:20px;overflow:auto';const heading=el('h2','','학과별 밥친구 · 118개 학과/전공');dialog.append(heading);const grid=el('div');grid.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px';for(const d of deptOptions.filter(d=>d.id!=='facility')){const card=el('article');card.style.cssText='padding:10px;border:1px solid #a6987c;background:#fff4d8;border-radius:12px;text-align:center;font-size:12px';const art=el('div');art.innerHTML=deptAvatarSvg(d.id);art.style.cssText='width:120px;margin:auto';card.append(art,el('strong','',d.name),el('p','',d.college));grid.append(card);}dialog.append(grid);document.body.append(dialog);dialog.showModal();return;
 }
 if(['ending','duel'].includes(phase)){
  netPhase='result';result={id:'qa-meal',menu:'김치찌개',person:netRoster[0].name,winnerId:'qa0',time:new Date().toISOString(),nominations:netRoster.map(m=>({id:m.id,person:m.name,menus:netPicks[m.id]})),source:'tournament',provisional:true,duelCount:0,mission:'',tournamentHistory:[]};
  lunchDecisionBegin(result);renderResult();if(phase==='duel'){lunchDecisionObject('qa1');return;}for(const m of netRoster)lunchDecisionHandle(m.id,{t:'lunchAccept',roundId:result.id,version:lunchDecisionState.version});
  for(const [i,m]of netRoster.entries())deliveryHandle(m.id,{t:'deliveryReply',deliveryId:deliveryState.id,roundId:result.id,seq:1,response:'join',drink:['아이스 아메리카노','카페라떼','바닐라 라떼','디카페인 아메리카노'][i%4]});
  deliveryState.phase='done';deliveryState.winnerId='qa1';deliveryState.needsRedraw=false;deliveryRender();lunchFinaleOpen(true);
  if(['coffee','credits','outro'].includes(query.get('scene'))){const target={coffee:2,credits:4,outro:5}[query.get('scene')],state=lunchFinaleGetState(),offset=state.sceneTimes[target]+400,frozenNow=lunchFinaleNow();if(target>=4)lunchFinaleNow=()=>frozenNow;state.startAt-=offset;state.endAt-=offset;lunchFinaleInstallSchedule(state,Date.now());lunchFinaleStartedAt=lunchFinaleLocalStart;lunchFinaleAdvance();}
 }
},0);
