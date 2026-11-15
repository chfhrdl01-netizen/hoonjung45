/* GAME_IMPACT_V1 — actual play events, with a small reusable pool of paper and hit bursts. */
const gameImpactGames={
 sneak:{fields:['finishAt','lastCaughtSignal'],flavor:'speed'},
 dodge:{fields:['nearMisses'],flavor:'spark'},
 coins:{fields:['coinsCollected','stolen'],flavor:'coin'},
 stamp:{fields:['lastStampStage','stampResult','stampPoints'],flavor:'stamp'},
 runner:{fields:['cleared','jumpHeight'],flavor:'dust'},
 brawl:{fields:['damageDealt','knockouts'],flavor:'hit'},
 kart:{fields:['finishAt','pickupUntil','dashReadyAt','hitCount'],flavor:'speed'},
 basket:{fields:['makes','lastShotResult'],flavor:'spark'},
 doors:{fields:['roundPoints','choice'],flavor:'stamp'},
 rhythm:{fields:['hits','misses','combo','judge','lastHitLane'],flavor:'paper'},
 tray:{fields:['shoves'],flavor:'hit'},
 pong:{fields:['rallies','misses','goals','judge'],flavor:'hit'},
 curling:{fields:['completed'],flavor:'ice'},
 bowling:{fields:['framePins','completed','frameShots'],flavor:'pins'},
 volley:{fields:['hits','misses','judge'],flavor:'spark'},
 golf:{fields:['completed'],flavor:'spark'},
 parking:{fields:['parked'],flavor:'stamp'},
 dodgeball:{fields:['hits'],flavor:'hit'},
 crown:{fields:['steals'],flavor:'crown'},
 lasers:{fields:['nearMisses'],flavor:'spark'},
 frogger:{fields:['deliveries','crashes'],flavor:'speed'},
 bridge:{fields:['bridgeSteps','finishedAt'],flavor:'dust'},
 claw:{fields:['catches','hookPrizeId'],flavor:'spark'},
 memory:{fields:['memoryBest','locked','memoryRetryUsed'],flavor:'paper'},
 sorter:{fields:['locked','roundPoints'],flavor:'stamp'},
 receipt:{fields:['locked','roundPoints','receiptStreak'],flavor:'paper'},
 safe:{fields:['safeProgress','safeMistakes','locked'],flavor:'stamp'},
 auction:{fields:['roundPoints','goods'],flavor:'coin'},
 stacker:{fields:['blocks','perfects','perfectChain','failures','stackCenter','stackRects'],flavor:'paper'},
 reaction:{fields:['locked','reactionMs','reactionOutcome','reactionHits','reactionErrors'],flavor:'stamp'}
};
const gameImpactNumber=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const gameImpactClock=()=>typeof performance!=='undefined'&&typeof performance.now==='function'?performance.now()/1000:Date.now()/1000;
function gameImpactSample(w,p){
 if(!p||!gameImpactGames[w.game])return null;
 const sample={health:gameImpactNumber(p.health),hp:gameImpactNumber(p.hp),eliminated:!!p.eliminated,phase:w.meta?.phase||'',crown:w.meta?.ownerId===p.id};
 for(const key of gameImpactGames[w.game].fields)sample[key]=key==='stackRects'?(p.stackRects?.length||0):p[key];
 return sample;
}
function gameImpactEvent(game,before,now,w,p){
 if(!before||!now||p?.forfeited)return null;
 const inc=key=>gameImpactNumber(now[key])>gameImpactNumber(before[key]),hit=(label,kind='success',strong=false)=>({label,kind,strong,flavor:gameImpactGames[game].flavor});
 if(now.eliminated&&!before.eliminated)return hit(game==='tray'?'추락!':'이번 판 탈락','out',true);
 if(now.eliminated)return null;
 if(now.health<before.health||now.hp<before.hp)return hit('앗! 피격','hurt');
 switch(game){
 case 'sneak':return now.finishAt>=0&&before.finishAt<0?hit('퇴근 성공!','finish',true):inc('lastCaughtSignal')?hit('들켰다!','hurt'):null;
 case 'dodge':return inc('nearMisses')?hit('아슬아슬!'):null;
 case 'coins':return inc('stolen')?hit('한 닢 슬쩍!','perfect'):inc('coinsCollected')?hit('동전 +1'):null;
 case 'stamp':return inc('lastStampStage')?hit(now.stampResult==='perfect'?'정중앙 결재!':now.stampResult==='hit'?'결재 승인!':'반려!',now.stampResult==='perfect'?'perfect':now.stampResult==='hit'?'success':'fail',now.stampResult==='perfect'):null;
 case 'runner':return inc('cleared')?hit('통과!'):gameImpactNumber(before.jumpHeight)>0&&now.jumpHeight===0?hit('착!','soft'):null;
 case 'brawl':return inc('knockouts')?hit('K.O.!','perfect',true):inc('damageDealt')?hit('명중!'):null;
 case 'kart':return inc('hitCount')?hit('물웅덩이!','hurt'):now.finishAt>=0&&before.finishAt<0?hit('완주!','finish',true):inc('pickupUntil')||inc('dashReadyAt')?hit('TURBO!','boost'):null;
 case 'basket':return inc('makes')?hit(String(now.lastShotResult||'골인!'),String(now.lastShotResult).includes('3')?'perfect':'success',true):null;
 case 'doors':return now.phase==='reveal'&&before.phase!=='reveal'?hit(now.roundPoints>0?'식당 입장!':'예약 실패',now.roundPoints>0?'success':'fail'):null;
 case 'rhythm':return inc('misses')?hit('MISS','fail'):inc('hits')?hit(now.combo>=5&&now.combo%5===0?now.combo+' COMBO!':now.judge==='PERFECT'?'PERFECT!':'GOOD!',now.judge==='PERFECT'?'perfect':'success',now.judge==='PERFECT'||now.combo%5===0):null;
 case 'tray':return inc('shoves')?hit('밀쳤다!'):null;
 case 'pong':return inc('goals')?hit('우리 팀 득점!','perfect',true):inc('misses')?hit('상대 팀 득점','fail'):inc('rallies')?hit(String(now.judge).includes('스매시')?'SMASH!':'탁!',String(now.judge).includes('스매시')?'perfect':'success'):null;
 case 'curling':return inc('completed')?hit('스톤 안착!'):null;
 case 'bowling':return inc('completed')&&now.framePins===10?hit(now.frameShots===1?'STRIKE!':'SPARE!','perfect',true):inc('framePins')?hit('쨍! '+now.framePins+'핀'):null;
 case 'volley':return inc('misses')?hit('툭…','fail'):inc('hits')?hit(String(now.judge).includes('정확')?'NICE RECEIVE!':'팡!',String(now.judge).includes('정확')?'perfect':'success'):null;
 case 'golf':return inc('completed')?hit('HOLE IN!','perfect',true):null;
 case 'parking':return inc('parked')?hit('주차 완료!','perfect',true):null;
 case 'dodgeball':return inc('hits')?hit('명중!'):null;
 case 'crown':return inc('steals')||now.crown&&!before.crown?hit('왕관은 내 거!','perfect',true):null;
 case 'lasers':return inc('nearMisses')?hit('간발의 차!'):null;
 case 'frogger':return inc('crashes')?hit('충돌!','hurt'):inc('deliveries')?hit('배달 완료!','perfect',true):null;
 case 'bridge':return now.finishedAt>=0&&before.finishedAt<0?hit('다리 완성!','finish',true):inc('bridgeSteps')?hit('뚝딱! +1칸'):null;
 case 'claw':return inc('catches')?hit('획득!','perfect',true):now.hookPrizeId&&!before.hookPrizeId?hit('잡았다!'):null;
 case 'memory':return now.memoryRetryUsed&&!before.memoryRetryUsed?hit('한 번 더!','fail'):inc('memoryBest')?hit(now.locked?'기억 성공!':'맞았다!',now.locked?'perfect':'success',!!now.locked):null;
 case 'sorter':case 'receipt':return now.locked&&!before.locked?hit(now.roundPoints>0?(game==='receipt'&&now.receiptStreak>=3?'연속 정산!':'정답!'):'다시 확인!',now.roundPoints>0?'success':'fail',game==='receipt'&&now.receiptStreak>=3):null;
 case 'safe':return inc('safeMistakes')?hit('삐빅!','fail'):inc('safeProgress')?hit(now.locked?'찰칵! OPEN!':'찰칵!',now.locked?'perfect':'success',!!now.locked):null;
 case 'auction':return now.phase==='reveal'&&before.phase!=='reveal'?hit(inc('goods')?'낙찰!':now.roundPoints<0?'다음 경매로!':'예산 사수',inc('goods')?'perfect':'soft',inc('goods')):null;
 case 'stacker':return inc('failures')?hit('와르르!','fail',true):inc('blocks')?hit(inc('perfects')?(now.perfectChain>=3?now.perfectChain+' PERFECT!':'PERFECT!'):'착! 쌓았다',inc('perfects')?'perfect':'success',inc('perfects')):null;
 case 'reaction':return inc('reactionErrors')?hit(now.reactionOutcome==='miss'?'신호 놓침!':now.reactionOutcome==='wrong'?'다른 버튼!':'가짜 신호!','fail'):inc('reactionHits')?hit(now.reactionMs+'ms!','perfect',now.reactionMs<250):null;
 }
 return null;
}
function gameImpactOrigin(w,p,event){
 let x=gameImpactNumber(p.x)/7,y=gameImpactNumber(p.y)/4.6;
 if(w.game==='rhythm'){x=[20,50,80][Math.max(0,Math.min(2,gameImpactNumber(p.lastHitLane)))];y=79;}
 else if(w.game==='runner')y=(p.index+.5)/w.players.length*100;
 else if(w.game==='stamp'){x=50;y=50;}
 else if(['doors','memory','sorter','receipt','safe','auction','reaction'].includes(w.game)){x=50;y=52;}
 else if(w.game==='stacker'){x=gameImpactNumber(p.stackCenter,350)/7;y=91-Math.min(8,p.stackRects?.length||0)*8;}
 else if(w.game==='bowling'){const ball=w.objects.find(object=>object.ownerId===p.id&&object.kind==='bowlingBall'),fallen=w.objects.filter(object=>object.ownerId===p.id&&object.kind==='bowlingPin'&&object.down);if(ball){x=ball.x/7;y=ball.y/4.6;}else if(fallen.length){x=fallen.reduce((sum,pin)=>sum+pin.x,0)/fallen.length/7;y=fallen.reduce((sum,pin)=>sum+pin.y,0)/fallen.length/4.6;}else{x=50;y=26;}}
 else if(w.game==='curling'){x=50;y=28;}
 else if(w.game==='golf'){const point=w.meta.layouts?.[(p.hole||0)%Math.max(1,w.meta.layouts?.length||0)]?.hole;if(point){x=point.x/7;y=point.y/4.6;}}
 else if(w.game==='parking'){x=p.x/7;y=p.y/4.6;}
 else if(w.game==='pong'){x=event.kind==='perfect'&&event.label==='우리 팀 득점!'?50:gameImpactNumber(p.x,p.team===1?642:58)/7;y=event.kind==='perfect'&&event.label==='우리 팀 득점!'?45:gameImpactNumber(p.paddleY,230)/4.6;}
 else if(w.game==='volley'){x=p.x/7;y=83;}
 return {x:Math.max(7,Math.min(93,x)),y:Math.max(12,Math.min(90,y))};
}
let gameImpactView=null;
function gameImpactBuild(w,self){
 if(gameImpactView?.layer)gameImpactView.layer.remove();
 const own=w.players.find(p=>p.id===self),board=$('arcadeBoard');if(!board||!own||!gameImpactGames[w.game]){gameImpactView=null;return;}
 let anchor=board,actor=typeof arcadeUIActors!=='undefined'?arcadeUIActors.get(self):null;
 if(typeof arcadeSportsPanels!=='undefined'&&arcadeSportsPanels.has(self)){const panel=arcadeSportsPanels.get(self);anchor=panel.field;actor=panel.actor;}
 if(w.game==='pong'&&typeof arcadePongView!=='undefined'&&arcadePongView?.key===w.id){anchor=arcadePongView.field;actor=arcadePongView.paddles.get(self)||actor;}
 if(w.game==='stacker'&&typeof brainPackNodes!=='undefined')anchor=brainPackNodes.get('movingBlock')?.parentElement||board;
 const layer=el('div','gi-layer');layer.setAttribute('aria-hidden','true');const slots=[];
 for(let n=0;n<3;n++){const root=el('div','gi-burst'),ring=el('i','gi-ring'),label=el('strong','gi-label'),pieces=[];root.hidden=true;root.append(ring,label);for(let i=0;i<12;i++){const piece=el('i','gi-piece');pieces.push(piece);root.append(piece);}layer.append(root);slots.push({root,ring,label,pieces,until:0,beat:0});}anchor.append(layer);
 gameImpactView={key:w.id+':'+w.game,self,layer,anchor,actor,board,slots,cursor:0,previous:gameImpactSample(w,own),lastAt:-10,reactUntil:0,lastEvent:null,wasPlaying:false};
}
function gameImpactEmit(view,w,p,event){
 const t=w.elapsed,now=gameImpactClock();if(t-view.lastAt<.13&&!event.strong)return false;view.lastAt=t;view.lastEvent=event;
 const slot=view.slots[view.cursor++%view.slots.length],origin=gameImpactOrigin(w,p,event);slot.beat=1-slot.beat;slot.until=now+(event.strong?.65:.48);slot.root.hidden=false;slot.root.dataset.beat=String(slot.beat);slot.root.dataset.kind=event.kind;slot.root.dataset.flavor=event.flavor;slot.root.dataset.strong=String(!!event.strong);slot.root.style.left=origin.x+'%';slot.root.style.top=origin.y+'%';slot.label.textContent=event.label;
 for(const [i,piece]of slot.pieces.entries()){const a=(i/12)*Math.PI*2+.12*(view.cursor%3),distance=(event.strong?61:43)+(i%3)*7;piece.style.setProperty('--gi-x',(Math.cos(a)*distance).toFixed(1)+'px');piece.style.setProperty('--gi-y',(Math.sin(a)*distance-13).toFixed(1)+'px');piece.style.setProperty('--gi-turn',((i%2?1:-1)*(85+i*24))+'deg');piece.style.setProperty('--gi-delay',(i%3)*12+'ms');}
 view.reactUntil=now+.2;view.anchor.dataset.giKind=event.kind;view.anchor.dataset.giBeat=String(slot.beat);if(view.actor){view.actor.classList.add('gi-react');view.actor.dataset.giKind=event.kind;view.actor.dataset.giBeat=String(slot.beat);}
 if(typeof sound!=='undefined'&&sound&&typeof beep==='function'&&event.kind!=='soft')beep(event.kind==='perfect'||event.kind==='finish'?784:event.kind==='hurt'||event.kind==='out'?165:event.kind==='fail'?220:event.kind==='boost'?660:523,event.strong?.055:.035);
 return true;
}
const gameImpactBuildBase=arcadeBuildBoard;
arcadeBuildBoard=function(w){const value=gameImpactBuildBase(w);gameImpactBuild(w,arcadeSelf());return value;};
const gameImpactDrawBase=arcadeDrawWorld;
arcadeDrawWorld=function(s,w,g,self){
 const value=gameImpactDrawBase(s,w,g,self);if(!gameImpactView||gameImpactView.key!==w.id+':'+w.game||gameImpactView.self!==self)gameImpactBuild(w,self);const view=gameImpactView,p=w.players.find(player=>player.id===self);if(!view||!p)return value;
 const current=gameImpactSample(w,p),playing=s.phase==='round'&&w.phase==='play',closing=view.wasPlaying&&w.phase==='done',now=gameImpactClock();
 if(playing||closing){const event=gameImpactEvent(w.game,view.previous,current,w,p);if(event)gameImpactEmit(view,w,p,event);}
 view.previous=current;
 view.wasPlaying=playing;
 for(const slot of view.slots)if(w.phase==='countdown'||s.phase==='invite'||now>=slot.until)slot.root.hidden=true;
 if(now>=view.reactUntil){view.anchor.dataset.giKind='';if(view.actor)view.actor.classList.remove('gi-react');}
 return value;
};
/* END_GAME_IMPACT_V1 */
