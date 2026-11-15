

/* MENU_TOURNAMENT_V1 */
const menuTournamentSavedIds=new Set();
function menuTournamentHideView(){const v=$('menuTournamentView');if(v)v.hidden=true;}
function netEnterMenuTournament(){
 if(typeof menuTournamentEnsureView==='function')menuTournamentEnsureView();
 if(typeof cancelActionDuel==='function')cancelActionDuel();if(typeof deptCancel==='function')deptCancel();
 mode='menuTournament';for(const id of ['setupView','raceView','resultView','duelView']){const node=$(id);if(node)node.hidden=true;}
 const view=$('menuTournamentView');if(view)view.hidden=false;setStep(2);playLayout(true);
 const status=$('dossierStatus');if(status)status.textContent='랜덤 점심 파티 리그 · 전원 5라운드 누적 점수전';
 if(typeof menuTournamentRenderBackground==='function')menuTournamentRenderBackground();
}
function netBeginMenuTournament(){
 if(!netIsHost()||netPhase!=='setup'||arcadeBusy())return false;const roster=netMembers();
 if(roster.length<2||roster.length>8||roster.some(m=>!netReady[m.id]||!netCanReady(m.id)))return false;
 const members=roster.map(m=>({id:m.id,name:m.name,department:netDepartment(m.id),menu:netPicks[m.id][0].trim().normalize('NFC'),response:'join'}));
 arcadeCancel();arcadeDemo=false;netPhase='menuTournament';result=null;netDuelMeta=null;
 arcadeState=arcadeMakeState('tournament','coins',members);arcadeState.purpose='lunch';arcadeState.context='menuTournament:setup';arcadeState.activeIds=members.map(m=>m.id);if(typeof arcadeInitPoints==='function')arcadeInitPoints(arcadeState);arcadeState.notice='전원 5판 함께! 매판 순위 점수를 합산해 최종 순위를 정해요.';
 netSpec={id:arcadeState.id,source:'menuTournament',participants:members.map(m=>({id:m.id,name:m.name,menu:m.menu,department:m.department}))};
 netRoom.setLocked(true);netEnterMenuTournament();arcadeOpen();arcadeStartWorld();netPublish();return true;
}
function netCancelMenuTournament(message='점수전을 접고 메뉴 선택으로 돌아왔어요. 모두 다시 준비해주세요.'){
 if(!netIsHost()||netPhase!=='menuTournament')return false;
 netPhase='setup';netReady={};netSpec=null;netDuelMeta=null;result=null;netRoom.setLocked(false);arcadeCancel();menuTournamentHideView();showSetup();if(message)notify(message);netPublish();return true;
}
function netFinishMenuTournament(s){
 if(!netIsHost()||netPhase!=='menuTournament'||s!==arcadeState||s?.purpose!=='lunch'||s.phase!=='done')return false;
 const id=s.representativeId||(s.championIds?.length===1?s.championIds[0]:''),winner=s.members.find(m=>m.id===id&&s.championIds?.includes(m.id)&&!m.left&&!m.forfeited&&m.response==='join'),present=netMembers().some(m=>m.id===id);
 if(!winner||!present||!validName(winner.menu)){netCancelMenuTournament('우승 가능한 참가자가 없어 메뉴 선택으로 돌아왔어요.');return false;}
 const scoreStandings=arcadePointsStandings(s).map(row=>({id:row.id,name:row.member.name,menu:row.member.menu,points:row.points,rank:row.rank,left:!!row.member.left,forfeited:!!row.member.forfeited}));
 const finalResult={id:s.id,menu:winner.menu,person:winner.name,winnerId:winner.id,time:new Date().toISOString(),nominations:s.members.map(m=>({id:m.id,person:m.name,menus:[m.menu]})),source:'points',provisional:true,duelCount:0,mission:(s.pointRounds>=5?'전원 5판 완료!':(s.pointRounds||s.round)+'판 진행 후 참가자 기권으로 종료했어요.')+' 누적 점수로 최종 순위가 결정됐어요. 순위는 이후 메뉴 이의전과 관계없이 유지돼요.',tournamentHistory:arcadeClone(s.history),leagueFormat:'points',leagueScores:arcadeClone(s.totalPoints||{}),leagueRounds:s.pointRounds||s.round,tieReason:s.tieReason||'',scoreWinnerId:winner.id,scoreChampionIds:[...s.championIds],scoreStandings};
 result=finalResult;netPhase='result';netDuelMeta=null;netRoom.setLocked(false);arcadeCancel();menuTournamentHideView();
 if(typeof lunchDecisionBegin==='function')lunchDecisionBegin(result);
 renderResult();netPublish();return true;
}
const menuTournamentPreviousSetup=showSetup;
showSetup=function(){menuTournamentHideView();if(arcadeState?.purpose==='lunch')arcadeCancel();return menuTournamentPreviousSetup();};
const menuTournamentPreviousResult=renderResult;
renderResult=function(){menuTournamentHideView();if(arcadeState?.purpose==='lunch')arcadeCancel();return menuTournamentPreviousResult();};
netBeginRace=function(){return netBeginMenuTournament();};
/* END_MENU_TOURNAMENT_V1 */

