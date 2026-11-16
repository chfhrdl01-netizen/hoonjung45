/* LUNCH_DECISION_V1 */
let lunchDecisionState=null,lunchDecisionReturnAt=0,lunchDecisionRendered='',lunchDecisionSaving=false;
const lunchDecisionResolvedDuels=new Set(),lunchDecisionSavedRounds=new Set(),lunchDecisionDeliveryRounds=new Set();
function lunchDecisionClone(v){return v?JSON.parse(JSON.stringify(v)):null;}
function lunchDecisionActive(){return !!lunchDecisionState&&!!result&&result.id===lunchDecisionState.roundId;}
function lunchDecisionRequired(){if(!lunchDecisionActive())return [];const present=new Set(netMembers().map(m=>m.id));return lunchDecisionState.participants.filter(p=>present.has(p.id));}
function lunchDecisionGetState(){return netIsActive()&&lunchDecisionActive()?lunchDecisionClone(lunchDecisionState):null;}
function lunchDecisionCoffeeDone(){return typeof deliveryGetState==='function'&&deliveryGetState()?.roundId===lunchDecisionState?.roundId&&deliveryGetState()?.phase==='done'&&!deliveryGetState()?.needsRedraw;}
function lunchDecisionPublish(){if(!netIsHost()||netApplying||!lunchDecisionActive())return;lunchDecisionState.seq++;lunchDecisionRender();netPublish();}
function lunchDecisionClear(){lunchDecisionState=null;lunchDecisionReturnAt=0;lunchDecisionRendered='';lunchDecisionResolvedDuels.clear();if(typeof deliveryCancel==='function')deliveryCancel();lunchDecisionRender();}
function lunchDecisionBegin(value){
 if(!netIsHost()||!value||typeof value.id!=='string'||!Array.isArray(value.nominations))return false;if(lunchDecisionState?.roundId===value.id)return true;
 const participants=value.nominations.map(n=>({id:n.id,name:n.person,menu:Array.isArray(n.menus)&&n.menus.length===1?n.menus[0]:''}));
 if(participants.length<2||participants.length>8||participants.some(p=>typeof p.id!=='string'||typeof p.name!=='string'||!validName(p.menu))||new Set(participants.map(p=>p.id)).size!==participants.length||!participants.some(p=>p.id===value.winnerId&&p.menu===value.menu))return false;
 lunchDecisionClear();value.provisional=true;value.mission=value.leagueFormat==='points'?'누적 점수로 최종 순위가 확정됐어요. 점심 메뉴는 모두 승낙하거나 1회 이의를 제기할 수 있어요. 메뉴 이의는 점수와 순위를 바꾸지 않아요.':'현재 대표 메뉴예요. 모두 승낙하거나, 각자 한 번 내 메뉴로 1대1 이의를 제기할 수 있어요.';
 lunchDecisionState={roundId:value.id,roomCode:String(netRoom.code||''),seq:1,version:1,winnerId:value.winnerId,menu:value.menu,tournamentChampionId:value.winnerId,participants,usedIds:[],defeatedIds:[],acceptedIds:[],qualifiedIds:[],duelKind:'',phase:'review',duelId:'',challengerId:'',defenderId:'',notice:'우승 메뉴가 나왔어요. 각자 승낙하거나, 내 메뉴로 단 한 번 1대1 이의를 제기할 수 있어요. 이의를 받고 패하면 재도전할 수 없어요.'};lunchDecisionRender();return true;
}
function lunchDecisionResetMeal(message='메뉴 선택으로 돌아왔어요. 모두 다시 준비해주세요.'){
 if(!netIsHost())return false;if(typeof cancelActionDuel==='function')cancelActionDuel();lunchDecisionClear();netPhase='setup';netReady={};netSpec=null;netDuelMeta=null;result=null;netRoom.setLocked(false);showSetup();if(message)notify(message);netPublish();return true;
}
function lunchDecisionRetainScores(message='메뉴 제안자가 방을 나갔어요.'){
 const s=lunchDecisionState;if(!netIsHost()||!lunchDecisionActive()||result.leagueFormat!=='points')return false;
 // A departure can change who proposes lunch, never the completed score ledger.
 const present=lunchDecisionRequired(),standings=Array.isArray(result.scoreStandings)?result.scoreStandings:[],rows=new Map(standings.map((row,index)=>[row.id,{...row,index}]));
 const ordered=present.slice().sort((a,b)=>{const x=rows.get(a.id),y=rows.get(b.id);return (x?.rank??Infinity)-(y?.rank??Infinity)||(Number(result.leagueScores?.[b.id])||0)-(Number(result.leagueScores?.[a.id])||0)||(x?.index??s.participants.indexOf(a))-(y?.index??s.participants.indexOf(b));});
 const winner=ordered.find(p=>p.id===s.winnerId)||ordered.find(p=>p.menu===s.menu)||ordered[0],emptyNotice='남아 있는 메뉴 참가자가 없어요. 완료된 점수와 최종 순위는 그대로 보관해요.';
 if(!winner&&s.phase==='review'&&s.notice===emptyNotice&&netPhase==='result')return true;
 if(typeof awardCancel==='function')awardCancel();if(typeof cancelActionDuel==='function')cancelActionDuel();
 s.phase='review';s.duelKind='';s.duelId='';s.challengerId='';s.defenderId='';s.acceptedIds=[];s.version++;s.seq++;lunchDecisionReturnAt=0;netPhase='result';netDuelMeta=null;result.provisional=true;
 if(winner){s.winnerId=winner.id;s.menu=winner.menu;result.winnerId=winner.id;result.person=winner.name;result.menu=winner.menu;s.notice=message+' '+winner.name+' 님의 '+winner.menu+' 메뉴로 남은 참가자들이 다시 승낙해주세요. 완료된 점수와 최종 순위는 바뀌지 않아요.';}
 else s.notice=emptyNotice;
 result.mission=s.notice;renderResult();netPublish();return true;
}
function lunchDecisionStartCoffee(){
 const s=lunchDecisionState;if(!netIsHost()||!lunchDecisionActive()||s.phase!=='coffee'||lunchDecisionDeliveryRounds.has(s.roundId)||typeof deliveryStart!=='function')return false;
 const eligible=new Set(s.participants.map(p=>p.id)),members=netMembers().filter(m=>eligible.has(m.id)).map(m=>({...m,name:s.participants.find(p=>p.id===m.id).name,department:netDepartment(m.id)}));
 lunchDecisionDeliveryRounds.add(s.roundId);const okay=deliveryStart(s.roundId,members);if(okay===false){lunchDecisionDeliveryRounds.delete(s.roundId);return false;}return true;
}
function lunchDecisionFinalize(){
 const s=lunchDecisionState;if(!netIsHost()||!lunchDecisionActive()||s.phase!=='review')return false;const required=lunchDecisionRequired();if(!required.length||!required.some(p=>p.id===s.winnerId))return lunchDecisionRetainScores()||lunchDecisionResetMeal('현재 우승자가 방을 나가 메뉴를 다시 선택해야 해요.');
 if(!required.every(p=>s.acceptedIds.includes(p.id)))return false;
 s.phase='coffee';s.notice='모두 승낙했어요! 점심 메뉴 최종 승인. 이제 커피에 참여할 사람만 골라주세요.';s.seq++;result.provisional=false;result.approvedAt=new Date().toISOString();result.approval={unanimous:true,version:s.version,acceptedIds:required.map(p=>p.id),usedIds:[...s.usedIds],defeatedIds:[...(s.defeatedIds||[])]};result.mission='모두 승낙한 점심 메뉴예요. 커피는 원하는 사람만 참여하세요.';
 if(!lunchDecisionSavedRounds.has(s.roundId)){lunchDecisionSavedRounds.add(s.roundId);lunchDecisionSaving=true;try{saveRound();}finally{lunchDecisionSaving=false;}}
 lunchDecisionStartCoffee();renderResult();netPublish();return true;
}
function lunchDecisionStampDuel(){
 const s=lunchDecisionState;if(!netIsHost()||!lunchDecisionActive()||s.phase!=='duel'||!netDuelMeta||netDuelMeta.challengerId!==s.challengerId||netDuelMeta.defenderId!==s.defenderId)return;
 s.duelId=netDuelMeta.id;netDuelMeta.lunchDecisionId=s.roundId;netDuelMeta.tournamentChampionId=s.tournamentChampionId;netDuelMeta.duelKind=s.duelKind||'objection';netDuelMeta.qualifiedIds=[...(s.qualifiedIds||[])];
}
function lunchDecisionObject(senderId){
 const s=lunchDecisionState,p=s?.participants.find(p=>p.id===senderId);if(!netIsHost()||!lunchDecisionActive()||s.phase!=='review'||!p||!lunchDecisionRequired().some(x=>x.id===senderId)||senderId===s.winnerId||p.menu===s.menu||s.usedIds.includes(senderId)||(s.defeatedIds||[]).includes(senderId)||s.acceptedIds.includes(senderId))return false;
 const previousWinner=s.winnerId;s.phase='duel';s.duelKind='objection';s.challengerId=senderId;s.defenderId=previousWinner;s.duelId='';s.usedIds.push(senderId);s.notice=p.name+' 님이 단 한 번의 이의를 제기했어요. '+p.menu+' vs '+s.menu+'!';s.seq++;lunchDecisionReturnAt=0;
 netPicks[senderId]=[p.menu];
 try{netNewDuel(senderId,p.menu);}catch(error){s.phase='review';s.usedIds=s.usedIds.filter(id=>id!==senderId);s.duelId='';s.challengerId='';s.defenderId='';throw error;}
 if(netPhase!=='duel'||netDuelMeta?.challengerId!==senderId||netDuelMeta?.defenderId!==previousWinner){s.phase='review';s.usedIds=s.usedIds.filter(id=>id!==senderId);s.duelId='';s.challengerId='';s.defenderId='';return false;}
 lunchDecisionStampDuel();lunchDecisionPublish();return true;
}
function lunchDecisionDuelFinished(){
 const s=lunchDecisionState;if(!netIsHost()||!lunchDecisionActive()||s.phase!=='duel'||!duel?.finishLocked||duel.phase!=='done'||!s.duelId||lunchDecisionResolvedDuels.has(s.duelId))return false;
 const winner=s.participants.find(p=>p.id===result.winnerId&&[s.challengerId,s.defenderId].includes(p.id));
 if(!winner||!netMembers().some(m=>m.id===winner.id))return lunchDecisionRetainScores('메뉴 결투 참가자가 방을 나가 결투를 종료했어요.')||lunchDecisionResetMeal('결투 우승자가 방에 없어 메뉴 선택으로 돌아왔어요.');
 lunchDecisionResolvedDuels.add(s.duelId);const changed=s.winnerId!==winner.id||s.menu!==winner.menu;
 // Losing a requested defense consumes the former winner's right as well:
 // an objection must never become an endless winner/loser revenge loop.
 const defeatedDefender=s.duelKind!=='final'&&winner.id===s.challengerId?s.defenderId:'';
 if(defeatedDefender){if(!Array.isArray(s.defeatedIds))s.defeatedIds=[];if(!s.defeatedIds.includes(defeatedDefender))s.defeatedIds.push(defeatedDefender);if(!s.usedIds.includes(defeatedDefender))s.usedIds.push(defeatedDefender);}
 s.winnerId=winner.id;s.menu=winner.menu;
 result.winnerId=winner.id;result.person=winner.name;result.menu=winner.menu;result.provisional=true;
 if(changed){s.version++;s.acceptedIds=[];s.notice='메뉴가 '+winner.menu+'(으)로 바뀌었어요. 모두 새 메뉴에 다시 승낙해주세요.'+(defeatedDefender?' 패한 이전 우승자는 이번 점심에서 재도전할 수 없어요.':'');}else s.notice=winner.name+' 님이 메뉴를 지켰어요. 남은 참가자들의 승낙을 기다려요.';
 s.seq++;lunchDecisionReturnAt=Date.now()+1800;netPublishCombat(true);return true;
}
function lunchDecisionReturnReview(){
 const s=lunchDecisionState;if(!netIsHost()||!lunchDecisionActive()||s.phase!=='duel')return false;
 if(duel?.finishLocked&&duel.phase==='done')lunchDecisionDuelFinished();if(!lunchDecisionActive())return false;if(s.phase!=='duel')return true;
 if(!lunchDecisionResolvedDuels.has(s.duelId))s.notice='이의 결투가 취소됐어요. 기존 메뉴를 유지하며, 신청자의 이의 기회는 사용 처리돼요.';
 s.phase='review';s.duelId='';s.challengerId='';s.defenderId='';s.seq++;lunchDecisionReturnAt=0;netPhase='result';netDuelMeta=null;if(typeof cancelActionDuel==='function')cancelActionDuel();result.provisional=true;renderResult();if(!lunchDecisionFinalize())netPublish();return true;
}
function lunchDecisionHandle(senderId,cmd){
 if(typeof cmd?.t!=='string')return false;const own=cmd.t.startsWith('lunch');
 if(!lunchDecisionActive())return own;
 const s=lunchDecisionState;if(own){
  if(!netIsHost()||cmd.roundId!==s.roundId||!lunchDecisionRequired().some(p=>p.id===senderId))return true;
  if(cmd.t==='lunchAccept'&&s.phase==='review'&&Number.isSafeInteger(cmd.version)&&cmd.version===s.version&&!s.acceptedIds.includes(senderId)){s.acceptedIds.push(senderId);s.notice=(s.participants.find(p=>p.id===senderId)?.name||'참가자')+' 님 승낙!';s.seq++;if(!lunchDecisionFinalize()){lunchDecisionRender();netPublish();}return true;}
  if(cmd.t==='lunchObject'){if(Number.isSafeInteger(cmd.version)&&cmd.version===s.version)lunchDecisionObject(senderId);return true;}
  return true;
 }
 if(cmd.t==='reset'){if(senderId===netSelfId()&&s.phase==='coffee'&&lunchDecisionCoffeeDone()){lunchDecisionClear();return false;}return true;}
 if(cmd.t.startsWith('delivery'))return s.phase!=='coffee';
 if(s.phase==='qualification'&&cmd.t==='brawlInput')return false;
 if(cmd.t==='combatCancel'&&s.duelKind==='final'&&s.phase==='duel'&&duel?.phase!=='done')return true;
 if(cmd.t==='challenge'||/^(?:group|brawl|coffee|arcade|tray)/.test(cmd.t))return true;
 if(/^(?:combatReady|combatInput|combatCancel)$/.test(cmd.t))return s.phase!=='duel';
 return false;
}
function lunchDecisionPresence(event){
 if(!netIsHost()||!lunchDecisionActive())return false;const s=lunchDecisionState;
 if(event?.kind==='leave'){const id=event.memberId;delete netPicks[id];delete netReady[id];delete netDepartments[id];
  if(result.leagueFormat==='points'&&s.phase!=='coffee'&&(id===s.winnerId||s.phase==='award'&&id===result.scoreWinnerId||s.phase==='duel'&&[s.challengerId,s.defenderId].includes(id)))return lunchDecisionRetainScores(s.phase==='duel'?'참가자가 방을 나가 메뉴 결투를 종료했어요.':'메뉴 제안자가 방을 나갔어요.');
  if(s.phase==='duel'&&[s.challengerId,s.defenderId].includes(id)){const other=id===s.challengerId?s.defenderId:s.challengerId;if(!netMembers().some(m=>m.id===other))return lunchDecisionResetMeal('결투 참가자들이 나가 메뉴를 다시 선택해야 해요.');if(netPhase==='duel'&&duel&&!duel.finishLocked){actionFinish(other===s.challengerId?0:1,'상대방 퇴장 · 기권승');lunchDecisionDuelFinished();}else if(id===s.winnerId)return lunchDecisionResetMeal('현재 우승자가 방을 나가 메뉴를 다시 선택해야 해요.');}
  else if(id===s.winnerId&&s.phase!=='coffee')return lunchDecisionResetMeal('현재 우승자가 방을 나가 메뉴를 다시 선택해야 해요.');
 }
 s.seq++;if(s.phase==='review'&&lunchDecisionFinalize())return true;lunchDecisionRender();netPublish();return true;
}
function lunchDecisionValidate(data){
 if(result?.leagueFormat==='points'&&(data?.phase==='qualification'||data?.duelKind==='final'||data?.qualifiedIds?.length||data?.qualifierId))return false;
 if(!data||!result||data.roundId!==result.id||data.roomCode!==String(netRoom.code||'')||!Number.isSafeInteger(data.seq)||data.seq<1||!Number.isSafeInteger(data.version)||data.version<1||data.version>1000||!['review','duel','coffee','qualification','award'].includes(data.phase)||!Array.isArray(data.participants)||data.participants.length<2||data.participants.length>8)return false;
 const nominations=result.nominations||[];if(data.participants.some(p=>!p||typeof p.id!=='string'||typeof p.name!=='string'||!validName(p.menu)||!nominations.some(n=>n.id===p.id&&n.person===p.name&&n.menus?.length===1&&n.menus[0]===p.menu))||new Set(data.participants.map(p=>p.id)).size!==data.participants.length||data.participants.length!==nominations.length)return false;
 const ids=new Set(data.participants.map(p=>p.id));if(!ids.has(data.tournamentChampionId)||!ids.has(data.winnerId)||data.winnerId!==result.winnerId||data.menu!==result.menu||!data.participants.some(p=>p.id===data.winnerId&&p.menu===data.menu))return false;
 for(const key of ['usedIds','acceptedIds'])if(!Array.isArray(data[key])||data[key].length>8||new Set(data[key]).size!==data[key].length||data[key].some(id=>!ids.has(id)))return false;
 const defeated=data.defeatedIds===undefined?[]:data.defeatedIds;
 if(!Array.isArray(defeated)||defeated.length>8||new Set(defeated).size!==defeated.length||defeated.some(id=>!ids.has(id)||!data.usedIds.includes(id)))return false;
 if(lunchDecisionState?.roundId===data.roundId&&(lunchDecisionState.usedIds.some(id=>!data.usedIds.includes(id))||(lunchDecisionState.defeatedIds||[]).some(id=>!defeated.includes(id))))return false;
 if(data.qualifiedIds!==undefined&&(!Array.isArray(data.qualifiedIds)||data.qualifiedIds.length>2||new Set(data.qualifiedIds).size!==data.qualifiedIds.length||data.qualifiedIds.some(id=>!ids.has(id))))return false;
 if(data.championship!==undefined&&typeof data.championship!=='boolean')return false;
 if(data.championship===true&&(!Array.isArray(data.qualifiedIds)||data.participants.length===2&&data.qualifiedIds.length>0||data.qualifiedIds.length>0&&!data.qualifiedIds.includes(data.tournamentChampionId)))return false;
 if(data.qualifierId!==undefined&&(typeof data.qualifierId!=='string'||data.qualifierId&&(!ids.has(data.qualifierId)||data.qualifierId===data.tournamentChampionId)))return false;
 if(data.duelKind!==undefined&&!['','objection','final'].includes(data.duelKind))return false;
 if(['qualification','award'].includes(data.phase)&&data.championship!==true)return false;
 if(data.phase==='qualification'&&(data.participants.length<3||data.winnerId!==data.tournamentChampionId))return false;
 if(typeof data.notice!=='string'||data.notice.length>300||typeof data.duelId!=='string'||data.duelId.length>100||typeof data.challengerId!=='string'||typeof data.defenderId!=='string')return false;
 if(data.phase==='duel'&&(!data.duelId||!ids.has(data.challengerId)||!ids.has(data.defenderId)||data.challengerId===data.defenderId||(data.duelKind==='final'?(data.championship!==true||data.participants.length<3||data.qualifiedIds?.length!==2||!data.qualifiedIds.includes(data.challengerId)||!data.qualifiedIds.includes(data.defenderId)||data.defenderId!==data.tournamentChampionId):!data.usedIds.includes(data.challengerId))||netPhase==='duel'&&netDuelMeta?.id!==data.duelId))return false;
 if(data.phase==='duel'&&data.duelKind!=='final'&&data.winnerId===data.challengerId&&!defeated.includes(data.defenderId))return false;
 if(data.phase==='coffee'&&(result.provisional===true||netMembers().filter(m=>ids.has(m.id)).some(m=>!data.acceptedIds.includes(m.id))))return false;
 return true;
}
function lunchDecisionReceive(data){
 if(netIsHost())return false;if(!data){if(lunchDecisionState)lunchDecisionClear();return false;}if(!lunchDecisionValidate(data))return false;
 if(lunchDecisionState?.roundId===data.roundId&&(data.seq<lunchDecisionState.seq||data.version<lunchDecisionState.version||data.tournamentChampionId!==lunchDecisionState.tournamentChampionId||lunchDecisionState.usedIds.some(id=>!data.usedIds.includes(id))||(lunchDecisionState.defeatedIds||[]).some(id=>!(data.defeatedIds||[]).includes(id))))return false;lunchDecisionState=lunchDecisionClone(data);if(data.phase==='coffee'&&result.provisional===false&&!lunchDecisionSavedRounds.has(data.roundId)){lunchDecisionSavedRounds.add(data.roundId);lunchDecisionSaving=true;try{saveRound();}finally{lunchDecisionSaving=false;}}lunchDecisionRender();return true;
}
function lunchDecisionEnsureUI(){
 if(typeof document==='undefined'||$('lunchDecisionPanel'))return;const view=$('resultView');if(!view)return;
 const style=el('style');style.id='lunchDecisionStyles';style.textContent='.lunch-decision{margin:20px 24px;padding:20px;border:2px solid #30251e;border-radius:14px;background:#fff7db;box-shadow:4px 4px 0 #30251e22}.lunch-decision h3{font-size:22px;margin:0 0 6px}.lunch-decision p{margin:7px 0;line-height:1.6}.lunch-decision ul{list-style:none;padding:0;display:grid;gap:7px}.lunch-decision li{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:9px 12px;background:#fffdf3;border:1px solid #34251f44;border-radius:9px}.lunch-decision li strong{margin-right:auto}.lunch-decision li small{font-weight:800}.lunch-decision .lunch-choice-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:15px}.lunch-decision .lunch-choice-actions button{min-height:46px}.lunch-decision .lunch-decision-note{font-size:12px;color:#67584c}.lunch-decision .accepted{background:#dce9bd}.lunch-decision .left{opacity:.5}@media(max-width:600px){.lunch-decision{margin:14px 10px;padding:15px}.lunch-decision h3{font-size:20px}.lunch-decision .lunch-choice-actions button{flex:1 1 100%}}';document.head.append(style);
 const panel=el('section','lunch-decision');panel.id='lunchDecisionPanel';panel.setAttribute('aria-label','우승 메뉴 검토와 만장일치 승낙');
 const heading=el('h3');heading.id='lunchDecisionTitle';const status=el('p');status.id='lunchDecisionStatus';status.setAttribute('role','status');const list=el('ul');list.id='lunchDecisionRoster';const note=el('p','lunch-decision-note');note.id='lunchDecisionSelf';
 const actions=el('div','lunch-choice-actions');for(const spec of [['lunchAcceptBtn','이 메뉴로 점심 먹을게요','btn primary','lunchAccept'],['lunchObjectBtn','내 메뉴로 이의 제기 · 1대1','btn dark','lunchObject']]){const b=el('button',spec[2],spec[1]);b.id=spec[0];b.type='button';b.addEventListener('click',()=>{const s=lunchDecisionState;if(s)netRoom.send({t:spec[3],roundId:s.roundId,version:s.version});});actions.append(b);}
 panel.append(heading,status,list,note,actions);const anchor=view.querySelector('.result-actions');if(anchor)anchor.before(panel);else view.append(panel);
}
function lunchDecisionRender(){
 if(typeof document==='undefined')return;lunchDecisionEnsureUI();const panel=$('lunchDecisionPanel');if(!panel)return;const s=lunchDecisionActive()?lunchDecisionState:null;panel.hidden=!s;if(!s)return;
 const required=lunchDecisionRequired(),present=new Set(required.map(p=>p.id)),self=netSelfId(),own=s.participants.find(p=>p.id===self),accepted=required.filter(p=>s.acceptedIds.includes(p.id)).length,done=lunchDecisionCoffeeDone(),key=[s.seq,netPhase,self,required.map(p=>p.id).join(','),done].join('|');if(lunchDecisionRendered===key)return;lunchDecisionRendered=key;
 const view=$('resultView'),badge=view?.querySelector('.approval'),label=view?.querySelector('.section-label'),pill=view?.querySelector('.board-head .pill'),kicker=view?.querySelector('.result-kicker');if(view)view.setAttribute('aria-label',s.phase==='coffee'?'모두 승낙한 최종 점심 메뉴':'현재 대표 메뉴와 승낙 대기');if(badge)badge.textContent=s.phase==='coffee'?'최종 승인':'승낙 대기';if(label)label.textContent=s.phase==='coffee'?'APPROVED · 점심 최종 승인':'REVIEW · 점심 메뉴 승낙 대기';if(pill)pill.textContent=s.phase==='coffee'?'커피는 원하는 사람만':'승낙 또는 1회 이의';if(kicker)kicker.textContent=s.phase==='coffee'?"TODAY'S LUNCH":'PROPOSED MENU';
 $('lunchDecisionTitle').textContent=s.phase==='coffee'?'모두 승낙 · 점심 메뉴 최종 승인':'잠깐! 이 메뉴로 점심 먹을까요?';
 $('lunchDecisionStatus').textContent=s.phase==='duel'?'1대1 이의 결투 중 · 다른 참가자는 관전해요.':s.phase==='coffee'?'만장일치 '+accepted+'/'+required.length+'명 · 커피는 원하는 사람만 참여해요.':s.notice+' · 승낙 '+accepted+'/'+required.length+'명';
 const list=$('lunchDecisionRoster');list.replaceChildren();for(const p of s.participants){const row=el('li');row.classList.toggle('accepted',s.acceptedIds.includes(p.id));row.classList.toggle('left',!present.has(p.id));row.append(el('strong','',p.name+(p.id===self?' · 나':'')+(p.id===s.winnerId?' · 대표 메뉴':'')),el('span','',p.menu),el('small','',!present.has(p.id)?'퇴장':s.acceptedIds.includes(p.id)?'승낙 ✓':(s.defeatedIds||[]).includes(p.id)?'방어전 패배 · 재도전 불가':s.usedIds.includes(p.id)?'이의 1회 사용':'승낙 대기'));list.append(row);}
 const eligible=!!own&&present.has(self),ownAccepted=s.acceptedIds.includes(self),defeated=(s.defeatedIds||[]).includes(self),used=s.usedIds.includes(self)||defeated;
 $('lunchDecisionSelf').textContent=!eligible?'처음 메뉴를 낸 참가자만 승낙과 이의 제기에 참여해요.':s.phase==='coffee'?'모든 참가자가 이 메뉴를 승낙했어요.':defeated?'이의를 받고 패배해 이번 점심에서 다시 이의를 제기할 수 없어요. 새 메뉴를 승낙해주세요.':used?'내 이의 제기 기회는 사용했어요. 메뉴가 바뀌면 새 메뉴를 다시 승낙해주세요.':ownAccepted?'이 메뉴를 승낙했어요. 메뉴가 바뀌면 다시 승낙할 수 있어요.':'이의 제기는 오늘 점심 전체에서 1인 1회. 이의를 받고 패하면 재도전할 수 없어요.';
 const accept=$('lunchAcceptBtn');accept.hidden=!eligible||s.phase==='coffee';accept.disabled=s.phase!=='review'||ownAccepted;accept.textContent=ownAccepted?'이 메뉴 승낙 완료 ✓':'이 메뉴로 점심 먹을게요';
 const objection=$('lunchObjectBtn');objection.hidden=!eligible||self===s.winnerId||own.menu===s.menu||s.phase==='coffee';objection.disabled=s.phase!=='review'||used||ownAccepted;objection.textContent=defeated?'방어전 패배 · 재도전 불가':used?'이의 제기 1회 사용 완료':'내 메뉴로 이의 제기 · 1대1';
 const old=$('objectBtn');if(old)old.hidden=true;const again=$('againBtn');if(again){again.disabled=s.phase!=='coffee'||!done;again.title=again.disabled?'모두 승낙하고 커피 뽑기까지 마치면 다음 점심을 시작할 수 있어요.':'';}const copy=$('copyBtn');if(copy){copy.disabled=result.provisional===true;copy.title=copy.disabled?'모두 승낙한 뒤 최종 점심 결과를 복사할 수 있어요.':'';}
}
function lunchDecisionTick(){
 if(!lunchDecisionState)return;if(!netIsActive()||!result||result.id!==lunchDecisionState.roundId||netPhase==='setup'){lunchDecisionClear();return;}
 if(netIsHost()){const s=lunchDecisionState;if(s.phase==='duel'){if(duel?.finishLocked&&duel.phase==='done')lunchDecisionDuelFinished();if(!lunchDecisionActive())return;if(netPhase==='result'||lunchDecisionReturnAt&&Date.now()>=lunchDecisionReturnAt)lunchDecisionReturnReview();}else if(s.phase==='review')lunchDecisionFinalize();else if(s.phase==='coffee')lunchDecisionStartCoffee();}
 lunchDecisionRender();
}
const lunchDecisionPreviousPublish=netPublish;
netPublish=function(){lunchDecisionStampDuel();return lunchDecisionPreviousPublish();};
const lunchDecisionPreviousSave=saveRound;
saveRound=function(){if(result?.provisional===true&&!lunchDecisionSaving)return;if(result?.tournamentHistory&&result.provisional===false){if(!lunchDecisionSaving&&lunchDecisionSavedRounds.has(result.id))return;const out=lunchDecisionPreviousSave();lunchDecisionSavedRounds.add(result.id);return out;}return lunchDecisionPreviousSave();};
const lunchDecisionPreviousRoundFinished=netRoundFinished;
netRoundFinished=function(){if(netIsHost()&&lunchDecisionActive()&&lunchDecisionState.phase==='duel'){lunchDecisionDuelFinished();return;}return lunchDecisionPreviousRoundFinished();};
const lunchDecisionPreviousResult=renderResult;
renderResult=function(){const out=lunchDecisionPreviousResult();lunchDecisionRender();return out;};
netRoom.onDisconnect(event=>{if(event.self||event.hostLost)lunchDecisionClear();});
setInterval(lunchDecisionTick,200);
/* END_LUNCH_DECISION_V1 */
