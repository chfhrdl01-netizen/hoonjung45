/* MATCH_PAUSE_UI_V1: run after all game renderers so paused controls stay disabled. */
const matchPauseBaseRender=arcadeRender;
arcadeRender=function(...args){
 const value=matchPauseBaseRender(...args),s=arcadeState;
 if(!arcadeDialog)return value;
 const paused=arcadeIsPaused(s);arcadeDialog.dataset.matchPaused=String(paused);
 if(!paused)return value;
 const names=s.pausedBy.map(id=>s.members.find(m=>m.id===id)?.name||'참가자').join(' · ');
 const message=names+' 님이 경기 화면을 접었어요. 모두 다시 열면 이어져요.';
 arcadeDialog.querySelectorAll('#arcadePlay button').forEach(button=>{button.disabled=true;});
 const overlay=$('arcadeOverlay');if(overlay){overlay.hidden=false;arcadeSetText('arcadeOverlayTitle','일시정지');arcadeSetText('arcadeOverlayHint',message);}
 arcadeSetText('arcadeStatus',message);arcadeSetText('arcadeBottomNote','경기와 남은 시간이 멈춰 있어요.');
 return value;
};
/* END_MATCH_PAUSE_UI_V1 */
