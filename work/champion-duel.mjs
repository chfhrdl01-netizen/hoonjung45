/* CHAMPION_DUEL_V1 */
function championDuelScope(){
 if(typeof lunchDecisionGetState!=='function'||typeof netDuelMeta==='undefined'||!netDuelMeta||typeof netPhase==='undefined'||netPhase!=='duel'||typeof result==='undefined'||!result)return null;
 const d=lunchDecisionGetState();if(!d||!['review','duel'].includes(d.phase)||d.roundId!==result.id||typeof d.tournamentChampionId!=='string'||!d.tournamentChampionId)return null;
 if(netDuelMeta.lunchDecisionId&&netDuelMeta.lunchDecisionId!==d.roundId)return null;
 if(netDuelMeta.tournamentChampionId&&netDuelMeta.tournamentChampionId!==d.tournamentChampionId)return null;
 const sides=[netDuelMeta.challengerId,netDuelMeta.defenderId];
 const eligible=d.championship===true?(d.participants?.length===2?[]:(d.qualifiedIds||[]).filter(id=>sides.includes(id))):(netDuelMeta.defenderId===d.tournamentChampionId?[d.tournamentChampionId]:[]);
 if(!eligible.length)return null;
 return {roundId:d.roundId,championId:d.tournamentChampionId,sideIds:sides,eligibleIds:eligible,balanced:eligible.length===2};
}
function championDuelEligible(scope,i){return !!scope&&scope.eligibleIds.includes(scope.sideIds[i]);}
function championDuelSetBonus(f,scope,i){f.hp=150;f.maxHp=150;f.championBonus=true;f.giantScale=1.2;f.championBonusRoundId=scope.roundId;f.championBonusId=scope.sideIds[i];}
const championBaseFighter=actionFighter;
actionFighter=function(i){
 const f=championBaseFighter(i);f.maxHp=100;f.championBonus=false;f.giantScale=1;
 const scope=championDuelScope();if(championDuelEligible(scope,i))championDuelSetBonus(f,scope,i);
 return f;
};
function applyChampionDuelBonus(){
 const scope=championDuelScope();if(!scope||typeof duel==='undefined'||!duel?.fighters||!['idle','countdown'].includes(duel.phase))return false;
 let applied=false;duel.fighters.forEach((f,i)=>{if(championDuelEligible(scope,i)&&f&&!f.championBonus){championDuelSetBonus(f,scope,i);applied=true;}});return applied;
}
function championDuelPaint(){
 if(typeof duel==='undefined'||!duel?.fighters)return;
 let any=false,count=0;
 duel.fighters.forEach((f,i)=>{
  const bonus=f.championBonus===true&&f.maxHp===150;
  const max=bonus?150:100,hp=Math.max(0,Math.min(max,Number.isFinite(f.hp)?f.hp:0));any=any||bonus;if(bonus)count++;
  const actor=$('battleFighter'+i);if(actor){actor.dataset.championBonus=String(bonus);actor.style.setProperty('--champion-scale',bonus?'1.2':'1');}
  const bar=$('battleHp'+i);if(bar){bar.setAttribute('aria-valuemax',String(max));bar.setAttribute('aria-valuenow',String(Math.round(hp)));bar.setAttribute('aria-label',(i===0?'도전자':'방어자')+' 체력'+(bonus?' · 결승 진출자 보너스':''));}
  const fill=$('battleHpFill'+i);if(fill)fill.style.width=(hp/max*100)+'%';
  const label=$('battleHpText'+i);if(label)label.textContent=Math.round(hp)+' / '+max;
 });
 let note=$('championDuelBonusNote');if(!note){const intro=document.querySelector('#duelView .battle-intro');if(intro){note=el('p','champion-duel-bonus-note');note.id='championDuelBonusNote';intro.append(note);}}
 if(note){note.hidden=!any;note.textContent=count===2?'동등한 결승전 · 양쪽 체력 150 · 같은 크기':'결승 진출자 보너스 · 체력 150 · 거인';}
}
const championBaseRender=actionRender;
actionRender=function(...args){const out=championBaseRender(...args);championDuelPaint();return out;};
const championBaseReceive=netReceiveCombatState;
netReceiveCombatState=function(data){
 const scope=championDuelScope(),incoming=data?.duel;
 const ok=championBaseReceive(data);if(!ok||!duel?.fighters||!incoming?.fighters)return ok;
 duel.fighters.forEach((f,i)=>{
  const original=incoming.fighters[i],bonus=championDuelEligible(scope,i)&&original?.championBonus===true&&original.maxHp===150&&original.championBonusRoundId===scope.roundId&&original.championBonusId===scope.sideIds[i]&&Number.isFinite(original.hp)&&original.hp>=0&&original.hp<=150;
  f.maxHp=bonus?150:100;f.championBonus=!!bonus;f.giantScale=bonus?1.2:1;
  if(bonus){f.hp=original.hp;f.championBonusRoundId=scope.roundId;f.championBonusId=scope.sideIds[i];}
  else{f.hp=Math.max(0,Math.min(100,f.hp));delete f.championBonusRoundId;delete f.championBonusId;}
 });
 championDuelPaint();return ok;
};
/* END_CHAMPION_DUEL_V1 */
