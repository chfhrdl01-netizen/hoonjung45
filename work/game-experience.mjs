/* GAME_EXPERIENCE_V1 — one clear goal, scoring rule and useful tactic per game. */
const gameExperienceGuides={
 sneak:{goal:'들키지 않고 퇴근선에 도착!',score:'먼저 도착할수록 고득점. 미도착도 전진한 거리로 점수를 받아요.',tip:'초록에는 달리고 빨강에는 손을 떼요. 신호가 바뀔 때를 대비해요.',first:'초록에 달려요 · 빨강에는 손 떼기',continuous:true},
 dodge:{goal:'음식 낙하를 피하며 오래 버티기!',score:'끝까지 살아남거나 더 늦게 탈락할수록 높은 순위. 체력이 다하면 이번 판은 관전해요.',tip:'빨간 원 밖으로 먼저 이동하고, 갇혔을 때 대시를 남겨둬요.',first:'빨간 원 밖으로 이동 · 위험하면 대시',continuous:true},
 coins:{goal:'종료할 때 가장 많은 동전 모으기!',score:'동전 하나가 1점. 돌진해 가까운 상대의 동전도 빼앗을 수 있어요.',tip:'새 동전의 예고를 보고 이동해요. 동전을 모았다면 상대의 돌진을 경계해요.',first:'동전을 줍고 · 상대 가까이에서 돌진'},
 stamp:{goal:'초록 칸의 중심에 도장 찍기!',score:'초록 칸 안이면 득점, 중심에 가까울수록 고득점. 빗나가면 감점이에요.',tip:'매 차례 기회는 한 번! 초록 칸으로 다가오는 바늘을 보고 눌러요.',first:'바늘이 초록 칸에 왔을 때 한 번!'},
 runner:{goal:'장애물을 넘으며 퇴근길 완주!',score:'살아남은 사람이 우선! 체력이 다하면 이번 판 탈락, 생존 순위 점수를 받고 다음 게임에 다시 참여해요.',tip:'장애물이 발 앞에 오기 전에 점프! 착지할 때 다음 장애물도 확인해요.',first:'다가오는 장애물 앞에서 점프',continuous:true},
 brawl:{goal:'마지막까지 살아남아 난투에서 승리!',score:'생존자가 우선이며 탈락자는 더 오래 버틴 순서로 순위를 정해요. 쓰러지면 이번 판은 끝!',tip:'주먹은 바라보는 쪽으로 나가요. 한 대 친 뒤 옆으로 움직여 반격을 피해요.',first:'상대를 보고 펀치 · 체력 0이면 이번 판 탈락',continuous:true,hint:'방향키로 이동하고 Space로 앞쪽 펀치! 체력 0이면 탈락해 관전해요. 마지막 생존자가 승리!'},
 kart:{goal:'레일을 따라 3바퀴 먼저 완주!',score:'완주가 우선! 완주하지 못하면 달린 거리로 순위를 정해요.',tip:'직선에서는 터보, 커브 앞에서는 차선을 확인! 물웅덩이와 부스터도 같은 레일 위에 있어요.',first:'가속 → 레일 차선 변경 → 직선에서 터보',continuous:true},
 basket:{goal:'움직이는 골대에 반찬 넣기!',score:'골 성공은 2점, 골대 정중앙은 3점. 슛을 많이 맞혀요.',tip:'골대가 움직일 방향을 예상해 각도를 조금씩 바꿔요.',first:'좌우로 슛 각도 조절 · 맞춰서 발사'},
 doors:{goal:'가장 덜 붐빌 식당 고르기!',score:'예약 손님과 참가자를 합쳐 적게 모인 식당일수록 높은 점수예요.',tip:'예약이 적은 곳에 모두 몰릴 수도 있어요. 다른 사람의 생각도 읽어봐요.',first:'예약 인원 확인 → 덜 몰릴 식당 선택'},
 rhythm:{goal:'음표가 판정선에 올 때 박자 맞추기!',score:'정확한 박자와 연속 성공이 점수. 틀리거나 놓치면 콤보가 끊겨요.',tip:'왼쪽·가운데·오른쪽을 먼저 확인하고, 선에 닿을 때 한 번씩 눌러요.',first:'음표가 아래 선에 닿을 때 같은 칸!'},
 tray:{goal:'무너지는 식판에서 마지막까지 살아남기!',score:'떨어지면 이번 판 탈락! 남은 생존자가 우선이고, 탈락자는 오래 버틴 순서로 점수를 받아요.',tip:'깜박이는 바닥은 곧 사라져요. 가운데로 갈 탈출 경로를 남겨둬요.',first:'위험 바닥에서 벗어나기 · 추락하면 탈락',continuous:true,hint:'방향키로 이동, Space로 밀치기! 빨간 바닥은 곧 사라져요. 떨어지면 관전하고 다음 게임에 다시 참여해요.'},
 pong:{goal:'같은 테이블에서 팀끼리 득점 경쟁!',score:'상대 뒤로 공을 보내 골! 같은 팀은 골과 순위를 공유하며 28초 뒤 팀 득점으로 승부해요.',tip:'인원이 적은 팀은 패들이 커지고 이동이 빨라져요. 위아래로 막고 가까워질 때 스매시!',first:'내 팀 확인 → 위아래 이동 → 스매시',continuous:true,hint:'1대1·2대2 팀 랠리! ↑/↓로 내 패들을 움직이고 Space로 스매시. 적은 인원 팀은 크기·속도 보정!'},
 curling:{goal:'3개의 돌을 과녁 중심에 놓기!',score:'멈춘 돌이 중심에 가까울수록 고득점. 나중 돌로 앞 돌을 밀 수도 있어요.',tip:'파워는 두 번 눌러 정해요. 미끄러지는 동안 쓸기를 하면 조금 더 멀리 가요.',first:'조준 → 파워 → 발사 · 이동 중 쓸기',continuous:true,hint:'←/→ 조준, Space로 파워 시작 → 한 번 더 발사! 돌이 움직일 때 Space로 쓸어 조금 더 보내요. 3개 돌의 정확도로 승부.',action:'파워 / 발사'},
 bowling:{goal:'세 가지 핀 배치에 맞춰 볼링 공략!',score:'핀 하나 +10점. 스트라이크·스페어 보너스! 각 프레임의 핀 위치를 보고 조준해요.',tip:'힘만 세게 주지 말고 각도를 맞춰요. 굴러가는 동안 좌우로 공의 휘어짐을 조절할 수 있어요.',first:'핀 위치 확인 → 조준·힘 조절 → 굴리며 조정',hint:'매 프레임 달라지는 핀 위치를 보고 ←/→ 조준! Space 두 번으로 힘을 정하고, 구르는 동안 좌우로 미세 조절해요.'},
 volley:{goal:'풍선을 바닥에 떨어뜨리지 않기!',score:'받아칠 때마다 득점. 낮고 정확하게 받아치면 추가 점수! 놓쳐도 재서브해요.',tip:'풍선이 내려올 위치로 먼저 이동하고, 충분히 내려왔을 때 받아쳐요.',first:'풍선 아래로 이동 · 내려오면 받아치기'},
 golf:{goal:'벽을 이용해 3홀 공략하기!',score:'홀인할 때 적은 타수일수록 높은 점수. 진행 중에는 홀에 가까워져도 점수를 받아요.',tip:'강하게만 치면 튕겨 나가요. 벽을 우회한 뒤 약한 힘으로 마무리해요.',first:'방향 조준 → 파워 → 퍼팅',continuous:true},
 parking:{goal:'32초 안에 더 많은 도시락 주차!',score:'칸에 도착하면 1대 완료, 바로 다음 칸! 주차 대수가 우선이며 같은 대수면 더 빨리 끝낸 사람이 앞서요.',tip:'차를 세울수록 칸이 좁아지고 장애물이 늘어요. 전후진·회전과 브레이크로 빠르게 찾아가요.',first:'주차칸 도착 → 즉시 다음 칸 · 대수 경쟁',continuous:true,hint:'↑/↓ 전후진, ←/→ 회전, Space 브레이크! 칸에 닿으면 즉시 다음 칸. 32초 안에 더 많이 주차하세요.'},
 dodgeball:{goal:'공을 피하고 던져 끝까지 살아남기!',score:'체력이 다하면 이번 판 탈락. 생존자가 우선이고 탈락자는 오래 버틴 순서로 점수를 받아요.',tip:'던질 방향을 먼저 보고 움직여요. 벽에 튕기는 공도 조심해요.',first:'상대 쪽을 바라보고 공 던지기',continuous:true,hint:'방향키로 피하고 상대 쪽을 보고 Space로 던져요. 체력이 다하면 탈락, 마지막 생존자가 승리!'},
 crown:{goal:'왕관을 차지해 오래 지키기!',score:'왕관을 들고 있는 시간이 점수. 돌진으로 왕관을 빼앗을 수 있어요.',tip:'모서리에 오래 숨으면 왕관을 놓쳐요. 추격자를 피해 계속 이동해요.',first:'왕관을 줍고 달리기 · 돌진으로 빼앗기',continuous:true},
 lasers:{goal:'예고를 읽고 레이저 사이로 피하기!',score:'끝까지 버티는 것이 우선! 체력이 다하면 탈락하고, 더 늦게 탈락할수록 높은 순위예요.',tip:'점선은 곧 켜질 자리예요. 회전 방향을 보고 빈 공간을 먼저 잡아요.',first:'점선 예고 확인 · 위험한 순간에 대시',continuous:true,hint:'점선은 예고, 빨간 레이저는 위험! 방향키로 피하고 Space 대시. 체력이 다하면 이번 판 탈락해요.'},
 frogger:{goal:'차에 부딪히지 않고 왕복 배달하기!',score:'충돌하면 이번 판 탈락! 살아남은 사람이 우선이며 그 안에서는 배달 실적과 전진으로 승부해요.',tip:'안전지대에서 다음 차선을 보고 가요. 두 칸 도약은 착지할 자리까지 확인!',first:'한 칸씩 이동 · 충돌하면 이번 판 탈락',continuous:true,hint:'방향키로 한 칸씩, Space로 두 칸 도약! 차에 부딪히면 탈락, 안전지대에서 다음 차선을 확인해요.'},
 bridge:{goal:'나무를 모아 내 다리 완성하기!',score:'건설한 다리마다 득점. 완성하면 남은 시간에 따른 보너스도 받아요.',tip:'내 색 입구로 돌아와 한 칸씩 놓아요. 나무는 최대 세 개까지 들 수 있어요.',first:'나무 줍기 → 내 색 입구 → 건설'},
 claw:{goal:'움직이는 상품을 집어 올리기!',score:'사탕 5점, 도시락 9점, 인형 14점. 무거울수록 회수 시간이 길어요.',tip:'내려가는 동안 좌우로 미세 조절! 헛손질이면 한 번 더 눌러 빠르게 회수해요.',first:'조준 → 집게 내리기 → 미세 조절',hint:'←/→로 집게 조준, Space로 내려요! 내려가는 중에도 좌우 미세 조절. 빈 집게는 Space로 빠르게 회수해요.',action:'내려 / 회수'},
 memory:{goal:'깜박인 불빛 순서를 그대로 재현하기!',score:'맞힌 순서마다 점수, 끝까지 재현하면 추가 점수. 한 문제에 재도전 한 번!',tip:'보는 동안에는 기다려요. 불이 꺼지고 재현 시간이 되면 순서대로 눌러요.',first:'불빛 기억 → 불이 꺼진 뒤 같은 순서',hint:'불빛 순서를 보고 기다려요. 꺼지면 A / W / D로 같은 순서를 재현! 한 문제에 한 번 더 도전할 수 있어요.'},
 sorter:{goal:'그림과 현재 규칙에 맞춰 서류 분류!',score:'정확하게 빨리 분류할수록 고득점. 규칙이 바뀌면 짧은 예고를 확인해요.',tip:'특별 규칙은 원래 함보다 한 칸 오른쪽! 오른쪽 끝의 다음은 왼쪽이에요.',first:'그림 + 기본·특별 규칙 확인 → 함 선택'},
 receipt:{goal:'영수증을 더해 맞는 합계 고르기!',score:'정답과 빠른 계산이 점수. 연속 정답이면 보너스가 쌓여요.',tip:'문제가 진행될수록 금액이 커져요. 서두르기 전에 더할 숫자 개수를 확인해요.',first:'금액을 모두 더한 뒤 합계 선택'},
 safe:{goal:'기억한 세 자리 비밀번호로 금고 열기!',score:'제한 시간 안에 빨리 열수록 고득점. 틀린 숫자는 -8점, 맞춘 앞자리는 유지돼요.',tip:'번호가 보일 때 외워요. 좌우로 숫자를 한 칸씩 바꾸고 확정해요.',first:'번호 기억 → 좌우로 숫자 → 한 자리 확정',hint:'세 자리 번호를 기억! ←/→로 숫자를 한 칸씩 맞추고 Space로 확정해요. 틀려도 맞힌 앞자리는 유지돼요.'},
 auction:{goal:'예산을 아끼며 간식 가치 챙기기!',score:'남은 예산 + 받은 상품 가치가 점수. 단독 최고 입찰자만 상품을 받고 입찰금은 모두 소모돼요.',tip:'마감 전까지 입찰을 바꿀 수 있어요. 모두 같은 금액이면 유찰되는 점을 이용해요.',first:'상품 가치 확인 → 비밀 입찰 → 마감 공개',hint:'예산 12로 A=0, W=1, D=3 비밀 입찰! 마감 전 변경 가능. 유일한 최고 입찰만 낙찰, 남은 예산+상품 가치로 승부.'},
 stacker:{goal:'주황 블록을 초록 목표 위에 쌓기!',score:'넓게 겹칠수록 높은 점수. 완벽하게 세 번 맞추면 탑의 너비를 회복해요.',tip:'처음에는 초록 START 받침대가 기준이에요. 점선 자리 위에 주황 블록이 겹칠 때 눌러요.',first:'초록 START 찾기 → 주황 블록을 그 위에 놓기'},
 reaction:{goal:'진짜 신호를 읽고 맞는 결재 선택!',score:'가짜는 기다리고, 진짜 신호는 맞는 버튼을 빠르게 골라요. 오답·성급한 입력은 감점, 늦으면 놓쳐요.',tip:'왼쪽 반려·가운데 승인·오른쪽 전달! 신호마다 정답이 달라지고 반응 시간도 짧아져요.',first:'가짜는 손 떼기 · 진짜는 맞는 세 버튼 중 하나',hint:'진짜 신호의 지시를 읽고 A=반려, W/Space=승인, D=전달! 가짜에는 기다리세요. 신호마다 한 번만 선택해요.'}
};
for(const [key,guide]of Object.entries(gameExperienceGuides)){
 if(!arcadeGames[key])continue;
 if(guide.hint)arcadeGames[key].hint=guide.hint;
 if(guide.action)arcadeGames[key].action=guide.action;
}
let gameExperienceView=null,gameExperienceSample=null;
const gameExperienceEvents={dodge:['nearMisses','아슬아슬 회피!'],runner:['cleared','장애물 통과!'],brawl:['damageDealt','펀치 명중!'],tray:['shoves','밀치기 성공!'],crown:['steals','왕관을 뺏었다!'],lasers:['nearMisses','아슬아슬 회피!'],frogger:['deliveries','배달 성공!'],golf:['completed','홀인!'],parking:['parked','주차 성공!']};
function gameExperienceText(node,text){if(node&&node.textContent!==text)node.textContent=text;}
function gameExperienceMarker(game,player){const event=gameExperienceEvents[game];return event&&player?Number(player[event[0]])||0:0;}
function gameExperienceDelta(previous,current,game,playing){
 if(!playing||gameExperienceGuides[game]?.continuous||!Number.isFinite(previous)||!Number.isFinite(current))return 0;
 return Math.round(current)-Math.round(previous);
}
function gameExperienceEnsure(){
 if(!arcadeDialog||gameExperienceView)return;
 const original=$('arcadeHelp'),board=$('arcadeBoard'),overlay=$('arcadeOverlay'),ownStatus=$('arcadeOwnStatus');if(!original||!board||!overlay||!ownStatus)return;
 const guide=el('section','five-help game-guide');guide.id='gameGuide';guide.setAttribute('aria-label','이 게임의 목표와 점수');
 const rows=[];for(const label of ['목표','점수','요령']){const row=el('span','game-guide-row'),heading=el('b','',label),copy=el('span');row.append(heading,copy);guide.append(row);rows.push(copy);}original.after(guide);original.setAttribute('aria-hidden','true');arcadeDialog.dataset.gameGuide='true';
 const countdown=el('small','game-countdown-tip');countdown.id='gameCountdownTip';overlay.append(countdown);
 const score=el('output','game-score-feedback');score.id='gameScoreFeedback';score.hidden=true;score.setAttribute('role','status');score.setAttribute('aria-live','polite');score.setAttribute('aria-atomic','true');
 const statusSlot=el('span','five-own-status game-own-status');statusSlot.id='gameOwnStatus';ownStatus.after(statusSlot);statusSlot.append(ownStatus,score);
 const track=el('div','game-time-track');track.id='gameTimeTrack';track.setAttribute('aria-hidden','true');const fill=el('i');track.append(fill);board.append(track);
 gameExperienceView={guide,rows,countdown,score,track,fill,key:''};
 const toggle=$('deviceInfoToggle');if(toggle)toggle.setAttribute('aria-controls','gameGuide arcadeRoster');
}
function gameExperienceRender(){
 gameExperienceEnsure();const view=gameExperienceView,s=arcadeState,w=s?.world;if(!view)return;
 const guide=gameExperienceGuides[w?.game||s?.chosen];view.guide.hidden=!guide||s?.phase==='invite';
 if(!w||!guide){view.countdown.hidden=true;view.score.hidden=true;view.track.hidden=true;gameExperienceSample=null;if(arcadeDialog)arcadeDialog.dataset.timePressure='false';return;}
 const key=w.id+':'+w.game;if(view.key!==key){view.key=key;view.rows.forEach((node,index)=>gameExperienceText(node,[guide.goal,guide.score,guide.tip][index]));}
 const countdown=w.phase==='countdown'&&s.phase==='round';view.countdown.hidden=!countdown;
 if(countdown){gameExperienceText($('arcadeOverlayHint'),guide.goal);gameExperienceText(view.countdown,guide.first);}
 const compact=$('deviceRuleSummary');if(compact)gameExperienceText(compact,guide.goal+' '+guide.first);
 const own=w.players.find(player=>player.id===arcadeSelf()),playing=w.phase==='play'&&s.phase==='round',now=w.elapsed;
 if(own&&!own.forfeited&&w.meta?.roundSurvival){const health=typeof own.hp==='number'?Math.ceil(own.hp)+'HP':'♥'.repeat(Math.max(0,own.health));gameExperienceText($('arcadeOwnStatus'),own.eliminated?'이번 판 탈락 · 다음 게임에 다시 참여':(w.phase==='done'?'이번 판 생존':'생존 중')+' · '+health);}
 if(playing&&own?.eliminated&&!own.forfeited){gameExperienceText($('arcadeOwnStatus'),'이번 판 탈락 · 다음 게임에 다시 참여');gameExperienceText($('arcadeStatus'),'이번 판은 관전 중 · 남은 '+w.players.filter(player=>!player.eliminated&&!player.forfeited).length+'명의 승부를 지켜봐요.');}
 if(!gameExperienceSample||gameExperienceSample.key!==key||gameExperienceSample.self!==own?.id){gameExperienceSample={key,self:own?.id,score:own?.score||0,marker:gameExperienceMarker(w.game,own),until:0,delta:0};view.score.hidden=true;}
 const sample=gameExperienceSample,change=gameExperienceDelta(sample.score,own?.score,w.game,playing);sample.score=own?.score||0;
 if(change){sample.delta=now<sample.until&&Math.sign(change)===Math.sign(sample.delta)?sample.delta+change:change;sample.until=now+.8;gameExperienceText(view.score,(sample.delta>0?'+':'')+sample.delta+'점');view.score.dataset.direction=sample.delta>0?'gain':'loss';}
 const marker=gameExperienceMarker(w.game,own);if(playing&&marker>sample.marker&&gameExperienceEvents[w.game]){sample.until=now+.8;sample.delta=0;gameExperienceText(view.score,gameExperienceEvents[w.game][1]);view.score.dataset.direction='gain';}sample.marker=marker;
 view.score.hidden=!playing||now>=sample.until||!own||!!own.forfeited;
 const seconds=typeof arcadeClockSeconds==='function'?arcadeClockSeconds(w):Math.max(0,w.duration-now),urgent=playing&&seconds>0&&seconds<=5;
 if(arcadeDialog.dataset.timePressure!==String(urgent))arcadeDialog.dataset.timePressure=String(urgent);view.track.hidden=!playing;
 const scale=Math.max(0,Math.min(1,seconds/w.duration)).toFixed(4),transform='scaleX('+scale+')';if(view.fill.style.transform!==transform)view.fill.style.transform=transform;
 const clock=$('arcadeClock'),clockLabel=playing?'남은 시간 '+Math.ceil(seconds)+'초':countdown?'시작 준비':'경기 종료';if(clock&&clock.getAttribute('aria-label')!==clockLabel)clock.setAttribute('aria-label',clockLabel);
}
const gameExperienceBaseRender=arcadeRender;
arcadeRender=function(...args){const value=gameExperienceBaseRender(...args);gameExperienceRender();return value;};
/* END_GAME_EXPERIENCE_V1 */
