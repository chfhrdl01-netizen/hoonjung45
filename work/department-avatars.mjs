/* DEPARTMENT_AVATARS_V1 */

const deptAvatarCache=new Map();
const deptAvatarLegacy={business:0,accounting:1,economics:2,tourism:3,hotel:4,japanese:5,korean:6,translation:6,international:7,facility:9};
const deptAvatarSkin=['#bada73','#c8a1df','#edcc66','#8ec9d6','#efaa80','#e8a5b5','#b4c88b','#a6b3dd','#dfb27c','#8dc2a1','#d9bf86','#a9cad1','#cdb69b','#c3c782','#d6a9c2','#a9b6d1'];
const deptAvatarWardrobe={
 business:{label:'경영 조끼',description:'비뚤어진 넥타이와 동그란 안경. 오늘도 메뉴만큼은 기획대로!',color:'#748b70',trim:'#e9d489',glasses:'round',badge:'tie'},
 accounting:{label:'회계 조끼',description:'계산기 주머니와 네모 안경. 밥값 계산은 진지한 편.',color:'#887a9b',trim:'#e4ca90',glasses:'square',badge:'calculator'},
 finance:{label:'금융 재킷',description:'작은 상승 그래프를 달고 나온, 점심 수익률 전문가.',color:'#8e7957',trim:'#e7cb77',glasses:'round',badge:'chart'},
 lab:{label:'실험 가운',description:'구겨진 흰 가운과 투명 보안경. 반응은 느려도 실험은 계속!',color:'#e3e5cd',trim:'#87aaa1',glasses:'goggles',badge:'flask'},
 engineering:{label:'작업 조끼',description:'렌치 배지가 달린 작업 조끼. 고장 난 점심시간도 수리 중.',color:'#a68f66',trim:'#e9c35f',glasses:'square',badge:'wrench'},
 computer:{label:'코딩 후드',description:'픽셀 주머니와 살짝 큰 헤드셋. 밥 먹기 전 저장은 필수.',color:'#788a96',trim:'#a6c6b0',headset:true,badge:'pixel'},
 education:{label:'선생님 조끼',description:'ABC 명찰과 동그란 안경. 메뉴 발표 시간은 지금이에요.',color:'#b18f76',trim:'#eee0a8',glasses:'round',badge:'book'},
 sports:{label:'체육 유니폼',description:'등번호가 삐뚤어진 운동복. 몸풀기보다 밥풀기가 먼저.',color:'#9a6f67',trim:'#ead6b7',badge:'number'},
 design:{label:'작업 앞치마',description:'물감이 묻은 앞치마. 오늘의 점심에도 색감은 중요해.',color:'#b39a76',trim:'#d5b4c1',badge:'paint'},
 law:{label:'법무 법복',description:'작은 저울 배지가 달린 구겨진 법복. 메뉴 이의 있습니다!',color:'#6e6c77',trim:'#dfd4a9',glasses:'square',badge:'scale'},
 social:{label:'돌봄 조끼',description:'하트 주머니가 달린 조끼. 모두 같이 밥 먹는 게 목표.',color:'#a58b8b',trim:'#e7b6b0',badge:'heart'},
 aviation:{label:'항공 스카프',description:'작은 헤드셋과 스카프. 오늘의 점심행 비행이 곧 출발합니다.',color:'#748a96',trim:'#d49583',headset:true,badge:'wing'},
 chef:{label:'요리 앞치마',description:'흰 앞치마와 조그만 숟가락 배지. 맛 평가만큼은 엄격해.',color:'#e7dec8',trim:'#a56e5c',badge:'spoon'},
 medical:{label:'의료 가운',description:'흰 가운에 작은 청진기. 배고픔 증세가 조금 심각합니다.',color:'#dce5d8',trim:'#8cabaa',badge:'medical'},
 music:{label:'음악 재킷',description:'커다란 헤드폰과 음표 주머니. 오늘도 점심 박자에 맞춰.',color:'#887e9d',trim:'#d6c294',headset:true,badge:'note'},
 languages:{label:'언어 탐험 조끼',description:'번역책 주머니와 짝짝이 안경. 맛있다는 말은 어느 언어든 통하니까.',color:'#8d987d',trim:'#d7ba87',glasses:'odd',badge:'book'}
};
function deptAvatarHash(value){let h=2166136261;for(const c of String(value||'business')){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function deptAvatarEscape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}
function deptAvatarStyle(option){
 const aliases={science:'lab',laboratory:'lab',nursing:'medical',health:'medical',medicine:'medical',teacher:'education',teaching:'education',physical:'sports',sport:'sports',art:'design',arts:'design',it:'computer',computing:'computer',software:'computer',police:'law',legal:'law',welfare:'social',counseling:'social',flight:'aviation',pilot:'aviation',hotel:'chef',culinary:'chef',language:'languages',humanities:'languages',translation:'languages',economics:'finance',facility:'engineering',agriculture:'lab',environment:'lab',architecture:'engineering',media:'design',communication:'design'};
 const explicit=String(option.avatarStyle||'').toLowerCase();if(deptAvatarWardrobe[explicit])return explicit;if(aliases[explicit])return aliases[explicit];
 const id=String(option.id||''),legacy={business:'business',accounting:'accounting',economics:'finance',tourism:'aviation',hotel:'chef',japanese:'languages',korean:'education',translation:'languages',international:'languages',facility:'engineering'};if(legacy[id])return legacy[id];
 const name=[option.name,option.short,option.college,id].filter(Boolean).join(' ');
 for(const [pattern,style]of [[/간호|의료|보건|치료|재활|의학|임상|응급|건강|medical|nurs|health/i,'medical'],[/체육|스포츠|운동|재활스포츠|sport|physical/i,'sports'],[/항공|비행|항공서비스|aviation|flight/i,'aviation'],[/외식|조리|식품영양|호텔|요리|culinary|chef|hotel/i,'chef'],[/컴퓨터|소프트웨어|인공지능|정보통신|사이버|데이터|computer|software|ai_/i,'computer'],[/법학|경찰|행정|법무|law|police|public/i,'law'],[/사회복지|심리|상담|가정|아동복지|social|welfare|psych/i,'social'],[/교육|사범|유아|초등|특수|교직|education|teacher/i,'education'],[/디자인|미술|영상|미디어|만화|패션|조형|design|art|media/i,'design'],[/음악|성악|작곡|공연|music/i,'music'],[/회계|세무|account/i,'accounting'],[/경제|금융|무역|통상|finance|economic/i,'finance'],[/경영|마케팅|부동산|business|management/i,'business'],[/기계|전기|전자|로봇|건축|토목|산업|시설|공학|engineering|mechanic/i,'engineering'],[/화학|생명|환경|농|동물|식물|수학|물리|자연|science|biology|chem|lab/i,'lab'],[/어문|국어|영어|일어|중국|일본|언어|통번역|역사|문화|문학|철학|영문|language|english|korean/i,'languages']])if(pattern.test(name))return style;
 return 'languages';
}
function deptAvatarClothes(style){
 const t=deptAvatarWardrobe[style],stroke='#494036';
 const shape=style==='law'?'<path d="M34 96h77l7 21H29z" fill="'+t.color+'" stroke="'+stroke+'" stroke-width="2"/>':'<path d="m35 96 20-1 15 4 15-4 24 1 2 22H33z" fill="'+t.color+'" stroke="'+stroke+'" stroke-width="2"/>';
 const collar='<path d="m57 95 13 5 13-5-5 10-8-5-8 5z" fill="'+t.trim+'" stroke="'+stroke+'" stroke-width="1.5"/>';
 const badges={tie:'<path d="m69 100-4 8 5 7 5-7-4-8" fill="#d79a75" stroke="#684838" stroke-width="1.5"/>',calculator:'<rect x="86" y="99" width="14" height="15" rx="2" fill="#e1d9bb" stroke="#51463a" stroke-width="1.7"/><path d="M89 102h8m-8 5h3m2 0h3m-8 4h3m2 0h3" stroke="#6f7a62" stroke-width="1.6"/>',chart:'<path d="m85 112 4-6 4 2 7-9m-5 0h5v5" fill="none" stroke="#ead38e" stroke-width="2.6" stroke-linejoin="round"/>',flask:'<path d="M90 98v5l-5 9q7 4 14 0l-5-9v-5m-6 0h8" fill="#96beb1" stroke="#5b7168" stroke-width="1.8"/>',wrench:'<path d="m86 113 11-11m-5-4q-1 9 7 7m-14 9 2 1" fill="none" stroke="#e5d9a6" stroke-width="3.2" stroke-linecap="round"/>',pixel:'<path d="M86 100h5v5h-5zm6 5h5v5h-5zm-6 5h5v5h-5z" fill="#bed5b3"/>',book:'<path d="M84 101q7-3 9 0 7-3 10 0v12q-7-3-10 0-5-3-9 0zm9 0v12" fill="#e5d9b5" stroke="#63543e" stroke-width="1.6"/>',number:'<path d="M84 100h14v14H84z" fill="#eee1bd"/><path d="M88 104h7l-4 8" fill="none" stroke="#795649" stroke-width="2.5"/>',paint:'<circle cx="89" cy="103" r="3.2" fill="#b9706f"/><circle cx="98" cy="107" r="3.2" fill="#8ca8b2"/><circle cx="87" cy="112" r="2.5" fill="#d9be71"/>',scale:'<path d="M92 99v14m-8-11h16m-12 0-4 6h8zm8 0-4 6h8z" fill="none" stroke="#dfcc96" stroke-width="1.5"/>',heart:'<path d="M92 113q-12-8-5-12 4-2 5 2 3-5 7-2 7 5-7 12" fill="#e3b1a4" stroke="#805e59" stroke-width="1.5"/>',wing:'<path d="m83 106 10-3 10 3-10 4z" fill="#e5d09b" stroke="#635949" stroke-width="1.5"/>',spoon:'<ellipse cx="92" cy="102" rx="3" ry="4" fill="#c4c5ac" stroke="#6e6d5a" stroke-width="1.5"/><path d="m92 106-2 8" stroke="#6e6d5a" stroke-width="2"/>',medical:'<path d="M52 97v6q0 9 9 9 9 0 9-9v-5m-18 0v-3m18 3v-3" fill="none" stroke="#6c8e87" stroke-width="2.5"/><circle cx="75" cy="111" r="4" fill="#b6c9bd" stroke="#637b73" stroke-width="1.8"/><path d="M88 102h12m-6-6v12" stroke="#b1847c" stroke-width="2.5"/>',note:'<path d="M92 100v11m0-11 8-2v11" fill="none" stroke="#e1d0a2" stroke-width="2.3"/><ellipse cx="89" cy="111" rx="3" ry="2.4" fill="#e1d0a2"/><ellipse cx="97" cy="109" rx="3" ry="2.4" fill="#e1d0a2"/>'};
 return '<g class="av-costume" data-costume="'+style+'">'+shape+collar+(style==='chef'?'<path d="M45 96v17h49V96m-52 5h55" fill="none" stroke="#a8a18c" stroke-width="1.8"/>':'')+(badges[t.badge]||'')+'</g>';
}
function deptAvatarAccessories(style){
 const t=deptAvatarWardrobe[style],s='#4c4840';let out='';
 if(t.glasses==='square'||t.glasses==='goggles')out='<rect x="34" y="55" width="29" height="22" rx="'+(t.glasses==='goggles'?7:4)+'"/><rect x="74" y="52" width="29" height="25" rx="'+(t.glasses==='goggles'?7:4)+'"/><path d="m63 63 11-1m-46-1 6 2m69-3 8-3"/>';
 if(t.glasses==='round'||t.glasses==='odd')out='<ellipse cx="48" cy="65" rx="15" ry="12"/><ellipse cx="88" cy="63" rx="'+(t.glasses==='odd'?13:15)+'" ry="'+(t.glasses==='odd'?15:12)+'"/><path d="m63 63 10-1m-47-2 7 3m70-4 8-3"/>';
 if(out)out='<g class="av-glasses" fill="none" stroke="'+s+'" stroke-width="1.9" stroke-linecap="round">'+out+'</g>';
 if(t.headset)out+='<g class="av-headset" fill="none" stroke="'+s+'" stroke-width="3.2"><path d="M23 62q-2-43 46-43 51-4 51 41"/><path d="m118 68-5 13-13 2" stroke-width="2.5"/><rect x="17" y="49" width="10" height="25" rx="4" fill="'+t.trim+'"/><rect x="114" y="48" width="10" height="25" rx="4" fill="'+t.trim+'"/></g>';
 return out;
}

function deptUnselectedSvg(){
 return '<svg class="dept-avatar-svg dept-avatar-unselected" data-avatar="unselected" viewBox="0 0 140 130" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><title>캐릭터 미선택</title><ellipse cx="70" cy="120" rx="42" ry="5" fill="#29201f18"/><path d="M30 47Q25 18 70 18q47 0 43 32 19 59-43 60-63 1-40-63Z" fill="#e5dfcd" stroke="#8b8068" stroke-width="3" stroke-dasharray="6 5"/><text x="70" y="89" text-anchor="middle" fill="#796b50" font-family="system-ui,sans-serif" font-size="68" font-weight="900">?</text></svg>';
}
function deptAvatarSvg(department){
 if(department==='unselected')return deptUnselectedSvg();
 const option=deptOption(department)||deptOptions[0]||{id:'business',name:'밥친구'},id=String(option.id||'business'),hash=deptAvatarHash(id),legacy=Object.prototype.hasOwnProperty.call(deptAvatarLegacy,id),i=legacy?deptAvatarLegacy[id]:hash%12,skin=deptAvatarSkin[legacy?i:hash%deptAvatarSkin.length],style=deptAvatarStyle(option),key=[id,style,skin,option.name||''].join('|');
 if(deptAvatarCache.has(key))return deptAvatarCache.get(key);
 const eyes=i%3===0?'<path d="m39 58 17 3m26-4 16-4" stroke="#29201f" stroke-width="5"/><circle cx="49" cy="67" r="4"/><circle cx="88" cy="63" r="3"/>':i%3===1?'<ellipse cx="48" cy="63" rx="11" ry="9" fill="#fff9e4"/><ellipse cx="89" cy="61" rx="9" ry="12" fill="#fff9e4"/><circle cx="51" cy="66" r="3"/><circle cx="85" cy="65" r="4"/>':'<path d="m37 63 20 2m24-5 20 3" stroke="#29201f" stroke-width="5"/><circle cx="48" cy="68" r="3"/><circle cx="91" cy="66" r="3"/>';
 const mouth=i%2?'<path d="M60 84q10-7 22 1l-3 10H63z" fill="#5f3434" stroke="#29201f" stroke-width="3"/><path d="M66 86h9v6h-9z" fill="#fff4d4"/>':'<path d="M54 82q8-13 16-2 9-10 18 3-12 1-18-2-8 4-16 1" fill="#47332d"/><path d="m65 93 13-1" stroke="#29201f" stroke-width="3"/>';
 const hat=i%4===0?'<path d="m28 26 16-15 18 11L82 8l15 17 17-8-4 23-80-2z" fill="#e2e27a" stroke="#29201f" stroke-width="3"/>':i%4===1?'<path d="M33 31q35-24 73 3l-3 7-74-3z" fill="#edb1bd" stroke="#29201f" stroke-width="3"/>':i%4===2?'<path d="m33 28 8-9 5 12m42-6 8-12 7 17" fill="none" stroke="#29201f" stroke-width="4"/>':'<path d="M27 33q41-13 86 2l-1 9-85-3z" fill="#f8f3d6" stroke="#29201f" stroke-width="3"/>';
 const bodies=['M29 51Q13 10 71 20q56-3 46 39 22 49-32 51-68 8-60-31-16-21 4-28Z','M26 50Q14 18 70 22q58-6 48 35 18 48-29 52-66 12-64-29-14-23 1-30Z','M30 49Q18 9 68 19q58-5 51 39 17 46-32 52-64 8-61-29-13-24 4-32Z'],body=bodies[legacy?0:(hash>>>4)%bodies.length],clip='av-cloth-'+hash.toString(36),safeId=deptAvatarEscape(id),title=deptAvatarEscape(option.name||'밥친구');
 const svg='<svg class="dept-avatar-svg gremlin-svg" data-avatar="'+safeId+'" data-costume="'+style+'" viewBox="0 0 140 130" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><title>'+title+' · '+deptAvatarWardrobe[style].label+'</title><defs><clipPath id="'+clip+'"><path d="'+body+'"/></clipPath></defs><ellipse cx="70" cy="120" rx="44" ry="5" fill="#29201f22"/><path class="gremlin-feet" d="m47 106-13 10 23 1m29-11 17 11-24 1" stroke="#29201f" stroke-width="7" stroke-linecap="round" fill="none"/><g class="av-body"><path class="av-skin" d="'+body+'" fill="'+skin+'" stroke="#29201f" stroke-width="4"/><path d="m30 76-16 6 8 8m90-15 18 1-8 12" stroke="#29201f" stroke-width="5" stroke-linecap="round" fill="none"/>'+hat+'<g clip-path="url(#'+clip+')">'+deptAvatarClothes(style)+'</g><g class="av-face" fill="#29201f">'+eyes+'</g><ellipse cx="72" cy="73" rx="9" ry="7" fill="#ce8b73" stroke="#29201f" stroke-width="2"/>'+mouth+'<path d="m32 73 8 3m59-4 8 2" stroke="#c17c70" stroke-width="4"/><path d="m50 39 2-5m40 10 1-5" stroke="#fff9d266" stroke-width="4"/>'+deptAvatarAccessories(style)+'</g></svg>';
 deptAvatarCache.set(key,svg);if(deptAvatarCache.size>512)deptAvatarCache.delete(deptAvatarCache.keys().next().value);return svg;
}

function deptAvatarPreview(){
 const select=document.getElementById('netDepartment');if(!select)return;let preview=document.getElementById('deptAvatarPreview');
 if(!preview){preview=document.createElement('div');preview.id='deptAvatarPreview';preview.className='dept-avatar-preview';preview.innerHTML='<div class="dept-avatar-preview-art"></div><div class="dept-avatar-preview-info"><span class="dept-avatar-preview-kicker">오늘의 밥친구</span><strong></strong><b></b><span class="dept-avatar-preview-description"></span></div>';select.closest('.net-department-wrap')?.append(preview);select.addEventListener('change',deptAvatarPreview);}
 const chosen=deptById.has(select.value),option=chosen?deptOption(select.value):null,wardrobe=option?deptAvatarWardrobe[deptAvatarStyle(option)]:null,signature=option?[option.id,option.name,wardrobe.label].join('|'):'unselected';
 if(preview.dataset.avatarSignature!==signature){
  preview.dataset.department=option?.id||'unselected';preview.dataset.avatarSignature=signature;preview.querySelector('.dept-avatar-preview-art').innerHTML=option?deptAvatarSvg(option.id):deptUnselectedSvg();preview.querySelector('strong').textContent=option?.name||'캐릭터를 골라주세요';preview.title=option?option.name+' · '+wardrobe.label:'캐릭터 미선택';
 }
 const describe=()=>{if((option&&select.value!==option.id)||(!option&&deptById.has(select.value)))return;preview.querySelector('b').textContent=wardrobe?.label||'아직 미선택';preview.querySelector('.dept-avatar-preview-description').textContent=option?(option.college?option.college+' · ':'')+wardrobe.description:'학과·캐릭터를 직접 선택해야 준비를 완료할 수 있어요.';};describe();if(typeof queueMicrotask==='function')queueMicrotask(describe);
 if(typeof netMembers==='function')netMembers().forEach((member,index)=>{
  const card=document.getElementById('person_'+index),portrait=card?.querySelector('.person>.avatar,.person>.dept-card-portrait');if(!portrait)return;
  const selected=typeof netHasDepartment==='function'?netHasDepartment(member.id):deptById.has(typeof netDepartments==='object'?netDepartments[member.id]:undefined),role=selected?netDepartment(member.id):'unselected';
  if(portrait.dataset.department!==role){portrait.className='dept-card-portrait';portrait.dataset.department=role;portrait.innerHTML=deptAvatarSvg(role);portrait.title=selected?deptOption(role).name:'캐릭터 미선택';}
 });
}
const deptAvatarBaseSetup=renderSetup;renderSetup=function(){const value=deptAvatarBaseSetup.apply(this,arguments);deptAvatarPreview();return value;};
const deptAvatarBaseRender=deptRender;deptRender=function(){deptAvatarBaseRender();if(!deptRace||!deptView||deptView.hidden)return;const t=deptRace.elapsed;for(const lane of deptRace.lanes){const runner=deptRows.get(lane.id)?.runner;if(!runner)continue;runner.classList.toggle('is-moving',deptRace.phase==='running'&&lane.finishedAt===null&&t>=lane.stunUntil);runner.classList.toggle('is-jump',t<lane.jumpUntil);runner.classList.toggle('is-hit',t<lane.stunUntil);}};


