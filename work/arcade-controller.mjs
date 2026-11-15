/* ARCADE_CONTROLLER_V1 */
const arcadeEngine=createArcadeEngine(),arcadeGameKeys=typeof arcadeGames==='object'&&arcadeGames?Object.keys(arcadeGames):['sneak','dodge','coins','stamp','runner'];
let arcadeState=null,arcadeDemo=false,arcadeInputSeq=0,arcadeLastPublish=0,arcadePumpAt=0,arcadeAccum=0,arcadePrevious=null,arcadeReceivedAt=0,arcadeLastWorldId='',arcadeBotAt=0,arcadeHeartbeatAt=0;
const arcadeBotSeq=new Map(),arcadeBotBrains=new Map();
let arcadeClock=null,arcadeClockOffset=0;
const arcadeFixedStepMs=16,arcadeMaxCatchupSteps=64;
function arcadeStartClock(w,now){const countdown=w.phase==='countdown'?w.countdown*1000:0;arcadeClock={worldId:w.id,countdownEnd:now+countdown-w.elapsed*1000,end:now+countdown+(w.duration-w.elapsed)*1000};arcadePumpAt=now;arcadeAccum=0;}
function arcadeServerNow(){return Date.now()+(arcadeHost()?0:arcadeClockOffset);}
function arcadeClockSeconds(w){if(!w)return 0;if(arcadeHost()&&arcadeClock?.worldId===w.id){const deadline=w.phase==='countdown'?arcadeClock.countdownEnd:arcadeClock.end;return Math.max(0,(deadline-performance.now())/1000);}const clock=arcadeState?.clock;if(clock?.worldId===w.id)return Math.max(0,((w.phase==='countdown'?clock.countdownEndAt:clock.endAt)-arcadeServerNow())/1000);return w.phase==='countdown'?Math.max(0,w.countdown):Math.max(0,w.duration-w.elapsed);}
function arcadeAdvanceWorld(now){
 const s=arcadeState,w=s?.world;if(!arcadeHost()||s?.phase!=='round'||!w||w.phase==='done'||!Number.isFinite(now))return 0;if(arcadeClock?.worldId!==w.id)arcadeStartClock(w,now);
 arcadeAccum+=Math.max(0,now-arcadePumpAt);arcadePumpAt=now;let steps=0,resyncedCountdown=false;
 while(arcadeAccum>=arcadeFixedStepMs&&w.phase!=='done'&&steps<arcadeMaxCatchupSteps){arcadeEngine.step(w,arcadeFixedStepMs/1000,now);arcadeAccum-=arcadeFixedStepMs;steps++;}
 if(w.phase==='done'){arcadeAccum=0;return steps;}
 // Countdown has no physics. Reconcile it directly after a throttled callback.
 if(w.phase==='countdown'&&(arcadeAccum>=arcadeFixedStepMs||now>=arcadeClock.countdownEnd)){w.countdown=Math.max(0,(arcadeClock.countdownEnd-now)/1000);arcadeAccum=0;if(w.countdown<=1e-8){arcadeEngine.step(w,arcadeFixedStepMs/1000,now);steps++;resyncedCountdown=true;}}
 // Long suspensions must not replay thousands of frames or extend the deadline.
 // One final rule tick still resolves timed scoring/stage changes before ranking.
 if(w.phase==='play'&&(resyncedCountdown||arcadeAccum>=arcadeFixedStepMs||now>=arcadeClock.end)){
  const target=Math.min(w.duration,Math.max(w.elapsed,(now-arcadeClock.countdownEnd)/1000)),dt=Math.min(arcadeFixedStepMs/1000,Math.max(0,target-w.elapsed));
  if(dt>1e-8){w.elapsed=target-dt;arcadeEngine.step(w,dt,now);steps++;}else if(now>=arcadeClock.end){arcadeEngine.complete(w);}
  arcadeAccum=0;
 }
 return steps;
}
let arcadeRandomBag=null;
function arcadeGamePool(count){const excluded=new Set(['sneak','dodge','coins','doors']);const selected=count===2?arcadeGameKeys.filter(k=>{const meta=typeof arcadeGames==='object'?arcadeGames[k]:null;return meta?.duel===false?false:meta?.duel===true?true:!excluded.has(k);}):[...arcadeGameKeys];return selected.length?selected:[...arcadeGameKeys];}
function arcadeSelf(){return arcadeDemo?'arcade-you':netSelfId();}
function arcadeHost(){return arcadeDemo||netIsHost();}
function arcadeClone(v){return v?JSON.parse(JSON.stringify(v)):null;}
function arcadeBaseContext(){return netPhase+':'+(result?.id||'setup');}
function arcadeBusy(){return !!arcadeState&&['invite','round','between'].includes(arcadeState.phase);}
function arcadeRenderSafe(){if(typeof arcadeRequestRender==='function')arcadeRequestRender();else if(typeof arcadeRender==='function')arcadeRender();if(typeof arcadeUpdateButtons==='function')arcadeUpdateButtons();}
function arcadeGetState(){if(arcadeDemo||!netIsActive()||!arcadeState)return null;const state=arcadeClone(arcadeState);if(netIsHost()){state.serverNow=Date.now();if(arcadeClock?.worldId===state.world?.id){const now=performance.now();state.clock={worldId:state.world.id,countdownEndAt:state.serverNow+arcadeClock.countdownEnd-now,endAt:state.serverNow+arcadeClock.end-now};}}return state;}
function arcadePublish(force=false){if(arcadeDemo||!netIsHost()||netApplying)return;const n=performance.now();if(!force&&n-arcadeLastPublish<80)return;arcadeLastPublish=n;netPublish();}
function arcadeSend(cmd){if(arcadeDemo)return arcadeHandle(arcadeSelf(),cmd);return netRoom.send(cmd);}
function arcadeInput(action,held){if(!arcadeState?.world)return false;return arcadeSend({t:'arcadeInput',gameId:arcadeState.id,worldId:arcadeState.world.id,seq:++arcadeInputSeq,action,held});}
function arcadeCancel(){arcadeState=null;arcadeDemo=false;arcadePrevious=null;arcadeLastWorldId='';arcadeRandomBag=null;arcadeClock=null;arcadeClockOffset=0;arcadeAccum=0;arcadeBotSeq.clear();arcadeBotBrains.clear();if(typeof arcadeClearKeys==='function')arcadeClearKeys();if(typeof arcadeDialog!=='undefined')arcadeDialog?.close();arcadeRenderSafe();}
function arcadeClose(){
 if(!arcadeState){if(typeof arcadeDialog!=='undefined')arcadeDialog?.close();return;}
 if(arcadeDemo){arcadeCancel();return;}
 const s=arcadeState,m=s.members.find(m=>m.id===arcadeSelf());
 if(s.purpose==='lunch'){if(typeof arcadeClearKeys==='function')arcadeClearKeys();if(typeof arcadeDialog!=='undefined')arcadeDialog?.close();return;}
 if(m?.response==='pending')arcadeSend({t:'arcadeReply',gameId:s.id,response:'pass'});
 if(['round','between'].includes(s.phase)&&s.activeIds.includes(arcadeSelf()))arcadeSend({t:'arcadeForfeit',gameId:s.id});
 if(typeof arcadeClearKeys==='function')arcadeClearKeys();if(typeof arcadeDialog!=='undefined')arcadeDialog?.close();
}
function arcadeMakeState(mode,game,members){const s={id:'arcade_'+Date.now()+'_'+rand(1000000),roomCode:arcadeDemo?'practice':String(netRoom.code||''),context:arcadeBaseContext(),phase:'invite',purpose:'arcade',mode,chosen:game,members,activeIds:[],round:0,history:[],world:null,championIds:[],nextAt:0,lastGame:'',tiebreakIds:[],safeIds:[],notice:''};if(mode==='tournament')arcadeInitPoints(s);return s;}
function arcadeIsPoints(s=arcadeState){return s?.mode==='tournament'&&s.format==='points';}
function arcadePointsSync(s){const present=arcadeDemo||!netIsActive()?null:new Set(netMembers().map(m=>m.id));s.activeIds=s.members.filter(m=>m.response==='join'&&!m.left&&!m.forfeited&&(!present||present.has(m.id))).map(m=>m.id);s.safeIds=[];s.tiebreakIds=s.tiebreakIds.filter(id=>s.activeIds.includes(id));return s.activeIds;}
function arcadeInitPoints(s=arcadeState){if(!s||s.mode!=='tournament')return false;if(s.format==='points')return true;s.format='points';s.pointRoundLimit=5;s.pointRounds=0;s.totalPoints=Object.fromEntries(s.members.map(m=>[m.id,0]));s.pointsStage='regular';s.pointsTiebreaks=0;s.tieReason='';s.representativeId='';s.tiebreakIds=[];arcadePointsSync(s);return true;}
function arcadePointsStandings(s=arcadeState){
 if(!arcadeIsPoints(s))return [];const active=new Set(s.activeIds),rows=s.members.filter(m=>m.response==='join').map((member,index)=>({id:member.id,name:member.name,department:member.department,member,index,points:s.totalPoints?.[member.id]||0,rank:null,left:!!member.left,forfeited:!!member.forfeited,eligible:active.has(member.id)})).sort((a,b)=>Number(b.eligible)-Number(a.eligible)||b.points-a.points||a.index-b.index);
 let rank=0,last=null;for(const [index,row]of rows.entries())if(row.eligible){if(row.points!==last)rank=index+1;row.rank=rank;last=row.points;}return rows;
}
function arcadePointsFinish(){
 const s=arcadeState;if(!arcadeIsPoints(s))return false;if(s.phase==='done')return true;arcadePointsSync(s);const standings=arcadePointsStandings(s),leaders=standings.filter(p=>p.rank===1),winner=leaders.length?leaders[leaders.length===1?0:rand(leaders.length)]:null;s.phase='done';s.nextAt=0;s.tiebreakIds=[];s.safeIds=[];s.championIds=leaders.map(p=>p.id);s.representativeId=winner?.id||'';s.tieReason=leaders.length>1?'누적 점수 공동 1위 · 대표 메뉴 추첨':'';s.notice=winner?(leaders.length>1?leaders.map(p=>p.name).join(' · ')+' 님 공동 1위! 누적 '+winner.points+'점 · 순위는 함께 유지하고, 대표 메뉴만 한 번 추첨했어요.':winner.name+' 님 누적 '+winner.points+'점으로 최종 1위!')+(s.pointRounds<s.pointRoundLimit?' · 참가자 기권으로 경기를 마쳤어요.':''):'남은 참가자가 없어 점수전을 마쳤어요.';
 if(s.purpose==='lunch'&&typeof netFinishMenuTournament==='function'){netFinishMenuTournament(s);return true;}arcadeRenderSafe();arcadePublish(true);return true;
}
function arcadePointsFinal(s){if(s!==arcadeState)return false;return arcadePointsFinish();}
function arcadeResolvePoints(s,w,results){
 arcadePointsSync(s);results=results.map(r=>({...r,forfeited:r.forfeited||!!s.members.find(m=>m.id===r.id)?.forfeited||!s.activeIds.includes(r.id)}));
 const count=results.length,pointAwards=results.map(r=>({id:r.id,points:r.forfeited?0:Math.max(0,count-r.rank+1)}));for(const award of pointAwards)s.totalPoints[award.id]+=award.points;s.pointRounds++;
 s.history.push({round:s.round,game:w.game,results,outIds:[],pointAwards,pointsRound:s.pointRounds,tiebreak:false});
 if(s.activeIds.length<2||s.pointRounds>=s.pointRoundLimit)return arcadePointsFinal(s);
 arcadeBetween('ROUND '+s.pointRounds+'/'+s.pointRoundLimit+' 완료 · 순위 점수를 더했어요. 전원 다음 경기!');return true;
}
function arcadeInvite(senderId,mode,game){
 if(!netIsHost()||!['setup','result'].includes(netPhase)||netMembers().length<2||!['single','tournament'].includes(mode)||!arcadeGameKeys.includes(game))return false;
 if(typeof trayBusy==='function'&&trayBusy()||typeof coffeeState!=='undefined'&&coffeeState&&['invite','play'].includes(coffeeState.phase)){notify('지금 게임을 마치고 새 게임을 시작해주세요.');return false;}
 if(arcadeBusy())return true;
 arcadeState=arcadeMakeState(mode,game,netMembers().map(m=>({id:m.id,name:m.name,department:netDepartment(m.id),response:'pending'})));arcadeInputSeq=0;arcadePrevious=null;arcadeBotSeq.clear();arcadeBotBrains.clear();arcadeOpen();arcadeRenderSafe();arcadePublish(true);return true;
}
function arcadeRandomGame(previous,count){const pool=arcadeGamePool(count),session=arcadeState?.id||'',signature=pool.join('|');if(!arcadeRandomBag||arcadeRandomBag.session!==session||arcadeRandomBag.signature!==signature)arcadeRandomBag={session,signature,remaining:[...pool]};if(!arcadeRandomBag.remaining.length)arcadeRandomBag.remaining=[...pool];let choices=arcadeRandomBag.remaining.filter(k=>k!==previous);if(!choices.length)choices=[...arcadeRandomBag.remaining];const previousFamily=typeof arcadeGames==='object'?arcadeGames[previous]?.family:'';if(previousFamily){const otherFamilies=choices.filter(key=>arcadeGames[key]?.family!==previousFamily);if(otherFamilies.length)choices=otherFamilies;}const game=choices[rand(choices.length)];arcadeRandomBag.remaining=arcadeRandomBag.remaining.filter(k=>k!==game);return game;}
function arcadeStartWorld(){
 const s=arcadeState;if(!s||!arcadeHost()||!['invite','between'].includes(s.phase))return false;arcadeInitPoints(s);if(arcadeIsPoints(s))arcadePointsSync(s);const ids=(s.tiebreakIds.length?s.tiebreakIds:s.activeIds).filter(id=>s.activeIds.includes(id));
 if(ids.length<2){arcadeFinishTournament();return;}const game=s.mode==='single'?s.chosen:arcadeRandomGame(s.lastGame,ids.length);
 s.round++;s.lastGame=game;s.phase='round';s.nextAt=0;s.world=arcadeEngine.create({id:s.id+':'+s.round,game,participants:ids.map(id=>s.members.find(m=>m.id===id)),seed:rand(0xffffffff)});
 if(s.tiebreakIds.length)s.world.duration=Math.min(s.world.duration,16);s.world.meta.tiebreak=s.tiebreakIds.length>0;s.world.meta.safeIds=[...s.safeIds];if(arcadeIsPoints(s)){s.world.meta.pointsStage='regular';s.world.meta.pointsRound=s.pointRounds+1;s.world.meta.partyRespawn=true;}
 arcadeInputSeq=0;arcadeLastWorldId=s.world.id;arcadeBotSeq.clear();arcadeBotBrains.clear();arcadeBotAt=0;arcadeStartClock(s.world,performance.now());arcadePrevious=null;const poolLabel=s.mode==='single'?'선택한 게임 · 단판 승부':ids.length===2?'2인전 전용 '+arcadeGamePool(2).length+'종':'파티전 '+arcadeGamePool(ids.length).length+'종';s.notice=poolLabel+' · '+(arcadeIsPoints(s)?'전원 참여 '+(s.pointRounds+1)+'/'+s.pointRoundLimit+'경기 · 탈락 없이 순위 점수를 합산해요.':s.tiebreakIds.length?'최하위 동점! 동점자끼리 재경기 · 나머지는 다음 라운드 진출':'매판 다른 게임! 이번 판에서 살아남으세요.');arcadeRenderSafe();arcadePublish(true);
}
function arcadeMaybeStart(){const s=arcadeState;if(!s||!arcadeHost()||s.phase!=='invite'||s.members.some(m=>m.response==='pending'))return;const joined=s.members.filter(m=>m.response==='join'&&!m.left);if(joined.length<2){const hint='2명 이상 준비해야 시작할 수 있어요. 참가 또는 관전을 다시 골라주세요.';if(s.notice!==hint){s.notice=hint;arcadeRenderSafe();arcadePublish(true);}return;}s.activeIds=joined.map(m=>m.id);arcadeStartWorld();}
function arcadeFinishTournament(){const s=arcadeState;if(!s)return;if(arcadeIsPoints(s)){arcadePointsSync(s);if(s.activeIds.length<2||s.pointRounds>=s.pointRoundLimit)return arcadePointsFinish();return false;}s.phase='done';s.nextAt=0;s.tiebreakIds=[];s.safeIds=[];s.championIds=[...s.activeIds];s.notice=s.championIds.length?'최후의 생존자! 토너먼트 우승!':'참가자가 모두 나가 경기를 마쳤어요.';if(s.purpose==='lunch'&&typeof netFinishMenuTournament==='function'){netFinishMenuTournament(s);return;}arcadeRenderSafe();arcadePublish(true);}
function arcadeBetween(notice){const s=arcadeState;if(!s)return;if(arcadeIsPoints(s))arcadePointsSync(s);if(s.activeIds.length<=1){arcadeFinishTournament();return;}s.phase='between';s.nextAt=Date.now()+(arcadeIsPoints(s)?3500:5000);s.notice=notice;arcadeRenderSafe();arcadePublish(true);}
function arcadeResolveRound(){
 const s=arcadeState,w=s?.world;if(!s||s.phase!=='round'||w?.phase!=='done')return;
 const results=w.ranking.map(p=>({id:p.id,score:p.score,rank:p.rank,forfeited:!!p.forfeited}));
 if(arcadeIsPoints(s)){arcadeResolvePoints(s,w,results);return;}
 if(s.mode==='single'){s.history.push({round:s.round,game:w.game,results,outIds:[]});s.championIds=[...w.winnerIds];s.phase='done';s.notice=s.championIds.length>1?'공동 우승! 한 판 더?':'이번 판 우승!';arcadeRenderSafe();arcadePublish(true);return;}
 const playing=results.filter(p=>s.activeIds.includes(p.id)),departed=playing.filter(p=>p.forfeited||s.members.find(m=>m.id===p.id)?.left).map(p=>p.id);
 let outIds=[];
 if(departed.length)outIds=departed;
 else if(playing.length){const worst=Math.min(...playing.map(p=>p.score)),tied=playing.filter(p=>Math.abs(p.score-worst)<1e-6).map(p=>p.id);if(tied.length===1)outIds=tied;else{s.tiebreakIds=tied;s.safeIds=s.activeIds.filter(id=>!tied.includes(id));s.history.push({round:s.round,game:w.game,results,outIds:[]});if(s.history.length>60)s.history.shift();arcadeBetween('최하위가 동점이에요. 동점자끼리 다른 랜덤 게임으로 재경기!');return;}}
 s.activeIds=s.activeIds.filter(id=>!outIds.includes(id));s.tiebreakIds=[];s.safeIds=[];s.history.push({round:s.round,game:w.game,results,outIds});if(s.history.length>60)s.history.shift();arcadeBetween(outIds.map(id=>s.members.find(m=>m.id===id)?.name||'참가자').join(', ')+' 탈락! 잠시 후 다음 랜덤 게임.');
}
function arcadeForfeit(id){
 const s=arcadeState;if(!s)return;const m=s.members.find(m=>m.id===id);if(!m||m.response!=='join'||!s.activeIds.includes(id))return;
 if(s.world&&['countdown','play'].includes(s.world.phase))arcadeEngine.forfeit(s.world,id);
 s.activeIds=s.activeIds.filter(v=>v!==id);s.tiebreakIds=s.tiebreakIds.filter(v=>v!==id);s.safeIds=s.safeIds.filter(v=>v!==id);m.forfeited=true;
 if(arcadeIsPoints(s)){
  arcadePointsSync(s);if(s.phase==='round'&&s.world){const playing=s.world.players.filter(p=>!p.forfeited&&s.activeIds.includes(p.id));if(playing.length<2){arcadeEngine.complete(s.world);arcadeResolveRound();}else{arcadeRenderSafe();arcadePublish(true);}return;}
  if(s.phase==='between'){if(s.activeIds.length<2)return arcadePointsFinish();s.notice=m.name+' 님 기권 · 남은 참가자는 점수전을 계속해요.';arcadeRenderSafe();arcadePublish(true);return;}
 }
 if(s.mode==='tournament'&&['round','between'].includes(s.phase)){
  if(s.phase==='round'&&s.world){arcadeEngine.complete(s.world);s.history.push({round:s.round,game:s.world.game,results:s.world.ranking.map(p=>({id:p.id,score:p.score,rank:p.rank,forfeited:!!p.forfeited})),outIds:[id]});if(s.history.length>60)s.history.shift();}
  else{const last=s.history.at(-1);if(last&&!last.outIds.includes(id))last.outIds.push(id);}
  s.tiebreakIds=[];s.safeIds=[];arcadeBetween(m.name+' 님 기권. 나머지 참가자는 다음 랜덤 게임으로!');return;
 }
 if(s.mode==='single'&&s.world&&s.activeIds.length<=1){arcadeEngine.complete(s.world);arcadeResolveRound();return;}
 arcadeRenderSafe();arcadePublish(true);
}
function arcadeDemoStart(game='coins',mode='single'){
 if(!arcadeGameKeys.includes(game)||!['single','tournament'].includes(mode)||arcadeState?.purpose==='lunch'&&arcadeBusy())return false;if(!deptPracticeRequire(()=>arcadeDemoStart(game,mode)))return false;if(arcadeState)arcadeCancel();
 arcadeDemo=true;const members=[{id:'arcade-you',name:'내 캐릭터',department:deptPracticeChoice},...['반찬도둑','월급요정','퇴근장인'].map((name,i)=>({id:'arcade-bot-'+i,name,department:['accounting','hotel','tourism'][i]}))].map(m=>({...m,response:'join'}));
 arcadeState=arcadeMakeState(mode,game,members);arcadeState.difficulty='normal';arcadeState.activeIds=members.map(m=>m.id);arcadeOpen();arcadeStartWorld();return true;
}
function arcadeHandle(senderId,cmd){
 if(typeof cmd?.t!=='string')return false;const own=cmd.t.startsWith('arcade');if(!own)return arcadeBusy();
 if(!arcadeHost()||!arcadeDemo&&(!netIsActive()||!netMembers().some(m=>m.id===senderId)))return true;
 if(cmd.t==='arcadeInvite'){arcadeInvite(senderId,cmd.mode||'single',cmd.game||'coins');return true;}
 const s=arcadeState;if(!s||cmd.gameId!==s.id)return true;const m=s.members.find(m=>m.id===senderId);if(!m)return true;
 if(cmd.t==='arcadeCancel'&&senderId===arcadeSelf()){if(s.purpose==='lunch'&&typeof netCancelMenuTournament==='function')netCancelMenuTournament();else{arcadeCancel();if(netIsHost())netPublish();}return true;}
 if(cmd.t==='arcadeReply'&&s.phase==='invite'&&['join','pass'].includes(cmd.response)&&!m.left){m.response=cmd.response;arcadeRenderSafe();arcadePublish(true);arcadeMaybeStart();return true;}
 if(cmd.t==='arcadeInput'&&s.phase==='round'&&s.activeIds.includes(senderId)&&s.world&&cmd.worldId===s.world.id){const now=performance.now();arcadeAdvanceWorld(now);arcadeResolveRound();if(arcadeState!==s||s.phase!=='round'||cmd.worldId!==s.world?.id)return true;if(arcadeEngine.input(s.world,senderId,cmd,now)){arcadeRenderSafe();arcadePublish(false);}return true;}
 if(cmd.t==='arcadeForfeit'&&m.response==='join'&&['round','between'].includes(s.phase)){arcadeForfeit(senderId);return true;}return true;
}
function arcadeValidatePoints(data){
 if(data.mode!=='tournament')return data.purpose!=='lunch'&&data.format!=='points';
 if(data.format!=='points'||data.pointRoundLimit!==5||!Number.isInteger(data.pointRounds)||data.pointRounds<0||data.pointRounds>5||data.pointsStage!=='regular'||data.pointsTiebreaks!==0||typeof data.tieReason!=='string'||data.tieReason.length>140||typeof data.representativeId!=='string'||!data.totalPoints||Array.isArray(data.totalPoints)||typeof data.totalPoints!=='object'||data.history.length>5||data.tiebreakIds.length||data.safeIds.length)return false;
 const ids=data.members.map(m=>m.id),totals=Object.fromEntries(ids.map(id=>[id,0]));if(data.members.some(m=>m.left!==undefined&&typeof m.left!=='boolean'||m.forfeited!==undefined&&typeof m.forfeited!=='boolean')||Object.keys(data.totalPoints).length!==ids.length||Object.keys(data.totalPoints).some(id=>!ids.includes(id))||ids.some(id=>!Number.isSafeInteger(data.totalPoints[id])||data.totalPoints[id]<0||data.totalPoints[id]>40))return false;
 const joined=new Set(data.members.filter(m=>m.response==='join').map(m=>m.id)),eligible=data.members.filter(m=>m.response==='join'&&!m.left&&!m.forfeited).map(m=>m.id);if(eligible.length!==data.activeIds.length||eligible.some(id=>!data.activeIds.includes(id)))return false;
 let regular=0;const retired=new Set();for(const [i,h]of data.history.entries()){
  if(!h||h.round!==i+1||!Array.isArray(h.outIds)||h.outIds.length||h.tiebreak!==false||!Array.isArray(h.pointAwards)||!Array.isArray(h.results)||h.results.length<2||h.results.length>8||h.results.some(r=>!r||!joined.has(r.id)||retired.has(r.id)||!Number.isFinite(r.score)||!Number.isInteger(r.rank)||r.rank<1||r.rank>h.results.length||typeof r.forfeited!=='boolean')||new Set(h.results.map(r=>r.id)).size!==h.results.length||eligible.some(id=>!h.results.some(r=>r.id===id))||h.pointsRound!==++regular||h.pointAwards.length!==h.results.length||new Set(h.pointAwards.map(a=>a?.id)).size!==h.pointAwards.length||h.tieReason!==undefined||h.lotteryWinnerId!==undefined)return false;
  const ranked=[...h.results].sort((a,b)=>Number(a.forfeited)-Number(b.forfeited)||b.score-a.score);let rank=0,last='';for(const [position,r]of ranked.entries()){const key=String(r.forfeited)+':'+r.score;if(key!==last)rank=position+1;last=key;if(r.rank!==rank)return false;const award=h.pointAwards.find(a=>a&&a.id===r.id),expected=r.forfeited?0:h.results.length-r.rank+1;if(!award||award.points!==expected)return false;totals[r.id]+=award.points;if(r.forfeited)retired.add(r.id);}
 }
 if(regular!==data.pointRounds||ids.some(id=>totals[id]!==data.totalPoints[id])||data.round!==data.history.length+Number(data.phase==='round')||data.phase!=='done'&&regular===5)return false;
 const w=data.world;if(w&&(w.meta.partyRespawn!==true||w.meta.tiebreak!==false||w.meta.pointsStage!=='regular'||w.meta.pointsRound!==regular+Number(data.phase==='round')||eligible.some(id=>!w.players.some(p=>p.id===id))||w.players.some(p=>!joined.has(p.id))||data.phase!=='round'&&w.phase!=='done'))return false;
 if(data.phase==='done'){
  if(regular<5&&eligible.length>1)return false;const best=eligible.length?Math.max(...eligible.map(id=>totals[id])):null,leaders=eligible.filter(id=>totals[id]===best);if(data.championIds.length!==leaders.length||leaders.some(id=>!data.championIds.includes(id))||(leaders.length?!leaders.includes(data.representativeId):data.representativeId!==''))return false;
  if(data.tieReason!==(leaders.length>1?'누적 점수 공동 1위 · 대표 메뉴 추첨':''))return false;
 }else if(data.championIds.length||data.representativeId||data.tieReason)return false;
 return true;
}
function arcadeValidate(data){
 if(!data||!['arcade','lunch'].includes(data.purpose||'arcade')||typeof data.id!=='string'||data.id.length>100||data.roomCode!==String(netRoom.code||'')||data.context!==arcadeBaseContext()||!['invite','round','between','done'].includes(data.phase)||!['single','tournament'].includes(data.mode)||!arcadeGameKeys.includes(data.chosen)||!Array.isArray(data.members)||data.members.length<2||data.members.length>8)return false;
 if(data.members.some(m=>!m||typeof m.id!=='string'||typeof m.name!=='string'||!['pending','join','pass'].includes(m.response))||new Set(data.members.map(m=>m.id)).size!==data.members.length)return false;
 if(data.purpose==='lunch'&&(data.mode!=='tournament'||netPhase!=='menuTournament'||data.context!=='menuTournament:setup'||data.members.length!==netSpec?.participants?.length||data.members.some(m=>m.response!=='join'||typeof m.menu!=='string'||!validName(m.menu)||!netSpec?.participants?.some(p=>p.id===m.id&&p.menu===m.menu))))return false;
 const known=new Set(data.members.map(m=>m.id));for(const k of ['activeIds','championIds','tiebreakIds','safeIds'])if(!Array.isArray(data[k])||data[k].length>8||new Set(data[k]).size!==data[k].length||data[k].some(id=>!known.has(id)))return false;
 if(!Number.isSafeInteger(data.round)||data.round<0||!Number.isFinite(data.nextAt)||!Array.isArray(data.history)||data.history.length>60||typeof data.notice!=='string')return false;
 const w=data.world;if(!w)return data.phase==='invite'&&arcadeValidatePoints(data);if(typeof w.id!=='string'||!arcadeGameKeys.includes(w.game)||!['countdown','play','done'].includes(w.phase)||!Number.isSafeInteger(w.seq)||w.seq<0||!Number.isFinite(w.elapsed)||w.elapsed<0||!Number.isFinite(w.countdown)||!Number.isFinite(w.duration)||w.duration<=0||w.duration>60||!Array.isArray(w.players)||w.players.length<2||w.players.length>8||!Array.isArray(w.objects)||w.objects.length>220||!w.meta||typeof w.meta!=='object')return false;
 if(data.serverNow!==undefined&&(!Number.isFinite(data.serverNow)||data.serverNow<0))return false;if(data.clock!==undefined&&(!data.clock||data.clock.worldId!==w.id||!Number.isFinite(data.clock.countdownEndAt)||!Number.isFinite(data.clock.endAt)||data.clock.countdownEndAt<0||data.clock.endAt<data.clock.countdownEndAt||Math.abs(data.clock.endAt-data.clock.countdownEndAt-w.duration*1000)>2||!Number.isFinite(data.serverNow)))return false;
 if(w.players.some(p=>!p||!known.has(p.id)||typeof p.name!=='string'||!Number.isInteger(p.index)||p.index<0||p.index>7||['x','y','score','health','stunUntil','actionUntil'].some(k=>!Number.isFinite(p[k]))||p.x< -100||p.x>800||p.y< -100||p.y>560||!Number.isInteger(p.health)||p.health<0||p.health>3||typeof p.eliminated!=='boolean'||typeof p.forfeited!=='boolean')||new Set(w.players.map(p=>p.id)).size!==w.players.length)return false;
 if(!Array.isArray(w.winnerIds)||w.winnerIds.some(id=>!w.players.some(p=>p.id===id))||!Array.isArray(w.ranking)||w.ranking.some(p=>!p||!w.players.some(q=>q.id===p.id)||!Number.isFinite(p.score)||!Number.isInteger(p.rank)))return false;
 const finite=(v,depth=0)=>depth>7?false:typeof v==='number'?Number.isFinite(v):Array.isArray(v)?v.length<=220&&v.every(x=>finite(x,depth+1)):v&&typeof v==='object'?Object.keys(v).length<=40&&Object.values(v).every(x=>finite(x,depth+1)):v===null||['string','boolean'].includes(typeof v);
 return finite(w.objects)&&finite(w.meta)&&finite(w.players)&&data.history.every(h=>h&&Number.isSafeInteger(h.round)&&arcadeGameKeys.includes(h.game)&&Array.isArray(h.results)&&h.results.length<=8&&h.results.every(r=>r&&known.has(r.id)&&Number.isFinite(r.score)&&Number.isInteger(r.rank))&&Array.isArray(h.outIds)&&h.outIds.every(id=>known.has(id)))&&arcadeValidatePoints(data);
}
function arcadeReceive(data){
 if(arcadeDemo||netIsHost())return;if(!data){if(arcadeState)arcadeCancel();return;}if(!arcadeValidate(data))return;const fresh=arcadeState?.id!==data.id,newWorld=arcadeState?.world?.id!==data.world?.id;
 if(!fresh&&(data.round<arcadeState.round||!newWorld&&data.world?.seq<arcadeState.world?.seq||arcadeIsPoints(arcadeState)&&(data.pointRounds<arcadeState.pointRounds||data.pointsTiebreaks<arcadeState.pointsTiebreaks)))return;
 arcadePrevious=!fresh&&arcadeState?.world?arcadeState.world:null;arcadeState=arcadeClone(data);arcadeReceivedAt=performance.now();if(Number.isFinite(data.serverNow))arcadeClockOffset=data.serverNow-Date.now();else if(fresh)arcadeClockOffset=0;if(fresh||newWorld){arcadeInputSeq=0;arcadeLastWorldId=data.world?.id||'';if(typeof arcadeClearKeys==='function')arcadeClearKeys();}
 if(fresh)arcadeOpen();arcadeRenderSafe();
}
function arcadePresence(event){
 if(!arcadeBusy())return false;
 if(event?.kind==='leave'){delete netPicks[event.memberId];delete netReady[event.memberId];delete netDepartments[event.memberId];}
 arcadeHousekeep(performance.now());arcadePublish(true);return true;
}
// Solo opponents make ordinary mistakes; human and multiplayer inputs use the original rules.
function arcadeBotChance(w,p,key){
 let hash=((w.seed>>>0)^Math.imul(p.index+1,0x9e3779b1))>>>0;
 for(const c of w.game+':'+p.id+':'+key){hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;}
 hash^=hash>>>16;hash=Math.imul(hash,0x7feb352d);hash^=hash>>>15;return(hash>>>0)/4294967296;
}
function arcadeNormalBot(w,p){
 const intent=arcadeEngine.bot(w,p.id),t=w.elapsed;
 let brain=arcadeBotBrains.get(p.id);
 if(!brain||brain.worldId!==w.id){brain={worldId:w.id,nextThinkAt:t+.2+arcadeBotChance(w,p,'reaction')*.17,held:[],thought:0};arcadeBotBrains.set(p.id,brain);}
 if(t>=brain.nextThinkAt){
  const n=++brain.thought;brain.nextThinkAt=t+.24+arcadeBotChance(w,p,'think:'+n)*.16;
  brain.held=arcadeBotChance(w,p,'hesitate:'+n)<.12?[]:[...(intent.held||[])];
 }
 const response={held:[...brain.held]};if(!intent.action||t<.24)return response;
 let key='action:'+Math.floor(t/.65),success={brawl:.64,kart:.66,basket:.68,coins:.64,dodge:.75,doors:1}[w.game]??.74;
 if(w.game==='stamp')key='stamp:'+w.meta.stage;
 if(w.game==='runner'){
  const obstacle=w.objects.filter(o=>!o.hitIds?.includes(p.id)&&o.x>p.x-15).sort((a,b)=>a.x-b.x)[0];key='runner:'+(obstacle?.id||Math.floor(t));success=.82;
 }
 if(w.game==='rhythm'){
  const note=w.objects.filter(n=>!p.resolvedNotes?.includes(n.id)).sort((a,b)=>Math.abs(t-a.hitAt)-Math.abs(t-b.hitAt))[0];key='rhythm:'+(note?.id||Math.floor(t));success=.73;
 }
 if(arcadeBotChance(w,p,key)<success)response.action=intent.action;
 return response;
}
function arcadeHousekeep(now){
 const s=arcadeState;if(!s)return;
 if(!arcadeDemo&&(!netIsActive()||s.roomCode!==String(netRoom.code||'')||s.context!==arcadeBaseContext()||!(s.purpose==='lunch'?netPhase==='menuTournament':['setup','result'].includes(netPhase)))){arcadeCancel();return;}
 if(!arcadeHost())return;
 if(!arcadeDemo){const present=new Set(netMembers().map(m=>m.id));for(const m of s.members)if(!m.left&&!present.has(m.id)){m.left=true;if(s.phase==='invite')m.response='pass';else arcadeForfeit(m.id);}if(arcadeState!==s)return;if(s.phase==='invite')arcadeMaybeStart();}
 if(s.phase==='between'&&Date.now()>=s.nextAt)arcadeStartWorld();
 if(s.phase==='round'&&s.world){arcadeAdvanceWorld(now);if(arcadeState!==s)return;
  if(arcadeDemo&&now-arcadeBotAt>=180&&s.world.phase==='play'){arcadeBotAt=now;for(const p of s.world.players)if(p.id!==arcadeSelf()&&!p.eliminated&&!p.forfeited){const v=arcadeNormalBot(s.world,p);let seq=arcadeBotSeq.get(p.id)||0;arcadeEngine.input(s.world,p.id,{seq:++seq,action:'sync',held:v.held||[]},now);if(v.action)arcadeEngine.input(s.world,p.id,{seq:++seq,action:v.action},now);arcadeBotSeq.set(p.id,seq);}}
  arcadeResolveRound();arcadePublish(false);
 }
}
setInterval(()=>{const now=performance.now();arcadeHousekeep(now);if(arcadeState?.phase==='round'&&arcadeState.world?.phase==='play'&&now-arcadeHeartbeatAt>=200){arcadeHeartbeatAt=now;arcadeInput('sync',typeof arcadeHeld==='function'?arcadeHeld():[]);}if(arcadeState?.phase==='between')arcadeRenderSafe();},32);
netRoom.onDisconnect(e=>{if(e.self||e.hostLost)arcadeCancel();});
/* END_ARCADE_CONTROLLER_V1 */
