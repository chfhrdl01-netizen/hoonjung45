(function installLunchRoom(){
'use strict';
const VERSION=3,BUILD='party30-20261120-stayroom',PREFIX='du-lunch-online-v3-',MAX_MEMBERS=8,MAX_BYTES=100000;
const $=id=>document.getElementById(id),handlers={command:[],state:[],ready:[],presence:[],disconnect:[],private:[]};
let peer=null,upstream=null,roster=[],me=null,host=false,active=false,ready=false,code='',locked=false,busy=false,generation=0,loadPromise=null,joinTimeout=0,hostOpenTimeout=0,lastSnapshot=null,snapshotSeq=0,lastReceivedSeq=-1;
const links=new Map();
/* ROOM_PRESENCE_V1 */
const PRESENCE_INTERVAL=2000,PRESENCE_TIMEOUT=12000;
let presenceLastTick=performance.now(),hostLastSeen=performance.now();
function presenceProbe(conn){return sendPacket(conn,{v:VERSION,type:'presence-ping'});}
function presenceGrace(){const now=performance.now();presenceLastTick=hostLastSeen=now;for(const entry of links.values())entry.lastSeen=now;if(active){if(host){for(const entry of links.values())if(entry.member)presenceProbe(entry.conn);}else presenceProbe(upstream);}}
function presenceTick(){
 const now=performance.now(),suspended=now-presenceLastTick>6000;presenceLastTick=now;if(!active||!ready)return;
 if(suspended){presenceGrace();return;}
 if(host){for(const [peerId,entry]of [...links]){if(!entry.member)continue;if(now-entry.lastSeen>PRESENCE_TIMEOUT){dropIncoming(peerId,entry.member.name+'님의 연결이 끊겨 방에서 나갔어요.',entry);continue;}presenceProbe(entry.conn);}}
 else{if(now-hostLastSeen>PRESENCE_TIMEOUT){resetRoom('방장과 연결이 끊겨 방에서 나왔어요. 다시 참여하려면 방 코드를 확인하고 입장해주세요.');return;}presenceProbe(upstream);}
}
setInterval(presenceTick,PRESENCE_INTERVAL);
function emit(kind,...args){for(const fn of [...handlers[kind]]){try{fn(...args);}catch(error){console.error('Lunch room handler:',kind,error);}}}
function copyMembers(){return roster.map(m=>({id:m.id,name:m.name,connected:m.connected===true,consent:true}));}
function make(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function nickname(value){return String(value||'').normalize('NFC').trim().replace(/\s+/g,' ');}
function validName(name){return typeof name==='string'&&[...name].length>=1&&[...name].length<=12&&!/[\u0000-\u001f\u007f]/.test(name);}
function readCode(value){let v=String(value||'').trim();if(/^https?:\/\//i.test(v)){try{v=new URL(v).searchParams.get('room')||'';}catch{v='';}}v=v.toUpperCase();return /^[A-Z0-9]{6,8}$/.test(v)?v:'';}
// Keep the address-bar invitation aligned with the room actually being used.
function roomAddress(value=''){
 const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('v',BUILD);
 const next=readCode(value);if(next)url.searchParams.set('room',next);return url;
}
function syncRoomAddress(value=''){
 const url=roomAddress(value);try{window.history?.replaceState(window.history.state,'',url.href);}catch{}return url;
}
function randomCode(){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',a=new Uint32Array(6);crypto.getRandomValues(a);return Array.from(a,n=>alphabet[n%alphabet.length]).join('');}
function payloadOK(value){if(!value||typeof value!=='object'||Array.isArray(value))return false;try{return new TextEncoder().encode(JSON.stringify(value)).byteLength<=MAX_BYTES;}catch{return false;}}
function setStatus(message,isError=false){$('roomStatus').textContent=message;$('roomStatus').className='room-status'+(isError?' error':'');if(active)$('roomBannerNotice').textContent=message;}
function refreshButtons(){const ok=validName(nickname($('roomNickname').value))&&$('roomConsent').checked&&!busy;$('roomCreateBtn').disabled=!ok;$('roomJoinBtn').disabled=!ok||!readCode($('roomCodeInput').value);$('roomNickname').disabled=busy;$('roomConsent').disabled=busy;$('roomCodeInput').disabled=busy;}
function setBusy(value){busy=value;refreshButtons();}
function render(){document.body.classList.toggle('online-pending',!active);$('roomLobby').hidden=active;$('roomBanner').hidden=!active;if(!active)return;$('roomCodeText').textContent=code;$('roomRoster').replaceChildren();roster.forEach(m=>{const chip=make('span','room-member');chip.append(make('i','room-dot'),document.createTextNode(m.name));if(m.id===me?.id)chip.append(make('small','','나'));if(m.id===roster[0]?.id)chip.append(make('small','','방장'));$('roomRoster').append(chip);});$('roomMemberCount').textContent='점심 주문 참여 동의 · '+roster.length+'/'+MAX_MEMBERS+'명';$('roomHostNotice').textContent=host?'방장은 이 화면을 열어두세요.':(locked?'게임 진행 중 · 같은 화면이 실시간으로 공유돼요.':'방장이 시작하면 함께 진행해요.');}
function sendPacket(conn,packet){if(!conn?.open||!payloadOK(packet))return false;try{conn.send(packet);return true;}catch{return false;}}
function broadcastPacket(packet){for(const entry of links.values())if(entry.member)sendPacket(entry.conn,packet);}
function presence(event){const packet={v:VERSION,type:'presence',members:copyMembers(),locked,event};broadcastPacket(packet);render();emit('presence',copyMembers(),event);}
function safeRoster(list){return Array.isArray(list)&&list.length>=1&&list.length<=MAX_MEMBERS&&list.every(m=>m&&typeof m.id==='string'&&m.id.length<=128&&validName(m.name)&&m.consent===true&&m.connected===true)&&new Set(list.map(m=>m.id)).size===list.length&&new Set(list.map(m=>m.name.toLocaleLowerCase())).size===list.length;}
function cleanConnection(entry){clearTimeout(entry.timer);try{entry.conn.close();}catch{}}
function clearPeer(){clearTimeout(joinTimeout);clearTimeout(hostOpenTimeout);joinTimeout=hostOpenTimeout=0;for(const entry of links.values())cleanConnection(entry);links.clear();try{upstream?.close();}catch{}try{peer?.destroy();}catch{}peer=null;upstream=null;}
function resetRoom(reason,notify=true){const wasActive=active,wasHost=host,oldSelf=me?.id;generation++;active=false;ready=false;clearPeer();roster=[];me=null;code='';locked=false;host=false;lastSnapshot=null;snapshotSeq=0;lastReceivedSeq=-1;setBusy(false);if(wasActive){syncRoomAddress();if(wasHost)$('roomCodeInput').value='';}$('roomConsent').checked=false;$('roomCopyFallback').hidden=true;$('roomBannerNotice').textContent='';render();if(reason)setStatus(reason,notify);refreshButtons();if(wasActive)emit('disconnect',{reason:reason||'방 연결이 종료됐어요.',self:true,hostLost:!wasHost,memberId:oldSelf});}
function reject(conn,message){sendPacket(conn,{v:VERSION,type:'reject',message});setTimeout(()=>{try{conn.close();}catch{}},120);}
function dropIncoming(peerId,reason='참가자가 연결을 종료했어요.',expectedEntry){const entry=links.get(peerId);if(!entry||(expectedEntry&&expectedEntry!==entry))return;links.delete(peerId);const member=entry.member;if(member)roster=roster.filter(m=>m.id!==member.id);cleanConnection(entry);if(member){presence({kind:'leave',memberId:member.id,name:member.name,reason});setStatus(reason,false);emit('disconnect',{reason,memberId:member.id,hostLost:false,self:false});}}
function acceptIncoming(conn,token){if(token!==generation||!host){try{conn.close();}catch{}return;}if(links.has(conn.peer)){reject(conn,'이미 연결된 참가자예요.');return;}const entry={conn,member:null,timer:0,count:0,windowAt:performance.now(),lastSeen:performance.now()};links.set(conn.peer,entry);entry.timer=setTimeout(()=>{if(token===generation&&links.get(conn.peer)===entry&&!entry.member){reject(conn,'입장 확인 시간이 지났어요. 다시 입장해주세요.');dropIncoming(conn.peer,undefined,entry);}},12000);
conn.on('data',packet=>{if(token!==generation||!host||!active||links.get(conn.peer)!==entry||!payloadOK(packet)||packet.v!==VERSION)return;const now=performance.now();entry.lastSeen=now;if(now-entry.windowAt>2000){entry.count=0;entry.windowAt=now;}if(++entry.count>400){try{conn.close();}catch{}dropIncoming(conn.peer,'입력 요청이 너무 많아 연결을 종료했어요.',entry);return;}
if(!entry.member){if(packet.type!=='hello')return;if(packet.presence!==2||packet.build!==BUILD){reject(conn,'게임이 업데이트됐어요. 참가자 모두 새로고침한 뒤 새 방에 모여주세요.');return;}const name=nickname(packet.name);if(packet.consent!==true){reject(conn,'점심 주문 참여에 직접 동의해야 입장할 수 있어요.');return;}if(!validName(name)){reject(conn,'닉네임은 1~12자로 입력해주세요.');return;}if(locked){reject(conn,'이미 게임이 진행 중이에요. 다음 판에 입장해주세요.');return;}if(roster.length>=MAX_MEMBERS){reject(conn,'이 방은 최대 8명까지 참여할 수 있어요.');return;}if(roster.some(m=>m.name.toLocaleLowerCase()===name.toLocaleLowerCase())){reject(conn,'이미 사용 중인 닉네임이에요. 다른 이름을 골라주세요.');return;}entry.member={id:conn.peer,name,connected:true,consent:true};clearTimeout(entry.timer);roster.push(entry.member);sendPacket(conn,{v:VERSION,type:'welcome',presence:2,build:BUILD,selfId:entry.member.id,code,members:copyMembers(),locked});presence({kind:'join',memberId:entry.member.id,name});if(lastSnapshot!==null)sendPacket(conn,{v:VERSION,type:'state',seq:snapshotSeq,data:lastSnapshot});return;}
if(packet.type==='presence-ping'){sendPacket(conn,{v:VERSION,type:'presence-pong'});return;}if(packet.type==='presence-pong')return;if(packet.type==='command'&&payloadOK(packet.data))emit('command',entry.member.id,packet.data);else if(packet.type==='leave'){dropIncoming(conn.peer,entry.member.name+'님이 방에서 나갔어요.',entry);try{conn.close();}catch{}}
});conn.on('close',()=>{if(token===generation&&links.get(conn.peer)===entry)dropIncoming(conn.peer,(entry.member?.name||'참가자')+'님이 연결을 종료해 방에서 나갔어요.',entry);});conn.on('error',()=>{if(token===generation&&links.get(conn.peer)===entry)dropIncoming(conn.peer,'참가자의 연결이 끊겼어요.',entry);});}
function loadPeer(){if(typeof window.Peer==='function')return Promise.resolve(window.Peer);if(loadPromise)return loadPromise;loadPromise=new Promise((resolve,rejectLoad)=>{const urls=['https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js','https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js'];let i=0;function next(){if(typeof window.Peer==='function'){resolve(window.Peer);return;}if(i>=urls.length){loadPromise=null;rejectLoad(Error('연결 기능을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도해주세요.'));return;}const script=document.createElement('script');script.src=urls[i++];script.async=true;script.crossOrigin='anonymous';let ended=false;const timer=setTimeout(failed,12000);function failed(){if(ended)return;ended=true;clearTimeout(timer);script.remove();next();}script.onerror=failed;script.onload=()=>{if(ended)return;ended=true;clearTimeout(timer);if(typeof window.Peer==='function')resolve(window.Peer);else{script.remove();next();}};document.head.append(script);}next();});return loadPromise;}
function failureMessage(error){const kind=error?.type||'';if(kind==='peer-unavailable')return '해당 방을 찾을 수 없어요. 방 코드와 방장이 접속 중인지 확인해주세요.';if(kind==='unavailable-id')return '이 방 코드가 이미 사용 중이에요. 새 방 만들기를 다시 눌러주세요.';if(kind==='browser-incompatible')return '이 브라우저에서는 실시간 연결을 지원하지 않아요. 최신 브라우저에서 열어주세요.';return '실시간 연결이 끊겼어요. 인터넷 연결을 확인하고 다시 시도해주세요.';}
function validateEntry(){const name=nickname($('roomNickname').value);if(!validName(name)){setStatus('닉네임을 1~12자로 입력해주세요.',true);$('roomNickname').focus();return null;}if(!$('roomConsent').checked){setStatus('오늘 점심 주문 참여에 직접 동의해주세요.',true);$('roomConsent').focus();return null;}return name;}
async function createRoom(){const name=validateEntry();if(!name||busy||active)return;syncRoomAddress();$('roomCodeInput').value='';setBusy(true);setStatus('새 점심방을 연결하고 있어요…');const token=++generation;try{const Peer=await loadPeer();if(token!==generation)return;host=true;code=randomCode();peer=new Peer(PREFIX+code,{secure:true,debug:0});hostOpenTimeout=setTimeout(()=>{if(token===generation&&!active)resetRoom('방 연결이 지연되고 있어요. 잠시 후 다시 시도해주세요.');},18000);peer.on('connection',conn=>acceptIncoming(conn,token));peer.on('call',call=>{try{call.close();}catch{}});peer.on('error',e=>{if(token!==generation)return;if(active&&e.type==='peer-unavailable')return;resetRoom(failureMessage(e));});peer.on('disconnected',()=>{if(token!==generation)return;if(active){$('roomBannerNotice').textContent='초대 연결이 잠시 끊겼어요. 이미 연결된 참가자끼리는 계속할 수 있어요.';try{peer.reconnect();}catch{}}});peer.on('open',id=>{if(token!==generation)return;clearTimeout(hostOpenTimeout);syncRoomAddress(code);$('roomCodeInput').value=code;if(active&&me?.id===id){$("roomBannerNotice").textContent="초대 연결이 복구됐어요.";render();return;}me={id,name,connected:true,consent:true};roster=[me];active=ready=true;setBusy(false);setStatus('점심방을 만들었어요. 초대 링크를 공유해주세요.');render();emit('ready',{isHost:true,selfId:me.id,code,members:copyMembers()});emit('presence',copyMembers(),{kind:'created',memberId:me.id});});}catch(error){if(token===generation)resetRoom(error.message||'방을 만들지 못했어요. 다시 시도해주세요.');}}
async function joinRoom(){const name=validateEntry(),joinCode=readCode($('roomCodeInput').value);if(!name||busy||active)return;if(!joinCode){setStatus('올바른 방 코드를 입력해주세요.',true);return;}syncRoomAddress(joinCode);$('roomCodeInput').value=joinCode;setBusy(true);setStatus('방 '+joinCode+'에 입장하고 있어요…');const token=++generation;try{const Peer=await loadPeer();if(token!==generation)return;host=false;code=joinCode;peer=new Peer(undefined,{secure:true,debug:0});joinTimeout=setTimeout(()=>{if(token===generation&&!active)resetRoom('방에 연결하지 못했어요. 방 코드와 방장 접속을 확인해주세요. 학교 네트워크에서 연결이 막히면 다른 네트워크로 다시 시도해주세요.');},20000);peer.on('error',e=>{if(token===generation)resetRoom(failureMessage(e));});peer.on('call',call=>{try{call.close();}catch{}});peer.on('open',()=>{if(token!==generation)return;upstream=peer.connect(PREFIX+joinCode,{serialization:'json',reliable:true,metadata:{v:VERSION}});upstream.on('open',()=>{if(token===generation)sendPacket(upstream,{v:VERSION,type:'hello',presence:2,build:BUILD,name,consent:true});});upstream.on('data',packet=>{if(token!==generation||!payloadOK(packet)||packet.v!==VERSION)return;hostLastSeen=performance.now();if(packet.type==='reject'){resetRoom(typeof packet.message==='string'?packet.message:'방에 입장할 수 없어요.');return;}if(packet.type==='ended'){resetRoom('방장이 주문 참여를 취소해 방이 종료됐어요. 새 방에 다시 모여주세요.');return;}if(packet.type==='welcome'){if(packet.presence!==2||packet.build!==BUILD){resetRoom('방장이 이전 게임 버전을 사용 중이에요. 모두 새로고침한 뒤 새 방을 만들어주세요.');return;}if(active||!safeRoster(packet.members)||typeof packet.selfId!=='string'||!packet.members.some(m=>m.id===packet.selfId))return;clearTimeout(joinTimeout);syncRoomAddress(code);$('roomCodeInput').value=code;me={...packet.members.find(m=>m.id===packet.selfId)};roster=packet.members.map(m=>({...m}));locked=packet.locked===true;active=ready=true;setBusy(false);setStatus('같은 점심방에 연결됐어요. 내 메뉴를 골라주세요.');render();emit('ready',{isHost:false,selfId:me.id,code,members:copyMembers()});return;}if(!active)return;if(packet.type==='presence-ping'){sendPacket(upstream,{v:VERSION,type:'presence-pong'});return;}if(packet.type==='presence-pong')return;if(packet.type==='private'&&payloadOK(packet.data)){emit('private',packet.data);return;}if(packet.type==='presence'&&safeRoster(packet.members)){if(!packet.members.some(m=>m.id===me.id)){resetRoom('방 참가가 종료됐어요. 다시 입장해주세요.');return;}roster=packet.members.map(m=>({...m}));locked=packet.locked===true;render();emit('presence',copyMembers(),packet.event||{});}else if(packet.type==='state'&&Number.isSafeInteger(packet.seq)&&packet.seq>lastReceivedSeq&&packet.data&&typeof packet.data==='object'){lastReceivedSeq=packet.seq;emit('state',packet.data);}});upstream.on('close',()=>{if(token===generation)resetRoom('방장과 연결이 끊겼어요. 방장이 화면을 열어두고 있는지 확인한 뒤 다시 입장해주세요.');});upstream.on('error',()=>{if(token===generation)resetRoom('방장과 연결하지 못했어요. 다른 네트워크에서 다시 시도해주세요.');});});}catch(error){if(token===generation)resetRoom(error.message||'방에 입장하지 못했어요. 다시 시도해주세요.');}}
const api={get active(){return active;},get isHost(){return active&&host;},get selfId(){return me?.id||'';},get selfIndex(){return roster.findIndex(m=>m.id===me?.id);},get code(){return code;},get members(){return copyMembers();},get ready(){return ready;},send(command){if(!active||!ready||!payloadOK(command))return false;if(host){emit('command',me.id,command);return true;}const ok=sendPacket(upstream,{v:VERSION,type:'command',data:command});if(!ok)setStatus('연결 상태를 확인해주세요. 입력을 전송하지 못했어요.',true);return ok;},broadcast(snapshot){if(!active||!host||!payloadOK(snapshot))return false;try{lastSnapshot=JSON.parse(JSON.stringify(snapshot));}catch{return false;}snapshotSeq++;broadcastPacket({v:VERSION,type:'state',seq:snapshotSeq,data:lastSnapshot});return true;},/* PRIVATE_ROOM_V1 */whisper(targetId,payload){if(!active||!host||!payloadOK(payload))return false;if(targetId===me.id){emit('private',JSON.parse(JSON.stringify(payload)));return true;}const entry=[...links.values()].find(e=>e.member?.id===targetId);return !!entry&&sendPacket(entry.conn,{v:VERSION,type:'private',data:payload});},onPrivate(fn){if(typeof fn==='function')handlers.private.push(fn);},onCommand(fn){if(typeof fn==='function')handlers.command.push(fn);},onState(fn){if(typeof fn==='function')handlers.state.push(fn);},onReady(fn){if(typeof fn==='function'){handlers.ready.push(fn);if(active&&ready)queueMicrotask(()=>fn({isHost:host,selfId:me.id,code,members:copyMembers()}));}},onPresence(fn){if(typeof fn==='function')handlers.presence.push(fn);},onDisconnect(fn){if(typeof fn==='function')handlers.disconnect.push(fn);},error(message){setStatus(String(message||'연결 상태를 확인해주세요.'),true);},openLobby(){if(active){$('roomBanner').scrollIntoView({block:'start'});return;}$('roomLobby').hidden=false;document.body.classList.add('online-pending');$('roomNickname').focus();},closeRoom(){const notice='점심 주문 참여를 취소했어요. 다시 참여하려면 새로 동의해주세요.';if(active&&host)broadcastPacket({v:VERSION,type:'ended',reason:'방장이 주문 참여를 취소했어요.'});else if(active)sendPacket(upstream,{v:VERSION,type:'leave'});resetRoom(notice,false);},setLocked(value){const next=!!value;if(!active||!host||next===locked)return;locked=next;presence({kind:'lock',locked});}};
window.LunchRoom=api;
function presenceLeavePage(){if(!active)return;if(host)broadcastPacket({v:VERSION,type:'ended',reason:'방장이 페이지를 닫아 방이 종료됐어요.'});else sendPacket(upstream,{v:VERSION,type:'leave'});resetRoom('페이지를 떠나 방 참가가 종료됐어요. 다시 참여하려면 새로 동의해주세요.',false);}
window.addEventListener('pagehide',presenceLeavePage);
window.addEventListener('offline',()=>{if(active)resetRoom('인터넷 연결이 끊겨 방에서 나왔어요. 연결을 확인한 뒤 다시 입장해주세요.');});
window.addEventListener('pageshow',event=>{if(event.persisted){if(active)presenceLeavePage();render();refreshButtons();setStatus('페이지로 돌아왔어요. 다시 참여하려면 새로 동의하고 입장해주세요.',false);}else presenceGrace();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)presenceGrace();});
api.onReady(presenceGrace);
$('roomCreateBtn').addEventListener('click',createRoom);$('roomJoinBtn').addEventListener('click',joinRoom);['roomNickname','roomCodeInput'].forEach(id=>$(id).addEventListener('input',refreshButtons));$('roomConsent').addEventListener('change',()=>{refreshButtons();if(!$('roomConsent').checked)setStatus('점심 주문 참여에 동의한 사람만 입장할 수 있어요.');});$('roomCodeInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();joinRoom();}});$('roomLeaveBtn').addEventListener('click',()=>api.closeRoom());
$('roomCopyBtn').addEventListener('click',async()=>{if(!active)return;const invitation=syncRoomAddress(code).href;try{if(!navigator.clipboard?.writeText)throw Error();await navigator.clipboard.writeText(invitation);$('roomBannerNotice').textContent='초대 링크를 복사했어요. 함께 주문할 사람에게 보내주세요.';}catch{$('roomCopyFallback').value=invitation;$('roomCopyFallback').hidden=false;$('roomCopyFallback').focus();$('roomCopyFallback').select();$('roomBannerNotice').textContent='아래 초대 링크를 직접 복사해주세요.';}});
try{const invited=readCode(new URL(location.href).searchParams.get('room'));if(invited){$('roomCodeInput').value=invited;setStatus('초대받은 점심방이에요. 닉네임과 주문 참여 동의를 확인하고 입장하세요.');}}catch{}
document.body.classList.add('online-pending');render();refreshButtons();
})();

;


(()=>{
'use strict';
let PEOPLE=['참가자'];
const BASE=[['돈가스','양식'],['국밥','한식'],['비빔밥','한식'],['제육덮밥','한식'],['김치찌개','한식'],['된장찌개','한식'],['짜장면','중식'],['짬뽕','중식'],['쌀국수','아시안'],['파스타','양식'],['햄버거','간편식'],['김밥','간편식'],['순두부찌개','한식'],['부대찌개','한식'],['육개장','한식'],['갈비탕','한식'],['설렁탕','한식'],['냉면','한식'],['칼국수','한식'],['수제비','한식'],['김치볶음밥','한식'],['불고기덮밥','한식'],['초밥','일식'],['회덮밥','일식'],['우동','일식'],['라멘','일식'],['메밀소바','일식'],['가츠동','일식'],['마라탕','중식'],['마파두부덮밥','중식'],['중화비빔밥','중식'],['볶음밥','중식'],['카레','일식'],['팟타이','아시안'],['나시고렝','아시안'],['포케','가벼운식'],['샐러드','가벼운식'],['샌드위치','간편식'],['토스트','간편식'],['피자','양식'],['리조토','양식'],['오므라이스','양식']];
const INITIAL=BASE.map((x,i)=>({id:'default_'+i,name:x[0],category:x[1],enabledFor:[true,true,true],owner:null,custom:false}));
const KEY='du-lunch-online-v3', $=id=>document.getElementById(id);
let reduced=false;
$('motionBtn').setAttribute('aria-pressed',String(reduced));$('motionBtn').textContent='빠른 추첨 '+(reduced?'ON':'OFF');
let pool=INITIAL.map(x=>({...x,enabledFor:[...x.enabledFor]})),history=[],choices=[[],[],[]],active=0,mode='setup',draft=[],race=null,result=null,frame=0,cheers=0,sound=false,audio=null,toastTimer,canStore=true,category='전체',query='',expanded=false,managerPerson=0,duel=null,duelTimer=0,challengerIndex=0;
function validName(x){return typeof x==='string'&&[...x.trim()].length>0&&[...x.trim()].length<=20&&!/[\u0000-\u001f\u007f]/.test(x);}
function visibleFor(item,p){return item.owner===null||item.owner===p;}
function enabled(p=active,items=pool){return items.filter(x=>visibleFor(x,p)&&x.enabledFor[p]);}
function safeRead(){try{const v=JSON.parse(localStorage.getItem(KEY)||'null');if(!v||v.version!==2)return;
 if(Array.isArray(v.pool)){const p=v.pool.filter(x=>x&&/^[-a-zA-Z0-9_]+$/.test(x.id)&&validName(x.name)&&Array.isArray(x.enabledFor)&&x.enabledFor.length===3&&x.enabledFor.every(v=>typeof v==='boolean')&&(x.owner===null||[0,1,2].includes(x.owner))).slice(0,120).map(x=>({id:x.id,name:x.name.trim(),category:typeof x.category==='string'&&BASE.some(b=>b[1]===x.category)?x.category:'내 후보',enabledFor:[...x.enabledFor],owner:x.owner,custom:!!x.custom}));const unique=p.filter((x,i)=>p.findIndex(y=>y.id===x.id)===i);if(PEOPLE.every((_,i)=>enabled(i,unique).length))pool=unique;}
 if(Array.isArray(v.history))history=v.history.filter(x=>x&&validName(x.menu)&&PEOPLE.includes(x.person)&&Number.isFinite(Date.parse(x.time))).slice(0,5).map(x=>({id:typeof x.id==='string'?x.id:x.time,menu:x.menu,person:x.person,time:x.time,source:x.source==='duel'?'duel':'race'}));
 if(Array.isArray(v.choices)&&v.choices.length===3)choices=v.choices.map((ids,p)=>Array.isArray(ids)?[...new Set(ids)].map(id=>enabled(p).find(x=>x.id===id)).filter(Boolean).slice(0,2).map(x=>({...x})):[]);
 }catch{canStore=false;}}
function save(){try{localStorage.setItem(KEY,JSON.stringify({version:2,pool,history,choices:choices.map(list=>list.map(x=>x.id))}));}catch{canStore=false;}if(!canStore)$('storageNote').textContent='이번 게임은 정상 진행돼요. 이 환경에서는 기록 저장이 제한돼요.';}
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function rand(n){if(!Number.isInteger(n)||n<1)throw Error('Empty draw');try{const a=new Uint32Array(1),limit=Math.floor(4294967296/n)*n;do{crypto.getRandomValues(a);}while(a[0]>=limit);return a[0]%n;}catch{return Math.floor(Math.random()*n);}}
function notify(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,2500);}
function timeText(time){return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(time));}
function setStep(i){[1,2,3].forEach(n=>$('step'+n).classList.toggle('active',n===i));}
function switchPerson(i){active=i;category='전체';query='';expanded=false;$('menuSearch').value='';renderSetup();}
function renderSetup(){
 $('players').replaceChildren();
 PEOPLE.forEach((name,i)=>{const selected=choices[i];const b=el('button','player'+(active===i?' active':'')+(selected.length?' chosen':''));b.type='button';b.dataset.index=i;b.id='person_'+i;b.setAttribute('role','tab');b.setAttribute('aria-selected',String(active===i));b.setAttribute('aria-controls','menuPanel');b.setAttribute('aria-label',name+' 조교, '+(selected.length?selected.map(x=>x.name).join(', '):'메뉴 미정')+', '+selected.length+'개 선택');b.tabIndex=active===i?0:-1;
 const top=el('div','player-top'),person=el('span','person');person.append(el('span','avatar',name[0]),document.createTextNode(name));top.append(person,el('span','player-status',selected.length?selected.length+'/2 선택':'후보 대기'));const names=el('strong','nominee'+(selected.length?'':' empty'));if(selected.length)selected.forEach(x=>names.append(el('span','choice-line',x.name)));else names.textContent='메뉴 미정';b.append(top,names,el('span','player-hint',active===i?(selected.length===2?'2개 선택 완료 · 다시 누르면 해제':'최대 2개까지 골라주세요'):'눌러서 메뉴 고르기'));b.addEventListener('click',()=>switchPerson(i));b.addEventListener('keydown',e=>{if(['ArrowRight','ArrowLeft','Home','End'].includes(e.key)){e.preventDefault();const n=e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowRight'?1:2))%3;switchPerson(n);$('person_'+n).focus();}});$('players').append(b);});
 $('menuPanel').setAttribute('aria-labelledby','person_'+active);
 $('pickPrompt').replaceChildren(el('span','',PEOPLE[active]+' 조교'),document.createTextNode('의 후보 · '+choices[active].length+'/2'));
 $('personalAddLabel').textContent=PEOPLE[active]+' 조교만의 후보를 직접 추가하세요.';
 $('personalMenuInput').setAttribute('aria-label',PEOPLE[active]+' 조교의 새 후보 메뉴');
 $('manageBtn').textContent=PEOPLE[active]+' 후보 편집';
 renderMenus();
 const count=choices.filter(list=>list.length>0).length,ready=count===3;$('startBtn').disabled=!ready;$('startBtn').replaceChildren(document.createTextNode(ready?'결재 레이스 시작':'세 사람 모두 1개 이상 골라주세요'),el('span','','→'));$('dossierStatus').textContent=ready?'결재 레이스 준비 완료':'후보 제출 중 · '+count+'/3';
}
function renderMenus(){
 const cats=['전체','한식','중식','일식','양식','아시안','간편식','가벼운식','내 후보'];$('categoryFilters').replaceChildren();cats.forEach(c=>{const b=el('button','category-btn',c);b.type='button';b.setAttribute('aria-pressed',String(c===category));b.addEventListener('click',()=>{category=c;expanded=false;renderMenus();});$('categoryFilters').append(b);});
 const available=enabled().filter(x=>(category==='전체'||(category==='내 후보'?x.owner===active:x.category===category))&&x.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 const show=expanded?available:available.slice(0,12);$('menuGrid').replaceChildren();
 show.forEach(item=>{const selected=choices[active].some(x=>x.id===item.id);const b=el('button','menu-btn'+(selected?' selected':''));b.type='button';b.id='menu_'+item.id;b.setAttribute('aria-pressed',String(selected));b.append(el('span','menu-category',item.owner===active?'내 후보':item.category),el('span','',item.name));b.addEventListener('click',()=>choose(item));$('menuGrid').append(b);});
 if(!available.length)$('menuGrid').append(el('div','menu-empty',category==='내 후보'?'아래에서 나만의 후보를 추가해보세요.':'검색한 메뉴가 없어요. 직접 추가할 수 있어요.'));
 $('moreMenusBtn').hidden=available.length<=12;$('moreMenusBtn').textContent=expanded?'후보 메뉴 접기':'후보 '+(available.length-12)+'개 더 보기';
}
function choose(item){if(mode!=='setup')return;const who=active,list=choices[who],idx=list.findIndex(x=>x.id===item.id);if(idx>=0){list.splice(idx,1);save();renderSetup();$('menu_'+item.id)?.focus({preventScroll:true});notify(item.name+' 선택을 해제했어요.');return;}if(list.length>=2){notify('한 사람당 최대 2개예요. 선택한 메뉴를 다시 눌러 해제하세요.');return;}list.push({...item});beep(440,.045);save();notify(PEOPLE[who]+' 조교, '+item.name+' 선택!');if(list.length===2){const next=choices.findIndex((v,i)=>i!==who&&v.length===0);if(next>=0){switchPerson(next);$('person_'+next).focus({preventScroll:true});return;}}renderSetup();const focusMenu=$('menu_'+item.id);if(focusMenu)focusMenu.focus({preventScroll:true});}
$('menuSearch').addEventListener('input',e=>{query=e.target.value;expanded=false;renderMenus();});$('moreMenusBtn').addEventListener('click',()=>{expanded=!expanded;renderMenus();});
function addPersonal(name,p,items=pool){name=name.trim().normalize('NFC');if(!validName(name))return {error:'메뉴 이름을 1~20자로 입력해주세요.'};const existing=items.find(x=>visibleFor(x,p)&&x.name.normalize('NFC').toLocaleLowerCase()===name.toLocaleLowerCase());if(existing){existing.enabledFor[p]=true;return {item:existing,exists:true};}if(items.filter(x=>x.owner===p).length>=20)return {error:'직접 추가한 메뉴는 한 사람당 20개까지 보관할 수 있어요.'};const item={id:'custom_'+Date.now()+'_'+rand(1000000),name,category:'내 후보',enabledFor:[false,false,false],owner:p,custom:true};item.enabledFor[p]=true;items.push(item);return {item};}
$('personalAddForm').addEventListener('submit',e=>{e.preventDefault();const who=active,r=addPersonal($('personalMenuInput').value,who);if(r.error){notify(r.error);return;}$('personalMenuInput').value='';const already=choices[who].some(x=>x.id===r.item.id);if(!already&&choices[who].length<2)choices[who].push({...r.item});save();category='내 후보';query='';$('menuSearch').value='';renderSetup();notify(r.exists?'이미 있는 메뉴를 내 후보에 반영했어요.':PEOPLE[who]+' 조교의 후보를 추가했어요.');});
function playLayout(playing){document.body.classList.toggle('in-play',playing);$('motionBtn').disabled=mode==='race'||mode==='duel';window.scrollTo(0,0);}
$('motionBtn').addEventListener('click',()=>{if(mode==='race'||mode==='duel')return;reduced=!reduced;$('motionBtn').setAttribute('aria-pressed',String(reduced));$('motionBtn').textContent='빠른 추첨 '+(reduced?'ON':'OFF');notify(reduced?'짧은 추첨으로 진행해요.':'역전 연출이 있는 레이스로 진행해요.');});
function showSetup(){cancelActionDuel();cancelAnimationFrame(frame);clearTimeout(duelTimer);race=null;duel=null;mode='setup';$('setupView').hidden=false;$('raceView').hidden=true;$('resultView').hidden=true;$('duelView').hidden=true;setStep(1);renderSetup();playLayout(false);}
function beep(freq,duration=.08){if(!sound)return;try{if(!audio)audio=new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume().catch(()=>{});const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.value=freq;g.gain.setValueAtTime(.045,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+duration);}catch{}}
function startRace(quick=false){
 if(mode!=='setup')return;if(PEOPLE.some((_,i)=>!enabled(i).length)){notify('세 사람의 메뉴 후보를 확인해주세요.');return;}
 if(quick)choices=PEOPLE.map((_,i)=>{const a=[...enabled(i)],out=[];for(let n=0;n<Math.min(2,a.length+out.length);n++)out.push({...a.splice(rand(a.length),1)[0]});return out;});
 if(choices.some(x=>!x.length))return;save();mode='race';cheers=0;$('cheerCount').textContent='0';$('setupView').hidden=true;$('resultView').hidden=true;$('duelView').hidden=true;$('raceView').hidden=false;setStep(2);$('dossierStatus').textContent='결재 레이스 진행 중';$('raceTitle').textContent='점심 먹으러, 출발!';$('countdown').textContent=reduced?'추첨 중':'3';$('raceComment').textContent=reduced?'차분하게 오늘 점심을 추첨하고 있어요.':'각자 고른 후보 중 대표 메뉴가 출발합니다.';$('raceCourse').replaceChildren();
 const nominated=choices.map(list=>({...list[rand(list.length)]}));
 PEOPLE.forEach((name,i)=>{const lane=el('div','lane'),label=el('div','lane-label');label.append(el('span','',name+' 조교'),el('span','','FINISH · 점심 승인'));const track=el('div','track');const token=el('div','runner');token.dataset.index=i;token.append(el('span','avatar',name[0]),el('span','runner-menu',nominated[i].name));track.append(token);lane.append(label,track);$('raceCourse').append(lane);});
 playLayout(true);race={winner:rand(3),nominated,selections:choices.map(list=>list.map(x=>({...x}))),start:performance.now(),cue:-1,done:false,seeds:[Math.random()*7,Math.random()*7,Math.random()*7]};$('raceTitle').focus({preventScroll:true});frame=requestAnimationFrame(tick);
}
const COMMENTS=['메일은 잠시만, 점심부터!','결재판을 뚫고 질주 중!','역전 가능! 아직 아무도 모릅니다.','식사 시간은 기다려주지 않는다!','마지막 도장, 누가 먼저 찍을까요?','최종 결재선이 보입니다!'];
function tick(){if(!race||mode!=='race')return;const elapsed=performance.now()-race.start,cd=reduced?0:2400,duration=reduced?1200:6000;if(elapsed<cd){const n=3-Math.floor(elapsed/800);$('countdown').textContent=String(n);if(race.cue!==n){race.cue=n;beep(300+n*100,.08);}}else{const t=Math.min(1,(elapsed-cd)/duration);$('countdown').textContent=reduced?'추첨 중':t<.12?'출발!':t<.9?'질주 중':'결재 임박';const cue=Math.min(COMMENTS.length-1,Math.floor(t*COMMENTS.length));if(race.cue!==100+cue){race.cue=100+cue;$('raceComment').textContent=reduced?'세 사람의 후보를 같은 확률로 추첨합니다.':COMMENTS[cue];}document.querySelectorAll('.runner').forEach((token,i)=>{const raw=t+.12*Math.sin(Math.PI*t)*Math.sin(t*10+race.seeds[i]);const p=t<.78?raw:((1-(t-.78)/.22)*(.78+.12*Math.sin(Math.PI*.78)*Math.sin(.78*10+race.seeds[i]))+((t-.78)/.22)*(i===race.winner?1:.84+i*.025));token.style.transform='translateX('+(reduced?0:Math.max(0,Math.min(1,p))*(token.parentElement.clientWidth-token.offsetWidth-10))+'px)';});if(elapsed>=cd+duration+(reduced?0:450)){finish();return;}}frame=requestAnimationFrame(tick);}
function saveRound(){history=history.filter(h=>h.id!==result.id);history.unshift({id:result.id,menu:result.menu,person:result.person,time:result.time,source:result.source,...(result.leagueFormat==='points'?{leagueFormat:'points',leagueRounds:result.leagueRounds,leagueScores:{...result.leagueScores},scoreWinnerId:result.scoreWinnerId,scoreChampionIds:[...(result.scoreChampionIds||[])],scoreStandings:(result.scoreStandings||[]).map(row=>({...row}))}:{})});history=history.slice(0,5);save();}
function finish(){if(!race||race.done)return;race.done=true;cancelAnimationFrame(frame);const r=race,missions=['메뉴 고민은 여기까지. 서로 맛있게 먹기!','식사하면서 오늘의 소소한 좋은 일 하나씩 나누기.','오늘은 서로의 메뉴 취향을 하나씩 알아가기.','업무 이야기는 잠시 접고, 점심 이야기 한 가지 나누기.'];result={id:'round_'+Date.now()+'_'+rand(1000000),menu:r.nominated[r.winner].name,person:PEOPLE[r.winner],time:new Date().toISOString(),nominations:r.selections.map((list,i)=>({person:PEOPLE[i],menus:list.map(x=>x.name)})),source:'race',duelCount:0,mission:missions[rand(missions.length)]};saveRound();renderResult();beep(659,.14);if(!reduced)confetti();}
function renderResult(){cancelActionDuel();mode='result';playLayout(true);$('setupView').hidden=true;$('raceView').hidden=true;$('duelView').hidden=true;$('resultView').hidden=false;setStep(3);$('winningMenu').textContent=result.menu;$('winningPerson').textContent='제안자 · '+result.person+' 조교';$('winningDate').textContent=timeText(result.time)+' · KST';$('dossierStatus').textContent='최종 승인 · '+result.menu;$('resultNominations').replaceChildren();result.nominations.forEach(x=>{const row=el('div','submitted-row'+(x.person===result.person?' winner':''));row.append(el('span','',x.person),el('strong','',x.menus.join(' · ')));$('resultNominations').append(row);});$('missionText').textContent=result.mission;$('duelVerdict').hidden=result.source!=='duel';$('duelVerdict').textContent=result.source==='duel'?'액션 결투 '+result.duelCount+'회 · '+result.verdict:'';$('winningMenu').focus({preventScroll:true});}
function confetti(){const box=el('div','confetti');box.setAttribute('aria-hidden','true');for(let i=0;i<35;i++){const p=el('i');p.style.left=Math.random()*100+'%';p.style.background=['#ed5b32','#93baa4','#e8c46c','#afa3c9'][i%4];p.style.animationDelay=Math.random()*.5+'s';box.append(p);}document.body.append(box);setTimeout(()=>box.remove(),3300);}
function openDialog(id){const d=$(id);if(!d.open)d.showModal();}
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
function renderDraft(){const list=$('manageList');list.replaceChildren();draft.filter(item=>visibleFor(item,managerPerson)).forEach(item=>{const row=el('div','manage-row'),label=el('label');const check=document.createElement('input');check.type='checkbox';check.checked=item.enabledFor[managerPerson];check.addEventListener('change',()=>{item.enabledFor[managerPerson]=check.checked;$('menuError').textContent='';});label.append(check,document.createTextNode(item.name));row.append(label);if(item.custom&&item.owner===managerPerson){const remove=el('button','remove-menu','삭제');remove.type='button';remove.setAttribute('aria-label',item.name+' 후보 삭제');remove.addEventListener('click',()=>{draft=draft.filter(x=>x.id!==item.id);renderDraft();});row.append(remove);}list.append(row);});}
$('manageBtn').addEventListener('click',()=>{if(mode!=='setup')return;managerPerson=active;draft=pool.map(x=>({...x,enabledFor:[...x.enabledFor]}));$('manageHeading').textContent=PEOPLE[managerPerson]+' 조교의 후보';$('newMenuInput').value='';$('menuError').textContent='체크 상태와 직접 추가한 메뉴는 이 조교의 후보에만 적용돼요.';renderDraft();openDialog('manageDialog');});
$('addForm').addEventListener('submit',e=>{e.preventDefault();const r=addPersonal($('newMenuInput').value,managerPerson,draft);if(r.error){$('menuError').textContent=r.error;return;}$('newMenuInput').value='';$('menuError').textContent=r.exists?'이미 있는 메뉴를 체크했어요.':'내 후보를 추가했어요. 아래 버튼을 누르면 적용돼요.';renderDraft();$('newMenuInput').focus();});
$('saveMenusBtn').addEventListener('click',()=>{if(!enabled(managerPerson,draft).length){$('menuError').textContent='후보 메뉴를 하나 이상 체크해주세요.';return;}pool=draft.map(x=>({...x,enabledFor:[...x.enabledFor]}));choices=choices.map((list,p)=>list.filter(x=>enabled(p).some(y=>y.id===x.id)));save();renderSetup();$('manageDialog').close();notify(PEOPLE[managerPerson]+' 조교의 후보를 저장했어요.');});
$('startBtn').addEventListener('click',()=>startRace());$('randomBtn').addEventListener('click',()=>startRace(true));$('againBtn').addEventListener('click',()=>{choices=[[],[],[]];active=0;category='전체';query='';expanded=false;$('menuSearch').value='';save();showSetup();$('person_0').focus({preventScroll:true});});
$('cheerBtn').addEventListener('click',()=>{if(mode!=='race')return;cheers++;$('cheerCount').textContent=String(cheers);beep(450+cheers%5*60,.045);notify(['밥심으로 달려라!','오늘 점심, 우리가 정한다!','결재는 신속하게, 식사는 여유롭게!'][cheers%3]);});
$('helpBtn').addEventListener('click',()=>openDialog('helpDialog'));$('historyBtn').addEventListener('click',()=>{$('historyList').replaceChildren();if(!history.length)$('historyList').append(el('div','empty-history','아직 결재된 점심이 없어요. 첫 5판 점수전을 시작해보세요!'));history.forEach(h=>{const row=el('div','history-item');row.append(el('strong','',h.menu),el('span','',h.person+' 제안 · '+(h.leagueFormat==='points'?'5판 누적 점수전 · ':h.source==='tournament'?'토너먼트 확정 · ':h.source==='duel'?'결투 확정 · ':'')+timeText(h.time)));$('historyList').append(row);});openDialog('historyDialog');});
$('soundBtn').addEventListener('click',()=>{sound=!sound;$('soundBtn').setAttribute('aria-pressed',String(sound));$('soundState').textContent=sound?'ON':'OFF';if(sound)beep(520,.1);});
function resultText(){const scores=result.leagueFormat==='points'?'\n최종 누적 순위 ('+(result.leagueRounds||5)+'판)\n'+scoreResultStandings().map(row=>(row.left?'퇴장':row.forfeited?'기권':row.rank+'위')+' '+row.name+' '+row.points+'점').join('\n')+'\n메뉴 이의전 이후에도 점수와 순위는 유지됩니다.':'';return '[대구대학교 점심 결재서]\n오늘 점심: '+result.menu+'\n제안자: '+result.person+'\n함께하는 사람: '+result.nominations.map(n=>n.person).join(' · ')+'\n확정 방식: '+(result.leagueFormat==='points'?'전원 5판 누적 점수전'+(result.duelCount?' · 메뉴 이의전 '+result.duelCount+'회':''):result.source==='tournament'?'랜덤 게임 토너먼트':result.source==='duel'?'액션 결투 · '+result.verdict:'결재 레이스')+scores+'\n'+timeText(result.time)+' (한국 시간)\n점심 결재 완료. 맛있게 먹어요!';}
$('copyBtn').addEventListener('click',async()=>{if(!result)return;const text=resultText();try{if(!navigator.clipboard?.writeText)throw Error();await navigator.clipboard.writeText(text);notify('점심 결재 결과를 복사했어요!');}catch{$('copyText').value=text;openDialog('copyDialog');$('copyText').focus();$('copyText').select();}});$('selectCopyBtn').addEventListener('click',()=>{$('copyText').focus();$('copyText').select();notify('전체 선택했어요. 복사 명령을 눌러주세요.');});
function refreshChallengers(){$('challengerChoices').replaceChildren();PEOPLE.forEach((name,i)=>{if(name===result.person)return;const b=el('button','challenger-choice',name);b.type='button';b.setAttribute('aria-pressed',String(challengerIndex===i));b.addEventListener('click',()=>{challengerIndex=i;refreshChallengers();});$('challengerChoices').append(b);});$('duelMenuSelect').replaceChildren();result.nominations[challengerIndex].menus.forEach(name=>{const option=document.createElement('option');option.value=name;option.textContent=name;$('duelMenuSelect').append(option);});$('objectionError').textContent='';}
$('objectBtn').addEventListener('click',()=>{if(mode!=='result')return;challengerIndex=PEOPLE.findIndex(name=>name!==result.person);refreshChallengers();openDialog('objectionDialog');});
$('prepareDuelBtn').addEventListener('click',()=>{const menu=$('duelMenuSelect').value;if(menu===result.menu){$('objectionError').textContent='같은 메뉴예요. 다른 메뉴나 다른 도전자를 골라주세요.';return;}if(!result.nominations[challengerIndex].menus.includes(menu))return;$('objectionDialog').close();prepareDuel(challengerIndex,menu);});
/* ACTION_DUEL_V1 */
let actionFrame=0,actionLast=0,actionKeys=new Set(),actionPointers=new Map(),actionSeenKeys=new Set();
const ACTION_BINDINGS={KeyA:[0,'left'],KeyD:[0,'right'],KeyW:[0,'jump'],KeyF:[0,'attack'],KeyG:[0,'guard'],ArrowLeft:[1,'left'],ArrowRight:[1,'right'],ArrowUp:[1,'jump'],KeyK:[1,'attack'],KeyL:[1,'guard']};
function actionFood(menu){const m=[[/돈가스|가츠/,'🍖'],[/국밥|갈비탕|설렁탕|찌개|육개장/,'🍲'],[/김밥|초밥|회덮밥/,'🍣'],[/비빔밥|덮밥|볶음밥|카레|오므라이스/,'🍛'],[/파스타|리조토/,'🍝'],[/햄버거/,'🍔'],[/피자/,'🍕'],[/포케|샐러드/,'🥗'],[/샌드위치|토스트/,'🥪'],[/면|국수|우동|라멘|소바|짬뽕|짜장|마라탕|팟타이/,'🍜']];return m.find(x=>x[0].test(menu))?.[1]||'🍱';}
function actionFighter(i){return {x:i===0?255:745,y:0,vy:0,vx:0,face:i===0?1:-1,hp:100,energy:100,attackAt:-100,attackHit:false,cooldown:0,stun:0,flash:0,label:'',labelUntil:0,guardSince:-100,wasGuard:false,guard:false,moving:false};}
function actionReleaseAll(){actionKeys.clear();actionSeenKeys.clear();actionPointers.clear();document.querySelectorAll('[data-battle-action]').forEach(b=>b.classList.remove('is-held'));}
function cancelActionDuel(){cancelAnimationFrame(actionFrame);actionFrame=0;clearTimeout(duelTimer);actionReleaseAll();}
function actionHeld(p,a){if([...actionKeys].some(code=>{const b=ACTION_BINDINGS[code];return b&&b[0]===p&&b[1]===a;}))return true;return [...actionPointers.values()].some(v=>v.p===p&&v.a===a);}
function prepareDuel(p,menu){cancelActionDuel();duel={challenger:PEOPLE[p],challengerMenu:menu,defender:result.person,defenderMenu:result.menu,phase:'idle',fighters:[actionFighter(0),actionFighter(1)],clock:0,sudden:false,finishLocked:false,freezeTo:0,noticeAt:-100,notice:'',overlayUntil:0};mode='duel';playLayout(true);$('setupView').hidden=true;$('raceView').hidden=true;$('resultView').hidden=true;$('duelView').hidden=false;setStep(3);[duel.challenger,duel.defender].forEach((n,i)=>{$('battleName'+i).textContent=n;$('battleControlName'+i).textContent=n+' · '+(i===0?'A/D/W/F/G':'←/→/↑/K/L');$('battleMenu'+i).textContent=duel[i===0?'challengerMenu':'defenderMenu'];$('battleFood'+i).textContent=actionFood(duel[i===0?'challengerMenu':'defenderMenu']);$('battleFighter'+i).setAttribute('aria-label',n+'의 '+duel[i===0?'challengerMenu':'defenderMenu']+' 캐릭터');$('battleHp'+i).setAttribute('aria-label',n+' 체력');});$('battleFx').replaceChildren();$('battleStage').classList.remove('shake','is-paused');$('duelStartBtn').hidden=false;$('duelStartBtn').textContent='두 사람 준비 완료 · 결투 시작';$('duelFinishBtn').hidden=true;$('battlePauseBtn').hidden=true;$('duelCancelBtn').textContent='결투 취소 · 기존 점심 유지';actionOverlay('READY?','직접 움직여 공격하고 점프로 머리를 밟으세요. 숙이면 높은 공격을 피해요.');$('battleStatus').textContent='도전자 A/D 이동 · W 점프 · F 공격 · G 숙이기 / 방어자 방향키 이동·점프 · K 공격 · L 숙이기';actionControls(false);actionRender();$('duelHeading').focus({preventScroll:true});}
function actionOverlay(title,sub,flash=false){$('battleOverlay').hidden=false;$('battleOverlay').className='battle-overlay'+(flash?' fight-flash':'');$('battleOverlayTitle').textContent=title;$('battleOverlaySub').textContent=sub;}
function actionControls(on){document.querySelectorAll('[data-battle-action]').forEach(b=>b.disabled=!on);}
function actionStart(){if(mode!=='duel'||!duel||!['idle','paused'].includes(duel.phase))return;window.scrollTo(0,0);const resume=duel.phase==='paused';actionReleaseAll();$('battleStage').classList.remove('is-paused');$('duelStartBtn').hidden=true;$('duelFinishBtn').hidden=true;$('battlePauseBtn').hidden=false;if(resume){duel.phase='fight';actionOverlay('FIGHT!','계속! 서로의 메뉴를 걸고 싸워요.',true);duel.overlayUntil=duel.clock+.7;actionControls(true);actionLast=performance.now();actionFrame=requestAnimationFrame(actionTick);return;}duel.fighters=[actionFighter(0),actionFighter(1)];duel.clock=0;duel.phase='countdown';duel.countStart=performance.now();duel.countCue=-1;actionControls(false);actionRender();actionLast=performance.now();actionFrame=requestAnimationFrame(actionTick);}
function actionPause(reason='잠시 쉬어가요. 준비되면 계속하세요.'){if(mode!=='duel'||!duel||!['fight','countdown'].includes(duel.phase))return;cancelAnimationFrame(actionFrame);actionFrame=0;const wasCountdown=duel.phase==='countdown';duel.phase=wasCountdown?'idle':'paused';actionReleaseAll();actionControls(false);$('battleStage').classList.add('is-paused');$('battlePauseBtn').hidden=true;$('duelStartBtn').hidden=false;$('duelStartBtn').textContent=wasCountdown?'두 사람 준비 완료 · 결투 시작':'두 사람 준비 완료 · 계속하기';actionOverlay('PAUSE',reason);$('battleStatus').textContent=reason;}
function actionDo(p,a){if(mode!=='duel'||!duel||duel.phase!=='fight')return;const f=duel.fighters[p],t=duel.clock;if(f.hp<=0||t<f.stun)return;if(a==='jump'&&f.y<=.2){f.vy=700;beep(p===0?470:520,.045);}if(a==='attack'&&t>=f.cooldown&&!actionHeld(p,'guard')){f.attackAt=t;f.attackHit=false;f.cooldown=t+.52;beep(p===0?240:280,.035);}}
function actionNotice(text){if(!duel)return;$('battleStatus').textContent=text;duel.noticeAt=duel.clock;}
function actionImpact(x,y,text,target){const f=duel.fighters[target];f.label=text;f.labelUntil=duel.clock+.55;const fx=el('i','battle-impact');fx.style.left=x/10+'%';fx.style.bottom=(35+y/360*$('battleStage').clientHeight+40)+'px';$('battleFx').append(fx);setTimeout(()=>fx.remove(),350);if(!reduced){$('battleStage').classList.remove('shake');void $('battleStage').offsetWidth;$('battleStage').classList.add('shake');}}
function actionResolveHit(i){const t=duel.clock,a=duel.fighters[i],b=duel.fighters[1-i],dx=b.x-a.x;if(a.attackHit||t-a.attackAt<.09||t-a.attackAt>.23)return;if(Math.abs(dx)>150||Math.abs(a.y-b.y)>76||dx*a.face<0)return;a.attackHit=true;let damage=18,label='HIT!';if(b.guard&&b.energy>3&&a.y-b.y>26){b.energy=Math.max(0,b.energy-3);b.label='DUCK!';b.labelUntil=t+.5;actionImpact(b.x,b.y+44,'DUCK!',1-i);actionNotice('숙이기 성공! 머리 위 공격을 피했어요.');beep(650,.035);return;}if(b.guard&&b.energy>12){if(t-b.guardSince<.14){damage=0;label='PARRY!';a.stun=t+.4;a.vx=-a.face*230;b.energy=Math.max(0,b.energy-8);actionNotice((i===0?duel.defender:duel.challenger)+' 패링! 타이밍 방어 성공!');}else{damage=4;label='BLOCK';b.energy=Math.max(0,b.energy-18);actionNotice('방어 성공! 피해를 줄였어요. 기력도 확인하세요.');}}else if(b.guard){damage=24;label='BREAK!';b.energy=0;b.guard=false;actionNotice('가드 브레이크! 기력이 떨어지면 방어가 깨져요.');}else actionNotice((i===0?duel.challenger:duel.defender)+'의 공격 적중!');b.hp=Math.max(0,b.hp-damage);b.flash=t+.18;if(damage){b.vx=a.face*(label==='BREAK!'?330:240);b.stun=t+(label==='BREAK!'?.35:.16);duel.freezeTo=t+.055;}actionImpact((a.x+b.x)/2,(a.y+b.y)/2,label,1-i);beep(damage?150:760,.06);duel.hitsThisFrame.push({attacker:i,damage});}
function actionSuddenTie(){duel.sudden=true;duel.fighters.forEach((f,i)=>{f.hp=1;f.x=i===0?255:745;f.y=0;f.vy=0;f.vx=0;f.attackAt=-100;f.cooldown=duel.clock+.65;f.stun=duel.clock+.3;f.guard=false;});actionReleaseAll();actionOverlay('DOUBLE K.O.','동시 적중! 체력 1로 서든데스 재대결!',true);duel.overlayUntil=duel.clock+1.4;actionNotice('동시 적중은 무승부! 다음 유효타로 직접 승부를 내세요.');}
function actionTick(now){if(mode!=='duel'||!duel||!['countdown','fight'].includes(duel.phase))return;if(document.hidden&&!netActionOnline()){actionPause('화면을 벗어나 결투를 멈췄어요. 준비되면 계속하세요.');return;}if(document.querySelector('dialog[open]')&&!netActionOnline()){actionPause('도움말을 확인하는 동안 잠시 멈췄어요.');return;}if(duel.phase==='countdown'){const left=3-Math.floor((now-duel.countStart)/500);if(left>0){if(duel.countCue!==left){duel.countCue=left;actionOverlay(String(left),'키를 확인하세요! 1P: A/D/W/F/G · 2P: 방향키/K/L');beep(350+left*80,.07);}actionLast=now;actionFrame=requestAnimationFrame(actionTick);return;}duel.phase='fight';actionReleaseAll();actionControls(true);actionOverlay('FIGHT!','직접 움직이고 공격하세요!',true);duel.overlayUntil=.75;actionNotice('시작! 두 사람이 직접 조작해야 승부가 납니다.');actionLast=now;beep(680,.12);}
 const dt=Math.min(.04,Math.max(0,(now-actionLast)/1000));actionLast=now;duel.clock+=dt;const t=duel.clock;
 if(t>=duel.freezeTo){duel.fighters.forEach((f,i)=>{const other=duel.fighters[1-i];f.face=other.x>=f.x?1:-1;const guard=actionHeld(i,'guard')&&f.energy>0&&t-f.attackAt>.25&&f.y<5&&t>=f.stun;if(guard&&!f.wasGuard)f.guardSince=t;f.wasGuard=guard;f.guard=guard;f.energy=Math.max(0,Math.min(100,f.energy+(guard?-22:18)*dt));const moving=(actionHeld(i,'right')?1:0)-(actionHeld(i,'left')?1:0);f.moving=!!moving&&t>=f.stun;if(t>=f.stun){f.vx=moving*(guard?85:320);if(t-f.attackAt<.23)f.vx*=.25;}else f.vx*=Math.pow(.1,dt);f.prevY=f.y;f.x+=f.vx*dt;f.vy-=1700*dt;f.y+=f.vy*dt;if(f.y<=0){f.y=0;f.vy=0;}f.x=Math.max(100,Math.min(900,f.x));});
 const a=duel.fighters[0],b=duel.fighters[1],d=b.x-a.x;duel.hitsThisFrame=[];actionResolveStomp(0);actionResolveStomp(1);if(Math.abs(d)<108&&Math.abs(a.y-b.y)<(a.guard||b.guard?40:70)){const push=(108-Math.abs(d))/2,s=d>=0?1:-1;a.x=Math.max(100,Math.min(900,a.x-push*s));b.x=Math.max(100,Math.min(900,b.x+push*s));}actionResolveHit(0);actionResolveHit(1);const hits=duel.hitsThisFrame.filter(h=>h.damage>0);if(a.hp<=0&&b.hp<=0){actionSuddenTie();}else if(a.hp<=0||b.hp<=0){actionFinish(a.hp>0?0:1,'K.O.');}else if(duel.sudden&&hits.length){if(hits.length>1)actionSuddenTie();else actionFinish(hits[0].attacker,'서든데스 유효타');}
 }
 if(duel.phase!=='fight')return;if(duel.clock>=45&&!duel.sudden){const [a,b]=duel.fighters;if(Math.abs(a.hp-b.hp)>.1){actionFinish(a.hp>b.hp?0:1,'시간 종료 · 남은 체력 우세');return;}duel.sudden=true;actionOverlay('SUDDEN DEATH','체력 동률! 다음 유효타를 먼저 맞히면 승리!',true);duel.overlayUntil=t+1.4;actionNotice('서든데스! 다음 유효타 한 번으로 승부가 납니다.');beep(850,.15);}
 if(t>duel.overlayUntil)$('battleOverlay').hidden=true;actionRender();actionFrame=requestAnimationFrame(actionTick);
}
function actionRender(){if(!duel?.fighters)return;const h=$('battleStage').clientHeight;duel.fighters.forEach((f,i)=>{const n=$('battleFighter'+i);n.style.left=f.x/10+'%';n.style.bottom=35+f.y/360*h+'px';n.classList.toggle('is-moving',f.moving&&f.y<1);n.classList.toggle('is-air',f.y>1);n.classList.toggle('is-guard',f.guard&&duel.phase==='fight');n.classList.toggle('is-attacking',duel.phase==='fight'&&duel.clock-f.attackAt>=.05&&duel.clock-f.attackAt<.25);n.classList.toggle('is-hit',duel.clock<f.flash);n.classList.toggle('is-ko',f.hp<=0);n.querySelector('.battle-sprite').style.scale=f.face+' 1';n.querySelector('.battle-hit-label').style.scale=f.face+' 1';n.querySelector('.battle-shield').style.scale=f.face+' 1';$('battleHpFill'+i).style.width=f.hp+'%';$('battleHp'+i).setAttribute('aria-valuenow',String(Math.round(f.hp)));$('battleHpText'+i).textContent=String(Math.round(f.hp));$('battleEnergy'+i).style.width=f.energy+'%';$('battleHit'+i).textContent=duel.clock<f.labelUntil?f.label:'';});$('battleTime').textContent=duel.sudden?'SD':String(Math.max(0,Math.ceil(45-duel.clock)));$('battleTime').parentElement.classList.toggle('danger',45-duel.clock<10||duel.sudden);}
function actionFinish(winner,reason){if(!duel||duel.finishLocked)return;duel.finishLocked=true;duel.phase='done';cancelAnimationFrame(actionFrame);actionFrame=0;actionReleaseAll();actionControls(false);const name=winner===0?duel.challenger:duel.defender,menu=winner===0?duel.challengerMenu:duel.defenderMenu;result.person=name;result.menu=menu;result.source='duel';result.duelCount=(result.duelCount||0)+1;result.time=new Date().toISOString();result.verdict=name+' 액션 결투 승리 · '+reason+' · 남은 체력 '+Math.ceil(duel.fighters[winner].hp);saveRound();actionRender();actionOverlay(name+' 승리!','최종 점심: '+menu+' · '+reason);$('battleStatus').textContent='승부 확정! '+name+'의 '+menu+' 메뉴가 최종 점심입니다.';$('duelStartBtn').hidden=true;$('battlePauseBtn').hidden=true;$('duelFinishBtn').hidden=false;$('duelCancelBtn').textContent='확정된 결과로 돌아가기';beep(780,.18);if(!reduced)confetti();}
$('duelStartBtn').addEventListener('click',()=>actionStart());$('battlePauseBtn').addEventListener('click',()=>actionPause());$('duelFinishBtn').addEventListener('click',()=>{cancelActionDuel();renderResult();});$('duelCancelBtn').addEventListener('click',()=>{cancelActionDuel();if(duel)duel.phase='cancelled';renderResult();});
function actionTyping(e){return !!document.querySelector('dialog[open]')||e.target?.matches?.('input,textarea,select,[contenteditable="true"]');}
document.addEventListener('keydown',e=>{const b=ACTION_BINDINGS[e.code];if(!b||mode!=='duel'||actionTyping(e)||!duel||duel.phase!=='fight')return;e.preventDefault();if(e.repeat||actionSeenKeys.has(e.code))return;actionSeenKeys.add(e.code);actionKeys.add(e.code);if(['attack','jump'].includes(b[1]))actionDo(b[0],b[1]);});
document.addEventListener('keyup',e=>{if(ACTION_BINDINGS[e.code]){actionKeys.delete(e.code);actionSeenKeys.delete(e.code);if(mode==='duel')e.preventDefault();}});
document.querySelectorAll('[data-battle-action]').forEach(button=>{button.type='button';const p=Number(button.dataset.battlePlayer),a=button.dataset.battleAction;button.addEventListener('pointerdown',e=>{if(button.disabled||mode!=='duel'||duel?.phase!=='fight'||(e.pointerType==='mouse'&&e.button!==0))return;e.preventDefault();try{button.setPointerCapture(e.pointerId);}catch{}actionPointers.set(e.pointerId,{p,a,button});button.classList.add('is-held');if(['attack','jump'].includes(a))actionDo(p,a);});const release=e=>{actionPointers.delete(e.pointerId);if(![...actionPointers.values()].some(v=>v.button===button))button.classList.remove('is-held');};button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);button.addEventListener('click',e=>{if(e.detail===0&&!button.disabled){e.preventDefault();if(['attack','jump'].includes(a))actionDo(p,a);}});});
window.addEventListener('pointerup',e=>{const v=actionPointers.get(e.pointerId);if(v){actionPointers.delete(e.pointerId);v.button.classList.remove('is-held');}});window.addEventListener('pointercancel',()=>actionReleaseAll());window.addEventListener('blur',()=>{if(netActionOnline())netReleaseLocalCombat();else actionPause('화면 포커스를 벗어나 잠시 멈췄어요. 준비되면 계속하세요.');});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&mode==='race'){cancelAnimationFrame(frame);tick();}if(document.hidden&&mode==='duel'){if(netActionOnline())netReleaseLocalCombat();else actionPause('화면을 벗어나 결투를 멈췄어요. 다시 준비하고 계속하세요.');}});


/* ONLINE_ACTION_BRIDGE_V1 */
// Feet crossing the opponent's actual head height on the way down is a real
// collision. Crouching lowers that head/hitbox and softens the landing blow.
function actionResolveStomp(i){
 if(!duel||duel.phase!=='fight')return;
 const a=duel.fighters[i],b=duel.fighters[1-i],t=duel.clock,head=b.y+(b.guard?44:78),oldHead=(b.prevY??b.y)+(b.guard?44:78);
 if(a.hp<=0||b.hp<=0||a.vy>=-65||t<a.stun||t<(a.stompAfter||0)||Math.abs(a.x-b.x)>86||(a.prevY??a.y)<oldHead-1||a.y>head)return;
 const guarded=b.guard&&b.energy>15,damage=guarded?8:26;
 a.y=head+2;a.vy=490;a.stompAfter=t+.6;a.stompUntil=t+.38;
 b.hp=Math.max(0,b.hp-damage);b.flash=t+.24;b.stun=t+(guarded?.14:.28);b.vx=(b.x>=a.x?1:-1)*190;
 if(guarded)b.energy=Math.max(0,b.energy-20);
 duel.freezeTo=t+.045;
 actionImpact(b.x,head,guarded?'CROUCH BLOCK':'STOMP! -26',1-i);
 actionNotice((i===0?duel.challenger:duel.defender)+(guarded?'의 내려찍기! 숙여서 피해를 줄였어요.':'의 머리 밟기! 26 피해 + 다시 점프!'));
 beep(guarded?340:120,.08);duel.hitsThisFrame.push({attacker:i,damage});
}
let netCombatHeld=[new Set(),new Set()],netCombatInputAt=[0,0];
const netActionKeys=new Set(),netActionPointers=new Map();
let netActionApplying=false,netActionFlushQueued=false;
const netActionMap={KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',KeyW:'jump',ArrowUp:'jump',KeyF:'attack',KeyK:'attack',KeyG:'guard',KeyL:'guard'};
const netHeldActions=['left','right','guard'];
const netOfflineActionHeld=actionHeld,netOfflineActionDo=actionDo,netOfflineActionRender=actionRender,netOfflineActionTick=actionTick,netOfflineActionFinish=actionFinish,netOfflineActionStart=actionStart,netOfflineActionPause=actionPause,netOfflineCancelAction=cancelActionDuel,netOfflinePrepareDuel=prepareDuel;
function netActionOnline(){return typeof netIsActive==='function'&&netIsActive();}
function netActionHost(){return typeof netIsHost==='function'&&netIsHost();}
function netActionSide(){const side=typeof netSelfSide==='function'?netSelfSide():-1;return side===0||side===1?side:-1;}
function netActionSend(action,held){if(netActionOnline()&&typeof netSendCombat==='function')netSendCombat(action,held);}
function netActionLocalHeld(){const held=new Set();for(const code of netActionKeys){const a=netActionMap[code];if(netHeldActions.includes(a))held.add(a);}for(const value of netActionPointers.values())if(netHeldActions.includes(value.action))held.add(value.action);return [...held];}
function netActionFlush(){netActionFlushQueued=false;if(!netActionOnline()||mode!=='duel'||netActionSide()<0)return;netActionSend('sync',netActionLocalHeld());}
function netActionQueueFlush(){if(netActionFlushQueued)return;netActionFlushQueued=true;queueMicrotask(netActionFlush);}
function netReleaseLocalCombat(){netActionKeys.clear();netActionPointers.clear();document.querySelectorAll('[data-battle-action]').forEach(b=>b.classList.remove('is-held'));if(netActionOnline()&&netActionSide()>=0)netActionSend('sync',[]);}
function netReleaseCombatSide(side){if(side!==0&&side!==1)return;netCombatHeld[side].clear();netCombatInputAt[side]=0;}
function netResetCombatInputs(){netReleaseLocalCombat();netReleaseCombatSide(0);netReleaseCombatSide(1);}
function netApplyCombatInput(side,packet){
 if(!netActionOnline()||!netActionHost()||(side!==0&&side!==1)||!packet||typeof packet!=='object')return false;
 const action=packet.action;
 if(action==='sync'){
  if(!Array.isArray(packet.held)||packet.held.length>3||packet.held.some(a=>!netHeldActions.includes(a)))return false;
  // Releases are accepted even while paused/counting down, so no key can stick.
  netCombatHeld[side]=new Set(packet.held);netCombatInputAt[side]=performance.now();return true;
 }
 if(netHeldActions.includes(action)){
  if(typeof packet.held!=='boolean')return false;
  if(packet.held)netCombatHeld[side].add(action);else netCombatHeld[side].delete(action);
  netCombatInputAt[side]=performance.now();return true;
 }
 if(!['attack','jump'].includes(action)||packet.held!==true||mode!=='duel'||!duel||duel.phase!=='fight')return false;
 netCombatInputAt[side]=performance.now();netActionApplying=true;try{netOfflineActionDo(side,action);}finally{netActionApplying=false;}return true;
}
actionHeld=function(side,action){
 if(!netActionOnline())return netOfflineActionHeld(side,action);
 if(!netActionHost()||(side!==0&&side!==1))return false;
 if(performance.now()-netCombatInputAt[side]>900)netCombatHeld[side].clear();
 return netCombatHeld[side].has(action);
};
actionDo=function(side,action){
 if(!netActionOnline()||netActionApplying)return netOfflineActionDo(side,action);
 if(netActionSide()>=0&&['attack','jump'].includes(action))netActionSend(action,true);
};
function netRefreshCombatControls(){
 if(!netActionOnline()||!duel)return;
 const side=netActionSide(),fighting=duel.phase==='fight';
 document.querySelectorAll('[data-battle-action]').forEach(button=>{
  const own=Number(button.dataset.battlePlayer)===side;
  button.disabled=!fighting||!own;
  button.dataset.netRemote=String(!own);
  if(!own)button.title=side<0?'이번 결투를 관전 중이에요.':'상대방이 자신의 기기에서 조작해요.';else button.removeAttribute('title');
 });
 const ready=$('duelStartBtn');
 if(ready){ready.hidden=!['idle','paused'].includes(duel.phase)||side<0;ready.textContent=duel.phase==='paused'?'내 캐릭터 계속할 준비 완료':'내 캐릭터 준비 완료';}
 const pause=$('battlePauseBtn');if(pause){pause.hidden=!['fight','countdown'].includes(duel.phase)||(side<0&&!netActionHost());pause.disabled=false;}
 const cancel=$('duelCancelBtn');if(cancel)cancel.hidden=side<0&&!netActionHost()&&duel.phase!=='done';
 const finish=$('duelFinishBtn');if(finish)finish.hidden=duel.phase!=='done';
 document.querySelectorAll('.battle-control-panel').forEach((panel,i)=>{panel.classList.toggle('net-control-own',side===i);panel.classList.toggle('net-control-other',side!==i);});
}
actionRender=function(){
 netOfflineActionRender();
 if(duel?.fighters)duel.fighters.forEach((fighter,i)=>{const node=$('battleFighter'+i);node.classList.toggle('is-crouching',fighter.guard&&duel.phase==='fight');node.classList.toggle('is-falling',fighter.y>2&&fighter.vy<-65);node.classList.toggle('is-stomping',duel.clock<(fighter.stompUntil||0));});
 if(netActionOnline()){
  netRefreshCombatControls();
  if(netActionHost()&&!netActionApplying&&typeof netPublishCombat==='function')netPublishCombat(false);
 }
};
actionTick=function(now){
 if(netActionOnline()&&!netActionHost()){cancelAnimationFrame(actionFrame);actionFrame=0;return;}
 const value=netOfflineActionTick(now);if(netActionOnline()&&netActionHost()&&typeof netPublishCombat==='function')netPublishCombat(false);return value;
};
actionFinish=function(winner,reason){
 if(netActionOnline()&&!netActionHost())return;
 const wasFinished=duel?.finishLocked;
 netOfflineActionFinish(winner,reason);
 if(netActionOnline()&&!wasFinished&&duel?.finishLocked&&typeof netRoundFinished==='function')netRoundFinished();
};
actionStart=function(){
 if(netActionOnline()){if(netActionSide()>=0&&typeof netReadyToFight==='function')netReadyToFight();return;}
 return netOfflineActionStart();
};
function netStartCombatHost(){
 if(!netActionOnline()||!netActionHost()||mode!=='duel'||!duel)return false;
 if(!['idle','paused'].includes(duel.phase))return false;
 netResetCombatInputs();netOfflineActionStart();netRefreshCombatControls();if(typeof netPublishCombat==='function')netPublishCombat(true);return true;
}
actionPause=function(reason){
 if(!netActionOnline())return netOfflineActionPause(reason);
 netReleaseLocalCombat();
 if(netActionHost()){netOfflineActionPause(reason);netRefreshCombatControls();if(typeof netPublishCombat==='function')netPublishCombat(true);}
 else if(netActionSide()>=0)netActionSend('pause',true);
};
cancelActionDuel=function(){netResetCombatInputs();return netOfflineCancelAction();};
prepareDuel=function(...args){
 netResetCombatInputs();netActionApplying=true;let value;try{value=netOfflinePrepareDuel(...args);}finally{netActionApplying=false;}
 netRefreshCombatControls();return value;
};
function netGetCombatState(){
 if(!duel)return null;
 return {duel:JSON.parse(JSON.stringify(duel)),overlay:{title:$('battleOverlayTitle')?.textContent||'',sub:$('battleOverlaySub')?.textContent||'',hidden:!!$('battleOverlay')?.hidden},status:$('battleStatus')?.textContent||'',paused:duel.phase==='paused'};
}
function netReceiveCombatState(data){
 if(!netActionOnline()||netActionHost()||mode!=='duel'||!data||typeof data!=='object'||!data.duel)return false;
 const incoming=data.duel;
 if(!Array.isArray(incoming.fighters)||incoming.fighters.length!==2||!['idle','countdown','fight','paused','done'].includes(incoming.phase)||!Number.isFinite(incoming.clock))return false;
 if(duel?.id&&incoming.id&&duel.id!==incoming.id)return false;
 if(incoming.fighters.some(f=>!f||['x','y','vy','vx','hp','energy','attackAt','cooldown','stun','flash','labelUntil'].some(k=>!Number.isFinite(f[k]))))return false;
 cancelAnimationFrame(actionFrame);actionFrame=0;
 const copy=JSON.parse(JSON.stringify(incoming));copy.clock=Math.max(0,copy.clock);
 copy.fighters.forEach(f=>{f.x=Math.max(0,Math.min(1000,f.x));f.y=Math.max(0,Math.min(240,f.y));f.hp=Math.max(0,Math.min(100,f.hp));f.energy=Math.max(0,Math.min(100,f.energy));f.label=String(f.label||'').slice(0,32);});
 duel=copy;netActionApplying=true;
 try{
  actionRender();
  const overlay=data.overlay||{};$('battleOverlayTitle').textContent=String(overlay.title||'').slice(0,80);$('battleOverlaySub').textContent=String(overlay.sub||'').slice(0,200);$('battleOverlay').hidden=!!overlay.hidden;$('battleOverlay').className='battle-overlay';
  $('battleStatus').textContent=(netActionSide()<0?'관전 중 · ':'')+String(data.status||'').slice(0,220);
  $('battleStage').classList.toggle('is-paused',duel.phase==='paused');netRefreshCombatControls();
 }finally{netActionApplying=false;}
 return true;
}

// Stop the original two-person keyboard/pointer listeners before they run in
// online rooms. Both control key families now operate ONLY the sender's fighter.
document.addEventListener('keydown',e=>{
 if(!netActionOnline()||mode!=='duel'||!netActionMap[e.code]||actionTyping(e))return;
 e.preventDefault();e.stopImmediatePropagation();
 if(netActionSide()<0||!duel||duel.phase!=='fight'||e.repeat||netActionKeys.has(e.code))return;
 netActionKeys.add(e.code);const action=netActionMap[e.code];
 if(action==='attack'||action==='jump')netActionSend(action,true);else netActionQueueFlush();
},true);
document.addEventListener('keyup',e=>{
 if(!netActionOnline()||!netActionMap[e.code])return;
 const had=netActionKeys.delete(e.code);
 if(mode==='duel'&&!actionTyping(e)){e.preventDefault();e.stopImmediatePropagation();}
 if(had)netActionQueueFlush();
},true);
document.addEventListener('pointerdown',e=>{
 if(!netActionOnline()||mode!=='duel')return;
 const button=e.target?.closest?.('[data-battle-action]');if(!button)return;
 e.preventDefault();e.stopImmediatePropagation();
 const side=netActionSide(),action=button.dataset.battleAction;
 if(side<0||Number(button.dataset.battlePlayer)!==side||button.disabled||duel?.phase!=='fight'||(e.pointerType==='mouse'&&e.button!==0))return;
 try{button.setPointerCapture(e.pointerId);}catch{}
 netActionPointers.set(e.pointerId,{action,button});button.classList.add('is-held');
 if(action==='attack'||action==='jump')netActionSend(action,true);else netActionQueueFlush();
},true);
function netActionPointerRelease(e){
 if(!netActionOnline())return;const prior=netActionPointers.get(e.pointerId);if(!prior)return;
 e.preventDefault();e.stopImmediatePropagation();netActionPointers.delete(e.pointerId);
 if(![...netActionPointers.values()].some(x=>x.button===prior.button))prior.button.classList.remove('is-held');netActionQueueFlush();
}
window.addEventListener('pointerup',netActionPointerRelease,true);window.addEventListener('pointercancel',netActionPointerRelease,true);document.addEventListener('lostpointercapture',netActionPointerRelease,true);
document.addEventListener('click',e=>{
 if(!netActionOnline()||mode!=='duel')return;const button=e.target?.closest?.('[data-battle-action]');if(!button)return;
 e.preventDefault();e.stopImmediatePropagation();
 if(e.detail!==0||button.disabled||Number(button.dataset.battlePlayer)!==netActionSide()||duel?.phase!=='fight')return;
 const action=button.dataset.battleAction;
 if(action==='attack'||action==='jump')netActionSend(action,true);
},true);
window.addEventListener('blur',()=>{if(netActionOnline()&&mode==='duel')netReleaseLocalCombat();},true);
document.addEventListener('visibilitychange',()=>{if(netActionOnline()&&document.hidden)netReleaseLocalCombat();},true);
setInterval(()=>{if(netActionOnline()&&mode==='duel'&&duel?.phase==='fight'&&netActionSide()>=0)netActionFlush();},200);


/* DEPARTMENT_RACE_V1 */
/* CAMPUS_DEPARTMENTS_V1 */
const deptOptions=[
 {
  "id": "du-d200fe6d9c",
  "name": "공공안전학부 소방·행정학전공",
  "short": "소방·행정학전공",
  "college": "공공인재대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/0",
  "color": "#addcbd",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-d6c08986cb",
  "name": "공공안전학부 공직법무전공",
  "short": "공직법무전공",
  "college": "공공인재대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/0",
  "color": "#f0acc2",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-3005e0e577",
  "name": "경찰학부 경찰행정학전공",
  "short": "경찰행정학전공",
  "college": "공공인재대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/0",
  "color": "#f0acc2",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-a78d79e055",
  "name": "경찰학부 자치경찰학전공",
  "short": "자치경찰학전공",
  "college": "공공인재대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/0",
  "color": "#c9b7ed",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-11af3dc954",
  "name": "국방군사학과",
  "short": "국방군사학과",
  "college": "공공인재대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/0",
  "color": "#addcbd",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-fd3af02f53",
  "name": "부동산·지적학과",
  "short": "부동산·지적학과",
  "college": "공공인재대학",
  "aliases": [
   "부동산지적학과"
  ],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/0",
  "color": "#f0acc2",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-bfe5a168bd",
  "name": "법학부 법학전공",
  "short": "법학전공",
  "college": "공공인재대학",
  "aliases": [],
  "status": "모집중지·재학생 전공",
  "source": "https://www.daegu.ac.kr/intro/0",
  "color": "#9acdec",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-597517efbf",
  "name": "법학부 공공안전법학전공",
  "short": "공공안전법학전공",
  "college": "공공인재대학",
  "aliases": [],
  "status": "모집중지·재학생 전공",
  "source": "https://www.daegu.ac.kr/intro/0",
  "color": "#f0acc2",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "business",
  "name": "경영학부 경영학전공",
  "short": "경영학",
  "passive": "전략 수정",
  "description": "첫 장애물 감속 후 1회 회복 부스트",
  "color": "#addcbd",
  "icon": "📊",
  "college": "글로벌경영대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/1"
 },
 {
  "id": "accounting",
  "name": "경영학부 회계학전공",
  "short": "회계학",
  "passive": "손실 상각",
  "description": "첫 장애물의 감속 시간을 절반으로 줄여요",
  "color": "#c9b7ed",
  "icon": "🧮",
  "college": "글로벌경영대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/1"
 },
 {
  "id": "economics",
  "name": "경제금융통상학과",
  "short": "경제금융통상",
  "passive": "분산 투자",
  "description": "첫 불리한 속도 구간에서 1회 안정 부스트",
  "color": "#f4d46e",
  "icon": "📈",
  "college": "글로벌경영대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/1"
 },
 {
  "id": "tourism",
  "name": "호텔관광경영학부 관광항공경영전공",
  "short": "관광항공경영",
  "passive": "패스트트랙",
  "description": "첫 통행 장애물을 1회 우회해요",
  "color": "#9acdec",
  "icon": "✈️",
  "college": "글로벌경영대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/1"
 },
 {
  "id": "hotel",
  "name": "호텔관광경영학부 호텔관광외식서비스전공",
  "short": "호텔관광외식서비스",
  "passive": "서비스 회복",
  "description": "첫 넘어짐 직후 1회 회복 부스트",
  "color": "#f5b593",
  "icon": "🛎️",
  "college": "글로벌경영대학",
  "aliases": [
   "호텔관광경영학부 호텔외식관광전공"
  ],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/1"
 },
 {
  "id": "japanese",
  "name": "일본어일본학과",
  "short": "일본어일본학",
  "passive": "꾸준한 장인",
  "description": "8초 지점에서 집중 가속을 1회 받아요",
  "color": "#f0acc2",
  "icon": "🌸",
  "college": "글로벌경영대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/1"
 },
 {
  "id": "korean",
  "name": "국제학부 한국어교육, 통번역학전공",
  "short": "한국어교육·통번역",
  "passive": "정확한 전달",
  "description": "첫 갈림길 손실을 막거나 추가 전진해요",
  "color": "#c2d895",
  "icon": "💬",
  "college": "글로벌경영대학",
  "aliases": [
   "국제학부 한국어교육·통번역학전공"
  ],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/1"
 },
 {
  "id": "international",
  "name": "국제학부 국제어문학전공",
  "short": "국제어문학",
  "passive": "글로벌 루트",
  "description": "첫 포털에서 추가 지름길을 1회 이용해요",
  "color": "#c6bee8",
  "icon": "🌐",
  "college": "글로벌경영대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/1"
 },
 {
  "id": "du-8c6f26327b",
  "name": "사회복지학과",
  "short": "사회복지학과",
  "college": "사회과학대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/2",
  "color": "#9acdec",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-82a138c9c4",
  "name": "청소년상담복지학과",
  "short": "청소년상담복지학과",
  "college": "사회과학대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/2",
  "color": "#f5b593",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-d0e16067d6",
  "name": "아동가정복지학과",
  "short": "아동가정복지학과",
  "college": "사회과학대학",
  "aliases": [
   "아동가족복지학과"
  ],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/2",
  "color": "#f5b593",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-56e736342f",
  "name": "평생교육실버복지학과",
  "short": "평생교육실버복지학과",
  "college": "사회과학대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/2",
  "color": "#f0acc2",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-84cb05c1bb",
  "name": "미디어커뮤니케이션학부 영상콘텐츠전공",
  "short": "영상콘텐츠전공",
  "college": "사회과학대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/2",
  "color": "#c9b7ed",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-31df0bb36d",
  "name": "미디어커뮤니케이션학부 광고PR전공",
  "short": "광고PR전공",
  "college": "사회과학대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/2",
  "color": "#c9b7ed",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-d9e70fab7b",
  "name": "문헌정보학과",
  "short": "문헌정보학과",
  "college": "사회과학대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/2",
  "color": "#9acdec",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-cc1fdab9f9",
  "name": "심리학과",
  "short": "심리학과",
  "college": "사회과학대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/2",
  "color": "#9acdec",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-28944f5269",
  "name": "국제관계학과",
  "short": "국제관계학과",
  "college": "사회과학대학",
  "aliases": [],
  "status": "모집중지·재학생 전공",
  "source": "https://www.daegu.ac.kr/intro/2",
  "color": "#9acdec",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-9e69ed16ad",
  "name": "사회학과",
  "short": "사회학과",
  "college": "사회과학대학",
  "aliases": [],
  "status": "모집중지·재학생 전공",
  "source": "https://www.daegu.ac.kr/intro/2",
  "color": "#f0acc2",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-f402f371c5",
  "name": "보건의료학과",
  "short": "보건의료학과",
  "college": "보건바이오대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/3",
  "color": "#f0acc2",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-0b479839c2",
  "name": "응급구조학과",
  "short": "응급구조학과",
  "college": "보건바이오대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/3",
  "color": "#f4d46e",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-090a8e9e7a",
  "name": "동물자원학과",
  "short": "동물자원학과",
  "college": "보건바이오대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/3",
  "color": "#f4d46e",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-bc32b4bb80",
  "name": "반려동물산업학과",
  "short": "반려동물산업학과",
  "college": "보건바이오대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/3",
  "color": "#f4d46e",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-de8d76a7cd",
  "name": "스마트원예학과",
  "short": "스마트원예학과",
  "college": "보건바이오대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/3",
  "color": "#c9b7ed",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-89d25a3e34",
  "name": "식품가공학과",
  "short": "식품가공학과",
  "college": "보건바이오대학",
  "aliases": [
   "식품공학과"
  ],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/3",
  "color": "#f5b593",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-09ff758452",
  "name": "난임의료산업학과",
  "short": "난임의료산업학과",
  "college": "보건바이오대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/3",
  "color": "#f5b593",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-92814cc23d",
  "name": "통계학과",
  "short": "통계학과",
  "college": "보건바이오대학",
  "aliases": [],
  "status": "모집중지·재학생 전공",
  "source": "https://www.daegu.ac.kr/intro/3",
  "color": "#c9b7ed",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-4783abed93",
  "name": "화장품바이오학부 화장품제약전공",
  "short": "화장품제약전공",
  "college": "보건바이오대학",
  "aliases": [],
  "status": "모집중지·재학생 전공",
  "source": "https://www.daegu.ac.kr/intro/3",
  "color": "#9acdec",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-21dc77551c",
  "name": "화장품바이오학부 바이오메디컬전공",
  "short": "바이오메디컬전공",
  "college": "보건바이오대학",
  "aliases": [
   "화장품바이오학부 바이오메디칼전공"
  ],
  "status": "모집중지·재학생 전공",
  "source": "https://www.daegu.ac.kr/intro/3",
  "color": "#f5b593",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-1aebe86ead",
  "name": "산림자원학과",
  "short": "산림자원학과",
  "college": "보건바이오대학",
  "aliases": [],
  "status": "모집중지·재학생 전공",
  "source": "https://www.daegu.ac.kr/intro/3",
  "color": "#f0acc2",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-d0a49ce553",
  "name": "건축공학과",
  "short": "건축공학과",
  "college": "IT·공과대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/4",
  "color": "#f0acc2",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-dc5e76e0eb",
  "name": "소방안전방재학과",
  "short": "소방안전방재학과",
  "college": "IT·공과대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/4",
  "color": "#c9b7ed",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-10a8a6394b",
  "name": "기계자동차공학부 기계공학전공",
  "short": "기계공학전공",
  "college": "IT·공과대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/4",
  "color": "#9acdec",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-c22773d586",
  "name": "기계자동차공학부 미래자동차공학전공",
  "short": "미래자동차공학전공",
  "college": "IT·공과대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/4",
  "color": "#f4d46e",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-95813ce55e",
  "name": "식품영양학과",
  "short": "식품영양학과",
  "college": "IT·공과대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/4",
  "color": "#f5b593",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-f0ca5aaaf7",
  "name": "조경산림정원학과",
  "short": "조경산림정원학과",
  "college": "IT·공과대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/4",
  "color": "#c9b7ed",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-9b576e6107",
  "name": "친환경에너지학과",
  "short": "친환경에너지학과",
  "college": "IT·공과대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/4",
  "color": "#c9b7ed",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-4a1cebf318",
  "name": "전자전기공학부 반도체전자공학전공",
  "short": "반도체전자공학전공",
  "college": "IT·공과대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/4",
  "color": "#addcbd",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-f2ffe1a902",
  "name": "전자전기공학부 전기공학전공",
  "short": "전기공학전공",
  "college": "IT·공과대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/4",
  "color": "#f4d46e",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-afa6007d7e",
  "name": "컴퓨터정보공학부 컴퓨터공학전공",
  "short": "컴퓨터공학전공",
  "college": "IT·공과대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/4",
  "color": "#addcbd",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-68a61a7945",
  "name": "컴퓨터정보공학부 컴퓨터소프트웨어전공",
  "short": "컴퓨터소프트웨어전공",
  "college": "IT·공과대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/4",
  "color": "#9acdec",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-66aa7e3b3c",
  "name": "컴퓨터정보공학부 사이버보안전공",
  "short": "사이버보안전공",
  "college": "IT·공과대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/4",
  "color": "#addcbd",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-5e775c1df4",
  "name": "신소재에너지시스템공학부 신소재에너지공학전공",
  "short": "신소재에너지공학전공",
  "college": "IT·공과대학",
  "aliases": [],
  "status": "모집중지·재학생 전공",
  "source": "https://www.daegu.ac.kr/intro/4",
  "color": "#f5b593",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-f07c4a7f96",
  "name": "건설시스템공학과",
  "short": "건설시스템공학과",
  "college": "IT·공과대학",
  "aliases": [],
  "status": "모집중지·재학생 전공",
  "source": "https://www.daegu.ac.kr/intro/4",
  "color": "#addcbd",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-65e54f9142",
  "name": "환경기술공학과",
  "short": "환경기술공학과",
  "college": "IT·공과대학",
  "aliases": [],
  "status": "모집중지·재학생 전공",
  "source": "https://www.daegu.ac.kr/intro/4",
  "color": "#addcbd",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-a982444f1f",
  "name": "생명공학과",
  "short": "생명공학과",
  "college": "IT·공과대학",
  "aliases": [],
  "status": "모집중지·재학생 전공",
  "source": "https://www.daegu.ac.kr/intro/4",
  "color": "#c9b7ed",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-d6bd23e2da",
  "name": "화학공학과",
  "short": "화학공학과",
  "college": "IT·공과대학",
  "aliases": [],
  "status": "모집중지·재학생 전공",
  "source": "https://www.daegu.ac.kr/intro/4",
  "color": "#f4d46e",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-d0b2727e74",
  "name": "전자전기공학부 정보통신공학전공",
  "short": "정보통신공학전공",
  "college": "IT·공과대학",
  "aliases": [],
  "status": "모집중지·재학생 전공",
  "source": "https://www.daegu.ac.kr/intro/4",
  "color": "#f4d46e",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-0e944c7799",
  "name": "AI학과",
  "short": "AI학과",
  "college": "IT·공과대학",
  "aliases": [],
  "status": "모집중지·재학생 전공",
  "source": "https://www.daegu.ac.kr/intro/4",
  "color": "#9acdec",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-f8ed93b154",
  "name": "IT융합학과",
  "short": "IT융합학과",
  "college": "IT·공과대학",
  "aliases": [],
  "status": "학사과정 계약학과",
  "source": "https://www.daegu.ac.kr/intro/4",
  "color": "#addcbd",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-7a0ec4e19a",
  "name": "메카트로닉스공학과",
  "short": "메카트로닉스공학과",
  "college": "IT·공과대학",
  "aliases": [],
  "status": "학사과정 계약학과",
  "source": "https://www.daegu.ac.kr/intro/4",
  "color": "#f5b593",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-788f17a9f3",
  "name": "웹툰영상애니메이션학부 영상애니메이션전공",
  "short": "영상애니메이션전공",
  "college": "디자인예술대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/5",
  "color": "#9acdec",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-8f6be81e59",
  "name": "웹툰영상애니메이션학부 웹툰전공",
  "short": "웹툰전공",
  "college": "디자인예술대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/5",
  "color": "#f0acc2",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-e0bdce7334",
  "name": "시각디자인융합학부 시각디자인전공",
  "short": "시각디자인전공",
  "college": "디자인예술대학",
  "aliases": [
   "시각디자인학과"
  ],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/5",
  "color": "#f5b593",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-03e409e82a",
  "name": "시각디자인융합학부 서비스마케팅디자인전공",
  "short": "서비스마케팅디자인전공",
  "college": "디자인예술대학",
  "aliases": [
   "디자인마케팅학과"
  ],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/5",
  "color": "#addcbd",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-6b08676a30",
  "name": "산업디자인학과",
  "short": "산업디자인학과",
  "college": "디자인예술대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/5",
  "color": "#addcbd",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-17b767700c",
  "name": "패션디자인학과",
  "short": "패션디자인학과",
  "college": "디자인예술대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/5",
  "color": "#addcbd",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-9f8aa82a45",
  "name": "뷰티학부 헤어디자인전공",
  "short": "헤어디자인전공",
  "college": "디자인예술대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/5",
  "color": "#9acdec",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-bc83bee0f7",
  "name": "뷰티학부 메이크업·피부전공",
  "short": "메이크업·피부전공",
  "college": "디자인예술대학",
  "aliases": [
   "뷰티학부 메이크업피부전공"
  ],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/5",
  "color": "#c9b7ed",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-f0dcb03771",
  "name": "실내건축디자인학과",
  "short": "실내건축디자인학과",
  "college": "디자인예술대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/5",
  "color": "#f0acc2",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-d061f0d53a",
  "name": "게임학과",
  "short": "게임학과",
  "college": "디자인예술대학",
  "aliases": [
   "게임엔터테인먼트학과"
  ],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/5",
  "color": "#f5b593",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-7cfabe76d3",
  "name": "융합예술학부 아트앤디자인전공",
  "short": "아트앤디자인전공",
  "college": "디자인예술대학",
  "aliases": [],
  "status": "모집중지·재학생 전공",
  "source": "https://www.daegu.ac.kr/intro/5",
  "color": "#c9b7ed",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-283d7ec451",
  "name": "주얼리디자인학과",
  "short": "주얼리디자인학과",
  "college": "디자인예술대학",
  "aliases": [],
  "status": "모집중지·재학생 전공",
  "source": "https://www.daegu.ac.kr/intro/5",
  "color": "#9acdec",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-841986c8ff",
  "name": "국어교육과",
  "short": "국어교육과",
  "college": "사범대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/6",
  "color": "#9acdec",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-16d4384a88",
  "name": "영어교육과",
  "short": "영어교육과",
  "college": "사범대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/6",
  "color": "#f5b593",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-957daec280",
  "name": "역사교육과",
  "short": "역사교육과",
  "college": "사범대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/6",
  "color": "#f4d46e",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-99dd7eba28",
  "name": "일반사회교육과",
  "short": "일반사회교육과",
  "college": "사범대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/6",
  "color": "#f5b593",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-520e6e08ea",
  "name": "지리교육과",
  "short": "지리교육과",
  "college": "사범대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/6",
  "color": "#addcbd",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-78fc3b2433",
  "name": "유아교육과",
  "short": "유아교육과",
  "college": "사범대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/6",
  "color": "#9acdec",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-8f2eb82bc1",
  "name": "특수교육과",
  "short": "특수교육과",
  "college": "사범대학",
  "aliases": [
   "특수교육학부 특수교육전공"
  ],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/6",
  "color": "#c9b7ed",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-f5d5fa0aa5",
  "name": "초등특수교육과",
  "short": "초등특수교육과",
  "college": "사범대학",
  "aliases": [
   "특수교육학부 초등특수교육전공"
  ],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/6",
  "color": "#9acdec",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-ab27af6382",
  "name": "유아특수교육과",
  "short": "유아특수교육과",
  "college": "사범대학",
  "aliases": [
   "특수교육학부 유아특수교육전공"
  ],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/6",
  "color": "#f5b593",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-312ef1d925",
  "name": "수학교육과",
  "short": "수학교육과",
  "college": "사범대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/6",
  "color": "#c9b7ed",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-f211cdd60d",
  "name": "물리교육과",
  "short": "물리교육과",
  "college": "사범대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/6",
  "color": "#c9b7ed",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-e1e5bab083",
  "name": "화학교육과",
  "short": "화학교육과",
  "college": "사범대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/6",
  "color": "#f0acc2",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-61c3a6a094",
  "name": "생물교육과",
  "short": "생물교육과",
  "college": "사범대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/6",
  "color": "#f5b593",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-436a5ed683",
  "name": "지구과학교육과",
  "short": "지구과학교육과",
  "college": "사범대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/6",
  "color": "#f0acc2",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-1007c4a15a",
  "name": "물리치료학과",
  "short": "물리치료학과",
  "college": "재활과학대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/7",
  "color": "#addcbd",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-a5693280bb",
  "name": "작업치료학과",
  "short": "작업치료학과",
  "college": "재활과학대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/7",
  "color": "#c9b7ed",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-a20b426aa6",
  "name": "언어치료학과",
  "short": "언어치료학과",
  "college": "재활과학대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/7",
  "color": "#f5b593",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-0b2c29232b",
  "name": "재활상담심리치료학과",
  "short": "재활상담심리치료학과",
  "college": "재활과학대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/7",
  "color": "#c9b7ed",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-9dd61443e6",
  "name": "의료재활학과",
  "short": "의료재활학과",
  "college": "재활과학대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/7",
  "color": "#f4d46e",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-133327c99a",
  "name": "재활건강증진학과",
  "short": "재활건강증진학과",
  "college": "재활과학대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/7",
  "color": "#f5b593",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-b23ab78795",
  "name": "특수창의융합학과",
  "short": "특수창의융합학과",
  "college": "재활과학대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/7",
  "color": "#f0acc2",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-3742058e7c",
  "name": "라이프디자인학과",
  "short": "라이프디자인학과",
  "college": "재활과학대학",
  "aliases": [],
  "status": "2027학년도 신설",
  "source": "https://www.daegu.ac.kr/intro/7",
  "color": "#f5b593",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-adb54c2b50",
  "name": "간호학과",
  "short": "간호학과",
  "college": "간호대학",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/8",
  "color": "#f4d46e",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-820b8ab408",
  "name": "체육학과",
  "short": "체육학과",
  "college": "체육레저학부",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/12",
  "color": "#f4d46e",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-889ace4c03",
  "name": "스포츠레저학과",
  "short": "스포츠레저학과",
  "college": "체육레저학부",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/12",
  "color": "#9acdec",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-dfe6fbdefe",
  "name": "스포츠헬스케어학과",
  "short": "스포츠헬스케어학과",
  "college": "체육레저학부",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/12",
  "color": "#f4d46e",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-a47aaf1ca7",
  "name": "문화콘텐츠학부",
  "short": "문화콘텐츠학부",
  "college": "문화콘텐츠학부",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/13",
  "color": "#f0acc2",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-093ad325ff",
  "name": "자유전공학부",
  "short": "자유전공학부",
  "college": "자유전공학부",
  "aliases": [],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/14",
  "color": "#9acdec",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-5d86fe1ebc",
  "name": "휴먼케어창의학부 실버복지·복지상담학전공",
  "short": "실버복지·복지상담학전공",
  "college": "글로컬라이프대학",
  "aliases": [
   "실버복지·복지상담학과"
  ],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/10",
  "color": "#f4d46e",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-8593f00cd0",
  "name": "휴먼케어창의학부 자산관리·6차산업학전공",
  "short": "자산관리·6차산업학전공",
  "college": "글로컬라이프대학",
  "aliases": [
   "자산·6차치유산업학과",
   "자산관리·6차산업학과"
  ],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/10",
  "color": "#f5b593",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-6517d3aeec",
  "name": "글로컬융합학부 평생교육·청소년학전공",
  "short": "평생교육·청소년학전공",
  "college": "글로컬라이프대학",
  "aliases": [
   "평생교육·청소년학과"
  ],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/10",
  "color": "#f4d46e",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-64e7094250",
  "name": "글로벌한국학부 한국어교육전공",
  "short": "한국어교육전공",
  "college": "국제대학",
  "aliases": [
   "글로벌한국학부(한국어교육전공)"
  ],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/11",
  "color": "#f4d46e",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-7508cd1e5f",
  "name": "글로벌한국학부 한국어통번역전공",
  "short": "한국어통번역전공",
  "college": "국제대학",
  "aliases": [
   "글로벌한국학부(한국어통번역전공)"
  ],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/11",
  "color": "#f0acc2",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-c713c3da01",
  "name": "글로벌인재학부 국제경제무역전공",
  "short": "국제경제무역전공",
  "college": "국제대학",
  "aliases": [
   "글로벌인재학부(국제경제무역전공)"
  ],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/11",
  "color": "#c9b7ed",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-92351bfab1",
  "name": "글로벌인재학부 글로벌경영전공",
  "short": "글로벌경영전공",
  "college": "국제대학",
  "aliases": [
   "글로벌인재학부(글로벌경영전공)"
  ],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/11",
  "color": "#9acdec",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-316c03d067",
  "name": "글로벌인재학부 문화산업관리전공",
  "short": "문화산업관리전공",
  "college": "국제대학",
  "aliases": [
   "글로벌인재학부(문화산업관리전공)"
  ],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/11",
  "color": "#c9b7ed",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-42b87ecf32",
  "name": "글로벌인재학부 미디어전공",
  "short": "미디어전공",
  "college": "국제대학",
  "aliases": [
   "글로벌인재학부(미디어전공)"
  ],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/11",
  "color": "#f4d46e",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-40e8d22da9",
  "name": "글로벌인재학부 인재교육전공",
  "short": "인재교육전공",
  "college": "국제대학",
  "aliases": [
   "글로벌인재학부(인재교육전공)"
  ],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/11",
  "color": "#c9b7ed",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-1901a304a6",
  "name": "글로벌인재학부 법학전공",
  "short": "법학전공",
  "college": "국제대학",
  "aliases": [
   "글로벌인재학부(법학전공)"
  ],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/11",
  "color": "#f5b593",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-f513b1dcb4",
  "name": "글로벌인재학부 연극영화문학전공",
  "short": "연극영화문학전공",
  "college": "국제대학",
  "aliases": [
   "글로벌인재학부(연극영화문학전공)"
  ],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/11",
  "color": "#addcbd",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-dddbd15a6f",
  "name": "글로벌인재학부 중국언어문학전공",
  "short": "중국언어문학전공",
  "college": "국제대학",
  "aliases": [
   "글로벌인재학부(중국언어문학전공)"
  ],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/11",
  "color": "#9acdec",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-adf4a33100",
  "name": "글로벌인재학부 회계학전공",
  "short": "회계학전공",
  "college": "국제대학",
  "aliases": [
   "글로벌인재학부(회계학전공)"
  ],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/11",
  "color": "#addcbd",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-6b58975f2b",
  "name": "글로벌인재학부 농산업학전공",
  "short": "농산업학전공",
  "college": "국제대학",
  "aliases": [
   "글로벌인재학부(농산업학전공)"
  ],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/11",
  "color": "#c9b7ed",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-9051df280b",
  "name": "글로벌인재학부 AI컴퓨터공학전공",
  "short": "AI컴퓨터공학전공",
  "college": "국제대학",
  "aliases": [
   "글로벌인재학부(AI컴퓨터공학전공)"
  ],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/11",
  "color": "#f0acc2",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-9985e5dcd2",
  "name": "글로벌인재학부 건축공학전공",
  "short": "건축공학전공",
  "college": "국제대학",
  "aliases": [
   "글로벌인재학부(건축공학전공)"
  ],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/11",
  "color": "#addcbd",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-3a40fa8b8b",
  "name": "글로벌인재학부 기계공학전공",
  "short": "기계공학전공",
  "college": "국제대학",
  "aliases": [
   "글로벌인재학부(기계공학전공)"
  ],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/11",
  "color": "#c9b7ed",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-81e240d9f9",
  "name": "글로벌인재학부 전자전기ICT공학전공",
  "short": "전자전기ICT공학전공",
  "college": "국제대학",
  "aliases": [
   "글로벌인재학부(전자전기ICT공학전공)"
  ],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/11",
  "color": "#9acdec",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "du-b328387573",
  "name": "글로벌인재학부 디자인예술전공",
  "short": "디자인예술전공",
  "college": "국제대학",
  "aliases": [
   "글로벌인재학부(디자인예술전공)"
  ],
  "status": "학부 학과·전공",
  "source": "https://www.daegu.ac.kr/intro/11",
  "color": "#c9b7ed",
  "icon": "🎓",
  "passive": "내 메뉴 수호",
  "description": "학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요."
 },
 {
  "id": "facility",
  "name": "시설물관리",
  "short": "시설물관리",
  "passive": "안전점검",
  "description": "직접 부딪히는 첫 장애물의 감속을 1회 막아요.",
  "color": "#8ccbd0",
  "icon": "🛠️",
  "kind": "role",
  "college": "추가 역할",
  "aliases": [],
  "status": "추가 역할"
 }
];
const deptSearchKey=value=>String(value||'').normalize('NFKC').toLocaleLowerCase('ko').replace(/[\s·,()ㆍ・]/g,'');
const deptById=new Map(deptOptions.map(d=>[d.id,d]));
const deptByName=new Map();for(const d of deptOptions)for(const name of [d.name,d.short,...(d.aliases||[])])if(!deptByName.has(deptSearchKey(name)))deptByName.set(deptSearchKey(name),d);
/* END_CAMPUS_DEPARTMENTS_V1 */

let deptRace=null,deptLoop=0,deptFrame=0,deptFinishTimer=0,deptView=null,deptRows=new Map(),deptRemoteAt=0,deptLastNotice='';
const deptCourseLength=1200,deptTickStep=.04,deptHardLimit=30;
const deptGateDefinitions=[
 {at:170,type:'hurdle',icon:'🚧',label:'과제 더미',penalty:.62},
 {at:350,type:'slime',icon:'🫠',label:'미끄러운 바닥',penalty:.75},
 {at:530,type:'turnstile',icon:'🚪',label:'닫히는 출입문',penalty:.68},
 {at:710,type:'fork',icon:'↗️',label:'운명의 갈림길',penalty:.6},
 {at:890,type:'portal',icon:'🌀',label:'점심 포털',penalty:0},
 {at:1070,type:'wind',icon:'💨',label:'역풍 구간',penalty:.5}
];
function deptHash(value){let h=2166136261;for(const ch of String(value)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}h^=h>>>16;h=Math.imul(h,2246822507);h^=h>>>13;return (h>>>0)/4294967296;}
function deptCourse(seed){return [...deptGateDefinitions].sort((a,b)=>deptHash(seed+':gate:'+a.type)-deptHash(seed+':gate:'+b.type)).map((gate,i)=>({...gate,id:'gate'+i,at:170+i*180+Math.round((deptHash(seed+':position:'+i)-.5)*36)}));}
function deptAuthority(){return typeof netIsHost==='function'?netIsHost():true;}
function deptOwnId(){return typeof netSelfId==='function'?String(netSelfId()||''):'';}
function deptOption(value){return deptById.get(value)||deptByName.get(deptSearchKey(value))||deptById.get('business');}
function deptText(node,value){if(node&&node.textContent!==String(value))node.textContent=String(value);}
function deptMake(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function deptFood(menu){const s=String(typeof menu==='object'?(menu?.name||''):menu||'');if(/피자/.test(s))return '🍕';if(/치킨|닭/.test(s))return '🍗';if(/버거/.test(s))return '🍔';if(/초밥|스시/.test(s))return '🍣';if(/돈[까가]스|카츠/.test(s))return '🍱';if(/면|국수|파스타|우동|라멘|짜장|짬뽕/.test(s))return '🍜';if(/샐러드/.test(s))return '🥗';if(/떡|분식/.test(s))return '🍢';if(/고기|삼겹|갈비/.test(s))return '🥩';if(/국|탕|찌개/.test(s))return '🍲';return '🍚';}
function deptMenuName(menu){return String(typeof menu==='object'?(menu?.name||'오늘의 메뉴'):menu||'오늘의 메뉴').slice(0,40);}
function deptEnsureUI(){
 if(deptView)return;
 deptView=deptMake('section','');deptView.id='deptRaceView';deptView.hidden=true;deptView.setAttribute('aria-label','실시간 전공 랜덤 레이스');
 deptView.innerHTML='<div class="dept-mast"><span>DAEGU UNIVERSITY · LUNCH GRAND PRIX</span><span class="dept-live">LIVE MULTIPLAYER</span></div><div class="dept-hero"><div><div class="dept-eyebrow">RANDOM COURSE / REAL PLAYERS</div><h2 class="dept-title" tabindex="-1">오늘의 점심은<br><em>달리는 자의 것.</em></h2><p class="dept-subtitle">랜덤 코스 × 전공 패시브 × 당신의 점프와 대시<br>레이스 1등은 왕관 획득! 이어지는 쟁탈전의 마지막 생존자가 메뉴를 결정해요.</p></div><div class="dept-clock"><b id="deptClock">3</b><span id="deptClockLabel">GET READY</span></div></div><div class="dept-announcer" role="status" aria-live="polite"><span id="deptAnnouncement">모두 같은 출발선! 각자 자신의 기기에서 조작해요.</span></div><div class="dept-arena"><div class="dept-lanes" id="deptLanes"></div><div class="dept-overlay" id="deptOverlay" aria-hidden="true"><b id="deptOverlayTitle">3</b><span id="deptOverlaySub">점프와 대시를 준비하세요</span></div></div><div class="dept-controls"><div class="dept-control-copy"><strong id="deptControlName">내 레이서 준비 중</strong><span id="deptControlHint">점프 Space · 대시 Shift<br>장애물 바로 앞에서 점프!</span></div><button class="dept-input" id="deptJump" data-action="jump" type="button">점프 ↑<small>SPACE · 준비 완료</small></button><button class="dept-input" id="deptDash" data-action="dash" type="button">대시 →<small>SHIFT · 준비 완료</small></button></div><div class="dept-credit">학과·전공 목록은 <a href="https://www.daegu.ac.kr/intro/1" target="_blank" rel="noopener noreferrer">대구대학교 공식 대학 안내</a>를 참고했습니다. 시설물관리는 별도 역할 캐릭터입니다. 모든 패시브는 전공·역할에서 착안한 게임 창작 능력이며, 같은 캐릭터도 함께 선택할 수 있어요.</div>';
 document.getElementById('game').append(deptView);
 deptView.querySelectorAll('.dept-input').forEach(button=>button.addEventListener('click',()=>deptInput(button.dataset.action)));
}
function deptBuildLanes(){
 const target=deptView.querySelector('#deptLanes');target.replaceChildren();deptRows.clear();
 for(const lane of deptRace.lanes){const option=deptOption(lane.department),row=deptMake('div','dept-lane');row.style.setProperty('--dept-color',option.color);row.dataset.own=String(lane.id===deptOwnId());
  const info=deptMake('div','dept-info'),person=deptMake('div','dept-person'),rank=deptMake('span','dept-rank','—'),name=deptMake('span','dept-name',lane.name);person.append(rank,name);const dep=deptMake('div','dept-department',option.icon+' '+option.short);dep.title=option.name;const passive=deptMake('div','dept-passive-label');passive.title=option.description;passive.append(deptMake('i'),deptMake('span','',option.passive));info.append(person,dep,passive);
  const track=deptMake('div','dept-track'),progress=deptMake('div','dept-progress'),next=deptMake('div','dept-next');track.append(progress,next);const gates=[];
  deptRace.obstacles.forEach(gate=>{const n=deptMake('span','dept-gate',gate.icon);n.style.left=(gate.at/deptCourseLength*100)+'%';n.title=gate.label;track.append(n);gates.push(n);});
  const runner=deptMake('div','dept-runner'),food=deptMake('span','dept-food',deptFood(lane.menu));runner.innerHTML=deptAvatarSvg(lane.department);runner.append(food);const fx=deptMake('span','dept-fx');fx.hidden=true;runner.append(fx);track.append(runner);
  const meters=deptMake('div','dept-meters');meters.append(deptMake('b','','0'),deptMake('small','',lane.menu));meters.title=lane.menu;row.append(info,track,meters);target.append(row);deptRows.set(lane.id,{row,rank,passive,track,runner,progress,next,fx,meters:meters.querySelector('b'),gates});
 }
}
function deptStart(spec){
 if(!spec||typeof spec.id!=='string'||!Array.isArray(spec.participants)||!spec.participants.length||spec.participants.length>8)return false;
 if(deptRace?.id===spec.id){deptEnsureUI();deptView.hidden=false;return true;}
 deptCancel();deptEnsureUI();const startAt=Number.isFinite(spec.startAt)?spec.startAt:Date.now()+3500;
 const participants=spec.participants.filter(p=>p&&typeof p.id==='string').slice(0,8);if(!participants.length||new Set(participants.map(p=>p.id)).size!==participants.length)return false;
 deptRace={id:spec.id,seed:String(spec.seed??spec.id),startAt,elapsed:0,phase:'countdown',seq:0,obstacles:deptCourse(String(spec.seed??spec.id)),lanes:participants.map((p,i)=>{const option=deptOption(p.department||(typeof netDepartment==='function'?netDepartment(p.id):'business'));return {id:p.id,name:String(p.name||'참가자').slice(0,24),menu:deptMenuName(p.menu),department:option.id,index:i,distance:0,speed:0,nextObstacle:0,jumpUntil:0,jumpReadyAt:0,dashUntil:0,dashReadyAt:0,stunUntil:0,boostUntil:0,passiveUsed:false,passiveAt:0,effect:'',effectUntil:0,finishedAt:null};}),winnerId:null,finishedAt:null};
 deptRemoteAt=performance.now();deptLastNotice='';deptBuildLanes();
 if(typeof cancelActionDuel==='function')cancelActionDuel();if(typeof frame!=='undefined')cancelAnimationFrame(frame);if(typeof mode!=='undefined')mode='race';
 for(const id of ['setupView','raceView','resultView','duelView']){const view=document.getElementById(id);if(view)view.hidden=true;}
 deptView.hidden=false;if(typeof setStep==='function')setStep(2);if(typeof playLayout==='function')playLayout(true);const status=document.getElementById('dossierStatus');if(status)status.textContent='실시간 전공 랜덤 레이스';
 deptView.querySelector('.dept-title').focus({preventScroll:true});deptRender();
 if(deptAuthority()){deptLoop=setInterval(deptHostTick,50);deptHostTick();}
 deptFrame=requestAnimationFrame(deptAnimate);return true;
}
function deptNotice(lane,text,t){lane.effect=text;lane.effectUntil=t+1.9;}
function deptUsePassive(lane,t,text){lane.passiveUsed=true;lane.passiveAt=t;deptNotice(lane,'✨ '+deptOption(lane.department).passive+' · '+text,t);}
function deptHazard(lane,gate,t){
 let penalty=gate.penalty;
 if((t<lane.jumpUntil&&gate.type!=='wind')||(t<lane.dashUntil&&gate.type==='wind')){deptNotice(lane,gate.type==='wind'?'💨 역풍 돌파!':'↑ 점프 성공!',t);return;}
 if(!lane.passiveUsed&&lane.department==='tourism'){deptUsePassive(lane,t,'우회 성공!');lane.distance+=10;return;}
 if(!lane.passiveUsed&&lane.department==='accounting'){penalty*=.5;deptUsePassive(lane,t,'감속 절반!');}
 else if(!lane.passiveUsed&&(lane.department==='business'||lane.department==='hotel')){lane.boostUntil=t+1.7;deptUsePassive(lane,t,'회복 부스트!');}
 else deptNotice(lane,gate.icon+' '+gate.label+'!',t);
 lane.stunUntil=Math.max(lane.stunUntil,t+penalty);
}
function deptGate(lane,gate,t){
 if(gate.type==='portal'){let bonus=15+deptHash(deptRace.seed+'portal'+lane.id)*14;if(!lane.passiveUsed&&lane.department==='international'){bonus+=18;deptUsePassive(lane,t,'지름길 발견!');}else deptNotice(lane,'🌀 포털 +'+Math.round(bonus)+'m',t);lane.distance+=bonus;return;}
 if(gate.type==='fork'){const unlucky=deptHash(deptRace.seed+'fork'+lane.id)<.5;if(!lane.passiveUsed&&lane.department==='korean'){deptUsePassive(lane,t,unlucky?'길 안내 성공!':'정확한 지름길!');lane.distance+=unlucky?8:22;return;}if(unlucky){deptNotice(lane,'↗️ 앗, 돌아가는 길!',t);lane.stunUntil=t+gate.penalty;}else{lane.distance+=15;deptNotice(lane,'↗️ 지름길 +15m!',t);}return;}
 deptHazard(lane,gate,t);
}
function deptSimulate(dt,t){
 const finishers=[];
 for(const lane of deptRace.lanes){if(lane.finishedAt!==null)continue;
  let roll=.94+deptHash(deptRace.seed+':speed:'+lane.id+':'+Math.floor(t/.75))*.12;
  if(!lane.passiveUsed&&lane.department==='economics'&&t>=3&&roll<.98){lane.boostUntil=t+1.25;deptUsePassive(lane,t,'안정 성장!');}
  if(!lane.passiveUsed&&lane.department==='japanese'&&t>=8){lane.boostUntil=t+1.25;deptUsePassive(lane,t,'집중 가속!');}
  if(!lane.passiveUsed&&t>=21){lane.distance+=17;deptUsePassive(lane,t,'막판 스퍼트!');}
  const before=lane.distance;let velocity=50*roll;if(t<lane.stunUntil)velocity*=.25;if(t<lane.dashUntil)velocity*=1.65;if(t<lane.boostUntil)velocity*=1.35;velocity*=deptItemVelocity(lane,t);lane.speed=velocity;lane.distance+=velocity*dt;
  while(lane.nextObstacle<deptRace.obstacles.length&&lane.distance>=deptRace.obstacles[lane.nextObstacle].at){const gate=deptRace.obstacles[lane.nextObstacle++];deptGate(lane,gate,t);}
  if(lane.distance>=deptCourseLength){lane.finishedAt=t-dt+dt*Math.min(1,Math.max(0,(deptCourseLength-before)/Math.max(.01,lane.distance-before)));lane.distance=deptCourseLength;lane.speed=0;finishers.push(lane);}
 }
 if(finishers.length){finishers.sort((a,b)=>a.finishedAt-b.finishedAt||deptHash(deptRace.seed+a.id)-deptHash(deptRace.seed+b.id));deptFinish(finishers[0],t);}
}
function deptHostTick(){
 if(!deptRace||!deptAuthority()||deptRace.phase==='finished')return;
 const target=Math.max(0,Math.min(deptHardLimit,(Date.now()-deptRace.startAt)/1000));
 if(Date.now()>=deptRace.startAt)deptRace.phase='running';
 while(deptRace.phase==='running'&&deptRace.elapsed+deptTickStep<=target+.00001){deptRace.elapsed=Math.round((deptRace.elapsed+deptTickStep)*100000)/100000;deptSimulate(deptTickStep,deptRace.elapsed);}
 if(deptRace.phase==='running'&&target>=deptHardLimit-.001){const sorted=[...deptRace.lanes].sort((a,b)=>b.distance-a.distance||deptHash(deptRace.seed+a.id)-deptHash(deptRace.seed+b.id));deptFinish(sorted[0],deptRace.elapsed);}
 deptRace.seq++;if(typeof netPublishRace==='function')netPublishRace(false);
}
function deptFinish(lane,t){
 if(!deptRace||deptRace.phase==='finished')return;deptRace.phase='finished';deptRace.winnerId=lane.id;deptRace.finishedAt=t;lane.finishedAt??=t;lane.distance=deptCourseLength;lane.speed=0;clearInterval(deptLoop);deptLoop=0;
 deptRender();if(typeof netPublishRace==='function')netPublishRace(true);
 const id=deptRace.id;deptFinishTimer=setTimeout(()=>{if(deptRace?.id===id&&deptAuthority()&&typeof netRaceFinished==='function')netRaceFinished(lane.id);},2700);
}
function deptHostInput(senderId,action){
 if(!deptRace||!deptAuthority()||deptRace.phase!=='running'||Date.now()<deptRace.startAt||!['jump','dash'].includes(action))return false;
 deptHostTick();const lane=deptRace?.lanes.find(x=>x.id===senderId);if(!lane||lane.finishedAt!==null||deptRace.phase!=='running')return false;const t=deptRace.elapsed;
 if(action==='jump'){if(t<lane.jumpReadyAt)return false;lane.jumpUntil=t+.83;lane.jumpReadyAt=t+1.42;}
 else{if(t<lane.dashReadyAt)return false;lane.dashUntil=t+.72;lane.dashReadyAt=t+4.1;deptNotice(lane,'⚡ 대시!',t);}
 deptRace.seq++;if(typeof netPublishRace==='function')netPublishRace(true);return true;
}
function deptGetState(){return deptRace?JSON.parse(JSON.stringify({...deptRace,sentAt:Date.now()})):null;}
function deptReceive(state){
 if(deptAuthority()||!state||typeof state.id!=='string'||!Array.isArray(state.lanes)||state.lanes.length<1||state.lanes.length>8||!Number.isFinite(state.elapsed)||!Number.isFinite(state.startAt)||!['countdown','running','finished'].includes(state.phase))return false;
 if(state.lanes.some(l=>!l||typeof l.id!=='string'||!Number.isFinite(l.distance)||!Number.isFinite(l.speed)))return false;
 if(deptRace&&deptRace.id!==state.id)return false;if(deptRace&&state.seq<deptRace.seq)return false;
 if(!deptRace)deptStart({id:state.id,seed:state.seed,startAt:state.startAt,participants:state.lanes.map(l=>({id:l.id,name:l.name,menu:l.menu,department:l.department}))});
 if(!deptRace)return false;deptRace=JSON.parse(JSON.stringify(state));deptRemoteAt=performance.now();if(!deptFrame)deptRender();return true;
}
function deptInput(action){
 if(!deptRace||deptRace.phase!=='running'||!deptRace.lanes.some(x=>x.id===deptOwnId()))return;
 if(typeof netSendRaceInput==='function')netSendRaceInput(action);else deptHostInput(deptOwnId(),action);
}
function deptAnimate(){if(!deptRace)return;deptRender();deptFrame=requestAnimationFrame(deptAnimate);}
function deptRender(){
 if(!deptRace||!deptView||deptView.hidden)return;
 const r=deptRace,t=deptSmoothFrame(),until=deptSmoothUntil(),own=r.lanes.find(l=>l.id===deptOwnId());deptSmoothMeasure();
 const order=[...r.lanes].sort((a,b)=>b.distance-a.distance||(a.finishedAt??Infinity)-(b.finishedAt??Infinity)||a.index-b.index);
 for(const lane of r.lanes){const nodes=deptRows.get(lane.id);if(!nodes)continue;const d=deptSmoothDistance(lane,t),pct=d/deptCourseLength*100;deptSmoothPlace(nodes,lane,d,t);nodes.runner.dataset.dash=String(deptSmoothDash(lane,t));nodes.runner.dataset.stun=String(t<lane.stunUntil);nodes.row.dataset.moving=String(r.phase==='running'&&lane.finishedAt===null);nodes.row.dataset.finished=String(lane.finishedAt!==null);deptText(nodes.rank,order.findIndex(x=>x.id===lane.id)+1);deptText(nodes.meters,Math.round(d)+'m');nodes.passive.dataset.used=String(lane.passiveUsed);nodes.fx.hidden=!(lane.effect&&t<lane.effectUntil);deptText(nodes.fx,lane.effect);nodes.gates.forEach((g,i)=>g.classList.toggle('passed',i<lane.nextObstacle));
  const gate=r.obstacles[lane.nextObstacle],gap=gate?gate.at-d:999;deptText(nodes.next,lane.id===deptOwnId()&&gap>0&&gap<100?(gap<32&&gate.type!=='portal'&&gate.type!=='fork'?(gate.type==='wind'?'대시 타이밍!':'지금 점프!'):gate.label+' '+Math.max(0,Math.round(gap))+'m'):'');
 }
 const overlay=deptView.querySelector('#deptOverlay'),overTitle=deptView.querySelector('#deptOverlayTitle'),overSub=deptView.querySelector('#deptOverlaySub');
 if(r.phase==='finished'){
  const winner=r.lanes.find(x=>x.id===r.winnerId);if(winner&&overlay.dataset.winner!==winner.id){overlay.dataset.winner=winner.id;overlay.className='dept-overlay dept-finale';overlay.replaceChildren();const conf=deptMake('div','dept-confetti');for(let i=0;i<28;i++){const p=deptMake('i');p.style.left=(deptHash(r.seed+'conf'+i)*100)+'%';p.style.background=deptOptions[i%deptOptions.length].color;p.style.animationDelay=(-deptHash(r.seed+'delay'+i)*2.3)+'s';conf.append(p);}overlay.append(conf,deptMake('div','dept-photo','PHOTO FINISH · FIRST SEED'),deptMake('div','dept-winner-food',deptFood(winner.menu)),deptMake('b','',winner.menu),deptMake('span','',winner.name+' 님 레이스 1등! 이어서 왕좌 쟁탈전이 시작돼요.'));}
  overlay.hidden=false;deptText(deptView.querySelector('#deptClock'),r.finishedAt.toFixed(1));deptText(deptView.querySelector('#deptClockLabel'),'FINISH');
 }else{overlay.className='dept-overlay';if(until>0){const n=Math.min(3,Math.max(1,Math.ceil(until)));overlay.hidden=false;deptText(overTitle,n);deptText(overSub,'내 메뉴를 싣고, 출발 준비!');deptText(deptView.querySelector('#deptClock'),n);deptText(deptView.querySelector('#deptClockLabel'),'GET READY');}
  else{overlay.hidden=t>.85;deptText(overTitle,'GO!');deptText(overSub,'점프! 대시! 오늘의 점심을 잡아요');deptText(deptView.querySelector('#deptClock'),t.toFixed(1));deptText(deptView.querySelector('#deptClockLabel'),'RACE TIME');}}
 let announcement='모두 같은 출발선! 각자 자신의 기기에서 조작해요.';
 if(r.phase==='running'){const latest=[...r.lanes].filter(l=>l.effect&&t<l.effectUntil).sort((a,b)=>(b.effectUntil||0)-(a.effectUntil||0))[0];announcement=latest?latest.name+' · '+latest.effect:(order[0]?.name||'')+' 선두! 장애물 앞에서 점프하고, 빈 구간은 대시하세요.';}
 if(r.phase==='finished')announcement='레이스 1등 결정! 모두 자동으로 최종 1등 쟁탈전에 진입합니다.';
 if(announcement!==deptLastNotice){deptLastNotice=announcement;deptText(deptView.querySelector('#deptAnnouncement'),announcement);}
 deptText(deptView.querySelector('#deptControlName'),own?own.name+' · '+own.menu:'지금은 관전 중이에요');deptText(deptView.querySelector('#deptControlHint'),own?'점프 Space · 대시 Shift / 장애물 앞에서 점프!':'참가자는 각자 자신의 기기에서 조작해요.');
 for(const action of ['jump','dash']){const button=deptView.querySelector(action==='jump'?'#deptJump':'#deptDash'),readyAt=own?(action==='jump'?own.jumpReadyAt:own.dashReadyAt):0,cool=Math.max(0,readyAt-t);button.disabled=!own||r.phase!=='running'||until>0||cool>.03||own.finishedAt!==null;deptText(button.querySelector('small'),!own?'관전 중':r.phase==='countdown'?'출발 대기':r.phase==='finished'?'레이스 종료':cool>.03?cool.toFixed(1)+'초 후 준비':(action==='jump'?'SPACE':'SHIFT')+' · 준비 완료');}
}
function deptCancel(){clearInterval(deptLoop);clearTimeout(deptFinishTimer);cancelAnimationFrame(deptFrame);deptLoop=0;deptFrame=0;deptFinishTimer=0;deptRace=null;deptRows.clear();if(deptView){deptView.hidden=true;const overlay=deptView.querySelector('#deptOverlay');if(overlay?.dataset.winner){delete overlay.dataset.winner;overlay.className='dept-overlay';overlay.innerHTML='<b id="deptOverlayTitle">3</b><span id="deptOverlaySub">점프와 대시를 준비하세요</span>';}}}
window.addEventListener('keydown',event=>{if(!deptRace||deptView?.hidden||!['Space','ShiftLeft','ShiftRight'].includes(event.code)||/INPUT|TEXTAREA|SELECT/.test(event.target?.tagName)||event.target?.isContentEditable)return;event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)deptInput(event.code==='Space'?'jump':'dash');},true);


/* ONLINE_GAME_V3 */
const netRoom=window.LunchRoom;
let netRoster=[],netPicks={},netReady={},netDepartments={},netPhase='setup',netSpec=null,netDuelMeta=null,netSeq=0,netLastSeq=-1,netInputSeq=0,netInputSeen={},netLastCombat=0,netLastRace=0,netApplying=false,netPendingPick=false;
let netPrepareLocal=prepareDuel;const netResultLocal=renderResult;
function netIsActive(){return !!netRoom?.active;}
function netIsHost(){return netIsActive()&&netRoom.isHost;}
function netSelfId(){return netRoom?.selfId||'';}
function netSelfSide(){if(!netDuelMeta)return -1;return netDuelMeta.challengerId===netSelfId()?0:netDuelMeta.defenderId===netSelfId()?1:-1;}
function netHasDepartment(id){return Object.prototype.hasOwnProperty.call(netDepartments,id)&&deptById.has(netDepartments[id]);}
function netDepartment(id){return deptById.has(netDepartments[id])?netDepartments[id]:'business';}
function netCanReady(id){const picks=netPicks[id];return netHasDepartment(id)&&Array.isArray(picks)&&picks.length===1&&validName(picks[0]);}
function netMembers(){return netRoster.filter(m=>m.consent===true&&m.connected!==false);}
function netCopy(v){return JSON.parse(JSON.stringify(v));}
function netMenu(name){let item=pool.find(x=>x.name===name);if(!item){item={id:'remote_'+rand(10000000),name,category:'내 후보',owner:null,enabledFor:Array(8).fill(true),custom:true};pool.push(item);}return {...item};}
function netSyncRoster(){
 const list=netMembers();PEOPLE=list.map(m=>m.name);if(!PEOPLE.length)PEOPLE=['참가자'];
 active=Math.max(0,list.findIndex(m=>m.id===netSelfId()));
 choices=list.map(m=>(netPicks[m.id]||[]).map(netMenu));if(!choices.length)choices=[[]];
 pool.forEach(x=>{x.enabledFor=Array(8).fill(true);if(x.custom&&x.owner!==null)x.owner=active;});
}
safeRead=function(){try{const v=JSON.parse(localStorage.getItem(KEY)||'null');if(Array.isArray(v?.history))history=v.history.filter(x=>x&&validName(x.menu)&&validName(x.person)&&Number.isFinite(Date.parse(x.time))).slice(0,5);}catch{canStore=false;}};
save=function(){try{localStorage.setItem(KEY,JSON.stringify({version:3,history}));}catch{canStore=false;}};
visibleFor=function(item,p){return item.owner===null||item.owner===p;};
enabled=function(p=active,items=pool){return items.filter(x=>visibleFor(x,p)&&x.enabledFor[p]!==false);};
switchPerson=function(i){if(i!==active)notify('다른 참가자는 자신의 기기에서 메뉴를 골라요.');};
renderSetup=function(){
 netSyncRoster();$('players').replaceChildren();
 netMembers().forEach((m,i)=>{const selected=choices[i]||[],chosen=netHasDepartment(m.id),ready=!!netReady[m.id]&&chosen,b=el('div','player'+(active===i?' active':'')+(selected.length?' chosen':''));b.dataset.index=i%3;b.dataset.characterSelected=String(chosen);b.id='person_'+i;b.setAttribute('aria-label',m.name+(ready?' 준비 완료':chosen?' 메뉴 선택 중':' 캐릭터 선택 대기'));
 const top=el('div','player-top'),person=el('span','person');person.append(el('span','avatar',chosen?m.name[0]:'?'),document.createTextNode(m.name+(m.id===netSelfId()?' · 나':'')));top.append(person,el('span','player-status',ready?'READY ✓':chosen?selected.length+'/1 선택':'캐릭터 선택 대기'));const names=el('strong','nominee'+(selected.length?'':' empty'));if(selected.length)selected.forEach(x=>names.append(el('span','choice-line',x.name)));else names.textContent='메뉴 미정';b.append(top,names,el('span','player-hint',chosen?deptById.get(netDepartments[m.id]).short+' · '+(ready?'출발 대기':'준비 중'):'? 캐릭터 선택 대기'));$('players').append(b);});
 $('menuPanel').setAttribute('aria-label','내 점심 메뉴 선택');$('pickPrompt').textContent=(netMembers()[active]?.name||'내')+' · 내가 걸고 싸울 메뉴 '+(choices[active]?.length||0)+'/1';$('personalAddLabel').textContent='먹고 싶은 메뉴를 직접 추가할 수 있어요.';$('personalMenuInput').setAttribute('aria-label','내 새 후보 메뉴');$('manageBtn').hidden=true;renderMenus();
 const self=netSelfId(),chosen=netHasDepartment(self),ready=!!netReady[self],n=netMembers().length,r=netMembers().filter(m=>netReady[m.id]&&netCanReady(m.id)).length;
 $('startBtn').disabled=!netIsActive()||netPendingPick||!ready&&!netCanReady(self);$('startBtn').textContent=ready?'준비 취소 · 메뉴 다시 고르기':!chosen?'캐릭터를 먼저 골라주세요':'내 메뉴로 준비 완료';$('startBtn').classList.toggle('net-ready',ready);$('dossierStatus').textContent='준비 완료 '+r+'/'+n+(n<2?' · 2명 이상 모이면 출발':'');
 $('netReadyHint').textContent=!chosen?'? 캐릭터를 직접 고른 다음 메뉴를 선택하고 준비해주세요.':n<2?'초대 링크로 친구를 불러주세요. 최소 2명부터 시작해요.':r===n?'전원 준비 완료! 곧 출발합니다.':'모두 캐릭터와 메뉴를 고르고 준비 완료를 누르면 자동으로 시작해요.';
 const sel=$('netDepartment');if(sel){sel.value=chosen?netDepartments[self]:'';sel.disabled=ready;$('netPassiveDesc').textContent=chosen?deptById.get(netDepartments[self]).description:'아직 선택하지 않았어요. ? 버튼에서 내 학과·캐릭터를 직접 골라주세요.';}
 document.querySelectorAll('#menuGrid button,#personalAddForm input,#personalAddForm button').forEach(b=>b.disabled=ready||netPendingPick);
};
choose=function(item){if(!netIsActive()||mode!=='setup')return;if(netReady[netSelfId()]){notify('준비를 취소하면 메뉴를 바꿀 수 있어요.');return;}const list=netPicks[netSelfId()]||[];netRoom.send({t:'pick',name:item.name});};
showSetup=function(){cancelActionDuel();if(typeof deptCancel==='function')deptCancel();cancelAnimationFrame(frame);clearTimeout(duelTimer);race=null;duel=null;mode='setup';$('setupView').hidden=false;$('raceView').hidden=true;$('resultView').hidden=true;$('duelView').hidden=true;setStep(1);renderSetup();playLayout(false);};
function netSnapshot(){return {kind:'room-v3',seq:++netSeq,roster:netCopy(netRoster),picks:netCopy(netPicks),ready:netCopy(netReady),departments:netCopy(netDepartments),phase:netPhase,spec:netSpec&&netCopy(netSpec),result:result&&netCopy(result),duelMeta:netDuelMeta&&netCopy(netDuelMeta),combat:netPhase==='duel'?netGetCombatState():null,racing:netPhase==='race'?deptGetState():null,coffee:coffeeGetState(),tray:trayGetState(),chat:roomChatGetState(),arcade:arcadeGetState(),decision:lunchDecisionGetState(),delivery:deliveryGetState(),award:awardGetState(),finale:lunchFinaleGetState(),brawlRoom:groupGetState(),brawlFight:netPhase==='brawl'?brawlGetState():null};}
function netPublish(){if(netIsHost()&&!netApplying)netRoom.broadcast(netSnapshot());}
function netPublishCombat(force=false){if(!netIsHost()||netApplying||netPhase!=='duel')return;const now=performance.now();if(!force&&now-netLastCombat<50)return;netLastCombat=now;netPublish();}
function netPublishRace(force=false){if(!netIsHost()||netApplying||netPhase!=='race')return;const now=performance.now();if(!force&&now-netLastRace<80)return;netLastRace=now;netPublish();}
function netSendRaceInput(action){if(netPhase==='race')netRoom.send({t:'raceInput',raceId:netSpec?.id,action});}
function netSendCombat(action,held){if(netPhase==='duel'&&netSelfSide()>=0)netRoom.send({t:'combatInput',duelId:netDuelMeta?.id,seq:++netInputSeq,action,held});}
function netReadyToFight(){if(netSelfSide()>=0)netRoom.send({t:'combatReady',duelId:netDuelMeta?.id});}
function netRoundFinished(){if(!netIsHost())return;saveRound();netPublishCombat(true);}
function netBeginRace(){
 if(!netIsHost()||netPhase!=='setup')return;const members=netMembers();if(members.length<2||members.some(m=>!netReady[m.id]||!netCanReady(m.id)))return;
 netPhase='race';netSpec={id:'round_'+Date.now()+'_'+rand(1000000),seed:rand(2147483647),participants:members.map(m=>({id:m.id,name:m.name,menu:netPicks[m.id][rand(netPicks[m.id].length)],department:netDepartment(m.id)})),startAt:Date.now()+3500};netDuelMeta=null;result=null;netRoom.setLocked(true);netEnterRace();netPublish();
}
function netEnterRace(){cancelActionDuel();mode='race';$('setupView').hidden=true;$('raceView').hidden=true;$('resultView').hidden=true;$('duelView').hidden=true;setStep(2);playLayout(true);$('dossierStatus').textContent='전원 준비 완료 · 캠퍼스 레이스';deptStart(netSpec);}
function netRaceFinished(winnerId){
 if(!netIsHost()||netPhase!=='race'||!netSpec)return;const p=netSpec.participants.find(x=>x.id===winnerId);if(!p)return;
 result={id:netSpec.id,menu:p.menu,person:p.name,winnerId:p.id,time:new Date().toISOString(),nominations:netSpec.participants.map(m=>({id:m.id,person:m.name,menus:[...(netPicks[m.id]||[])]})),source:'race',duelCount:0,mission:'함께 고른 점심, 맛있게 먹어요! 주문과 결제는 참가자끼리 진행해주세요.'};groupAutoRace();
}
renderResult=function(){if(typeof deptCancel==='function')deptCancel();netResultLocal();$('winningPerson').textContent='제안자 · '+result.person;$('objectBtn').hidden=result.winnerId===netSelfId();$('againBtn').hidden=!netIsHost();$('againBtn').textContent='다음 점심 · 모두 다시 준비';};
refreshChallengers=function(){const i=netMembers().findIndex(m=>m.id===netSelfId());challengerIndex=i;$('challengerChoices').replaceChildren(el('span','challenger-choice',netMembers()[i]?.name||''));$('duelMenuSelect').replaceChildren();(result?.nominations.find(n=>n.id===netSelfId())?.menus||[]).forEach(name=>{const o=el('option','',name);o.value=name;$('duelMenuSelect').append(o);});$('objectionError').textContent='내 메뉴를 걸고, 현재 우승자에게 직접 도전해요.';};
prepareDuel=function(p,menu){if(netApplying)return netPrepareLocal(p,menu);netRoom.send({t:'challenge',menu});};
function netNewDuel(senderId,menu){
 const challenger=netMembers().find(m=>m.id===senderId),idx=netMembers().findIndex(m=>m.id===senderId);if(!challenger||!result||senderId===result.winnerId||!(netPicks[senderId]||[]).includes(menu)||menu===result.menu)return;
 netDuelMeta={id:'duel_'+Date.now()+'_'+rand(100000),challengerId:senderId,defenderId:result.winnerId,readyIds:[]};netPhase='duel';netApplying=true;try{netPrepareLocal(idx,menu);duel.id=netDuelMeta.id;}finally{netApplying=false;}netInputSeen={};netPublish();
}
function netHandle(senderId,cmd){
 if(!netIsHost()||!cmd||typeof cmd!=='object'||JSON.stringify(cmd).length>3000)return;const member=netMembers().find(m=>m.id===senderId);if(!member)return;if(roomChatHandle(senderId,cmd))return;if(awardHandle(senderId,cmd))return;if(lunchDecisionHandle(senderId,cmd))return;if(deliveryHandle(senderId,cmd))return;if(arcadeHandle(senderId,cmd))return;if(trayHandle(senderId,cmd))return;if(coffeeHandle(senderId,cmd))return;if(groupHandle(senderId,cmd))return;
 if(cmd.t==='pick'&&netPhase==='setup'&&!netReady[senderId]&&validName(cmd.name)){const name=cmd.name.trim().normalize('NFC'),list=netPicks[senderId]||[];const i=list.findIndex(n=>n.toLocaleLowerCase()===name.toLocaleLowerCase());if(i>=0)list.splice(i,1);else list.splice(0,list.length,name);netPicks[senderId]=list;renderSetup();netPublish();return;}
 if(cmd.t==='department'&&netPhase==='setup'&&!netReady[senderId]&&deptOptions.some(d=>d.id===cmd.value)){netDepartments[senderId]=cmd.value;renderSetup();netPublish();return;}
 if(cmd.t==='ready'&&netPhase==='setup'&&typeof cmd.value==='boolean'){if(cmd.value&&!netCanReady(senderId))return;netReady[senderId]=cmd.value;renderSetup();netPublish();netBeginRace();return;}
 if(cmd.t==='reset'&&senderId===netSelfId()&&netPhase==='result'){netPhase='setup';netReady={};netPicks={};netSpec=null;netDuelMeta=null;result=null;netRoom.setLocked(false);showSetup();netPublish();return;}
 if(cmd.t==='raceInput'&&netPhase==='race'&&cmd.raceId===netSpec?.id&&['jump','dash','item','cheer'].includes(cmd.action)){deptHostInput(senderId,cmd.action);return;}
 if(cmd.t==='challenge'&&netPhase==='result'&&typeof cmd.menu==='string'){netNewDuel(senderId,cmd.menu);return;}
 if(netPhase!=='duel'||cmd.duelId!==netDuelMeta?.id)return;
 if(cmd.t==='combatCancel'&&duel?.phase==='done'){netPhase='result';cancelActionDuel();netDuelMeta=null;renderResult();netPublish();return;}
 const side=senderId===netDuelMeta.challengerId?0:senderId===netDuelMeta.defenderId?1:-1;if(side<0)return;
 if(cmd.t==='combatReady'&&['idle','paused'].includes(duel?.phase)){if(!netDuelMeta.readyIds.includes(senderId))netDuelMeta.readyIds.push(senderId);if(netDuelMeta.readyIds.length===2){netDuelMeta.readyIds=[];netStartCombatHost();}netUpdateCombatReady();netPublishCombat(true);return;}
 if(cmd.t==='combatInput'&&Number.isSafeInteger(cmd.seq)&&cmd.seq>(netInputSeen[senderId]||0)){netInputSeen[senderId]=cmd.seq;if(cmd.action==='pause'&&cmd.held===true){netDuelMeta.readyIds=[];actionPause('참가자가 잠시 멈췄어요. 두 사람 모두 다시 준비해주세요.');netPublishCombat(true);return;}netApplyCombatInput(side,cmd);return;}
 if(cmd.t==='combatCancel'&&!['fight','countdown'].includes(duel?.phase)){netPhase='result';cancelActionDuel();netDuelMeta=null;renderResult();netPublish();}
}
function netReceive(s){
 if(netIsHost()||!s||s.kind!=='room-v3'||!Number.isSafeInteger(s.seq)||s.seq<=netLastSeq||!Array.isArray(s.roster))return;netLastSeq=s.seq;
 const oldPhase=netPhase,oldRace=netSpec?.id,oldDuel=netDuelMeta?.id,oldCoffeeResult=result?result.id+'|'+result.time+'|'+result.menu+'|'+result.person+'|'+String(result.provisional):'';netApplying=true;
 try{netRoster=s.roster.filter(m=>m&&typeof m.id==='string'&&typeof m.name==='string'&&m.consent===true).slice(0,8);netPicks=s.picks||{};netReady=s.ready||{};netDepartments=s.departments||{};netPhase=s.phase;netSpec=s.spec;netDuelMeta=s.duelMeta;result=s.result;netSyncRoster();lunchDecisionReceive(s.decision);
 if(netPhase==='setup'){if(oldPhase!=='setup')showSetup();else renderSetup();}
 else if(netPhase==='menuTournament'){netEnterMenuTournament();}
 else if(netPhase==='brawlInvite'||netPhase==='brawl'){groupReceive(s.brawlRoom,s.brawlFight);}
 else if(netPhase==='race'){if(oldPhase!=='race'||oldRace!==netSpec?.id)netEnterRace();if(s.racing)deptReceive(s.racing);}
 else if(netPhase==='result'&&result){if(oldPhase!=='result'||oldCoffeeResult!==result.id+'|'+result.time+'|'+result.menu+'|'+result.person+'|'+String(result.provisional)){saveRound();renderResult();}}
 else if(netPhase==='duel'&&result&&s.combat){if(oldPhase!=='duel'||oldDuel!==netDuelMeta?.id){const idx=netMembers().findIndex(m=>m.id===netDuelMeta.challengerId);netPrepareLocal(idx,s.combat.duel.challengerMenu);duel.id=netDuelMeta.id;}netReceiveCombatState(s.combat);if(duel?.phase==='done')saveRound();}
 if(netPhase==='duel')netUpdateCombatReady();coffeeReceive(s.coffee);trayReceive(s.tray);roomChatReceive(s.chat);arcadeReceive(s.arcade);deliveryReceive(s.delivery);awardReceive(s.award);lunchFinaleReceive(s.finale);
 }finally{netApplying=false;}
}
function netUpdateCombatReady(){if(!netDuelMeta||!duel)return;const ids=netDuelMeta.readyIds||[],self=ids.includes(netSelfId());if(['idle','paused'].includes(duel.phase)){$('duelStartBtn').disabled=self;$('duelStartBtn').textContent=self?'상대방 준비를 기다리는 중…':'내 캐릭터 준비 완료';$('battleOverlaySub').textContent='두 참가자 모두 준비해야 시작해요. 준비 '+ids.length+'/2';}else $('duelStartBtn').disabled=false;}
// Capture old same-device actions before their original listeners execute.
document.addEventListener('click',e=>{const b=e.target?.closest?.('button');if(!b||!netIsActive())return;
 if(b.id==='startBtn'){e.preventDefault();e.stopImmediatePropagation();netRoom.send({t:'ready',value:!netReady[netSelfId()]});}
 if(b.id==='againBtn'){e.preventDefault();e.stopImmediatePropagation();if(netIsHost())netRoom.send({t:'reset'});}
 if(b.id==='objectBtn'){e.preventDefault();e.stopImmediatePropagation();if(netPhase==='result')groupOpenLocalInvite();}
 if(b.id==='duelCancelBtn'){e.preventDefault();e.stopImmediatePropagation();if(duel?.phase==='done'){if(netIsHost()){netPhase='result';netDuelMeta=null;renderResult();netPublish();}else netRoom.send({t:'combatCancel',duelId:netDuelMeta?.id});}else netRoom.send({t:'combatCancel',duelId:netDuelMeta?.id});}
 if(b.id==='duelFinishBtn'){e.preventDefault();e.stopImmediatePropagation();if(duel?.phase==='done'){if(netIsHost()){netPhase='result';netDuelMeta=null;renderResult();netPublish();}else netRoom.send({t:'combatCancel',duelId:netDuelMeta?.id});}}
},true);
document.addEventListener('submit',e=>{if(e.target.id!=='personalAddForm'||!netIsActive())return;e.preventDefault();e.stopImmediatePropagation();if(netReady[netSelfId()])return;const r=addPersonal($('personalMenuInput').value,active);if(r.error){notify(r.error);return;}$('personalMenuInput').value='';category='내 후보';if(!(netPicks[netSelfId()]||[]).includes(r.item.name))netRoom.send({t:'pick',name:r.item.name});else renderSetup();},true);
netRoom.onCommand(netHandle);netRoom.onState(netReceive);
netRoom.onReady(()=>{netLastSeq=-1;netRoster=netRoom.members;netPicks={};netReady={};netDepartments={};netPhase='setup';netSpec=null;netDuelMeta=null;result=null;netSyncRoster();showSetup();if(netIsHost())netPublish();});
netRoom.onPresence((members,event)=>{if(!netIsHost())return;netRoster=members;if(lunchDecisionPresence(event))return;if(arcadePresence(event))return;if(groupPresence(event))return;if(event.kind==='leave'){delete netPicks[event.memberId];delete netReady[event.memberId];delete netDepartments[event.memberId];if(netPhase!=='setup'){netPhase='setup';netReady={};netSpec=null;netDuelMeta=null;result=null;netRoom.setLocked(false);showSetup();notify('참가자가 나가서 이번 판을 멈췄어요. 남은 분들이 다시 준비해주세요.');}}
 if(netPhase==='setup'){netReady={};showSetup();if(event.kind==='join')notify('새 참가자가 들어왔어요. 모두 준비를 다시 확인해주세요.');}netPublish();});
netRoom.onDisconnect(event=>{if(event.self||event.hostLost){deptCancel();cancelActionDuel();netPhase='setup';netRoster=[];netPicks={};netReady={};netDepartments={};netSpec=null;netDuelMeta=null;result=null;mode='setup';}});
// rAF sleeps in background tabs; continue host physics using bounded fixed steps.
setInterval(()=>{if(!netIsHost()||netPhase!=='duel'||!document.hidden||!duel||!['fight','countdown'].includes(duel.phase))return;const now=performance.now();let n=0;while(actionLast+16<now&&n++<90&&['fight','countdown'].includes(duel.phase)){cancelAnimationFrame(actionFrame);actionTick(actionLast+16);}cancelAnimationFrame(actionFrame);actionFrame=0;},80);
document.addEventListener('visibilitychange',()=>{if(netIsHost()&&netPhase==='duel'&&!document.hidden&&duel&&['fight','countdown'].includes(duel.phase)){cancelAnimationFrame(actionFrame);actionLast=performance.now();actionFrame=requestAnimationFrame(actionTick);}});
const netOldPause=actionPause;actionPause=function(reason){if(netIsHost()&&netDuelMeta)netDuelMeta.readyIds=[];const value=netOldPause(reason);if(netIsHost())netUpdateCombatReady();return value;};
const netOldFinish=actionFinish;actionFinish=function(winner,reason){if(netIsHost()&&result&&netDuelMeta&&!duel?.finishLocked)result.winnerId=winner===0?netDuelMeta.challengerId:netDuelMeta.defenderId;netOldFinish(winner,reason);if(netIsHost()&&duel?.finishLocked&&result)netPublishCombat(true);};
startRace=function(){if(netIsActive())netRoom.send({t:'ready',value:!netReady[netSelfId()]});};
$('randomBtn').hidden=true;$('motionBtn').hidden=true;$('manageBtn').hidden=true;
const netSelectWrap=deptPickerCreate();$('players').before(netSelectWrap);const hint=el('p','net-ready-hint');hint.id='netReadyHint';$('startBtn').parentElement.append(hint);
document.querySelectorAll('.hero-desc,.hero-sub,.subtitle').forEach(n=>{if(n.textContent.includes('공나영')||n.textContent.includes('세 사람'))n.textContent='점심 주문에 동의한 참가자들이 함께 고르고, 달리고, 직접 결투해요.';});
$('helpDialog').querySelector('.dialog-body')?.replaceChildren();

/* FUN_CORE_V1 */

/* RACE_ITEMS_V1 */
const deptItemTypes=[
 {id:'turbo',icon:'🚀',name:'불꽃 부스터',short:'부스터',description:'1.25초 동안 속도가 45% 올라가요.'},
 {id:'shield',icon:'🛡️',name:'철벽 도시락',short:'보호막',description:'4초 안에 만나는 장애물 또는 바나나를 1회 막고 짧게 가속해요.'},
 {id:'banana',icon:'🍌',name:'바나나 배달',short:'바나나',description:'가장 가까운 앞 참가자를 0.85초 감속시켜요. 선두라면 짧게 가속해요.'},
 {id:'portal',icon:'🌀',name:'순간 배달',short:'순간이동',description:'즉시 26m 전진해요. 도착 지점의 장애물은 그대로 적용돼요.'}
];
const deptCheerEmojis=['😋','🔥','💪','🍀','🤣'];
const deptItemBaseStart=deptStart,deptItemBaseSimulate=deptSimulate,deptItemBaseHazard=deptHazard,deptItemBaseInput=deptHostInput,deptItemBaseRender=deptRender;
function deptItemType(type){return deptItemTypes.find(item=>item.id===type);}
function deptItemEnsure(lane){
 if(lane.itemAwarded===undefined)Object.assign(lane,{itemType:null,itemAwarded:false,itemUsed:false,itemAwardedAt:null,itemUsedAt:null,itemTurboUntil:0,itemShieldUntil:0,itemShieldSpent:false,itemSlowUntil:0,cheerEmoji:'',cheerUntil:0,cheerReadyAt:0,cheerCount:0});
}
function deptItemPrepare(t){
 if(!deptRace||!deptAuthority())return;
 for(const lane of deptRace.lanes){deptItemEnsure(lane);if(lane.finishedAt!==null)continue;if(!lane.itemAwarded&&lane.distance>=380){lane.itemType=deptItemTypes[Math.min(3,Math.floor(deptHash(deptRace.seed+':item:'+lane.id)*4))].id;lane.itemAwarded=true;lane.itemAwardedAt=t;const item=deptItemType(lane.itemType);deptNotice(lane,'🎁 '+item.name+' 획득!',t);}}
 if(!deptRace.fever&&deptRace.lanes.some(lane=>lane.distance>=deptCourseLength-250)){deptRace.fever=true;deptRace.feverStartedAt=t;}
}
function deptItemVelocity(lane,t){
 let multiplier=deptRace?.fever?1.08:1;
 if(t<(lane.itemTurboUntil||0))multiplier*=lane.itemType==='shield'?1.2:1.45;
 if(t<(lane.itemSlowUntil||0))multiplier*=.6;
 return multiplier;
}
function deptApplyItem(lane,t){
 if(!deptAuthority()||!deptRace||deptRace.phase!=='running'||!lane||!deptRace.lanes.includes(lane)||lane.finishedAt!==null)return false;
 deptItemEnsure(lane);const item=deptItemType(lane.itemType);if(!lane.itemAwarded||lane.itemUsed||!item)return false;
 lane.itemUsed=true;lane.itemUsedAt=t;
 if(item.id==='turbo'){lane.itemTurboUntil=t+1.25;deptNotice(lane,'🚀 불꽃 부스터 발사!',t);}
 else if(item.id==='shield'){lane.itemShieldUntil=t+4;lane.itemShieldSpent=false;lane.itemTurboUntil=t+.5;deptNotice(lane,'🛡️ 철벽 도시락! 4초 방어',t);}
 else if(item.id==='banana'){
  const target=deptRace.lanes.filter(other=>other.id!==lane.id&&other.finishedAt===null&&other.distance>lane.distance).sort((a,b)=>a.distance-b.distance||a.index-b.index)[0];
  if(target){deptItemEnsure(target);if(t<target.itemShieldUntil&&!target.itemShieldSpent){target.itemShieldSpent=true;target.itemShieldUntil=0;deptNotice(target,'🛡️ 바나나를 막았어요!',t);deptNotice(lane,'🍌 앗! 보호막에 막혔어요',t);}else{target.itemSlowUntil=Math.max(target.itemSlowUntil,t+.85);deptNotice(target,'🍌 바나나 배달! 잠깐 감속',t);deptNotice(lane,'🍌 '+target.name+' 님에게 배달!',t);}}
  else{lane.itemTurboUntil=t+.6;deptNotice(lane,'🍌 선두 보너스! 미니 부스트',t);}
 }
 else if(item.id==='portal'){
  lane.distance=Math.min(deptCourseLength,lane.distance+26);deptNotice(lane,'🌀 순간 배달 +26m!',t);
  while(lane.nextObstacle<deptRace.obstacles.length&&lane.distance>=deptRace.obstacles[lane.nextObstacle].at){const gate=deptRace.obstacles[lane.nextObstacle++];deptGate(lane,gate,t);lane.distance=Math.min(deptCourseLength,lane.distance);}
  if(lane.distance>=deptCourseLength)deptFinish(lane,t);
 }
 return true;
}
deptStart=function(spec){const started=deptItemBaseStart(spec);if(started&&deptRace&&deptAuthority()){for(const lane of deptRace.lanes)deptItemEnsure(lane);deptRace.fever??=false;deptRace.feverStartedAt??=null;}if(started)deptItemUI();return started;};
deptSimulate=function(dt,t){deptItemPrepare(t);return deptItemBaseSimulate(dt,t);};
deptHazard=function(lane,gate,t){
 const alreadyAvoided=(t<lane.jumpUntil&&gate.type!=='wind')||(t<lane.dashUntil&&gate.type==='wind');
 if(!alreadyAvoided&&t<(lane.itemShieldUntil||0)&&!lane.itemShieldSpent){lane.itemShieldSpent=true;lane.itemShieldUntil=0;deptNotice(lane,'🛡️ '+gate.label+' 방어 성공!',t);return;}
 return deptItemBaseHazard(lane,gate,t);
};
deptHostInput=function(senderId,action){
 if(!['item','cheer'].includes(action))return deptItemBaseInput(senderId,action);
 if(!deptRace||!deptAuthority()||deptRace.phase!=='running'||Date.now()<deptRace.startAt)return false;
 deptHostTick();if(!deptRace||deptRace.phase!=='running')return false;const lane=deptRace.lanes.find(player=>player.id===senderId);if(!lane||lane.finishedAt!==null)return false;deptItemEnsure(lane);const t=deptRace.elapsed;
 if(action==='item'){if(!deptApplyItem(lane,t))return false;}
 else{if(t<lane.cheerReadyAt)return false;lane.cheerCount++;lane.cheerEmoji=deptCheerEmojis[Math.min(4,Math.floor(deptHash(deptRace.seed+':cheer:'+lane.id+':'+lane.cheerCount)*5))];lane.cheerUntil=t+1.5;lane.cheerReadyAt=t+3;}
 deptRace.seq++;if(typeof netPublishRace==='function')netPublishRace(true);return true;
};
function deptItemUI(){
 if(!deptView)return;const controls=deptView.querySelector('.dept-controls');if(!controls)return;
 if(!deptView.querySelector('#deptItem')){const item=deptMake('button','dept-input dept-item-button');item.id='deptItem';item.type='button';item.dataset.action='item';item.innerHTML='<span>🎁 아이템</span><small>E · 380m에서 획득</small>';item.addEventListener('click',()=>deptInput('item'));controls.append(item);const cheer=deptMake('button','dept-input');cheer.id='deptCheer';cheer.type='button';cheer.dataset.action='cheer';cheer.innerHTML='<span>😋 응원</span><small>R · 이모지 보내기</small>';cheer.addEventListener('click',()=>deptInput('cheer'));controls.append(cheer);}
 if(!deptView.querySelector('#deptFeverBanner')){const banner=deptMake('div','dept-fever-banner');banner.id='deptFeverBanner';banner.hidden=true;banner.setAttribute('aria-live','polite');banner.append(deptMake('strong','','🔥 FINAL 250m · 전원 피버!'),deptMake('small','','ALL RACERS +8%'));deptView.querySelector('.dept-arena').before(banner);}
}
function deptItemRender(){
 if(!deptRace||!deptView||deptView.hidden)return;deptItemUI();const r=deptRace,t=r.phase==='running'?r.elapsed+(deptAuthority()?0:Math.min(.7,Math.max(0,(performance.now()-deptRemoteAt)/1000))):r.elapsed,own=r.lanes.find(lane=>lane.id===deptOwnId()),running=r.phase==='running',fever=!!r.fever&&running;
 deptView.dataset.fever=String(fever);const banner=deptView.querySelector('#deptFeverBanner');if(banner)banner.hidden=!fever;
 if(fever){const leader=[...r.lanes].sort((a,b)=>b.distance-a.distance)[0],left=Math.max(0,Math.ceil(deptCourseLength-(leader?.distance||0)));deptText(banner?.querySelector('strong'),'🔥 LAST '+left+'m · 전원 피버!');const busy=r.lanes.some(lane=>lane.effect&&t<lane.effectUntil);if(!busy)deptText(deptView.querySelector('#deptAnnouncement'),'🔥 마지막 250m! 모두 8% 가속! 아이템과 대시로 결승선을 잡으세요.');}
 for(const lane of r.lanes){const nodes=deptRows.get(lane.id);if(!nodes)continue;let token=nodes.row.querySelector('.dept-item-token');if(!token){token=deptMake('span','dept-item-token');nodes.row.querySelector('.dept-info').append(token);}const item=deptItemType(lane.itemType);token.hidden=!lane.itemAwarded;token.dataset.used=String(!!lane.itemUsed);token.title=item?.description||'';deptText(token,item?item.icon+' '+item.short+(lane.itemUsed?' 사용 완료':' 준비'):'');nodes.row.classList.toggle('dept-item-pop',!!lane.itemAwarded&&t-lane.itemAwardedAt<.55);nodes.runner.dataset.shield=String(t<(lane.itemShieldUntil||0)&&!lane.itemShieldSpent);nodes.runner.dataset.turbo=String(t<(lane.itemTurboUntil||0));nodes.runner.dataset.slow=String(t<(lane.itemSlowUntil||0));let reaction=nodes.runner.querySelector('.dept-reaction');if(!reaction){reaction=deptMake('span','dept-reaction');reaction.setAttribute('aria-hidden','true');nodes.runner.append(reaction);}reaction.hidden=!(running&&lane.cheerEmoji&&t<(lane.cheerUntil||0));if(!reaction.hidden&&reaction.dataset.count!==String(lane.cheerCount)){reaction.dataset.count=String(lane.cheerCount);deptText(reaction,lane.cheerEmoji);reaction.style.animation='none';void reaction.offsetWidth;reaction.style.animation='';}}
 const itemButton=deptView.querySelector('#deptItem'),item=deptItemType(own?.itemType);if(itemButton){itemButton.disabled=!running||!own||own.finishedAt!==null||!own.itemAwarded||own.itemUsed;itemButton.title=item?.description||'380m를 지나면 랜덤 아이템을 1개 받아요.';itemButton.setAttribute('aria-label',item?item.name+' 사용: '+item.description:'랜덤 아이템, 380m에서 획득');deptText(itemButton.querySelector('span'),item?item.icon+' '+item.short:'🎁 아이템');deptText(itemButton.querySelector('small'),!own?'관전 중':!own.itemAwarded?'380m에서 획득':own.itemUsed?'사용 완료':'E · 지금 사용');}
 const cheerButton=deptView.querySelector('#deptCheer'),cool=Math.max(0,(own?.cheerReadyAt||0)-t);if(cheerButton){cheerButton.disabled=!running||!own||own.finishedAt!==null||cool>.03;deptText(cheerButton.querySelector('small'),!own?'관전 중':cool>.03?cool.toFixed(1)+'초 후 응원':'R · 이모지 보내기');}
 if(own)deptText(deptView.querySelector('#deptControlHint'),'Space 점프 · Shift 대시 · E 아이템 · R 응원');
}
deptRender=function(){deptItemBaseRender();deptItemRender();};
window.addEventListener('keydown',event=>{if(!deptRace||deptView?.hidden||!['KeyE','KeyR'].includes(event.code)||/INPUT|TEXTAREA|SELECT/.test(event.target?.tagName)||event.target?.isContentEditable)return;event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)deptInput(event.code==='KeyE'?'item':'cheer');},true);


/* DEPT_SMOOTH_RENDER_V1 */
let deptSmoothState=null,deptSmoothDt=1/60,deptSmoothDirty=true;
const deptSmoothWidths=new Map();
function deptSmoothReset(){deptSmoothState=null;deptSmoothWidths.clear();deptSmoothDirty=true;}
function deptSmoothFrame(){
 const r=deptRace,now=performance.now();if(!r)return 0;
 if(!deptSmoothState||deptSmoothState.id!==r.id){deptSmoothState={id:r.id,phase:r.phase,observed:r.elapsed,observedAt:now,last:now,time:r.elapsed,views:new Map(),predictions:new Map(),snap:false};}
 const s=deptSmoothState,gap=(now-s.last)/1000;deptSmoothDt=Math.max(0,Math.min(.05,gap));s.last=now;s.snap=gap>.25;
 if(r.elapsed!==s.observed||r.phase!==s.phase){s.observed=r.elapsed;s.observedAt=now;s.phase=r.phase;}
 if(r.phase==='running'){
  const target=r.elapsed+Math.min(.15,Math.max(0,(now-s.observedAt)/1000));
  if(s.snap||Math.abs(target-s.time)>.55)s.time=r.elapsed;
  else s.time+=deptSmoothDt*Math.max(.72,Math.min(1.22,1+(target-s.time)*3.5));
  s.time=Math.max(r.elapsed-.12,Math.min(r.elapsed+.18,s.time));
 }else s.time=r.phase==='finished'?(r.finishedAt??r.elapsed):r.elapsed;
 return s.time;
}
function deptSmoothDistance(lane,t){
 const s=deptSmoothState,r=deptRace;if(!s||!r)return lane.distance;
 let view=s.views.get(lane.id);if(!view){view={distance:lane.distance};s.views.set(lane.id,view);}
 const running=r.phase==='running'&&lane.finishedAt===null;
 const target=Math.min(running?deptCourseLength-1.5:deptCourseLength,lane.distance+(running?lane.speed*Math.max(0,Math.min(.15,t-r.elapsed)):0));
 if(s.snap||lane.finishedAt!==null)view.distance=lane.distance;
 else{const next=view.distance+(target-view.distance)*(1-Math.exp(-24*deptSmoothDt));view.distance=r.phase==='running'?Math.max(view.distance,next):next;}
 return Math.max(0,Math.min(deptCourseLength,view.distance));
}
function deptSmoothJumpY(lane,t){
 const p=deptSmoothState?.predictions.get(lane.id),now=performance.now();
 if(p&&lane.id===deptOwnId()&&p.jumpAt!==undefined){const u=Math.max(0,Math.min(1,(now-p.jumpAt)/830));return -Math.sin(u*Math.PI)*36;}
 return t<lane.jumpUntil?-Math.sin(Math.max(0,Math.min(1,1-(lane.jumpUntil-t)/.83))*Math.PI)*36:0;
}
function deptSmoothDash(lane,t){const p=deptSmoothState?.predictions.get(lane.id);return t<lane.dashUntil||t<lane.boostUntil||!!(p&&lane.id===deptOwnId()&&performance.now()<p.dashAt+720);}
function deptSmoothPredict(action){
 const r=deptRace,own=r?.lanes.find(l=>l.id===deptOwnId());if(!r||r.phase!=='running'||!own||own.finishedAt!==null)return false;
 const t=deptSmoothFrame(),now=performance.now(),s=deptSmoothState,p=s.predictions.get(own.id)||{};
 if(action==='jump'){if(t<own.jumpReadyAt-.025||now<(p.jumpReadyAt||0))return false;p.jumpAt=now;p.jumpReadyAt=now+1420;}
 else if(action==='dash'){if(t<own.dashReadyAt-.025||now<(p.dashReadyAt||0))return false;p.dashAt=now;p.dashReadyAt=now+4100;}
 else return true;s.predictions.set(own.id,p);return true;
}
function deptSmoothUntil(){
 const r=deptRace,s=deptSmoothState,now=performance.now();if(!r||r.phase!=='countdown')return 0;
 if(deptAuthority()||!Number.isFinite(r.sentAt)||!s)return (r.startAt-Date.now())/1000;
 if(s.countSent!==r.sentAt){s.countSent=r.sentAt;s.countDeadline=now+Math.max(0,r.startAt-r.sentAt);}
 return Math.max(0,(s.countDeadline-now)/1000);
}
function deptSmoothMeasure(){
 if(!deptSmoothDirty)return;
 // Read every track before any animation style is written. Resize only invalidates this cache.
 for(const [id,n]of deptRows)deptSmoothWidths.set(id,n.track.clientWidth||1);
 deptSmoothDirty=false;
}
function deptSmoothPlace(nodes,lane,d,t){
 const width=deptSmoothWidths.get(lane.id)||1,x=Math.max(12,Math.min(width-12,width*d/deptCourseLength));
 nodes.runner.style.transform='translate3d('+x.toFixed(2)+'px,'+deptSmoothJumpY(lane,t).toFixed(2)+'px,0)';
 nodes.progress.style.transform='scaleX('+Math.max(0,Math.min(1,d/deptCourseLength)).toFixed(5)+')';
}
function deptSmoothControls(){
 if(!deptRace||!deptView||deptView.hidden)return;const p=deptSmoothState?.predictions.get(deptOwnId());if(!p)return;
 const now=performance.now();for(const action of ['jump','dash']){const remaining=((p[action+'ReadyAt']||0)-now)/1000,button=deptView.querySelector(action==='jump'?'#deptJump':'#deptDash');if(button&&remaining>.03&&deptRace.phase==='running'){button.disabled=true;deptText(button.querySelector('small'),remaining.toFixed(1)+'초 후 준비');}}
}
const deptSmoothBaseBuild=deptBuildLanes;deptBuildLanes=function(){deptSmoothBaseBuild();deptSmoothDirty=true;for(const n of deptRows.values()){n.runner.style.left='0px';n.progress.style.width='100%';}};
const deptSmoothBaseCancel=deptCancel;deptCancel=function(){deptSmoothReset();return deptSmoothBaseCancel();};
const deptSmoothBaseInput=deptInput;deptInput=function(action){if(['jump','dash'].includes(action)&&!deptSmoothPredict(action))return;return deptSmoothBaseInput(action);};
const deptSmoothBaseRender=deptRender;deptRender=function(){deptSmoothBaseRender();deptSmoothControls();};
window.addEventListener('resize',()=>{deptSmoothDirty=true;},{passive:true});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){deptSmoothDirty=true;if(deptSmoothState)deptSmoothState.last=performance.now()-300;}});
// Activate touch controls on contact rather than waiting for finger release.
const deptSmoothPointerClicks=new WeakMap();
document.addEventListener('pointerdown',event=>{const button=event.target?.closest?.('#deptJump,#deptDash');if(!button||button.disabled||(event.pointerType==='mouse'&&event.button!==0)||deptView?.hidden)return;event.preventDefault();event.stopImmediatePropagation();deptSmoothPointerClicks.set(button,performance.now()+900);deptInput(button.id==='deptJump'?'jump':'dash');},true);
document.addEventListener('click',event=>{const button=event.target?.closest?.('#deptJump,#deptDash');if(button&&event.detail!==0&&performance.now()<(deptSmoothPointerClicks.get(button)||0)){event.preventDefault();event.stopImmediatePropagation();}},true);




/* COFFEE_HOT_POTATO_V2 */
/* COFFEE_HIDDEN_FUSE_V3 */
let coffeeState=null,coffeeDialog=null,coffeeDemo=false,coffeeDemoNext=0,coffeeOffset=0,coffeeDeadline=0;
function coffeeClone(v){return v?JSON.parse(JSON.stringify(v)):null;}
function coffeeHost(){return coffeeDemo||netIsHost();}
function coffeeSelf(){return coffeeDemo?'coffee-you':netSelfId();}
function coffeeMember(){return coffeeState?.members.find(m=>m.id===coffeeSelf());}
function coffeeElement(tag,cls,text){return el(tag,cls,text);}
function coffeePublicState(s){return coffeeClone({id:s.id,roundId:s.roundId,phase:s.phase,createdAt:s.createdAt,notice:s.notice,members:s.members,holderId:s.holderId,previousHolderId:s.previousHolderId,startAt:s.startAt,passReadyAt:s.passReadyAt,passes:s.passes,loserId:s.loserId});}
function coffeeGetState(){return !coffeeDemo&&netIsActive()&&netPhase==='result'&&coffeeState?{...coffeePublicState(coffeeState),serverNow:Date.now()}:null;}
function coffeePublish(){coffeeRender();if(!coffeeDemo&&netIsHost())netPublish();}
function coffeeSend(cmd){if(coffeeDemo)coffeeHandle(coffeeSelf(),cmd);else netRoom.send(cmd);}
function coffeeCancel(){coffeeState=null;coffeeOffset=0;coffeeDeadline=0;if(coffeeDialog?.open)coffeeDialog.close();coffeeDemo=false;coffeeUpdateButton();}
function coffeeMakeInvite(notice=''){coffeeDeadline=0;coffeeState={id:'cup_'+Date.now()+'_'+rand(100000),roundId:result?.id,phase:'invite',createdAt:Date.now(),notice,members:netMembers().map(m=>({id:m.id,name:m.name,response:'pending'})),holderId:'',previousHolderId:'',startAt:0,passReadyAt:0,passes:0,loserId:''};}
function coffeeMatchIfReady(){if(!coffeeHost()||coffeeState?.phase!=='invite'||coffeeState.members.some(m=>m.response==='pending'))return;const joined=coffeeState.members.filter(m=>m.response==='join');if(joined.length<2)return;const now=Date.now();coffeeState.phase='play';coffeeState.holderId=joined[rand(joined.length)].id;coffeeState.startAt=now+2400;coffeeDeadline=coffeeState.startAt+6000+rand(20001);coffeeState.passReadyAt=coffeeState.startAt;coffeeState.notice='컵이 터지는 순간 들고 있으면 커피 당첨!';coffeePublish();}
function coffeeMembersChanged(){if(!netIsHost()||!coffeeState||netPhase!=='result')return false;const now=netMembers();if(now.length===coffeeState.members.length&&now.every(m=>coffeeState.members.some(x=>x.id===m.id)))return true;if(now.length<2){coffeeCancel();return false;}coffeeMakeInvite('참가자가 바뀌어 컵을 새로 준비했어요. 참가 여부를 다시 골라주세요.');coffeePublish();return true;}
function coffeeHandle(senderId,cmd){
 if(typeof cmd.t!=='string'||!cmd.t.startsWith('coffee'))return false;
 if(!coffeeHost()||!coffeeDemo&&(netPhase!=='result'||!result||!netMembers().some(m=>m.id===senderId)))return true;
 if(cmd.t==='coffeeInvite'){if(!coffeeState||coffeeState.phase==='done')coffeeMakeInvite();coffeePublish();return true;}
 if(!coffeeState||cmd.eventId!==coffeeState.id)return true;const s=coffeeState,m=s.members.find(x=>x.id===senderId);if(!m)return true;
 if(cmd.t==='coffeeRespond'&&s.phase==='invite'&&['join','pass'].includes(cmd.response)){m.response=cmd.response;coffeePublish();coffeeMatchIfReady();return true;}
 if(cmd.t==='coffeeThrow'&&s.phase==='play'){
  const now=Date.now(),target=s.members.find(x=>x.id===cmd.targetId&&x.response==='join'&&x.id!==senderId);
  if(senderId!==s.holderId||m.response!=='join'||!target||now<s.startAt||now>=coffeeDeadline||now<s.passReadyAt)return true;
  const joined=s.members.filter(x=>x.response==='join');if(joined.length>2&&target.id===s.previousHolderId)return true;
  s.previousHolderId=senderId;s.holderId=target.id;s.passReadyAt=now+780;s.passes++;s.notice=m.name+' → '+target.name+'  뜨거운 컵 배달';if(coffeeDemo)coffeeDemoNext=now+1000+rand(350);coffeePublish();return true;
 }
 if(cmd.t==='coffeeCancel'&&senderId===coffeeSelf()){coffeeCancel();if(netIsHost())netPublish();return true;}
 return true;
}
function coffeeReceive(data){if(coffeeDemo||netIsHost())return;if(!data){if(coffeeState)coffeeCancel();return;}if(netPhase!=='result'||typeof data.id!=='string'||!['invite','play','done'].includes(data.phase)||!Array.isArray(data.members)||data.members.length<1||data.members.length>8)return;if(data.members.some(m=>!m||typeof m.id!=='string'||typeof m.name!=='string'||!['pending','join','pass'].includes(m.response)))return;if(['play','done'].includes(data.phase)&&(!Number.isFinite(data.startAt)||!Number.isFinite(data.passReadyAt)||!data.members.some(m=>m.id===data.holderId&&m.response==='join')))return;const fresh=coffeeState?.id!==data.id;coffeeState=coffeePublicState(data);coffeeOffset=Number.isFinite(data.serverNow)?data.serverNow-Date.now():0;coffeeRender();if(fresh)coffeeOpen();}
function coffeeEnsureUI(){
 if(coffeeDialog)return;coffeeDialog=el('dialog','cup-dialog');coffeeDialog.id='coffeeEventDialog';coffeeDialog.setAttribute('aria-labelledby','coffeeTitle');coffeeDialog.innerHTML='<div class="cup-head"><div><span>식후 랜덤 폭탄 게임</span><h2 id="coffeeTitle">커피는 네가 ☕</h2></div><button type="button" id="coffeeCloseBtn" class="tiny-btn" aria-label="커피 게임 닫기">닫기</button></div><div class="cup-body"><p class="cup-intro">컵이 터질 때 들고 있는 사람, 오늘의 커피 담당.<br>내 차례면 <b>던질 사람을 눌러요.</b> 3명 이상이면 방금 준 사람에게 반송 불가!</p><section id="coffeeSetup"><div class="cup-join-actions"><button id="coffeeJoinBtn" class="btn primary" type="button">콜. 참가하기</button><button id="coffeePassBtn" class="btn" type="button">난 구경</button></div></section><div id="coffeeCupStage" class="cup-stage"><div id="coffeeCup" class="cup-art">☕<span id="coffeeCupFace">ㅡ_ㅡ</span></div><strong id="coffeeCupCaption">뜨거운 컵 준비 중</strong><span id="coffeeCupHint">언제 터질지는 아무도 몰라요.</span></div><div id="coffeeTargets" class="cup-targets"></div><p id="coffeeError" class="cup-notice" role="status" aria-live="polite"></p><div class="cup-foot"><span>실제 주문·결제는 자동 진행하지 않아요.</span><button id="coffeeAgainBtn" class="tiny-btn" type="button" hidden>한 번 더</button><button id="coffeeCancelBtn" class="tiny-btn" type="button">게임 접기</button></div></div>';
 document.body.append(coffeeDialog);$('coffeeCloseBtn').addEventListener('click',()=>{if(coffeeDemo)coffeeCancel();else coffeeDialog.close();});coffeeDialog.addEventListener('cancel',()=>{if(coffeeDemo){coffeeState=null;coffeeDemo=false;}});$('coffeeJoinBtn').addEventListener('click',()=>coffeeSend({t:'coffeeRespond',eventId:coffeeState?.id,response:'join'}));$('coffeePassBtn').addEventListener('click',()=>coffeeSend({t:'coffeeRespond',eventId:coffeeState?.id,response:'pass'}));$('coffeeCancelBtn').addEventListener('click',()=>coffeeSend({t:'coffeeCancel',eventId:coffeeState?.id}));$('coffeeAgainBtn').addEventListener('click',()=>{if(coffeeDemo)coffeeDemoStart();else coffeeSend({t:'coffeeInvite'});});
 $('coffeeTargets').addEventListener('click',e=>{const b=e.target.closest('[data-cup-target]');if(b&&!b.disabled)coffeeSend({t:'coffeeThrow',eventId:coffeeState?.id,targetId:b.dataset.cupTarget});});
}
function coffeeUpdateButton(){let b=$('coffeeEventBtn');if(!b&&$('resultView')){b=el('button','btn coffee-result-button','커피 폭탄 돌리기 ☕');b.type='button';b.id='coffeeEventBtn';$('againBtn').parentElement.append(b);b.addEventListener('click',()=>{if(!coffeeState)coffeeSend({t:'coffeeInvite'});coffeeOpen();});}if(b){b.hidden=!netIsActive()||netPhase!=='result';b.textContent=coffeeState?.phase==='play'?'커피 폭탄 진행 중 ☕':'커피 폭탄 돌리기 ☕';}}
function coffeeOpen(){coffeeEnsureUI();if(!coffeeState)return;if(!coffeeDialog.open)coffeeDialog.showModal();coffeeRender();}
function coffeeRender(){
 coffeeUpdateButton();if(!coffeeState)return;coffeeEnsureUI();const s=coffeeState,now=Date.now()+coffeeOffset,own=coffeeMember(),holder=s.members.find(m=>m.id===s.holderId),joined=s.members.filter(m=>m.response==='join'),mine=s.holderId===coffeeSelf(),playing=s.phase==='play',started=now>=s.startAt;
 $('coffeeSetup').hidden=s.phase!=='invite';$('coffeeCancelBtn').hidden=!coffeeHost();$('coffeeAgainBtn').hidden=s.phase!=='done'||!coffeeHost();$('coffeeJoinBtn').textContent=own?.response==='join'?'참가 완료 ✓':'콜. 참가하기';$('coffeePassBtn').textContent=own?.response==='pass'?'관전 중':'난 구경';
 const stage=$('coffeeCupStage');stage.dataset.hot=String(playing&&mine);stage.dataset.exploded=String(s.phase==='done');
 $('coffeeCupCaption').textContent=s.phase==='invite'?'커피 한 잔에 목숨 거는 중':s.phase==='done'?(s.members.find(m=>m.id===s.loserId)?.name||'')+' 님 커피 당첨 ㅋㅋ':!started?Math.max(1,Math.ceil((s.startAt-now)/1000))+'초 후 컵 배달':mine?'네 컵이다. 빨리 던져!':holder?.name+' 님이 컵 들고 있음';
 $('coffeeCupFace').textContent=s.phase==='done'?'X﹏X':mine?'⊙_⊙':'ㅡ_ㅡ';
 $('coffeeCupHint').textContent=s.phase==='invite'?'참가 또는 관전을 골라요 · 최소 2명':s.phase==='done'?'컵 터짐. 오늘의 커피 담당 결정.':!started?'손가락 풀고 기다려요':'언제 터질지는 아무도 몰라요.';
 const roster=$('coffeeTargets');if(roster.dataset.event!==s.id){roster.dataset.event=s.id;roster.replaceChildren();for(const [i,m] of s.members.entries()){const b=el('button','cup-person');b.type='button';b.dataset.cupTarget=m.id;b.innerHTML=deptAvatarSvg(deptOptions[i%deptOptions.length].id);b.append(el('strong','',m.name+(m.id===coffeeSelf()?' · 나':'')),el('small'));roster.append(b);}}
 for(const b of roster.children){const m=s.members.find(x=>x.id===b.dataset.cupTarget),blocked=joined.length>2&&m.id===s.previousHolderId;b.classList.toggle('is-holder',playing&&m.id===s.holderId);b.classList.toggle('is-out',m.response==='pass');b.disabled=!playing||!started||!mine||now<s.passReadyAt||m.response!=='join'||m.id===coffeeSelf()||blocked;b.querySelector('small').textContent=s.phase==='invite'?{join:'준비 완료',pass:'관전',pending:'고르는 중'}[m.response]:m.response==='pass'?'관전':m.id===s.loserId?'당첨 ☕':s.phase==='done'?'생존':m.id===s.holderId&&playing?'☕ 뜨거운 컵':blocked&&mine?'반송 금지':mine&&m.id!==coffeeSelf()?'여기로 던져':'생존 중';}
 $('coffeeError').textContent=s.phase==='invite'?(s.members.some(m=>m.response==='pending')?'모두 참가 또는 관전을 고르면 출발!':joined.length<2?'둘 이상이어야 컵을 돌려요.':s.notice):s.notice;
}
function coffeeTick(){if(!coffeeState)return;if(!coffeeDemo&&(!netIsActive()||netPhase!=='result'||!result||result.id!==coffeeState.roundId)){coffeeCancel();return;}if(coffeeHost()&&coffeeState.phase==='play'){const s=coffeeState,now=Date.now();if(now>=coffeeDeadline){s.phase='done';s.loserId=s.holderId;s.notice='총 '+s.passes+'번 돌린 컵의 최종 목적지. 축하... 드립니다 ☕';coffeePublish();beep(150,.2);return;}if(coffeeDemo&&s.holderId!==coffeeSelf()&&now>=Math.max(s.startAt,s.passReadyAt,coffeeDemoNext)){const targets=s.members.filter(m=>m.response==='join'&&m.id!==s.holderId&&(s.members.filter(x=>x.response==='join').length<3||m.id!==s.previousHolderId));const target=targets[rand(targets.length)];if(target)coffeeHandle(s.holderId,{t:'coffeeThrow',eventId:s.id,targetId:target.id});coffeeDemoNext=now+1100+rand(400);}}if(coffeeDialog?.open)coffeeRender();}
function coffeeDemoStart(){if(netIsActive())return;coffeeDemo=true;coffeeOffset=0;coffeeDemoNext=Date.now()+2500;coffeeState={id:'cup-demo-'+Date.now(),phase:'invite',createdAt:Date.now(),notice:'컴퓨터와 돌려보는 연습이에요.',members:[{id:'coffee-you',name:'나',response:'join'},{id:'coffee-a',name:'밥줘',response:'join'},{id:'coffee-b',name:'숟가락',response:'join'}],holderId:'',previousHolderId:'',startAt:0,passReadyAt:0,passes:0,loserId:''};coffeeMatchIfReady();coffeeState.holderId='coffee-you';coffeeOpen();}
const coffeePreviousRenderResult=renderResult;renderResult=function(){const out=coffeePreviousRenderResult();coffeeUpdateButton();return out;};
netRoom.onDisconnect(event=>{if(event.self||event.hostLost)coffeeCancel();});
setInterval(coffeeTick,100);setInterval(()=>{if(!coffeeDemo&&netIsHost()&&coffeeState)coffeeMembersChanged();},500);

/* VICTORY_IMPACT_V1 */
const vfxSeen=new Set();let vfxLastDetail=null,vfxLayer=null,vfxCleanup=0,vfxImpactCleanup=0,vfxFocusCleanup=0;
const vfxOriginalRaceRender=deptRender,vfxOriginalCombatRender=actionRender,vfxOriginalResultRender=renderResult;
function vfxReduced(){return typeof reduced==='boolean'?reduced:!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;}
function vfxMake(tag,cls,text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;}
function vfxHash(text){let h=2166136261;for(const ch of String(text)){h^=ch.codePointAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function vfxNoise(seed,i){return (vfxHash(seed+':'+i)%10000)/10000;}
function vfxFood(menu){if(typeof deptFood==='function')return deptFood(menu);if(typeof actionFood==='function')return actionFood(menu);return '🍽️';}
function vfxFanfare(){
 if(typeof sound!=='undefined'&&!sound)return;
 if(typeof beep!=='function')return;
 [[523,0,.08],[659,95,.09],[784,190,.1],[1047,320,.24],[659,320,.22],[784,320,.22]].forEach(([note,delay,duration])=>setTimeout(()=>beep(note,duration),delay));
}
function vfxImpactStage(kind,still){
 const stage=kind==='duel'?$('battleStage'):(typeof deptView!=='undefined'?deptView:null);
 if(!stage)return;
 clearTimeout(vfxImpactCleanup);document.querySelectorAll('.vfx-stage-impact').forEach(n=>n.classList.remove('vfx-stage-impact'));
 if(still)return;stage.classList.remove('vfx-stage-impact');void stage.offsetWidth;stage.classList.add('vfx-stage-impact');
 vfxImpactCleanup=setTimeout(()=>stage.classList.remove('vfx-stage-impact'),780);
}
function vfxCelebrate(detail){
 if(!detail||typeof detail.id!=='string'||!detail.id||!['race','duel','tournament'].includes(detail.kind)||!detail.name||!detail.menu)return false;
 const id=detail.id.slice(0,180);if(!detail.force&&vfxSeen.has(id))return false;
 if(!detail.force){vfxSeen.add(id);if(vfxSeen.size>64)vfxSeen.delete(vfxSeen.values().next().value);}
 const clean={id,kind:detail.kind,name:String(detail.name).slice(0,60),menu:String(detail.menu).slice(0,80),reason:String(detail.reason||'').slice(0,100)};
 vfxLastDetail=clean;clearTimeout(vfxCleanup);clearTimeout(vfxFocusCleanup);if(vfxLayer)vfxLayer.remove();
 const still=vfxReduced(),layer=vfxMake('div','vfx-victory vfx-'+clean.kind+(still?' vfx-reduced':''));vfxLayer=layer;
 layer.setAttribute('aria-hidden','true');layer.dataset.victoryId=id;
 const shade=vfxMake('div','vfx-shade'),flash=vfxMake('div','vfx-one-flash'),rays=vfxMake('div','vfx-rays'),ring=vfxMake('div','vfx-shock-ring');
 const poster=vfxMake('div','vfx-poster');
 poster.append(vfxMake('span','vfx-eyebrow',clean.kind==='tournament'?'RANDOM LUNCH · CHAMPION':clean.kind==='duel'?'FOOD FIGHT · VICTORY':'LUNCH GRAND PRIX · FINISH'));
 const title=vfxMake('strong','vfx-title',clean.kind==='tournament'?'WINNER!':clean.kind==='duel'?'K.O.':'1ST!');title.dataset.echo=title.textContent;poster.append(title);
 const art=vfxMake('div','vfx-art');
 const trophy=vfxMake('div','vfx-trophy');trophy.innerHTML='<svg viewBox="0 0 200 190" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M51 40H20v28c0 28 28 40 49 28M149 40h31v28c0 28-28 40-49 28" stroke="#241b24" stroke-width="12" stroke-linecap="round"/><path d="M51 40H20v28c0 28 28 40 49 28M149 40h31v28c0 28-28 40-49 28" stroke="#ffbf39" stroke-width="7" stroke-linecap="round"/><path d="M48 19h104v40c0 37-23 61-52 61S48 96 48 59V19Z" fill="#ffc94a" stroke="#241b24" stroke-width="7"/><path d="M59 29h17v30c0 25 8 42 21 52-23-4-38-24-38-52V29Z" fill="#ffe99a"/><path d="m100 43 7 14 16 2-12 12 3 16-14-8-14 8 3-16-12-12 16-2 7-14Z" fill="#fff9e2" stroke="#ba721b" stroke-width="3"/><path d="M91 120h18v29H91z" fill="#e99b26" stroke="#241b24" stroke-width="6"/><path d="M70 149h60l10 25H60l10-25Z" fill="#ffc94a" stroke="#241b24" stroke-width="7"/><path d="M51 176h98" stroke="#241b24" stroke-width="9" stroke-linecap="round"/></svg>';
 const food=vfxMake('span','vfx-food',vfxFood(clean.menu));art.append(trophy,food,vfxMake('i','vfx-spark vfx-spark-a','✦'),vfxMake('i','vfx-spark vfx-spark-b','✦'));poster.append(art);
 poster.append(vfxMake('b','vfx-name',clean.name+(clean.kind==='tournament'?' 토너먼트 우승!':clean.kind==='duel'?' 최종 승리!':' 레이스 1등!')),vfxMake('span','vfx-menu',clean.menu),vfxMake('span','vfx-caption',clean.kind==='tournament'?'내 메뉴, 끝까지 살아남았다!':clean.kind==='duel'?'승부 끝! 오늘 점심을 지배하다.':'왕관 썼다고 안 봐줌. 다음은 밥그릇 난투.'));
 const ticker=vfxMake('div','vfx-ticker');ticker.append(vfxMake('span','',clean.kind==='tournament'?'CHAMPION • 오늘의 우승 메뉴':clean.kind==='duel'?'VICTORY • 점심 쟁탈전 승리 • VICTORY • 점심 쟁탈전 승리':'FIRST SEED • 왕좌 쟁탈전 진출 • FIRST SEED • 왕좌 쟁탈전 진출'));
 const particles=vfxMake('div','vfx-particles');
 for(let i=0;i<(still?10:58);i++){
  const p=vfxMake('i',i%7===0?'vfx-confetti vfx-confetti-star':'vfx-confetti');
  p.style.setProperty('--left',(vfxNoise(id,i)*100)+'%');p.style.setProperty('--drift',((vfxNoise(id,i+90)-.5)*340)+'px');p.style.setProperty('--turn',((i%2?1:-1)*(400+vfxNoise(id,i+180)*600))+'deg');p.style.setProperty('--delay',(vfxNoise(id,i+270)*.5)+'s');p.style.setProperty('--fall',(2+vfxNoise(id,i+360)*.8)+'s');p.style.setProperty('--color',['#ffce54','#ff684a','#a8edc9','#c7b7ff','#fff7d7'][i%5]);if(i%7===0)p.textContent='✦';particles.append(p);
 }
 layer.append(shade,rays,ring,flash,particles,poster,ticker);document.body.append(layer);
 vfxImpactStage(clean.kind,still);vfxFanfare();
 // Independent of CSS animation support, the readable game/results reappear
 // within two seconds; only light, noninteractive particles may linger.
 vfxFocusCleanup=setTimeout(()=>{for(const node of [shade,rays,ring,flash,poster,ticker])node.remove();},1900);
 vfxCleanup=setTimeout(()=>{layer.remove();if(vfxLayer===layer)vfxLayer=null;},still?1950:3100);
 vfxEnsureReplay();return true;
}
function vfxDuelDetail(){
 if(typeof duel==='undefined'||!duel||duel.phase!=='done'||!duel.fighters?.length)return null;
 const fromResult=typeof result!=='undefined'&&result?.source==='duel';
 const side=fromResult?(result.person===duel.challenger?0:1):(duel.fighters[0].hp>=duel.fighters[1].hp?0:1);
 return {id:'duel:'+(duel.id||((typeof result!=='undefined'&&result?.id)||'local')+':'+((typeof result!=='undefined'&&result?.duelCount)||0)),kind:'duel',name:side===0?duel.challenger:duel.defender,menu:side===0?duel.challengerMenu:duel.defenderMenu,reason:'결투 승리'};
}
function vfxResultDetail(){
 if(typeof result==='undefined'||!result)return null;
 if(result.source==='tournament')return {id:'tournament:'+result.id,kind:'tournament',name:result.person,menu:result.menu};
 if(result.brawlId)return {id:'brawl:'+result.brawlId,kind:'duel',name:result.person,menu:result.menu};
 if(result.source==='duel'){const d=vfxDuelDetail();return d||{id:'duel:'+result.id+':'+(result.duelCount||0),kind:'duel',name:result.person,menu:result.menu};}
 return {id:'race:'+result.id,kind:'race',name:result.person,menu:result.menu};
}
function vfxEnsureReplay(){
 const view=$('resultView');if(!view)return;
 let replay=$('vfxReplayBtn');
 if(!replay){replay=vfxMake('button','vfx-replay','✦ 승리 세리머니 다시 보기');replay.id='vfxReplayBtn';replay.type='button';replay.addEventListener('click',()=>{const detail=vfxResultDetail()||vfxLastDetail;if(detail)vfxCelebrate({...detail,force:true});});const actions=view.querySelector('.result-actions');if(actions)actions.append(replay);else view.append(replay);}
 replay.hidden=!(typeof result!=='undefined'&&result);return replay;
}
deptRender=function(...args){
 const value=vfxOriginalRaceRender(...args);
 if(typeof deptRace!=='undefined'&&deptRace?.phase==='finished'){
  const winner=deptRace.lanes.find(l=>l.id===deptRace.winnerId);
  if(winner)vfxCelebrate({id:'race:'+deptRace.id,kind:'race',name:winner.name,menu:winner.menu});
 }
 return value;
};
actionRender=function(...args){const value=vfxOriginalCombatRender(...args);const detail=vfxDuelDetail();if(detail)vfxCelebrate(detail);return value;};
renderResult=function(...args){const value=vfxOriginalResultRender(...args);vfxEnsureReplay();const detail=vfxResultDetail();if(detail)vfxCelebrate(detail);return value;};


/* EXTRA_ROLES_V1 */
const deptRoleBaseSimulate=deptSimulate,deptRoleBaseHazard=deptHazard;
deptSimulate=function(dt,t){
 if(deptAuthority()&&deptRace?.phase==='running')for(const lane of deptRace.lanes){
 }
 return deptRoleBaseSimulate(dt,t);
};
deptHazard=function(lane,gate,t){
 const avoided=(t<lane.jumpUntil&&gate.type!=='wind')||(t<lane.dashUntil&&gate.type==='wind');
 if(deptAuthority()&&deptRace?.phase==='running'&&lane.department==='facility'&&!lane.passiveUsed&&lane.finishedAt===null&&!avoided){deptUsePassive(lane,t,'장애물 안전 통과!');return;}
 return deptRoleBaseHazard(lane,gate,t);
};


/* GROUP_BRAWL_V1 */
/* BRAWL_PROJECTILES_V1 */
/* BRAWL_DUCK_RECOVERY_V1 */
let brawlState=null,brawlTimer=0,brawlFrame=0,brawlLast=0,brawlAccumulator=0,brawlRemotePrev=null,brawlRemoteAt=0,brawlLocalKeys=new Set(),brawlPointerInputs=new Map(),brawlFlushQueued=false;
const brawlInputs=new Map(),brawlInputAt=new Map(),brawlInputSeq=new Map(),brawlNodes=new Map(),brawlSoundSeen=new Map();
const brawlKeys={KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',KeyW:'jump',ArrowUp:'jump',Space:'jump',KeyF:'attack',KeyK:'attack',KeyS:'duck',ArrowDown:'duck',KeyG:'duck',KeyL:'duck',KeyE:'beam'};
const brawlHeld=['left','right','duck'],brawlColors=['#ade8c8','#cfbaf0','#ffd47f','#ffa99b','#8bdbe8','#d3df91','#edb8db','#b4c8fa'];

const brawlOrbNodes=new Map();
function brawlSpawnOrb(f){
 const s=brawlState;s.projectiles??=[];s.projectileSeq=(s.projectileSeq||0)+1;
 s.projectiles.push({id:s.id+':orb:'+s.projectileSeq,owner:f.id,x:f.x+f.beamFace*36,y:f.y+68,baseY:f.y+68,vx:f.beamFace*200,vy:60,age:0,ttl:3.8,radius:13,active:true,hit:false,hitId:null,impactUntil:0});
}
function brawlSegmentRect(x0,y0,x1,y1,left,right,bottom,top){
 let near=0,far=1;for(const [start,end,min,max] of [[x0,x1,left,right],[y0,y1,bottom,top]]){const d=end-start;if(Math.abs(d)<1e-7){if(start<min||start>max)return null;continue;}let a=(min-start)/d,b=(max-start)/d;if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);if(near>far)return null;}return near;
}
function brawlAdvanceOrbs(dt,hits,alive){
 const s=brawlState,t=s.clock;for(const p of s.projectiles||[]){if(!p.active)continue;const x0=p.x,y0=p.y;p.age+=dt;p.x+=p.vx*dt;p.vy=(p.vy||0)-650*dt;p.y+=p.vy*dt;if(p.y<19){p.y=19;p.vy=265;}for(const floor of arcadePlatforms)if(p.x>=floor.left&&p.x<=floor.right&&y0-13>=floor.y&&p.y-13<=floor.y&&p.vy<0){p.y=floor.y+13;p.vy=235;break;}
  let contact=null,first=Infinity;for(const f of alive){if(f.id===p.owner||f.eliminated||f.forfeited)continue;const r=p.radius,at=brawlSegmentRect(x0,y0,p.x,p.y,f.x-32-r,f.x+32+r,f.y+6-r,f.y+(f.guard?38:82)+r);if(at!==null&&at<first){first=at;contact=f;}}
  if(contact){p.x=x0+(p.x-x0)*first;p.y=y0+(p.y-y0)*first;p.active=false;p.hit=true;p.hitId=contact.id;p.impactUntil=t+.18;const owner=s.fighters.find(f=>f.id===p.owner);if(owner)brawlHit(hits,{...owner,beamFace:p.vx>0?1:-1},contact,30,'뜨거 ㅋㅋ','beam');}
  else if(p.age>=p.ttl||p.x<-35||p.x>1035)p.active=false;
 }
 s.projectiles=(s.projectiles||[]).filter(p=>p.active||p.hit&&t<p.impactUntil);
}
function brawlRenderOrbs(alpha,width,height){
 let layer=$('brawlOrbs');if(!layer){layer=brawlMake('div','brawl-orbs');layer.id='brawlOrbs';layer.setAttribute('aria-hidden','true');$('brawlArena').append(layer);}
 const visible=new Set();for(const p of brawlState.projectiles||[]){if(!p.active&&!p.hit)continue;visible.add(p.id);let n=brawlOrbNodes.get(p.id);if(!n){n=brawlMake('i','brawl-orb');n.append(brawlMake('i','brawl-orb-tail'),brawlMake('b','brawl-orb-core'));layer.append(n);brawlOrbNodes.set(p.id,n);}
  const prev=brawlRemotePrev?.projectiles?.find(q=>q.id===p.id),x=prev&&!brawlAuthority()?prev.x+(p.x-prev.x)*alpha:p.x,y=prev&&!brawlAuthority()?prev.y+(p.y-prev.y)*alpha:p.y;
  n.style.transform='translate3d('+(x/1000*width)+'px,'+(-y/360*height+13)+'px,0) translateX(-50%) scaleX('+(p.vx>0?1:-1)+')';n.classList.toggle('is-impact',p.hit);n.style.opacity=p.hit?String(Math.max(0,(p.impactUntil-brawlState.clock)/.18)):'';
 }
 for(const [id,node] of brawlOrbNodes)if(!visible.has(id)){node.remove();brawlOrbNodes.delete(id);}
}

function brawlAuthority(){return typeof netIsHost==='function'?netIsHost():true;}
function brawlMe(){return typeof netSelfId==='function'?netSelfId():brawlState?.participants[0]?.id||'';}
function brawlClock(){return performance.now();}
function brawlMake(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function brawlText(n,t){if(n&&n.textContent!==String(t))n.textContent=String(t);}
function brawlClone(v){return JSON.parse(JSON.stringify(v));}
function brawlFood(menu){return typeof deptFood==='function'?deptFood(menu):typeof actionFood==='function'?actionFood(menu):'🍽️';}
function brawlPublish(force=false){if(brawlAuthority()&&typeof netBrawlPublish==='function')netBrawlPublish(force);}
function brawlSend(action,held){if(typeof netBrawlInput==='function')netBrawlInput(action,held);}
function brawlOwn(){return brawlState?.fighters.find(f=>f.id===brawlMe());}
function brawlAlive(){return brawlState?brawlState.fighters.filter(f=>!f.eliminated&&!f.forfeited&&f.hp>0):[];}
function brawlClearHeld(){brawlLocalKeys.clear();brawlPointerInputs.clear();document.querySelectorAll('[data-brawl-action]').forEach(n=>n.classList.remove('is-held'));if(brawlState&&brawlOwn())brawlSend('sync',[]);}
function brawlHeldList(){const out=new Set();for(const code of brawlLocalKeys){const a=brawlKeys[code];if(brawlHeld.includes(a))out.add(a);}for(const v of brawlPointerInputs.values())if(brawlHeld.includes(v.action))out.add(v.action);return [...out];}
function brawlFlush(){brawlFlushQueued=false;if(brawlState&&brawlOwn())brawlSend('sync',brawlHeldList());}
function brawlQueueFlush(){if(brawlFlushQueued)return;brawlFlushQueued=true;queueMicrotask(brawlFlush);}
function brawlHolding(id,action){if(brawlClock()-(brawlInputAt.get(id)||0)>900)brawlInputs.delete(id);return brawlInputs.get(id)?.has(action)||false;}
function brawlSpawn(i,n){return n===2?280+i*440:n===3?170+i*330:110+i*780/(n-1);}
function brawlFighter(p,i,n,championId){const champion=p.id===championId;return {champion,jumps:0,dropUntil:0,dashUntil:0,attackFace:1,diving:false,maxHp:100,id:p.id,name:p.name,menu:p.menu,department:p.department||'',index:i,x:brawlSpawn(i,n),y:0,prevY:0,vx:0,vy:0,face:i<n/2?1:-1,hp:100,energy:100,guard:false,guardSince:-100,guardBreakUntil:0,wasGuard:false,moving:false,attackAt:-100,attackReadyAt:0,attackHitIds:[],stun:0,flash:0,label:'',labelUntil:0,stompAfter:0,stompUntil:0,beamReadyAt:0,beamChargeAt:0,beamUntil:0,beamFace:1,beamFired:true,beamHitIds:[],eliminated:false,forfeited:false};}
function brawlEnsureView(){
 let view=$('brawlView');if(view)return view;
 view=brawlMake('section','brawl-view');view.id='brawlView';view.hidden=true;view.setAttribute('aria-label','모두 함께 조작하는 점심 난투');
 view.innerHTML='<div class="board-head"><div class="section-label"><small>EVERYONE VS EVERYONE</small> 1등 쟁탈전</div><span class="pill">2–8명 · 밟고 튕기고 밥 지키기</span></div><div class="brawl-intro"><div><span>왕관은 장식. 밥 앞에서는 모두 체력 100.</span><h2 id="brawlHeading" tabindex="-1">밥 먹자고 이러는 중</h2></div><div class="brawl-clock"><b id="brawlClock">60</b><small id="brawlClockCaption">SECONDS</small></div></div><div class="brawl-scores" id="brawlScores"></div><div class="brawl-arena" id="brawlArena" aria-label="다인 실시간 난투 경기장"><div class="brawl-backdrop"><i class="brawl-sun"></i><div class="brawl-grid"></div><span class="brawl-arena-label">DAEGU UNIVERSITY · LUNCH BRAWL</span><div class="brawl-floor"></div></div><div id="brawlActors" class="brawl-actors"></div><div class="brawl-overlay" id="brawlOverlay"><b id="brawlOverlayTitle">READY?</b><span id="brawlOverlaySub">모든 참가자가 직접 움직여요.</span></div></div><div class="brawl-notice" id="brawlNotice" role="status" aria-live="polite"></div><div class="brawl-own"><div><strong id="brawlOwnName"></strong><span id="brawlOwnHint">A/D 이동 · W 점프 · F 공격 · S 숙이기 · E 에네르기파</span></div><span id="brawlBeamStatus"></span></div><div class="brawl-touch" id="brawlControls"><button data-brawl-action="left" aria-label="내 캐릭터 왼쪽 이동">◀<kbd>A / ←</kbd></button><button data-brawl-action="right" aria-label="내 캐릭터 오른쪽 이동">▶<kbd>D / →</kbd></button><button data-brawl-action="jump" aria-label="내 캐릭터 점프와 머리 밟기">점프<kbd>W / ↑</kbd></button><button data-brawl-action="attack" aria-label="내 캐릭터 근접 공격">공격<kbd>F</kbd></button><button data-brawl-action="duck" aria-label="내 캐릭터 숙이기 방어">숙이기<kbd>S / ↓</kbd></button><button class="brawl-beam-button" data-brawl-action="beam" aria-label="내 캐릭터 에네르기파">에네르기파<small id="brawlBeamCooldown">E · 기력 40</small></button></div><div class="brawl-bottom"><span>점프 두 번 · 공중에서 S로 내리찍기 · F로 밀치기 · 불덩이는 천천히 통통</span><button id="brawlReadyBtn" class="btn primary" type="button">내 캐릭터 준비 완료</button></div>';
 ($('game')||document.body).append(view);$('brawlReadyBtn').addEventListener('click',()=>{if(typeof netBrawlReady==='function')netBrawlReady();});
 return view;
}
function brawlBuildActors(){
 brawlNodes.clear();$('brawlActors').replaceChildren();$('brawlScores').replaceChildren();
 brawlState.fighters.forEach((f,i)=>{
  const row=brawlMake('div','brawl-score');row.dataset.id=f.id;row.style.setProperty('--brawl-color',brawlColors[i%8]);const name=brawlMake('strong','',(f.champion?'👑 ':'')+f.name+(f.id===brawlMe()?' · 나':'')),hp=brawlMake('b','','100'),bar=brawlMake('span','brawl-mini-health'),fill=brawlMake('i');bar.append(fill);row.append(name,hp,bar,brawlMake('small','',f.menu));$('brawlScores').append(row);
  const actor=brawlMake('div','brawl-actor');actor.style.setProperty('--brawl-color',brawlColors[i%8]);actor.dataset.id=f.id;actor.setAttribute('aria-label',f.name+'의 '+f.menu+' 캐릭터');
  actor.innerHTML='<i class="brawl-stomp-ring"></i><div class="brawl-charge"></div><div class="brawl-energy-beam"><i></i><b></b></div><span class="brawl-float-label"></span><span class="brawl-player-name"></span><div class="brawl-art"><span class="brawl-food"></span><svg viewBox="0 0 140 120" aria-hidden="true"><ellipse cx="70" cy="109" rx="45" ry="6" fill="#211b2633"/><path d="m42 89-7 18m63-18 7 18" stroke="#211b26" stroke-width="8" stroke-linecap="round"/><path d="M22 45Q4 45 10 70M118 45q18 0 12 25" stroke="#211b26" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M22 42q2 57 48 57t48-57Z" fill="var(--brawl-color)" stroke="#211b26" stroke-width="5"/><ellipse cx="70" cy="42" rx="48" ry="10" fill="#fff6dc" stroke="#211b26" stroke-width="5"/><circle cx="53" cy="65" r="4" fill="#211b26"/><circle cx="87" cy="65" r="4" fill="#211b26"/><path d="M57 79q13 12 26 0" stroke="#211b26" stroke-width="4" fill="none" stroke-linecap="round"/></svg><i class="brawl-arm"></i><i class="brawl-punch"></i></div>';
  if(typeof deptAvatarSvg==='function'){actor.querySelector('.brawl-art').innerHTML=deptAvatarSvg(f.department)+'<i class="brawl-punch"></i>';actor.classList.add('has-dept-avatar');const badge=brawlMake('span','brawl-food-badge',brawlFood(f.menu));badge.setAttribute('aria-hidden','true');actor.append(badge);}else brawlText(actor.querySelector('.brawl-food'),brawlFood(f.menu));
  brawlText(actor.querySelector('.brawl-player-name'),(f.champion?'👑 ':'')+f.name);$('brawlActors').append(actor);
  brawlNodes.set(f.id,{actor,row,hp,fill,name,art:actor.querySelector('.brawl-art'),beam:actor.querySelector('.brawl-energy-beam'),label:actor.querySelector('.brawl-float-label')});
 });
}
function brawlPrepare(spec){
 if(!spec||typeof spec.id!=='string'||!spec.id||!Array.isArray(spec.participants)||spec.participants.length<2||spec.participants.length>8)return false;
 if(spec.participants.some(p=>!p||typeof p.id!=='string'||typeof p.name!=='string'||typeof p.menu!=='string')||new Set(spec.participants.map(p=>p.id)).size!==spec.participants.length)return false;
 brawlCancel();const participants=spec.participants.map(p=>({id:p.id,name:p.name.slice(0,24),menu:p.menu.slice(0,40),department:String(p.department||'').slice(0,60)}));
 brawlState={id:spec.id,participants,phase:'lobby',readyIds:Array.isArray(spec.readyIds)?spec.readyIds.filter(id=>participants.some(p=>p.id===id)):[],championId:participants.some(p=>p.id===spec.championId)?spec.championId:null,fighters:participants.map((p,i)=>brawlFighter(p,i,participants.length,spec.championId)),clock:0,countdown:3,sudden:false,projectiles:[],projectileSeq:0,seq:0,winnerId:null,reason:'',notice:'직접 움직이고 공격하세요. 자동 전투는 없어요.',finishLocked:false};
 const view=brawlEnsureView();['setupView','raceView','resultView','duelView','deptRaceView'].forEach(id=>{const n=$(id);if(n)n.hidden=true;});if(typeof deptView!=='undefined'&&deptView)deptView.hidden=true;view.hidden=false;
 if(typeof playLayout==='function')playLayout(true);if(typeof setStep==='function')setStep(3);mode='brawl';brawlBuildActors();brawlLast=brawlClock();brawlRemoteAt=brawlLast;brawlRemotePrev=null;brawlRender();brawlFrame=requestAnimationFrame(brawlAnimate);
 brawlTimer=setInterval(brawlPump,32);return true;
}
function brawlStart(){if(!brawlAuthority()||!brawlState||brawlState.phase!=='lobby')return false;brawlState.phase='countdown';brawlState.countdown=3;brawlState.clock=0;brawlState.notice='3초 뒤 시작! 내 캐릭터를 확인하세요.';brawlInputs.clear();brawlInputAt.clear();brawlLast=brawlClock();brawlAccumulator=0;brawlState.seq++;brawlRender();brawlPublish(true);return true;}
function brawlSetReady(ids){if(!brawlState||!Array.isArray(ids))return false;brawlState.readyIds=[...new Set(ids.filter(id=>brawlState.participants.some(p=>p.id===id)))];brawlRender();return true;}
function brawlHostInput(senderId,packet){
 if(!brawlAuthority()||!brawlState||!packet||typeof packet!=='object'||!Number.isSafeInteger(packet.seq)||packet.seq<1||packet.seq<=(brawlInputSeq.get(senderId)||0))return false;
 const f=brawlState.fighters.find(f=>f.id===senderId);if(!f||f.eliminated||f.forfeited||f.hp<=0)return false;
 const action=packet.action;
 if(action==='sync'){
  if(!Array.isArray(packet.held)||packet.held.length>3||packet.held.some(a=>!brawlHeld.includes(a)))return false;
  if(packet.held.length&&brawlState.phase!=='fight')return false;
  brawlInputSeq.set(senderId,packet.seq);brawlInputs.set(senderId,new Set(packet.held));brawlInputAt.set(senderId,brawlClock());return true;
 }
 if(brawlHeld.includes(action)){
  if(typeof packet.held!=='boolean'||packet.held&&brawlState.phase!=='fight')return false;
  brawlInputSeq.set(senderId,packet.seq);const held=brawlInputs.get(senderId)||new Set();if(packet.held)held.add(action);else held.delete(action);brawlInputs.set(senderId,held);brawlInputAt.set(senderId,brawlClock());return true;
 }
 if(!['jump','attack','beam'].includes(action)||packet.held!==true||brawlState.phase!=='fight')return false;
 brawlInputSeq.set(senderId,packet.seq);brawlInputAt.set(senderId,brawlClock());const t=brawlState.clock;if(t<f.stun)return false;
 if(action==='jump'){if((f.jumps||0)>=2)return false;f.jumps=(f.jumps||0)+1;f.vy=f.jumps===1?780:650;f.guard=false;f.diving=false;f.label=f.jumps===2?'한 번 더 ㅋㅋ':'';f.labelUntil=t+.45;return true;}
 if(action==='attack'){if(t<f.attackReadyAt||brawlHolding(f.id,'duck')||!f.beamFired||t<f.beamUntil)return false;f.attackAt=t;f.attackReadyAt=t+.48;f.attackFace=f.face;f.dashUntil=t+.12;f.attackHitIds=[];return true;}
 if(t<f.beamReadyAt||f.energy<40||!f.beamFired||t<f.beamUntil)return false;
 f.energy-=40;f.beamReadyAt=t+7;f.beamChargeAt=t+.7;f.beamUntil=0;f.beamFace=f.face;f.beamFired=false;f.beamHitIds=[];f.label='에너지 충전!';f.labelUntil=t+.7;return true;
}
function brawlNotice(text){if(brawlState)brawlState.notice=text;}
function brawlHit(hits,a,b,damage,label,kind='punch'){
 hits.push({attacker:a.id,target:b.id,damage,dir:kind==='beam'?a.beamFace:(b.x>=a.x?1:-1),kind});b.label=label;b.labelUntil=brawlState.clock+.58;b.flash=brawlState.clock+.18;b.hitKind=kind;
}
function brawlResolve(hits,alive){
 const t=brawlState.clock;
 for(const a of alive){
  if(!a.beamFired&&t>=a.beamChargeAt){a.beamFired=true;a.beamUntil=t+.16;a.label='에네르기파 발사!';a.labelUntil=t+.55;brawlSpawnOrb(a);brawlNotice(a.name+'의 느린 에네르기파! 점프하거나 숙여서 피하세요.');}
  for(const b of alive){if(a===b)continue;const dx=b.x-a.x;
   if(t-a.attackAt>=.09&&t-a.attackAt<=.24&&!a.attackHitIds.includes(b.id)&&Math.abs(dx)<128&&Math.abs(a.y-b.y)<76&&dx*a.face>=0){
    a.attackHitIds.push(b.id);
    if(b.guard&&a.y-b.y>26){b.label='회피!';b.labelUntil=t+.45;b.energy=Math.max(0,b.energy-3);}
    else if(b.guard&&b.energy>12){const parry=t-b.guardSince<.12;b.energy=Math.max(0,b.energy-(parry?8:16));if(parry){a.stun=Math.max(a.stun,t+.25);a.vx=-a.face*180;}brawlHit(hits,a,b,parry?0:4,parry?'패링!':'방어!');}
    else brawlHit(hits,a,b,18,['억','아니 잠깐','밥 내놔'][Math.floor(t*3)%3]);
   }
   const head=b.y+(b.guard?44:78),oldHead=b.prevY+(b.guard?44:78);
   if(a.vy<-65&&t>=a.stun&&t>=a.stompAfter&&Math.abs(dx)<84&&a.prevY>=oldHead-1&&a.y<=head){
    const guarded=b.guard&&b.energy>15;a.y=head+2;a.vy=610;a.jumps=1;a.stompAfter=t+.4;a.stompUntil=t+.38;if(guarded)b.energy=Math.max(0,b.energy-20);brawlHit(hits,a,b,guarded?8:a.diving?34:26,guarded?'납작 방어':a.diving?'밥그릇 찍기!':'납작 ㅋㅋ','stomp');a.diving=false;
   }
   // A released skill travels as a host-authoritative projectile.
  }
 }
}
function brawlResetSurvivors(fighters,notice){
 const t=brawlState.clock;fighters.forEach((f,i)=>{f.hp=1;f.energy=100;f.eliminated=false;f.x=brawlSpawn(i,fighters.length);f.y=f.prevY=f.vy=f.vx=0;f.jumps=0;f.diving=false;f.dropUntil=0;f.attackAt=-100;f.attackReadyAt=t+.5;f.stun=t+.4;f.guard=false;f.wasGuard=false;f.guardBreakUntil=0;f.beamFired=true;f.beamUntil=0;f.beamChargeAt=0;f.beamReadyAt=t+.8;f.stompAfter=t+.5;});brawlInputs.clear();brawlState.projectiles=[];brawlState.notice=notice;
}
function brawlFinish(winner,reason){
 if(!brawlState||brawlState.finishLocked)return;brawlState.finishLocked=true;brawlState.phase='finished';brawlState.winnerId=winner?.id||null;brawlState.reason=reason;brawlState.notice=winner?winner.name+' 우승! 오늘 점심은 '+winner.menu:reason;brawlState.seq++;brawlInputs.clear();brawlRender();brawlPublish(true);if(winner&&typeof netBrawlFinished==='function')netBrawlFinished(winner.id,reason);
}

function brawlStep(dt){
 if(!brawlAuthority()||!brawlState||!['countdown','fight'].includes(brawlState.phase)||!Number.isFinite(dt)||dt<=0)return false;dt=Math.min(.04,dt);
 if(brawlState.phase==='countdown'){brawlState.countdown=Math.max(0,brawlState.countdown-dt);if(brawlState.countdown<=0){brawlState.phase='fight';brawlState.clock=0;brawlState.notice='밥 먹자고 이러는 중';brawlInputs.clear();}brawlState.seq++;return true;}
 brawlState.clock+=dt;const t=brawlState.clock,alive=brawlAlive();if(alive.length<=1){brawlFinish(alive[0],alive.length?'마지막 밥그릇':'참가자가 없어요.');return true;}
 if(arcadePractice)arcadeBotStep();
 for(const f of alive){
  const moving=(brawlHolding(f.id,'right')?1:0)-(brawlHolding(f.id,'left')?1:0),can=t>=f.stun,duck=brawlHolding(f.id,'duck');
  const others=alive.filter(x=>x!==f).sort((a,b)=>Math.abs(a.x-f.x)-Math.abs(b.x-f.x));
  if(!f.beamFired||t<f.beamUntil)f.face=f.beamFace;else if(t-f.attackAt<.26)f.face=f.attackFace||f.face;else if(moving&&can)f.face=moving;else if(others[0])f.face=others[0].x>=f.x?1:-1;
  const supported=f.y<.5||arcadePlatforms.some(p=>Math.abs(f.y-p.y)<2&&f.x>=p.left-15&&f.x<=p.right+15);
  if(duck&&supported&&f.y>1&&can){f.dropUntil=t+.35;f.y-=4;f.vy=-110;f.jumps=1;}
  const guard=duck&&f.energy>0&&t>=(f.guardBreakUntil||0)&&f.y<5&&t-f.attackAt>.25&&can&&f.beamFired&&t>=f.beamUntil;
  if(guard&&!f.wasGuard)f.guardSince=t;f.guard=guard;f.wasGuard=guard;
  if(duck&&!supported&&f.y>30&&can&&f.vy<180){f.vy=-1100;f.diving=true;}
  const charging=!f.beamFired||t<f.beamUntil;f.energy=Math.max(0,Math.min(100,f.energy+(guard?-22:charging?3:16)*dt));
  if(guard&&f.energy<=0){f.guard=false;f.wasGuard=false;f.guardBreakUntil=t+.8;}
  f.moving=!!moving&&can;
  if(can){const desired=t<f.dashUntil?f.attackFace*680:moving*(guard?95:charging?140:arcadePractice&&f.id!=='practice-you'?265:405);f.vx+=(desired-f.vx)*Math.min(1,dt*(moving||t<f.dashUntil?24:14));}
  else f.vx*=Math.pow(.18,dt);
  f.prevY=f.y;f.x+=f.vx*dt;
  if(f.x<55||f.x>945){const wall=f.x<55?55:945;f.x=wall;if(Math.abs(f.vx)>350&&t<f.stun){f.vx=-f.vx*.55;f.label='벽이 왜 여기';f.labelUntil=t+.6;}}
  f.vy-=1700*dt;f.y+=f.vy*dt;
  if(f.y>240){f.y=240;f.vy=Math.min(0,f.vy);}
  if(f.vy<=0&&t>=(f.dropUntil||0))for(const p of [...arcadePlatforms].sort((a,b)=>b.y-a.y)){
   if(f.x>=p.left-15&&f.x<=p.right+15&&f.prevY>=p.y-1&&f.y<=p.y){f.y=p.y;f.vy=0;f.jumps=0;f.diving=false;break;}
  }
  if(f.y<=0){f.y=0;f.vy=0;f.jumps=0;f.diving=false;}
 }
 const hits=[];brawlResolve(hits,alive);brawlAdvanceOrbs(dt,hits,alive);
 for(let i=0;i<alive.length;i++)for(let j=i+1;j<alive.length;j++){const a=alive[i],b=alive[j],dx=b.x-a.x;if(Math.abs(dx)<75&&Math.abs(a.y-b.y)<(a.guard||b.guard?35:62)){const push=(75-Math.abs(dx))/2,s=dx>=0?1:-1;a.x=Math.max(55,Math.min(945,a.x-push*s));b.x=Math.max(55,Math.min(945,b.x+push*s));}}
 for(const hit of hits){const b=brawlState.fighters.find(f=>f.id===hit.target);b.hp=Math.max(0,b.hp-hit.damage);if(hit.damage){b.stun=Math.max(b.stun,t+(hit.kind==='beam'?.34:.24));b.vx=hit.dir*(hit.kind==='beam'?720:hit.kind==='stomp'?470:570)+(100-b.hp)*hit.dir*2;b.vy=Math.max(b.vy,hit.kind==='beam'?330:hit.kind==='stomp'?150:225);b.guard=false;b.jumps=Math.max(1,b.jumps||0);}}
 const survivors=alive.filter(f=>f.hp>0&&!f.forfeited);
 if(!survivors.length){brawlState.sudden=true;brawlResetSurvivors(alive.filter(f=>!f.forfeited),'둘 다 뻗음. 한 대만 더!');}
 else{alive.forEach(f=>{if(f.hp<=0){f.eliminated=true;f.guard=false;f.label='밥은 먹고 다녀라';f.labelUntil=t+2;}});if(survivors.length===1){brawlFinish(survivors[0],'마지막 밥그릇');return true;}
  if(t>=45&&!brawlState.sudden){const max=Math.max(...survivors.map(f=>f.hp)),tied=survivors.filter(f=>Math.abs(f.hp-max)<.01);if(tied.length===1){brawlFinish(tied[0],'시간 종료 · 남은 체력 우세');return true;}brawlState.sudden=true;survivors.filter(f=>!tied.includes(f)).forEach(f=>{f.eliminated=true;f.label='밥심 부족';f.labelUntil=t+2;});brawlResetSurvivors(tied,'동점이라니. 한 대만 더!');}
 }
 brawlState.seq++;return true;
}

function brawlPump(){
 if(!brawlState||!brawlAuthority()||!['countdown','fight'].includes(brawlState.phase)){brawlLast=brawlClock();return;}
 const now=brawlClock();brawlAccumulator+=Math.min(1.2,Math.max(0,(now-brawlLast)/1000));brawlLast=now;let steps=0;while(brawlAccumulator>=.016&&steps++<75&&['countdown','fight'].includes(brawlState.phase)){brawlStep(.016);brawlAccumulator-=.016;}if(steps>=75)brawlAccumulator=0;brawlPublish(false);
}
function brawlGetState(){return brawlState?brawlClone(brawlState):null;}
function brawlReceive(state){
 if(brawlAuthority()||!state||!brawlState||state.id!==brawlState.id||!Number.isSafeInteger(state.seq)||state.seq<brawlState.seq||!['lobby','countdown','fight','finished'].includes(state.phase)||!Array.isArray(state.fighters)||state.fighters.length<2||state.fighters.length>8)return false;
 if(new Set(state.fighters.map(f=>f?.id)).size!==state.fighters.length||state.fighters.some(f=>!f||!brawlState.participants.some(p=>p.id===f.id)||['x','y','vx','vy','hp','energy','attackAt','attackReadyAt','stun','flash','labelUntil','beamReadyAt','beamChargeAt','beamUntil','beamFace'].some(k=>!Number.isFinite(f[k]))))return false;
 if(!Number.isFinite(state.clock)||!Number.isFinite(state.countdown))return false;
 if(!Array.isArray(state.projectiles)||state.projectiles.length>32||state.projectiles.some(p=>!p||typeof p.id!=='string'||!state.fighters.some(f=>f.id===p.owner)||['x','y','baseY','vx','age','ttl','radius','impactUntil'].some(k=>!Number.isFinite(p[k]))||Math.abs(p.vx)>250||p.radius<8||p.radius>20||p.ttl<0||p.ttl>4))return false;
 brawlRemotePrev=brawlGetState();brawlState=brawlClone(state);brawlRemoteAt=brawlClock();brawlState.fighters.forEach(f=>{f.x=Math.max(0,Math.min(1000,f.x));f.y=Math.max(0,Math.min(700,f.y));f.maxHp=100;f.hp=Math.max(0,Math.min(f.maxHp,f.hp));f.energy=Math.max(0,Math.min(100,f.energy));});brawlRender();return true;
}
function brawlRemoveMember(id){
 if(!brawlAuthority()||!brawlState||brawlState.finishLocked)return false;const f=brawlState.fighters.find(f=>f.id===id);if(!f||f.forfeited)return false;f.forfeited=true;f.eliminated=true;f.hp=0;f.guard=false;f.beamUntil=0;f.beamFired=true;f.label='연결 종료';f.labelUntil=brawlState.clock+1000;brawlInputs.delete(id);brawlState.readyIds=brawlState.readyIds.filter(x=>x!==id);brawlState.seq++;const alive=brawlAlive();if(alive.length<=1)brawlFinish(alive[0],alive.length?'상대 참가자 연결 종료':'남은 참가자가 없어요.');else brawlPublish(true);return true;
}
function brawlRender(){
 if(!brawlState||!$('brawlView')||$('brawlView').hidden)return;const s=brawlState,t=s.clock,own=brawlOwn(),alive=brawlAlive(),arena=$('brawlArena'),width=arena.clientWidth||1000,height=arena.clientHeight||330,alpha=brawlAuthority()?1:Math.min(1,Math.max(0,(brawlClock()-brawlRemoteAt)/70));
 for(const f of s.fighters){const n=brawlNodes.get(f.id);if(!n)continue;const prev=brawlRemotePrev?.fighters.find(x=>x.id===f.id),x=prev&&!brawlAuthority()?prev.x+(f.x-prev.x)*alpha:f.x,y=prev&&!brawlAuthority()?prev.y+(f.y-prev.y)*alpha:f.y;
  n.actor.style.transform='translate3d('+(x/1000*width)+'px,'+(-y/360*height)+'px,0) translateX(-50%)';n.actor.style.zIndex=String(Math.round(5+y));n.art.style.scale=f.face+' 1';n.actor.classList.toggle('is-own',f.id===brawlMe());n.actor.classList.toggle('is-out',f.eliminated||f.forfeited);n.actor.classList.toggle('is-moving',f.moving&&f.y<2);n.actor.classList.toggle('is-air',f.y>2);n.actor.classList.toggle('is-jump',f.y>2);n.actor.classList.toggle('is-duck',f.guard);n.actor.classList.toggle('is-crouch',f.guard);n.actor.classList.toggle('is-hit',t<f.flash);n.actor.classList.toggle('is-windup',t-f.attackAt>=0&&t-f.attackAt<.09);n.actor.classList.toggle('is-attacking',t-f.attackAt>=.09&&t-f.attackAt<=.24);n.actor.classList.toggle('is-punch',t-f.attackAt>=.09&&t-f.attackAt<=.24);n.actor.classList.toggle('is-recovery',t-f.attackAt>.24&&t-f.attackAt<.5);n.actor.classList.toggle('is-beam-hit',t<f.flash&&f.hitKind==='beam');n.actor.classList.toggle('is-stomp',t<f.stompUntil);n.actor.classList.toggle('is-charging',!f.beamFired&&!f.eliminated);n.actor.classList.toggle('is-beaming',f.beamFired&&t<f.beamUntil&&!f.eliminated);n.row.classList.toggle('is-out',f.eliminated||f.forfeited);n.row.classList.toggle('is-own',f.id===brawlMe());
  n.beam.style.width=(460/1000*width)+'px';n.beam.style.left='58%';n.beam.style.right='auto';n.beam.style.transform=f.beamFace<0?'scaleX(-1)':'';n.fill.style.width=(f.hp/(f.maxHp||100)*100)+'%';brawlText(n.hp,f.eliminated?'OUT':Math.ceil(f.hp));brawlText(n.label,t<f.labelUntil?f.label:'');if(n.label.dataset.flash!==String(f.flash)&&t<f.flash){n.label.dataset.flash=String(f.flash);n.label.classList.remove('is-pop');void n.label.offsetWidth;n.label.classList.add('is-pop');}
  const cue=!f.beamFired?'charge:'+f.beamChargeAt:t<f.beamUntil?'beam:'+f.beamUntil:'';if(cue&&brawlSoundSeen.get(f.id)!==cue){brawlSoundSeen.set(f.id,cue);if(typeof beep==='function')beep(!f.beamFired?410:920,!f.beamFired?.07:.16);}
 }
 brawlRenderOrbs(alpha,width,height);
 brawlText($('brawlClock'),s.sudden?'한 대':Math.max(0,Math.ceil(45-t)));brawlText($('brawlClockCaption'),s.sudden?'SUDDEN DEATH':alive.length+' / '+s.fighters.length+' ALIVE');brawlText($('brawlNotice'),s.notice);
 const overlay=$('brawlOverlay');overlay.hidden=s.phase==='fight';
 if(s.phase==='lobby'){brawlText($('brawlOverlayTitle'),'READY?');brawlText($('brawlOverlaySub'),'참가 준비 '+s.readyIds.length+' / '+s.participants.length);}
 if(s.phase==='countdown'){brawlText($('brawlOverlayTitle'),Math.max(1,Math.ceil(s.countdown)));brawlText($('brawlOverlaySub'),'내 캐릭터를 확인하세요! 점프 · 공격 · 숙이기 · 에네르기파');}
 if(s.phase==='finished'){const win=s.fighters.find(f=>f.id===s.winnerId);brawlText($('brawlOverlayTitle'),win?win.name+' 우승!':'난투 종료');brawlText($('brawlOverlaySub'),win?'오늘 점심: '+win.menu+' · '+s.reason:s.reason);}
 const can=own&&!own.eliminated&&!own.forfeited&&s.phase==='fight';brawlText($('brawlOwnName'),own?(own.eliminated?'탈락 · 관전 중':own.name+' · '+own.menu):'관전 중');brawlText($('brawlOwnHint'),own&&!own.eliminated?'이동 A/D · 2단 점프 W · 밀치기 F · 찍기/숙이기 S · 불덩이 E':'남은 밥그릇들을 지켜보세요.');
 const cool=own?Math.max(0,own.beamReadyAt-t):0;brawlText($('brawlBeamStatus'),own?'기력 '+Math.floor(own.energy)+' / 100':'');brawlText($('brawlBeamCooldown'),!own?'관전 중':cool>.05?cool.toFixed(1)+'초':'E · 기력 40');
 document.querySelectorAll('[data-brawl-action]').forEach(b=>b.disabled=!can||(b.dataset.brawlAction==='beam'&&(own.energy<40||cool>.05||!own.beamFired||t<own.beamUntil)));$('brawlReadyBtn').hidden=s.phase!=='lobby'||!own;$('brawlReadyBtn').disabled=s.readyIds.includes(brawlMe());
}
function brawlAnimate(){if(!brawlState)return;brawlRender();brawlFrame=requestAnimationFrame(brawlAnimate);}
function brawlCancel(){for(const node of brawlOrbNodes.values())node.remove();brawlOrbNodes.clear();brawlClearHeld();clearInterval(brawlTimer);cancelAnimationFrame(brawlFrame);brawlTimer=brawlFrame=0;brawlState=null;brawlRemotePrev=null;brawlAccumulator=0;brawlInputs.clear();brawlInputAt.clear();brawlInputSeq.clear();brawlSoundSeen.clear();brawlNodes.clear();const view=$('brawlView');if(view)view.hidden=true;}
function brawlTyping(e){return e.target?.matches?.('input,textarea,select,[contenteditable="true"]')||!!document.querySelector('dialog[open]');}
document.addEventListener('keydown',e=>{if(!brawlState||$('brawlView')?.hidden||!brawlKeys[e.code]||brawlTyping(e))return;e.preventDefault();e.stopImmediatePropagation();const own=brawlOwn();if(!own||own.eliminated||brawlState.phase!=='fight'||e.repeat||brawlLocalKeys.has(e.code))return;brawlLocalKeys.add(e.code);const action=brawlKeys[e.code];if(brawlHeld.includes(action))brawlQueueFlush();else brawlSend(action,true);},true);
document.addEventListener('keyup',e=>{if(!brawlKeys[e.code])return;const had=brawlLocalKeys.delete(e.code);if(brawlState&&!brawlTyping(e)){e.preventDefault();e.stopImmediatePropagation();}if(had)brawlQueueFlush();},true);
document.addEventListener('pointerdown',e=>{if(!brawlState||$('brawlView')?.hidden)return;const b=e.target?.closest?.('[data-brawl-action]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();if(b.disabled||brawlState.phase!=='fight'||e.pointerType==='mouse'&&e.button!==0)return;try{b.setPointerCapture(e.pointerId);}catch{}const action=b.dataset.brawlAction;brawlPointerInputs.set(e.pointerId,{action,button:b});b.classList.add('is-held');if(brawlHeld.includes(action))brawlQueueFlush();else brawlSend(action,true);},true);
function brawlPointerUp(e){const v=brawlPointerInputs.get(e.pointerId);if(!v)return;e.preventDefault();e.stopImmediatePropagation();brawlPointerInputs.delete(e.pointerId);v.button.classList.remove('is-held');brawlQueueFlush();}
window.addEventListener('pointerup',brawlPointerUp,true);window.addEventListener('pointercancel',brawlPointerUp,true);document.addEventListener('lostpointercapture',brawlPointerUp,true);
document.addEventListener('click',e=>{const b=e.target?.closest?.('[data-brawl-action]');if(!b||!brawlState)return;e.preventDefault();e.stopImmediatePropagation();if(e.detail===0&&!b.disabled&&!brawlHeld.includes(b.dataset.brawlAction))brawlSend(b.dataset.brawlAction,true);},true);
window.addEventListener('blur',()=>{if(brawlState)brawlClearHeld();});document.addEventListener('visibilitychange',()=>{if(brawlState&&document.hidden)brawlClearHeld();});setInterval(()=>{if(brawlState?.phase==='fight'&&brawlOwn()&&!brawlOwn().eliminated)brawlFlush();},200);
/* END_GROUP_BRAWL_V1 */


/* GROUP_BRAWL_ROOM_V1 */
let groupRoom=null,groupLobby=null,groupFightId='',groupInputSeq=0,groupInputSeen={},groupLastPublish=0,groupFinishTimer=0,groupFinishing=false;
function groupGetState(){return groupRoom?netCopy(groupRoom):null;}
function groupEnsureUI(){if(groupLobby)return;groupLobby=el('section','group-lobby');groupLobby.id='groupBrawlLobby';groupLobby.hidden=true;groupLobby.innerHTML='<div class="group-mast">LUNCH THRONE · MULTIPLAYER BRAWL</div><div class="group-lobby-body"><span class="group-eyebrow">점심 왕좌, 다시 도전!</span><h2 tabindex="-1" id="groupLobbyTitle">1등 쟁탈전</h2><p>참가할 사람은 내 메뉴를 고르고 준비해주세요.<br>최대 8명이 함께 싸우고, 마지막 생존자가 메뉴를 가져갑니다.</p><div id="groupReadyRoster" class="group-ready-roster"></div><div class="group-my-choice"><label for="groupMenuSelect">내가 걸고 싸울 메뉴</label><select id="groupMenuSelect"></select><div class="group-reply-buttons"><button id="groupJoinBtn" class="btn primary" type="button">이 메뉴로 참가 · 준비 완료</button><button id="groupPassBtn" class="btn" type="button">이번엔 관전</button></div><p id="groupReadyNote" role="status"></p></div><button id="groupCancelBtn" class="link-btn" type="button">쟁탈전 취소 · 기존 점심 유지</button></div>';
 $('resultView').parentElement.append(groupLobby);$('groupJoinBtn').addEventListener('click',()=>netRoom.send({t:'brawlReply',brawlId:groupRoom?.id,response:'join',menu:$('groupMenuSelect').value}));$('groupPassBtn').addEventListener('click',()=>netRoom.send({t:'brawlReply',brawlId:groupRoom?.id,response:'pass'}));$('groupCancelBtn').addEventListener('click',()=>netRoom.send({t:'brawlCancel',brawlId:groupRoom?.id}));}
function groupShowInvite(){groupEnsureUI();if(typeof deptCancel==='function')deptCancel();cancelActionDuel();brawlCancel();mode='brawlInvite';playLayout(true);setStep(3);for(const id of ['setupView','raceView','resultView','duelView'])$(id).hidden=true;groupLobby.hidden=false;
 const self=groupRoom?.members.find(m=>m.id===netSelfId()),roster=$('groupReadyRoster');roster.replaceChildren();for(const m of groupRoom?.members||[]){const row=el('div','group-ready-card');row.dataset.ready=String(m.response==='join');row.append(el('strong','',m.name+(m.id===netSelfId()?' · 나':'')),el('span','',m.response==='join'?'READY ✓ · '+m.menu:m.response==='pass'?'이번엔 관전':'준비 중'));roster.append(row);}
 const select=$('groupMenuSelect'),previous=select.value;select.replaceChildren();for(const name of self?.menus||[]){const o=el('option','',name);o.value=name;select.append(o);}select.value=self?.menu||previous||self?.menus[0]||'';$('groupJoinBtn').disabled=!self||!self.menus.length;$('groupJoinBtn').textContent=self?.response==='join'?'참가 준비 완료 ✓ · 메뉴 변경 가능':'이 메뉴로 참가 · 준비 완료';$('groupPassBtn').textContent=self?.response==='pass'?'관전 선택 완료 ✓':'이번엔 관전';const n=groupRoom?.members.filter(m=>m.response==='pending').length||0;$('groupReadyNote').textContent=n?'아직 '+n+'명이 참가 여부를 선택하고 있어요.':'2명 이상 참가하면 자동 시작해요. 참가 여부를 바꿀 수 있어요.';$('groupCancelBtn').hidden=!(netIsHost()||groupRoom?.creatorId===netSelfId());$('dossierStatus').textContent='1등 쟁탈전 · 준비 대기';}
function groupOpenLocalInvite(){if(netPhase==='result')netRoom.send({t:'brawlInvite'});}
function groupInvite(senderId){if(!netIsHost()||netPhase!=='result'||!result)return;groupRoom={id:'brawl_'+Date.now()+'_'+rand(100000),creatorId:senderId,automatic:false,championId:result.winnerId,members:netMembers().map(m=>({id:m.id,name:m.name,department:netDepartment(m.id),menus:[...(netPicks[m.id]||[])],menu:'',response:'pending'})),spec:null};groupFightId='';groupInputSeen={};groupFinishing=false;netPhase='brawlInvite';groupShowInvite();netPublish();}
function groupAutoRace(){
 if(!netIsHost()||!result||!netSpec)return;const current=new Set(netMembers().map(m=>m.id));const participants=netSpec.participants.filter(p=>current.has(p.id));if(participants.length<2){groupResetToSetup();return;}
 groupRoom={id:'brawl_'+result.id,creatorId:netSelfId(),automatic:true,championId:result.winnerId,members:participants.map(p=>({id:p.id,name:p.name,department:p.department,menus:[...(netPicks[p.id]||[])],menu:p.menu,response:'join'})),spec:null};groupStart();
}
function groupStart(){if(!netIsHost()||!groupRoom)return;const joined=groupRoom.members.filter(m=>m.response==='join'&&netMembers().some(p=>p.id===m.id));if(joined.length<2)return;groupRoom.spec={id:groupRoom.id,championId:groupRoom.championId,participants:joined.map(m=>({id:m.id,name:m.name,menu:m.menu,department:m.department})),readyIds:joined.map(m=>m.id)};groupFinishing=false;groupInputSeen={};groupFightId=groupRoom.id;netPhase='brawl';mode='brawl';groupLobby&&(groupLobby.hidden=true);cancelActionDuel();netApplying=true;try{brawlPrepare(groupRoom.spec);brawlSetReady(groupRoom.spec.readyIds);brawlStart();}finally{netApplying=false;}netPublish();}
function groupMaybeStart(){if(!groupRoom||groupRoom.members.some(m=>m.response==='pending'))return;if(groupRoom.members.filter(m=>m.response==='join').length>=2)groupStart();}
function groupResetToSetup(){netPhase='setup';result=null;netReady={};groupCancel();netRoom.setLocked(false);showSetup();netPublish();}
function groupRestoreResult(){groupCancel();if(result&&netMembers().some(m=>m.id===result.winnerId)){netPhase='result';renderResult();netPublish();}else groupResetToSetup();}
function groupHandle(senderId,cmd){
 if(!netIsHost())return false;
 if(['brawlInvite','challenge'].includes(cmd.t)){if(netPhase==='result')groupInvite(senderId);return true;}
 if(!['brawlReply','brawlCancel','brawlInput'].includes(cmd.t))return false;
 if(!groupRoom||cmd.brawlId!==groupRoom.id)return true;const member=groupRoom.members.find(m=>m.id===senderId);if(!member)return true;
 if(cmd.t==='brawlReply'&&netPhase==='brawlInvite'){if(cmd.response==='join'&&typeof cmd.menu==='string'&&member.menus.includes(cmd.menu)){member.response='join';member.menu=cmd.menu;}else if(cmd.response==='pass'){member.response='pass';member.menu='';}else return true;groupShowInvite();netPublish();groupMaybeStart();return true;}
 if(cmd.t==='brawlCancel'&&netPhase==='brawlInvite'&&(senderId===groupRoom.creatorId||senderId===netSelfId())){groupRestoreResult();return true;}
 if(cmd.t==='brawlInput'&&netPhase==='brawl'&&member.response==='join'&&Number.isSafeInteger(cmd.seq)&&cmd.seq>(groupInputSeen[senderId]||0)&&['left','right','jump','attack','duck','guard','beam','sync'].includes(cmd.action)){groupInputSeen[senderId]=cmd.seq;brawlHostInput(senderId,{action:cmd.action,held:cmd.held,seq:cmd.seq});return true;}
 return true;
}
function netBrawlInput(action,held){if(netPhase==='brawl'&&groupRoom)netRoom.send({t:'brawlInput',brawlId:groupRoom.id,seq:++groupInputSeq,action,held});}
function netBrawlReady(){/* The first battle inherits the already confirmed lunch readiness. */}
function netBrawlPublish(force=false){if(!netIsHost()||netApplying||netPhase!=='brawl')return;const now=performance.now();if(!force&&now-groupLastPublish<50)return;groupLastPublish=now;netPublish();}
function netBrawlFinished(winnerId,reason){
 if(!netIsHost()||netPhase!=='brawl'||!groupRoom||groupFinishing)return;const winner=groupRoom.members.find(m=>m.id===winnerId&&m.response==='join');if(!winner||!netMembers().some(m=>m.id===winnerId))return;groupFinishing=true;groupRoom.winnerId=winnerId;groupRoom.reason=String(reason||'마지막 생존자');netBrawlPublish(true);const id=groupRoom.id;
 clearTimeout(groupFinishTimer);groupFinishTimer=setTimeout(()=>{if(!netIsHost()||netPhase!=='brawl'||groupRoom?.id!==id)return;if(!netMembers().some(m=>m.id===winnerId)){groupResetToSetup();return;}result={...result,person:winner.name,menu:winner.menu,winnerId,time:new Date().toISOString(),source:'duel',brawlId:id,duelCount:(result.duelCount||0)+1,verdict:'1등 쟁탈전 · '+winner.name+' 승리 · '+groupRoom.reason,nominations:result.nominations.filter(n=>netMembers().some(m=>m.id===n.id))};saveRound();netPhase='result';renderResult();netPublish();},2200);
}
function groupReceive(meta,fight){if(!meta)return;const previous=groupRoom?.id;groupRoom=netCopy(meta);if(netPhase==='brawlInvite'){groupFightId='';groupShowInvite();return;}if(netPhase==='brawl'&&groupRoom.spec){groupLobby&&(groupLobby.hidden=true);mode='brawl';if(previous!==groupRoom.id||groupFightId!==groupRoom.id){brawlPrepare(groupRoom.spec);groupFightId=groupRoom.id;}if(fight)brawlReceive(fight);}}
function groupPresence(event){
 if(!['brawlInvite','brawl'].includes(netPhase))return false;if(event.kind!=='leave'){netPublish();return true;}const id=event.memberId;delete netPicks[id];delete netReady[id];delete netDepartments[id];netSyncRoster();
 if(netPhase==='brawlInvite'){if(netMembers().length<2){groupResetToSetup();return true;}groupRoom.members=groupRoom.members.filter(m=>m.id!==id);groupShowInvite();netPublish();groupMaybeStart();return true;}
 if(groupFinishing){if(groupRoom.winnerId===id){groupResetToSetup();return true;}groupRoom.members=groupRoom.members.filter(m=>m.id!==id);netBrawlPublish(true);return true;}groupRoom.members=groupRoom.members.filter(m=>m.id!==id);brawlRemoveMember(id);netBrawlPublish(true);notify('나간 참가자는 기권 처리했어요. 남은 사람들이 계속 싸웁니다.');return true;
}
function groupCancel(){clearTimeout(groupFinishTimer);groupFinishTimer=0;groupFinishing=false;groupRoom=null;groupFightId='';groupInputSeen={};groupLobby&&(groupLobby.hidden=true);if(typeof brawlCancel==='function')brawlCancel();}
const groupPreviousSetup=showSetup;showSetup=function(){groupCancel();return groupPreviousSetup();};
const groupPreviousResult=renderResult;renderResult=function(){groupCancel();const out=groupPreviousResult();$('objectBtn').hidden=false;$('objectBtn').textContent='1등 쟁탈전 다시 도전';return out;};
netRoom.onDisconnect(event=>{if(event.self||event.hostLost)groupCancel();});


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
function arcadePracticeStart(){if(netIsActive()||!deptPracticeRequire(arcadePracticeStart))return;arcadePractice={bots:new Map(),startedAt:performance.now()};arcadePracticeSeq=0;document.body.classList.add('arcade-practice');const nick=$('roomNickname').value.trim().slice(0,12)||'내 그릇';brawlPrepare({id:'practice-'+Date.now(),participants:[{id:'practice-you',name:nick,menu:'내 밥',department:deptPracticeChoice},{id:'practice-a',name:'밥줘',menu:'남의 국밥',department:'accounting'},{id:'practice-b',name:'숟가락',menu:'남의 돈가스',department:'hotel'}]});brawlStart();}
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
 if(netIsActive()||!deptPracticeRequire(trayDemoStart))return;trayCancel();trayDemo=true;trayState={id:'tray_demo_'+Date.now(),context:'demo',phase:'game',members:[{id:'tray-you',name:'내 식판',department:deptPracticeChoice,response:'join'},{id:'tray-a',name:'밥줘',department:'accounting',response:'join'},{id:'tray-b',name:'숟가락',department:'hotel',response:'join'},{id:'tray-c',name:'국물',department:'economics',response:'join'}],world:null};
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
/* ARCADE_MOTION_RULES_V1 */
// Survival ends for this round only. The points controller creates a fresh
// participant list for the next minigame, including everyone who fell here.
function arcadeSurvivalGame(game){return ['dodge','runner','brawl','tray','dodgeball','lasers','frogger'].includes(game);}
function arcadeSurvivalScore(w,p,detail=0){
 if(p.forfeited)return 0;
 const alive=!p.eliminated,seconds=alive?w.elapsed:Math.max(0,Number.isFinite(p.fallAt)?p.fallAt:p.survived||0);
 return Math.max(0,Math.round(seconds*1000))+(alive?1000000+Math.max(0,Math.min(999,detail))/1000:0);
}
function arcadeSurvivalDetail(w,p){
 if(w.game==='brawl')return p.hp*2+p.damageDealt+p.knockouts*30;
 if(w.game==='tray')return p.shoves;
 if(w.game==='frogger')return p.deliveries*10+(p.goalRow===9?p.row:9-p.row);
 return p.health*10+(w.game==='runner'?p.cleared:w.game==='dodgeball'?p.hits:p.nearMisses||0);
}
function arcadeSurvivalEliminate(w,p){
 if(p.eliminated||p.forfeited)return false;p.eliminated=true;p.health=0;p.fallAt=w.elapsed;p.survived=w.elapsed;p.actionUntil=0;
 for(const key of ['vx','vy','dashUntil','attackUntil','jumpQueuedUntil'])if(key in p)p[key]=0;
 return true;
}
function arcadeSurvivalSettle(w,detail=p=>arcadeSurvivalDetail(w,p)){
 for(const p of w.players)p.score=arcadeSurvivalScore(w,p,detail(p));
 const living=w.players.filter(p=>!p.eliminated&&!p.forfeited);
 w.meta.roundOver=living.length<=1;
 if(w.meta.roundOver)w.meta.notice=living[0]?living[0].name+' 님 마지막 생존! 다음 게임에는 모두 다시 참여해요.':'동시 탈락! 같은 생존 시간은 공동 순위예요.';
}
function createArcadeMotionRules(){
 const W=700,H=460,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const unit=(x,y)=>{const d=Math.hypot(x,y);return d?[x/d,y/d]:[0,0];};
 const held=(controls,p)=>controls.get(p.id)?.held||new Set();
 const axes=keys=>unit(Number(keys.has('right'))-Number(keys.has('left')),Number(keys.has('down'))-Number(keys.has('up')));
 const active=p=>!p.eliminated&&!p.forfeited;
 const base=(w,p)=>{p.health=3;p.eliminated=false;p.stunUntil=0;p.actionUntil=0;p.score=0;p.deaths=0;p.respawnUntil=0;};
 const id=(w,prefix)=>prefix+'_'+(++w.meta.serial);
 function sneakScore(w,p){p.score=p.finishAt>=0?10000+Math.round((w.duration-p.finishAt)*100):Math.round(p.progress*10);}
 const sneak={
  init(w,random){
   w.duration=24;w.objects=[];w.meta={width:W,height:H,serial:0,signal:'green',signalSerial:0,signalChangedAt:0,nextSwitchAt:1.65+random()*1.1,grace:.32,finishY:52,startY:406,roundOver:false};
   w.players.forEach((p,i)=>{base(w,p);p.x=58+(W-116)*(i+1)/(w.players.length+1);p.y=406;p.progress=0;p.finishAt=-1;p.lastCaughtSignal=-1;p.caughtUntil=0;});
  },
  input(){},
  step(w,dt,controls,random){
   dt=clamp(dt,0,.04);const m=w.meta;
   if(w.elapsed>=m.nextSwitchAt){m.signal=m.signal==='green'?'red':'green';m.signalSerial++;m.signalChangedAt=w.elapsed;m.nextSwitchAt=w.elapsed+(m.signal==='green'?1.35+random()*1.55:1.0+random()*1.35);}
   for(const p of w.players){
    if(!active(p)||p.finishAt>=0)continue;
    const keys=held(controls,p),moving=keys.has('up')||keys.has('right')||keys.has('left')||keys.has('down');
    if(m.signal==='red'&&w.elapsed-m.signalChangedAt>m.grace&&moving&&p.lastCaughtSignal!==m.signalSerial){
     p.lastCaughtSignal=m.signalSerial;p.progress=Math.max(0,p.progress-78);p.stunUntil=w.elapsed+.72;p.caughtUntil=w.elapsed+.72;p.actionUntil=p.caughtUntil;
    }
    if(w.elapsed>=p.stunUntil&&keys.has('up')&&(m.signal==='green'||w.elapsed-m.signalChangedAt<=m.grace))p.progress=Math.min(m.startY-m.finishY,p.progress+99*dt);
    p.y=m.startY-p.progress;
    if(p.progress>=m.startY-m.finishY){p.finishAt=w.elapsed;p.actionUntil=w.elapsed+.65;}
    sneakScore(w,p);
   }
   const contenders=w.players.filter(active);if(contenders.length&&contenders.every(p=>p.finishAt>=0))m.roundOver=true;
  },
  bot(w,p){return{held:w.meta.signal==='green'&&w.elapsed-w.meta.signalChangedAt>.1?['up']:[]};}
 };
 const dodge={
  init(w,random){
   w.duration=24;w.objects=[];w.meta={width:W,height:H,serial:0,nextSpawnAt:.35,roundOver:false,roundSurvival:true,partyRespawn:false};
   w.players.forEach((p,i)=>{base(w,p);const a=i/w.players.length*Math.PI*2;p.x=W/2+Math.cos(a)*86;p.y=H/2+Math.sin(a)*86;p.dx=0;p.dy=-1;p.dashUntil=0;p.dashReadyAt=0;p.dodgeUntil=0;p.nearMisses=0;p.survived=0;});
  },
  input(w,p,action){
   if(action!=='dash'||w.elapsed<p.dashReadyAt)return false;
   p.dashUntil=w.elapsed+.17;p.dashReadyAt=w.elapsed+1.8;p.dodgeUntil=w.elapsed+.22;p.actionUntil=p.dashUntil;return true;
  },
  step(w,dt,controls,random){
   dt=clamp(dt,0,.04);
   if(w.elapsed>=w.meta.nextSpawnAt){
    const living=w.players.filter(active),target=living.length?living[Math.floor(random()*living.length)]:null,aim=target&&random()<.36;
    const x=aim?target.x+(random()-.5)*66:40+random()*(W-80),y=aim?target.y+(random()-.5)*66:45+random()*(H-90);
    w.objects.push({id:id(w,'food'),kind:'food',x:clamp(x,38,W-38),y:clamp(y,38,H-38),radius:36+random()*18,spawnAt:w.elapsed,impactAt:w.elapsed+.88,endAt:w.elapsed+1.18,resolved:false,emoji:['🍙','🍖','🥔','🍤'][Math.floor(random()*4)]});
    w.meta.nextSpawnAt=w.elapsed+Math.max(.28,.66-w.elapsed*.011);
   }
   for(const p of w.players){
    if(!active(p))continue;
    let [dx,dy]=axes(held(controls,p));if(dx||dy){p.dx=dx;p.dy=dy;}if(w.elapsed<p.dashUntil){dx=p.dx;dy=p.dy;}
    const speed=w.elapsed<p.dashUntil?475:196;
    if(w.elapsed>=p.stunUntil){p.x=clamp(p.x+dx*speed*dt,18,W-18);p.y=clamp(p.y+dy*speed*dt,24,H-18);}
    p.survived=w.elapsed;
   }
   for(const o of w.objects){
    if(o.resolved||w.elapsed<o.impactAt)continue;o.resolved=true;
    for(const p of w.players){
     if(!active(p))continue;
     const d=Math.hypot(p.x-o.x,p.y-o.y);
     if(d<o.radius+13&&w.elapsed>=p.dodgeUntil&&w.elapsed>=p.stunUntil){
      p.health--;p.stunUntil=w.elapsed+.72;p.actionUntil=w.elapsed+.25;
      if(p.health<=0)arcadeSurvivalEliminate(w,p);
     }else if(d>=o.radius+13&&d<o.radius+49)p.nearMisses++;
    }
   }
   w.objects=w.objects.filter(o=>w.elapsed<=o.endAt);
   arcadeSurvivalSettle(w,p=>p.health*10+p.nearMisses);
  },
  bot(w,p,random){
   const threats=w.objects.filter(o=>!o.resolved&&o.impactAt-w.elapsed<.8).sort((a,b)=>Math.hypot(p.x-a.x,p.y-a.y)-Math.hypot(p.x-b.x,p.y-b.y));
   let dx=(W/2-p.x)*.12,dy=(H/2-p.y)*.12;
   for(const o of threats){const d=Math.hypot(p.x-o.x,p.y-o.y);if(d<o.radius+100){const [ux,uy]=unit(p.x-o.x,p.y-o.y);dx+=ux*(o.radius+110-d);dy+=uy*(o.radius+110-d);}}
   const keys=[];if(dx>10)keys.push('right');if(dx< -10)keys.push('left');if(dy>10)keys.push('down');if(dy< -10)keys.push('up');
   const nearest=threats[0],urgent=nearest&&nearest.impactAt-w.elapsed<.3&&Math.hypot(p.x-nearest.x,p.y-nearest.y)<nearest.radius+22;
   return{held:keys,...urgent&&w.elapsed>=p.dashReadyAt&&random()<.65?{action:'dash'}:{}};
  }
 };
 function jump(w,p){if(p.jumpHeight>.01||w.elapsed<p.stunUntil)return false;p.jumpVy=510;p.jumpQueuedUntil=0;p.actionUntil=w.elapsed+.3;return true;}
 const runner={
  init(w,random){
   w.duration=24;w.objects=[];w.meta={width:W,height:H,serial:0,nextSpawnAt:.2,groundY:382,speed:218,roundOver:false,roundSurvival:true,partyRespawn:false};
   w.players.forEach(p=>{base(w,p);p.x=118;p.y=382;p.jumpHeight=0;p.jumpVy=0;p.jumpQueuedUntil=0;p.cleared=0;p.survived=0;p.lastHurtAt=-10;});
  },
  input(w,p,action){if(action!=='jump')return false;if(jump(w,p))return true;if(p.jumpVy<0&&w.elapsed>=p.stunUntil){p.jumpQueuedUntil=w.elapsed+.14;return true;}return false;},
  step(w,dt,controls,random){
   dt=clamp(dt,0,.04);w.meta.speed=218+Math.min(45,w.elapsed*2);
   if(w.elapsed>=w.meta.nextSpawnAt){
    w.objects.push({id:id(w,'hurdle'),kind:'hurdle',x:W+42,y:w.meta.groundY,width:26+random()*15,height:31+random()*18,speed:w.meta.speed,spawnAt:w.elapsed,hitIds:[],clearedIds:[],emoji:['📦','🧱','🖨️'][Math.floor(random()*3)]});
    w.meta.nextSpawnAt=w.elapsed+1.23+random()*.52;
   }
   for(const p of w.players){
    if(!active(p))continue;
    p.jumpVy-=1250*dt;p.jumpHeight+=p.jumpVy*dt;
    if(p.jumpHeight<=0){p.jumpHeight=0;p.jumpVy=0;if(p.jumpQueuedUntil>=w.elapsed&&p.jumpQueuedUntil>0)jump(w,p);}
    p.y=w.meta.groundY-p.jumpHeight;p.survived=w.elapsed;
   }
   for(const o of w.objects){
    o.x-=o.speed*dt;
    for(const p of w.players){
     if(!active(p))continue;
     const overlaps=Math.abs(o.x-p.x)<o.width/2+14;
     if(overlaps&&p.jumpHeight<o.height-3&&!o.hitIds.includes(p.id)){
      o.hitIds.push(p.id);
      if(w.elapsed-p.lastHurtAt>=.65){p.health--;p.lastHurtAt=w.elapsed;p.stunUntil=w.elapsed+.24;p.actionUntil=w.elapsed+.3;if(p.health<=0)arcadeSurvivalEliminate(w,p);}
     }
     if(o.x+o.width/2<p.x-14&&!o.clearedIds.includes(p.id)){o.clearedIds.push(p.id);if(!o.hitIds.includes(p.id))p.cleared++;}
    }
   }
   w.objects=w.objects.filter(o=>o.x> -65);
   arcadeSurvivalSettle(w,p=>p.health*10+p.cleared);
  },
  bot(w,p){
   const ahead=w.objects.filter(o=>!o.hitIds.includes(p.id)&&o.x>p.x-15).sort((a,b)=>a.x-b.x)[0];
   return{held:[],...ahead&&ahead.x-p.x<ahead.speed*.5&&ahead.x>p.x&&p.jumpHeight===0?{action:'jump'}:{}};
  }
 };
 return{sneak,dodge,runner};
}
/* END_ARCADE_MOTION_RULES_V1 */

/* ARCADE_SKILL_RULES_V1 */
function createArcadeSkillRules(){
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),tau=Math.PI*2;
 const alive=p=>!p.eliminated&&!p.forfeited;
 const held=(controls,id)=>controls.get(id)?.held||new Set();
 function direction(keys){let x=Number(keys.has('right'))-Number(keys.has('left')),y=Number(keys.has('down'))-Number(keys.has('up'));const d=Math.hypot(x,y)||1;return{x:x/d,y:y/d};}
 function coinSpawn(w,random,delay=.55){
  const n=++w.meta.coinSerial;
  w.objects.push({id:'coin_'+n,kind:'coin',x:38+random()*624,y:38+random()*384,readyAt:w.elapsed+delay,expiresAt:w.elapsed+delay+7.5,value:1});
 }
 function coinSteal(w,p,range){
  if(p.dashStolen||w.elapsed<p.shieldUntil)return false;
  const victims=w.players.filter(q=>q.id!==p.id&&alive(q)&&q.score>=1&&w.elapsed>=q.shieldUntil&&Math.hypot(q.x-p.x,q.y-p.y)<range).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y)||a.index-b.index),q=victims[0];
  if(!q)return false;p.dashStolen=true;q.score--;p.score++;p.stolen++;p.lastEvent='steal';q.lastEvent='stolen';p.shieldUntil=w.elapsed+.6;q.shieldUntil=w.elapsed+.6;q.actionUntil=w.elapsed+.3;w.meta.notice=p.name+' 님이 '+q.name+' 님 월급 한 닢 슬쩍!';return true;
 }
 const coins={
  init(w,random){
   w.duration=24;w.meta={coinSerial:0,nextCoinAt:.65,notice:'금색 동전을 줍고, 가까이 붙어서 Space로 월급 한 닢 슬쩍!'};w.objects=[];
   const n=w.players.length;
   w.players.forEach((p,i)=>{const a=-Math.PI/2+i*tau/n;p.x=350+Math.cos(a)*204;p.y=230+Math.sin(a)*138;p.score=0;p.health=3;p.dirX=-Math.cos(a);p.dirY=-Math.sin(a);p.dashReadyAt=0;p.dashUntil=0;p.dashStolen=false;p.shieldUntil=0;p.coinsCollected=0;p.stolen=0;p.lastEvent='';});
   for(let i=0;i<8;i++)coinSpawn(w,random,.65);
  },
  input(w,p,action){
   if(action!=='dash'&&action!=='hit')return;
   if(w.elapsed+1e-7<p.dashReadyAt)return;
   p.dashReadyAt=w.elapsed+2;p.dashUntil=w.elapsed+.18;p.dashStolen=false;p.actionUntil=p.dashUntil;p.lastEvent='dash';
   const norm=Math.hypot(p.dirX,p.dirY)||1;p.dirX/=norm;p.dirY/=norm;
   coinSteal(w,p,82);
  },
  step(w,dt,controls,random){
   for(const p of w.players){if(!alive(p))continue;const d=direction(held(controls,p.id));if(Math.hypot(d.x,d.y)>0&&w.elapsed>=p.dashUntil){p.dirX=d.x;p.dirY=d.y;}const isDash=w.elapsed<p.dashUntil,speed=isDash?540:188;const x=isDash?p.dirX:d.x,y=isDash?p.dirY:d.y;p.x=clamp(p.x+x*speed*dt,20,680);p.y=clamp(p.y+y*speed*dt,20,440);if(isDash)coinSteal(w,p,54);}
   while(w.elapsed>=w.meta.nextCoinAt&&w.meta.nextCoinAt<=w.duration){coinSpawn(w,random);w.meta.nextCoinAt+=.62;}
   const keep=[];
   for(const c of w.objects){
    if(w.elapsed>=c.expiresAt)continue;
    if(w.elapsed<c.readyAt){keep.push(c);continue;}
    const candidates=w.players.filter(p=>alive(p)&&Math.hypot(c.x-p.x,c.y-p.y)<=25);
    candidates.sort((a,b)=>Math.hypot(a.x-c.x,a.y-c.y)-Math.hypot(b.x-c.x,b.y-c.y)||((a.index+w.meta.coinSerial)%w.players.length)-((b.index+w.meta.coinSerial)%w.players.length));
    if(candidates[0]){const p=candidates[0];p.score+=c.value;p.coinsCollected++;p.lastEvent='coin';p.actionUntil=Math.max(p.actionUntil,w.elapsed+.18);}else keep.push(c);
   }
   w.objects=keep;
  },
  bot(w,p,random){
   const targets=w.objects.filter(c=>c.expiresAt>w.elapsed).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y));
   const t=targets[0],keys=[];if(t){if(t.x<p.x-7)keys.push('left');if(t.x>p.x+7)keys.push('right');if(t.y<p.y-7)keys.push('up');if(t.y>p.y+7)keys.push('down');}
   const victim=w.players.some(q=>q.id!==p.id&&alive(q)&&q.score>0&&Math.hypot(q.x-p.x,q.y-p.y)<78);
   return{held:keys,...(victim&&w.elapsed>=p.dashReadyAt&&random()<.6?{action:'dash'}:{})};
  }
 };
 const stampPeriod=1.7,stampStageLength=2.4;
 function stampPointer(t){const phase=((t/stampPeriod)%1+1)%1;return phase<.5?phase*2:2-phase*2;}
 function stampStage(w){
  const stage=Math.min(w.meta.targets.length-1,Math.floor((w.elapsed+1e-8)/stampStageLength));w.meta.stage=stage;w.meta.target=w.meta.targets[stage];w.meta.window=stage<3?.30:stage<7?.26:.22;w.meta.stageLeft=Math.max(0,stampStageLength-(w.elapsed-stage*stampStageLength));w.meta.pointer=stampPointer(w.elapsed);
  return stage;
 }
 const stamp={
  init(w,random){
   w.duration=24;w.objects=[];w.meta={stage:0,target:.5,window:.26,stageLength:stampStageLength,stageLeft:stampStageLength,pointer:0,targets:Array.from({length:10},()=>.18+random()*.64),notice:'초록 칸에 바늘이 들어올 때 Space! 한 칸마다 도장은 딱 한 번.'};
   stampStage(w);for(const p of w.players){p.x=350;p.y=230;p.score=0;p.health=3;p.pointer=0;p.lastStampStage=-1;p.stampAt=-1;p.stampPos=0;p.stampResult='';p.stampPoints=0;p.hits=0;p.misses=0;p.actionUntil=0;}
  },
  input(w,p,action){
   if(!['hit','dash','jump'].includes(action))return;const stage=stampStage(w);if(p.lastStampStage===stage)return;
   p.lastStampStage=stage;p.stampAt=w.elapsed;p.stampPos=stampPointer(w.elapsed);p.pointer=p.stampPos;const error=Math.abs(p.stampPos-w.meta.target),half=w.meta.window/2;p.actionUntil=w.elapsed+.48;
   if(error<=half+1e-7){const points=Math.round(60+40*(1-error/half));p.score+=points;p.hits++;p.stampResult=points>=93?'perfect':'hit';p.stampPoints=points;w.meta.notice=p.name+' 님 '+(points>=93?'정중앙 결재!':'결재 성공!');}else{p.score=Math.max(0,p.score-15);p.misses++;p.stampResult='miss';p.stampPoints=-15;w.meta.notice=p.name+' 님 반려! 다음 초록 칸을 노려요.';}
  },
  step(w,dt,controls,random){stampStage(w);for(const p of w.players){p.pointer=w.meta.pointer;}},
  bot(w,p,random){const stage=Math.floor((w.elapsed+1e-8)/stampStageLength),error=Math.abs(stampPointer(w.elapsed)-w.meta.target);return{held:[],...(p.lastStampStage!==stage&&error<.078&&random()<.78?{action:'hit'}:{})};}
 };
 return{coins,stamp};
}

/* ARCADE_COMBAT_KART_RULES_V1 */
// A rounded campus circuit. Rendering and physics share this arc-length table.
// The lower chicane and long straights are real course segments, not scenery.
function arcadeKartTrackData(){
 if(arcadeKartTrackData.cache)return arcadeKartTrackData.cache;
 const corners=[[160,88],[540,88],[610,158],[610,310],[550,372],[430,372],[430,268],[295,268],[295,372],[155,372],[90,305],[90,158]],points=[];
 const unit=(x,y)=>{const d=Math.hypot(x,y)||1;return{x:x/d,y:y/d};};
 const rounded=corners.map((p,i)=>{const prev=corners[(i+corners.length-1)%corners.length],next=corners[(i+1)%corners.length],a=unit(prev[0]-p[0],prev[1]-p[1]),b=unit(next[0]-p[0],next[1]-p[1]),trim=Math.min(46,Math.hypot(prev[0]-p[0],prev[1]-p[1])*.45,Math.hypot(next[0]-p[0],next[1]-p[1])*.45);return{p:{x:p[0],y:p[1]},enter:{x:p[0]+a.x*trim,y:p[1]+a.y*trim},exit:{x:p[0]+b.x*trim,y:p[1]+b.y*trim},out:b};});
 let length=0;
 function add(x,y,tx,ty){const before=points.at(-1);if(before)length+=Math.hypot(x-before.x,y-before.y);const tangent=unit(tx,ty);points.push({x,y,tx:tangent.x,ty:tangent.y,d:length});}
 const first=rounded[0];add(first.exit.x,first.exit.y,first.out.x,first.out.y);
 for(let i=1;i<=rounded.length;i++){const corner=rounded[i%rounded.length],before=points.at(-1);add(corner.enter.x,corner.enter.y,corner.enter.x-before.x,corner.enter.y-before.y);for(let j=1;j<=16;j++){const t=j/16,u=1-t;add(u*u*corner.enter.x+2*u*t*corner.p.x+t*t*corner.exit.x,u*u*corner.enter.y+2*u*t*corner.p.y+t*t*corner.exit.y,2*u*(corner.p.x-corner.enter.x)+2*t*(corner.exit.x-corner.p.x),2*u*(corner.p.y-corner.enter.y)+2*t*(corner.exit.y-corner.p.y));}}
 return arcadeKartTrackData.cache={points,length};
}
function arcadeKartTrackPoint(angle,lane=0){
 const {points,length}=arcadeKartTrackData(),tau=Math.PI*2,lap=((angle+Math.PI/2)/tau%1+1)%1,d=lap*length;let low=0,high=points.length-1;
 while(high-low>1){const mid=(low+high)>>1;if(points[mid].d<=d)low=mid;else high=mid;}
 const a=points[low],b=points[high],t=(d-a.d)/Math.max(.0001,b.d-a.d),tx=a.tx+(b.tx-a.tx)*t,ty=a.ty+(b.ty-a.ty)*t,norm=Math.hypot(tx,ty)||1,offset=Math.max(-1.8,Math.min(1.8,lane))*24;
 return{x:a.x+(b.x-a.x)*t+ty/norm*offset,y:a.y+(b.y-a.y)*t-tx/norm*offset,tx:tx/norm,ty:ty/norm};
}
function arcadeKartTrackPath(lane=0){
 const tau=Math.PI*2;return Array.from({length:257},(_,i)=>{const p=arcadeKartTrackPoint(i/256*tau-Math.PI/2,lane);return(i?'L':'M')+p.x.toFixed(2)+' '+p.y.toFixed(2);}).join(' ')+' Z';
}
function createArcadeCombatKartRules(){
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),tau=Math.PI*2,alive=p=>!p.eliminated&&!p.forfeited;
 const keys=(c,id)=>c.get(id)?.held||new Set();
 function direction(k){let x=Number(k.has('right'))-Number(k.has('left')),y=Number(k.has('down'))-Number(k.has('up'));const d=Math.hypot(x,y)||1;return{x:x/d,y:y/d};}
 function brawlScore(w,p){return arcadeSurvivalScore(w,p,p.hp*2+p.damageDealt+p.knockouts*30);}
 const brawl={
  init(w){w.duration=24;w.objects=[];w.meta={roundSurvival:true,partyRespawn:false,notice:'체력 100! 쓰러지면 이번 판은 관전. 마지막까지 살아남아라!'};const n=w.players.length;
   w.players.forEach((p,i)=>{const a=-Math.PI/2+i*tau/n;p.x=350+Math.cos(a)*190;p.y=230+Math.sin(a)*135;p.hp=100;p.health=3;p.score=0;p.faceX=-Math.cos(a);p.faceY=-Math.sin(a);p.vx=0;p.vy=0;p.attackUntil=0;p.hitReadyAt=0;p.hurtUntil=0;p.stunUntil=0;p.survived=0;p.deaths=0;p.respawnUntil=0;p.damageDealt=0;p.knockouts=0;});
  },
  input(w,p,action){
   if(action!=='hit'||w.elapsed<p.hitReadyAt||w.elapsed<p.stunUntil)return;
   p.hitReadyAt=w.elapsed+.55;p.attackUntil=w.elapsed+.18;p.actionUntil=p.attackUntil;
   const len=Math.hypot(p.faceX,p.faceY)||1,fx=p.faceX/len,fy=p.faceY/len;
   const victims=w.players.filter(q=>q!==p&&alive(q)&&w.elapsed>=q.hurtUntil).map(q=>{const dx=q.x-p.x,dy=q.y-p.y,d=Math.hypot(dx,dy);return{q,dx,dy,d,dot:d>0?(dx*fx+dy*fy)/d:1};}).filter(v=>v.d<=84&&v.dot>=.05).sort((a,b)=>a.d-b.d||a.q.index-b.q.index);
   const hit=victims[0];if(!hit)return;const q=hit.q,norm=hit.d||1,nx=hit.d?hit.dx/norm:fx,ny=hit.d?hit.dy/norm:fy;
   p.damageDealt+=Math.min(q.hp,28);q.hp=Math.max(0,q.hp-28);q.health=Math.min(3,Math.ceil(q.hp/34));q.vx=nx*255;q.vy=ny*255;q.stunUntil=w.elapsed+.16;q.hurtUntil=w.elapsed+.22;
   w.objects.push({kind:'punch',x:q.x,y:q.y,until:w.elapsed+.23});
   if(q.hp<=0){p.knockouts++;q.deaths++;arcadeSurvivalEliminate(w,q);q.score=brawlScore(w,q);w.meta.notice=p.name+' 님의 주먹! '+q.name+' 님 이번 판 탈락 · 다음 게임에 복귀.';}
   p.survived=w.elapsed;p.score=brawlScore(w,p);
  },
  step(w,dt,controls){
   w.objects=w.objects.filter(o=>o.until>w.elapsed);
   for(const p of w.players){if(!alive(p))continue;const d=direction(keys(controls,p.id));
    if(Math.hypot(d.x,d.y)>0&&w.elapsed>=p.stunUntil){p.faceX=d.x;p.faceY=d.y;}
    const move=w.elapsed>=p.stunUntil?176:0;p.x=clamp(p.x+(d.x*move+p.vx)*dt,26,674);p.y=clamp(p.y+(d.y*move+p.vy)*dt,30,430);p.vx*=Math.exp(-9*dt);p.vy*=Math.exp(-9*dt);p.survived=w.elapsed;p.score=brawlScore(w,p);
   }
   arcadeSurvivalSettle(w,p=>p.hp*2+p.damageDealt+p.knockouts*30);
  },
  bot(w,p){
   const target=w.players.filter(q=>q!==p&&alive(q)).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y)||a.index-b.index)[0];if(!target)return{held:[]};
   const dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy),held=[];
   if(d>47){if(dx>8)held.push('right');if(dx< -8)held.push('left');if(dy>8)held.push('down');if(dy< -8)held.push('up');}
   return{held,...(d<=81&&w.elapsed>=p.hitReadyAt?{action:'hit'}:{})};
  }
 };
 function project(angle,lane){return arcadeKartTrackPoint(angle,lane);}
 function angularDistance(a,b){return Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));}
 function updateKart(p){p.angle=p.progress*tau-Math.PI/2;const q=project(p.angle+(p.visualOffset||0),p.lane);p.x=q.x;p.y=q.y;}
 const kart={
  init(w,random){w.duration=24;w.objects=[];w.meta={laps:3,totalProgress:3,track:'campus-circuit',nextHazardAt:.8,serial:0,firstFinishAt:-1,notice:'출발선을 지나 직선과 커브를 달려요! ↑ 가속 · ←/→ 차선 · Space 터보 · 3바퀴 완주!'};const n=w.players.length;
   w.players.forEach((p,i)=>{p.progress=0;p.lane=i%3-1;p.visualOffset=(Math.floor(i/3)-(Math.floor((n-1)/3))/2)*.095;p.angle=-Math.PI/2;p.speed=0;p.score=0;p.health=3;p.dashUntil=0;p.dashReadyAt=0;p.pickupUntil=0;p.laneReadyAt=0;p.stunUntil=0;p.finishAt=-1;p.hitCount=0;updateKart(p);});
  },
  input(w,p,action){if(action!=='dash'||p.finishAt>=0||w.elapsed<p.dashReadyAt)return;p.dashUntil=w.elapsed+.65;p.dashReadyAt=w.elapsed+2.4;p.actionUntil=p.dashUntil;},
  step(w,dt,controls,random){
   while(w.elapsed>=w.meta.nextHazardAt){const angle=random()*tau,lane=Math.floor(random()*3)-1,pos=project(angle,lane),kind=random()<.7?'puddle':'boost';w.objects.push({id:'kart_'+(++w.meta.serial),kind,angle,lane,x:pos.x,y:pos.y,readyAt:w.elapsed+.6,until:w.elapsed+4.2,hitIds:[]});w.meta.nextHazardAt+=.9;}
   w.objects=w.objects.filter(o=>o.until>w.elapsed);
   for(const p of w.players){if(!alive(p)||p.finishAt>=0)continue;const held=keys(controls,p.id),steer=Number(held.has('right'))-Number(held.has('left'));
    if(steer&&w.elapsed>=p.laneReadyAt){p.lane=clamp(p.lane+steer,-1,1);p.laneReadyAt=w.elapsed+.24;}
    const accelerated=held.has('up'),brake=held.has('down'),turbo=w.elapsed<p.dashUntil||w.elapsed<p.pickupUntil;
    const speed=w.elapsed<p.stunUntil?.042:turbo?.215:brake?.067:accelerated?.142:.102;p.speed=speed;p.progress=Math.min(w.meta.totalProgress,p.progress+speed*dt);updateKart(p);
    for(const o of w.objects){if(w.elapsed<o.readyAt||w.elapsed>=o.until||o.hitIds.includes(p.id)||o.lane!==p.lane||angularDistance(p.angle+(p.visualOffset||0),o.angle)>.085)continue;o.hitIds.push(p.id);if(o.kind==='puddle'){p.stunUntil=w.elapsed+.62;p.hitCount++;w.meta.notice=p.name+' 님 물웅덩이! 차선을 바꿔 피해요.';}else{p.pickupUntil=w.elapsed+.8;o.until=w.elapsed;w.meta.notice=p.name+' 님 커피 부스트!';}break;}
    if(p.progress>=w.meta.totalProgress-1e-8){p.progress=w.meta.totalProgress;p.finishAt=w.elapsed;if(w.meta.firstFinishAt<0)w.meta.firstFinishAt=w.elapsed;w.meta.notice=p.name+' 님 '+w.meta.laps+'바퀴 완주!';}
    p.score=p.finishAt>=0?10000+(w.duration-p.finishAt)*100:p.progress*1000;
   }
   const racers=w.players.filter(alive);if(racers.length&&racers.every(p=>p.finishAt>=0)||w.meta.pointsStage!=='regular'&&w.meta.firstFinishAt>=0&&w.elapsed-w.meta.firstFinishAt>=3)w.meta.roundOver=true;
  },
  bot(w,p,random){const held=['up'],angle=p.angle+(p.visualOffset||0),ahead=w.objects.filter(o=>o.lane===p.lane&&o.kind==='puddle'&&o.until>w.elapsed&&angularDistance(angle+Math.PI*.1,o.angle)<.43).sort((a,b)=>angularDistance(angle,a.angle)-angularDistance(angle,b.angle))[0];
   if(ahead){if(p.lane===-1)held.push('right');else if(p.lane===1)held.push('left');else held.push(p.index%2?'left':'right');}
   return{held,...(w.elapsed>=p.dashReadyAt&&random()<.88?{action:'dash'}:{})};
  }
 };
 return{brawl,kart};
}
/* END_ARCADE_COMBAT_KART_RULES_V1 */

/* ARCADE_SOCIAL_RHYTHM_RULES_V1 */
function createArcadeSocialRhythmRules(){
 const doorSecrets=new WeakMap(),rhythmSecrets=new WeakMap(),actions=['jump','hit','dash'];
 const alive=p=>!p.eliminated&&!p.forfeited;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 function doorBegin(w,s){
  s.choices.clear();s.resolved=false;
  const reserved=[0,1,2];for(let i=2;i>0;i--){const j=Math.floor(s.random()*(i+1));[reserved[i],reserved[j]]=[reserved[j],reserved[i]];}
  w.meta.stage=s.stage;w.meta.phase='choose';w.meta.stageLeft=3.15;w.meta.counts=[0,0,0];w.meta.totalCounts=[0,0,0];w.meta.reservedCounts=reserved;w.meta.notice='예약 손님 '+reserved.join(' / ')+'명. 덜 붐빌 식당을 골라! 남의 선택은 비밀.';
  for(const p of w.players){p.choice=-1;p.locked=false;p.roundPoints=0;p.x=350;p.y=96+p.index*38;}
 }
 function doorResolve(w,s){
  if(s.resolved)return;s.resolved=true;const counts=[0,0,0];
  for(const p of w.players)if(alive(p)&&s.choices.has(p.id))counts[s.choices.get(p.id)]++;
  w.meta.phase='reveal';w.meta.counts=counts;w.meta.totalCounts=counts.map((n,i)=>n+w.meta.reservedCounts[i]);
  for(const p of w.players){
   if(!alive(p))continue;const choice=s.choices.has(p.id)?s.choices.get(p.id):-1,points=choice<0?-10:Math.round(100/w.meta.totalCounts[choice]);
   p.choice=choice;p.roundPoints=points;p.score=Math.max(0,p.score+points);p.x=choice<0?350:115+choice*235;p.y=110+p.index*32;p.actionUntil=w.elapsed+.45;
  }
  const occupied=counts.filter(n=>n>0),least=occupied.length?Math.min(...occupied):0;
  w.meta.notice=least?'전체 손님 '+w.meta.totalCounts.join(' / ')+'명! 예약 손님까지 합쳐 덜 붐비면 높은 점수.':'아무도 못 골랐다. 다음에는 손 좀 빨리!';
 }
 const doors={
  init(w,random){
   w.duration=24;w.objects=[];w.meta={phase:'choose',stage:0,stageLeft:3.15,stageLength:4,chooseLength:3.15,counts:[0,0,0],labels:['왼쪽 식당','가운데 식당','오른쪽 식당'],notice:''};
   for(const p of w.players){p.score=0;p.health=3;p.eliminated=false;p.choice=-1;p.locked=false;p.roundPoints=0;}
   const s={stage:0,choices:new Map(),resolved:false,random:typeof random==='function'?random:()=>.5};doorSecrets.set(w,s);doorBegin(w,s);
  },
  input(w,p,action){
   const s=doorSecrets.get(w),choice=actions.indexOf(action);
   if(!s||choice<0||!alive(p)||w.meta.phase!=='choose'||w.elapsed-s.stage*4>=3.15||s.choices.has(p.id))return false;
   s.choices.set(p.id,choice);p.locked=true;p.actionUntil=w.elapsed+.18;return true;
  },
  step(w){
   const s=doorSecrets.get(w);if(!s)return false;const stage=Math.min(5,Math.max(0,Math.floor(w.elapsed/4)));
   while(s.stage<stage){doorResolve(w,s);s.stage++;doorBegin(w,s);}
   const local=w.elapsed-s.stage*4;
   if(local>=3.15)doorResolve(w,s);
   w.meta.stage=s.stage;w.meta.stageLeft=Math.max(0,(s.resolved?4:3.15)-local);
   return true;
  },
  bot(w,p,random){
   if(!doorSecrets.has(w)||w.meta.phase!=='choose'||p.locked||!alive(p)||w.elapsed-w.meta.stage*4<.55+p.index*.13)return{held:[]};
   return{held:[],action:actions[Math.floor(random()*3)%3]};
  }
 };
 function rhythmJudge(p,name,t){p.judge=name;p.judgeUntil=t+.55;p.actionUntil=t+.16;}
 function rhythmResolve(p,secret,note){secret.resolved.add(note.id);p.resolvedNotes.push(note.id);}
 const rhythm={
  init(w,random){
   w.duration=24;w.meta={travelTime:1.65,hitWindow:.24,perfectWindow:.09,noteTotal:26,notice:'왼쪽 A · 가운데 W/Space · 오른쪽 D. 복사기 박자에 맞춰 눌러!'};
   const phrases=[[0,1,2,1],[0,0,1,2],[2,1,0,1],[1,2,1,0],[0,2,0,2],[1,1,0,2]],chart=[];
   for(let phrase=0;phrase<7;phrase++){const pattern=phrases[Math.floor(random()*phrases.length)],rotate=Math.floor(random()*3);chart.push(...pattern.map(lane=>(lane+rotate)%3));}
   w.objects=Array.from({length:26},(_,i)=>({id:'beat_'+i,kind:'note',lane:chart[i],hitAt:1.4+i*.84}));
   const people=new Map();
   for(const p of w.players){p.x=350;p.y=230;p.score=0;p.health=3;p.combo=0;p.judge='';p.judgeUntil=0;p.hits=0;p.misses=0;p.lastHitLane=-1;p.resolvedNotes=[];people.set(p.id,{resolved:new Set(),nextActionAt:0});}
   rhythmSecrets.set(w,{people});
  },
  input(w,p,action){
   const state=rhythmSecrets.get(w),secret=state?.people.get(p.id),lane=actions.indexOf(action),t=w.elapsed;
   if(!secret||lane<0||!alive(p)||t+1e-7<secret.nextActionAt)return false;secret.nextActionAt=t+.12;p.lastHitLane=lane;
   const candidates=w.objects.filter(n=>!secret.resolved.has(n.id)&&n.lane===lane&&Math.abs(t-n.hitAt)<=w.meta.hitWindow+1e-7).sort((a,b)=>Math.abs(t-a.hitAt)-Math.abs(t-b.hitAt));
   const note=candidates[0];
   if(!note){p.combo=0;p.misses++;p.score=Math.max(0,p.score-8);rhythmJudge(p,'MISS',t);return false;}
   const error=Math.abs(t-note.hitAt),perfect=error<=w.meta.perfectWindow+1e-7;
   p.combo++;p.hits++;p.score+=(perfect?100:Math.round(65+25*(1-error/w.meta.hitWindow)))+Math.min(20,(p.combo-1)*2);
   rhythmResolve(p,secret,note);rhythmJudge(p,perfect?'PERFECT':'GOOD',t);return true;
  },
  step(w){
   const state=rhythmSecrets.get(w);if(!state)return false;
   for(const p of w.players){const secret=state.people.get(p.id);if(!secret||!alive(p))continue;
    for(const note of w.objects)if(!secret.resolved.has(note.id)&&w.elapsed>note.hitAt+w.meta.hitWindow+1e-7){rhythmResolve(p,secret,note);p.combo=0;p.misses++;p.score=Math.max(0,p.score-10);rhythmJudge(p,'MISS',w.elapsed);}
   }
   return true;
  },
  bot(w,p,random){
   const state=rhythmSecrets.get(w),secret=state?.people.get(p.id);if(!secret||!alive(p))return{held:[]};
   const note=w.objects.filter(n=>!secret.resolved.has(n.id)).sort((a,b)=>Math.abs(w.elapsed-a.hitAt)-Math.abs(w.elapsed-b.hitAt))[0];
   if(note&&Math.abs(w.elapsed-note.hitAt)<.15&&random()<.83)return{held:[],action:actions[note.lane]};
   return{held:[]};
  }
 };
 return{doors,rhythm};
}
/* END_ARCADE_SOCIAL_RHYTHM_RULES_V1 */

/* ARCADE_BASKET_RULES_V1 */
function createArcadeBasketRules(){
 const gravity=560,ballSpeed=590,hoopY=150,hoopRadius=27,shotGap=.78;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const alive=p=>!p.eliminated&&!p.forfeited;
 const hoopAt=t=>350+40*Math.sin(t*.8);
 function arrival(angle,launchY=370){const a=angle*Math.PI/180,vy=-ballSpeed*Math.sin(a),d=vy*vy-2*gravity*(launchY-hoopY);return d>0?(-vy+Math.sqrt(d))/gravity:null;}
 function aimFor(x,t){
  let best=90,error=Infinity;
  for(let angle=66;angle<=114;angle+=.25){const flight=arrival(angle);if(!flight)continue;const landed=x+ballSpeed*Math.cos(angle*Math.PI/180)*flight,miss=Math.abs(landed-hoopAt(t+flight));if(miss<error){error=miss;best=angle;}}
  return best;
 }
 const basket={
  init(w,random){
   w.duration=24;w.objects=[];w.meta={hoopX:hoopAt(0),hoopY,hoopRadius,gravity,ballSpeed,ballSerial:0,notice:'←/→로 슛 각도 조절, Space로 던져! 정중앙으로 넣으면 3점.'};
   const n=w.players.length;
   for(let i=0;i<n;i++){const p=w.players[i];p.x=n===1?350:180+i*340/(n-1);p.y=400;p.aim=aimFor(p.x,0);p.score=0;p.health=3;p.shotReadyAt=0;p.lastShotResult='';p.lastScoreAt=-1;p.makes=0;p.attempts=0;p.actionUntil=0;p.botAimOffset=(random()-.5)*1.6;}
  },
  input(w,p,action){
   if(!alive(p)||!['hit','jump','dash'].includes(action)||w.elapsed+1e-8<p.shotReadyAt)return;
   p.shotReadyAt=w.elapsed+shotGap;p.actionUntil=w.elapsed+.25;p.attempts++;p.lastShotResult='슛!';
   const a=clamp(p.aim,66,114)*Math.PI/180;
   w.objects.push({id:'basket_'+(++w.meta.ballSerial),kind:'basketBall',ownerId:p.id,x:p.x,y:p.y-30,vx:ballSpeed*Math.cos(a),vy:-ballSpeed*Math.sin(a),shotAt:w.elapsed,scored:false,points:0});
  },
  step(w,dt,controls){
   w.meta.hoopX=hoopAt(w.elapsed);
   for(const p of w.players){if(!alive(p))continue;const keys=controls.get(p.id)?.held||new Set(),steer=Number(keys.has('left'))-Number(keys.has('right'));p.aim=clamp(p.aim+steer*32*dt,66,114);}
   const keep=[];
   for(const ball of w.objects){
    const beforeX=ball.x,beforeY=ball.y;ball.vy+=gravity*dt;ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;
    if(!ball.scored&&ball.vy>0&&beforeY<=hoopY&&ball.y>=hoopY){
     const f=(hoopY-beforeY)/Math.max(1e-9,ball.y-beforeY),crossX=beforeX+(ball.x-beforeX)*f;
     const crossTime=w.elapsed-dt+f*dt,miss=Math.abs(crossX-hoopAt(crossTime));
     if(miss<=hoopRadius){
      const player=w.players.find(p=>p.id===ball.ownerId);
      ball.scored=true;ball.points=miss<=7?3:2;
      if(player&&alive(player)){player.score+=ball.points;player.makes++;player.lastScoreAt=w.elapsed;player.lastShotResult=ball.points===3?'깔끔한 3점!':'골인! +2';player.actionUntil=w.elapsed+.5;w.meta.notice=player.name+' 님 '+(ball.points===3?'정중앙 3점!':'골인!');}
     }
    }
    if(ball.y<495&&ball.x> -70&&ball.x<770&&w.elapsed-ball.shotAt<3.1)keep.push(ball);
    else if(!ball.scored){const player=w.players.find(p=>p.id===ball.ownerId);if(player&&alive(player)&&w.elapsed-player.lastScoreAt>.35)player.lastShotResult='아깝다! 다시 한 번.';}
   }
   w.objects=keep;
  },
  bot(w,p,random){
   if(!alive(p))return{held:[]};
   const wanted=aimFor(p.x,w.elapsed)+p.botAimOffset,delta=wanted-p.aim,held=delta> .45?['left']:delta<-.45?['right']:[];
   const fire=w.elapsed>=p.shotReadyAt&&Math.abs(delta)<1.4&&random()<.8;
   return{held,...(fire?{action:'hit'}:{})};
  }
 };
 return{basket};
}
/* END_ARCADE_BASKET_RULES_V1 */

/* ARCADE_TRAY_RULES_V1 */
function createArcadeTrayRules(){
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),active=p=>!p.eliminated&&!p.forfeited;
 const rect={x:70,y:62,cols:7,rows:7,tileW:80,tileH:48};
 function direction(keys){let x=Number(keys.has('right'))-Number(keys.has('left')),y=Number(keys.has('down'))-Number(keys.has('up'));const d=Math.hypot(x,y)||1;return{x:x/d,y:y/d};}
 function tileAt(w,x,y){const col=Math.floor((x-rect.x)/rect.tileW),row=Math.floor((y-rect.y)/rect.tileH);return col<0||col>=7||row<0||row>=7?null:w.objects[row*7+col];}
 const onFloor=(w,x,y,ahead=0)=>{const tile=tileAt(w,x,y);return !!tile&&w.elapsed+ahead<tile.goneAt;};
 function score(w,p){p.score=arcadeSurvivalScore(w,p,p.shoves);}
 function finishFall(w,p){
  p.deaths++;arcadeSurvivalEliminate(w,p);score(w,p);
 }
 function collide(w,a,b){
  let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(d>=38)return;
  if(d<.001){const angle=(a.index+1)*1.43+(b.index+1)*.7;dx=Math.cos(angle);dy=Math.sin(angle);d=1;}
  const nx=dx/d,ny=dy/d,gap=(38-d)/2;a.x-=nx*gap;a.y-=ny*gap;b.x+=nx*gap;b.y+=ny*gap;
  function strike(from,to,sx,sy){
   if(w.elapsed>=from.dashUntil||from.pushHits.includes(to.id)||w.elapsed<to.hurtUntil)return false;
   from.pushHits.push(to.id);from.shoves++;to.vx+=sx*480;to.vy+=sy*480;to.stunUntil=Math.max(to.stunUntil,w.elapsed+.24);to.hurtUntil=w.elapsed+.18;from.vx*=.82;from.vy*=.82;
   w.meta.notice=from.name+' 님의 식판 밀치기!';return true;
  }
  const hitA=strike(a,b,nx,ny),hitB=strike(b,a,-nx,-ny);
  if(!hitA&&!hitB){const closing=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;if(closing>0){const impulse=closing*.45;a.vx-=nx*impulse;a.vy-=ny*impulse;b.vx+=nx*impulse;b.vy+=ny*impulse;}}
 }
 const tray={
  init(w,random){
   w.duration=28;w.meta={...rect,width:700,height:460,roundOver:false,roundSurvival:true,partyRespawn:false,notice:'떨어지면 이번 판 탈락! 생존 순위 점수를 받고 다음 게임에 다시 만나요.',nextGustAt:20,gustUntil:0,gustX:0,gustY:0,gustPushAt:0,gustApplied:true};
   const holes=[];w.objects=[];
   for(let row=0;row<7;row++)for(let col=0;col<7;col++){
    const ring=Math.max(Math.abs(row-3),Math.abs(col-3)),goneAt=ring===3?7:ring===2?13:ring===1?19:29;
    const tile={id:'tile_'+row+'_'+col,kind:'tray-tile',row,col,ring,x:rect.x+col*rect.tileW,y:rect.y+row*rect.tileH,width:rect.tileW,height:rect.tileH,warningAt:goneAt-1.25,goneAt};
    w.objects.push(tile);if(ring>0&&ring<3)holes.push({tile,key:random()});
   }
   holes.sort((a,b)=>a.key-b.key);holes.slice(0,5).forEach(({tile},i)=>{tile.goneAt=Math.min(tile.goneAt,5.5+i*2.1);tile.warningAt=tile.goneAt-1.25;});
   w.players.forEach((p,i)=>{const a=-Math.PI/2+i*Math.PI*2/w.players.length;p.x=350+Math.cos(a)*135;p.y=230+Math.sin(a)*84;p.vx=0;p.vy=0;p.dx=-Math.cos(a);p.dy=-Math.sin(a);p.health=3;p.eliminated=false;p.forfeited=false;p.dashUntil=0;p.dashReadyAt=0;p.hurtUntil=0;p.stunUntil=0;p.actionUntil=0;p.pushHits=[];p.shoves=0;p.survived=0;p.fallAt=-1;p.score=3;p.deaths=0;p.respawnUntil=0;});
  },
  input(w,p,action){
   if(action!=='dash'||w.elapsed<p.dashReadyAt||w.elapsed<p.stunUntil||!active(p))return false;
   p.dashUntil=w.elapsed+.17;p.dashReadyAt=w.elapsed+2.1;p.actionUntil=p.dashUntil;p.pushHits=[];p.vx=p.dx*430;p.vy=p.dy*430;return true;
  },
  step(w,dt,controls,random){
   const living=w.players.filter(active),t=w.elapsed;
   if(living.length<=1){arcadeSurvivalSettle(w,p=>p.shoves);return;}
   if(t>=w.meta.nextGustAt){const a=random()*Math.PI*2;w.meta.gustX=Math.cos(a);w.meta.gustY=Math.sin(a);w.meta.gustPushAt=t+.8;w.meta.gustUntil=t+1.3;w.meta.gustApplied=false;w.meta.nextGustAt=t+3;w.meta.notice='바람 예고! 화살표를 보고 반대쪽으로 자리를 잡아요!';}
   if(!w.meta.gustApplied&&t>=w.meta.gustPushAt){w.meta.gustApplied=true;for(const p of living){p.vx+=w.meta.gustX*140;p.vy+=w.meta.gustY*140;}w.meta.notice='식판 흔들린다! 가운데에서 버티고 밀쳐요!';}
   for(const p of living){
    const d=direction(controls.get(p.id)?.held||new Set());
    if(t>=p.stunUntil&&t>=p.dashUntil){if(d.x||d.y){p.dx=d.x;p.dy=d.y;}const alpha=Math.min(1,dt*11);p.vx+=(d.x*158-p.vx)*alpha;p.vy+=(d.y*158-p.vy)*alpha;}
    else if(t<p.dashUntil&&t>=p.stunUntil){p.vx=p.dx*430;p.vy=p.dy*430;}
    else{p.vx*=Math.exp(-3.5*dt);p.vy*=Math.exp(-3.5*dt);}
    p.vx=clamp(p.vx,-850,850);p.vy=clamp(p.vy,-850,850);p.x=clamp(p.x+p.vx*dt,-30,730);p.y=clamp(p.y+p.vy*dt,-30,490);p.survived=t;
   }
   for(let i=0;i<living.length;i++)for(let j=i+1;j<living.length;j++)collide(w,living[i],living[j]);
   for(const p of living){p.x=clamp(p.x,-30,730);p.y=clamp(p.y,-30,490);if(!onFloor(w,p.x,p.y))finishFall(w,p);else score(w,p);}
   arcadeSurvivalSettle(w,p=>p.shoves);
   if(!w.meta.roundOver&&w.objects.some(o=>t>=o.warningAt&&t<o.goneAt)&&t>=w.meta.gustUntil)w.meta.notice='빨간 칸에서 나와요! Space로 밀칠 때는 앞바닥도 확인!';
  },
  bot(w,p){
   const t=w.elapsed,tile=tileAt(w,p.x,p.y),safeHere=tile&&t+.65<tile.goneAt;
   let target=null,dx=0,dy=0;
   if(!safeHere){
    target=w.objects.filter(o=>o.goneAt>t+.9).sort((a,b)=>Math.hypot(a.x+40-p.x,a.y+24-p.y)-Math.hypot(b.x+40-p.x,b.y+24-p.y))[0];
    if(target){dx=target.x+40-p.x;dy=target.y+24-p.y;}
   }else{
    const other=w.players.filter(q=>q!==p&&active(q)).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
    const centerWeight=t>14?.85:.35;dx=(350-p.x)*centerWeight;dy=(230-p.y)*centerWeight;
    if(other&&Math.hypot(other.x-p.x,other.y-p.y)<140){const ox=other.x-p.x,oy=other.y-p.y;if(onFloor(w,p.x+Math.sign(ox)*28,p.y+Math.sign(oy)*28,.5)){dx=ox*.8+(350-p.x)*.12;dy=oy*.8+(230-p.y)*.12;}}
   }
   const held=[];if(dx>11)held.push('right');if(dx< -11)held.push('left');if(dy>9)held.push('down');if(dy< -9)held.push('up');
   const near=w.players.some(q=>q!==p&&active(q)&&Math.hypot(q.x-p.x,q.y-p.y)<75),frontSafe=onFloor(w,p.x+p.dx*62,p.y+p.dy*62,.35);
   return{held,...near&&safeHere&&frontSafe&&t>=p.dashReadyAt?{action:'dash'}:{}};
  }
 };
 return{tray};
}
/* END_ARCADE_TRAY_RULES_V1 */

/* ARCADE_SPORTS_RULES_V1 */
function createArcadeSportsRules(){
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),live=p=>!p.eliminated&&!p.forfeited,keys=(controls,p)=>controls.get(p.id)?.held||new Set(),wave=(t,at)=>.5+.5*Math.sin((t-at)*4.1-Math.PI/2),dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),angleDiff=a=>Math.atan2(Math.sin(a),Math.cos(a));
 const own=(w,p,kind)=>w.objects.find(o=>o.ownerId===p.id&&(!kind||o.kind===kind));
 function setup(w,duration,notice){w.duration=duration;w.objects=[];w.meta={serial:0,notice};for(const p of w.players){Object.assign(p,{x:350,y:400,score:0,health:3,phase:'ready',readyAt:0,aim:0,power:0,chargeAt:0,shots:0,completed:0,judge:'',judgeUntil:0});}}
 function say(w,p,text){p.judge=text;p.judgeUntil=w.elapsed+.8;p.actionUntil=w.elapsed+.23;}
 // A player's Nth serve has the same trajectory as every other player's Nth serve.
 function serveRandom(w,attempt,salt){let seed=(w.meta.serveSeed^Math.imul(attempt+1,0x9e3779b1)^salt)>>>0;seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;}
 function powerInput(w,p,action,launch){if(!live(p)||action!=='hit'||w.elapsed<p.readyAt)return;if(p.phase==='ready'){p.phase='power';p.chargeAt=w.elapsed;p.power=0;p.readyAt=w.elapsed+.14;say(w,p,'한 번 더 눌러 발사!');}else if(p.phase==='power'){p.power=wave(w.elapsed,p.chargeAt);launch();}}
 function ball(w,p,kind,x,y,extra={}){const o={id:'sport_'+(++w.meta.serial),kind,ownerId:p.id,x,y,vx:0,vy:0,active:true,...extra};w.objects.push(o);return o;}
 function settleMotion(o,dt,friction){o.x+=o.vx*dt;o.y+=o.vy*dt;const f=Math.exp(-friction*dt);o.vx*=f;o.vy*=f;for(const [axis,min,max]of [['x',30,670],['y',38,430]])if(o[axis]<min||o[axis]>max){o[axis]=clamp(o[axis],min,max);o[axis==='x'?'vx':'vy']*= -.55;}return Math.hypot(o.vx,o.vy)<13;}
 function pongBalance(w){
  const counts=[0,0];for(const p of w.players)if(live(p))counts[p.team]++;
  w.meta.teamSizes=counts;w.meta.handicapTeam=counts[0]===counts[1]?-1:counts[0]<counts[1]?0:1;
  const largest=Math.max(...counts),baseHeight=Math.max(54,108-(largest-1)*18);
  for(const p of w.players){const smaller=p.team===w.meta.handicapTeam,ratio=counts[p.team]?largest/counts[p.team]:1;p.paddleHeight=Math.min(154,baseHeight*(smaller?Math.min(1.35,1+(ratio-1)*.35):1));p.moveSpeed=290*(smaller?Math.min(1.2,1+(ratio-1)*.2):1);p.paddleY=clamp(p.paddleY,20+p.paddleHeight/2,440-p.paddleHeight/2);p.y=p.paddleY;}
  return counts;
 }
 function pongScores(w){for(const p of w.players){p.goals=w.meta.teamGoals[p.team];p.score=p.goals*100;}}
 function pongServe(w,rng,delay=.6){
  let b=w.objects[0];if(!b){b={id:'pong-shared-ball',kind:'pongBall',ownerId:'',active:true};w.objects.push(b);}
  const direction=w.meta.nextServe;w.meta.nextServe=-direction;w.meta.serves++;
  Object.assign(b,{x:350,y:170+rng()*120,vx:direction*265,vy:(rng()-.5)*140,serveAt:w.elapsed+delay,lastHitId:''});
 }
 const pong={
  init(w,rng){
   setup(w,28,'같은 테이블 팀전! ↑/↓ 이동 · Space 스매시. 인원이 적은 팀은 패들과 이동 속도 보정!');
   const order=[...w.players];for(let i=order.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
   Object.assign(w.meta,{pongTeams:true,teamGoals:[0,0],teamSizes:[0,0],handicapTeam:-1,nextServe:rng()<.5?-1:1,serves:0,lastScorerTeam:-1,goalUntil:0});
   order.forEach((p,i)=>{p.team=i%2;w.meta.teamSizes[p.team]++;});
   for(const side of [0,1]){const members=order.filter(p=>p.team===side);members.forEach((p,i)=>{p.x=side?642:58;p.homeY=25+(i+.5)*410/members.length;p.y=p.paddleY=p.homeY;p.rallies=0;p.misses=0;p.goals=0;p.smashUntil=0;p.paddleHeight=108;p.moveSpeed=290;});}
   pongBalance(w);pongScores(w);pongServe(w,rng,.75);
  },
  input(w,p,a){if(!live(p)||a!=='hit'||w.elapsed<p.readyAt)return false;p.smashUntil=w.elapsed+.24;p.readyAt=w.elapsed+.68;say(w,p,'스매시 준비!');return true;},
  step(w,dt,controls,rng){
   const counts=pongBalance(w);if(!counts[0]||!counts[1]){if(counts[0]||counts[1]){const side=counts[0]?0:1;w.meta.teamGoals[side]=Math.max(w.meta.teamGoals[side],w.meta.teamGoals[1-side]+1);w.meta.notice='상대 팀 기권 · 남은 팀 승리';}pongScores(w);w.meta.roundOver=true;return;}
   for(const p of w.players){if(!live(p))continue;const k=keys(controls,p),move=Number(k.has('down'))-Number(k.has('up'));p.paddleY=clamp(p.paddleY+move*p.moveSpeed*dt,20+p.paddleHeight/2,440-p.paddleHeight/2);p.y=p.paddleY;}
   const b=w.objects[0];if(w.elapsed<b.serveAt)return;
   const before={x:b.x,y:b.y};b.x+=b.vx*dt;b.y+=b.vy*dt;
   if(b.y<22||b.y>438){b.y=clamp(b.y,22,438);b.vy*= -1;}
   const side=b.vx<0?0:1,face=side?628:72,crossed=side?before.x<=face&&b.x>=face:before.x>=face&&b.x<=face;
   if(crossed){
    const fraction=clamp((face-before.x)/(b.x-before.x),0,1),contactY=before.y+(b.y-before.y)*fraction;
    const candidates=w.players.filter(p=>live(p)&&p.team===side&&Math.abs(contactY-p.paddleY)<=p.paddleHeight/2+8).sort((a,c)=>Math.abs(contactY-a.paddleY)-Math.abs(contactY-c.paddleY)||((a.index+w.meta.serves)%w.players.length)-((c.index+w.meta.serves)%w.players.length)),p=candidates[0];
    if(p){const smash=w.elapsed<p.smashUntil,speed=Math.min(560,Math.hypot(b.vx,b.vy)*(smash?1.2:1.045)),offset=clamp((contactY-p.paddleY)/(p.paddleHeight/2),-1,1),k=keys(controls,p),move=Number(k.has('down'))-Number(k.has('up'));b.vy=clamp(offset*245+move*35,-speed*.72,speed*.72);b.vx=(side?-1:1)*Math.sqrt(speed*speed-b.vy*b.vy);b.x=face+(side?-.5:.5);b.y=contactY;b.lastHitId=p.id;p.rallies++;say(w,p,smash?'강스매시!':'받아쳤다!');}
   }
   if(b.x<5||b.x>695){const scorer=b.x<5?1:0;w.meta.teamGoals[scorer]++;w.meta.lastScorerTeam=scorer;w.meta.goalUntil=w.elapsed+.75;w.meta.notice=(scorer?'B':'A')+'팀 득점! '+w.meta.teamGoals[0]+' : '+w.meta.teamGoals[1];for(const p of w.players)if(live(p)){if(p.team!==scorer)p.misses++;say(w,p,p.team===scorer?'우리 팀 득점!':'상대 팀 득점 · 다음 랠리!');}pongScores(w);pongServe(w,rng,.75);}
  },
  bot(w,p){
   const b=w.objects[0],incoming=p.team===0?b.vx<0:b.vx>0,partners=w.players.filter(q=>live(q)&&q.team===p.team).sort((a,c)=>Math.abs(b.y-a.paddleY)-Math.abs(b.y-c.paddleY)||a.index-c.index),target=incoming&&partners[0]?.id===p.id?b.y:p.homeY,dy=target-p.paddleY,near=p.team===0?b.x<165:b.x>535;
   return{held:Math.abs(dy)>14?[dy>0?'down':'up']:[],...(incoming&&near&&Math.abs(b.y-p.paddleY)<p.paddleHeight/2&&w.elapsed>=p.readyAt?{action:'hit'}:{})};
  }
 };
 const curling={
  init(w){setup(w,26,'←/→ 조준, Space 두 번으로 발사! 굴러갈 때 Space로 쓸면 더 멀리. 3개 돌의 합계!');for(const p of w.players){p.y=422;p.activeShot='';p.finishedIds=[];p.sweepUntil=0;}},
  input(w,p,a){if(a==='hit'&&live(p)&&p.phase==='moving'&&w.elapsed>=p.readyAt){p.sweepUntil=w.elapsed+.28;p.readyAt=w.elapsed+.22;say(w,p,'슥슥! 마찰을 줄여 더 멀리');return;}powerInput(w,p,a,()=>{const speed=240+p.power*500,o=ball(w,p,'curlStone',350,418,{vx:Math.sin(p.aim)*speed,vy:-Math.cos(p.aim)*speed,settled:false,points:0,shot:p.shots+1});p.activeShot=o.id;p.shots++;p.phase='moving';p.readyAt=w.elapsed+.3;say(w,p,'미끄러진다! Space로 쓸기');});},
  step(w,dt,controls){for(const p of w.players){if(!live(p))continue;const k=keys(controls,p);if(['ready','power'].includes(p.phase))p.aim=clamp(p.aim+(Number(k.has('right'))-Number(k.has('left')))*.75*dt,-.6,.6);if(p.phase==='power')p.power=wave(w.elapsed,p.chargeAt);const stones=w.objects.filter(o=>o.ownerId===p.id);for(const o of stones)if(!o.settled){if(settleMotion(o,dt,o.id===p.activeShot&&w.elapsed<p.sweepUntil?.82:1.32)){o.vx=0;o.vy=0;o.settled=true;if(!p.finishedIds.includes(o.id)){p.finishedIds.push(o.id);if(o.id===p.activeShot){p.completed++;p.phase=p.shots>=3?'done':'ready';p.readyAt=w.elapsed+.4;say(w,p,'중심에서 '+Math.round(Math.hypot(o.x-350,o.y-125))+'px');}}}}
    for(let i=0;i<stones.length;i++)for(let j=i+1;j<stones.length;j++){const a=stones[i],b=stones[j],d=dist(a,b);if(d>=29||d<.01||a.settled&&b.settled)continue;const nx=(b.x-a.x)/d,ny=(b.y-a.y)/d,rv=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;if(rv>0){a.vx-=rv*nx*.8;a.vy-=rv*ny*.8;b.vx+=rv*nx*.8;b.vy+=rv*ny*.8;a.settled=false;b.settled=false;}const overlap=(29-d)/2;a.x-=nx*overlap;a.y-=ny*overlap;b.x+=nx*overlap;b.y+=ny*overlap;}
    p.score=stones.reduce((sum,o)=>sum+(o.settled?Math.max(0,Math.round(110-Math.hypot(o.x-350,o.y-125)*.34)):0),0);
   }if(w.elapsed>=20&&w.players.filter(live).every(p=>p.phase==='done')&&w.objects.every(o=>o.settled))w.meta.roundOver=true;},
  bot(w,p){return{held:p.aim>.035?['left']:p.aim<-.035?['right']:[],...((p.phase==='ready'&&w.elapsed>=p.readyAt)||(p.phase==='power'&&(p.power>=.34||w.elapsed-p.chargeAt>1.3))?{action:'hit'}:{})};}
 };
 function bowlingTarget(w,p){const standing=w.objects.filter(o=>o.ownerId===p.id&&o.kind==='bowlingPin'&&!o.down).sort((a,b)=>b.y-a.y||a.x-b.x),front=standing[0];p.bowlTargetX=front?front.x+(front.x<350?-8:8):350;p.bowlTargetY=front?.y||110;return front;}
 function pins(w,p){
  w.objects=w.objects.filter(o=>o.ownerId!==p.id);p.framePins=0;p.frameShots=0;const frame=p.completed%3,center=frame===0?350:frame===1?245:455,frontY=frame===1?132:118;let positions=[];
  if(frame<2){for(let row=0;row<4;row++)for(let c=0;c<=row;c++)positions.push([center+(c-row/2)*25,frontY-row*23]);}
  else for(const side of [-1,1])for(const [x,y]of [[0,0],[-12,-24],[12,-24],[-12,-48],[12,-48]])positions.push([center+side*38+x,frontY+y]);
  positions.forEach(([x,y],i)=>ball(w,p,'bowlingPin',x,y,{id:'pin_'+p.id+'_'+p.completed+'_'+i,down:false,active:false,vx:0,vy:0}));p.bowlRack=w.meta.bowlingRacks[frame];bowlingTarget(w,p);
 }
 function bowlingDown(w,p,pin,vx,vy){if(pin.down)return;pin.down=true;pin.vx=vx;pin.vy=vy;p.score+=10;p.framePins++;}
 function bowlingContact(from,to,pin,radius){const dx=to.x-from.x,dy=to.y-from.y,length2=dx*dx+dy*dy;if(length2<1e-9)return null;const along=clamp(((pin.x-from.x)*dx+(pin.y-from.y)*dy)/length2,0,1),cx=from.x+along*dx,cy=from.y+along*dy,d2=(pin.x-cx)**2+(pin.y-cy)**2;if(d2>radius*radius)return null;const t=Math.max(0,along-Math.sqrt(Math.max(0,radius*radius-d2)/length2)),x=from.x+t*dx,y=from.y+t*dy,n=Math.hypot(pin.x-x,pin.y-y)||1;return{pin,t,x,y,nx:(pin.x-x)/n,ny:(pin.y-y)/n};}
 const bowling={
  init(w){setup(w,32,'핀 배치가 매 프레임 바뀌어요! ←/→ 조준, Space 두 번 투구. 강한 공은 빠르고, 약한 공은 ←/→ 커브 보정 시간이 길어요.');w.meta.bowlingRacks=['중앙 삼각','왼쪽 포켓','오른쪽 양갈래'];for(const p of w.players){p.y=420;p.framePins=0;p.flightAt=0;p.nextFrameAt=0;p.phase='ready';p.bowlPower=0;p.bowlRack='';p.bowlTargetX=350;p.bowlTargetY=118;p.bowlCurve=0;p.bowlGutter=false;pins(w,p);}},
  input(w,p,a){powerInput(w,p,a,()=>{const speed=390+p.power*420;ball(w,p,'bowlingBall',350,420,{vx:Math.sin(p.aim)*speed,vy:-Math.cos(p.aim)*speed});p.bowlPower=p.power;p.bowlCurve=0;p.bowlGutter=false;p.shots++;p.frameShots++;p.flightAt=w.elapsed;p.phase='moving';say(w,p,p.power>.85?'빠른 공! 좌우 보정 시간은 짧아요':'굴러가는 동안 ←/→로 커브!');});},
  step(w,dt,controls){for(const p of w.players){if(!live(p))continue;const k=keys(controls,p),steer=Number(k.has('right'))-Number(k.has('left'));if(['ready','power'].includes(p.phase))p.aim=clamp(p.aim+steer*.5*dt,-.45,.45);if(p.phase==='power')p.power=wave(w.elapsed,p.chargeAt);const b=own(w,p,'bowlingBall');if(p.phase==='moving'&&b){const from={x:b.x,y:b.y};b.vx+=steer*220*dt;b.vx*=Math.exp(-.14*dt);b.vy*=Math.exp(-.14*dt);b.x+=b.vx*dt;b.y+=b.vy*dt;p.bowlCurve=steer;const ps=w.objects.filter(o=>o.ownerId===p.id&&o.kind==='bowlingPin'),hit=ps.filter(pin=>!pin.down).map(pin=>bowlingContact(from,b,pin,23)).filter(Boolean).sort((a,c)=>a.t-c.t)[0];if(hit){const impact=Math.max(0,b.vx*hit.nx+b.vy*hit.ny);if(impact>42){bowlingDown(w,p,hit.pin,hit.nx*impact*.72+b.vx*.12,hit.ny*impact*.72+b.vy*.12);b.x=hit.x;b.y=hit.y;b.vx-=hit.nx*impact*.43;b.vy-=hit.ny*impact*.43;say(w,p,'핀 '+p.framePins+'개! 남은 방향을 봐요');}}for(const pin of ps)if(pin.down){pin.x=clamp(pin.x+pin.vx*dt,20,680);pin.y=clamp(pin.y+pin.vy*dt,25,435);pin.vx*=Math.exp(-2.5*dt);pin.vy*=Math.exp(-2.5*dt);if(Math.hypot(pin.vx,pin.vy)>30)for(const next of ps)if(!next.down){const d=dist(pin,next);if(d<24&&d>.01){const nx=(next.x-pin.x)/d,ny=(next.y-pin.y)/d,impact=Math.max(0,pin.vx*nx+pin.vy*ny);if(impact>35){bowlingDown(w,p,next,nx*impact*.75+pin.vx*.12,ny*impact*.75+pin.vy*.12);pin.vx-=nx*impact*.35;pin.vy-=ny*impact*.35;}}}}
      if(b.y<20||b.x<35||b.x>665||w.elapsed-p.flightAt>2.5){p.bowlGutter=b.x<35||b.x>665;const complete=p.framePins===10||p.frameShots>=2;if(complete){p.completed++;if(p.framePins===10){const bonus=p.frameShots===1?15:8;p.score+=bonus;say(w,p,p.frameShots===1?'스트라이크! +15':'스페어! +8');}p.phase=p.completed>=3?'done':'between';p.nextFrameAt=w.elapsed+.7;}else{p.phase='ready';p.readyAt=w.elapsed+.35;say(w,p,(p.bowlGutter?'거터! ':'')+'남은 '+(10-p.framePins)+'핀 · 방향을 바꿔 한 번 더!');}w.objects=w.objects.filter(o=>o.id!==b.id);}
    }if(p.phase==='between'&&w.elapsed>=p.nextFrameAt){pins(w,p);p.phase='ready';p.readyAt=w.elapsed;}bowlingTarget(w,p);}
   if(w.elapsed>=20&&w.players.filter(live).every(p=>p.phase==='done'))w.meta.roundOver=true;},
  bot(w,p){bowlingTarget(w,p);const target=Math.atan2(p.bowlTargetX-350,420-p.bowlTargetY),b=own(w,p,'bowlingBall');if(p.phase==='moving'&&b){const forecast=b.x+b.vx*Math.max(0,(b.y-p.bowlTargetY)/Math.max(100,-b.vy)),error=p.bowlTargetX-forecast;return{held:Math.abs(error)>20?[error>0?'right':'left']:[]};}return{held:p.aim>target+.025?['left']:p.aim<target-.025?['right']:[],...((p.phase==='ready'&&w.elapsed>=p.readyAt)||(p.phase==='power'&&p.power>=.56)?{action:'hit'}:{})};}
 };
 function volleyReceive(w,p,b){if(w.elapsed<b.serveAt||b.vy<=0||b.y<=205||b.y>=442||Math.abs(b.x-p.x)>=90||w.elapsed-b.lastHitAt<=.4)return false;const precise=b.y>=330&&Math.abs(b.x-p.x)<35,points=precise?10:7;b.vy=-270;b.vx=clamp((b.x-p.x)*2.3,-160,160);b.lastHitAt=w.elapsed;p.bufferUntil=0;p.hits++;p.score+=points;say(w,p,precise?'정확한 리시브! +10':'살렸다! +7');return true;}
 const volley={
  init(w,rng){setup(w,26,'내려오는 풍선 아래에서 Space! 낮은 위치에서 정중앙 리시브는 +10, 일반 +7.');const serveX=230+rng()*240,serveVx=(rng()-.5)*70;w.meta.serveSeed=Math.floor(rng()*4294967296);for(const p of w.players){p.x=350;p.y=410;p.hits=0;p.misses=0;p.bufferUntil=0;ball(w,p,'volleyBall',serveX,95,{vx:serveVx,vy:0,serveAt:0,lastHitAt:-1});}},
  input(w,p,a){if(!live(p)||a!=='hit'||w.elapsed<p.readyAt)return;p.readyAt=w.elapsed+.42;p.actionUntil=w.elapsed+.23;const b=own(w,p);if(!volleyReceive(w,p,b)){p.bufferUntil=w.elapsed+.18;say(w,p,b.vy<0?'올라갈 땐 기다려요':'조금 더 기다려 받아쳐!');}},
  step(w,dt,controls,rng){for(const p of w.players){if(!live(p))continue;const k=keys(controls,p);p.x=clamp(p.x+(Number(k.has('right'))-Number(k.has('left')))*280*dt,45,655);const b=own(w,p);if(w.elapsed<b.serveAt)continue;b.vy+=185*dt;b.x+=b.vx*dt;b.y+=b.vy*dt;b.vx*=Math.exp(-.1*dt);if(b.x<25||b.x>675){b.x=clamp(b.x,25,675);b.vx*= -1;}if(b.y<27){b.y=27;b.vy=Math.abs(b.vy)*.6;}if(w.elapsed<=p.bufferUntil)volleyReceive(w,p,b);if(b.y>438){p.score=Math.max(0,p.score-5);p.misses++;p.bufferUntil=0;Object.assign(b,{x:200+serveRandom(w,p.misses,3)*300,y:95,vx:(serveRandom(w,p.misses,4)-.5)*75,vy:0,serveAt:w.elapsed+.55});say(w,p,'툭… 다시 띄워요!');}}},
  bot(w,p){const b=own(w,p),dx=b.x-p.x;return{held:Math.abs(dx)>20?[dx>0?'right':'left']:[],...(b.y>285&&b.vy>0&&Math.abs(dx)<80&&w.elapsed>=p.readyAt?{action:'hit'}:{})};}
 };
 const golfLayouts=[{start:{x:90,y:360},hole:{x:600,y:105},walls:[{x:295,y:145,w:50,h:220}]},{start:{x:90,y:110},hole:{x:595,y:360},walls:[{x:300,y:40,w:46,h:210}]},{start:{x:110,y:355},hole:{x:585,y:105},walls:[{x:270,y:220,w:180,h:38},{x:470,y:50,w:40,h:160}]}];
 function golfPlace(w,p){const layout=golfLayouts[p.hole%3];let b=own(w,p);if(!b)b=ball(w,p,'golfBall',layout.start.x,layout.start.y,{vx:0,vy:0});Object.assign(b,{x:layout.start.x,y:layout.start.y,vx:0,vy:0});p.x=b.x;p.y=b.y;p.aim=Math.atan2(layout.hole.y-b.y,layout.hole.x-b.x);p.holeStrokes=0;p.phase='ready';p.readyAt=w.elapsed+.25;}
 const golf={
  init(w){setup(w,32,'←/→로 방향 조준, Space 두 번으로 퍼팅. 벽을 튕겨 3홀! 적은 타수일수록 높은 점수.');w.meta.layouts=golfLayouts;for(const p of w.players){p.hole=0;p.baseScore=0;p.holeStrokes=0;p.nextHoleAt=0;golfPlace(w,p);}},
  input(w,p,a){powerInput(w,p,a,()=>{const b=own(w,p),speed=200+p.power*620;b.vx=Math.cos(p.aim)*speed;b.vy=Math.sin(p.aim)*speed;p.phase='moving';p.holeStrokes++;p.shots++;say(w,p,p.holeStrokes+'타!');});},
  step(w,dt,controls){for(const p of w.players){if(!live(p)||p.phase==='done')continue;const k=keys(controls,p);if(['ready','power'].includes(p.phase))p.aim=angleDiff(p.aim+(Number(k.has('right'))-Number(k.has('left')))*1.15*dt);if(p.phase==='power')p.power=wave(w.elapsed,p.chargeAt);const layout=golfLayouts[p.hole%3],b=own(w,p);if(p.phase==='moving'){const x0=b.x,y0=b.y;const stopped=settleMotion(b,dt,1.52);for(const r of layout.walls)if(b.x>r.x-8&&b.x<r.x+r.w+8&&b.y>r.y-8&&b.y<r.y+r.h+8){if(x0<=r.x-8||x0>=r.x+r.w+8){b.x=x0<=r.x-8?r.x-8:r.x+r.w+8;b.vx*= -.8;}else{b.y=y0<=r.y-8?r.y-8:r.y+r.h+8;b.vy*= -.8;}}
      if(dist(b,layout.hole)<21&&Math.hypot(b.vx,b.vy)<185){b.vx=0;b.vy=0;b.x=layout.hole.x;b.y=layout.hole.y;p.baseScore+=Math.max(20,130-p.holeStrokes*15);p.completed++;p.phase=p.completed>=3?'done':'between';p.nextHoleAt=w.elapsed+.7;say(w,p,'홀인! '+p.holeStrokes+'타');}else if(stopped){p.phase='ready';p.readyAt=w.elapsed+.2;}
    }if(p.phase==='between'&&w.elapsed>=p.nextHoleAt){p.hole++;golfPlace(w,p);}p.x=b.x;p.y=b.y;p.score=p.baseScore+(p.phase==='done'||p.phase==='between'?0:Math.max(0,Math.round(80-dist(b,layout.hole)*.13-p.holeStrokes*3)));}
   if(w.elapsed>=20&&w.players.filter(live).every(p=>p.phase==='done'))w.meta.roundOver=true;},
  bot(w,p){if(!['ready','power'].includes(p.phase))return{held:[]};const b=own(w,p),l=golfLayouts[p.hole%3];let target=l.hole;for(const r of l.walls)if(b.x<r.x-15&&l.hole.x>r.x&&b.y>r.y-40&&b.y<r.y+r.h+40){target={x:r.x+40,y:r.y>170?r.y-40:r.y+r.h+45};break;}const desired=Math.atan2(target.y-b.y,target.x-b.x),d=angleDiff(desired-p.aim),power=clamp((dist(b,target)*1.52-200)/620,.08,.92);return{held:Math.abs(d)>.08?[d>0?'right':'left']:[],...((p.phase==='ready'&&Math.abs(d)<.1&&w.elapsed>=p.readyAt)||(p.phase==='power'&&(p.power>=power||w.elapsed-p.chargeAt>1.4))?{action:'hit'}:{})};}
 };
 const parkingSpots=[{x:590,y:105,angle:0},{x:120,y:100,angle:0},{x:575,y:360,angle:0},{x:120,y:350,angle:0}];
 const parkingLevels=Array.from({length:8},(_,level)=>({width:Math.max(58,110-level*8),height:Math.max(40,72-level*5),walls:[...(level>=1?[{x:285,y:165,w:130,h:90}]:[]),...(level>=3?[{x:210,y:260,w:85,h:32}]:[]),...(level>=5?[{x:430,y:130,w:65,h:35}]:[]),...(level>=7?[{x:470,y:265,w:52,h:32}]:[])]}));
 function parkingLayout(w,p){return w.meta.parkingLevels[Math.min(p.parked,w.meta.parkingLevels.length-1)];}
 function parkingScore(w,p){p.score=p.parked*1000+(p.parked?Math.max(0,Math.min(999,Math.round((w.duration-p.lastParkAt)*20))):0);}
 function parkingBlocked(a,b,walls){
  return walls.some(r=>{let lo=0,hi=1;for(const [axis,min,max]of [['x',r.x-25,r.x+r.w+25],['y',r.y-25,r.y+r.h+25]]){const d=b[axis]-a[axis];if(Math.abs(d)<1e-8){if(a[axis]<min||a[axis]>max)return false;}else{const one=(min-a[axis])/d,two=(max-a[axis])/d;lo=Math.max(lo,Math.min(one,two));hi=Math.min(hi,Math.max(one,two));if(lo>hi)return false;}}return true;});
 }
 function parkingWaypoint(w,p){
  const goal=w.meta.spots[p.target%w.meta.spots.length],walls=parkingLayout(w,p).walls;if(!parkingBlocked(p,goal,walls))return goal;
  const points=[p,goal,{x:110,y:100},{x:590,y:100},{x:590,y:365},{x:110,y:365}],cost=points.map(()=>Infinity),previous=points.map(()=>-1),seen=new Set();cost[0]=0;
  for(let round=0;round<points.length;round++){let at=-1;for(let i=0;i<points.length;i++)if(!seen.has(i)&&(at<0||cost[i]<cost[at]))at=i;if(at<0||!Number.isFinite(cost[at]))break;if(at===1)break;seen.add(at);for(let i=1;i<points.length;i++)if(i!==at&&!seen.has(i)&&!parkingBlocked(points[at],points[i],walls)){const next=cost[at]+dist(points[at],points[i]);if(next<cost[i]){cost[i]=next;previous[i]=at;}}}
  let at=1;while(previous[at]>0)at=previous[at];return previous[at]===0?points[at]:goal;
 }
 const parking={
  init(w){setup(w,32,'32초 동안 더 많이 주차! 칸에 도착하면 즉시 다음 칸. 갈수록 칸이 좁아지고 장애물이 늘어요. ↑/↓ 전후진 · ←/→ 조향 · Space 브레이크');w.meta.spots=parkingSpots.map(spot=>({...spot}));w.meta.parkingLevels=parkingLevels.map(level=>({...level,walls:level.walls.map(wall=>({...wall}))}));for(const p of w.players){p.x=120;p.y=350;p.angle=-.7;p.speed=0;p.target=0;p.parkHold=0;p.bumpAt=-1;p.parked=0;p.lastParkAt=-1;}},
  input(w,p,a){if(!live(p)||a!=='hit'||w.elapsed<p.readyAt)return false;p.speed*=.18;p.readyAt=w.elapsed+.25;say(w,p,'끼익! 브레이크');return true;},
  step(w,dt,controls){for(const p of w.players){if(!live(p))continue;const layout=parkingLayout(w,p),k=keys(controls,p),gas=Number(k.has('up'))-Number(k.has('down')),steer=Number(k.has('right'))-Number(k.has('left'));p.speed=clamp((p.speed+gas*210*dt)*Math.exp(-.75*dt),-100,185);p.angle=angleDiff(p.angle+steer*1.9*dt*(p.speed< -6?-1:1)*Math.max(.45,Math.min(1,Math.abs(p.speed)/55)));const x0=p.x,y0=p.y;p.x+=Math.cos(p.angle)*p.speed*dt;p.y+=Math.sin(p.angle)*p.speed*dt;let bump=p.x<32||p.x>668||p.y<42||p.y>425;for(const r of layout.walls)if(p.x>r.x-18&&p.x<r.x+r.w+18&&p.y>r.y-18&&p.y<r.y+r.h+18)bump=true;if(bump){p.x=clamp(x0,32,668);p.y=clamp(y0,42,425);p.speed*= -.22;if(w.elapsed-p.bumpAt>.5){p.bumpAt=w.elapsed;say(w,p,'콩! 옆길로 돌아가요');}}
    const target=w.meta.spots[p.target%w.meta.spots.length];if(Math.abs(p.x-target.x)<=layout.width/2&&Math.abs(p.y-target.y)<=layout.height/2){p.parked++;p.target++;p.lastParkAt=w.elapsed;p.parkHold=0;say(w,p,p.parked+'대 주차! 바로 다음 칸으로 · 난도 '+(p.parked+1));}parkingScore(w,p);
   }},
  bot(w,p){const waypoint=parkingWaypoint(w,p),goal=w.meta.spots[p.target%w.meta.spots.length],nav=dist(p,waypoint),desired=Math.atan2(waypoint.y-p.y,waypoint.x-p.x),delta=angleDiff(desired-p.angle),held=[];if(Math.abs(delta)>.07)held.push(delta>0?'right':'left');if(nav>20&&Math.abs(delta)<.95)held.push('up');return{held,...(Math.abs(delta)>1.05&&Math.abs(p.speed)>35||dist(p,goal)<80&&Math.abs(p.speed)>125?{action:'hit'}:{})};}
 };
 return{pong,curling,bowling,volley,golf,parking};
}
/* END_ARCADE_SPORTS_RULES_V1 */

/* ARCADE_ACTION_PACK_RULES_V1 */
function createArcadeActionPackRules(){
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),active=p=>!p.eliminated&&!p.forfeited,tau=Math.PI*2;
 const axes=k=>{const x=Number(k.has('right'))-Number(k.has('left')),y=Number(k.has('down'))-Number(k.has('up')),d=Math.hypot(x,y)||1;return{x:x/d,y:y/d};};
 const held=(controls,p)=>controls.get(p.id)?.held||new Set();
 function base(p){Object.assign(p,{health:3,eliminated:false,forfeited:false,stunUntil:0,actionUntil:0,respawnUntil:0,invincibleUntil:0,score:0,survived:0,fallAt:-1});}
 function pointTo(dx,dy){const keys=[];if(dx>10)keys.push('right');if(dx< -10)keys.push('left');if(dy>10)keys.push('down');if(dy< -10)keys.push('up');return keys;}
 function courtSpawn(p,n){return{x:p.index%2?604:96,y:100+(Math.floor(p.index/2)+1)/(Math.ceil(n/2)+1)*285};}
 const dodgeball={
  init(w){w.duration=26;w.objects=[];w.meta={serial:0,roundSurvival:true,partyRespawn:false,notice:'하트 3개! 공에 세 번 맞으면 이번 판은 관전. 마지막까지 피하고 던져요!'};w.players.forEach(p=>{base(p);const spawn=courtSpawn(p,w.players.length);Object.assign(p,{...spawn,faceX:p.index%2?-1:1,faceY:0,throwReadyAt:0,hits:0,received:0});});},
  input(w,p,action){if(action!=='hit'||!active(p)||w.elapsed<p.throwReadyAt||w.elapsed<p.stunUntil||w.elapsed<p.respawnUntil)return false;p.throwReadyAt=w.elapsed+.72;p.actionUntil=w.elapsed+.2;const d=Math.hypot(p.faceX,p.faceY)||1;w.objects.push({id:'ball_'+(++w.meta.serial),kind:'dodgeball',ownerId:p.id,x:p.x+p.faceX*23,y:p.y+p.faceY*23,vx:p.faceX/d*355,vy:p.faceY/d*355,until:w.elapsed+1.9,bounces:0,hitIds:[]});return true;},
  step(w,dt,controls){
   const t=w.elapsed;
   for(const p of w.players){if(!active(p)||t<p.stunUntil||t<p.respawnUntil)continue;const d=axes(held(controls,p));if(d.x||d.y){p.faceX=d.x;p.faceY=d.y;}p.x=clamp(p.x+d.x*184*dt,36,664);p.y=clamp(p.y+d.y*184*dt,74,418);}
   for(const o of w.objects){if(o.until<=t)continue;o.x+=o.vx*dt;o.y+=o.vy*dt;if(o.x<25||o.x>675){o.x=clamp(o.x,25,675);o.vx*=-1;o.bounces++;}if(o.y<62||o.y>430){o.y=clamp(o.y,62,430);o.vy*=-1;o.bounces++;}if(o.bounces>1){o.until=t;continue;}
    const victim=w.players.filter(p=>active(p)&&p.id!==o.ownerId&&t>=p.invincibleUntil&&t>=p.respawnUntil&&!o.hitIds.includes(p.id)&&Math.hypot(p.x-o.x,p.y-o.y)<29).sort((a,b)=>Math.hypot(a.x-o.x,a.y-o.y)-Math.hypot(b.x-o.x,b.y-o.y)||((a.index+o.id.length+Math.floor(t*20))%w.players.length)-((b.index+o.id.length+Math.floor(t*20))%w.players.length))[0];if(!victim)continue;
    o.hitIds.push(victim.id);o.until=t;victim.received++;victim.health--;victim.stunUntil=t+.36;victim.invincibleUntil=t+1.15;const thrower=w.players.find(p=>p.id===o.ownerId);if(thrower)thrower.hits++;if(victim.health<=0){arcadeSurvivalEliminate(w,victim);w.meta.notice=victim.name+' 님 이번 판 탈락 · 다음 게임에 다시 참여해요.';}else w.meta.notice=(thrower?.name||'누군가')+' 님 명중! '+victim.name+' 님 하트 '+victim.health+'개.';
   }
   w.objects=w.objects.filter(o=>o.until>t);arcadeSurvivalSettle(w,p=>p.health*10+p.hits);
  },
  bot(w,p){const target=w.players.filter(q=>q!==p&&active(q)&&w.elapsed>=q.respawnUntil).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];if(!target)return{held:[]};const dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy),keys=pointTo(dx,dy),aligned=(dx*p.faceX+dy*p.faceY)/(d||1)>.78;return{held:d>125?keys:Math.floor(w.elapsed*2+p.index)%3===0?pointTo(-dy,dx):keys,...d<380&&aligned&&w.elapsed>=p.throwReadyAt?{action:'hit'}:{}};}
 };
 const crown={
  init(w){w.duration=26;w.objects=[{id:'the-crown',kind:'crown',x:350,y:230}];w.meta={ownerId:'',protectionUntil:0,notice:'왕관을 잡고 버텨! Space 돌진으로 빼앗고, 모서리에는 오래 숨지 마!'};w.players.forEach((p,i)=>{base(p);const a=-Math.PI/2+i*tau/w.players.length;Object.assign(p,{x:350+Math.cos(a)*180,y:230+Math.sin(a)*120,dx:-Math.cos(a),dy:-Math.sin(a),dashUntil:0,dashReadyAt:0,heldSeconds:0,steals:0,cornerTime:0});});},
  input(w,p,action){if(action!=='dash'||!active(p)||w.elapsed<p.dashReadyAt||w.elapsed<p.stunUntil)return false;p.dashUntil=w.elapsed+.16;p.dashReadyAt=w.elapsed+2.25;p.actionUntil=p.dashUntil;return true;},
  step(w,dt,controls){
   const t=w.elapsed,m=w.meta,o=w.objects[0];let owner=w.players.find(p=>p.id===m.ownerId&&active(p));if(!owner){m.ownerId='';owner=null;}
   for(const p of w.players){if(!active(p)||t<p.stunUntil)continue;const d=axes(held(controls,p));if(d.x||d.y){p.dx=d.x;p.dy=d.y;}const dash=t<p.dashUntil,speed=dash?395:p.id===m.ownerId?140:175;p.x=clamp(p.x+(dash?p.dx:d.x)*speed*dt,55,645);p.y=clamp(p.y+(dash?p.dy:d.y)*speed*dt,75,405);}
   if(owner){
    const challenger=w.players.filter(p=>p!==owner&&active(p)&&t>=p.stunUntil&&t<p.dashUntil&&t>=m.protectionUntil&&Math.hypot(p.x-owner.x,p.y-owner.y)<48).sort((a,b)=>Math.hypot(a.x-owner.x,a.y-owner.y)-Math.hypot(b.x-owner.x,b.y-owner.y)||((a.index+Math.floor(t*20))%w.players.length)-((b.index+Math.floor(t*20))%w.players.length))[0];
    if(challenger){m.ownerId=challenger.id;m.protectionUntil=t+.85;challenger.steals++;challenger.cornerTime=0;owner.stunUntil=t+.16;owner=challenger;m.notice=owner.name+' 님 왕관 낚아채기! 잠깐의 보호 시간!';}
   }else{const pickup=w.players.filter(p=>active(p)&&t>=p.stunUntil&&Math.hypot(p.x-o.x,p.y-o.y)<29).sort((a,b)=>Math.hypot(a.x-o.x,a.y-o.y)-Math.hypot(b.x-o.x,b.y-o.y)||((a.index+Math.floor(t*20))%w.players.length)-((b.index+Math.floor(t*20))%w.players.length))[0];if(pickup){owner=pickup;m.ownerId=pickup.id;m.protectionUntil=t+.85;m.notice=pickup.name+' 님 왕관 획득!';}}
   if(owner){
    const corner=(owner.x<120||owner.x>580)&&(owner.y<125||owner.y>345);owner.cornerTime=corner?owner.cornerTime+dt:Math.max(0,owner.cornerTime-dt*2);
    if(owner.cornerTime>=1.1){m.notice=owner.name+' 님, 모서리 캠핑 금지! 왕관이 중앙으로 돌아와요.';owner.cornerTime=0;m.ownerId='';owner=null;m.protectionUntil=t+.35;o.x=350;o.y=230;}
    else{owner.heldSeconds+=dt;o.x=owner.x;o.y=owner.y-29;}
   }
   for(const p of w.players)p.score=Math.floor(p.heldSeconds*100)+p.steals*8;
  },
  bot(w,p){if(w.meta.ownerId===p.id){const a=w.elapsed*.72+p.index;return{held:pointTo(350+Math.cos(a)*90-p.x,230+Math.sin(a)*65-p.y)};}const owner=w.players.find(q=>q.id===w.meta.ownerId),target=owner||w.objects[0],dx=target.x-p.x,dy=(owner?target.y:target.y)-p.y,d=Math.hypot(dx,dy);return{held:pointTo(dx,dy),...owner&&d<135&&w.elapsed>=p.dashReadyAt?{action:'dash'}:{}};}
 };
 function laserDistance(o,p){return Math.abs((p.x-o.x)*Math.sin(o.angle)-(p.y-o.y)*Math.cos(o.angle));}
 function laserSpawn(w,p){let best={x:100,y:100},bestSafety=-1;for(const v of [{x:90,y:95},{x:610,y:95},{x:90,y:390},{x:610,y:390},{x:190,y:145},{x:510,y:330}]){const safety=Math.min(...w.objects.filter(o=>o.activeAt<=w.elapsed&&o.endAt>w.elapsed).map(o=>laserDistance(o,v)),500);if(safety>bestSafety){bestSafety=safety;best=v;}}p.x=best.x;p.y=best.y;}
 const lasers={
  init(w){w.duration=26;w.objects=[];w.meta={serial:0,nextPatternAt:.8,patternIndex:0,roundSurvival:true,partyRespawn:false,notice:'점선은 예고, 빨간 선은 위험! 하트가 다 떨어지면 이번 판 탈락. Space 대시로 피해요.'};w.players.forEach((p,i)=>{base(p);const a=-Math.PI/2+i*tau/w.players.length;Object.assign(p,{x:350+Math.cos(a)*135,y:230+Math.sin(a)*100,dx:0,dy:-1,dashUntil:0,dashReadyAt:0,dodgeUntil:0,received:0,nearMisses:0});});},
  input(w,p,action){if(action!=='dash'||!active(p)||w.elapsed<p.dashReadyAt||w.elapsed<p.stunUntil)return false;p.dashUntil=w.elapsed+.14;p.dashReadyAt=w.elapsed+1.65;p.dodgeUntil=w.elapsed+.24;p.actionUntil=p.dashUntil;return true;},
  step(w,dt,controls,random){
   const t=w.elapsed,m=w.meta;
   if(t>=m.nextPatternAt){const index=m.patternIndex++,mode=index%3===1?'sweep':'rotate',base=random()*Math.PI,axesCount=index%3===2?2:1;for(let i=0;i<axesCount;i++)w.objects.push({id:'laser_'+(++m.serial),kind:'laser',mode,x:350,y:230,angle:mode==='sweep'?Math.PI/2:base+i*Math.PI/2,baseAngle:base+i*Math.PI/2,spin:index%2?.58:-.58,bornAt:t,activeAt:t+.85,endAt:t+3.35,hitIds:[],nearIds:[]});m.nextPatternAt=t+3.25;m.notice=mode==='sweep'?'가로질러 오는 레이저! 틈을 보고 대시!':axesCount===2?'십자 회전! 두 줄 사이로 움직여요!':'회전 레이저! 선을 따라 뛰지 마!';}
   for(const o of w.objects){if(o.mode==='sweep'){o.x=65+clamp((t-o.activeAt)/2.5,0,1)*570;o.y=230;}else{o.angle=o.baseAngle+Math.max(0,t-o.activeAt)*o.spin;o.x=350;o.y=230;}}
   for(const p of w.players){if(!active(p)||t<p.respawnUntil)continue;const d=axes(held(controls,p));if(d.x||d.y){p.dx=d.x;p.dy=d.y;}if(t>=p.stunUntil){const dash=t<p.dashUntil,speed=dash?415:185;p.x=clamp(p.x+(dash?p.dx:d.x)*speed*dt,35,665);p.y=clamp(p.y+(dash?p.dy:d.y)*speed*dt,68,420);}}
   for(const o of w.objects){if(t<o.activeAt||t>=o.endAt)continue;for(const p of w.players){if(!active(p))continue;const distance=laserDistance(o,p);if(distance<23&&t>=p.invincibleUntil&&t>=p.dodgeUntil&&!o.hitIds.includes(p.id)){o.hitIds.push(p.id);p.received++;p.health--;p.stunUntil=t+.3;p.invincibleUntil=t+1.05;if(p.health<=0){arcadeSurvivalEliminate(w,p);m.notice=p.name+' 님 이번 판 탈락 · 다음 게임에 다시 참여해요.';}else m.notice=p.name+' 님 레이저 터치! 남은 하트 '+p.health+'개.';}else if(distance>=24&&distance<45&&!o.nearIds.includes(p.id)){o.nearIds.push(p.id);p.nearMisses++;}}}
   w.objects=w.objects.filter(o=>o.endAt>t);arcadeSurvivalSettle(w,p=>p.health*10+p.nearMisses);
  },
  bot(w,p){let dx=(350-p.x)*.08,dy=(230-p.y)*.08,urgent=false;for(const o of w.objects){if(w.elapsed<o.activeAt-.25)continue;const side=(p.x-o.x)*Math.sin(o.angle)-(p.y-o.y)*Math.cos(o.angle),distance=Math.abs(side);if(distance<85){const sign=side>=0?1:-1;dx+=Math.sin(o.angle)*sign*(95-distance);dy-=Math.cos(o.angle)*sign*(95-distance);if(distance<29&&w.elapsed>=o.activeAt)urgent=true;}}return{held:pointTo(dx,dy),...urgent&&w.elapsed>=p.dashReadyAt?{action:'dash'}:{}};}
 };
 return{dodgeball,crown,lasers,...createArcadeTransitRules()};
}
/* END_ARCADE_ACTION_PACK_RULES_V1 */

/* TRANSIT ACTION PACK RULES
 frogger: player col,row,goalRow,deliveries,crashes,leapUntil; objects kind=trafficCar with x,y,width,height,vx; meta grid geometry.
 bridge: player laneX,carried,bridgeSteps,finishedAt,collected; objects kind=bridgeWood with active,readyAt,ownerId; meta bridgeGoal/firstFinishAt.
 claw: player hookX,hookY,hookState,hookPrizeId,hookReadyAt,catches; shared kind=clawPrize objects have active,ownerId,mass,value,baseX,baseY,amplitude,speed,phase.
 */
function createArcadeTransitRules(){
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),active=p=>!p.eliminated&&!p.forfeited;
 const keys=(controls,p)=>controls.get(p.id)?.held||new Set();
 const axes=k=>{const x=Number(k.has('right'))-Number(k.has('left')),y=Number(k.has('down'))-Number(k.has('up')),d=Math.hypot(x,y)||1;return{x:x/d,y:y/d};};
 const guide=(dx,dy)=>{const held=[];if(dx>8)held.push('right');if(dx< -8)held.push('left');if(dy>8)held.push('down');if(dy< -8)held.push('up');return held;};
 function frogPosition(p){p.x=50+p.col*50;p.y=430-p.row*42;}
 function frogHop(w,p,dx,dy,length=1){
  const col=clamp(p.col+dx*length,0,12),row=clamp(p.row+dy*length,0,9);if(col===p.col&&row===p.row)return false;
  if(!w.meta.safeRows.includes(row)&&w.players.some(q=>q!==p&&active(q)&&q.col===col&&q.row===row))return false;
  p.col=col;p.row=row;p.faceCol=dx;p.faceRow=dy;frogPosition(p);p.moveReadyAt=w.elapsed+.17;p.actionUntil=w.elapsed+.15;
  if(p.row===p.goalRow){p.deliveries++;p.goalRow=p.goalRow===9?0:9;p.lastResult='배송 완료! 반대편으로 한 번 더';p.resultUntil=w.elapsed+.8;w.meta.notice=p.name+' 님 배송 성공!';}
  return true;
 }
 function frogScore(w,p){const progress=p.goalRow===9?p.row:9-p.row;p.score=arcadeSurvivalScore(w,p,p.deliveries*10+progress);}
 const frogger={
  init(w,random){
   w.duration=26;w.meta={gridX:50,gridBottom:430,tileW:50,tileH:42,cols:13,rows:10,safeRows:[0,4,9],roundSurvival:true,partyRespawn:false,notice:'차에 부딪히면 이번 판 탈락! 안전지대를 보고 이동하며 오래 살아남아요. Space 두 칸 도약!'};w.objects=[];
   for(const row of [1,2,3,5,6,7,8]){const dir=row%2?1:-1,speed=(70+random()*55)*dir,width=48+random()*32;for(let i=0;i<2;i++)w.objects.push({id:'traffic_'+row+'_'+i,kind:'trafficCar',row,x:70+i*360+random()*45,y:430-row*42,width,height:28,vx:speed,emoji:['🚕','🚚','🚌'][Math.floor(random()*3)]});}
   w.players.forEach((p,i)=>{Object.assign(p,{col:Math.round((i+1)*12/(w.players.length+1)),row:0,goalRow:9,deliveries:0,crashes:0,faceCol:0,faceRow:1,moveReadyAt:0,leapReadyAt:0,leapUntil:0,invulnUntil:0,lastResult:'',resultUntil:0,health:3,score:0,eliminated:false,survived:0,fallAt:-1});frogPosition(p);});
  },
  input(w,p,action){if(action!=='dash'||!active(p)||w.elapsed<p.leapReadyAt||w.elapsed<p.stunUntil)return false;const dx=p.faceCol||0,dy=p.faceRow||(dx?0:1);if(!frogHop(w,p,dx,dy,2))return false;p.leapReadyAt=w.elapsed+1.25;p.leapUntil=w.elapsed+.2;p.actionUntil=p.leapUntil;frogScore(w,p);return true;},
  step(w,dt,controls){
   for(const car of w.objects){car.x+=car.vx*dt;if(car.x>790)car.x=-90;if(car.x< -90)car.x=790;}
   for(const p of w.players){if(!active(p))continue;const held=keys(controls,p);if(w.elapsed>=p.stunUntil&&w.elapsed>=p.moveReadyAt){let dx=0,dy=0;if(held.has('up'))dy=1;else if(held.has('down'))dy=-1;else if(held.has('left'))dx=-1;else if(held.has('right'))dx=1;if(dx||dy){p.faceCol=dx;p.faceRow=dy;frogHop(w,p,dx,dy);}}
    if(w.elapsed>=p.invulnUntil&&w.elapsed>=p.leapUntil){const car=w.objects.find(o=>o.row===p.row&&Math.abs(o.x-p.x)<o.width/2+12&&Math.abs(o.y-p.y)<24);if(car){p.crashes++;p.leapUntil=0;p.lastResult='교통사고 · 이번 판 탈락';p.resultUntil=w.elapsed+2;arcadeSurvivalEliminate(w,p);w.meta.notice=p.name+' 님 교통사고! 이번 판은 관전하고 다음 게임에 다시 참여해요.';}}
    frogScore(w,p);
   }
   arcadeSurvivalSettle(w,p=>p.deliveries*10+(p.goalRow===9?p.row:9-p.row));
  },
  bot(w,p){
   if(w.elapsed<p.stunUntil)return{held:[]};const dir=p.goalRow>p.row?1:-1,nextRow=p.row+dir,next2=clamp(p.row+dir*2,0,9),blocked=(row,col)=>w.objects.some(o=>o.row===row&&Math.abs(o.x+o.vx*.22-(50+col*50))<o.width/2+19);
   const occupied=w.players.some(q=>q!==p&&active(q)&&q.col===p.col&&q.row===nextRow);
   if(!blocked(nextRow,p.col)&&!occupied)return{held:[dir>0?'up':'down']};
   if(!blocked(next2,p.col)&&w.elapsed>=p.leapReadyAt&&p.faceRow===dir&&!w.players.some(q=>q!==p&&active(q)&&q.col===p.col&&q.row===next2))return{held:[],action:'dash'};
   for(const side of p.index%2?[1,-1]:[-1,1])if(p.col+side>=0&&p.col+side<=12&&!blocked(p.row,p.col+side)&&!w.players.some(q=>q!==p&&active(q)&&q.col===p.col+side&&q.row===p.row))return{held:[side>0?'right':'left']};
   return{held:[]};
  }
 };
 function woodPosition(o,random){o.x=38+random()*624;o.y=340+random()*80;o.active=true;o.ownerId='';}
 const bridge={
  init(w,random){
   w.duration=28;w.meta={bridgeGoal:16,entryY:258,finishY:64,firstFinishAt:-1,notice:'나무는 세 개까지만! 내 색 다리 입구에서 Space로 놓아 길을 이어요.'};w.objects=[];
   for(let i=0;i<13;i++){const o={id:'wood_'+i,kind:'bridgeWood',x:0,y:0,active:true,readyAt:0,ownerId:'',generation:0};woodPosition(o,random);w.objects.push(o);}
   w.players.forEach((p,i)=>{p.laneX=(i+.5)*700/w.players.length;p.x=p.laneX;p.y=400;p.carried=0;p.bridgeSteps=0;p.finishedAt=-1;p.buildReadyAt=0;p.collected=0;p.health=3;p.score=0;p.lastResult='';p.resultUntil=0;p.eliminated=false;});
  },
  input(w,p,action){
   if(action!=='hit'||!active(p)||p.finishedAt>=0||w.elapsed<p.buildReadyAt||p.carried<1||p.y>286||Math.abs(p.x-p.laneX)>Math.min(36,700/w.players.length*.43))return false;
   p.carried--;p.bridgeSteps++;p.buildReadyAt=w.elapsed+.28;p.actionUntil=w.elapsed+.23;p.lastResult='+1 다리!';p.resultUntil=w.elapsed+.55;
   if(p.bridgeSteps>=w.meta.bridgeGoal){p.bridgeSteps=w.meta.bridgeGoal;p.finishedAt=w.elapsed;p.x=p.laneX;p.y=w.meta.finishY;p.lastResult='다리 완성! 건너편 도착';p.resultUntil=w.elapsed+3;if(w.meta.firstFinishAt<0)w.meta.firstFinishAt=w.elapsed;w.meta.notice=p.name+' 님 다리 완성! 남은 친구들도 서둘러요.';}
   p.score=p.finishedAt>=0?w.meta.bridgeGoal*8+Math.max(0,w.duration-p.finishedAt)*2:p.bridgeSteps*8+p.carried*.01;return true;
  },
  step(w,dt,controls,random){
   for(const p of w.players){if(!active(p)||p.finishedAt>=0)continue;const d=axes(keys(controls,p));p.x=clamp(p.x+d.x*188*dt,22,678);p.y=clamp(p.y+d.y*188*dt,254,432);}
   for(const o of w.objects){if(!o.active&&w.elapsed>=o.readyAt)woodPosition(o,random);if(!o.active)continue;
    const pick=w.players.filter(p=>active(p)&&p.finishedAt<0&&p.carried<3&&Math.hypot(p.x-o.x,p.y-o.y)<25).sort((a,b)=>Math.hypot(a.x-o.x,a.y-o.y)-Math.hypot(b.x-o.x,b.y-o.y)||a.index-b.index)[0];
    if(pick){o.active=false;o.ownerId=pick.id;o.readyAt=w.elapsed+1.15;o.generation++;pick.carried++;pick.collected++;pick.actionUntil=w.elapsed+.13;}
   }
   for(const p of w.players)if(active(p))p.score=p.finishedAt>=0?w.meta.bridgeGoal*8+Math.max(0,w.duration-p.finishedAt)*2:p.bridgeSteps*8+p.carried*.01;
   const racers=w.players.filter(active);if(w.elapsed>=20&&(racers.length&&racers.every(p=>p.finishedAt>=0)||w.meta.firstFinishAt>=0&&w.elapsed-w.meta.firstFinishAt>=3))w.meta.roundOver=true;
  },
  bot(w,p){
   if(p.finishedAt>=0)return{held:[]};const need=Math.min(3,w.meta.bridgeGoal-p.bridgeSteps);
   if(p.carried>=need||p.carried>0&&p.y<290){const dx=p.laneX-p.x,dy=260-p.y;return{held:guide(dx,dy),...(p.y<=284&&Math.abs(dx)<=Math.min(34,700/w.players.length*.41)&&w.elapsed>=p.buildReadyAt?{action:'hit'}:{})};}
   const target=w.objects.filter(o=>o.active).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];return{held:target?guide(target.x-p.x,target.y-p.y):guide(p.laneX-p.x,350-p.y)};
  }
 };
 function prizeAt(o,t){return{x:clamp(o.baseX+Math.sin(t*o.speed+o.phase)*o.amplitude,34,666),y:o.baseY+Math.sin(t*o.speed*.6+o.phase)*11};}
 const claw={
  init(w,random){
   w.duration=26;w.meta={hookTop:86,hookBottom:382,serial:0,notice:'←/→로 집게를 맞추고 Space! 무거운 상품은 비싸지만 끌어올리는 데 오래 걸려요.'};w.objects=[];
   for(let i=0;i<14;i++){const mass=1+Math.floor(random()*3),o={id:'prize_'+i,kind:'clawPrize',baseX:50+random()*600,baseY:176+random()*158,amplitude:15+random()*30,speed:.65+random()*.8,phase:random()*Math.PI*2,mass,value:mass===1?5:mass===2?9:14,emoji:mass===1?'🍬':mass===2?'🍱':'🧸',x:0,y:0,active:true,ownerId:'',readyAt:0,generation:0};Object.assign(o,prizeAt(o,0));w.objects.push(o);}
   w.players.forEach((p,i)=>{p.x=50+(i+.5)*600/w.players.length;p.y=80;p.hookX=p.x;p.hookY=86;p.hookState='idle';p.hookPrizeId='';p.hookReadyAt=0;p.catches=0;p.attempts=0;p.health=3;p.score=0;p.lastResult='';p.resultUntil=0;p.eliminated=false;});
  },
  input(w,p,action){if(action!=='hit'||!active(p)||w.elapsed<p.hookReadyAt)return false;if(p.hookState==='down'){p.hookState='up';p.lastResult='빈 집게 조기 회수!';p.resultUntil=w.elapsed+.65;return true;}if(p.hookState!=='idle')return false;p.hookState='down';p.hookY=w.meta.hookTop;p.hookX=p.x;p.hookPrizeId='';p.attempts++;p.actionUntil=w.elapsed+.2;return true;},
  step(w,dt,controls){
   const t=w.elapsed;
   for(const o of w.objects){if(o.ownerId&&!w.players.some(p=>p.id===o.ownerId&&active(p))){o.ownerId='';o.active=false;o.readyAt=t+.45;}
    if(!o.active&&!o.ownerId&&t>=o.readyAt){o.active=true;o.generation++;}
    if(o.active)Object.assign(o,prizeAt(o,t));
   }
   for(const p of w.players){if(!active(p))continue;
    if(p.hookState==='idle'){const held=keys(controls,p),dx=Number(held.has('right'))-Number(held.has('left'));p.x=clamp(p.x+dx*178*dt,30,670);p.hookX=p.x;p.hookY=w.meta.hookTop;continue;}
    const oldY=p.hookY;if(p.hookState==='down'){const held=keys(controls,p);p.x=clamp(p.x+(Number(held.has('right'))-Number(held.has('left')))*72*dt,30,670);}p.hookX=clamp(p.x+Math.sin(t*3+p.index*.6)*9,27,673);
    if(p.hookState==='down'){
     p.hookY=Math.min(w.meta.hookBottom,p.hookY+238*dt);
     const caught=w.objects.filter(o=>o.active&&!o.ownerId&&Math.abs(o.x-p.hookX)<25&&o.y>=oldY-15&&o.y<=p.hookY+15).sort((a,b)=>a.y-b.y||Math.abs(a.x-p.hookX)-Math.abs(b.x-p.hookX))[0];
     if(caught){caught.active=false;caught.ownerId=p.id;p.hookPrizeId=caught.id;p.hookState='up';p.lastResult='잡았다! '+caught.value+'점 상품';p.resultUntil=t+.8;}
     else if(p.hookY>=w.meta.hookBottom)p.hookState='up';
    }else{
     const prize=w.objects.find(o=>o.id===p.hookPrizeId&&o.ownerId===p.id),speed=prize?prize.mass===1?218:prize.mass===2?156:116:275;p.hookY=Math.max(w.meta.hookTop,p.hookY-speed*dt);
     if(p.hookY<=w.meta.hookTop){if(prize){p.score+=prize.value;p.catches++;p.lastResult='획득! +'+prize.value;prize.ownerId='';prize.active=false;prize.readyAt=t+1;w.meta.notice=p.name+' 님 '+prize.emoji+' 획득!';}else p.lastResult='헛손질! 다시 조준';p.resultUntil=t+.9;p.hookState='idle';p.hookPrizeId='';p.hookReadyAt=t+.4;}
    }
    const heldPrize=w.objects.find(o=>o.id===p.hookPrizeId&&o.ownerId===p.id);if(heldPrize){heldPrize.x=p.hookX;heldPrize.y=p.hookY+13;}
   }
  },
  bot(w,p){
   if(p.hookState!=='idle')return{held:[]};
   const target=w.objects.filter(o=>o.active&&!o.ownerId).map(o=>{const future=w.elapsed+(o.y-w.meta.hookTop)/238,position=prizeAt(o,future);return{o,x:position.x,cost:Math.abs(position.x-p.x)/178+o.mass*.16};}).sort((a,b)=>a.cost-b.cost)[0];if(!target)return{held:[]};const dx=target.x-p.x;return{held:dx>7?['right']:dx< -7?['left']:[],...(Math.abs(dx)<15&&w.elapsed>=p.hookReadyAt?{action:'hit'}:{})};
  }
 };
 return{frogger,bridge,claw};
}

/* ARCADE_BRAIN_PACK_RULES_V1 */
function createArcadeBrainPackRules(){
 const privateGames=new WeakMap(),actions=['hit','jump','dash'];
 const alive=p=>!p.eliminated&&!p.forfeited,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const keys=(controls,id)=>controls.get(id)?.held||new Set();
 function feedback(w,p,text){p.feedback=text;p.feedbackUntil=w.elapsed+.85;p.actionUntil=w.elapsed+.2;}
 function players(w){for(const p of w.players){p.x=75+p.index*550/Math.max(1,w.players.length-1);p.y=395;p.score=0;p.health=3;p.locked=false;p.choiceLocked=false;p.nextInputAt=0;p.feedback='';p.feedbackUntil=0;p.roundPoints=0;}}
 function align(w,s,length,total,begin,resolve){const stage=Math.min(total-1,Math.floor((w.elapsed+1e-8)/length));while(s.stage<stage){if(resolve)resolve(w,s);s.stage++;begin(w,s);}const local=Math.max(0,w.elapsed-s.stage*length);w.meta.stage=s.stage;w.meta.stageLeft=clamp(length-local,0,length);return local;}
 function choice(w,p,action){const lane=actions.indexOf(action);return alive(p)&&lane>=0&&w.elapsed+1e-8>=p.nextInputAt?lane:-1;}
 function setReady(w,p,gap=.13){p.nextInputAt=w.elapsed+gap;}
 function memoryBegin(w,s){s.pattern=Array.from({length:2+Math.floor(s.stage/2)},()=>Math.floor(s.random()*3));w.meta.patternLength=s.pattern.length;w.meta.showLength=s.pattern.length*.48+.18;w.meta.phase='watch';w.meta.flashLane=-1;for(const p of w.players){p.memoryIndex=0;p.memoryBest=0;p.memoryRetryUsed=false;p.locked=false;p.choiceLocked=false;p.roundPoints=0;}}
 function memoryUpdate(w,s){const local=align(w,s,4.5,6,memoryBegin);w.meta.phase=local<w.meta.showLength?'watch':local<4.2?'repeat':'reveal';const tick=Math.floor(local/.48);w.meta.flashLane=w.meta.phase==='watch'&&tick<s.pattern.length&&local%.48<.36?s.pattern[tick]:-1;for(const p of w.players)p.choiceLocked=p.locked||w.meta.phase!=='repeat';w.meta.notice=w.meta.phase==='watch'?'불빛 순서를 기억해! 아직 누르지 말고.':w.meta.phase==='repeat'?'방금 본 순서대로 A / W / D! 한 번은 다시 도전할 수 있어요.':'다음 기억을 준비해요.';return local;}
 const memory={
  init(w,random){w.duration=27;w.objects=[];players(w);w.meta={stage:0,stageLeft:4.5,phase:'watch',patternLength:2,showLength:1.14,flashLane:-1,choiceLabels:['◀ 왼쪽','● 가운데','▶ 오른쪽'],notice:''};const s={stage:0,pattern:[],random};privateGames.set(w,s);memoryBegin(w,s);memoryUpdate(w,s);},
  input(w,p,action){const s=privateGames.get(w);if(!s)return false;memoryUpdate(w,s);const lane=choice(w,p,action);if(lane<0||p.locked||w.meta.phase!=='repeat')return false;setReady(w,p);if(lane!==s.pattern[p.memoryIndex]){p.score=Math.max(0,p.score-12);p.roundPoints-=12;if(!p.memoryRetryUsed){p.memoryRetryUsed=true;p.memoryIndex=0;setReady(w,p,.32);feedback(w,p,'한 번 더! 처음 불빛부터 다시 눌러요.');}else{p.locked=true;p.choiceLocked=true;feedback(w,p,'다음 문제에서 다시 도전!');}return false;}p.memoryIndex++;if(p.memoryIndex>p.memoryBest){p.memoryBest=p.memoryIndex;p.score+=12;p.roundPoints+=12;}if(p.memoryIndex===s.pattern.length){const bonus=40+s.stage*10;p.score+=bonus;p.roundPoints+=bonus;p.locked=true;p.choiceLocked=true;feedback(w,p,'순서 재현! +'+p.roundPoints);}else feedback(w,p,p.memoryIndex+'/'+s.pattern.length+' 기억 성공');return true;},
  step(w){const s=privateGames.get(w);if(s)memoryUpdate(w,s);},
  bot(w,p,random){const s=privateGames.get(w);if(!s||p.locked||w.meta.phase!=='repeat'||w.elapsed<p.nextInputAt||random()>.8)return{held:[]};return{held:[],action:actions[s.pattern[p.memoryIndex]]};}
 };
 const docNames=['행정 서류','회계 전표','학생 신청서'],docIcons=['📁','🧾','🎓'];
 function sorterBegin(w,s){s.type=Math.floor(s.random()*3);s.shift=Math.floor(s.stage/4)%2;w.meta.docType=s.type;w.meta.docIcon=docIcons[s.type];w.meta.docName=docNames[s.type];w.meta.ruleShift=s.shift;w.meta.rule=s.shift?'특별 규칙 · 원래 함보다 한 칸 오른쪽!':'기본 규칙 · 서류와 같은 그림 함!';for(const p of w.players){p.locked=false;p.choiceLocked=false;p.roundPoints=0;}}
 function sorterUpdate(w,s){const local=align(w,s,1.7,16,sorterBegin),preview=s.stage>0&&s.stage%4===0&&local<.36;w.meta.ruleChanged=s.stage>0&&s.stage%4===0;w.meta.phase=preview?'watch':local<1.45?'choose':'reveal';w.meta.belt=local/1.7;for(const p of w.players)p.choiceLocked=p.locked||w.meta.phase!=='choose';w.meta.notice=preview?'규칙 변경! 새 분류 방법을 먼저 확인해요.':w.meta.rule;return local;}
 const sorter={
  init(w,random){w.duration=27.2;w.objects=[];players(w);w.meta={stage:0,stageLeft:1.7,phase:'choose',docType:0,docIcon:'📁',docName:'행정 서류',ruleShift:0,rule:'',belt:0,choiceLabels:['📁 행정함','🧾 회계함','🎓 학생함'],notice:''};const s={stage:0,type:0,shift:0,random};privateGames.set(w,s);sorterBegin(w,s);sorterUpdate(w,s);},
  input(w,p,action){const s=privateGames.get(w);if(!s)return false;const local=sorterUpdate(w,s),lane=choice(w,p,action);if(lane<0||p.locked||w.meta.phase!=='choose')return false;p.locked=true;p.choiceLocked=true;setReady(w,p);const start=w.meta.ruleChanged ? .36 : 0,correct=lane===(s.type+s.shift)%3,points=correct?50+Math.round(20*(1-(local-start)/(1.45-start))):-12;p.score=Math.max(0,p.score+points);p.roundPoints=points;feedback(w,p,correct?'분류 완료! +'+points:'함이 달라! 특별 규칙도 확인해.');return correct;},
  step(w){const s=privateGames.get(w);if(s)sorterUpdate(w,s);},
  bot(w,p,random){const s=privateGames.get(w);return s&&!p.locked&&w.meta.phase==='choose'&&w.elapsed-s.stage*1.7>.32+p.index*.015&&random()<.8?{held:[],action:actions[(s.type+s.shift)%3]}:{held:[]};}
 };
 function receiptBegin(w,s){const count=s.stage<2?2:3,max=s.stage<2?5:s.stage<4?9:15,numbers=Array.from({length:count},()=>1+Math.floor(s.random()*max)),total=numbers.reduce((a,b)=>a+b,0),options=[total,total+1+Math.floor(s.random()*4),Math.max(1,total-1-Math.floor(s.random()*3))];for(let i=2;i>0;i--){const j=Math.floor(s.random()*(i+1));[options[i],options[j]]=[options[j],options[i]];}s.answer=options.indexOf(total);s.total=total;w.meta.numbers=numbers;w.meta.choiceLabels=options.map(n=>n+'원');w.meta.answer=-1;for(const p of w.players){if(s.stage>0&&!p.locked)p.receiptStreak=0;p.locked=false;p.choiceLocked=false;p.roundPoints=0;}}
 function receiptUpdate(w,s){const local=align(w,s,4,6,receiptBegin);w.meta.phase=local<3.3?'choose':'reveal';w.meta.answer=w.meta.phase==='reveal'?s.total:-1;w.meta.notice=w.meta.phase==='choose'?'영수증 금액을 더해서 합계를 골라요. 계산기는 마음속에!':'정답은 '+s.total+'원! 다음 영수증이 나와요.';return local;}
 const receipt={
  init(w,random){w.duration=24;w.objects=[];players(w);for(const p of w.players)p.receiptStreak=0;w.meta={stage:0,stageLeft:4,phase:'choose',numbers:[],choiceLabels:[],answer:-1,notice:''};const s={stage:0,answer:0,total:0,random};privateGames.set(w,s);receiptBegin(w,s);receiptUpdate(w,s);},
  input(w,p,action){const s=privateGames.get(w);if(!s)return false;const local=receiptUpdate(w,s),lane=choice(w,p,action);if(lane<0||p.locked||w.meta.phase!=='choose')return false;p.locked=true;p.choiceLocked=true;setReady(w,p);const correct=lane===s.answer;p.receiptStreak=correct?p.receiptStreak+1:0;const bonus=correct?Math.min(3,p.receiptStreak-1)*10:0,points=correct?70+Math.round(30*(1-local/3.3))+bonus:-15;p.score=Math.max(0,p.score+points);p.roundPoints=points;feedback(w,p,correct?'정산 일치! +'+points+(bonus?' · 연속 정답 +'+bonus:''):'한 번 더 더해볼걸…');return correct;},
  step(w){const s=privateGames.get(w);if(s)receiptUpdate(w,s);},
  bot(w,p,random){const s=privateGames.get(w);return s&&!p.locked&&w.meta.phase==='choose'&&w.elapsed-s.stage*4>.65+p.index*.035&&random()<.65?{held:[],action:actions[s.answer]}:{held:[]};}
 };
 function safeBegin(w,s){s.pin=Array.from({length:3},()=>Math.floor(s.random()*10));for(const p of w.players){p.dialFloat=0;p.dial=0;p.dialDirection=0;p.dialRepeatAt=0;p.safeProgress=0;p.safeMistakes=0;p.safePenaltyPaid=0;p.entered=[];p.locked=false;p.choiceLocked=false;p.roundPoints=0;}}
 function safeUpdate(w,s){const local=align(w,s,8,3,safeBegin);w.meta.phase=local<1.35?'watch':'unlock';w.meta.pinDisplay=w.meta.phase==='watch'?s.pin.join(' '):'● ● ●';w.meta.notice=w.meta.phase==='watch'?'금고 비밀번호 세 자리를 기억해요!':'←/→로 숫자를 맞추고 Space로 한 자리씩 확정!';return local;}
 const safe={
  init(w,random){w.duration=24;w.objects=[];players(w);w.meta={stage:0,stageLeft:8,phase:'watch',pinDisplay:'',notice:''};const s={stage:0,pin:[],random};privateGames.set(w,s);safeBegin(w,s);safeUpdate(w,s);},
  input(w,p,action){const s=privateGames.get(w);if(!s)return false;const local=safeUpdate(w,s);if(!['hit','dash','jump'].includes(action)||!alive(p)||p.locked||w.meta.phase!=='unlock'||w.elapsed<p.nextInputAt)return false;setReady(w,p,.24);const digit=p.dial;p.dialFloat=digit;if(digit!==s.pin[p.safeProgress]){p.safeMistakes++;const before=p.score;p.score=Math.max(0,p.score-8);p.safePenaltyPaid+=before-p.score;setReady(w,p,.42);feedback(w,p,'이 자리가 달라요! 맞힌 숫자는 유지돼요.');return false;}p.entered.push(true);p.safeProgress++;if(p.safeProgress===3){const unpaid=Math.max(0,p.safeMistakes*8-p.safePenaltyPaid),points=Math.max(0,180+Math.round((8-local)*10)-unpaid);p.score+=points;p.roundPoints=points;p.locked=true;p.choiceLocked=true;feedback(w,p,'찰칵! 금고 열림 +'+points);}else feedback(w,p,p.safeProgress+'번째 숫자 통과');return true;},
  step(w,dt,controls){const s=privateGames.get(w);if(!s)return;safeUpdate(w,s);for(const p of w.players){if(!alive(p)||p.locked||w.meta.phase!=='unlock'){p.dialDirection=0;continue;}const held=keys(controls,p.id),d=Number(held.has('right'))-Number(held.has('left'));if(d&&(d!==p.dialDirection||w.elapsed+1e-8>=p.dialRepeatAt)){p.dial=(p.dial+d+10)%10;p.dialFloat=p.dial;p.dialRepeatAt=w.elapsed+(d!==p.dialDirection ? .28 : .16);}p.dialDirection=d;}},
  bot(w,p,random){const s=privateGames.get(w);if(!s||p.locked||w.meta.phase!=='unlock')return{held:[]};const target=s.pin[p.safeProgress],delta=(target-p.dial+10)%10;if(delta===0)return{held:[],...(w.elapsed>=p.nextInputAt&&random()<.9?{action:'hit'}:{})};return{held:delta>5?['left']:['right']};}
 };
 function auctionBegin(w,s){s.choices.clear();s.resolved=false;w.meta.prize=3+Math.floor(s.random()*5);w.meta.phase='choose';w.meta.winnerId='';w.meta.choiceLabels=['0 · 불참','1 · 한 장','3 · 세 장'];for(const p of w.players){p.bid=-1;p.locked=false;p.choiceLocked=false;p.roundPoints=0;}}
 function auctionResolve(w,s){if(s.resolved)return;s.resolved=true;w.meta.phase='reveal';const chosen=w.players.filter(p=>alive(p)&&s.choices.has(p.id)),highest=Math.max(0,...chosen.map(p=>s.choices.get(p.id))),leaders=chosen.filter(p=>s.choices.get(p.id)===highest),winner=highest>0&&leaders.length===1?leaders[0]:null;w.meta.winnerId=winner?.id||'';for(const p of w.players){if(!alive(p))continue;const bid=s.choices.get(p.id)??0;p.bid=s.choices.has(p.id)?bid:-1;p.choiceLocked=true;p.budget-=bid;if(winner?.id===p.id)p.goods+=w.meta.prize;p.score=p.budget+p.goods;p.roundPoints=(winner?.id===p.id?w.meta.prize:0)-bid;feedback(w,p,winner?.id===p.id?'단독 최고 입찰! 상품 +'+w.meta.prize:bid?'입찰금 '+bid+' 소비. 낙찰은 다음에!':'예산을 아꼈다.');}w.meta.notice=winner?winner.name+' 님 낙찰! '+w.meta.prize+'점 상품 획득.':'최고 입찰이 겹쳤어요. 이번 상품은 유찰!';}
 function auctionUpdate(w,s){const local=align(w,s,6,4,auctionBegin,auctionResolve);if(local>=4.7)auctionResolve(w,s);w.meta.phase=s.resolved?'reveal':'choose';if(!s.resolved)w.meta.notice='마감 전에는 봉투를 다시 고를 수 있어요. 입찰금은 돌려주지 않고, 유일한 최고 입찰만 상품 획득!';return local;}
 const auction={
  init(w,random){w.duration=24;w.objects=[];players(w);for(const p of w.players){p.budget=12;p.goods=0;p.bid=-1;p.score=12;}w.meta={stage:0,stageLeft:6,phase:'choose',prize:3,winnerId:'',choiceLabels:[],notice:''};const s={stage:0,choices:new Map(),resolved:false,random};privateGames.set(w,s);auctionBegin(w,s);auctionUpdate(w,s);},
  input(w,p,action){const s=privateGames.get(w);if(!s)return false;auctionUpdate(w,s);const lane=choice(w,p,action);if(lane<0||w.meta.phase!=='choose')return false;const bid=[0,1,3][lane];if(bid>p.budget){feedback(w,p,'예산이 부족해! 더 작은 금액을 골라요.');return false;}const revised=s.choices.has(p.id);s.choices.set(p.id,bid);p.locked=true;p.choiceLocked=false;setReady(w,p);feedback(w,p,revised?'봉투 수정 완료. 금액은 공개 전까지 비밀!':'봉투 제출 완료. 마감 전에는 수정할 수 있어요!');return true;},
  step(w){const s=privateGames.get(w);if(s)auctionUpdate(w,s);},
  bot(w,p,random){const s=privateGames.get(w);if(!s||p.locked||w.meta.phase!=='choose'||w.elapsed-s.stage*6<.6+p.index*.12)return{held:[]};const affordable=[0,1,3].filter(n=>n<=p.budget),bid=affordable[Math.floor(random()*affordable.length)];return{held:[],action:actions[[0,1,3].indexOf(bid)]};}
 };
 function stackReset(w,p,delay=0){p.stackWidth=150;p.stackCenter=350;p.stackLevel=0;p.perfectChain=0;p.stackRects=[];p.stackSpawnAt=w.elapsed;p.stackReadyAt=w.elapsed+delay;p.movingX=585;p.movingWidth=150;}
 function stackUpdate(w,p){const speed=1.7+Math.min(10,p.stackLevel)*.14,side=(p.blocks+p.failures)%2?-1:1;p.movingX=350+Math.cos((w.elapsed-p.stackSpawnAt)*speed)*235*side;p.movingWidth=p.stackWidth;}
 const stacker={
  init(w){w.duration=24;w.objects=[];players(w);w.meta={notice:'양쪽에서 오는 블록을 Space로 멈춰요. PERFECT 3연속이면 너비 회복!'};for(const p of w.players){p.blocks=0;p.perfects=0;p.failures=0;p.bestLevel=0;stackReset(w,p,.3);stackUpdate(w,p);}},
  input(w,p,action){if(!['hit','dash','jump'].includes(action)||!alive(p)||w.elapsed<p.nextInputAt||w.elapsed<p.stackReadyAt)return false;setReady(w,p,.23);stackUpdate(w,p);const difference=Math.abs(p.movingX-p.stackCenter),perfect=difference<=Math.max(5,p.stackWidth*.06),overlap=perfect?p.stackWidth:p.stackWidth-difference;if(overlap<=6){p.failures++;p.score=Math.max(0,p.score-12);feedback(w,p,'와르르! 새 탑으로 다시 도전.');stackReset(w,p,.65);return false;}const left=Math.max(p.stackCenter-p.stackWidth/2,p.movingX-p.stackWidth/2),right=Math.min(p.stackCenter+p.stackWidth/2,p.movingX+p.stackWidth/2);p.stackCenter=perfect?p.stackCenter:(left+right)/2;p.perfectChain=perfect?p.perfectChain+1:0;p.stackWidth=Math.min(150,overlap+(p.perfectChain>0&&p.perfectChain%3===0?12:0));p.stackLevel++;p.blocks++;p.bestLevel=Math.max(p.bestLevel,p.stackLevel);if(perfect)p.perfects++;const points=25+Math.round(overlap/6)+(perfect?20:0);p.score+=points;p.stackRects.push([p.stackCenter,p.stackWidth,p.stackLevel]);p.stackRects=p.stackRects.slice(-8);p.stackSpawnAt=w.elapsed;feedback(w,p,perfect?'PERFECT '+p.perfectChain+'연속! +'+points+(p.perfectChain%3===0?' · 너비 회복!':''):'남은 너비 '+Math.round(overlap)+' · +'+points);return true;},
  step(w){for(const p of w.players)if(alive(p))stackUpdate(w,p);},
  bot(w,p,random){return w.elapsed>=p.stackReadyAt&&w.elapsed>=p.nextInputAt&&Math.abs(p.movingX-p.stackCenter)<22&&random()<.85?{held:[],action:'hit'}:{held:[]};}
 };
 function reactionBegin(w,s){
  if(s.stage%3===0){s.laneBag=[0,1,2];for(let i=2;i>0;i--){const j=Math.floor(s.random()*(i+1));[s.laneBag[i],s.laneBag[j]]=[s.laneBag[j],s.laneBag[i]];}}
  s.target=s.laneBag[s.stage%3];s.goAt=.9+s.random()*1.2;s.window=s.stage<2?1:s.stage<5?.86:.72;s.order=0;
  for(const p of w.players){p.locked=false;p.choiceLocked=false;p.reactionMs=-1;p.reactionRank=0;p.reactionOutcome='';p.roundPoints=0;}
  w.meta.signal='wait';w.meta.signalText='아직…';w.meta.targetLane=-1;w.meta.reactionWindow=s.window;w.meta.reactionLeft=0;
 }
 function reactionUpdate(w,s){
  const local=align(w,s,3.5,7,reactionBegin),closeAt=s.goAt+s.window;w.meta.targetLane=-1;w.meta.reactionLeft=0;w.meta.phase=local<closeAt?'react':'reveal';
  if(local>=closeAt){w.meta.signal='reveal';w.meta.signalText='신호 끝!';for(const p of w.players)if(alive(p)&&!p.locked){p.locked=true;p.choiceLocked=true;p.reactionOutcome='miss';p.reactionErrors++;feedback(w,p,'시간 초과! 다음 지시를 기다려요.');}}
  else if(local>=s.goAt){w.meta.signal='go';w.meta.targetLane=s.target;w.meta.reactionLeft=closeAt-local;w.meta.signalText=['◀ 반려!','● 승인!','▶ 전달!'][s.target];}
  else if(local>.28&&local<.55||local>s.goAt-.5&&local<s.goAt-.24){w.meta.signal='fake';w.meta.signalText='찍…지 마!';}
  else{w.meta.signal='wait';w.meta.signalText='아직…';}
  w.meta.notice=w.meta.signal==='go'?'진짜 신호! 지시와 같은 버튼을 시간 안에 골라요.':'A/← 반려 · W/Space 승인 · D/→ 전달. 가짜 신호에는 손 떼기!';return local;
 }
 const reaction={
  init(w,random){w.duration=24.5;w.objects=[];players(w);for(const p of w.players){p.reactionHits=0;p.reactionErrors=0;}w.meta={stage:0,stageLeft:3.5,phase:'react',signal:'wait',signalText:'아직…',choiceLabels:['◀ 반려','● 승인','▶ 전달'],targetLane:-1,reactionWindow:1,reactionLeft:0,notice:''};const s={stage:0,goAt:1,window:1,target:0,laneBag:[],order:0,random};privateGames.set(w,s);reactionBegin(w,s);reactionUpdate(w,s);},
  input(w,p,action){const s=privateGames.get(w);if(!s)return false;const local=reactionUpdate(w,s),lane=choice(w,p,action);if(lane<0||p.locked||local>=s.goAt+s.window)return false;p.locked=true;p.choiceLocked=true;setReady(w,p);if(local<s.goAt||lane!==s.target){p.score=Math.max(0,p.score-35);p.roundPoints=-35;p.reactionErrors++;p.reactionOutcome=local<s.goAt?'early':'wrong';feedback(w,p,local<s.goAt?'가짜·대기 신호! 이번 기회는 끝.':'다른 지시였어요! 다음 신호 대기.');return false;}p.reactionMs=Math.max(0,Math.round((local-s.goAt)*1000));p.reactionRank=++s.order;p.reactionHits++;p.reactionOutcome='hit';const points=Math.round(150-Math.min(120,(local-s.goAt)*110));p.score+=points;p.roundPoints=points;feedback(w,p,p.reactionMs+'ms · 정확한 선택! +'+points);return true;},
  step(w){const s=privateGames.get(w);if(s)reactionUpdate(w,s);},
  bot(w,p,random){const s=privateGames.get(w);if(!s||p.locked||w.meta.signal!=='go'||w.elapsed-s.stage*3.5<s.goAt+.25+p.index*.014)return{held:[]};return{held:[],action:actions[random()<.78?s.target:(s.target+1+Math.floor(random()*2))%3]};}
 };
 return{memory,sorter,receipt,safe,auction,stacker,reaction};
}
/* END_ARCADE_BRAIN_PACK_RULES_V1 */

/* ARCADE_ENGINE_V1 */
function createArcadeEngine(){
 const rules={...createArcadeMotionRules(),...createArcadeSkillRules(),...(typeof createArcadeCombatKartRules==='function'?createArcadeCombatKartRules():{}),...(typeof createArcadeSocialRhythmRules==='function'?createArcadeSocialRhythmRules():{}),...(typeof createArcadeBasketRules==='function'?createArcadeBasketRules():{}),...(typeof createArcadeTrayRules==='function'?createArcadeTrayRules():{}),...(typeof createArcadeSportsRules==='function'?createArcadeSportsRules():{}),...(typeof createArcadeActionPackRules==='function'?createArcadeActionPackRules():{}),...(typeof createArcadeBrainPackRules==='function'?createArcadeBrainPackRules():{})},privateWorlds=new WeakMap(),directions=new Set(['up','down','left','right']);
 function rng(seed){let s=(seed>>>0)||0x15f00d;return ()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return (s>>>0)/4294967296;};}
 function ranked(w){const list=[...w.players].sort((a,b)=>Number(a.forfeited)-Number(b.forfeited)||b.score-a.score||a.index-b.index);let rank=0,last=null;return list.map((p,i)=>{const key=String(!!p.forfeited)+':'+p.score;if(key!==last)rank=i+1;last=key;return {id:p.id,score:p.score,rank,forfeited:!!p.forfeited};});}
 function finish(w){if(w.phase==='done')return;if(w.meta.roundSurvival===true)arcadeSurvivalSettle(w);w.phase='done';w.countdown=0;w.ranking=ranked(w);const eligible=w.ranking.filter(p=>!p.forfeited);w.winnerIds=eligible.filter(p=>p.rank===eligible[0]?.rank).map(p=>p.id);}
 function create(options){
  if(!options||typeof options.id!=='string'||!rules[options.game]||!Array.isArray(options.participants)||options.participants.length<2||options.participants.length>8||options.participants.some(p=>!p||typeof p.id!=='string'||!p.id)||new Set(options.participants.map(p=>p.id)).size!==options.participants.length)throw Error('Invalid arcade participants or game');
  const random=rng(options.seed),w={id:options.id,game:options.game,seed:options.seed>>>0,phase:'countdown',countdown:3,elapsed:0,seq:0,duration:24,players:options.participants.map((p,index)=>({id:p.id,name:String(p.name||'참가자').slice(0,24),department:String(p.department||'business'),index,x:100+index*50,y:230,score:0,health:3,eliminated:false,forfeited:false,stunUntil:0,actionUntil:0})),objects:[],meta:{},winnerIds:[],ranking:[]};
  rules[w.game].init(w,random);privateWorlds.set(w,{random,controls:new Map(w.players.map(p=>[p.id,{held:new Set(),seq:0,seenAt:-Infinity}]))});return w;
 }
 function input(w,id,cmd,now){
  const secret=privateWorlds.get(w);if(!secret||w.phase!=='play'||!Number.isFinite(now)||!cmd||!Number.isSafeInteger(cmd.seq)||cmd.seq<1)return false;
  const p=w.players.find(p=>p.id===id),control=secret.controls.get(id);if(!p||!control||p.eliminated||p.forfeited||cmd.seq<=control.seq||!['sync','jump','dash','hit'].includes(cmd.action))return false;
  if(cmd.action==='sync'&&(!Array.isArray(cmd.held)||cmd.held.length>4||cmd.held.some(k=>!directions.has(k))))return false;
  control.seq=cmd.seq;control.seenAt=now;if(cmd.action==='sync')control.held=new Set(cmd.held);else rules[w.game].input(w,p,cmd.action,secret.random);return true;
 }
 function step(w,dt,now){
  const secret=privateWorlds.get(w);if(!secret||w.phase==='done'||!Number.isFinite(dt)||dt<=0||!Number.isFinite(now))return false;dt=Math.min(.04,dt);
  w.seq++;if(w.phase==='countdown'){w.countdown=Math.max(0,w.countdown-dt);if(w.countdown<=1e-8){w.phase='play';w.countdown=0;}return true;}
  w.elapsed=Math.min(w.duration,w.elapsed+dt);for(const c of secret.controls.values())if(now-c.seenAt>900)c.held.clear();
  rules[w.game].step(w,dt,secret.controls,secret.random);
  for(const p of w.players){if(!Number.isFinite(p.score))p.score=0;for(const k of ['x','y','health','stunUntil','actionUntil'])if(!Number.isFinite(p[k]))p[k]=0;}
  if(w.elapsed>=w.duration-1e-8||w.meta.roundOver===true||w.players.every(p=>p.eliminated||p.forfeited))finish(w);return true;
 }
 function forfeit(w,id){if(!privateWorlds.has(w)||w.phase==='done')return false;const p=w.players.find(p=>p.id===id);if(!p||p.forfeited)return false;p.forfeited=true;p.eliminated=true;p.health=0;privateWorlds.get(w).controls.get(id)?.held.clear();if(w.players.every(p=>p.eliminated||p.forfeited))finish(w);return true;}
 function bot(w,id){const secret=privateWorlds.get(w);if(!secret||w.phase!=='play')return {held:[]};const p=w.players.find(p=>p.id===id);if(!p||p.eliminated||p.forfeited)return {held:[]};return rules[w.game].bot(w,p,secret.random)||{held:[]};}
 function complete(w){if(!privateWorlds.has(w))return false;finish(w);return true;}
 function release(w){const secret=privateWorlds.get(w);if(!secret)return false;for(const control of secret.controls.values())control.held.clear();return true;}
 return {create,input,step,forfeit,bot,complete,release};
}
/* END_ARCADE_ENGINE_V1 */


/* FIVE_ARCADE_UI_V1 */
const arcadeGames={
 sneak:{name:'교수님 몰래 튀어',icon:'🚦',tag:'멈칫멈칫',hint:'초록불엔 ↑로 달리고, 빨간불엔 손 떼! 먼저 도착할수록 높은 점수.',action:'달려!',key:'↑ / SPACE 꾹',input:'up',color:'#b9d67e'},
 dodge:{name:'급식실 운석 피하기',icon:'🍙',tag:'우당탕 회피',hint:'방향키로 이동! 빨간 원에 음식이 떨어져. Space로 짧게 대시해 피해!',action:'피해!',key:'SPACE / F',input:'dash',color:'#e6c675'},
 coins:{name:'월급 쟁탈전',icon:'🪙',tag:'월급은 내 거',hint:'방향키로 동전을 모아! Space로 돌진하면 가까운 상대 동전도 1개 슬쩍.',action:'뺏어!',key:'SPACE / F',input:'dash',color:'#eda992'},
 stamp:{name:'결재 도장 눈치싸움',icon:'🗳️',tag:'한 번의 타이밍',hint:'바늘이 초록 칸에 오면 Space! 한 차례에 딱 한 번. 잘못 찍으면 감점.',action:'쾅!',key:'SPACE / F',input:'hit',color:'#c5a0df'},
 runner:{name:'퇴근길 점프런',icon:'🏃',tag:'집에 가고 싶다',hint:'장애물이 오면 Space로 점프! 착지 후 다시 점프할 수 있어.',action:'점프!',key:'SPACE / F',input:'jump',color:'#8dccca'}
};
let arcadeDialog=null,arcadeUIFrame=0,arcadeBoardKey='',arcadeLastDraw=0,arcadeUIMenuKey='',arcadeUIHistoryKey='';
const arcadeUIActors=new Map(),arcadeUIMeters=new Map(),arcadeUIKeys=new Set(),arcadeUIPointers=new Map();
const arcadeUIObjects=new Map();let arcadeObjectFrame=0;
function arcadeObjectNode(key,tag,cls,text){let entry=arcadeUIObjects.get(key);if(!entry){entry={node:el(tag,cls),frame:0};arcadeUIObjects.set(key,entry);$('arcadeObjects').append(entry.node);}entry.frame=arcadeObjectFrame;const node=entry.node;if(node.className!==cls)node.className=cls;if(text!==undefined&&node.textContent!==String(text))node.textContent=String(text);return node;}
function arcadeObjectCleanup(){for(const [key,entry]of arcadeUIObjects)if(entry.frame!==arcadeObjectFrame){entry.node.remove();arcadeUIObjects.delete(key);}}
function arcadeNodeText(node,text){if(node&&node.textContent!==String(text))node.textContent=String(text);}
function arcadeStyle(node,key,value){if(node.style[key]!==value)node.style[key]=value;}
function arcadePercent(value){return Number(value.toFixed(3))+'%';}
function arcadePosition(node,left,top){arcadeStyle(node,'left',arcadePercent(left));arcadeStyle(node,'top',arcadePercent(top));}
function arcadeRenderHistory(s,points){const list=s.mode==='tournament'?(s.history||[]):[],last=list.at(-1),key=[s.id,points,list.length,last?.round,last?.game,last?.tieReason,last?.outIds?.join(','),last?.lotteryWinnerId].join('|');if(key===arcadeUIHistoryKey)return;arcadeUIHistoryKey=key;const history=list.map(h=>'R'+h.round+' '+(arcadeGames[h.game]?.name||'')+' · '+(points?(h.pointAwards||[]).map(a=>(s.members.find(m=>m.id===a.id)?.name||'참가자')+' +'+a.points+'점').join(' · '):h.outIds?.length?h.outIds.map(id=>arcadeDisplayName(s.members.find(m=>m.id===id)||{name:'참가자'},s)).join(', ')+' 탈락':'동점 재경기')).join('  /  ');arcadeSetText('arcadeHistory',history);$('arcadeHistory').hidden=!history;$('arcadeHistory').setAttribute('aria-label',points?'각 라운드 획득 점수':'이전 라운드 기록');}
function arcadeScoreRows(s){
 if(typeof arcadePointsStandings==='function')return arcadePointsStandings(s);
 const rows=s.members.filter(m=>m.response==='join').map((member,index)=>({id:member.id,member,index,points:s.totalPoints?.[member.id]||0,rank:null}));rows.sort((a,b)=>Number(!!(a.member.left||a.member.forfeited))-Number(!!(b.member.left||b.member.forfeited))||b.points-a.points||a.index-b.index);let place=0,previous=null;for(const row of rows){if(row.member.left||row.member.forfeited)continue;place++;if(row.points!==previous?.points)row.rank=place;else row.rank=previous.rank;previous=row;}return rows;
}
function arcadeRenderRoster(s,w,self,points){
 const roster=$('arcadeRoster');if(roster.dataset.session!==s.id){roster.dataset.session=s.id;roster.dataset.order='';roster.replaceChildren();for(const m of s.members){const n=el('span','five-player-chip');n.dataset.id=m.id;n.setAttribute('role','listitem');n.append(el('b','',(s.purpose==='lunch'?m.menu+' · ':'')+m.name+(m.id===self?' · 나':'')),el('small'));roster.append(n);}}
 roster.setAttribute('role','list');roster.setAttribute('aria-label',points?(s.phase==='done'?'최종 누적 점수 순위':'현재 누적 점수 순위'):'참가자 현황');
 const rows=points?arcadeScoreRows(s):[],ranks=new Map(rows.map(row=>[row.id,row])),joined=rows.filter(row=>row.rank!==null),order=points?[...rows.map(row=>row.id),...s.members.filter(m=>!ranks.has(m.id)).map(m=>m.id)]:s.members.map(m=>m.id),key=order.join('|');
 if(roster.dataset.order!==key){const nodes=new Map([...roster.children].map(n=>[n.dataset.id,n]));for(const id of order)if(nodes.has(id))roster.append(nodes.get(id));roster.dataset.order=key;}
 for(const n of roster.children){const m=s.members.find(m=>m.id===n.dataset.id),p=w?.players.find(p=>p.id===m.id),row=ranks.get(m.id),shared=row?.rank!==null&&joined.filter(other=>other.points===row?.points).length>1,rank=row?.rank===null||!row?'':(shared?'공동 ':'')+row.rank+'위 · ';let text=m.left?'퇴장'+(points?' · '+(s.totalPoints?.[m.id]||0)+'점':''):m.forfeited?'기권'+(points?' · '+(s.totalPoints?.[m.id]||0)+'점':''):m.response==='pending'?'고르는 중':m.response==='pass'?'관전':s.phase==='invite'?'준비 ✓':points?rank+(s.totalPoints?.[m.id]||0)+'점':s.mode==='tournament'&&!s.activeIds?.includes(m.id)?'탈락':p?(p.forfeited?'기권':w.meta?.roundSurvival?(p.eliminated?'이번 판 탈락':'생존 · '+(typeof p.hp==='number'?Math.ceil(p.hp)+'HP':'♥'.repeat(Math.max(0,p.health)))):w.game==='parking'?(p.parked||0)+'대':Number(p.score||0).toFixed(0)+'점'):'다음 판 대기';if(points&&s.phase==='round'&&p?.eliminated&&!p.forfeited)text+=' · 이번 판 관전';n.classList.toggle('is-out',m.left||m.forfeited||text==='탈락'||m.response==='pass'||s.phase==='round'&&p?.eliminated);n.classList.toggle('is-series-leader',points&&s.phase!=='invite'&&row?.rank===1);n.setAttribute('aria-label',m.name+(m.id===self?' · 나':'')+' · '+text);if(n.lastChild.textContent!==text)n.lastChild.textContent=text;}
}
const arcadeMoveKeys={ArrowUp:'up',KeyW:'up',ArrowDown:'down',KeyS:'down',ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right'};
function arcadeHeld(){return [...new Set([...arcadeUIKeys].map(k=>k==='Space'||k==='KeyF'?'up':arcadeMoveKeys[k]).filter(Boolean).concat([...arcadeUIPointers.values()].filter(a=>a!=='action')))];}
function arcadeClearKeys(){const had=arcadeUIKeys.size||arcadeUIPointers.size;arcadeUIKeys.clear();arcadeUIPointers.clear();if(had&&typeof arcadeState!=='undefined'&&arcadeState?.world?.phase==='play')arcadeInput('sync',[]);arcadeDialog?.querySelectorAll('.is-held').forEach(b=>b.classList.remove('is-held'));}
function arcadeEnsureUI(){
 if(arcadeDialog)return;
 arcadeDialog=el('dialog','five-arcade-dialog');arcadeDialog.id='arcadeDialog';arcadeDialog.setAttribute('aria-labelledby','arcadeTitle');
 arcadeDialog.innerHTML='<header class="five-head"><div><span id="arcadeEyebrow">NEW · 서른 가지 승부</span><h2 id="arcadeTitle">조교 오락실</h2></div><button id="arcadeCloseBtn" class="tiny-btn" type="button" aria-label="오락실 닫기">닫기</button></header><section id="arcadeMenu"><div class="five-intro"><div><b>마지막은 다 같이 한 판!</b><p>미니게임 30종을 한 판씩 연습하거나,<br>랜덤 4판 + 피날레 대난투에 도전해요!</p></div><div class="five-intro-mascot"></div></div><button id="arcadeTournamentBtn" class="five-tournament" type="button"><span>🎲 랜덤 4판 + 피날레 대난투</span><small id="arcadeTournamentHint">랜덤 4판 + 대난투 1판 · 매판 순위 누적</small><b>시작 →</b></button><div id="arcadeGameCards" class="five-game-cards"></div><p class="five-menu-note" id="arcadeMenuNote"></p></section><section id="arcadeSession" hidden><div class="five-round-strip"><b id="arcadeRoundTag"></b><span id="arcadeRemaining"></span></div><p id="arcadeHelp" class="five-help"></p><div id="arcadeRoster" class="five-roster"></div><section id="arcadeInvite" class="five-invite"><div class="five-invite-art"></div><h3 id="arcadeInviteTitle">올라올 사람?</h3><p id="arcadeInviteText"></p><div><button id="arcadeJoinBtn" class="btn primary" type="button">나도 한다 · 참가</button><button id="arcadePassBtn" class="btn" type="button">나는 구경할게</button></div><small id="arcadeInviteHint"></small></section><section id="arcadePlay" hidden><div id="arcadeBoard" class="five-board" aria-label="새 미니게임 경기장"><div id="arcadeScenery"></div><div id="arcadeObjects"></div><div id="arcadeActors"></div><div id="arcadeMeters"></div><div id="arcadeSignal" class="five-signal" hidden></div><span id="arcadeClock" class="five-clock"></span><div id="arcadeOverlay" class="five-overlay" hidden><strong id="arcadeOverlayTitle"></strong><span id="arcadeOverlayHint"></span></div></div><p id="arcadeStatus" class="five-status" role="status"></p><div id="arcadeControls" class="five-controls"><div id="arcadeDpad" class="five-dpad" aria-label="오락실 이동 조작"><button data-arcade-control="up" aria-label="오락실 위쪽 이동">▲<kbd>W / ↑</kbd></button><button data-arcade-control="left" aria-label="오락실 왼쪽 이동">◀<kbd>A / ←</kbd></button><i>이동</i><button data-arcade-control="right" aria-label="오락실 오른쪽 이동">▶<kbd>D / →</kbd></button><button data-arcade-control="down" aria-label="오락실 아래쪽 이동">▼<kbd>S / ↓</kbd></button></div><button data-arcade-control="action" class="five-action" aria-label="오락실 액션"><strong id="arcadeActionLabel"></strong><small id="arcadeActionHint"></small></button><span id="arcadeOwnStatus" class="five-own-status"></span></div></section><div id="arcadeHistory" class="five-history"></div><footer class="five-bottom"><span id="arcadeBottomNote"></span><button id="arcadeMenuBtn" class="tiny-btn" type="button" hidden>다른 게임 고르기</button><button id="arcadeReplayBtn" class="btn primary" type="button" hidden>한 판 더</button><button id="arcadeCancelBtn" class="tiny-btn" type="button">오락실 종료</button></footer></section>';
 const scoreStyle=el('style');scoreStyle.id='arcadeScoreStyles';scoreStyle.textContent='.five-player-chip.is-series-leader{background:#f9e3a1;border-color:#795d26}.five-player-chip.is-series-leader small{font-weight:900;color:#4f3a19}';document.head.append(scoreStyle);
 document.body.append(arcadeDialog);const arenaFit=el('div','five-arena-fit');$('arcadeBoard').before(arenaFit);arenaFit.append($('arcadeBoard'));arcadeDialog.querySelector('.five-intro-mascot').innerHTML=deptAvatarSvg('business');arcadeDialog.querySelector('.five-invite-art').innerHTML=deptAvatarSvg('accounting')+deptAvatarSvg('business')+deptAvatarSvg('hotel');
 for(const [id,g] of Object.entries(arcadeGames)){const card=el('button','five-game-card');card.type='button';card.dataset.game=id;card.style.setProperty('--game-color',g.color);card.append(el('span','five-card-icon',g.icon),el('small','',g.tag),el('b','',g.name),el('span','five-card-hint',g.hint),el('em','five-card-cta'));card.addEventListener('click',()=>arcadeChoose(id,'single'));$('arcadeGameCards').append(card);}
 $('arcadeCloseBtn').addEventListener('click',()=>{if(arcadeState)arcadeClose();else{arcadeClearKeys();arcadeDialog.close();}});arcadeDialog.addEventListener('cancel',e=>{e.preventDefault();$('arcadeCloseBtn').click();});
 $('arcadeTournamentBtn').addEventListener('click',()=>arcadeChoose('coins','tournament'));
 $('arcadeJoinBtn').addEventListener('click',()=>arcadeSend({t:'arcadeReply',gameId:arcadeState?.id,response:'join'}));
 $('arcadePassBtn').addEventListener('click',()=>arcadeSend({t:'arcadeReply',gameId:arcadeState?.id,response:'pass'}));
 $('arcadeCancelBtn').addEventListener('click',()=>arcadeSend({t:'arcadeCancel',gameId:arcadeState?.id}));
 $('arcadeMenuBtn').addEventListener('click',()=>{arcadeSend({t:'arcadeCancel',gameId:arcadeState?.id});arcadeEntry();});
 $('arcadeReplayBtn').addEventListener('click',()=>arcadeChoose(arcadeState?.chosen||'coins',arcadeState?.mode||'single'));
 arcadeDialog.addEventListener('pointerdown',e=>{const b=e.target.closest('[data-arcade-control]');if(!b||b.disabled||e.pointerType==='mouse'&&e.button!==0)return;e.preventDefault();const c=b.dataset.arcadeControl,g=arcadeState?.world?.game;try{b.setPointerCapture(e.pointerId);}catch{}arcadeUIPointers.set(e.pointerId,c==='action'&&g==='sneak'?'up':c);b.classList.add('is-held');if(c==='action'&&g!=='sneak')arcadeInput(arcadeGames[g]?.input||'hit',true);else arcadeInput('sync',arcadeHeld());});
 const release=e=>{if(!arcadeUIPointers.has(e.pointerId))return;e.preventDefault();arcadeUIPointers.delete(e.pointerId);arcadeDialog.querySelectorAll('[data-arcade-control]').forEach(b=>b.classList.remove('is-held'));arcadeInput('sync',arcadeHeld());};for(const t of ['pointerup','pointercancel','lostpointercapture'])arcadeDialog.addEventListener(t,release);
 arcadeDialog.addEventListener('click',e=>{const b=e.target.closest('[data-arcade-control="action"]');if(b&&!b.disabled&&e.detail===0&&arcadeState?.world?.game!=='sneak')arcadeInput(arcadeGames[arcadeState?.world?.game]?.input||'hit',true);});
}
function arcadeChoose(game,mode){arcadeClearKeys();if(netIsActive()){arcadeSend({t:'arcadeInvite',game,mode});}else arcadeDemoStart(game,mode);}
function arcadeEntry(){arcadeEnsureUI();if(arcadeState){arcadeOpen();return;}arcadeRender();if(!arcadeDialog.open)arcadeDialog.showModal();}
function arcadeOpen(){arcadeEnsureUI();if(typeof arcadeSetFolded==='function')arcadeSetFolded(false);arcadeBoardKey='';arcadeRender();if(!arcadeDialog.open)arcadeDialog.showModal();arcadeDialog.scrollTop=0;if(!arcadeUIFrame)arcadeUIFrame=requestAnimationFrame(arcadeUIAnimate);}
function arcadeRequestRender(){if(arcadeDialog?.open){if(!arcadeUIFrame)arcadeUIFrame=requestAnimationFrame(arcadeUIAnimate);return;}if(typeof arcadeState!=='undefined'&&arcadeState){if(arcadeState.purpose==='lunch'&&typeof menuTournamentRenderBackground==='function')menuTournamentRenderBackground();return;}arcadeRender();}
function arcadeUIAnimate(now){arcadeUIFrame=0;if(!arcadeDialog?.open)return;if(now-arcadeLastDraw>30){arcadeLastDraw=now;arcadeRender();}arcadeUIFrame=requestAnimationFrame(arcadeUIAnimate);}
function arcadeSetText(id,text){arcadeNodeText($(id),text);}
function arcadeRender(){
 if(!arcadeDialog)return;const s=typeof arcadeState==='undefined'?null:arcadeState;const online=netIsActive();
 $('arcadeMenu').hidden=!!s;$('arcadeSession').hidden=!s;arcadeDialog.dataset.purpose=s?.purpose||'arcade';arcadeDialog.dataset.playing=String(!!s?.world);arcadeSetText('arcadeCloseBtn',s?.purpose==='lunch'?'경기 접기':'닫기');$('arcadeCloseBtn').setAttribute('aria-label',s?.purpose==='lunch'?'메뉴 점수전 접기':'오락실 닫기');
 if(!s){const count=online?netMembers().length:0,key=online+':'+count;if(arcadeUIMenuKey===key)return;arcadeUIMenuKey=key;arcadeSetText('arcadeTitle','조교 오락실');arcadeSetText('arcadeEyebrow','NEW · 서른 가지 승부');arcadeSetText('arcadeMenuNote',online?'같은 방 친구들을 초대해요. 참가자가 2명 이상 필요해요.':'친구들과 하려면 방에 입장! 여기서는 컴퓨터와 연습할 수 있어요.');for(const card of $('arcadeGameCards').children){arcadeNodeText(card.querySelector('em'),online?'이 게임으로 초대 →':'혼자 연습 →');card.disabled=online&&count<2;}$('arcadeTournamentBtn').disabled=online&&count<2;return;}
 arcadeUIMenuKey='';
 if(s.purpose==='lunch')menuTournamentRenderBackground();
 const w=s.world,g=arcadeGames[w?.game||s.chosen]||arcadeGames.coins,self=arcadeSelf(),own=s.members.find(m=>m.id===self);
 arcadeSetText('arcadeTitle',s.phase==='invite'?(s.mode==='tournament'?'랜덤 4판 + 피날레 대난투':g.name):s.phase==='done'&&s.mode==='tournament'?'5판 최종 점수!':g.name);
 arcadeSetText('arcadeEyebrow',s.purpose==='lunch'?'LUNCH SCORE PARTY · 끝까지 함께':arcadeDemo?(s.mode==='tournament'?'SOLO SCORE PARTY · 컴퓨터와 5판':'SOLO PRACTICE · 컴퓨터와 한 판'):s.mode==='tournament'?'SCORE PARTY · 전원 누적 점수전':'PARTY GAME · 같은 방 친구들과');
 const points=s.format==='points',poolNote=s.mode==='tournament'&&w?' · '+(w.players.length===2?'2인전 '+arcadeGamePool(2).length+'종':'파티전 '+arcadeGamePool(w.players.length).length+'종'):'';
 arcadeSetText('arcadeRoundTag',s.phase==='invite'?'참가자 모집':points?s.phase==='done'?'최종 순위 · '+s.pointRounds+'판 완료':'ROUND '+Math.min(s.pointRoundLimit,(s.pointRounds||0)+1)+' / '+s.pointRoundLimit:s.mode==='tournament'?'ROUND '+s.round+(s.tiebreakIds?.length?' · 동점 재경기':''):'단판 승부');
 arcadeSetText('arcadeRemaining',(s.phase==='invite'?s.members.filter(m=>m.response==='join').length+'명 준비':points?'전원 참여 · 누적 점수전':s.mode==='tournament'?(s.activeIds?.length||0)+(s.purpose==='lunch'?'개 메뉴 생존':'명 생존'):'각자 점수로 승부')+poolNote);
 arcadeSetText('arcadeHelp',s.phase==='invite'&&s.mode==='tournament'?'랜덤 4판 뒤 전원 대난투! 다섯 경기 모두 같은 순위 점수를 더해 최종 순위를 정해요. 같은 점수는 공동 순위예요.':g.hint);
 $('arcadeInvite').hidden=s.phase!=='invite';$('arcadePlay').hidden=!w;
 arcadeRenderRoster(s,w,self,points);
 if(s.phase==='invite'){arcadeSetText('arcadeInviteTitle',s.mode==='tournament'?'다 같이 끝까지 달릴 사람?':'한 판 할 사람?');arcadeSetText('arcadeInviteText',s.mode==='tournament'?'랜덤 4판 + 마지막 30초 대난투! 전원 다섯 판, 같은 배점으로 누적해요. 참가 또는 관전을 골라주세요.':g.hint);const waiting=s.members.filter(m=>m.response==='pending').length,joined=s.members.filter(m=>m.response==='join').length;arcadeSetText('arcadeInviteHint',waiting?'아직 '+waiting+'명 선택 중':joined<2?'참가자가 2명 이상 필요해요.':'곧 시작!');$('arcadeJoinBtn').disabled=own?.response==='join';$('arcadePassBtn').disabled=own?.response==='pass';}
 $('arcadeCancelBtn').hidden=!arcadeHost();arcadeSetText('arcadeCancelBtn',s.purpose==='lunch'?'메뉴 선택으로 돌아가기':'오락실 종료');$('arcadeReplayBtn').hidden=s.phase!=='done'||!arcadeHost()||s.purpose==='lunch';$('arcadeMenuBtn').hidden=s.phase!=='done'||!arcadeHost()||s.purpose==='lunch';
 arcadeSetText('arcadeBottomNote',points?(s.phase==='done'?'5판 완료! 최종 누적 점수 순위':'랜덤 4판 + 마지막 대난투 · 다섯 판 모두 같은 배점')+' · 내 누적 '+(s.totalPoints?.[self]||0)+'점':arcadeDemo?'보통 난이도 · 나 + 컴퓨터 3명':'방 친구들과 한 판 · 점심 메뉴는 그대로');
 arcadeRenderHistory(s,points);
 if(w)arcadeDrawWorld(s,w,g,self);
}
function arcadeBuildBoard(w){
 arcadeBoardKey=w.id+':'+w.game;arcadeUIActors.clear();arcadeUIMeters.clear();arcadeUIObjects.clear();arcadeObjectFrame=0;for(const id of ['arcadeScenery','arcadeObjects','arcadeActors','arcadeMeters'])$(id).replaceChildren();$('arcadeBoard').dataset.game=w.game;$('arcadeBoard').dataset.crowded=String(w.players.length>4);
 if(w.game==='sneak'){const line=el('div','five-finish','퇴근 성공');$('arcadeScenery').append(line);for(const p of w.players){const lane=el('i','five-sneak-lane');lane.style.left=p.x/7+'%';$('arcadeScenery').append(lane);}}
 if(w.game==='runner'){for(const p of w.players){const lane=el('div','five-run-lane');lane.style.top=(p.index+.5)/w.players.length*100+'%';lane.style.height=100/w.players.length+'%';lane.append(el('span','',arcadeDisplayName(p)));$('arcadeScenery').append(lane);}}
 if(w.game==='stamp'){for(const p of [...w.players].sort((a,b)=>Number(b.id===arcadeSelf())-Number(a.id===arcadeSelf()))){const row=el('div','five-meter-row');row.style.setProperty('--p-color',trayPalette[p.index%8]);const head=el('div','five-meter-head'),score=el('strong','five-meter-score');head.append(el('b','',arcadeDisplayName(p)+(p.id===arcadeSelf()?' · 내 메뉴':'')),score);const meter=el('div','five-meter'),target=el('i','five-meter-target'),pointer=el('i','five-meter-pointer'),mark=el('i','five-meter-mark');meter.append(target,pointer,mark);const reaction=el('small','five-meter-reaction');row.append(head,meter,reaction);row.arcadeMeterRefs={target,pointer,mark,score,reaction};$('arcadeMeters').append(row);arcadeUIMeters.set(p.id,row);}return;}
 for(const p of w.players){const actor=el('div','five-actor');actor.dataset.id=p.id;actor.style.setProperty('--p-color',trayPalette[p.index%8]);actor.innerHTML=deptAvatarSvg(p.department||'business');const tag=el('small','five-actor-tag',p.id===arcadeSelf()?(arcadeState?.purpose==='lunch'?'▼ 내 메뉴':'▼ 나'):'');actor.append(el('b','five-actor-name',arcadeDisplayName(p)),tag);actor.arcadeTag=tag;$('arcadeActors').append(actor);arcadeUIActors.set(p.id,actor);}
}
function arcadeDrawWorld(s,w,g,self){
 if(arcadeBoardKey!==w.id+':'+w.game)arcadeBuildBoard(w);const t=w.elapsed,can=w.phase==='play'&&s.phase==='round',own=w.players.find(p=>p.id===self),alive=own&&!own.eliminated&&!own.forfeited,objects=$('arcadeObjects');
 const seconds=Math.ceil(typeof arcadeClockSeconds==='function'?arcadeClockSeconds(w):w.phase==='countdown'?w.countdown:Math.max(0,w.duration-t));arcadeSetText('arcadeClock',w.phase==='done'?'종료':w.phase==='countdown'?'준비!':seconds+'초');
 $('arcadeSignal').hidden=w.game!=='sneak';if(w.game==='sneak'){$('arcadeSignal').dataset.signal=w.meta.signal;arcadeSetText('arcadeSignal',w.meta.signal==='green'?'🟢 달려!':'🔴 멈춰!');}
 arcadeObjectFrame++;
 if(w.game==='coins'){for(const o of w.objects){const coin=arcadeObjectNode('coin:'+o.id,'span',t<o.readyAt?'five-coin five-preview':'five-coin',t<o.readyAt?'+':'●');arcadePosition(coin,o.x/7,o.y/4.6);}}
 if(w.game==='dodge'){for(const o of w.objects){const warning=arcadeObjectNode('food:'+o.id,'i','five-food-zone',t>=o.impactAt?o.emoji:'!');arcadePosition(warning,o.x/7,o.y/4.6);arcadeStyle(warning,'width',arcadePercent(o.radius*2/7));arcadeStyle(warning,'height',arcadePercent(o.radius*2/4.6));const hit=String(t>=o.impactAt);if(warning.dataset.hit!==hit)warning.dataset.hit=hit;}}
 if(w.game==='runner'){for(const p of w.players)for(const o of w.objects){const n=arcadeObjectNode('hurdle:'+p.id+':'+o.id,'span','five-hurdle',o.emoji||'📚');arcadePosition(n,o.x/7,(p.index+.5)/w.players.length*100);arcadeStyle(n,'width',arcadePercent(Math.max(24,o.width)/7));arcadeStyle(n,'height',Math.min(54,72/w.players.length)+'px');}}
 if(w.game==='stamp'){for(const p of w.players){const row=arcadeUIMeters.get(p.id),refs=row.arcadeMeterRefs,{target,pointer,mark}=refs;arcadeStyle(target,'left',arcadePercent((w.meta.target-w.meta.window/2)*100));arcadeStyle(target,'width',arcadePercent(w.meta.window*100));arcadeStyle(pointer,'left',arcadePercent((p.pointer??w.meta.pointer)*100));arcadeNodeText(refs.score,Math.round(p.score)+'점');mark.hidden=p.lastStampStage!==w.meta.stage;arcadeStyle(mark,'left',arcadePercent((p.stampPos||0)*100));const fresh=t-p.stampAt<1.1,outcome=fresh?p.stampResult:'';if(row.dataset.result!==outcome)row.dataset.result=outcome;arcadeNodeText(refs.reaction,p.lastStampStage===w.meta.stage?(p.stampResult==='perfect'?'완벽한 결재! +'+p.stampPoints:p.stampResult==='hit'?'통과! +'+p.stampPoints:'반려! '+p.stampPoints):'초록 칸에서 한 번만 찍어!');row.classList.toggle('is-own',p.id===self);}}
 else for(const p of w.players){const actor=arcadeUIActors.get(p.id);arcadePosition(actor,p.x/7,w.game==='runner'?(p.index+.5)/w.players.length*100-(p.jumpHeight||0)/4.6*Math.min(.4,2/w.players.length):p.y/4.6);actor.classList.toggle('is-own',p.id===self);actor.classList.toggle('is-out',p.eliminated||p.forfeited);actor.classList.toggle('is-action',t<(p.dashUntil||0));actor.classList.toggle('is-hurt',t<(p.caughtUntil||0)||t<(p.stunUntil||0));arcadeNodeText(actor.arcadeTag,(p.id===self?(s.purpose==='lunch'?'▼ 내 메뉴 ':'▼ 나 '):'')+(['dodge','runner'].includes(w.game)?'♥'.repeat(Math.max(0,p.health)):w.game==='coins'?Math.round(p.score)+'원':p.finishAt>=0?'도착!':''));}
 $('arcadeOverlay').hidden=can;
 if(w.phase==='countdown'){arcadeSetText('arcadeOverlayTitle',Math.max(1,seconds));arcadeSetText('arcadeOverlayHint',g.name+' · '+(s.format==='points'?'모두 함께 준비!':s.tiebreakIds?.length?'최하위 동점 재경기':'준비!'));}
 else if(s.phase==='between'){arcadeSetText('arcadeOverlayTitle',s.notice||'다음 라운드!');arcadeSetText('arcadeOverlayHint',Math.max(0,Math.ceil((s.nextAt-(typeof arcadeTimelineNow==='function'?arcadeTimelineNow():Date.now()))/1000))+(s.format==='points'&&s.pointRounds===4?'초 뒤 피날레 대난투! 배점은 같아요.':'초 뒤 다른 게임이 랜덤으로 나와요'));}
 else if(s.phase==='done'){const ids=s.championIds?.length?s.championIds:w.winnerIds,points=s.format==='points',names=ids?.map(id=>s.members.find(m=>m.id===id)?.name||'참가자').join(' · '),shared=ids?.length>1;arcadeSetText('arcadeOverlayTitle',points?(shared?'공동 1위 '+ids.length+'명!':names?names+' 1위!':'점수전 완료!'):names?names+' 우승!':'한 판 끝!');arcadeSetText('arcadeOverlayHint',points?'5판 누적 '+(s.totalPoints?.[ids?.[0]]||0)+'점 · 최종 순위는 참가자 점수표에서 확인해요.'+(shared&&s.purpose==='lunch'?' 점심 대표 메뉴만 공동 1위 중 추첨해요.':''):'다른 게임도 도전해봐!');}
 const cool=own?Math.max(0,(own.dashReadyAt||0)-t):0,stamped=w.game==='stamp'&&own?.lastStampStage===w.meta.stage;
 $('arcadeDpad').hidden=!['sneak','dodge','coins'].includes(w.game);arcadeSetText('arcadeActionLabel',g.action);arcadeSetText('arcadeActionHint',stamped?'다음 결재 대기':cool>.05?cool.toFixed(1)+'초 뒤 다시':g.key);
 arcadeDialog.querySelectorAll('[data-arcade-control]').forEach(b=>{b.disabled=!can||!alive||(b.dataset.arcadeControl==='action'&&(stamped||cool>.05));});
 const ownStatus=!own?'이번 판 관전 중':own.forfeited?'기권 · 관전 중':own.eliminated?(s.format==='points'?'이번 판 탈락 · 다음 게임에 다시 참여':'탈락 · 관전 중'):Math.round(own.score)+'점'+(['dodge','runner'].includes(w.game)?' · '+'♥'.repeat(Math.max(0,own.health)):'');arcadeSetText('arcadeOwnStatus',ownStatus);
 arcadeSetText('arcadeStatus',s.phase==='between'||s.phase==='done'?s.notice||'한 판 끝!':w.game==='stamp'?'결재 '+(w.meta.stage+1)+'/10 · 이번 기회에 딱 한 번!':w.game==='sneak'?(w.meta.signal==='green'?'교수님 딴 데 본다. 지금 튀어!':'교수님 돌아봤다. 손 떼!'):w.meta.notice||g.hint);
 if(!['brawl','kart','basket','rhythm'].includes(w.game))arcadeObjectCleanup();
}
function arcadeUpdateButtons(){
 const active=netIsActive()&&netPhase==='result'&&!result?.tournamentHistory;for(const id of ['arcadeRoomBtn','arcadeResultBtn']){const b=$(id);if(b){if(b.hidden===active)b.hidden=!active;if(b.disabled)b.disabled=false;}}
}
function arcadeInstall(){
 const home=el('button','btn five-home-button','미니게임 30종 연습 ↗');home.id='fiveArcadeTryBtn';home.type='button';home.addEventListener('click',arcadeEntry);const tray=document.querySelector('.arcade-try-tray');tray?.insertBefore(home,tray.querySelector('small'));
 const room=el('button','tiny-btn five-room-button','번외 게임 30종');room.id='arcadeRoomBtn';room.type='button';room.addEventListener('click',arcadeEntry);document.querySelector('.room-banner-actions')?.prepend(room);
 const resultButton=el('button','btn five-result-button','🎲 미니게임 30종 · 번외 경기');resultButton.id='arcadeResultBtn';resultButton.type='button';resultButton.addEventListener('click',arcadeEntry);$('resultView').querySelector('.result-actions')?.append(resultButton);
 document.addEventListener('keydown',e=>{if(!arcadeDialog?.open||!arcadeState?.world||typeof arcadeIsPaused==='function'&&arcadeIsPaused()||['doors','rhythm'].includes(arcadeState.world.game)||arcadeGames[arcadeState.world.game]?.controls==='choices'||e.target?.matches?.('input,textarea,select,[contenteditable="true"]')||e.target?.closest?.('button:not([data-arcade-control]),[data-device-ui-control]'))return;const move=arcadeMoveKeys[e.code],action=['Space','KeyF'].includes(e.code),game=arcadeState.world.game;if(!move&&!action)return;e.preventDefault();e.stopImmediatePropagation();if(e.repeat)return;if(action&&game!=='sneak')arcadeInput(arcadeGames[game].input,true);else{arcadeUIKeys.add(e.code);arcadeInput('sync',arcadeHeld());}},true);
 document.addEventListener('keyup',e=>{const had=arcadeUIKeys.delete(e.code);if(!arcadeDialog?.open||!had)return;e.preventDefault();e.stopImmediatePropagation();arcadeInput('sync',arcadeHeld());},true);
 document.addEventListener('focusin',e=>{if(e.target?.matches?.('input,textarea,select,[contenteditable="true"]')||e.target?.closest?.('button:not([data-arcade-control]),[data-device-ui-control]'))arcadeClearKeys();});window.addEventListener('blur',arcadeClearKeys);window.addEventListener('resize',arcadeClearKeys);window.addEventListener('orientationchange',arcadeClearKeys);document.addEventListener('visibilitychange',()=>{if(document.hidden)arcadeClearKeys();});
 setInterval(()=>{arcadeUpdateButtons();if(arcadeDialog?.open&&!arcadeState)arcadeRender();},200);arcadeUpdateButtons();
}
/* END_FIVE_ARCADE_UI_V1 */


/* TEN_GAME_VARIETY_UI */
Object.assign(arcadeGames,{
 brawl:{name:'식판 격투장',icon:'🥊',tag:'격투 · 주먹 한 방',hint:'방향키로 붙어서 Space로 펀치! 바라보는 방향으로 때려요. 마지막 생존자가 승리.',action:'펀치!',key:'SPACE / F',input:'hit',color:'#eaa38d'},
 kart:{name:'커피컵 카트 경주',icon:'🏎️',tag:'경주 · 컵 잡고 코너링',hint:'↑로 가속, ←/→로 코스 변경! 물웅덩이를 피하고 Space 터보로 3바퀴 먼저!',action:'터보!',key:'SPACE / F',input:'dash',color:'#9fced5'},
 basket:{name:'반찬 농구',icon:'🏀',tag:'스포츠 · 포물선 슛',hint:'←/→로 슛 각도를 맞추고 Space로 던져! 움직이는 골대에 넣으면 2점, 정중앙은 3점.',action:'슛!',key:'SPACE / F',input:'hit',color:'#eac673'},
 doors:{name:'빈 식당 눈치전',icon:'🚪',tag:'눈치 · 몰리면 손해',hint:'세 식당 중 하나를 몰래 골라! 적게 몰린 식당일수록 높은 점수. 선택은 공개 전까지 비밀.',action:'선택!',key:'A / W / D',input:'hit',color:'#c5a7d7'},
 rhythm:{name:'복사기 리듬전',icon:'🎵',tag:'리듬 액션 · 칼퇴 박자',hint:'음표가 아래 선에 오면 A / W / D! 왼쪽·가운데·오른쪽 박자를 맞춰 콤보를 쌓아.',action:'박자!',key:'A / W / D',input:'hit',color:'#abc985'}
});
function arcadeKartCircuitSvg(){
 const road=arcadeKartTrackPath(),start=arcadeKartTrackPoint(-Math.PI/2),heading=Math.atan2(start.ty,start.tx)*180/Math.PI;
 const arrows=Array.from({length:7},(_,i)=>{const p=arcadeKartTrackPoint((i+.7)/7*Math.PI*2-Math.PI/2);return'<path class="kart-track-arrow" d="M-7 -6 0 0-7 6" transform="translate('+p.x.toFixed(2)+' '+p.y.toFixed(2)+') rotate('+(Math.atan2(p.ty,p.tx)*180/Math.PI).toFixed(2)+')"/>';}).join('');
 return '<svg viewBox="0 0 700 460" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><pattern id="kartFinishChecks" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#fff5da"/><path d="M0 0h6v6H0zM6 6h6v6H6z" fill="#293f3d"/></pattern></defs><path class="kart-track-shadow" d="'+road+'"/><path class="kart-track-guard" d="'+road+'"/><path class="kart-track-curb" d="'+road+'"/><path class="kart-track-curb-stripe" d="'+road+'"/><path class="kart-track-road" d="'+road+'"/><path class="kart-track-lane" d="'+arcadeKartTrackPath(-.5)+'"/><path class="kart-track-lane" d="'+arcadeKartTrackPath(.5)+'"/>'+arrows+'<g transform="translate('+start.x.toFixed(2)+' '+start.y.toFixed(2)+') rotate('+heading.toFixed(2)+')"><rect class="kart-finish-line" x="-7" y="-41" width="14" height="82" fill="url(#kartFinishChecks)"/><path class="kart-start-direction" d="M24 -7 36 0 24 7"/></g><text class="kart-start-label" x="'+start.x.toFixed(2)+'" y="'+(start.y-57).toFixed(2)+'" text-anchor="middle">START / FINISH</text><text class="kart-infield-cup" x="350" y="174" text-anchor="middle">☕</text><text class="kart-infield-label" x="350" y="197" text-anchor="middle">COFFEE CUP CIRCUIT</text><text class="kart-chicane-label" x="360" y="330" text-anchor="middle">SLOW CORNER</text></svg>';
}
let arcadeTenChoices=null;
const arcadeTenBuildBase=arcadeBuildBoard;
arcadeBuildBoard=function(w){
 arcadeTenBuildBase(w);const scene=$('arcadeScenery');
 if(w.game==='kart'){const circuit=el('div','kart-circuit');circuit.innerHTML=arcadeKartCircuitSvg();scene.append(circuit);}
 if(w.game==='basket'){scene.append(el('div','ten-basket-floor'));const hoop=el('div','ten-hoop');hoop.id='tenHoop';hoop.append(el('i'));scene.append(hoop);}
 if(w.game==='doors'){const room=el('div','ten-restaurants');for(let i=0;i<3;i++){const card=el('div','ten-restaurant');card.dataset.choice=i;card.append(el('span','','🚪'),el('b','',w.meta.labels[i]),el('strong','','?명'),el('small','','예약 '+(w.meta.reservedCounts?.[i]||0)+'명'));room.append(card);}scene.append(room);}
 if(w.game==='rhythm'){scene.append(el('div','ten-beat-lane lane-0'),el('div','ten-beat-lane lane-1'),el('div','ten-beat-lane lane-2'),el('div','ten-hit-line'));const judge=el('div','ten-rhythm-judge');judge.id='tenRhythmJudge';scene.append(judge);}
};
function arcadeTenEnsureControls(){
 if(arcadeTenChoices||!arcadeDialog)return;arcadeTenChoices=el('div','ten-choice-controls');arcadeTenChoices.hidden=true;
 for(let i=0;i<3;i++){const b=el('button','',i===0?'왼쪽':i===1?'가운데':'오른쪽');b.type='button';b.dataset.tenChoice=i;b.setAttribute('aria-label','오락실 선택 '+(i+1));b.append(el('kbd','',['A / ←','W / ↑','D / →'][i]));b.addEventListener('pointerdown',e=>{if(b.disabled)return;e.preventDefault();e.stopPropagation();arcadeInput(['jump','hit','dash'][i],true);});b.addEventListener('click',e=>{if(e.detail===0&&!b.disabled)arcadeInput(['jump','hit','dash'][i],true);});arcadeTenChoices.append(b);}
 $('arcadeControls').prepend(arcadeTenChoices);
}
const arcadeTenDrawBase=arcadeDrawWorld;
arcadeDrawWorld=function(s,w,g,self){
 arcadeTenDrawBase(s,w,g,self);arcadeDialog.dataset.game=w.game;arcadeTenEnsureControls();const t=w.elapsed,own=w.players.find(p=>p.id===self),play=s.phase==='round'&&w.phase==='play'&&own&&!own.eliminated&&!own.forfeited,objects=$('arcadeObjects');
 const choose=['doors','rhythm'].includes(w.game);arcadeTenChoices.hidden=!choose;arcadeDialog.querySelector('[data-arcade-control="action"]').hidden=choose;
 if(['brawl','kart','basket'].includes(w.game))$('arcadeDpad').hidden=false;
 const center=$('arcadeDpad').querySelector('i');center.textContent=w.game==='basket'?'각도':w.game==='kart'?'조향':'이동';
 for(const [i,b]of [...arcadeTenChoices.children].entries()){b.disabled=!play||(w.game==='doors'&&(w.meta.phase!=='choose'||own.locked));b.firstChild.textContent=w.game==='doors'?(w.meta.labels[i]||['왼쪽','가운데','오른쪽'][i]):['←','●','→'][i];}
 if(w.game==='brawl'){for(const p of w.players){const a=arcadeUIActors.get(p.id);a.querySelector('.five-actor-tag').textContent=(p.id===self?'▼ 내 메뉴 ':'')+Math.ceil(p.hp)+' HP';a.classList.toggle('is-punching',t<p.attackUntil);if(t<p.attackUntil){const punch=arcadeObjectNode('punch:'+p.id,'span','ten-punch','💥');punch.style.left=(p.x+p.faceX*55)/7+'%';punch.style.top=(p.y+p.faceY*55)/4.6+'%';}}}
 if(w.game==='kart'){for(const o of w.objects){if(!['puddle','boost'].includes(o.kind))continue;const n=arcadeObjectNode('kart:'+o.id,'span','ten-kart-object '+o.kind,o.kind==='puddle'?'💧':'⚡');n.style.left=o.x/7+'%';n.style.top=o.y/4.6+'%';n.classList.toggle('is-preview',t<o.readyAt);}for(const p of w.players){const a=arcadeUIActors.get(p.id),point=arcadeKartTrackPoint(p.angle+(p.visualOffset||0),p.lane);a.classList.add('is-kart');a.style.setProperty('--kart-heading',(Math.atan2(point.ty,point.tx)*180/Math.PI).toFixed(1)+'deg');a.querySelector('.five-actor-tag').textContent=(p.id===self?'▼ ':'')+(p.finishAt>=0?'완주!':Math.min(3,Math.floor(p.progress)+1)+'/3바퀴');}}
 if(w.game==='basket'){const h=$('tenHoop');h.style.left=w.meta.hoopX/7+'%';h.style.top=w.meta.hoopY/4.6+'%';h.style.width=w.meta.hoopRadius*2/7+'%';for(const p of w.players){const aim=arcadeObjectNode('aim:'+p.id,'i','ten-basket-aim');aim.style.left=p.x/7+'%';aim.style.top=p.y/4.6+'%';aim.style.transform='rotate('+(-p.aim)+'deg)';}for(const o of w.objects){const ball=arcadeObjectNode('ball:'+o.id,'span','ten-basket-ball','🏀');ball.style.left=o.x/7+'%';ball.style.top=o.y/4.6+'%';}arcadeSetText('arcadeStatus',own?'슛 각도 '+Math.round(own.aim)+'° · '+own.makes+'골 / '+own.attempts+'슛':g.hint);}
 if(w.game==='doors'){const reveal=w.meta.phase==='reveal';for(const card of $('arcadeScenery').querySelectorAll('.ten-restaurant')){const i=Number(card.dataset.choice);card.querySelector('strong').textContent=reveal?w.meta.counts[i]+'명':'?명';card.querySelector('small').textContent=reveal?'총 '+(w.meta.totalCounts?.[i]??w.meta.counts[i])+'명':'예약 '+(w.meta.reservedCounts?.[i]||0)+'명 · 선택 비밀';card.classList.toggle('is-own',reveal&&own?.choice===i);}arcadeSetText('arcadeStatus','눈치 '+(w.meta.stage+1)+'/6 · '+(reveal?'공개! 다음 선택을 준비해':own?.locked?'선택 완료! 다른 사람을 기다려':'어느 식당이 덜 붐빌까?')+' · '+w.meta.stageLeft.toFixed(1)+'초');arcadeSetText('arcadeOwnStatus',own?Math.round(own.score)+'점'+(own.locked?' · 선택 완료':''):'관전 중');}
 if(w.game==='rhythm'){const resolved=new Set(own?.resolvedNotes||[]);for(const o of w.objects){const until=o.hitAt-t;if(resolved.has(o.id)||until>w.meta.travelTime||until<-.25)continue;const n=arcadeObjectNode('note:'+o.id,'span','ten-rhythm-note lane-'+o.lane,['◀','●','▶'][o.lane]);n.style.left=[20,50,80][o.lane]+'%';n.style.top=(8+(1-until/w.meta.travelTime)*72)+'%';}arcadeSetText('tenRhythmJudge',own?(t<own.judgeUntil?own.judge:own.combo+' COMBO'):'박자에 맞춰!');arcadeSetText('arcadeOwnStatus',own?Math.round(own.score)+'점 · '+own.combo+' COMBO':'관전 중');}
 if(['brawl','kart','basket'].includes(w.game)){const ready=own?(w.game==='brawl'?own.hitReadyAt:w.game==='basket'?own.shotReadyAt:own.dashReadyAt)||0:0,cool=Math.max(0,ready-t),b=arcadeDialog.querySelector('[data-arcade-control="action"]');b.disabled=!play||cool>.05;arcadeSetText('arcadeActionHint',cool>.05?cool.toFixed(1)+'초 뒤 다시':g.key);}
 arcadeObjectCleanup();
};
function arcadeTenInstall(){document.addEventListener('keydown',e=>{const w=arcadeState?.world;if(!arcadeDialog?.open||!['doors','rhythm'].includes(w?.game)||e.target?.matches?.('input,textarea,select,[contenteditable="true"]')||e.target?.closest?.('button:not([data-arcade-control]),[data-device-ui-control]'))return;const i=['KeyA','ArrowLeft'].includes(e.code)?0:['KeyW','ArrowUp','Space','KeyF'].includes(e.code)?1:['KeyD','ArrowRight'].includes(e.code)?2:-1;if(i<0)return;e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)arcadeInput(['jump','hit','dash'][i],true);},true);}
/* END_TEN_GAME_VARIETY_UI */

/* ARCADE_TRAY_UI_V1 */
Object.assign(arcadeGames,{tray:{name:'식판 서바이벌',icon:'🍽️',tag:'서바이벌 · 무너지는 바닥',hint:'방향키로 이동, Space로 밀치기! 빨간 바닥은 곧 사라져. 떨어지면 탈락, 끝까지 식판을 지켜!',action:'밀쳐!',key:'SPACE / F',input:'dash',color:'#b4c4bd'}});
const arcadeTrayTiles=new Map();
const arcadeTrayBuildBase=arcadeBuildBoard;
arcadeBuildBoard=function(w){
 arcadeTrayBuildBase(w);arcadeTrayTiles.clear();if(w.game!=='tray')return;
 const scene=$('arcadeScenery'),rim=el('div','tray-arcade-rim'),caption=el('b','tray-arcade-caption','오늘의 식판은 한 명만 남는다');scene.append(rim,caption);
 for(const o of w.objects){if(o.kind!=='tray-tile')continue;const tile=el('div','tray-arcade-tile');tile.style.left=o.x/7+'%';tile.style.top=o.y/4.6+'%';tile.style.width='calc('+o.width/7+'% - 3px)';tile.style.height='calc('+o.height/4.6+'% - 3px)';tile.dataset.ring=String(o.ring);scene.append(tile);arcadeTrayTiles.set(o.id,tile);}
 const gust=el('div','tray-arcade-gust','후우우웅 →');gust.id='arcadeTrayGust';gust.hidden=true;scene.append(gust);
};
const arcadeTrayDrawBase=arcadeDrawWorld;
arcadeDrawWorld=function(s,w,g,self){
 arcadeTrayDrawBase(s,w,g,self);if(w.game!=='tray')return;
 const t=w.elapsed,own=w.players.find(p=>p.id===self),live=s.phase==='round'&&w.phase==='play',can=live&&own&&!own.eliminated&&!own.forfeited;
 for(const o of w.objects){const tile=arcadeTrayTiles.get(o.id);if(!tile)continue;tile.classList.toggle('is-warning',t>=o.warningAt&&t<o.goneAt);tile.classList.toggle('is-gone',t>=o.goneAt);}
 $('arcadeDpad').hidden=false;arcadeDialog.querySelector('[data-arcade-control="action"]').hidden=false;
 const gust=$('arcadeTrayGust');if(gust){gust.hidden=t>=w.meta.gustUntil;gust.style.rotate=Math.atan2(w.meta.gustY,w.meta.gustX)+'rad';}
 for(const p of w.players){const actor=arcadeUIActors.get(p.id);if(!actor)continue;actor.classList.toggle('is-tray-fall',p.eliminated||p.forfeited);actor.querySelector('.five-actor-tag').textContent=(p.id===self?'▼ 내 식판 ':'')+(p.forfeited?'기권':p.eliminated?'추락!':p.shoves+'번 밀침');}
 const remaining=w.players.filter(p=>!p.eliminated&&!p.forfeited).length,cool=own?Math.max(0,own.dashReadyAt-t):0;
 arcadeSetText('arcadeStatus',s.phase==='between'||s.phase==='done'?s.notice:remaining+'명 생존 · '+(w.meta.notice||g.hint));
 arcadeSetText('arcadeOwnStatus',!own?'관전 중':own.eliminated||own.forfeited?'추락 · 남은 친구 관전 중':own.shoves+'번 밀침 · 내 식판 사수 중');
 arcadeSetText('arcadeActionHint',cool>.05?cool.toFixed(1)+'초 뒤 다시':g.key);
 const action=arcadeDialog.querySelector('[data-arcade-control="action"]');action.disabled=!can||cool>.05;
};
/* END_ARCADE_TRAY_UI_V1 */

/* ARCADE_SPORTS_UI_V1 */
Object.assign(arcadeGames,{
 pong:{name:'식판 탁구',icon:'🏓',tag:'스포츠 · 함께 치는 팀전',hint:'같은 탁구대에서 1대1·2대2 팀전! ↑/↓로 내 패들, Space 스매시. 인원이 적은 팀은 패들과 이동 속도 보정.',action:'스매시!',key:'↑ / ↓ · SPACE',input:'hit',color:'#81c6bf',duel:true,controls:'standard'},
 curling:{name:'얼음컵 컬링',icon:'🥌',tag:'빙판 · 조준과 쓸기',hint:'3개 돌을 과녁 중심으로! ←/→ 조준, Space 두 번 발사. 굴러갈 때 Space로 쓸면 더 멀리 가요.',action:'파워 / 발사',key:'← / → · SPACE 두 번',input:'hit',color:'#abd5df',duel:true,controls:'standard'},
 bowling:{name:'생수병 볼링',icon:'🎳',tag:'볼링 · 핀 배치와 커브',hint:'매 프레임 핀 배치가 달라요! ←/→ 조준, Space 두 번 투구. 굴러갈 때 ←/→ 커브. 강한 공은 빠르고, 약한 공은 보정 시간이 길어요.',action:'파워 / 투구',key:'← / → · SPACE 두 번',input:'hit',color:'#dfb37e',duel:true,controls:'standard'},
 volley:{name:'풍선 배구',icon:'🎈',tag:'유지 액션 · 정확한 리시브',hint:'내려오는 풍선 아래에서 Space! 일반 리시브 +7, 낮은 위치 정중앙 +10. 떨어져도 다시 시작해요.',action:'받아쳐!',key:'← / → · SPACE',input:'hit',color:'#e9a8b6',duel:true,controls:'standard'},
 golf:{name:'식당 미니골프',icon:'⛳',tag:'미니골프 · 벽 반사',hint:'목표: 적은 타수로 3홀! ←/→ 방향, Space 두 번으로 파워 퍼팅. 장애물과 벽의 반사각을 이용해요.',action:'파워 / 퍼팅',key:'← / → · SPACE 두 번',input:'hit',color:'#a6c980',duel:true,controls:'standard'},
 parking:{name:'도시락 주차왕',icon:'🚗',tag:'운전 · 32초 주차 대수 경쟁',hint:'32초 동안 더 많이 주차! P칸에 도착하면 바로 다음 칸. 갈수록 칸이 좁아지고 장애물이 늘어요. ↑/↓ 전후진 · ←/→ 조향 · Space 브레이크',action:'브레이크!',key:'방향키 · SPACE',input:'hit',color:'#a9b5cf',duel:true,controls:'standard'}
});
const arcadeSportsKeys=new Set(['pong','curling','bowling','volley','golf','parking']);
let arcadeSportsBoard='';const arcadeSportsPanels=new Map();
function arcadeSportsPanel(w,p,self){
 const panel=el('section','sport-court'+(p.id===self?' is-own':''));panel.dataset.owner=p.id;panel.dataset.game=w.game;panel.style.setProperty('--sport-color',trayPalette[p.index%8]);
 const head=el('div','sport-head');head.append(el('b','',p.name+(p.id===self?' · 나':'')),el('strong','sport-points','0'));
 const field=el('div','sport-field'),layer=el('div','sport-items'),actor=el('div','sport-gremlin');actor.innerHTML=deptAvatarSvg(p.department||'business');field.append(layer,actor);
 const judge=el('small','sport-judge'),power=el('div','sport-power'),fill=el('i');power.append(fill);field.append(judge,power);const foot=el('small','sport-detail');panel.append(head,field,foot);
 return{panel,field,layer,actor,judge,power,fill,foot,score:head.lastChild,nodes:new Map(),used:new Set()};
}
function arcadeSportNode(view,key,cls,text){let node=view.nodes.get(key);if(!node){node=el('i',cls);view.nodes.set(key,node);view.layer.append(node);}if(node.className!==cls)node.className=cls;if(text!==undefined&&node.textContent!==String(text))node.textContent=String(text);view.used.add(key);return node;}
function arcadeSportPlace(node,x,y){node.style.left=(x/7)+'%';node.style.top=(y/4.6)+'%';}
function arcadeSportRect(node,r){arcadeSportPlace(node,r.x,r.y);node.style.width=(r.w/7)+'%';node.style.height=(r.h/4.6)+'%';}
let arcadePongView=null;
function arcadePongBuild(w){
 const court=el('section','pong-team-court');court.id='pongTeamCourt';court.setAttribute('aria-label','양팀이 공을 주고받는 공유 탁구대');
 const head=el('header','pong-team-scoreboard'),teams=[];
 for(const side of [0,1]){const summary=el('div','pong-team-summary pong-side-'+side),title=el('strong','pong-team-title'),names=el('span','pong-team-names'),bonus=el('small','pong-team-bonus');summary.append(title,names,bonus);teams.push({summary,title,names,bonus});if(side===0)head.append(summary);}
 const score=el('b','pong-team-score');head.append(score,teams[1].summary);
 const field=el('div','pong-team-field'),net=el('div','pong-team-net'),items=el('div','pong-team-items'),serve=el('i','pong-team-serve');net.setAttribute('aria-hidden','true');field.append(net,items,serve);court.append(head,field);$('arcadeScenery').append(court);
 const paddles=new Map();for(const p of w.players){const paddle=el('div','pong-team-paddle'),avatar=el('div','pong-paddle-avatar'),name=el('span','pong-paddle-name',p.name);paddle.dataset.side=String(p.team);paddle.dataset.owner=p.id;avatar.innerHTML=deptAvatarSvg(p.department||'business');paddle.append(avatar,name);items.append(paddle);paddles.set(p.id,paddle);}
 const ball=el('i','pong-team-ball');ball.setAttribute('aria-label','탁구공');items.append(ball);arcadePongView={key:w.id,court,field,teams,score,serve,paddles,ball};
}
function arcadePongDraw(s,w,g,self){
 const v=arcadePongView;if(!v)return;const own=w.players.find(p=>p.id===self),t=w.elapsed,live=s.phase==='round'&&w.phase==='play',scores=w.meta.teamGoals||[0,0],counts=w.meta.teamSizes||[0,0];
 for(const side of [0,1]){const entry=v.teams[side],members=w.players.filter(p=>p.team===side&&!p.forfeited);arcadeNodeText(entry.title,(side?'B':'A')+'팀'+(own?.team===side?' · 우리 팀':''));arcadeNodeText(entry.names,members.map(p=>p.name).join(' · '));arcadeNodeText(entry.bonus,w.meta.handicapTeam===side?'소수 팀 · 큰 패들 + 빠른 이동':counts[0]===counts[1]?'동일한 패들·속도':'기본 패들·속도');entry.summary.classList.toggle('is-own',own?.team===side);entry.summary.dataset.teamSize=String(counts[side]);}
 arcadeNodeText(v.score,scores[0]+' : '+scores[1]);
 for(const p of w.players){const paddle=v.paddles.get(p.id);if(!paddle)continue;arcadePosition(paddle,p.x/7,p.paddleY/4.6);paddle.style.width=12/7+'%';paddle.style.height=p.paddleHeight/4.6+'%';paddle.hidden=p.forfeited||p.eliminated;paddle.classList.toggle('is-own',p.id===self);paddle.classList.toggle('is-smash',t<p.smashUntil);paddle.setAttribute('aria-label',p.name+' · '+(p.team?'B':'A')+'팀 패들'+(p.id===self?' · 내 조작':''));}
 const ball=w.objects.find(o=>o.kind==='pongBall');if(ball){arcadePosition(v.ball,ball.x/7,ball.y/4.6);v.ball.hidden=t<ball.serveAt;v.ball.classList.toggle('is-fast',Math.hypot(ball.vx,ball.vy)>400);v.serve.hidden=!live||t>=ball.serveAt;arcadeNodeText(v.serve,t<w.meta.goalUntil?(w.meta.lastScorerTeam?'B':'A')+'팀 득점!':'서브 준비');}
 $('arcadeDpad').hidden=false;const button=arcadeDialog.querySelector('[data-arcade-control="action"]'),cool=own?Math.max(0,own.readyAt-t):0;button.hidden=false;button.disabled=!live||!own||own.forfeited||own.eliminated||cool>.01;arcadeSetText('arcadeActionLabel','스매시!');arcadeSetText('arcadeActionHint',cool>.01?cool.toFixed(1)+'초 뒤 다시':'공이 닿을 때 눌러요');
 arcadeSetText('arcadeOwnStatus',own?(own.team?'B':'A')+'팀 · '+scores[own.team]+'골 · '+own.rallies+'회 랠리':'양팀 경기 관전 중');
 arcadeSetText('arcadeStatus',s.phase==='between'||s.phase==='done'?s.notice:live?t<w.meta.goalUntil?w.meta.notice:counts[0]+' 대 '+counts[1]+' 팀전 · ↑/↓로 내 패들 이동, Space 스매시':'팀을 확인해요 · 인원이 적은 쪽은 패들 크기와 이동 속도 보정');
}
const arcadeSportsBuildBase=arcadeBuildBoard;
arcadeBuildBoard=function(w){
 arcadeSportsBuildBase(w);arcadeSportsBoard='';arcadeSportsPanels.clear();if(!arcadeSportsKeys.has(w.game))return;
 arcadeSportsBoard=w.id+':'+w.game;if(w.game==='pong'){arcadePongBuild(w);return;}const root=el('div','sports-courts');root.id='arcadeSportsCourts';root.dataset.count=String(w.players.length);root.classList.toggle('is-crowded',w.players.length>4);
 const self=arcadeSelf();for(const p of [...w.players].sort((a,b)=>Number(b.id===self)-Number(a.id===self))){const v=arcadeSportsPanel(w,p,self);arcadeSportsPanels.set(p.id,v);root.append(v.panel);}
 $('arcadeScenery').append(root);
};
const arcadeSportsDrawBase=arcadeDrawWorld;
arcadeDrawWorld=function(s,w,g,self){
 arcadeSportsDrawBase(s,w,g,self);if(w.game==='pong'){if(arcadeSportsBoard!==w.id+':'+w.game||!$('pongTeamCourt'))arcadeBuildBoard(w);arcadePongDraw(s,w,g,self);return;}if(!arcadeSportsKeys.has(w.game))return;
 if(arcadeSportsBoard!==w.id+':'+w.game||!$('arcadeSportsCourts'))arcadeBuildBoard(w);
 const own=w.players.find(p=>p.id===self),t=w.elapsed;
 for(const p of w.players){const v=arcadeSportsPanels.get(p.id);if(!v)continue;v.used.clear();v.panel.classList.toggle('is-out',p.forfeited||p.eliminated);v.score.textContent=Math.round(p.score)+'점';v.judge.textContent=t<p.judgeUntil?p.judge:'';v.power.hidden=p.phase!=='power';v.fill.style.width=(p.power*100)+'%';v.actor.classList.toggle('is-action',t<p.actionUntil);v.actor.hidden=!['pong','curling','bowling','volley'].includes(w.game);
  let detail='';
  if(w.game==='pong'){
   const paddle=arcadeSportNode(v,'paddle','sport-paddle');arcadeSportPlace(paddle,61,p.paddleY);paddle.style.height='26%';paddle.classList.toggle('is-smash',t<p.smashUntil);const back=arcadeSportNode(v,'wall','sport-pong-wall');arcadeSportRect(back,{x:664,y:26,w:9,h:408});arcadeSportPlace(v.actor,38,p.paddleY);detail=p.rallies+'회 반사 · 놓침 '+p.misses;
  }
  if(w.game==='curling'){
   arcadeSportPlace(arcadeSportNode(v,'target','sport-curl-target'),350,125);arcadeSportPlace(v.actor,350,425);const aim=arcadeSportNode(v,'aim','sport-aim sport-aim-up');arcadeSportPlace(aim,350,419);aim.style.transform='translate(-50%,-100%) rotate('+p.aim+'rad)';aim.hidden=!['ready','power'].includes(p.phase);detail=p.shots+'/3투 · '+(p.phase==='done'?'완료':p.phase==='power'?'한 번 더 눌러 발사':p.phase==='moving'?t<p.sweepUntil?'슥슥! 쓸기 중':'Space로 쓸어 더 멀리':'조준 후 Space');
  }
  if(w.game==='bowling'){
   arcadeSportPlace(v.actor,350,425);const aim=arcadeSportNode(v,'aim','sport-aim sport-aim-up');arcadeSportPlace(aim,350,419);aim.style.transform='translate(-50%,-100%) rotate('+p.aim+'rad)';aim.hidden=!['ready','power'].includes(p.phase);v.power.hidden=!['ready','power'].includes(p.phase);v.power.setAttribute('aria-label','강한 공은 빠르고, 약한 공은 커브 보정 시간이 길어요');detail=Math.min(3,p.completed+1)+'/3 · '+(p.bowlRack||'핀 배치')+' · '+p.frameShots+'/2투 · '+(p.phase==='moving'?'←→ 커브 보정':p.phase==='power'?'강한 공은 빠름 · 약한 공은 보정 여유':p.phase==='done'?'완료':p.frameShots?'남은 핀을 보고 다시 조준':'핀 배치를 보고 조준');
  }
  if(w.game==='volley'){arcadeSportPlace(v.actor,p.x,418);v.actor.classList.toggle('is-hitting',t<p.actionUntil);detail=p.hits+'번 살림 · 놓침 '+p.misses;}
  if(w.game==='golf'){
   const layout=w.meta.layouts[p.hole%3];arcadeSportPlace(arcadeSportNode(v,'hole','sport-golf-hole'),layout.hole.x,layout.hole.y);for(const [i,r]of layout.walls.entries())arcadeSportRect(arcadeSportNode(v,'barrier:'+i,'sport-golf-wall'),r);const aim=arcadeSportNode(v,'aim','sport-aim sport-aim-right');arcadeSportPlace(aim,p.x,p.y);aim.style.transform='translateY(-50%) rotate('+p.aim+'rad)';aim.hidden=!['ready','power'].includes(p.phase);detail=Math.min(3,p.hole+1)+'/3홀 · '+p.holeStrokes+'타';
  }
  if(w.game==='parking'){
   const level=Math.min(p.parked,w.meta.parkingLevels.length-1),layout=w.meta.parkingLevels[level],target=w.meta.spots[p.target%w.meta.spots.length],slot=arcadeSportNode(v,'slot','sport-parking-slot','P');arcadeSportPlace(slot,target.x,target.y);slot.style.width=layout.width/7+'%';slot.style.height=layout.height/4.6+'%';slot.style.transform='translate(-50%,-50%)';slot.setAttribute('aria-label','현재 주차칸 · 도착하면 다음 칸');v.panel.dataset.parkingLevel=String(level+1);v.score.textContent=p.parked+'대';const car=arcadeSportNode(v,'car','sport-car');arcadeSportPlace(car,p.x,p.y);car.style.transform='translate(-50%,-50%) rotate('+p.angle+'rad)';car.classList.toggle('is-braking',t<p.actionUntil);for(const [i,r]of layout.walls.entries())arcadeSportRect(arcadeSportNode(v,'barrier:'+i,'sport-parking-obstacle'),r);detail=p.parked+'대 · 난도 '+(level+1)+' · 도착 즉시 다음 칸';
  }
  for(const o of w.objects){if(o.ownerId!==p.id)continue;let cls='sport-ball sport-'+o.kind;if(o.down)cls+=' is-down';const node=arcadeSportNode(v,o.id,cls);arcadeSportPlace(node,o.x,o.y);node.hidden=w.game==='pong'||w.game==='volley'?t<(o.serveAt||0):false;if(o.kind==='curlStone')node.classList.toggle('is-settled',o.settled);}
  for(const [key,node]of v.nodes)if(!v.used.has(key)){node.remove();v.nodes.delete(key);}v.foot.textContent=detail;
 }
 if(own){arcadeSetText('arcadeOwnStatus',w.game==='parking'?own.parked+'대 · 난도 '+Math.min(own.parked+1,w.meta.parkingLevels.length):Math.round(own.score)+'점 · '+(t<own.judgeUntil?own.judge:own.phase==='power'?'파워 '+Math.round(own.power*100)+'%':''));const next=Math.max(0,(own.readyAt||0)-t),sweeping=w.game==='curling'&&own.phase==='moving',moving=['moving','between','done'].includes(own.phase)&&['curling','bowling','golf'].includes(w.game)&&!sweeping,button=arcadeDialog.querySelector('[data-arcade-control="action"]');button.disabled=s.phase!=='round'||w.phase!=='play'||!own||own.forfeited||own.eliminated||moving||next>.01;arcadeSetText('arcadeActionLabel',sweeping?'슥슥 쓸기':own.phase==='power'?'지금 발사!':g.action);arcadeSetText('arcadeActionHint',moving?'결과를 기다려요':next>.01?next.toFixed(1)+'초':sweeping?'쓸면 더 멀리 가요':g.key);if(s.phase==='round'&&w.phase==='play')arcadeSetText('arcadeStatus',t<own.judgeUntil?own.judge:own.phase==='power'?'파워 '+Math.round(own.power*100)+'% · 한 번 더 눌러 발사!':w.game==='parking'?'주차 '+own.parked+'대 · 난도 '+Math.min(own.parked+1,w.meta.parkingLevels.length)+' · P칸에 도착하면 바로 다음 칸':w.game==='pong'?'반사 '+own.rallies+'회 · ↑/↓ 패들, Space 스매시':w.game==='volley'?'풍선 '+own.hits+'번 살림 · 내려올 때 정확한 리시브 +10':w.game==='golf'?(own.hole+1)+'/3홀 · '+own.holeStrokes+'타 · 벽 반사로 우회':w.game==='bowling'?Math.min(3,own.completed+1)+'/3프레임 · '+own.frameShots+'/2투 · 이번 '+own.framePins+'핀':own.shots+'/3투 · 과녁 중심을 노려요');}
 if(own&&w.game==='bowling'&&s.phase==='round'&&w.phase==='play'){if(own.phase==='moving')arcadeSetText('arcadeActionHint','←/→로 커브 보정');if(t>=own.judgeUntil)arcadeSetText('arcadeStatus',(own.bowlRack||'핀 배치')+' · '+own.frameShots+'/2투 · '+(own.phase==='moving'?'←/→로 공의 커브를 보정해요':own.phase==='power'?'파워 '+Math.round(own.power*100)+'% · 강하면 빠르고 약하면 보정 여유':'핀 배치를 보고 조준 · 충돌 방향에 따라 핀이 퍼져요'));}
 $('arcadeDpad').hidden=false;
};
/* END_ARCADE_SPORTS_UI_V1 */

/* ARCADE_ACTION_PACK_UI_V1 */
Object.assign(arcadeGames,{
 dodgeball:{name:'급식 피구대회',icon:'🏐',tag:'생존 · 공 던져 명중',hint:'방향키로 피하고 상대를 보고 Space! 체력이 다하면 탈락, 마지막 생존자가 승리해요.',action:'던져!',key:'SPACE / F',input:'hit',color:'#e5a38b',duel:true,controls:'standard'},
 crown:{name:'왕관은 내 밥',icon:'👑',tag:'쟁탈 · 왕관 오래 지키기',hint:'왕관을 잡고 오래 버텨! 방향키 이동, Space 돌진으로 빼앗기. 모서리에 오래 숨으면 왕관이 떨어져.',action:'뺏어!',key:'SPACE / F',input:'dash',color:'#e6cc7e',duel:true,controls:'standard'},
 lasers:{name:'레이저 야근실',icon:'🔴',tag:'생존 · 회전과 스윕',hint:'점선은 예고, 빨간 레이저는 위험! 방향키와 Space 대시로 피해요. 체력이 다하면 탈락해요.',action:'대시!',key:'SPACE / F',input:'dash',color:'#a9c6bc',duel:true,controls:'standard'},
 frogger:{name:'횡단보도 배달왕',icon:'🚦',tag:'횡단 · 왕복 배송',hint:'방향키로 한 칸씩, Space로 바라보는 쪽 두 칸 도약! 차량과 친구를 피해서 건너편까지 왕복 배달해.',action:'두 칸!',key:'SPACE / F',input:'dash',color:'#8dc9b5',duel:true,controls:'standard'},
 bridge:{name:'나무다리 공사판',icon:'🪵',tag:'건설 · 공용 나무 경쟁',hint:'아래 땅에서 나무를 모아 내 색 다리 입구로! Space로 한 칸 건설. 나무는 최대 3개, 먼저 다리를 완성해.',action:'놓아!',key:'SPACE / F',input:'hit',color:'#bfc294',duel:true,controls:'standard'},
 claw:{name:'탕비실 집게왕',icon:'🦾',tag:'집기 · 미세 조준과 조기 회수',hint:'←/→ 조준, Space로 내려! 내려갈 때도 좌우 미세 조준, 한 번 더 누르면 빈 집게를 조기 회수해요.',action:'내려!',key:'SPACE / F',input:'hit',color:'#c7a9d7',duel:true,controls:'standard'}
});
const actionPackKeys=new Set(['dodgeball','crown','lasers','frogger','bridge','claw']),actionPackPalette=typeof trayPalette!=='undefined'&&Array.isArray(trayPalette)&&trayPalette.length?trayPalette:['#b9d67e','#c5a0df','#e6c675','#8dccca','#eda992','#a5b7dc','#dbaa93','#b9c49c'];
const actionPackNodes=new Map();let actionPackLayer=null,actionPackFrame=0;
function actionPackNode(key,tag,cls,text){let entry=actionPackNodes.get(key);if(!entry){entry={node:el(tag,cls),frame:0};actionPackNodes.set(key,entry);actionPackLayer.append(entry.node);}entry.frame=actionPackFrame;const n=entry.node;if(n.className!==cls)n.className=cls;if(text!==undefined&&n.textContent!==String(text))n.textContent=String(text);return n;}
function actionPackClean(){for(const[key,entry]of actionPackNodes)if(entry.frame!==actionPackFrame){entry.node.remove();actionPackNodes.delete(key);}}
function actionPackPosition(node,x,y){node.style.left=x/7+'%';node.style.top=y/4.6+'%';}
function actionPackStatic(cls,text){const node=el('div',cls,text);$('arcadeScenery').append(node);return node;}
function actionPackDrawCrown(w,self){
 const owner=w.players.find(p=>p.id===w.meta.ownerId&&!p.eliminated&&!p.forfeited),item=w.objects.find(o=>o.kind==='crown')||w.objects[0];
 const badge=actionPackNode('crownOwner','div','crown-owner-status'+(owner?.id===self?' is-own':''),owner?'👑 왕관 보유 · '+owner.name+(owner.id===self?' · 나':''):'👑 주인 없는 왕관 · 가져가!');badge.dataset.owner=owner?.id||'';badge.title=badge.textContent;badge.setAttribute('role','status');badge.setAttribute('aria-live','polite');
 const crown=actionPackNode('crown','span','ap-crown'+(owner?' is-owned':'')+(owner&&w.elapsed<w.meta.protectionUntil?' is-protected':''),'👑'),actors=$('arcadeActors');
 if(crown.parentElement!==actors)actors.append(crown);if(badge.parentElement!==actors)actors.append(badge);crown.hidden=!owner&&!item;crown.setAttribute('role','img');crown.setAttribute('aria-label',owner?owner.name+' 님이 왕관 보유 중':'주인 없는 왕관');
 if(owner){const side=owner.y<130,offset=owner.x>610?' - 34px':' + 34px';crown.style.left=side?'calc('+owner.x/7+'%'+offset+')':owner.x/7+'%';crown.style.top=side?'calc('+owner.y/4.6+'% - 20px)':'calc('+owner.y/4.6+'% - var(--crown-owner-lift, 68px))';}
 else if(item)actionPackPosition(crown,item.x,item.y);
 for(const p of w.players){const actor=arcadeUIActors.get(p.id);if(!actor)continue;const owns=p===owner;actor.classList.toggle('is-crown-holder',owns);actor.dataset.crownOwner=String(owns);}
}
const actionPackBuildBase=arcadeBuildBoard;
arcadeBuildBoard=function(w){
 actionPackBuildBase(w);actionPackNodes.clear();actionPackLayer=null;actionPackFrame=0;if(!actionPackKeys.has(w.game))return;
 if(w.game==='dodgeball'){actionPackStatic('ap-court');actionPackStatic('ap-center-line');actionPackStatic('ap-center-circle');actionPackStatic('ap-scene-title','급식실 피구 코트 · 체력 0이면 이번 판 탈락');}
 if(w.game==='crown'){actionPackStatic('ap-throne-circle');for(const corner of ['tl','tr','bl','br'])actionPackStatic('ap-corner '+corner,'캠핑 금지');}
 if(w.game==='lasers'){actionPackStatic('ap-laser-floor');actionPackStatic('ap-emitter left','◉');actionPackStatic('ap-emitter right','◉');actionPackStatic('ap-scene-title','WARNING · 빨간 선은 위험!');}
 if(w.game==='frogger'){
  for(let row=0;row<10;row++){const lane=actionPackStatic(w.meta.safeRows.includes(row)?'ap-traffic-safe':'ap-traffic-road');lane.style.top=(430-row*42-20)/4.6+'%';lane.style.height=40/4.6+'%';if(row===0||row===9)lane.textContent=row===9?'배달 도착 · 다시 아래로!':'출발 · 위로 배달해요';else if(row===4)lane.textContent='잠깐 쉬는 안전지대';}
 }
 if(w.game==='bridge'){
  actionPackStatic('ap-bridge-water');actionPackStatic('ap-bridge-land');actionPackStatic('ap-finish-bank','건너편 도착');
  for(const p of w.players){const lane=actionPackStatic('ap-bridge-outline');lane.style.left=p.laneX/7+'%';lane.style.width=Math.min(58,700/w.players.length*.65)/7+'%';lane.style.borderColor=actionPackPalette[p.index%8];const entry=actionPackStatic('ap-bridge-entry',p.name);entry.style.left=p.laneX/7+'%';entry.style.background=actionPackPalette[p.index%8];}
 }
 if(w.game==='claw'){actionPackStatic('ap-claw-cabinet');actionPackStatic('ap-claw-rail');actionPackStatic('ap-scene-title','탕비실 경품 · 먼저 집은 사람이 임자!');}
 actionPackLayer=el('div','action-pack-layer');$('arcadeScenery').append(actionPackLayer);
};
const actionPackDrawBase=arcadeDrawWorld;
arcadeDrawWorld=function(s,w,g,self){
 actionPackDrawBase(s,w,g,self);if(!actionPackKeys.has(w.game)||!actionPackLayer)return;
 const t=w.elapsed,own=w.players.find(p=>p.id===self),live=s.phase==='round'&&w.phase==='play',can=live&&own&&!own.eliminated&&!own.forfeited;actionPackFrame++;
 for(const p of w.players){const actor=arcadeUIActors.get(p.id);if(actor){actor.classList.toggle('is-respawning',t<(p.respawnUntil||0)||w.game==='frogger'&&t<p.stunUntil);actor.classList.toggle('has-crown',w.game==='crown'&&w.meta.ownerId===p.id);const tag=actor.querySelector('.five-actor-tag');if(tag)tag.textContent=(p.id===self?'▼ ':'')+(p.forfeited?'기권':p.eliminated?'이번 판 탈락':['dodgeball','lasers'].includes(w.game)?'♥'.repeat(Math.max(0,p.health)):w.game==='crown'?p.heldSeconds.toFixed(1)+'초':w.game==='frogger'?p.deliveries+'배송':w.game==='bridge'?p.bridgeSteps+'/'+w.meta.bridgeGoal+' · 🪵'+p.carried:p.catches+'개');}}
 if(w.game==='dodgeball')for(const o of w.objects){const ball=actionPackNode('ball:'+o.id,'span','ap-dodgeball','🏐');actionPackPosition(ball,o.x,o.y);ball.style.rotate=(t*380)+'deg';}
 if(w.game==='crown')actionPackDrawCrown(w,self);
 if(w.game==='lasers')for(const o of w.objects){const laser=actionPackNode('laser:'+o.id,'i','ap-laser'+(t<o.activeAt?' is-warning':' is-active'));actionPackPosition(laser,o.x,o.y);laser.style.transform='translate(-50%,-50%) rotate('+o.angle+'rad)';}
 if(w.game==='frogger')for(const o of w.objects){const car=actionPackNode('car:'+o.id,'span','ap-traffic-car'+(o.vx<0?' is-left':''),o.emoji);actionPackPosition(car,o.x,o.y);car.style.width=o.width/7+'%';car.style.height=o.height/4.6+'%';}
 if(w.game==='bridge'){
  for(const p of w.players){const path=actionPackNode('bridge:'+p.id,'div','ap-bridge-path');path.style.left=p.laneX/7+'%';path.style.top=(258-p.bridgeSteps/w.meta.bridgeGoal*194)/4.6+'%';path.style.height=p.bridgeSteps/w.meta.bridgeGoal*194/4.6+'%';path.style.width=Math.min(54,700/w.players.length*.62)/7+'%';path.style.background=actionPackPalette[p.index%8];}
  for(const o of w.objects){if(!o.active)continue;const wood=actionPackNode('wood:'+o.id,'span','ap-bridge-wood','🪵');actionPackPosition(wood,o.x,o.y);}
 }
 if(w.game==='claw'){
  for(const p of w.players){const rope=actionPackNode('rope:'+p.id,'i','ap-claw-rope');rope.style.left=p.hookX/7+'%';rope.style.top=w.meta.hookTop/4.6+'%';rope.style.height=Math.max(5,p.hookY-w.meta.hookTop)/4.6+'%';rope.style.background=actionPackPalette[p.index%8];const hook=actionPackNode('hook:'+p.id,'span','ap-claw-hook','⌞⌟');actionPackPosition(hook,p.hookX,p.hookY);hook.style.color=actionPackPalette[p.index%8];}
  for(const o of w.objects){if(!o.active&&!o.ownerId)continue;const prize=actionPackNode('prize:'+o.id,'span','ap-claw-prize mass-'+o.mass,o.emoji+' '+o.value);actionPackPosition(prize,o.x,o.y);}
 }
 actionPackClean();
 $('arcadeDpad').hidden=false;const action=arcadeDialog.querySelector('[data-arcade-control="action"]');action.hidden=false;
 const ready=own?(w.game==='dodgeball'?own.throwReadyAt:w.game==='frogger'?own.leapReadyAt:w.game==='bridge'?own.buildReadyAt:w.game==='claw'?own.hookReadyAt:own.dashReadyAt)||0:0,cool=Math.max(0,ready-t),busy=w.game==='claw'&&own?.hookState==='up',lowering=w.game==='claw'&&own?.hookState==='down';
 action.disabled=!can||cool>.05||busy||w.game==='bridge'&&(!own?.carried||own?.finishedAt>=0);arcadeSetText('arcadeActionLabel',lowering?'조기 회수':g.action);arcadeSetText('arcadeActionHint',busy?'회수 중…':cool>.05?cool.toFixed(1)+'초 뒤 다시':lowering?'좌우로 미세 조준 · 누르면 회수':g.key);
 const status=!own?'이번 판 관전 중':w.game==='dodgeball'?own.hits+'명중 · '+own.received+'피격':w.game==='crown'?own.heldSeconds.toFixed(1)+'초 보유 · '+own.steals+'번 약탈':w.game==='lasers'?own.received+'피격 · 아슬아슬 '+own.nearMisses+'회':w.game==='frogger'?own.deliveries+'배송 · '+own.crashes+'충돌':w.game==='bridge'?own.bridgeSteps+'/'+w.meta.bridgeGoal+'칸 · 나무 '+own.carried+'/3':own.score+'점 · '+own.catches+'개 확보';
 arcadeSetText('arcadeOwnStatus',own&&t<(own.resultUntil||0)?own.lastResult:status);arcadeSetText('arcadeStatus',s.phase==='between'||s.phase==='done'?s.notice:w.meta.notice||g.hint);
};
/* END_ARCADE_ACTION_PACK_UI_V1 */

/* ARCADE_BRAIN_PACK_UI_V1 */
Object.assign(arcadeGames,{
 memory:{name:'복사기 기억력 검사',icon:'💡',tag:'기억 · 불빛 순서',hint:'불빛을 보고 기다렸다가 A / W / D로 같은 순서를 재현! 한 문제에 한 번은 처음부터 다시 도전해요.',action:'기억!',key:'A / W / D',input:'hit',color:'#d9c6e9',duel:true,controls:'choices'},
 sorter:{name:'서류 분류 컨베이어',icon:'📁',tag:'분류 · 바뀌는 규칙',hint:'서류 그림을 보고 A / W / D로 분류! 특별 규칙이면 원래 함보다 한 칸 오른쪽으로 보내요.',action:'분류!',key:'A / W / D',input:'hit',color:'#c9dfb8',duel:true,controls:'choices'},
 receipt:{name:'영수증 암산 결재',icon:'🧾',tag:'암산 · 합계 찾기',hint:'영수증 금액을 더해서 A / W / D로 합계를 골라요. 뒤로 갈수록 계산이 늘고, 연속 정답은 보너스!',action:'정산!',key:'A / W / D',input:'hit',color:'#efdbb1',duel:true,controls:'choices'},
 safe:{name:'탕비실 비밀 금고',icon:'🔐',tag:'기억 · 숫자 다이얼',hint:'세 자리 번호를 기억! ← / →로 한 칸씩 돌리고 Space로 확정해요. 실수해도 맞힌 앞자리는 유지돼요.',action:'확정!',key:'← / → + SPACE',input:'hit',color:'#bdd5d7',duel:true,controls:'standard'},
 auction:{name:'마지막 간식 경매',icon:'✉️',tag:'눈치 · 비공개 입찰',hint:'예산 12로 A=0, W=1, D=3 비밀 입찰! 마감 전 수정 가능. 유일한 최고 입찰만 상품 획득, 입찰금은 소모되고 예산+상품 가치가 점수예요.',action:'입찰!',key:'A / W / D',input:'hit',color:'#d8c7e1',duel:true,controls:'choices'},
 stacker:{name:'보고서 탑 쌓기',icon:'📚',tag:'타이밍 · 겹친 만큼',hint:'양쪽에서 오는 블록을 Space로 멈춰 쌓아요. 겹친 부분만 남고 PERFECT 3연속이면 너비 회복! 무너져도 다시 도전해요.',action:'쌓아!',key:'SPACE / F',input:'hit',color:'#b5d6e4',duel:true,controls:'action'},
 reaction:{name:'결재 신호 반응전',icon:'🚨',tag:'판단 · 세 가지 결재 지시',hint:'초록 신호의 지시를 골라요! A=반려, W/Space=승인, D=전달. 가짜에는 참기! 늦거나 다른 버튼이면 실패.',action:'지시 선택!',key:'A / W·SPACE / D',input:'jump',color:'#dfc6ac',duel:true,controls:'choices'}
});
const brainPackIds=new Set(['memory','sorter','receipt','safe','auction','stacker','reaction']),brainPackNodes=new Map();
function brainPackNode(id,tag,cls,text){const node=el(tag,cls,text);node.id='brain_'+id;brainPackNodes.set(id,node);return node;}
function brainPackText(id,text){const node=brainPackNodes.get(id);if(node&&node.textContent!==String(text))node.textContent=String(text);}
const brainPackBuildBase=arcadeBuildBoard;
arcadeBuildBoard=function(w){
 brainPackBuildBase(w);if(!brainPackIds.has(w.game))return;brainPackNodes.clear();
 const layer=brainPackNode('layer','div','brain-layer brain-'+w.game),top=el('div','brain-top');top.append(brainPackNode('round','b','brain-round',''),brainPackNode('phase','span','brain-phase',''));layer.append(top);
 if(w.game==='memory'){
  layer.append(brainPackNode('instruction','h3','','불빛을 기억해요'));
  const lights=el('div','brain-memory-lights');for(let i=0;i<3;i++){const light=brainPackNode('light'+i,'div','brain-memory-light light-'+i);light.append(el('b','',['◀','●','▶'][i]),el('small','',['A · 왼쪽','W · 가운데','D · 오른쪽'][i]));lights.append(light);}layer.append(lights,brainPackNode('memoryProgress','div','brain-memory-progress',''));
 }
 if(w.game==='sorter'){
  layer.append(brainPackNode('rule','h3','brain-sort-rule',''));
  const belt=el('div','brain-conveyor'),doc=brainPackNode('doc','div','brain-document');doc.append(brainPackNode('docIcon','b','','📁'),brainPackNode('docName','span','',''));belt.append(doc);layer.append(belt);
  const boxes=el('div','brain-inboxes');for(let i=0;i<3;i++){const box=el('div','brain-inbox');box.append(el('b','',['📁','🧾','🎓'][i]),el('span','',['A · 행정함','W · 회계함','D · 학생함'][i]));boxes.append(box);}layer.append(boxes);
 }
 if(w.game==='receipt'){
  const ticket=el('div','brain-receipt-ticket');ticket.append(el('small','','LUNCH OFFICE · 영수증'),el('h3','','오늘의 소액 결재'));
  for(let i=0;i<3;i++){const row=brainPackNode('receiptRow'+i,'div','brain-receipt-row');row.append(el('span','','품목 '+(i+1)),brainPackNode('receiptNumber'+i,'b','',''));ticket.append(row);}
  const total=el('div','brain-receipt-total');total.append(el('span','','합계'),brainPackNode('receiptTotal','strong','','?원'));ticket.append(total);layer.append(ticket);
 }
 if(w.game==='safe'){
  const safe=el('div','brain-safe-door');safe.append(el('small','','탕비실 간식 금고'),brainPackNode('pin','div','brain-safe-pin','● ● ●'));
  const dial=el('div','brain-safe-dial');dial.append(brainPackNode('dial','strong','','0'),el('span','','← 돌리기 →'));safe.append(dial,brainPackNode('safeProgress','div','brain-safe-progress',''),el('small','','Space · 현재 숫자 확정'));layer.append(safe);
 }
 if(w.game==='auction'){
  const lot=el('div','brain-auction-lot');lot.append(el('b','','🍩'),el('div','','마지막 간식 한 상자'),brainPackNode('prize','strong','','상품 가치 0'));layer.append(lot);
  const people=el('div','brain-bidders');for(const p of w.players){const bidder=brainPackNode('bidder'+p.index,'div','brain-bidder');bidder.append(el('b','',p.name),brainPackNode('bid'+p.index,'span','',''),brainPackNode('budget'+p.index,'small','',''));people.append(bidder);}layer.append(people);
 }
 if(w.game==='stacker'){
  const construction=el('div','brain-construction');construction.append(el('div','brain-crane','주황 블록을 초록 자리 위에 놓기'));
  const tower=el('div','brain-tower'),start=brainPackNode('stackStart','div','brain-stack-start','START'),target=brainPackNode('stackTarget','i','brain-stack-target'),hint=brainPackNode('stackHint','span','brain-stack-target-label','여기서 시작');target.append(hint);tower.append(start,target);for(let i=0;i<8;i++)tower.append(brainPackNode('block'+i,'i','brain-stack-block'));tower.append(brainPackNode('movingBlock','i','brain-stack-block is-moving'),el('div','brain-stack-ground'));construction.append(tower);layer.append(construction,brainPackNode('stackInfo','div','brain-stack-info',''));
 }
 if(w.game==='reaction'){
  layer.append(el('div','brain-reaction-sign','초록 지시를 골라! 가짜에는 손 떼기'));
  const signal=brainPackNode('signal','div','brain-reaction-signal'),window=el('div','reaction-window');signal.append(el('span','brain-signal-dot'),brainPackNode('signalText','strong','','아직…'));window.append(brainPackNode('reactionWindow','i'));layer.append(signal,window,brainPackNode('reactionRecord','div','brain-reaction-record',''));
 }
 layer.append(brainPackNode('feedback','p','brain-feedback',''));$('arcadeScenery').append(layer);
};
const brainPackDrawBase=arcadeDrawWorld;
arcadeDrawWorld=function(s,w,g,self){
 brainPackDrawBase(s,w,g,self);if(!brainPackIds.has(w.game))return;const own=w.players.find(p=>p.id===self)||w.players.find(p=>!p.forfeited)||w.players[0],t=w.elapsed;
 brainPackText('round',w.game==='stacker'?'최고의 탑에 도전':'ROUND '+((w.meta.stage||0)+1)+' / '+({memory:6,sorter:16,receipt:6,safe:3,auction:4,reaction:7}[w.game]||1));
 brainPackText('phase',w.meta.phase==='watch'?'관찰 시간':w.meta.phase==='reveal'?'결과 공개':w.meta.phase==='repeat'?'같은 순서 입력':w.meta.phase==='unlock'?'기억한 번호 입력':w.meta.phase==='choose'?(own.locked?(w.game==='auction'?'봉투 제출 · 수정 가능':'선택 완료'):'내 선택은?'):'나의 차례');
 brainPackText('feedback',t<own.feedbackUntil?own.feedback:'');
 $('arcadeDpad').hidden=w.game!=='safe';if(w.game==='safe')$('arcadeDpad').querySelector('i').textContent='숫자';
 if(w.game==='memory'){
  brainPackText('instruction',w.meta.phase==='watch'?'순서를 기억해요':'방금 본 순서대로!');
  for(let i=0;i<3;i++)brainPackNodes.get('light'+i).classList.toggle('is-lit',w.meta.flashLane===i);
  brainPackText('memoryProgress',Array.from({length:w.meta.patternLength},(_,i)=>i<own.memoryIndex?'●':'○').join('  ')+(own.locked?' · 다음 문제 대기':own.memoryRetryUsed?' · 마지막 도전':' · 다시 도전 1회'));
 }
 if(w.game==='sorter'){
  brainPackText('rule',w.meta.rule);brainPackText('docIcon',w.meta.docIcon);brainPackText('docName',w.meta.docName);
  brainPackNodes.get('doc').style.transform='translateX('+((w.meta.belt-.5)*110)+'%) rotate(-3deg)';brainPackNodes.get('layer').dataset.shift=String(w.meta.ruleShift);
 }
 if(w.game==='receipt'){
  for(let i=0;i<3;i++){brainPackNodes.get('receiptRow'+i).hidden=i>=w.meta.numbers.length;brainPackText('receiptNumber'+i,(w.meta.numbers[i]||0)+'원');}brainPackText('receiptTotal',w.meta.answer>=0?w.meta.answer+'원':'? 원');
 }
 if(w.game==='safe'){
  brainPackText('pin',w.meta.pinDisplay);brainPackText('dial',own.dial);brainPackText('safeProgress',Array.from({length:3},(_,i)=>i<own.safeProgress?'✓':'○').join('  ')+(own.locked?' · 열렸다!':''));brainPackNodes.get('layer').dataset.open=String(own.locked);
 }
 if(w.game==='auction'){
  brainPackText('prize','상품 가치 '+w.meta.prize+'점');const reveal=w.meta.phase==='reveal';
  for(const p of w.players){brainPackText('bid'+p.index,reveal?(p.bid>=0?p.bid+'장 입찰':'불참'):p.locked?'봉투 제출 ✓':'금액 비밀');brainPackText('budget'+p.index,'예산 '+p.budget+' · 상품 '+p.goods);brainPackNodes.get('bidder'+p.index).classList.toggle('is-winner',reveal&&w.meta.winnerId===p.id);}
 }
 if(w.game==='stacker'){
  const rects=own.stackRects||[];for(let i=0;i<8;i++){const block=brainPackNodes.get('block'+i),r=rects[i];block.hidden=!r;if(r){block.style.left=r[0]/7+'%';block.style.width=r[1]/7+'%';block.style.bottom=(9+i*8)+'%';}}
  const bottom=(9+Math.min(8,rects.length)*8)+'%',target=brainPackNodes.get('stackTarget');target.style.left=own.stackCenter/7+'%';target.style.width=own.stackWidth/7+'%';target.style.bottom=bottom;target.classList.toggle('is-aligned',Math.abs(own.movingX-own.stackCenter)<=Math.max(5,own.stackWidth*.06));brainPackNodes.get('stackHint').hidden=rects.length>0;brainPackNodes.get('stackStart').classList.toggle('is-start',rects.length===0);
  const block=brainPackNodes.get('movingBlock');block.style.left=own.movingX/7+'%';block.style.width=own.movingWidth/7+'%';block.style.bottom=bottom;block.hidden=t<own.stackReadyAt;
  brainPackText('stackInfo','현재 '+own.stackLevel+'층 · 최고 '+own.bestLevel+'층 · PERFECT '+own.perfects);
 }
 if(w.game==='reaction'){
  brainPackNodes.get('signal').dataset.signal=w.meta.signal;brainPackNodes.get('signal').dataset.lane=String(w.meta.targetLane);brainPackText('signalText',w.meta.signalText);brainPackNodes.get('reactionWindow').style.transform='scaleX('+Math.max(0,Math.min(1,(w.meta.reactionLeft||0)/(w.meta.reactionWindow||1)))+')';
  brainPackText('phase',w.meta.signal==='go'?'선택까지 '+w.meta.reactionLeft.toFixed(2)+'초':w.meta.signal==='fake'?'가짜 신호!':w.meta.signal==='reveal'?'다음 지시 대기':'신호를 기다려요');
  brainPackText('reactionRecord',own.locked?(own.reactionOutcome==='hit'?own.reactionMs+' ms · 정확한 선택!':own.reactionOutcome==='miss'?'신호를 놓쳤어요':own.reactionOutcome==='wrong'?'다른 버튼! 다음 지시 대기':'성급한 입력! 다음 지시 대기'):'A 반려 · W/Space 승인 · D 전달');
 }
 arcadeSetText('arcadeStatus',w.meta.notice||g.hint);arcadeSetText('arcadeOwnStatus',Math.round(own.score)+'점'+(w.game==='auction'?' · 남은 예산 '+own.budget:''));
};
/* END_ARCADE_BRAIN_PACK_UI_V1 */

/* ARCADE_EXTRA_CONTROLS_V1 */
let arcadeExtraChoices=null;
const arcadeFamilies={sports:['pong','curling','bowling','volley','golf','basket'],race:['kart','runner','sneak','parking','frogger'],action:['brawl','tray','dodge','coins','dodgeball','crown','lasers','bridge','claw'],brain:['doors','stamp','rhythm','memory','sorter','receipt','safe','auction','stacker','reaction']};
for(const [family,ids]of Object.entries(arcadeFamilies))for(const id of ids)if(arcadeGames[id])arcadeGames[id].family=family;
function arcadeExtraEnsureControls(){
 if(arcadeExtraChoices||!arcadeDialog)return;
 arcadeExtraChoices=el('div','extra-choice-controls');arcadeExtraChoices.id='arcadeExtraChoices';arcadeExtraChoices.hidden=true;
 for(let i=0;i<3;i++){const button=el('button','extra-choice-button');button.type='button';button.dataset.extraChoice=String(i);button.setAttribute('aria-label','게임 선택 '+(i+1));button.append(el('strong'),el('kbd','',['A / ←','W / ↑','D / →'][i]));button.addEventListener('click',()=>{if(!button.disabled&&arcadeState?.world&&arcadeGames[arcadeState.world.game]?.controls==='choices')arcadeInput(['hit','jump','dash'][i],true);});arcadeExtraChoices.append(button);}
 $('arcadeControls').append(arcadeExtraChoices);
}
const arcadeExtraDrawBase=arcadeDrawWorld;
arcadeDrawWorld=function(s,w,g,self){
 arcadeExtraDrawBase(s,w,g,self);arcadeExtraEnsureControls();if(!arcadeExtraChoices)return;arcadeExtraChoices.hidden=g.controls!=='choices';if(!g.controls)return;
 const own=w.players.find(p=>p.id===self),can=s.phase==='round'&&w.phase==='play'&&own&&!own.eliminated&&!own.forfeited;
 const choices=g.controls==='choices';arcadeExtraChoices.hidden=!choices;
 $('arcadeDpad').hidden=g.controls!=='standard';const action=arcadeDialog.querySelector('[data-arcade-control="action"]');action.hidden=choices;
 if(choices){const labels=own?.choiceLabels||w.meta.choiceLabels||['왼쪽','가운데','오른쪽'];for(const [i,button]of [...arcadeExtraChoices.children].entries()){const label=String(labels[i]??['왼쪽','가운데','오른쪽'][i]);if(button.firstChild.textContent!==label)button.firstChild.textContent=label;button.setAttribute('aria-label',w.game==='reaction'?label+' 선택':'게임 선택 '+(i+1));button.lastChild.textContent=w.game==='reaction'?['A / ←','W / SPACE','D / →'][i]:['A / ←','W / ↑','D / →'][i];button.disabled=!can||own?.choiceLocked===true;}}
};
function arcadeExtraInstall(){
 const installFilters=()=>{if(!arcadeDialog||document.getElementById('arcadeFamilyFilters'))return;const grid=$('arcadeGameCards'),bar=el('div','extra-family-filters');bar.id='arcadeFamilyFilters';bar.setAttribute('aria-label','연습 게임 종류');for(const [family,label]of [['all','전체'],['action','액션'],['race','경주'],['sports','스포츠'],['brain','눈치·두뇌']]){const count=Object.values(arcadeGames).filter(g=>family==='all'||g.family===family).length,button=el('button','tiny-btn',label+' '+count);button.type='button';button.setAttribute('aria-pressed',String(family==='all'));button.addEventListener('click',()=>{for(const child of bar.children)child.setAttribute('aria-pressed',String(child===button));for(const card of grid.children)card.hidden=family!=='all'&&arcadeGames[card.dataset.game]?.family!==family;});bar.append(button);}grid.before(bar);};
 const ensureBase=arcadeEnsureUI;arcadeEnsureUI=function(){const result=ensureBase();installFilters();return result;};

 document.addEventListener('keydown',event=>{
  const reaction=arcadeState?.world?.game==='reaction',reactionPad=reaction&&event.target?.closest?.('[data-extra-choice]');
  if(!arcadeDialog?.open||!arcadeState?.world||arcadeGames[arcadeState.world.game]?.controls!=='choices'||event.target?.matches?.('input,textarea,select,[contenteditable="true"]')||!reactionPad&&event.target?.closest?.('button:not([data-arcade-control]),[data-device-ui-control]'))return;
  const index=['KeyA','ArrowLeft'].includes(event.code)?0:['KeyW','ArrowUp'].includes(event.code)||reaction&&['Space','KeyF'].includes(event.code)?1:['KeyD','ArrowRight'].includes(event.code)?2:-1;
  if(index<0)return;event.preventDefault();event.stopImmediatePropagation();if(event.repeat)return;arcadeExtraEnsureControls();const button=arcadeExtraChoices?.children[index];if(button&&!button.disabled)arcadeInput(['hit','jump','dash'][index],true);
 },true);
}
/* END_ARCADE_EXTRA_CONTROLS_V1 */

/* ARCADE_CONTROLLER_V1 */
const arcadeEngine=createArcadeEngine(),arcadeGameKeys=typeof arcadeGames==='object'&&arcadeGames?Object.keys(arcadeGames):['sneak','dodge','coins','stamp','runner'];
let arcadeState=null,arcadeDemo=false,arcadeInputSeq=0,arcadeLastPublish=0,arcadePumpAt=0,arcadeAccum=0,arcadePrevious=null,arcadeReceivedAt=0,arcadeLastWorldId='',arcadeBotAt=0,arcadeHeartbeatAt=0;
const arcadeBotSeq=new Map(),arcadeBotBrains=new Map();
let arcadeClock=null,arcadeClockOffset=0,arcadePauseAt=null,arcadeFolded=false;
const arcadeFixedStepMs=16,arcadeMaxCatchupSteps=64;
function arcadeStartClock(w,now){const countdown=w.phase==='countdown'?w.countdown*1000:0;arcadeClock={worldId:w.id,countdownEnd:now+countdown-w.elapsed*1000,end:now+countdown+(w.duration-w.elapsed)*1000};arcadePumpAt=now;arcadeAccum=0;}
function arcadeServerNow(){return Date.now()+(arcadeHost()?0:arcadeClockOffset);}
function arcadeIsPaused(s=arcadeState){return !!s?.pausedBy?.length;}
function arcadeTimelineNow(){return arcadeIsPaused()?arcadeState.pausedAt:arcadeServerNow();}
function arcadeClearPause(s=arcadeState){if(!s)return;if(arcadeIsPaused(s))s.pauseSeq=(s.pauseSeq||0)+1;s.pausedBy=[];s.pausedAt=null;arcadePauseAt=null;}
// Only the host owns the clock. Each participant releases their own fold request.
function arcadeChangePause(ids,now=performance.now(),publish=true){
 const s=arcadeState;if(!s||s.purpose!=='lunch'||!['round','between'].includes(s.phase))return false;
 const previous=s.pausedBy||[];if(ids.length===previous.length&&ids.every(id=>previous.includes(id)))return false;
 if(!previous.length&&ids.length){
  arcadeAdvanceWorld(now);arcadeResolveRound();if(arcadeState!==s||!['round','between'].includes(s.phase))return false;
  arcadePauseAt=now;s.pausedAt=Date.now();arcadeEngine.release(s.world);
 }else if(previous.length&&!ids.length){
  const duration=Math.max(0,now-arcadePauseAt);
  if(arcadeClock?.worldId===s.world?.id){arcadeClock.countdownEnd+=duration;arcadeClock.end+=duration;}
  if(s.phase==='between')s.nextAt+=Date.now()-s.pausedAt;
  arcadePumpAt=now;arcadePauseAt=null;s.pausedAt=null;arcadeEngine.release(s.world);
 }
 s.pausedBy=[...ids];s.pauseSeq=(s.pauseSeq||0)+1;arcadePrevious=null;
 if(publish){if(typeof arcadeClearKeys==='function')arcadeClearKeys();arcadeRenderSafe();arcadePublish(true);}return true;
}
function arcadeSetFolded(folded){
 const s=arcadeState,self=arcadeSelf(),member=s?.members.find(m=>m.id===self);
 if(s?.purpose!=='lunch'||!['round','between'].includes(s.phase)||member?.response!=='join'||member.left||member.forfeited)return false;
 if(arcadeFolded===folded&&(folded||!s.pausedBy?.includes(self)))return false;
 arcadeFolded=folded;if(typeof arcadeClearKeys==='function')arcadeClearKeys();
 return arcadeSend({t:'arcadeFold',gameId:s.id,folded});
}
function arcadeClockSeconds(w){if(!w)return 0;if(arcadeHost()&&arcadeClock?.worldId===w.id){const deadline=w.phase==='countdown'?arcadeClock.countdownEnd:arcadeClock.end;return Math.max(0,(deadline-(arcadeIsPaused()?arcadePauseAt:performance.now()))/1000);}const clock=arcadeState?.clock;if(clock?.worldId===w.id)return Math.max(0,((w.phase==='countdown'?clock.countdownEndAt:clock.endAt)-arcadeTimelineNow())/1000);return w.phase==='countdown'?Math.max(0,w.countdown):Math.max(0,w.duration-w.elapsed);}
function arcadeAdvanceWorld(now){
 const s=arcadeState,w=s?.world;if(!arcadeHost()||arcadeIsPaused(s)||s?.phase!=='round'||!w||w.phase==='done'||!Number.isFinite(now))return 0;if(arcadeClock?.worldId!==w.id)arcadeStartClock(w,now);
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
function arcadeGetState(){if(arcadeDemo||!netIsActive()||!arcadeState)return null;const state=arcadeClone(arcadeState);if(netIsHost()){state.serverNow=Date.now();if(arcadeClock?.worldId===state.world?.id){const now=arcadeIsPaused()?arcadePauseAt:performance.now(),wall=arcadeIsPaused()?state.pausedAt:state.serverNow;state.clock={worldId:state.world.id,countdownEndAt:wall+arcadeClock.countdownEnd-now,endAt:wall+arcadeClock.end-now};}}return state;}
function arcadePublish(force=false){if(arcadeDemo||!netIsHost()||netApplying)return;const n=performance.now();if(!force&&n-arcadeLastPublish<80)return;arcadeLastPublish=n;netPublish();}
function arcadeSend(cmd){if(arcadeDemo)return arcadeHandle(arcadeSelf(),cmd);return netRoom.send(cmd);}
function arcadeInput(action,held){if(!arcadeState?.world||arcadeIsPaused())return false;return arcadeSend({t:'arcadeInput',gameId:arcadeState.id,worldId:arcadeState.world.id,seq:++arcadeInputSeq,action,held});}
function arcadeCancel(){arcadeState=null;arcadeDemo=false;arcadePrevious=null;arcadeLastWorldId='';arcadeRandomBag=null;arcadeClock=null;arcadeClockOffset=0;arcadePauseAt=null;arcadeFolded=false;arcadeAccum=0;arcadeBotSeq.clear();arcadeBotBrains.clear();if(typeof arcadeClearKeys==='function')arcadeClearKeys();if(typeof arcadeDialog!=='undefined')arcadeDialog?.close();arcadeRenderSafe();}
function arcadeClose(){
 if(!arcadeState){if(typeof arcadeDialog!=='undefined')arcadeDialog?.close();return;}
 if(arcadeDemo){arcadeCancel();return;}
 const s=arcadeState,m=s.members.find(m=>m.id===arcadeSelf());
 if(s.purpose==='lunch'){arcadeSetFolded(true);if(typeof arcadeClearKeys==='function')arcadeClearKeys();if(typeof arcadeDialog!=='undefined')arcadeDialog?.close();if(typeof menuTournamentRenderBackground==='function')menuTournamentRenderBackground();return;}
 if(m?.response==='pending')arcadeSend({t:'arcadeReply',gameId:s.id,response:'pass'});
 if(['round','between'].includes(s.phase)&&s.activeIds.includes(arcadeSelf()))arcadeSend({t:'arcadeForfeit',gameId:s.id});
 if(typeof arcadeClearKeys==='function')arcadeClearKeys();if(typeof arcadeDialog!=='undefined')arcadeDialog?.close();
}
function arcadeMakeState(mode,game,members){const s={id:'arcade_'+Date.now()+'_'+rand(1000000),roomCode:arcadeDemo?'practice':String(netRoom.code||''),context:arcadeBaseContext(),phase:'invite',purpose:'arcade',mode,chosen:game,members,activeIds:[],round:0,history:[],world:null,championIds:[],nextAt:0,pausedBy:[],pausedAt:null,pauseSeq:0,lastGame:'',tiebreakIds:[],safeIds:[],notice:''};if(mode==='tournament')arcadeInitPoints(s);return s;}
function arcadeIsPoints(s=arcadeState){return s?.mode==='tournament'&&s.format==='points';}
function arcadePointsSync(s){const present=arcadeDemo||!netIsActive()?null:new Set(netMembers().map(m=>m.id));s.activeIds=s.members.filter(m=>m.response==='join'&&!m.left&&!m.forfeited&&(!present||present.has(m.id))).map(m=>m.id);s.safeIds=[];s.tiebreakIds=s.tiebreakIds.filter(id=>s.activeIds.includes(id));return s.activeIds;}
function arcadeInitPoints(s=arcadeState){if(!s||s.mode!=='tournament')return false;if(s.format==='points')return true;s.format='points';s.pointRoundLimit=5;s.pointRounds=0;s.totalPoints=Object.fromEntries(s.members.map(m=>[m.id,0]));s.pointsStage='regular';s.pointsTiebreaks=0;s.tieReason='';s.representativeId='';s.tiebreakIds=[];arcadePointsSync(s);return true;}
function arcadePointsStandings(s=arcadeState){
 if(!arcadeIsPoints(s))return [];const active=new Set(s.activeIds),rows=s.members.filter(m=>m.response==='join').map((member,index)=>({id:member.id,name:member.name,department:member.department,member,index,points:s.totalPoints?.[member.id]||0,rank:null,left:!!member.left,forfeited:!!member.forfeited,eligible:active.has(member.id)})).sort((a,b)=>Number(b.eligible)-Number(a.eligible)||b.points-a.points||a.index-b.index);
 let rank=0,last=null;for(const [index,row]of rows.entries())if(row.eligible){if(row.points!==last)rank=index+1;row.rank=rank;last=row.points;}return rows;
}
function arcadePointsFinish(){
 const s=arcadeState;if(!arcadeIsPoints(s))return false;if(s.phase==='done')return true;arcadePointsSync(s);const standings=arcadePointsStandings(s),leaders=standings.filter(p=>p.rank===1),winner=leaders.length?leaders[leaders.length===1?0:rand(leaders.length)]:null;s.phase='done';arcadeClearPause(s);s.nextAt=0;s.tiebreakIds=[];s.safeIds=[];s.championIds=leaders.map(p=>p.id);s.representativeId=winner?.id||'';s.tieReason=leaders.length>1?'누적 점수 공동 1위 · 대표 메뉴 추첨':'';s.notice=winner?(leaders.length>1?leaders.map(p=>p.name).join(' · ')+' 님 공동 1위! 누적 '+winner.points+'점 · 순위는 함께 유지하고, 대표 메뉴만 한 번 추첨했어요.':winner.name+' 님 누적 '+winner.points+'점으로 최종 1위!')+(s.pointRounds<s.pointRoundLimit?' · 참가자 기권으로 경기를 마쳤어요.':''):'남은 참가자가 없어 점수전을 마쳤어요.';
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
function arcadeRandomGame(previous,count){const points=arcadeIsPoints(),pool=arcadeGamePool(count).filter(key=>!points||key!=='brawl'),session=arcadeState?.id||'',signature=pool.join('|');if(!arcadeRandomBag||arcadeRandomBag.session!==session||arcadeRandomBag.signature!==signature)arcadeRandomBag={session,signature,remaining:[...pool]};if(!arcadeRandomBag.remaining.length)arcadeRandomBag.remaining=[...pool];const played=new Set(points?(arcadeState.history||[]).map(round=>round.game):[]);let choices=arcadeRandomBag.remaining.filter(k=>k!==previous&&!played.has(k));if(!choices.length)choices=pool.filter(k=>!played.has(k));if(!choices.length)choices=[...pool];const previousFamily=typeof arcadeGames==='object'?arcadeGames[previous]?.family:'';if(previousFamily){const otherFamilies=choices.filter(key=>arcadeGames[key]?.family!==previousFamily);if(otherFamilies.length)choices=otherFamilies;}const game=choices[rand(choices.length)];arcadeRandomBag.remaining=arcadeRandomBag.remaining.filter(k=>k!==game);return game;}
function arcadeStartWorld(){
 const s=arcadeState;if(!s||!arcadeHost()||arcadeIsPaused(s)||!['invite','between'].includes(s.phase))return false;arcadeInitPoints(s);if(arcadeIsPoints(s))arcadePointsSync(s);const ids=(s.tiebreakIds.length?s.tiebreakIds:s.activeIds).filter(id=>s.activeIds.includes(id));
 if(ids.length<2){arcadeFinishTournament();return;}const finale=arcadeIsPoints(s)&&s.pointRounds===s.pointRoundLimit-1,game=s.mode==='single'?s.chosen:finale?'brawl':arcadeRandomGame(s.lastGame,ids.length);
 s.round++;s.lastGame=game;s.phase='round';s.nextAt=0;s.world=arcadeEngine.create({id:s.id+':'+s.round,game,participants:ids.map(id=>s.members.find(m=>m.id===id)),seed:rand(0xffffffff)});
 if(s.tiebreakIds.length)s.world.duration=Math.min(s.world.duration,16);s.world.meta.tiebreak=s.tiebreakIds.length>0;s.world.meta.safeIds=[...s.safeIds];if(arcadeIsPoints(s)){s.world.meta.pointsStage='regular';s.world.meta.pointsRound=s.pointRounds+1;s.world.meta.partyRespawn=false;s.world.meta.finale=finale;if(finale){s.world.duration=30;s.world.meta.notice='피날레 대난투! 체력 100 · 쓰러지면 이번 판 탈락 · 생존 순위로 점수를 받아요!';}}
 arcadeInputSeq=0;arcadeLastWorldId=s.world.id;arcadeBotSeq.clear();arcadeBotBrains.clear();arcadeBotAt=0;arcadeStartClock(s.world,performance.now());arcadePrevious=null;const poolLabel=s.mode==='single'?'선택한 게임 · 단판 승부':finale?'피날레 대난투 · 최대 30초':ids.length===2?'2인전 전용 '+arcadeGamePool(2).filter(k=>k!=='brawl').length+'종':'파티전 '+arcadeGamePool(ids.length).filter(k=>k!=='brawl').length+'종';s.notice=poolLabel+' · '+(arcadeIsPoints(s)?'전원 참여 '+(s.pointRounds+1)+'/'+s.pointRoundLimit+'경기 · '+(finale?'다른 경기와 같은 순위 점수, 마지막까지 함께!':'랜덤 4판 뒤 대난투 · 이번 판 탈락해도 다음 게임에 다시 참여해요.'):s.tiebreakIds.length?'최하위 동점! 동점자끼리 재경기 · 나머지는 다음 라운드 진출':'매판 다른 게임! 이번 판에서 살아남으세요.');arcadeRenderSafe();arcadePublish(true);
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
 if(s.pausedBy?.includes(id))arcadeChangePause(s.pausedBy.filter(value=>value!==id),performance.now(),false);
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
 if(cmd.t==='arcadeFold'){
  if(typeof cmd.folded==='boolean'&&s.purpose==='lunch'&&['round','between'].includes(s.phase)&&m.response==='join'&&!m.left&&!m.forfeited&&s.activeIds.includes(senderId)){
   const ids=s.pausedBy||[];arcadeChangePause(cmd.folded?[...new Set([...ids,senderId])]:ids.filter(id=>id!==senderId));
  }return true;
 }
 if(cmd.t==='arcadeCancel'&&senderId===arcadeSelf()){if(s.purpose==='lunch'&&typeof netCancelMenuTournament==='function')netCancelMenuTournament();else{arcadeCancel();if(netIsHost())netPublish();}return true;}
 if(cmd.t==='arcadeReply'&&s.phase==='invite'&&['join','pass'].includes(cmd.response)&&!m.left){m.response=cmd.response;arcadeRenderSafe();arcadePublish(true);arcadeMaybeStart();return true;}
 if(cmd.t==='arcadeInput'&&!arcadeIsPaused(s)&&s.phase==='round'&&s.activeIds.includes(senderId)&&s.world&&cmd.worldId===s.world.id){const now=performance.now();arcadeAdvanceWorld(now);arcadeResolveRound();if(arcadeState!==s||s.phase!=='round'||cmd.worldId!==s.world?.id)return true;if(arcadeEngine.input(s.world,senderId,cmd,now)){arcadeRenderSafe();arcadePublish(false);}return true;}
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
 const w=data.world;if(w&&(w.meta.partyRespawn!==false||w.meta.tiebreak!==false||w.meta.pointsStage!=='regular'||w.meta.pointsRound!==regular+Number(data.phase==='round')||eligible.some(id=>!w.players.some(p=>p.id===id))||w.players.some(p=>!joined.has(p.id))||data.phase!=='round'&&w.phase!=='done'))return false;
 if(data.phase==='done'){
  if(regular<5&&eligible.length>1)return false;const best=eligible.length?Math.max(...eligible.map(id=>totals[id])):null,leaders=eligible.filter(id=>totals[id]===best);if(data.championIds.length!==leaders.length||leaders.some(id=>!data.championIds.includes(id))||(leaders.length?!leaders.includes(data.representativeId):data.representativeId!==''))return false;
  if(data.tieReason!==(leaders.length>1?'누적 점수 공동 1위 · 대표 메뉴 추첨':''))return false;
 }else if(data.championIds.length||data.representativeId||data.tieReason)return false;
 return true;
}
function arcadeValidatePause(data){
 if(data.pausedBy===undefined&&data.pausedAt===undefined&&data.pauseSeq===undefined)return true;
 if(!Array.isArray(data.pausedBy)||data.pausedBy.length>8||new Set(data.pausedBy).size!==data.pausedBy.length||!Number.isSafeInteger(data.pauseSeq)||data.pauseSeq<0)return false;
 if(!data.pausedBy.length)return data.pausedAt===null;
 return data.purpose==='lunch'&&['round','between'].includes(data.phase)&&Number.isFinite(data.pausedAt)&&data.pausedAt>=0&&data.pauseSeq>0&&data.pausedBy.every(id=>data.activeIds.includes(id)&&data.members.some(m=>m.id===id&&m.response==='join'&&!m.left&&!m.forfeited));
}
function arcadeValidate(data){
 if(!data||!['arcade','lunch'].includes(data.purpose||'arcade')||typeof data.id!=='string'||data.id.length>100||data.roomCode!==String(netRoom.code||'')||data.context!==arcadeBaseContext()||!['invite','round','between','done'].includes(data.phase)||!['single','tournament'].includes(data.mode)||!arcadeGameKeys.includes(data.chosen)||!Array.isArray(data.members)||data.members.length<2||data.members.length>8)return false;
 if(data.members.some(m=>!m||typeof m.id!=='string'||typeof m.name!=='string'||!['pending','join','pass'].includes(m.response))||new Set(data.members.map(m=>m.id)).size!==data.members.length)return false;
 if(data.purpose==='lunch'&&(data.mode!=='tournament'||netPhase!=='menuTournament'||data.context!=='menuTournament:setup'||data.members.length!==netSpec?.participants?.length||data.members.some(m=>m.response!=='join'||typeof m.menu!=='string'||!validName(m.menu)||!netSpec?.participants?.some(p=>p.id===m.id&&p.menu===m.menu))))return false;
 const known=new Set(data.members.map(m=>m.id));for(const k of ['activeIds','championIds','tiebreakIds','safeIds'])if(!Array.isArray(data[k])||data[k].length>8||new Set(data[k]).size!==data[k].length||data[k].some(id=>!known.has(id)))return false;
 if(!Number.isSafeInteger(data.round)||data.round<0||!Number.isFinite(data.nextAt)||!Array.isArray(data.history)||data.history.length>60||typeof data.notice!=='string')return false;
 if(!arcadeValidatePause(data))return false;
 const w=data.world;if(!w)return data.phase==='invite'&&arcadeValidatePoints(data);if(typeof w.id!=='string'||!arcadeGameKeys.includes(w.game)||!['countdown','play','done'].includes(w.phase)||!Number.isSafeInteger(w.seq)||w.seq<0||!Number.isFinite(w.elapsed)||w.elapsed<0||!Number.isFinite(w.countdown)||!Number.isFinite(w.duration)||w.duration<=0||w.duration>60||!Array.isArray(w.players)||w.players.length<2||w.players.length>8||!Array.isArray(w.objects)||w.objects.length>220||!w.meta||typeof w.meta!=='object')return false;
 if(data.serverNow!==undefined&&(!Number.isFinite(data.serverNow)||data.serverNow<0))return false;if(data.clock!==undefined&&(!data.clock||data.clock.worldId!==w.id||!Number.isFinite(data.clock.countdownEndAt)||!Number.isFinite(data.clock.endAt)||data.clock.countdownEndAt<0||data.clock.endAt<data.clock.countdownEndAt||Math.abs(data.clock.endAt-data.clock.countdownEndAt-w.duration*1000)>2||!Number.isFinite(data.serverNow)))return false;
 if(arcadeSurvivalGame(w.game)?w.meta.roundSurvival!==true:w.meta.roundSurvival===true)return false;
 if(w.players.some(p=>!p||!known.has(p.id)||typeof p.name!=='string'||!Number.isInteger(p.index)||p.index<0||p.index>7||['x','y','score','health','stunUntil','actionUntil'].some(k=>!Number.isFinite(p[k]))||p.x< -100||p.x>800||p.y< -100||p.y>560||!Number.isInteger(p.health)||p.health<0||p.health>3||typeof p.eliminated!=='boolean'||typeof p.forfeited!=='boolean')||new Set(w.players.map(p=>p.id)).size!==w.players.length)return false;
 if(!Array.isArray(w.winnerIds)||w.winnerIds.some(id=>!w.players.some(p=>p.id===id))||!Array.isArray(w.ranking)||w.ranking.some(p=>!p||!w.players.some(q=>q.id===p.id)||!Number.isFinite(p.score)||!Number.isInteger(p.rank)))return false;
 const finite=(v,depth=0)=>depth>7?false:typeof v==='number'?Number.isFinite(v):Array.isArray(v)?v.length<=220&&v.every(x=>finite(x,depth+1)):v&&typeof v==='object'?Object.keys(v).length<=40&&Object.values(v).every(x=>finite(x,depth+1)):v===null||['string','boolean'].includes(typeof v);
 return finite(w.objects)&&finite(w.meta)&&finite(w.players)&&data.history.every(h=>h&&Number.isSafeInteger(h.round)&&arcadeGameKeys.includes(h.game)&&Array.isArray(h.results)&&h.results.length<=8&&h.results.every(r=>r&&known.has(r.id)&&Number.isFinite(r.score)&&Number.isInteger(r.rank))&&Array.isArray(h.outIds)&&h.outIds.every(id=>known.has(id)))&&arcadeValidatePoints(data);
}
function arcadeReceive(data){
 if(arcadeDemo||netIsHost())return;if(!data){if(arcadeState)arcadeCancel();return;}if(!arcadeValidate(data))return;const fresh=arcadeState?.id!==data.id,newWorld=arcadeState?.world?.id!==data.world?.id;
 if(!fresh&&((data.pauseSeq||0)<(arcadeState.pauseSeq||0)||data.round<arcadeState.round||!newWorld&&data.world?.seq<arcadeState.world?.seq||arcadeIsPoints(arcadeState)&&(data.pointRounds<arcadeState.pointRounds||data.pointsTiebreaks<arcadeState.pointsTiebreaks)))return;
 const pauseChanged=fresh||(data.pauseSeq||0)!==(arcadeState.pauseSeq||0);arcadePrevious=!fresh&&!pauseChanged&&arcadeState?.world?arcadeState.world:null;arcadeState=arcadeClone(data);arcadeReceivedAt=performance.now();if(Number.isFinite(data.serverNow))arcadeClockOffset=data.serverNow-Date.now();else if(fresh)arcadeClockOffset=0;if(fresh||newWorld){arcadeInputSeq=0;arcadeLastWorldId=data.world?.id||'';}if(fresh)arcadeFolded=false;if(fresh||newWorld||pauseChanged){if(typeof arcadeClearKeys==='function')arcadeClearKeys();}
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
 if(arcadeIsPaused(s))return;
 if(s.phase==='between'&&Date.now()>=s.nextAt)arcadeStartWorld();
 if(s.phase==='round'&&s.world){arcadeAdvanceWorld(now);if(arcadeState!==s)return;
  if(arcadeDemo&&now-arcadeBotAt>=180&&s.world.phase==='play'){arcadeBotAt=now;for(const p of s.world.players)if(p.id!==arcadeSelf()&&!p.eliminated&&!p.forfeited){const v=arcadeNormalBot(s.world,p);let seq=arcadeBotSeq.get(p.id)||0;arcadeEngine.input(s.world,p.id,{seq:++seq,action:'sync',held:v.held||[]},now);if(v.action)arcadeEngine.input(s.world,p.id,{seq:++seq,action:v.action},now);arcadeBotSeq.set(p.id,seq);}}
  arcadeResolveRound();arcadePublish(false);
 }
}
setInterval(()=>{const now=performance.now();arcadeHousekeep(now);if(!arcadeIsPaused()&&arcadeState?.phase==='round'&&arcadeState.world?.phase==='play'&&now-arcadeHeartbeatAt>=200){arcadeHeartbeatAt=now;arcadeInput('sync',typeof arcadeHeld==='function'?arcadeHeld():[]);}if(arcadeState?.phase==='between')arcadeRenderSafe();},32);
netRoom.onDisconnect(e=>{if(e.self||e.hostLost)arcadeCancel();});
/* END_ARCADE_CONTROLLER_V1 */


/* MENU_TOURNAMENT_V1 */
const menuTournamentSavedIds=new Set();
function menuTournamentHideView(){const v=$('menuTournamentView');if(v)v.hidden=true;}
function netEnterMenuTournament(){
 if(typeof menuTournamentEnsureView==='function')menuTournamentEnsureView();
 if(typeof cancelActionDuel==='function')cancelActionDuel();if(typeof deptCancel==='function')deptCancel();
 mode='menuTournament';for(const id of ['setupView','raceView','resultView','duelView']){const node=$(id);if(node)node.hidden=true;}
 const view=$('menuTournamentView');if(view)view.hidden=false;setStep(2);playLayout(true);
 const status=$('dossierStatus');if(status)status.textContent='점심 파티 리그 · 랜덤 4판 + 전원 대난투 1판';
 if(typeof menuTournamentRenderBackground==='function')menuTournamentRenderBackground();
}
function netBeginMenuTournament(){
 if(!netIsHost()||netPhase!=='setup'||arcadeBusy())return false;const roster=netMembers();
 if(roster.length<2||roster.length>8||roster.some(m=>!netReady[m.id]||!netCanReady(m.id)))return false;
 const members=roster.map(m=>({id:m.id,name:m.name,department:netDepartment(m.id),menu:netPicks[m.id][0].trim().normalize('NFC'),response:'join'}));
 arcadeCancel();arcadeDemo=false;netPhase='menuTournament';result=null;netDuelMeta=null;
 arcadeState=arcadeMakeState('tournament','coins',members);arcadeState.purpose='lunch';arcadeState.context='menuTournament:setup';arcadeState.activeIds=members.map(m=>m.id);if(typeof arcadeInitPoints==='function')arcadeInitPoints(arcadeState);arcadeState.notice='랜덤 4판 뒤 전원 30초 대난투! 다섯 판 모두 같은 순위 점수를 합산해요.';
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



/* MENU_TOURNAMENT_UI_V1 */
function arcadeDisplayName(p,s=arcadeState){return s?.purpose==='lunch'?(s.members.find(m=>m.id===p.id)?.menu||p.name):p.name;}
function menuTournamentEnsureView(){
 if($('menuTournamentView'))return;
 const view=el('section','menu-tournament-view');view.id='menuTournamentView';view.hidden=true;view.setAttribute('aria-label','전원 누적 점수전 진행');
 view.innerHTML='<span class="menu-tournament-kicker">FIVE ROUNDS · EVERYONE PLAYS</span><h2>다 같이 5판, 끝까지 함께!</h2><p>매판 게임은 랜덤! 다섯 판의 순위 점수를 합산해 최종 순위를 정해요.<br>동점은 공동 순위, 점심 메뉴는 공동 1위 중 추첨합니다.</p><div class="menu-tournament-progress"><strong id="menuTournamentRound"></strong><span id="menuTournamentCount"></span></div><div id="menuTournamentCandidates" class="menu-tournament-candidates"></div><button id="menuTournamentResumeBtn" class="btn primary" type="button">경기 화면 열기 →</button><small id="menuTournamentPauseNote" role="status">경기 화면을 접으면 모두 일시정지해요. 다시 열면 남은 시간부터 이어집니다.</small>';
 $('game').append(view);$('menuTournamentResumeBtn').addEventListener('click',()=>{if(arcadeState?.purpose==='lunch')arcadeOpen();});
}
function menuTournamentRenderBackground(){
 const s=arcadeState;menuTournamentEnsureView();const view=$('menuTournamentView');view.hidden=netPhase!=='menuTournament';if(view.hidden||!s||s.purpose!=='lunch')return;
 const key=s.id+':'+s.round+':'+s.phase+':'+s.activeIds.join(',')+':'+s.lastGame+':'+JSON.stringify(s.totalPoints)+':'+(s.pauseSeq||0);if(view.dataset.key===key)return;view.dataset.key=key;
 arcadeSetText('menuTournamentRound',('ROUND '+Math.min(s.pointRoundLimit||5,(s.pointRounds||0)+1)+' / '+(s.pointRoundLimit||5))+' · '+(arcadeGames[s.world?.game]?.name||'랜덤 게임'));
 arcadeSetText('menuTournamentCount',s.activeIds.length+'명 함께 참여 · '+(arcadeIsPaused(s)?'일시정지':'누적 점수'));
 const paused=arcadeIsPaused(s),names=(s.pausedBy||[]).map(id=>s.members.find(m=>m.id===id)?.name||'참가자').join(' · '),ownPause=s.pausedBy?.includes(arcadeSelf());
 arcadeSetText('menuTournamentResumeBtn',ownPause?'경기 이어하기 →':paused?'일시정지된 경기 보기 →':'경기 화면 열기 →');
 arcadeSetText('menuTournamentPauseNote',paused?names+' 님이 경기 화면을 접었어요. 모두 다시 열면 남은 시간부터 이어져요.':'경기 화면을 접으면 모두 일시정지해요. 다시 열면 남은 시간부터 이어집니다.');
 const list=$('menuTournamentCandidates');list.replaceChildren();for(const m of [...s.members].sort((a,b)=>(s.totalPoints?.[b.id]||0)-(s.totalPoints?.[a.id]||0))){const card=el('div','menu-tournament-candidate');card.classList.toggle('is-out',m.left||m.forfeited);card.append(el('span','',actionFood(m.menu)),el('b','',m.menu),el('small','',m.name+(m.id===arcadeSelf()?' · 내 메뉴':'')),el('strong','',m.left?'퇴장':(s.totalPoints?.[m.id]||0)+'점'));list.append(card);}
}
function netRenderMenuTournament(){menuTournamentRenderBackground();}
function scoreResultStandings(value=result){
 if(Array.isArray(value?.scoreStandings))return value.scoreStandings;
 const rows=(value?.nominations||[]).map(n=>({id:n.id,name:n.person,menu:n.menus?.[0]||'',points:value?.leagueScores?.[n.id]||0})).sort((a,b)=>b.points-a.points);let rank=0,last=null;return rows.map((row,index)=>{if(row.points!==last)rank=index+1;last=row.points;return {...row,rank};});
}
function scoreResultChampionNames(value=result){const ids=value?.scoreChampionIds||[];return scoreResultStandings(value).filter(row=>ids.includes(row.id)).map(row=>row.name);}
const menuTournamentResultBase=renderResult;
renderResult=function(...args){
 const out=menuTournamentResultBase(...args);$('resultView').dataset.lunchFlow=String(!!result?.tournamentHistory);const heading=$('resultView').querySelector('.result-details h3');if(heading)heading.textContent=result?.leagueFormat==='points'?'최종 점수와 순위를 확인해주세요':result?.provisional?'우승 메뉴를 확인해주세요':'오늘 점심, 이걸로 확정!';$('resultNominations').hidden=result?.leagueFormat==='points';$('menuTournamentView')&&($('menuTournamentView').hidden=true);
 if($('menuTournamentResultLedger'))$('menuTournamentResultLedger').hidden=true;
 if(result?.source!=='tournament'&&!result?.tournamentHistory)return out;
 $('objectBtn').hidden=true;$('duelVerdict').hidden=false;$('duelVerdict').textContent='전원 '+(result.leagueRounds||5)+'판 누적 점수전 완료'+(result.duelCount?' · 메뉴 이의전 '+result.duelCount+'회 · 최종 순위 유지':'')+' · 현재 점심 메뉴 '+result.menu;
 let ledger=$('menuTournamentResultLedger');if(!ledger){ledger=el('section','menu-tournament-ledger');ledger.id='menuTournamentResultLedger';$('resultNominations').before(ledger);}ledger.hidden=false;ledger.replaceChildren(el('b','','우승 메뉴가 올라온 과정'));
 if(result.leagueFormat==='points'){
  ledger.firstChild.textContent='누적 점수로 결정된 최종 순위';const standings=scoreResultStandings(),table=el('table','score-result-table');table.setAttribute('aria-label',(result.leagueRounds||5)+'판 최종 누적 점수 순위');const head=el('thead'),header=el('tr');for(const label of ['순위','참가자 · 메뉴','점수']){const th=el('th','',label);th.scope='col';header.append(th);}head.append(header);const body=el('tbody');for(const row of standings){const shared=row.rank!==null&&standings.filter(other=>other.rank===row.rank).length>1,line=el('tr',row.rank===1?'score-first':''),person=el('td');person.append(el('strong','',row.name),el('small','',row.menu));line.append(el('td','',row.left?'퇴장':row.forfeited?'기권':(shared?'공동 ':'')+row.rank+'위'),person,el('td','',row.points+'점'));body.append(line);}table.append(head,body);ledger.append(table);
  if(result.tieReason)ledger.append(el('p','',result.tieReason+' · 공동 순위는 그대로 유지해요.'));
  ledger.append(el('p','','메뉴 이의전은 점심 메뉴만 바꿀 수 있어요. 이 최종 점수와 순위는 유지됩니다.'));
 }else for(const h of result.tournamentHistory||[]){const names=(h.outIds||[]).map(id=>{const m=result.nominations.find(n=>n.id===id);return m?.menus?.[0]||m?.person||'메뉴';});ledger.append(el('p','','R'+h.round+' · '+(arcadeGames[h.game]?.name||'랜덤 게임')+' → '+(names.length?names.join(', ')+' 탈락':'동점 재경기')));}
 return out;
};
/* END_MENU_TOURNAMENT_UI_V1 */

const menuTournamentSetupLabels=renderSetup;
renderSetup=function(){const out=menuTournamentSetupLabels.apply(this,arguments);const desc=$('netPassiveDesc');if(desc)desc.textContent='다섯 판을 함께할 내 캐릭터예요. 누적 점수로 최종 순위를 정해요.';return out;};
const menuTournamentTrayButtons=trayUpdateButtons;
trayUpdateButtons=function(){menuTournamentTrayButtons();for(const id of ['trayRoomBtn','trayResultBtn']){const b=$(id);if(b&&netPhase!=='result'||b&&result?.tournamentHistory)b.hidden=true;}};

/* COFFEE_DELIVERY_V1 */
let deliveryState=null,deliveryDeadline=0,deliveryClockOffset=0,deliverySendSeq=0,deliveryUiId='',deliveryPanel=null,deliveryRosterKey='',deliveryOrdersKey='',deliveryScrolledId='',deliveryTargetsKey='';
let deliveryStageActive=false,deliveryStageHome=null,deliveryStageSibling=null,deliveryStageReturnFocus=null,deliveryStageFocusKey='',deliveryStageBackdrop=null;
const deliveryStageInert=[];
const deliverySeen=new Map(),deliveryDrinks=['아이스 아메리카노','따뜻한 아메리카노','카페라테','디카페인','차'];
function deliveryClone(v){return v?JSON.parse(JSON.stringify(v)):null;}
function deliveryDrink(value){if(typeof value!=='string')return null;const s=value.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();return s&&Array.from(s).length<=20?s:null;}
function deliveryCurrent(){return !!deliveryState&&netIsActive()&&deliveryState.roomCode===String(netRoom.code||'')&&result?.id===deliveryState.roundId;}
function deliveryCancel(){deliverySetStage(false);deliveryState=null;deliveryDeadline=0;deliveryClockOffset=0;deliverySendSeq=0;deliveryUiId='';deliverySeen.clear();deliveryRosterKey='';deliveryOrdersKey='';deliveryScrolledId='';deliveryTargetsKey='';if(deliveryPanel)deliveryPanel.hidden=true;}
function deliveryPublish(){if(netIsHost()&&!netApplying)netPublish();}
function deliveryChanged(){if(deliveryState)deliveryState.seq++;deliveryRender();deliveryPublish();}
function deliveryCandidates(){return deliveryState?.members.filter(m=>m.response==='join'&&!m.left)||[];}
function deliveryStart(roundId,members=netMembers()){
 if(!netIsHost()||!netIsActive()||typeof roundId!=='string'||result?.id!==roundId)return false;
 if(deliveryCurrent()&&deliveryState.roundId===roundId)return true;
 const present=new Set(netMembers().map(m=>m.id)),list=(Array.isArray(members)?members:[]).filter(m=>m&&typeof m.id==='string'&&typeof m.name==='string'&&present.has(m.id)).slice(0,8);
 if(!list.length||new Set(list.map(m=>m.id)).size!==list.length)return false;
 deliveryCancel();deliveryState={id:'delivery_'+Date.now()+'_'+rand(1000000),roundId,roomCode:String(netRoom.code||''),seq:0,phase:'invite',members:list.map(m=>({id:m.id,name:m.name,response:'pending',drink:'',left:false})),winnerId:'',holderId:'',previousHolderId:'',startAt:0,passReadyAt:0,passes:0,needsRedraw:false,notice:'커피를 마실 사람은 메뉴를 고르고, 안 마실 사람은 패스를 골라주세요.'};
 deliveryEnsureUI();deliveryChanged();return true;
}
function deliveryFinish(winnerId,notice=''){
 const s=deliveryState;if(!s||!netIsHost())return;
 const winner=deliveryCandidates().find(m=>m.id===winnerId);s.phase='done';s.winnerId=winner?.id||'';s.holderId='';s.previousHolderId='';s.passReadyAt=0;s.needsRedraw=false;deliveryDeadline=0;
 s.notice=notice||(winner?winner.name+' 님 컵이 터졌어요! 오늘의 커피 배달 담당입니다. 참가자들이 고른 음료를 함께 가져와주세요.':'오늘은 모두 커피 패스! 배달 담당도 없어요.');
}
function deliveryBeginBomb(){
 const s=deliveryState;if(!netIsHost()||!s)return;const joined=deliveryCandidates();s.winnerId='';s.needsRedraw=false;s.previousHolderId='';s.passes=0;s.startAt=0;
 if(joined.length<2){deliveryFinish(joined[0]?.id||'',joined.length?joined[0].name+' 님만 커피에 참가했어요. 오늘은 내 음료를 직접 가져와요 ☕':'');return;}
 const now=Date.now();s.phase='spin';s.startAt=now;s.holderId=joined[rand(joined.length)].id;s.passReadyAt=now+650;
 // The fuse exists only on the host. Passing or losing a participant never resets it.
 deliveryDeadline=now+7000+rand(19001);s.notice='컵이 터질 때 들고 있으면 커피 배달 담당! 내 차례에는 받을 사람을 눌러요.';
}
function deliveryMaybeSpin(){
 const s=deliveryState;if(!netIsHost()||!s||s.phase!=='invite'||s.members.some(m=>m.response==='pending'&&!m.left))return;
 deliveryBeginBomb();deliveryChanged();
}
function deliveryHandle(senderId,cmd){
 if(typeof cmd?.t!=='string'||!cmd.t.startsWith('delivery'))return false;
 if(!netIsHost()||!deliveryCurrent()||!netMembers().some(m=>m.id===senderId))return true;
 const s=deliveryState,m=s.members.find(m=>m.id===senderId);
 if(!m||m.left||cmd.deliveryId!==s.id||cmd.roundId!==s.roundId||!Number.isSafeInteger(cmd.seq)||cmd.seq<1||cmd.seq<=(deliverySeen.get(senderId)||0))return true;
 if(cmd.t==='deliveryThrow'&&s.phase==='spin'){
  const now=Date.now();if(now>=deliveryDeadline){deliveryFinish(s.holderId);deliveryChanged();return true;}
  const joined=deliveryCandidates(),target=joined.find(p=>p.id===cmd.targetId),present=new Set(netMembers().map(p=>p.id));
  if(senderId!==s.holderId||m.response!=='join'||!target||target.id===senderId||!present.has(target.id)||now<s.passReadyAt||joined.length>2&&target.id===s.previousHolderId)return true;
  deliverySeen.set(senderId,cmd.seq);s.previousHolderId=senderId;s.holderId=target.id;s.passReadyAt=now+650;s.passes++;s.notice=m.name+' → '+target.name+' 님에게 컵 배달!';deliveryChanged();return true;
 }
 if(cmd.t==='deliveryReply'&&s.phase==='invite'&&['join','pass'].includes(cmd.response)){
  const drink=cmd.response==='join'?deliveryDrink(cmd.drink):'';if(cmd.response==='join'&&!drink)return true;
  deliverySeen.set(senderId,cmd.seq);m.response=cmd.response;m.drink=drink;s.notice=m.name+' 님 '+(m.response==='join'?'커피 참가!':'커피 패스!');deliveryChanged();deliveryMaybeSpin();return true;
 }
 if(cmd.t==='deliveryRedraw'&&senderId===netSelfId()&&s.phase==='done'&&s.needsRedraw&&deliveryCandidates().length){
  deliverySeen.set(senderId,cmd.seq);deliveryBeginBomb();deliveryChanged();return true;
 }
 return true;
}
function deliveryPublicState(s){return deliveryClone({id:s.id,roundId:s.roundId,roomCode:s.roomCode,seq:s.seq,phase:s.phase,members:s.members.map(m=>({id:m.id,name:m.name,response:m.response,drink:m.drink,left:m.left})),winnerId:s.winnerId,holderId:s.holderId,previousHolderId:s.previousHolderId,startAt:s.startAt,passReadyAt:s.passReadyAt,passes:s.passes,needsRedraw:s.needsRedraw,notice:s.notice});}
function deliveryGetState(){if(!deliveryCurrent()){if(deliveryState)deliveryCancel();return null;}return {...deliveryPublicState(deliveryState),serverNow:Date.now()};}
function deliveryValidate(data){
 if(!data||typeof data.id!=='string'||data.id.length>100||typeof data.roundId!=='string'||data.roundId!==result?.id||data.roomCode!==String(netRoom.code||'')||!Number.isSafeInteger(data.seq)||data.seq<0||!['invite','spin','done'].includes(data.phase)||!Array.isArray(data.members)||data.members.length<1||data.members.length>8||typeof data.winnerId!=='string'||typeof data.holderId!=='string'||typeof data.previousHolderId!=='string'||!Number.isFinite(data.startAt)||data.startAt<0||!Number.isFinite(data.passReadyAt)||data.passReadyAt<0||!Number.isSafeInteger(data.passes)||data.passes<0||typeof data.notice!=='string'||data.notice.length>300||typeof data.needsRedraw!=='boolean')return false;
 if(data.members.some(m=>!m||typeof m.id!=='string'||!m.id||m.id.length>128||typeof m.name!=='string'||!m.name||Array.from(m.name).length>24||!['pending','join','pass'].includes(m.response)||typeof m.left!=='boolean'||(m.response==='join'?deliveryDrink(m.drink)!==m.drink:m.drink!==''))||new Set(data.members.map(m=>m.id)).size!==data.members.length)return false;
 if(data.phase!=='done'&&data.winnerId)return false;
 if(data.winnerId&&!data.members.some(m=>m.id===data.winnerId&&m.response==='join'&&!m.left))return false;
 if(data.previousHolderId&&!data.members.some(m=>m.id===data.previousHolderId))return false;
 if(data.needsRedraw&&(data.phase!=='done'||data.winnerId||!data.members.some(m=>m.response==='join'&&!m.left)))return false;
 if(data.phase==='spin'&&(!data.startAt||data.needsRedraw||data.members.some(m=>m.response==='pending'&&!m.left)||data.members.filter(m=>m.response==='join'&&!m.left).length<2||!data.members.some(m=>m.id===data.holderId&&m.response==='join'&&!m.left)))return false;
 if(data.phase!=='spin'&&(data.holderId||data.previousHolderId||data.passReadyAt))return false;
 return true;
}
function deliveryReceive(data){
 if(netIsHost())return false;if(!data){deliveryCancel();return false;}if(!deliveryValidate(data))return false;
 if(deliveryState?.id===data.id&&data.seq<deliveryState.seq)return false;const fresh=deliveryState?.id!==data.id;deliveryState=deliveryPublicState(data);deliveryDeadline=0;deliveryClockOffset=Number.isFinite(data.serverNow)?data.serverNow-Date.now():0;
 if(fresh){deliverySendSeq=0;deliveryUiId='';deliverySeen.clear();deliveryRosterKey='';deliveryOrdersKey='';deliveryTargetsKey='';}
 deliveryEnsureUI();deliveryRender();return true;
}
function deliverySend(cmd){if(!deliveryState)return;netRoom.send({...cmd,deliveryId:deliveryState.id,roundId:deliveryState.roundId,seq:++deliverySendSeq});}
function deliveryStageChatContains(node){return !!node&&!!document.getElementById('roomChatDock')?.contains(node);}
function deliveryStageFocusable(){
 const dock=document.getElementById('roomChatDock'),selector='button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])';
 return [deliveryPanel,dock].filter(Boolean).flatMap(root=>[...root.querySelectorAll(selector)]).filter(n=>!n.hidden&&!n.closest('[hidden]')&&!n.closest('[inert]')&&n.getClientRects().length);
}
function deliverySetStage(active){
 if(typeof document==='undefined'||!deliveryPanel)return;
 if(active&&!deliveryStageActive){
  deliveryStageActive=true;deliveryStageHome=deliveryPanel.parentElement;deliveryStageSibling=deliveryPanel.nextSibling;deliveryStageReturnFocus=document.activeElement;deliveryStageFocusKey='';
  // Keep the coffee invite and actual game in one compact body-level popup.
  if(!deliveryStageBackdrop){deliveryStageBackdrop=document.createElement('div');deliveryStageBackdrop.className='delivery-popup-backdrop';deliveryStageBackdrop.id='coffeeDeliveryBackdrop';deliveryStageBackdrop.setAttribute('aria-hidden','true');document.body.append(deliveryStageBackdrop);}deliveryStageBackdrop.hidden=false;
  document.body.append(deliveryPanel);document.body.classList.add('delivery-game-active');deliveryPanel.dataset.popup='true';deliveryPanel.setAttribute('role','dialog');deliveryPanel.setAttribute('aria-modal','true');deliveryPanel.setAttribute('aria-describedby','deliveryPopupHelp');deliveryPanel.tabIndex=-1;
  const dock=document.getElementById('roomChatDock');for(const n of document.body.children){if(n===deliveryPanel||n===deliveryStageBackdrop||n===dock||n.contains(dock)||['SCRIPT','STYLE','LINK'].includes(n.tagName))continue;if('inert'in n){deliveryStageInert.push({node:n,value:n.inert});n.inert=true;}}
  deliveryPanel.focus({preventScroll:true});
 }else if(!active&&deliveryStageActive){
  deliveryStageActive=false;document.body.classList.remove('delivery-game-active');delete deliveryPanel.dataset.popup;deliveryPanel.removeAttribute('role');deliveryPanel.removeAttribute('aria-modal');deliveryPanel.removeAttribute('aria-describedby');if(deliveryStageBackdrop)deliveryStageBackdrop.hidden=true;for(const entry of deliveryStageInert)entry.node.inert=entry.value;deliveryStageInert.length=0;
  if(deliveryStageHome?.isConnected){deliveryStageHome.insertBefore(deliveryPanel,deliveryStageSibling?.parentNode===deliveryStageHome?deliveryStageSibling:null);}else document.getElementById('resultView')?.append(deliveryPanel);
  const prior=deliveryStageReturnFocus;deliveryStageHome=null;deliveryStageSibling=null;deliveryStageReturnFocus=null;deliveryStageFocusKey='';
  if(!deliveryStageChatContains(document.activeElement)&&prior?.isConnected&&!prior.disabled&&!prior.closest('[hidden],[inert]'))prior.focus?.({preventScroll:true});
 }
 if(active&&deliveryStageActive){
  const s=deliveryState,mine=s?.holderId===netSelfId(),ready=Date.now()+deliveryClockOffset>=(s?.passReadyAt||0),key=s?.holderId+':'+s?.passes;
  if(s?.phase==='invite'&&deliveryStageFocusKey!==s.id+':invite'&&!deliveryStageChatContains(document.activeElement)){const choice=deliveryStageFocusable().find(n=>deliveryPanel.contains(n));if(choice)choice.focus({preventScroll:true});deliveryStageFocusKey=s.id+':invite';}
  else if(mine&&ready&&deliveryStageFocusKey!==key&&!deliveryStageChatContains(document.activeElement)){const target=deliveryStageFocusable().find(n=>n.matches('[data-delivery-target]'));if(target){target.focus({preventScroll:true});deliveryStageFocusKey=key;}}
  else if(document.activeElement?.disabled&&deliveryPanel.contains(document.activeElement))deliveryPanel.focus({preventScroll:true});
 }
}
function deliveryStageKeydown(event){
 if(!deliveryStageActive||event.key!=='Tab')return;const list=deliveryStageFocusable(),current=document.activeElement,index=list.indexOf(current);event.preventDefault();
 const next=index<0?(event.shiftKey?list.length-1:0):(index+(event.shiftKey?-1:1)+list.length)%list.length;(list.length?list[next]:deliveryPanel).focus({preventScroll:true});
}
function deliveryEnsureUI(){
 if(deliveryPanel)return;const view=$('resultView');if(!view)return;
 deliveryPanel=el('section','coffee-delivery');deliveryPanel.id='coffeeDeliveryPanel';deliveryPanel.hidden=true;deliveryPanel.setAttribute('aria-labelledby','deliveryTitle');
 deliveryPanel.innerHTML='<header class="delivery-head"><div><span>AFTER LUNCH · 자율 참가</span><h3 id="deliveryTitle">커피는 자유 참가 ☕</h3><p>마실 메뉴를 고르면, 참가자 중 한 명이 커피 배달 담당!</p></div><b class="delivery-cup" aria-hidden="true">☕</b></header><div class="delivery-body"><div class="delivery-main"><div id="deliveryPick" class="delivery-pick"><label for="deliveryDrinkSelect">내 커피 메뉴</label><select id="deliveryDrinkSelect" aria-label="내 커피 메뉴"></select><input id="deliveryCustomDrink" type="text" maxlength="40" placeholder="마실 메뉴 · 20자까지" aria-label="직접 입력할 커피 메뉴" hidden><div class="delivery-choice-actions"><button id="deliveryJoinBtn" class="btn primary" type="button">이 메뉴로 커피 참가</button><button id="deliveryPassBtn" class="btn" type="button">이번엔 안 마실래</button></div><small id="deliveryMyChoice"></small></div><div id="deliveryDraw" class="delivery-draw" hidden><span id="deliveryDrawCaption"></span><strong id="deliveryDrawName"></strong><small id="deliveryDrawHint"></small><button id="deliveryRedrawBtn" class="btn primary" type="button" hidden>배달 담당 다시 뽑기</button></div><p id="deliveryNotice" class="delivery-notice" role="status" aria-live="polite"></p><div id="deliveryRoster" class="delivery-roster"></div></div><aside class="delivery-order-box"><h4>함께 가져올 메뉴</h4><div id="deliveryOrders"></div><p id="deliveryCount"></p></aside></div>';
 const cup=el('div','delivery-bomb-art');cup.id='deliveryBombArt';cup.setAttribute('aria-hidden','true');cup.innerHTML='<i>☕</i><b>⊙_⊙</b>';const draw=deliveryPanel.querySelector('#deliveryDraw');draw.insertBefore(cup,draw.firstChild);
 deliveryPanel.querySelector('.delivery-head p').id='deliveryPopupHelp';
 const targets=el('div','delivery-targets');targets.id='deliveryTargets';targets.setAttribute('aria-label','커피 컵을 받을 사람');draw.append(targets);
 view.append(deliveryPanel);
 const select=$('deliveryDrinkSelect');if(select&&!select.options.length)for(const d of [...deliveryDrinks,'직접 입력']){const o=el('option','',d);o.value=d;select.append(o);}
 select.addEventListener('change',()=>{$('deliveryCustomDrink').hidden=select.value!=='직접 입력';deliveryRenderControls();});
 $('deliveryCustomDrink').addEventListener('input',deliveryRenderControls);
 $('deliveryJoinBtn').addEventListener('click',()=>{const drink=deliveryDrink(select.value==='직접 입력'?$('deliveryCustomDrink').value:select.value);if(!drink){$('deliveryMyChoice').textContent='마실 메뉴를 1~20자로 적어주세요.';return;}deliverySend({t:'deliveryReply',response:'join',drink});});
 $('deliveryPassBtn').addEventListener('click',()=>deliverySend({t:'deliveryReply',response:'pass'}));
 $('deliveryRedrawBtn').addEventListener('click',()=>deliverySend({t:'deliveryRedraw'}));
 targets.addEventListener('click',event=>{const b=event.target.closest('[data-delivery-target]');if(b&&!b.disabled)deliverySend({t:'deliveryThrow',targetId:b.dataset.deliveryTarget});});
 document.addEventListener('keydown',deliveryStageKeydown,true);
 document.addEventListener('focusin',event=>{if(deliveryStageActive&&!deliveryPanel.contains(event.target)&&!deliveryStageChatContains(event.target))deliveryPanel.focus({preventScroll:true});});
 deliveryRender();
}
function deliveryRenderControls(){
 if(!deliveryPanel||!deliveryState)return;const own=deliveryState.members.find(m=>m.id===netSelfId()),can=deliveryState.phase==='invite'&&own&&!own.left,custom=$('deliveryDrinkSelect').value==='직접 입력';
 $('deliveryDrinkSelect').disabled=!can;$('deliveryCustomDrink').disabled=!can;$('deliveryCustomDrink').hidden=!custom;$('deliveryJoinBtn').disabled=!can||custom&&!deliveryDrink($('deliveryCustomDrink').value);$('deliveryPassBtn').disabled=!can;
}
function deliveryRender(){
 if(!deliveryPanel)return;const s=deliveryState;deliveryPanel.hidden=!s||!deliveryCurrent()||netPhase!=='result';if(deliveryPanel.hidden){deliverySetStage(false);return;}
 deliveryPanel.dataset.phase=s.phase;const own=s.members.find(m=>m.id===netSelfId());if(deliveryUiId!==s.id){deliveryUiId=s.id;const drink=own?.drink||deliveryDrinks[0],preset=deliveryDrinks.includes(drink);$('deliveryDrinkSelect').value=preset?drink:'직접 입력';$('deliveryCustomDrink').value=preset?'':drink;}
 $('deliveryPick').hidden=s.phase!=='invite'||!own||own.left;$('deliveryDraw').hidden=s.phase==='invite';deliveryRenderControls();
 $('deliveryMyChoice').textContent=own?.response==='join'?'내 선택: '+own.drink+' · 참가 중':own?.response==='pass'?'내 선택: 이번에는 커피 패스':'참가 또는 패스를 고르면, 모두 선택한 뒤 자동으로 돌려요.';
 $('deliveryNotice').textContent=s.notice;$('deliveryRedrawBtn').hidden=!(netIsHost()&&s.phase==='done'&&s.needsRedraw&&deliveryCandidates().length);
 const rosterKey=s.members.map(m=>m.id+':'+m.response+':'+m.drink+':'+m.left).join('|');
 if(rosterKey!==deliveryRosterKey){deliveryRosterKey=rosterKey;const list=$('deliveryRoster');list.replaceChildren();for(const m of s.members){const chip=el('span','delivery-chip');chip.classList.toggle('is-pass',m.response==='pass'||m.left);chip.append(el('b','',m.name+(m.id===netSelfId()?' · 나':'')),el('small','',m.left?'나감':m.response==='pending'?'고르는 중':m.response==='pass'?'패스':m.drink));list.append(chip);}}
 const joined=deliveryCandidates(),orders=new Map();for(const m of joined)orders.set(m.drink,(orders.get(m.drink)||0)+1);const orderKey=JSON.stringify([...orders]);if(orderKey!==deliveryOrdersKey){deliveryOrdersKey=orderKey;const list=$('deliveryOrders');list.replaceChildren();if(!orders.size)list.append(el('p','delivery-empty','참가자가 고른 메뉴가 여기에 모여요.'));for(const [drink,count]of orders){const line=el('div','delivery-order');line.append(el('span','',drink),el('strong','',count+'잔'));list.append(line);}}
 $('deliveryCount').textContent='커피 참가 '+joined.length+'명 · 총 '+joined.length+'잔';
 deliveryRenderDraw();
 $('deliveryTitle').textContent=s.phase==='spin'?'커피 폭탄 떠넘기기 ☕':'커피는 자유 참가 ☕';$('deliveryPopupHelp').textContent=s.phase==='spin'?'컵이 터질 때 들고 있으면 커피 배달 담당! 받을 사람을 눌러 넘겨요.':'마실 음료를 고르거나 패스하세요. 모두 선택하면 컵 돌리기가 시작돼요.';deliverySetStage(['invite','spin'].includes(s.phase));
 if(!deliveryStageActive&&deliveryScrolledId!==s.id&&typeof requestAnimationFrame==='function'&&typeof deliveryPanel.scrollIntoView==='function'){const revealId=s.id;deliveryScrolledId=revealId;requestAnimationFrame(()=>{if(deliveryState?.id!==revealId||!deliveryCurrent()||deliveryPanel?.hidden||deliveryStageActive)return;const still=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;deliveryPanel.scrollIntoView({behavior:still?'auto':'smooth',block:'start'});});}
}
function deliveryRenderDraw(){
 const s=deliveryState;if(!s||!deliveryPanel||deliveryPanel.hidden||s.phase==='invite')return;const joined=deliveryCandidates();deliveryPanel.dataset.phase=s.phase;
 const playing=s.phase==='spin',mine=playing&&s.holderId===netSelfId(),ready=Date.now()+deliveryClockOffset>=s.passReadyAt,holder=joined.find(m=>m.id===s.holderId);deliveryPanel.dataset.mine=String(mine);$('deliveryBombArt').hidden=!playing&&(!s.winnerId||!s.startAt);$('deliveryBombArt').querySelector('b').textContent=playing?(mine?'⊙_⊙':'ㅡ_ㅡ'):'X﹏X';
 if(playing){$('deliveryDrawCaption').textContent=mine?'내 컵이다. 받을 사람을 눌러!':'컵을 피하는 중…';$('deliveryDrawName').textContent=(holder?.name||'')+' 님이 컵 들고 있음';$('deliveryDrawHint').textContent='언제 터질지는 아무도 몰라요. '+(joined.length>2?'방금 준 사람에게 반송 금지!':'서로 번갈아 넘겨요!');}
 else{const winner=s.members.find(m=>m.id===s.winnerId);$('deliveryDrawCaption').textContent=winner?'오늘의 커피 배달 담당':s.needsRedraw?'배달 담당을 다시 골라주세요':'오늘은 커피 패스';$('deliveryDrawName').textContent=winner?winner.name+' ☕':s.needsRedraw?'다시 돌릴까?':'각자 맛점!';$('deliveryDrawHint').textContent=winner?'아래 메뉴 '+joined.length+'잔을 함께 가져와주세요.':s.needsRedraw?'남은 참가자 중에서 다시 뽑을 수 있어요.':'모두의 선택을 반영했어요.';}
 const targets=$('deliveryTargets');targets.hidden=!playing;const targetKey=joined.map(m=>m.id+':'+m.name).join('|');if(targetKey!==deliveryTargetsKey){deliveryTargetsKey=targetKey;targets.replaceChildren();for(const m of joined){const b=el('button','delivery-target');b.type='button';b.title=m.name;b.dataset.deliveryTarget=m.id;b.append(el('strong','',m.name+(m.id===netSelfId()?' · 나':'')),el('small'));targets.append(b);}}
 for(const b of targets.children){const id=b.dataset.deliveryTarget,blocked=joined.length>2&&id===s.previousHolderId;b.classList.toggle('is-holder',playing&&id===s.holderId);b.disabled=!playing||!mine||!ready||id===netSelfId()||blocked;b.querySelector('small').textContent=id===s.holderId?'☕ 컵 보유':mine&&blocked?'반송 금지':mine?'여기로 넘기기':'컵 피하는 중';}
}
function deliveryHousekeep(){
 const s=deliveryState;if(!s)return;if(!deliveryCurrent()){deliveryCancel();return;}if(!netIsHost())return;
 const present=new Set(netMembers().map(m=>m.id));let changed=false;
 for(const m of s.members)if(!m.left&&!present.has(m.id)){m.left=true;m.response='pass';m.drink='';changed=true;}
 if(changed){
  const joined=deliveryCandidates();
  if(s.phase==='spin'){
   if(joined.length<2)deliveryFinish(joined[0]?.id||'',joined.length?joined[0].name+' 님만 남았어요. 오늘의 커피 배달 담당입니다 ☕':'커피 참가자가 없어 배달 담당 없이 마쳤어요.');
   else if(!joined.some(m=>m.id===s.holderId)){s.holderId=joined[rand(joined.length)].id;s.previousHolderId='';s.passReadyAt=Date.now()+650;s.notice='컵을 들던 사람이 나가 남은 참가자에게 컵을 넘겼어요.';}
  }
  if(s.phase==='done'&&s.winnerId&&!joined.some(m=>m.id===s.winnerId)){s.winnerId='';s.needsRedraw=joined.length>0;s.notice=joined.length?'배달 담당이 나갔어요. 남은 참가자 중에서 다시 뽑아주세요.':'커피 참가자가 모두 나갔어요.';}
  deliveryChanged();deliveryMaybeSpin();
 }
 if(s.phase==='spin'&&Date.now()>=deliveryDeadline){deliveryFinish(s.holderId);deliveryChanged();}
}
setInterval(()=>{deliveryHousekeep();deliveryRender();},200);netRoom.onDisconnect(e=>{if(e.self||e.hostLost)deliveryCancel();});
/* END_COFFEE_DELIVERY_V1 */

/* LUNCH_FINALE_V2 */
let lunchFinaleDialog=null,lunchFinaleReplay=null,lunchFinaleRoom='',lunchFinaleRound='',lunchFinaleShownKey='',lunchFinaleFocus=null,lunchFinaleSoundTimers=[],lunchFinaleStartedAt=0,lunchFinaleCurrentScene=-1;
let lunchFinaleSceneTimes=[0,2500,8000,21000,27000,39000],lunchFinaleDuration=43500;
let lunchFinaleShared=null,lunchFinaleLocalEnd=0,lunchFinaleLocalStart=0;
const lunchFinaleInstagram='https://www.instagram.com/mid_jhs/';
const lunchFinaleSeen=new Set(),lunchFinaleSceneLabels=['상영을 시작합니다','오늘의 점심','커피 원정대','밥친구 퍼레이드','오늘의 출연진','우리의 오후를 응원하며'];
function lunchFinaleData(){
 if(!netIsActive()||netPhase!=='result'||!result||result.provisional!==false||!result.id||typeof result.menu!=='string'||!result.menu||typeof result.person!=='string'||!result.person)return null;
 const decision=typeof lunchDecisionGetState==='function'?lunchDecisionGetState():null,delivery=typeof deliveryGetState==='function'?deliveryGetState():null;
 if(!decision||decision.phase!=='coffee'||decision.roundId!==result.id||!delivery||delivery.roundId!==result.id||delivery.phase!=='done'||delivery.needsRedraw||!Array.isArray(delivery.members))return null;
 const winner=delivery.winnerId?delivery.members.find(m=>m.id===delivery.winnerId&&m.response==='join'&&!m.left):null;
 if(delivery.winnerId&&!winner)return null;
 const mealNames=(result.nominations||[]).filter(m=>m&&typeof m.person==='string').map(m=>m.person);
 return {key:String(netRoom.code||'')+':'+result.id+':'+delivery.id+':'+(winner?.id||'pass'),roundId:result.id,deliveryId:delivery.id,menu:result.menu,person:result.person,winnerId:result.winnerId,coffeeName:winner?.name||'',coffeeId:winner?.id||'',names:[...new Set(mealNames)],orders:delivery.members.filter(m=>m.response==='join'&&!m.left).map(m=>({name:m.name,drink:m.drink})),nominations:result.nominations||[]};
}
function lunchFinaleNow(){return typeof performance!=='undefined'&&typeof performance.now==='function'?performance.now():Date.now();}
function lunchFinaleCopy(value){return value?JSON.parse(JSON.stringify(value)):null;}
function lunchFinaleTimeline(data){const count=Math.max(1,Math.min(8,Math.max(data.names?.length||0,data.orders?.length||0))),credits=Math.min(12000,8000+count*500),times=[0,2500,8000,21000,27000,27000+credits];return{sceneTimes:times,duration:times[5]+4500,credits};}
function lunchFinaleContext(){return{room:netIsActive()?String(netRoom.code||''):'',round:typeof result!=='undefined'?result?.id||'':''};}
function lunchFinaleScheduleCurrent(){const context=lunchFinaleContext();return !!lunchFinaleShared&&!!context.room&&context.room===lunchFinaleShared.roomCode&&context.round===lunchFinaleShared.roundId;}
function lunchFinaleSyncContext(){const context=lunchFinaleContext();if(context.room!==lunchFinaleRoom||context.round!==lunchFinaleRound){lunchFinaleReset();lunchFinaleRoom=context.room;lunchFinaleRound=context.round;}return context;}
function lunchFinaleInstallSchedule(data,serverNow){
 const same=lunchFinaleShared?.id===data.id,nextEnd=lunchFinaleNow()+data.endAt-serverNow;lunchFinaleShared=lunchFinaleCopy(data);
 lunchFinaleLocalEnd=same&&lunchFinaleLocalEnd?Math.min(lunchFinaleLocalEnd,nextEnd):nextEnd;lunchFinaleLocalStart=lunchFinaleLocalEnd-data.duration;if(same&&lunchFinaleDialog?.open)lunchFinaleStartedAt=lunchFinaleLocalStart;
}
function lunchFinaleEnsureSchedule(){
 if(!netIsHost()||!netIsActive())return false;lunchFinaleSyncContext();if(lunchFinaleScheduleCurrent())return false;const data=lunchFinaleData();if(!data)return false;
 const now=Date.now(),plan=lunchFinaleTimeline(data),startAt=now+300,shared={version:1,id:'finale:'+data.key,key:data.key,roomCode:String(netRoom.code||''),roundId:data.roundId,deliveryId:data.deliveryId,startAt,endAt:startAt+plan.duration,duration:plan.duration,sceneTimes:plan.sceneTimes,data:lunchFinaleCopy(data)};
 lunchFinaleInstallSchedule(shared,now);return true;
}
function lunchFinaleGetState(){
 lunchFinaleSyncContext();if(netIsHost())lunchFinaleEnsureSchedule();return lunchFinaleScheduleCurrent()&&lunchFinaleNow()<lunchFinaleLocalEnd?{...lunchFinaleCopy(lunchFinaleShared),serverNow:Date.now()}:null;
}
function lunchFinaleValidate(data){
 if(!data||data.version!==1||typeof data.id!=='string'||data.id.length>600||typeof data.key!=='string'||data.key.length>550||data.roomCode!==String(netRoom.code||'')||data.roundId!==result?.id||typeof data.deliveryId!=='string'||data.deliveryId.length>120||!Number.isFinite(data.startAt)||!Number.isFinite(data.endAt)||!Number.isFinite(data.serverNow)||!Number.isFinite(data.duration)||data.duration<40000||data.duration>43500||data.endAt-data.startAt!==data.duration||data.serverNow<data.startAt-10000||data.serverNow>data.endAt+10000||!Array.isArray(data.sceneTimes)||data.sceneTimes.length!==6)return false;
 const p=data.data,nominations=result?.nominations||[],names=nominations.map(n=>n.person),decision=typeof lunchDecisionGetState==='function'?lunchDecisionGetState():null,delivery=typeof deliveryGetState==='function'?deliveryGetState():null;
 if(!p||result.provisional!==false||netPhase!=='result'||decision?.roundId!==data.roundId||decision.phase!=='coffee'||delivery?.id!==data.deliveryId||delivery.roundId!==data.roundId||delivery.phase!=='done'||p.key!==data.key||p.roundId!==data.roundId||p.deliveryId!==data.deliveryId||p.menu!==result.menu||p.person!==result.person||p.winnerId!==result.winnerId||typeof p.coffeeName!=='string'||typeof p.coffeeId!=='string'||Array.from(p.coffeeName).length>24||!Array.isArray(p.names)||p.names.length<1||p.names.length>8||new Set(p.names).size!==p.names.length||p.names.some(n=>!names.includes(n))||!Array.isArray(p.orders)||p.orders.length>8||new Set(p.orders.map(o=>o?.name)).size!==p.orders.length||p.orders.some(o=>!o||!p.names.includes(o.name)||typeof o.drink!=='string'||!o.drink.trim()||Array.from(o.drink).length>20)||!Array.isArray(p.nominations)||JSON.stringify(p.nominations)!==JSON.stringify(nominations))return false;
 if(p.names.length!==new Set(names).size)return false;
 const expectedOrders=delivery.members.filter(m=>m.response==='join'&&!m.left).map(m=>({name:m.name,drink:m.drink})),coffee=delivery.winnerId?delivery.members.find(m=>m.id===delivery.winnerId&&m.response==='join'&&!m.left):null;
 if(delivery.needsRedraw||delivery.winnerId&&!coffee||p.coffeeId!==(coffee?.id||'')||p.coffeeName!==(coffee?.name||'')||JSON.stringify(p.orders)!==JSON.stringify(expectedOrders))return false;
 const plan=lunchFinaleTimeline(p),key=data.roomCode+':'+data.roundId+':'+data.deliveryId+':'+(p.coffeeId||'pass');if(data.key!==key||data.id!=='finale:'+key||plan.duration!==data.duration||plan.sceneTimes.some((t,i)=>data.sceneTimes[i]!==t))return false;
 return true;
}
function lunchFinaleReceive(data){
 if(netIsHost()||!netIsActive())return false;lunchFinaleSyncContext();if(!data||!lunchFinaleValidate(data))return false;
 if(lunchFinaleShared&&(lunchFinaleShared.id!==data.id||lunchFinaleShared.endAt!==data.endAt||JSON.stringify(lunchFinaleShared.data)!==JSON.stringify(data.data)))return false;
 const {serverNow,...shared}=data;lunchFinaleInstallSchedule(shared,serverNow);return true;
}
function lunchFinaleStopSound(){for(const timer of lunchFinaleSoundTimers)clearTimeout(timer);lunchFinaleSoundTimers=[];}
function lunchFinaleTone(scene){
 if(typeof beep!=='function')return;const notes=scene===0?[261.63,392,523.25]:scene===1?[392,523.25,659.25,783.99]:scene===2?[440,554.37,659.25]:scene===3?[392,440,392,523.25]:scene===5?[392,523.25,659.25,523.25]:[];
 for(const [i,f]of notes.entries())lunchFinaleSoundTimers.push(setTimeout(()=>{if(lunchFinaleDialog?.open)beep(f,i===notes.length-1?.25:.12);},i*210));
}
function lunchFinaleClose(){
 const secret=$('lunchFinaleSecret');if(secret)secret.open=false;
 lunchFinaleStopSound();lunchFinaleStartedAt=0;lunchFinaleCurrentScene=-1;if(lunchFinaleDialog?.open)lunchFinaleDialog.close();if(lunchFinaleFocus?.isConnected)lunchFinaleFocus.focus({preventScroll:true});
}
function lunchFinaleReset(){lunchFinaleShared=null;lunchFinaleLocalEnd=0;lunchFinaleLocalStart=0;lunchFinaleClose();lunchFinaleShownKey='';if(lunchFinaleReplay)lunchFinaleReplay.hidden=true;}
function lunchFinaleEnsureUI(){
 if(lunchFinaleDialog)return;
 lunchFinaleDialog=el('dialog','lunch-finale-dialog');lunchFinaleDialog.id='lunchFinaleDialog';lunchFinaleDialog.setAttribute('aria-label','점심결재 대작전 엔딩 영화');lunchFinaleDialog.setAttribute('closedby','none');lunchFinaleDialog.tabIndex=-1;
 lunchFinaleDialog.innerHTML='<div class="film-grain" aria-hidden="true"></div><div class="film-letterbox film-letterbox-top" aria-hidden="true"></div><div class="film-letterbox film-letterbox-bottom" aria-hidden="true"></div><header class="film-top"><span>점심결재 대작전 <i>THE FINALE</i></span><span class="film-watch-note">함께 보는 엔딩</span></header><main class="film-stage"><section class="film-scene film-intro" data-film-scene="0" aria-label="상영 시작"><div class="film-intro-spot" aria-hidden="true"></div><span class="film-eyebrow">A VERY SMALL · VERY SERIOUS LUNCH STORY</span><div class="film-intro-seal">결<br>재</div><h2>오늘도,<br><em>우리는 살아남았다.</em></h2><p>업무도. 메뉴 고민도. 방금 그 게임도.</p><div class="film-intro-credit">훈정스튜디오의 <b>점심결재 대작전</b></div></section><section class="film-scene film-lunch" data-film-scene="1" aria-label="오늘의 점심 발표" hidden><div class="film-spotlight" aria-hidden="true"></div><div class="film-lunch-crown">✦ TODAY’S CHAMPION ✦</div><div id="lunchFinaleChampion" class="film-champion" aria-hidden="true"></div><div class="film-receipt"><span class="film-receipt-kicker">축하합니다! · 오늘의 점심 메뉴는</span><small id="lunchFinalePerson"></small><div class="film-receipt-menu"><span id="lunchFinaleFood" aria-hidden="true"></span><h2 id="lunchFinaleMenu"></h2></div><p>입니다.</p><i class="film-approved" aria-hidden="true">점심<br>최종 승인</i></div><p class="film-lunch-caption" id="lunchFinaleLunchAnnounce"></p><div class="film-burst film-burst-a" aria-hidden="true">✷</div><div class="film-burst film-burst-b" aria-hidden="true">✧</div><div class="film-sparkles" aria-hidden="true">✦　·　✧　✦　·　✦　✧　·　✦</div></section><section class="film-scene film-coffee" data-film-scene="2" aria-label="커피 배달 당첨자 발표" hidden><div class="film-coffee-sun" aria-hidden="true"></div><div class="film-coffee-announcement"><span class="film-eyebrow">ONE MORE MISSION · 커피 원정대 출동</span><h2 id="lunchFinaleCoffeeTitle">오늘의 커피 배달은</h2><strong id="lunchFinaleCoffeeName"></strong><p id="lunchFinaleCoffeeText"></p><div class="film-coffee-road" aria-hidden="true"></div><div class="film-coffee-cart"><div id="lunchFinaleCourier" class="film-courier" aria-hidden="true"></div><div class="film-cart-body"><span>☕</span><b>CAFE<br>EXPRESS</b><span>☕</span><i class="film-wheel"></i><i class="film-wheel"></i></div><div class="film-cart-puff" aria-hidden="true">뿌　뿌　☁</div></div></div><aside class="film-coffee-orders" aria-label="최종 주문 음료 내역"><header><h3>오늘의 주문 내역</h3><span id="lunchFinaleOrderCount"></span></header><ol id="lunchFinaleOrders"></ol><p id="lunchFinaleOrdersEmpty" hidden>오늘은 모두 커피 패스.<br>가벼운 발걸음으로 맛점!</p></aside></section><section class="film-scene film-parade" data-film-scene="3" aria-label="밥친구 퍼레이드" hidden><span class="film-eyebrow">NOT PERFECT. STILL TOGETHER.</span><h2>잘했든, 망했든.<br><em>같이 밥 먹으면 됐지!</em></h2><p>오늘의 주인공, 전원 입장.</p><div class="film-parade-banner" aria-hidden="true">고 생 했 어 요　 밥 은 먹 고 합 시 다</div><div class="film-parade-track"><div id="lunchFinaleParade" class="film-parade-march"></div><div class="film-parade-ground" aria-hidden="true"></div></div><div class="film-parade-small">※ 행진이 조금 엉망이어도, 마음만은 진지합니다.</div><div class="film-parade-confetti" aria-hidden="true">▰　✧　▱　✦　▱　▰　✧　▱　✦　▰　▱</div></section><section class="film-scene film-credits" data-film-scene="4" aria-label="엔딩 크레딧" hidden><div class="film-credits-title"><span>THE PEOPLE WHO MADE LUNCH HAPPEN</span><h2>오늘의 출연진</h2></div><div class="film-credit-window"><div id="lunchFinaleCreditRoll" class="film-credit-roll"></div></div><div class="film-credits-warmth" aria-hidden="true">✦</div></section><section class="film-scene film-outro" data-film-scene="5" aria-label="감사 인사" hidden><div class="film-outro-glow" aria-hidden="true"></div><span class="film-eyebrow">TO EVERYONE WHO MADE IT TO LUNCH</span><h2>오늘도 일하시느라<br><em>고생 많으셨어요.</em></h2><p id="lunchFinaleThanks">저의 <b>점심결재 대작전</b>을<br>플레이해주셔서 감사합니다.</p><p class="film-outro-note">잠깐의 웃음과 든든한 한 끼가,<br>우리의 오후를 버티는 힘이 되길.</p><div id="lunchFinaleFinalMascots" class="film-outro-mascots" aria-hidden="true"></div><div class="film-end-title">점심결재 대작전<small>THE END · BUT LUNCH BEGINS</small></div></section></main><footer class="film-bottom"><span id="lunchFinaleSceneName">상영을 시작합니다</span><div class="film-progress" aria-hidden="true"><i id="lunchFinaleProgressFill"></i></div><span>엔딩 후 이 방에서 결과를 확인해요</span></footer>';
 document.body.append(lunchFinaleDialog);lunchFinaleDialog.addEventListener('cancel',e=>e.preventDefault());
 const secret=el('details','film-easter-egg'),star=el('summary','','✦'),link=el('a','film-secret-link');
 secret.id='lunchFinaleSecret';star.setAttribute('aria-label','작은 별 살펴보기');star.title='구석의 작은 별';
 link.id='lunchFinaleSecretLink';link.href=lunchFinaleInstagram;link.target='_blank';link.rel='noopener noreferrer';
 link.setAttribute('aria-label','훈정스튜디오 인스타그램 @mid_jhs 새 창에서 보기');
 const studioMark=el('img');studioMark.src='assets/hoonjung-studio-wordmark.png';studioMark.alt='hoonjung studio';
 studioMark.width=115;studioMark.height=38;link.append(studioMark,'@mid_jhs ↗');
 secret.append(star,link);lunchFinaleDialog.querySelector('.film-bottom').append(secret);
}
function lunchFinaleEnsureReplay(){if(lunchFinaleReplay)lunchFinaleReplay.hidden=true;}
function lunchFinaleCredit(label,value,extra=false){const row=el('div','film-credit-row'+(extra?' film-credit-extra':''));row.append(el('span','',label),el('b','',value));return row;}
function lunchFinaleDepartment(id,fallback='business'){return typeof netDepartment==='function'&&id?netDepartment(id):fallback;}
function lunchFinaleBuild(data){
 $('lunchFinaleSecret').open=false;
 $('lunchFinalePerson').textContent=data.person+' 님이 선택하신';$('lunchFinaleMenu').textContent=data.menu;$('lunchFinaleFood').textContent=typeof actionFood==='function'?actionFood(data.menu):'🍱';$('lunchFinaleLunchAnnounce').textContent='오늘의 점심 메뉴는 '+data.person+' 님이 선택하신 '+data.menu+'입니다.';
 $('lunchFinaleChampion').innerHTML=deptAvatarSvg(lunchFinaleDepartment(data.winnerId));$('lunchFinaleCourier').innerHTML=deptAvatarSvg(lunchFinaleDepartment(data.coffeeId,'accounting'));
 $('lunchFinaleCoffeeTitle').textContent=data.coffeeName?'오늘의 커피 배달은':'오늘의 커피는';$('lunchFinaleCoffeeName').textContent=data.coffeeName?data.coffeeName+' 님!':'잠깐 쉬어갑니다.';$('lunchFinaleCoffeeText').textContent=data.coffeeName?'당첨되셨습니다! 커피 원정대를 이끌어주세요.':'모두 커피 패스. 오늘은 가벼운 발걸음으로 맛점!';
 const orders=$('lunchFinaleOrders');orders.replaceChildren();$('lunchFinaleOrderCount').textContent=data.orders.length+'잔';$('lunchFinaleOrdersEmpty').hidden=data.orders.length!==0;orders.hidden=data.orders.length===0;
 for(const order of data.orders){const row=el('li','film-coffee-order'),name=el('span','film-coffee-order-name',order.name),drink=el('strong','film-coffee-order-drink',order.drink);row.append(name,drink);if(order.name===data.coffeeName){row.classList.add('is-courier');name.append(el('small','','배달'));}orders.append(row);}
 const names=data.names.length?data.names:[data.person],roll=$('lunchFinaleCreditRoll'),maker=lunchFinaleCredit('기획 · 제작','훈정스튜디오');roll.replaceChildren(maker,lunchFinaleCredit('오늘의 메뉴 수호대왕',data.person+' · '+data.menu),lunchFinaleCredit('커피 원정대장',data.coffeeName||'오늘은 모두 커피 패스'));
 if(result?.leagueFormat==='points'){const champions=scoreResultChampionNames();if(champions.length)roll.append(lunchFinaleCredit(champions.length>1?'누적 점수 공동 1위':'누적 점수 1위',champions.join(' · ')));}
 for(const name of names){const row=lunchFinaleCredit('오늘의 주연',name),order=data.orders.find(o=>o.name===name);if(order)row.append(el('small','film-credit-drink','주문 음료 · '+order.drink));roll.append(row);}
 const losing=data.nominations.filter(m=>m.id!==data.winnerId).map(m=>m.menus?.[0]).filter(Boolean);if(losing.length)roll.append(lunchFinaleCredit('함께 제안한 메뉴',[...new Set(losing)].join(' · '),true));
 roll.append(lunchFinaleCredit('특별 출연','아직 읽지 못한 메일',true),lunchFinaleCredit('소품 협찬','식판 · 도장 · 빈 커피잔',true),lunchFinaleCredit('가장 큰 공로','오늘도 자리를 지킨 여러분',true),lunchFinaleCredit('SPECIAL THANKS','같이 웃고, 같이 먹는 우리',true),el('p','film-credit-last','모두의 오후를 응원합니다. ✦'));
 const parade=$('lunchFinaleParade');parade.replaceChildren();const tags=[data.menu,'밥은 먹고 하자','오늘도 수고했어',data.coffeeName?'☕ '+data.coffeeName+' 출동':'커피는 잠깐 쉬어','메일은 잠시만','우리 모두 맛점!','점심은 진심','오후도 파이팅'],people=names.length<4?Array.from({length:4},(_,i)=>names[i%names.length]):names.slice(0,8);
 people.forEach((name,i)=>{const mascot=el('div','film-mascot');mascot.style.setProperty('--march-delay',(-i*.19)+'s');mascot.style.setProperty('--tilt',((i%2?1:-1)*(3+i%4))+'deg');mascot.style.setProperty('--mascot-color',['#b9d67e','#c5a0df','#eda992','#8dccca','#e6c675','#b6c6e4','#dcac98','#c1c7a0'][i%8]);mascot.dataset.odd=String(i%4);const sprite=el('div','film-mascot-sprite');sprite.innerHTML=deptAvatarSvg(['business','accounting','hotel','tourism','economics','japanese','translation','international'][i%8]);mascot.append(el('b','film-mascot-sign',tags[i%tags.length]),sprite,el('small','film-mascot-name',name));parade.append(mascot);});
 const final=$('lunchFinaleFinalMascots');final.innerHTML=deptAvatarSvg('business')+deptAvatarSvg('accounting')+deptAvatarSvg('hotel');
}
function lunchFinalePlan(data){
 const plan=lunchFinaleTimeline(data),creditDuration=plan.credits;lunchFinaleSceneTimes=plan.sceneTimes;lunchFinaleDuration=plan.duration;
 if(lunchFinaleDialog?.style?.setProperty)lunchFinaleDialog.style.setProperty('--film-credit-duration',creditDuration+'ms');
}
function lunchFinaleCreditLayout(){
 const roll=$('lunchFinaleCreditRoll'),window=roll?.parentElement;
 if(!roll?.style?.setProperty)return;
 roll.style.setProperty('--film-credit-start',Math.max(100,window?.clientHeight||300)+'px');
 roll.style.setProperty('--film-credit-end',(-Math.max(100,roll.scrollHeight||900))+'px');
}
function lunchFinaleSceneAt(elapsed){let scene=0;for(let i=1;i<lunchFinaleSceneTimes.length;i++)if(elapsed>=lunchFinaleSceneTimes[i])scene=i;return scene;}
function lunchFinaleAdvance(now=lunchFinaleNow()){
 if(!lunchFinaleDialog?.open)return;const elapsed=Math.max(0,now-lunchFinaleStartedAt);if(elapsed>=lunchFinaleDuration){lunchFinaleClose();return;}
 const scene=lunchFinaleSceneAt(elapsed);
 if(scene!==lunchFinaleCurrentScene){lunchFinaleCurrentScene=scene;lunchFinaleDialog.dataset.scene=String(scene);lunchFinaleDialog.style?.setProperty?.('--film-scene-delay',-Math.max(0,elapsed-lunchFinaleSceneTimes[scene])+'ms');lunchFinaleDialog.querySelectorAll('[data-film-scene]').forEach((node,i)=>{node.hidden=i!==scene;node.classList.toggle('is-current',i===scene);});$('lunchFinaleSceneName').textContent=lunchFinaleSceneLabels[scene];if(scene===3&&$('lunchFinaleParade').style?.setProperty)$('lunchFinaleParade').style.setProperty('--parade-start',Math.max(300,(lunchFinaleDialog.clientWidth||1000)-4)+'px');if(scene===4)lunchFinaleCreditLayout();lunchFinaleTone(scene);}
 $('lunchFinaleProgressFill').style.width=(elapsed/lunchFinaleDuration*100).toFixed(2)+'%';
}
function lunchFinaleOpen(replay=false){
 lunchFinaleSyncContext();if(netIsHost())lunchFinaleEnsureSchedule();const data=lunchFinaleScheduleCurrent()?lunchFinaleShared.data:null;if(!data||lunchFinaleNow()>=lunchFinaleLocalEnd||!replay&&lunchFinaleSeen.has(data.key))return false;
 lunchFinaleEnsureUI();lunchFinaleEnsureReplay();lunchFinaleBuild(data);lunchFinalePlan(data);lunchFinaleShownKey=data.key;lunchFinaleSeen.add(data.key);if(lunchFinaleSeen.size>20)lunchFinaleSeen.delete(lunchFinaleSeen.values().next().value);
 if(!lunchFinaleDialog.open)lunchFinaleFocus=document.activeElement;lunchFinaleStopSound();lunchFinaleCurrentScene=-1;lunchFinaleStartedAt=lunchFinaleLocalStart;if(!lunchFinaleDialog.open)lunchFinaleDialog.showModal();lunchFinaleAdvance();lunchFinaleDialog.focus({preventScroll:true});return true;
}
function lunchFinaleTick(){
 lunchFinaleSyncContext();const created=netIsHost()&&lunchFinaleEnsureSchedule();if(created&&typeof netPublish==='function'&&(typeof netApplying==='undefined'||!netApplying))netPublish();
 const data=lunchFinaleScheduleCurrent()?lunchFinaleShared.data:null;lunchFinaleEnsureReplay();if(lunchFinaleReplay)lunchFinaleReplay.hidden=true;
 if(!data){if(lunchFinaleDialog?.open)lunchFinaleClose();return;}
 if(lunchFinaleDialog?.open&&lunchFinaleShownKey!==data.key)lunchFinaleClose();
 // A browser dismissal must never expose the result controls during the shared film.
 if(!lunchFinaleDialog?.open&&lunchFinaleNow()<lunchFinaleLocalEnd)lunchFinaleOpen(true);else lunchFinaleAdvance();
}
setInterval(lunchFinaleTick,100);netRoom.onDisconnect(e=>{if(e.self||e.hostLost)lunchFinaleReset();});
/* END_LUNCH_FINALE_V2 */


/* PRACTICE_NORMAL_DIFFICULTY_V1 */
// Only the two legacy solo practices use these brains. Human multiplayer rules stay unchanged.
function practiceNormalSeed(value){let seed=2166136261;for(const c of String(value)){seed^=c.charCodeAt(0);seed=Math.imul(seed,16777619);}return seed>>>0;}
function practiceNormalRoll(brain){brain.randomState=(Math.imul(brain.randomState,1664525)+1013904223)>>>0;return brain.randomState/4294967296;}
function practiceNormalBrain(store,id,sessionId,t,index=0){
 let b=store.get(id);if(!b||b.normalSession!==sessionId||t<(b.lastTime??-1)-.05){
  b={seq:b?.seq||0,normalSession:sessionId,randomState:practiceNormalSeed(sessionId+':'+id),lastTime:t,targetId:'',targetUntil:0,next:t+.35+index*.08,attackNext:t+1.7+index*.2,beamNext:t+3.8+index*.5,jumpNext:t+.8,dash:t+2.8+index*.3};store.set(id,b);
 }
 b.lastTime=t;return b;
}
function practiceNormalTarget(brain,others,distance,t){
 let target=others.find(p=>p.id===brain.targetId);if(!target||t>=brain.targetUntil){const sorted=others.slice().sort((a,b)=>distance(a)-distance(b));target=sorted[practiceNormalRoll(brain)<.18&&sorted.length>1?1:0];brain.targetId=target?.id||'';brain.targetUntil=t+1.1+practiceNormalRoll(brain)*.65;}
 return target;
}
arcadeBotStep=function arcadeNormalBotStep(){
 const s=brawlState;if(netIsActive()||!arcadePractice||!s||s.phase!=='fight')return;const t=s.clock,alive=brawlAlive();
 for(const f of alive.filter(p=>p.id!=='practice-you')){
  const b=practiceNormalBrain(arcadePractice.bots,f.id,s.id,t,f.index);if(t<b.next)continue;b.next=t+.42+practiceNormalRoll(b)*.22;
  const send=(action,held=true)=>brawlHostInput(f.id,{seq:++b.seq,action,held}),other=practiceNormalTarget(b,alive.filter(p=>p!==f),p=>Math.abs(p.x-f.x),t);if(!other){send('sync',[]);continue;}
  // A missed read leaves a short opening instead of tracking perfectly every frame.
  if(t<(f.stun||0)||practiceNormalRoll(b)<.14){send('sync',[]);continue;}
  const dx=other.x-f.x+(practiceNormalRoll(b)-.5)*52,dy=other.y-f.y;send('sync',Math.abs(dx)>103?[dx>0?'right':'left']:[]);
  if(Math.abs(dx)<128&&Math.abs(dy)<70&&t>=b.attackNext){b.attackNext=t+1.65+practiceNormalRoll(b)*.75;if(practiceNormalRoll(b)<.74){send('attack');continue;}}
  const projectile=(s.projectiles||[]).some(p=>p.active&&p.owner!==f.id&&Math.abs(p.x-f.x)<85),canJump=(f.jumps||0)<2&&(f.jumps===0||practiceNormalRoll(b)<.35);
  if(canJump&&t>=b.jumpNext&&(dy>45||projectile&&practiceNormalRoll(b)<.35||Math.abs(dx)<105&&practiceNormalRoll(b)<.13)){send('jump');b.jumpNext=t+.9+practiceNormalRoll(b)*.55;continue;}
  if(Math.abs(dx)>250&&Math.abs(dx)<650&&Math.abs(dy)<65&&t>=b.beamNext){b.beamNext=t+4+practiceNormalRoll(b)*2;if(practiceNormalRoll(b)<.55)send('beam');}
 }
};
trayBotStep=function trayNormalBotStep(now){
 const w=trayState?.world;if(netIsActive()||!trayDemo||!w||w.phase!=='play')return;const t=w.elapsed,alive=w.players.filter(p=>!p.eliminated&&!p.forfeited),exists=z=>!!z&&(!Number.isFinite(z.goneAt)||z.goneAt>t),warned=z=>exists(z)&&Number.isFinite(z.warningAt)&&z.warningAt<=t;
 const tileAt=(x,y)=>{const col=Math.floor((x-70)/80),row=Math.floor((y-70)/80);return row>=0&&row<7&&col>=0&&col<7?w.tiles[row*7+col]:null;};
 for(const p of alive.filter(p=>p.id!=='tray-you')){
  const b=practiceNormalBrain(trayBotBrains,p.id,w.id,t,p.index);if(t<b.next)continue;b.next=t+.44+practiceNormalRoll(b)*.23;
  const send=(action,held)=>trayEngine.input(w,p.id,{seq:++b.seq,action,held},now),target=practiceNormalTarget(b,alive.filter(q=>q!==p),q=>Math.hypot(q.x-p.x,q.y-p.y),t);if(!target||practiceNormalRoll(b)<.12){send('sync',[]);continue;}
  let x=target.x+(practiceNormalRoll(b)-.5)*48,y=target.y+(practiceNormalRoll(b)-.5)*48,avoiding=false;
  const ahead=tileAt(p.x+Math.sign(x-p.x)*46,p.y+Math.sign(y-p.y)*46);
  // React to visible holes/red tiles, rather than reading their exact future collapse time.
  if(!exists(ahead)||warned(ahead)&&practiceNormalRoll(b)<.65){
   const safe=w.tiles.filter(z=>exists(z)&&!warned(z)).sort((a,b)=>Math.hypot(110+a.col*80-p.x,110+a.row*80-p.y)-Math.hypot(110+b.col*80-p.x,110+b.row*80-p.y))[0];
   if(safe){x=110+safe.col*80;y=110+safe.row*80;avoiding=true;}
  }
  const held=[];if(Math.abs(x-p.x)>26)held.push(x>p.x?'right':'left');if(Math.abs(y-p.y)>26)held.push(y>p.y?'down':'up');send('sync',held);
  if(!avoiding&&held.length&&Math.hypot(target.x-p.x,target.y-p.y)<91&&t>=b.dash){b.dash=t+4.2+practiceNormalRoll(b)*1.6;if(practiceNormalRoll(b)<.66)send('dash',true);}
 }
};
/* END_PRACTICE_NORMAL_DIFFICULTY_V1 */

/* COMBAT_ARENA_V1 */
const combatArenaCatalog={
 office:{name:'점심 직전 조교실',caption:'결재는 잠시. 내 메뉴부터.',sky:'#e3dfbd',floor:'#bea681',ink:'#625b46',platforms:[{left:145,right:335,y:65},{left:425,right:575,y:125},{left:665,right:855,y:65}],art:'<g stroke="#635a42" stroke-width="4"><rect x="180" y="47" width="220" height="118" rx="3" fill="#a7cad0"/><path d="M290 47v118m-110-58h220"/><rect x="650" y="37" width="210" height="135" fill="#cab48b"/><path d="M665 59h180m-180 31h180m-180 31h180" stroke="#f1e2b8"/><circle cx="532" cy="70" r="30" fill="#f6e8bd"/><path d="M532 49v23l15 7" fill="none" stroke-linecap="round"/></g><g stroke="#5c503b" stroke-width="4"><path d="M24 252h228v38H24zm711 0h247v38H735" fill="#a79168"/><path d="M50 290v32m174-32v32m537-32v32m191-32v32"/><path d="m45 226 88-8 8 34H39zm745-6 89 8-5 24h-91" fill="#f6eed1"/><path d="M64 237h48m697 0h44"/></g>'},
 cafeteria:{name:'급식실 최후의 반찬',caption:'반찬은 셀프. 승부도 셀프.',sky:'#f1d8ae',floor:'#a6b1a0',ink:'#7b573d',platforms:[{left:120,right:365,y:55},{left:420,right:580,y:100},{left:635,right:880,y:55}],art:'<g stroke="#72533f" stroke-width="4"><path d="M78 50h845v45H78z" fill="#d77d55"/><path d="M78 50h85v45H78zm170 0h85v45h-85zm170 0h85v45h-85zm170 0h85v45h-85zm170 0h85v45h-85z" fill="#f8e7bc"/><rect x="88" y="108" width="270" height="110" fill="#8ca9a0"/><path d="M223 108v110"/><rect x="653" y="106" width="246" height="109" fill="#796f56"/><path d="M681 131h95m-95 23h180m-180 23h153" stroke="#efe8bf"/><path d="M30 253h290v40H30zm650 0h320v40H650" fill="#b9c3b2"/><path d="M76 252v-39h84v39m-94-43h104" fill="#b4c4ba"/><path d="M834 252v-40h87v40m-98-44h108" fill="#b4c4ba"/></g>'},
 rooftop:{name:'옥상 바람 한 판',caption:'바람은 불어도 메뉴는 지킨다.',sky:'#a6c9cc',floor:'#aaa58c',ink:'#607078',platforms:[{left:155,right:315,y:85},{left:410,right:590,y:145},{left:685,right:845,y:85}],art:'<circle cx="785" cy="80" r="47" fill="#f3d19a"/><g fill="#8fa8ad" stroke="#61787f" stroke-width="3"><path d="M0 191h82v-56h69v56h77v-99h83v99h84v-48h88v48h83v-92h98v92h81v-61h82v61h78v-102h77v102h98v98H0z"/></g><g fill="none" stroke="#66777b" stroke-width="6"><path d="M0 240h1000M0 278h1000m-945-38v81m95-81v81m95-81v81m95-81v81m95-81v81m95-81v81m95-81v81m95-81v81m95-81v81m95-81v81"/></g><g stroke="#66705a" stroke-width="4"><path d="m25 287 92 0-9 35H34zm848 0h105l-11 35h-82" fill="#b98b66"/><path d="M57 284q-35-37 0-47 27 14 15 47m837 0q-25-48 8-47 30 24 18 47" fill="#91ab76"/></g>'},
 copier:{name:'복사실 용지 걸림',caption:'종이는 걸려도 승부는 안 걸린다.',sky:'#d6cce0',floor:'#b2a7b7',ink:'#72627d',platforms:[{left:105,right:310,y:65},{left:385,right:615,y:115},{left:690,right:895,y:65}],art:'<g stroke="#70637b" stroke-width="4"><path d="M0 90h1000" stroke="#a493b3"/><rect x="83" y="43" width="164" height="135" fill="#b1a2be"/><path d="M96 70h138m-138 36h138m-138 36h138"/><path d="M337 22h326v19H337z" fill="#f4edce"/><path d="M743 236v-69h184v69m-206 0h228v72H721z" fill="#a3a7b0"/><path d="M771 178h114v35H771z" fill="#dedccf"/><path d="M832 215h80v40h-80z" fill="#f6f0d9"/><path d="M40 279h205v39H40z" fill="#96879d"/><path d="m76 253 138 6-2 21H69z" fill="#f1ebd5"/><path d="m395 104 35-6 8 41-38 6zm207 58 43 8-7 36-41-8z" fill="#f4eed6"/></g>'},
 nightmarket:{name:'야시장 마지막 주문',caption:'불빛 아래 마지막 한 그릇.',sky:'#494d70',floor:'#948270',ink:'#4f485c',platforms:[{left:130,right:330,y:75},{left:425,right:575,y:120},{left:670,right:870,y:75}],art:'<circle cx="780" cy="66" r="31" fill="#ebdcaf"/><g fill="#eee0ac"><circle cx="323" cy="44" r="3"/><circle cx="590" cy="60" r="3"/><circle cx="714" cy="34" r="2"/><circle cx="888" cy="112" r="3"/></g><path d="M0 55q490 110 1000 0" fill="none" stroke="#342d45" stroke-width="5"/><g fill="#e4a368" stroke="#4e3f4d" stroke-width="3"><ellipse cx="116" cy="78" rx="13" ry="18"/><ellipse cx="287" cy="110" rx="13" ry="18"/><ellipse cx="482" cy="123" rx="13" ry="18"/><ellipse cx="690" cy="111" rx="13" ry="18"/><ellipse cx="887" cy="78" rx="13" ry="18"/></g><g stroke="#493b4b" stroke-width="4"><path d="M0 212 80 155h165l70 57z" fill="#b87666"/><path d="M15 212h285v100H15z" fill="#c0a076"/><path d="M40 237h235v42H40z" fill="#f0cc8d"/><path d="M687 212 753 151h169l78 61z" fill="#7d8b79"/><path d="M706 212h294v100H706z" fill="#af8d6e"/><path d="M735 237h232v42H735z" fill="#e7c182"/></g>'}
};
let combatFallbackArena='',combatFallbackMatch='';
function combatValidArena(id){return typeof id==='string'&&Object.prototype.hasOwnProperty.call(combatArenaCatalog,id);}
function combatChooseArena(previousId=''){
 const choices=Object.keys(combatArenaCatalog).filter(id=>id!==previousId);
 const index=typeof rand==='function'?rand(choices.length):Math.floor(Math.random()*choices.length);
 return choices[Math.max(0,Math.min(choices.length-1,index))];
}
function combatSeedArena(seed){let h=2166136261;for(const c of String(seed||'lunch')){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}const keys=Object.keys(combatArenaCatalog);return keys[(h>>>0)%keys.length];}
function combatArenaMarkup(id){const a=combatArenaCatalog[id];return '<svg class="combat-scenery-art" viewBox="0 0 1000 360" preserveAspectRatio="none" aria-hidden="true"><rect width="1000" height="360" fill="'+a.sky+'"/>'+a.art+'</svg>';}
function combatPaintStage(stage,id){
 if(!stage||!combatValidArena(id))return false;
 const a=combatArenaCatalog[id];stage.dataset.combatArena=id;stage.style.setProperty('--combat-floor',a.floor);stage.style.setProperty('--combat-trim',a.ink);
 let scene=stage.querySelector('.combat-scenery');
 if(!scene){scene=el('div','combat-scenery');scene.setAttribute('aria-hidden','true');stage.prepend(scene);}
 if(scene.dataset.arena!==id){scene.dataset.arena=id;scene.innerHTML=combatArenaMarkup(id);}
 let label=stage.querySelector('.combat-arena-sign');
 if(!label){label=el('div','combat-arena-sign');label.append(el('b'),el('span'));stage.append(label);}
 if(label.dataset.arena!==id){label.dataset.arena=id;label.querySelector('b').textContent=a.name;label.querySelector('span').textContent=a.caption;}
 stage.setAttribute('aria-label',a.name+' · 실시간 전투 경기장');return true;
}
function combatApplyArena(arenaId){
 const id=combatValidArena(arenaId)?arenaId:'office';
 for(const stageId of ['battleStage','brawlArena'])combatPaintStage($(stageId),id);
 return id;
}
function combatDuelArena(){
 const meta=typeof netDuelMeta!=='undefined'?netDuelMeta:null;
 if(combatValidArena(meta?.arenaId))return meta.arenaId;
 const match=meta?.id||(typeof duel!=='undefined'?duel?.id:'')||'local-duel';
 if(combatFallbackMatch!==match){combatFallbackMatch=match;combatFallbackArena=combatSeedArena(match);}
 return combatFallbackArena;
}
function combatDuelDepartment(side){
 const meta=typeof netDuelMeta!=='undefined'?netDuelMeta:null,id=side===0?meta?.challengerId:meta?.defenderId;
 if(id&&typeof netDepartment==='function')return netDepartment(id);
 const name=typeof duel!=='undefined'?duel?.[side===0?'challenger':'defender']:'';
 const member=typeof netMembers==='function'?netMembers().find(m=>m.name===name):null;
 return member&&typeof netDepartment==='function'?netDepartment(member.id):side===0?'business':'accounting';
}
function combatPaintDuel(){
 if(typeof duel==='undefined'||!duel?.fighters)return;
 combatPaintStage($('battleStage'),combatDuelArena());
 for(let i=0;i<2;i++){
  const actor=$('battleFighter'+i),sprite=actor?.querySelector('.battle-sprite');if(!actor||!sprite)continue;
  const department=combatDuelDepartment(i);
  if(actor.dataset.combatDepartment!==department){
   const holder=el('span');holder.innerHTML=deptAvatarSvg(department);const svg=holder.querySelector('svg'),old=sprite.querySelector('.battle-bowl');
   if(svg){svg.classList.add('battle-bowl','combat-gremlin');if(old)old.replaceWith(svg);else sprite.prepend(svg);actor.dataset.combatDepartment=department;}
  }
  actor.classList.add('combat-gremlin-fighter');
  actor.classList.toggle('is-punch',actor.classList.contains('is-attacking'));actor.classList.toggle('is-crouch',actor.classList.contains('is-guard'));actor.classList.toggle('is-jump',actor.classList.contains('is-air'));
 }
}
const combatPreviousActionRender=actionRender;
actionRender=function(...args){const out=combatPreviousActionRender(...args);combatPaintDuel();return out;};
function combatBrawlArena(spec){
 if(combatValidArena(spec?.arenaId))return spec.arenaId;
 if(typeof groupRoom!=='undefined'&&combatValidArena(groupRoom?.arenaId))return groupRoom.arenaId;
 return combatSeedArena(spec?.id||'practice');
}
function combatSetBrawlPlatforms(id){
 if(typeof arcadePlatforms==='undefined'||!Array.isArray(arcadePlatforms)||!combatValidArena(id))return;
 arcadePlatforms.splice(0,arcadePlatforms.length,...combatArenaCatalog[id].platforms.map(p=>({...p})));
}
const combatPreviousBrawlPrepare=brawlPrepare;
brawlPrepare=function(spec){
 const id=combatBrawlArena(spec);combatSetBrawlPlatforms(id);
 const out=combatPreviousBrawlPrepare(spec);if(out&&brawlState){brawlState.arenaId=id;combatPaintStage($('brawlArena'),id);}return out;
};
const combatPreviousBrawlRender=brawlRender;
brawlRender=function(...args){const out=combatPreviousBrawlRender(...args);if(typeof brawlState!=='undefined'&&brawlState){const id=combatValidArena(brawlState.arenaId)?brawlState.arenaId:combatBrawlArena(brawlState);combatPaintStage($('brawlArena'),id);}return out;};
/* END_COMBAT_ARENA_V1 */

/* WINNER_CEREMONY_V1 */
const awardSpeechMs=30000,awardHoldMs=4000,awardDraftIntervalMs=80;
let awardState=null,awardCompletion=null,awardClockOffset=0,awardInputSeq=0,awardLastInputSeq=0;
let awardDialog=null,awardUiKey='',awardDraftTimer=0,awardReturnFocus=null,awardLastPhase='';
let awardDraftLastSentAt=-Infinity,awardLastDraftText=null,awardComposing=false,awardConfirming=false;
function awardClone(value){return value?JSON.parse(JSON.stringify(value)):null;}
function awardText(value){return typeof value==='string'?Array.from(value.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim()).slice(0,100).join(''):null;}
function awardCurrent(){return !!awardState&&netIsActive()&&awardState.roomCode===String(netRoom.code||'')&&typeof result!=='undefined'&&result?.id===awardState.roundId;}
function awardBusy(){return awardCurrent()&&['speech','hold'].includes(awardState.phase);}
function awardPublicState(s){return awardClone({id:s.id,roomCode:s.roomCode,roundId:s.roundId,seq:s.seq,phase:s.phase,winnerId:s.winnerId,person:s.person,department:s.department,menu:s.menu,speech:s.speech,startAt:s.startAt,endAt:s.endAt,closeAt:s.closeAt});}
function awardGetState(){return awardCurrent()?{...awardPublicState(awardState),serverNow:Date.now()}:null;}
function awardPublish(){if(netIsHost()&&!netApplying)netPublish();}
function awardSetText(id,value){const node=$(id);if(node&&node.textContent!==String(value))node.textContent=String(value);}
function awardCancel(){
 clearTimeout(awardDraftTimer);awardDraftTimer=0;awardCompletion=null;awardState=null;awardClockOffset=0;awardInputSeq=0;awardLastInputSeq=0;awardDraftLastSentAt=-Infinity;awardLastDraftText=null;awardComposing=false;awardConfirming=false;awardUiKey='';awardLastPhase='';
 if(awardDialog?.open)awardDialog.close();if(awardReturnFocus?.isConnected)awardReturnFocus.focus({preventScroll:true});awardReturnFocus=null;
}
function awardStart(details,onComplete){
 if(!netIsHost()||!netIsActive()||!details||typeof result==='undefined'||result?.id!==details.roundId||typeof details.winnerId!=='string')return false;
 const winner=netMembers().find(m=>m.id===details.winnerId),menu=awardText(details.menu);
 if(!winner||!menu||Array.from(menu).length>20||typeof winner.name!=='string')return false;
 if(awardBusy()&&awardState.roundId===details.roundId&&awardState.winnerId===details.winnerId)return true;
 awardCancel();const now=Date.now();
 awardState={id:'award_'+now+'_'+rand(1000000),roomCode:String(netRoom.code||''),roundId:details.roundId,seq:1,phase:'speech',winnerId:winner.id,person:winner.name,department:typeof netDepartment==='function'?netDepartment(winner.id):String(details.department||'business'),menu,speech:'',startAt:now,endAt:now+awardSpeechMs,closeAt:now+awardSpeechMs+awardHoldMs};
 awardCompletion=typeof onComplete==='function'?onComplete:null;awardEnsureUI();awardRender();awardPublish();return true;
}
function awardCompleteFlow(reason='completed'){
 const state=awardState;if(!state)return;const complete=awardCompletion;
 const payload={roundId:state.roundId,winnerId:state.winnerId,menu:state.menu,speech:state.speech,reason};
 awardCompletion=null;awardCancel();awardPublish();if(complete)complete(payload);
}
function awardLock(){if(awardState?.phase!=='speech')return;awardState.phase='hold';awardState.seq++;awardRender();awardPublish();}
function awardHandle(senderId,cmd){
 if(typeof cmd?.t!=='string'||!cmd.t.startsWith('award'))return false;
 if(!netIsHost()||!awardCurrent()||!netMembers().some(m=>m.id===senderId))return true;
 const s=awardState;if(!['awardSpeech','awardConfirm'].includes(cmd.t)||cmd.awardId!==s.id||cmd.roundId!==s.roundId||senderId!==s.winnerId||!Number.isSafeInteger(cmd.seq)||cmd.seq<1||cmd.seq<=awardLastInputSeq)return true;
 const now=Date.now();if(s.phase!=='speech'||now>=s.endAt){if(s.phase==='speech')awardLock();return true;}
 const text=awardText(cmd.text);if(text===null)return true;
 awardLastInputSeq=cmd.seq;
 if(cmd.t==='awardConfirm'){s.speech=text;awardCompleteFlow();return true;}
 if(text===s.speech)return true;
 s.speech=text;s.seq++;awardRender();awardPublish();return true;
}
function awardValidate(data){
 if(!data||typeof data.id!=='string'||!data.id.startsWith('award_')||data.id.length>100||typeof data.roundId!=='string'||typeof result==='undefined'||data.roundId!==result?.id||data.roomCode!==String(netRoom.code||'')||!Number.isSafeInteger(data.seq)||data.seq<1||!['speech','hold'].includes(data.phase)||typeof data.winnerId!=='string'||typeof data.person!=='string'||Array.from(data.person).length>24||!data.person||typeof data.department!=='string'||data.department.length>50||typeof data.menu!=='string'||!data.menu||Array.from(data.menu).length>20||awardText(data.speech)!==data.speech)return false;
 if(!netMembers().some(m=>m.id===data.winnerId&&m.name===data.person)||![data.startAt,data.endAt,data.closeAt].every(n=>Number.isFinite(n)&&n>=0)||data.endAt-data.startAt!==awardSpeechMs||data.closeAt-data.endAt!==awardHoldMs)return false;
 return true;
}
function awardReceive(data){
 if(netIsHost())return false;if(!data){awardCancel();return false;}if(!netIsActive()||!awardValidate(data))return false;
 if(awardState&&(awardState.id===data.id?data.seq<awardState.seq:data.startAt<awardState.startAt))return false;
 const fresh=awardState?.id!==data.id;awardState=awardPublicState(data);awardCompletion=null;awardClockOffset=Number.isFinite(data.serverNow)?data.serverNow-Date.now():0;
 if(fresh){awardInputSeq=0;awardUiKey='';awardLastPhase='';clearTimeout(awardDraftTimer);awardDraftTimer=0;awardDraftLastSentAt=-Infinity;awardLastDraftText=null;awardComposing=false;awardConfirming=false;}
 awardEnsureUI();awardRender();return true;
}
function awardSendSpeech(){
 clearTimeout(awardDraftTimer);awardDraftTimer=0;const s=awardState;
 if(!awardCurrent()||awardConfirming||s.phase!=='speech'||s.winnerId!==netSelfId()||Date.now()+awardClockOffset>=s.endAt)return;
 const input=$('awardSpeechInput');if(!input)return;const text=awardText(input.value);if(text===null)return;
 if(!awardComposing&&Array.from(input.value).length>100)input.value=text;
 if(text===awardLastDraftText)return;awardLastDraftText=text;awardDraftLastSentAt=Date.now();
 netRoom.send({t:'awardSpeech',awardId:s.id,roundId:s.roundId,seq:++awardInputSeq,text});
}
function awardQueueSpeech(event){
 const s=awardState;if(!awardCurrent()||awardConfirming||s.phase!=='speech'||s.winnerId!==netSelfId()||Date.now()+awardClockOffset>=s.endAt)return;
 if(event?.isComposing===true)awardComposing=true;
 const input=$('awardSpeechInput');if(!input)return;
 awardSetText('awardSpeechMessage',awardText(input.value)||'우승자가 마이크를 잡고 있어요…');
 const delay=awardDraftIntervalMs-(Date.now()-awardDraftLastSentAt);
 if(delay<=0||s.endAt-(Date.now()+awardClockOffset)<250){awardSendSpeech();return;}
 if(!awardDraftTimer){const id=s.id,roundId=s.roundId;awardDraftTimer=setTimeout(()=>{awardDraftTimer=0;if(awardState?.id===id&&awardState.roundId===roundId)awardSendSpeech();},delay);}
}
function awardConfirmSpeech(){
 const s=awardState;if(!awardCurrent()||awardConfirming||s.phase!=='speech'||s.winnerId!==netSelfId()||Date.now()+awardClockOffset>=s.endAt)return;
 const input=$('awardSpeechInput'),text=awardText(input?.value);if(text===null)return;
 clearTimeout(awardDraftTimer);awardDraftTimer=0;awardComposing=false;awardConfirming=true;awardRender();
 // Carry the latest draft atomically, including text still waiting on the 80ms live update.
 const sent=netRoom.send({t:'awardConfirm',awardId:s.id,roundId:s.roundId,seq:++awardInputSeq,text});
 if(sent===false&&awardState?.id===s.id){awardConfirming=false;awardRender();}
}
function awardEnsureUI(){
 if(awardDialog)return;awardDialog=el('dialog','winner-award');awardDialog.id='winnerAwardDialog';awardDialog.setAttribute('aria-labelledby','awardTitle');
 awardDialog.innerHTML='<div class="award-spotlights" aria-hidden="true"></div><div class="award-confetti" aria-hidden="true">✦　▱　✧　▰　✦　▱　✧　▰　✦</div><header class="award-header"><span>THE LUNCH AWARDS · 오늘의 주인공</span><h2 id="awardTitle">잠시만요,<br><em>우승자 입장합니다.</em></h2><p id="awardMenu"></p></header><div class="award-body"><section class="award-stage" aria-label="우승 캐릭터 시상대"><div class="award-crown" aria-hidden="true">♛</div><div id="awardCharacter" class="award-character" aria-hidden="true"></div><div class="award-podium"><strong>1</strong><span id="awardWinnerName"></span></div><span class="award-stage-note">발표는 진지하게. 표정은 마음대로.</span></section><section class="award-speech" aria-labelledby="awardSpeechTitle"><div class="award-speech-heading"><h3 id="awardSpeechTitle">우승 소감</h3><span class="award-time"><b id="awardSeconds">30</b>초</span></div><p id="awardSpeechMessage" class="award-bubble" aria-live="polite"></p><div id="awardSpeechForm"><label for="awardSpeechInput">우승자만 30초 동안 입력할 수 있어요</label><textarea id="awardSpeechInput" rows="2" maxlength="200" placeholder="제 메뉴를 믿어주셔서… 아무도 안 믿었지만 감사합니다." aria-describedby="awardInputHint"></textarea><div class="award-input-row"><small id="awardInputHint">입력 즉시 자동 공유 · 100자까지</small><button id="awardSpeechConfirm" type="button">확인 · 다음으로</button></div></div><p id="awardAudience" class="award-audience"></p><p id="awardStatus" class="award-status" role="status"></p></section></div><footer class="award-footer"><span>점심결재 대작전</span><span>잠깐의 영광, 든든한 한 끼.</span></footer>';
 document.body.append(awardDialog);awardDialog.addEventListener('cancel',e=>e.preventDefault());
 $('awardSpeechInput').addEventListener('input',awardQueueSpeech);
 $('awardSpeechInput').addEventListener('compositionstart',()=>{awardComposing=true;});
 $('awardSpeechInput').addEventListener('compositionend',()=>{awardComposing=false;awardQueueSpeech();});
 $('awardSpeechConfirm').addEventListener('click',awardConfirmSpeech);
}
function awardRender(){
 if(!awardCurrent()){if(awardDialog?.open)awardDialog.close();return;}awardEnsureUI();const s=awardState,self=netSelfId(),own=s.winnerId===self,active=s.phase==='speech'&&Date.now()+awardClockOffset<s.endAt;
 if(awardUiKey!==s.id){awardUiKey=s.id;const shared=result?.scoreWinnerId===s.winnerId&&(result.scoreChampionIds?.length||0)>1,names=shared?scoreResultChampionNames():[];awardSetText('awardWinnerName',s.person+' 님'+(shared?' · 공동 1위 대표':''));awardSetText('awardMenu',shared?'공동 1위 '+names.join(' · ')+' · 대표 메뉴 '+s.menu:result?.leagueFormat==='points'?s.person+' 님 누적 점수 1위! · '+s.menu:s.person+' 님이 지켜낸 '+s.menu+'!');$('awardCharacter').innerHTML=deptAvatarSvg(s.department);$('awardSpeechInput').value=s.speech;}
 awardDialog.dataset.phase=s.phase;awardDialog.dataset.winner=String(own);awardSetText('awardSeconds',Math.max(0,Math.ceil((s.endAt-Date.now()-awardClockOffset)/1000)));
 const speech=own&&active?awardText($('awardSpeechInput').value):s.speech;
 awardSetText('awardSpeechMessage',speech||(active?'우승자가 마이크를 잡고 있어요…':'말보다 메뉴로 보여드리겠습니다.'));
 $('awardSpeechForm').hidden=!own;$('awardSpeechInput').disabled=!own||!active||awardConfirming;$('awardSpeechConfirm').disabled=!own||!active||awardConfirming;
 awardSetText('awardSpeechConfirm',awardConfirming?'이동 중…':'확인 · 다음으로');
 awardSetText('awardAudience',own?'소감을 쓴 뒤 확인을 누르면 바로 다음 순서로 이동해요.':s.person+' 님이 소감을 마치고 확인하면 다음 순서로 이어져요.');
 const phaseKey=s.phase+':'+String(awardConfirming);
 if(awardLastPhase!==phaseKey){awardLastPhase=phaseKey;awardSetText('awardStatus',awardConfirming?'확인을 전달하고 있어요…':s.phase==='speech'?'쓰는 대로 자동 공유 · 확인하지 않으면 시간이 끝난 뒤 자동으로 넘어가요.':'소감 마감! 박수와 함께 다음 순서로 넘어갑니다.');}
 if(!awardDialog.open){awardReturnFocus=document.activeElement;awardDialog.showModal();if(own&&active)$('awardSpeechInput').focus({preventScroll:true});else $('awardTitle').setAttribute('tabindex','-1'),$('awardTitle').focus({preventScroll:true});}
}
function awardHousekeep(){
 if(!awardState)return;if(!awardCurrent()){awardCancel();return;}
 if(netIsHost()){
  if(!netMembers().some(m=>m.id===awardState.winnerId)){awardCompleteFlow('winner-left');return;}
  if(awardState.phase==='speech'&&Date.now()>=awardState.endAt)awardLock();
  if(awardState?.phase==='hold'&&Date.now()>=awardState.closeAt){awardCompleteFlow();return;}
 }
 awardRender();
}
setInterval(awardHousekeep,100);netRoom.onDisconnect(event=>{if(event.self||event.hostLost)awardCancel();});
/* END_WINNER_CEREMONY_V1 */

/* CHAMPIONSHIP_FLOW_V1 */
// The five-round score ledger decides the championship. Menu objections are
// optional after the ceremony and never change this recorded score result.
let championshipLastArena='',championshipControlKey='';
const championshipAwardsSeen=new Set();
function championshipCurrent(){return netIsActive()&&lunchDecisionActive()&&lunchDecisionState?.championship===true;}
function championshipPresent(){return championshipCurrent()?lunchDecisionRequired():[];}
function championshipArena(){const id=typeof combatChooseArena==='function'?combatChooseArena(championshipLastArena):'office';championshipLastArena=id;return id;}
function championshipReview(notice){
 const s=lunchDecisionState;if(!netIsHost()||!championshipCurrent())return false;
 if(!championshipPresent().some(p=>p.id===s.winnerId))return lunchDecisionRetainScores()||lunchDecisionResetMeal('메뉴 제안자가 방을 나가 메뉴를 다시 고릅니다.');
 s.phase='review';s.duelKind='';s.duelId='';s.challengerId='';s.defenderId='';s.notice=notice||'누적 점수와 최종 순위가 확정됐어요. 점심 메뉴는 모두 승낙하거나 남은 1회의 메뉴 이의를 신청할 수 있어요. 메뉴 이의로 경기 순위는 바뀌지 않아요.';s.seq++;netPhase='result';netDuelMeta=null;
 renderResult();netPublish();return true;
}
function championshipAward(){
 const s=lunchDecisionState;if(!netIsHost()||!championshipCurrent())return false;
 const scoreWinnerId=result.scoreWinnerId||s.tournamentChampionId,winner=championshipPresent().find(p=>p.id===scoreWinnerId);
 if(!winner)return lunchDecisionRetainScores('점수전 대표 우승자가 방을 나갔어요.')||lunchDecisionResetMeal('점수전 대표 우승자가 방을 나가 메뉴를 다시 고릅니다.');
 const key=s.roundId+':score';
 if(championshipAwardsSeen.has(key))return championshipReview();championshipAwardsSeen.add(key);if(championshipAwardsSeen.size>120)championshipAwardsSeen.delete(championshipAwardsSeen.values().next().value);
 if(typeof groupCancel==='function')groupCancel();if(typeof cancelActionDuel==='function')cancelActionDuel();
 const shared=(result.scoreChampionIds||[]).map(id=>s.participants.find(p=>p.id===id)).filter(Boolean);
 s.phase='award';s.duelKind='';s.duelId='';s.challengerId='';s.defenderId='';s.notice=(shared.length>1?'누적 점수 공동 1위 '+shared.map(p=>p.name).join(' · ')+'! 추첨된 대표 '+winner.name+' 님의 우승 소감이에요.':winner.name+' 님이 누적 점수 1위! 우승 소감을 들려주세요.')+' 30초 안에 입력하고 확인하면 이어집니다.';s.seq++;netPhase='result';netDuelMeta=null;
 renderResult();
 const roundId=s.roundId;
 if(typeof awardStart!=='function'){championshipReview();return true;}
 const okay=awardStart({roundId,winnerId:winner.id,person:winner.name,menu:winner.menu,department:netDepartment(winner.id)},event=>{
  if(!netIsHost()||!championshipCurrent()||lunchDecisionState.roundId!==roundId||lunchDecisionState.phase!=='award')return;
  if(event?.reason==='winner-left'||!championshipPresent().some(p=>p.id===scoreWinnerId))lunchDecisionRetainScores('시상식 대표 우승자가 방을 나갔어요.')||lunchDecisionResetMeal('시상식 대표 우승자가 방을 나가 메뉴를 다시 고릅니다.');
  else championshipReview();
 });
 if(okay===false)championshipReview();else netPublish();return true;
}
function championshipBegin(){
 const s=lunchDecisionState;if(!netIsHost()||!lunchDecisionActive()||s.championship===true)return false;
 s.championship=true;s.qualifiedIds=[];s.qualifierId='';s.duelKind='';s.seq++;
 return championshipAward();
}
const championshipTournamentFinish=netFinishMenuTournament;
netFinishMenuTournament=function(state){const out=championshipTournamentFinish(state);if(out&&netIsHost()&&lunchDecisionActive())championshipBegin();return out;};
const championshipPrepareLocal=netPrepareLocal;
netPrepareLocal=function(...args){
 if(netIsHost()&&championshipCurrent()&&netDuelMeta){netDuelMeta.arenaId=netDuelMeta.arenaId||championshipArena();netDuelMeta.lunchDecisionId=lunchDecisionState.roundId;netDuelMeta.tournamentChampionId=lunchDecisionState.tournamentChampionId;netDuelMeta.duelKind='objection';netDuelMeta.qualifiedIds=[];}
 const out=championshipPrepareLocal(...args);championshipPaint();return out;
};
const championshipClear=lunchDecisionClear;
lunchDecisionClear=function(){championshipControlKey='';if(typeof awardCancel==='function')awardCancel();if(typeof groupCancel==='function')groupCancel();return championshipClear();};
function championshipPaint(){
 if(typeof document==='undefined')return;
 const s=championshipCurrent()?lunchDecisionState:null,key=s?[s.phase,duel?.phase,netPhase].join('|'):'';if(championshipControlKey===key)return;championshipControlKey=key;
 const cancel=$('duelCancelBtn');if(cancel){cancel.disabled=false;cancel.title='메뉴 이의를 취소해도 신청 기회는 사용됩니다. 누적 점수와 순위는 바뀌지 않아요.';}
}
setInterval(()=>{if(championshipCurrent())championshipPaint();},200);
/* END_CHAMPIONSHIP_FLOW_V1 */

/* LOBBY_MAIN_V1 */
let lobbyBonusGames=null;
function lobbyAttachBonus(){
 if(lobbyBonusGames&&!lobbyBonusGames.isConnected&&$('arcadeMenu'))$('arcadeMenu').append(lobbyBonusGames);
 if(lobbyBonusGames)lobbyBonusGames.hidden=netIsActive();
}
const lobbyEnsureArcade=arcadeEnsureUI;
arcadeEnsureUI=function(...args){const out=lobbyEnsureArcade(...args);lobbyAttachBonus();return out;};
const lobbyRenderArcade=arcadeRender;
arcadeRender=function(...args){const out=lobbyRenderArcade(...args);lobbyAttachBonus();return out;};
function lobbyMainInstall(){
 const copy=document.querySelector('#roomLobby .room-lobby-copy'),tray=copy?.querySelector('.arcade-try-tray'),home=$('fiveArcadeTryBtn');if(!copy||!tray||!home)return;
 home.className='btn lobby-play-button';home.textContent='게임 해보기';const arrow=el('span','','↗');arrow.setAttribute('aria-hidden','true');home.append(arrow);home.setAttribute('aria-haspopup','dialog');
 lobbyBonusGames=el('section','lobby-bonus-games');lobbyBonusGames.setAttribute('aria-labelledby','lobbyBonusTitle');const head=el('div','lobby-bonus-head'),title=el('h3','','조금 더 놀기');title.id='lobbyBonusTitle';head.append(title,el('p','','난투와 커피도 가볍게 맛봐요.'));const games=el('div','lobby-bonus-grid');
 for(const [id,label]of [['arcadeTryBtn','밤티 난투 ↗'],['arcadeCoffeeTryBtn','커피 폭탄 ☕'],['trayTryBtn','식판 서바이벌 ↗']]){const button=$(id);if(!button)continue;button.className='btn lobby-bonus-button';button.textContent=label;button.addEventListener('click',()=>{arcadeClearKeys();if(arcadeDialog?.open)arcadeDialog.close();},true);games.append(button);}
 lobbyBonusGames.append(head,games);tray.replaceChildren(home,el('small','','30종 미니게임 · 혼자 가볍게 한 판'));
 const art=el('div','lobby-friends');art.setAttribute('aria-hidden','true');art.append(el('span','lobby-friends-note','밥 먹고 하자.'));
 const scene=el('div','lobby-friends-scene');
 for(const [index,department]of ['accounting','business','hotel'].entries()){const friend=el('div','lobby-friend lobby-friend-'+index),sprite=el('div','lobby-friend-sprite');sprite.innerHTML=deptAvatarSvg(department);friend.append(el('span','lobby-friend-prop',['☕','🍚','🥄'][index]),sprite,el('i','lobby-friend-shadow'));scene.append(friend);}
 art.append(el('span','lobby-friends-star star-one','✦'),el('span','lobby-friends-star star-two','✧'),scene,el('span','lobby-friends-caption','오늘도 점심은 진심'));
 const intro=copy.querySelector('p');intro.textContent='메뉴 고민은 잠깐, 한 판 웃고 같이 밥 먹자!';intro.classList.add('lobby-welcome-line');intro.before(art);copy.classList.add('has-lobby-friends');
 const rules=copy.querySelector('.room-lobby-rules');if(rules)tray.after(rules);
 $('roomLobby').classList.add('lobby-with-friends');lobbyAttachBonus();
}
/* END_LOBBY_MAIN_V1 */

arcadeInstall();arcadeTenInstall();arcadeExtraInstall();lobbyMainInstall();
/* FIVE_NEW_GAMES_END */
/* CAMPUS_DEPARTMENT_PICKER */
let deptPracticeChoice='',deptPracticePending=null,deptPickerAfterClose=null,deptPickerReturnFocus=null;
function deptPickerNetworkChoice(){const self=netSelfId();return netHasDepartment(self)?netDepartment(self):'';}
function deptPickerCreate(){
 const wrap=el('div','net-department-wrap');
 wrap.innerHTML='<div class="campus-picker-heading"><label for="deptPickerOpen">내 캐릭터 · 학과/전공</label><span>학과·전공 118개</span></div><button id="deptPickerOpen" class="campus-picker-open" type="button" aria-haspopup="dialog"><span>직접 골라야 출전할 수 있어요</span><strong>? 캐릭터 선택</strong><b aria-hidden="true">선택 →</b></button><select id="netDepartment" aria-label="내 캐릭터 · 학과/전공" hidden tabindex="-1"></select><p id="netPassiveDesc"></p><small>학과별 옷과 소품을 고르는 선택이에요. 경기 능력치는 모두 같아요. <a href="https://www.daegu.ac.kr/intro/0" target="_blank" rel="noopener">학교 공식 학과 안내 ↗</a></small>';
 const select=wrap.querySelector('#netDepartment'),blank=el('option','','캐릭터를 선택해주세요');blank.value='';select.append(blank);
 for(const d of deptOptions){const option=el('option','',d.name);option.value=d.id;select.append(option);}select.value='';
 select.addEventListener('change',event=>{const value=event.target.value;if(!netReady[netSelfId()]&&deptById.has(value))netRoom.send({t:'department',value});deptPickerSync();if(typeof deptAvatarPreview==='function')deptAvatarPreview();});
 wrap.querySelector('#deptPickerOpen').addEventListener('click',()=>deptPickerOpen('network'));return wrap;
}
function deptPickerEnsureDialog(){
 let dialog=$('deptPickerDialog');if(dialog)return dialog;
 dialog=el('dialog','campus-picker-dialog');dialog.id='deptPickerDialog';dialog.setAttribute('aria-labelledby','deptPickerTitle');
 dialog.innerHTML='<header class="campus-picker-head"><div><span>오늘의 밥친구</span><h2 id="deptPickerTitle">학과를 닮은 캐릭터</h2></div><button id="deptPickerClose" class="tiny-btn" type="button" aria-label="학과 선택 닫기">닫기</button></header><div class="campus-picker-tools"><label for="deptSearch">학과 찾기</label><input id="deptSearch" type="search" autocomplete="off" placeholder="학과명 또는 예전 학과명으로 검색" aria-describedby="deptSearchCount"><div id="deptCollegeButtons" class="campus-colleges" role="group" aria-label="대학·학부별 보기"></div><output id="deptSearchCount" aria-live="polite"></output></div><div id="deptCharacterCards" class="campus-character-cards" aria-label="학과 캐릭터 선택"></div><footer class="campus-picker-footer"><button id="deptPickerMore" class="tiny-btn" type="button">더 보기</button><span>같은 학과도 함께 선택할 수 있어요.</span></footer>';
 document.body.append(dialog);dialog.dataset.college='';dialog.dataset.limit='24';
 for(const name of ['',...new Set(deptOptions.map(d=>d.college))]){const button=el('button','campus-college',name||'전체');button.type='button';button.dataset.college=name;button.setAttribute('aria-pressed',String(!name));button.addEventListener('click',()=>{dialog.dataset.college=name;dialog.dataset.limit='24';deptPickerFilter();});$('deptCollegeButtons').append(button);}
 $('deptSearch').addEventListener('input',()=>{dialog.dataset.limit='24';deptPickerFilter();});
 $('deptPickerMore').addEventListener('click',()=>{dialog.dataset.limit=String(Number(dialog.dataset.limit)+24);deptPickerFilter();});
 $('deptPickerClose').addEventListener('click',deptPickerCancel);
 dialog.addEventListener('cancel',()=>{deptPracticePending=null;deptPickerAfterClose=null;});
 dialog.addEventListener('close',()=>{
  const resume=deptPickerAfterClose,focus=deptPickerReturnFocus;deptPracticePending=null;deptPickerAfterClose=null;deptPickerReturnFocus=null;
  if(resume)resume();else if(focus?.isConnected)focus.focus({preventScroll:true});
 });return dialog;
}
function deptPickerCancel(){deptPracticePending=null;deptPickerAfterClose=null;$('deptPickerDialog')?.close();}
function deptPickerOpen(context='network',pending=null){
 if(context==='practice'?netIsActive():netReady[netSelfId()])return;
 const dialog=deptPickerEnsureDialog();deptPracticePending=context==='practice'&&typeof pending==='function'?pending:null;deptPickerAfterClose=null;deptPickerReturnFocus=document.activeElement;
 dialog.dataset.context=context;dialog.dataset.limit='24';deptPickerFilter();if(!dialog.open)dialog.showModal();$('deptSearch').focus({preventScroll:true});
}
function deptPracticeRequire(callback){
 if(netIsActive())return false;if(deptById.has(deptPracticeChoice))return true;deptPickerOpen('practice',callback);return false;
}
function deptPickerSelect(id){
 const dialog=$('deptPickerDialog');if(!dialog?.open||!deptById.has(id))return;
 if(dialog.dataset.context==='practice'){
  if(netIsActive()){deptPickerCancel();return;}deptPracticeChoice=id;deptPracticeSync();deptPickerAfterClose=deptPracticePending;deptPracticePending=null;dialog.close();return;
 }
 if(netReady[netSelfId()])return;const select=$('netDepartment');select.value=id;select.dispatchEvent(new Event('change',{bubbles:true}));dialog.close();
}
function deptPickerFilter(){
 const dialog=$('deptPickerDialog');if(!dialog)return;const query=deptSearchKey($('deptSearch').value),college=dialog.dataset.college,current=dialog.dataset.context==='practice'?deptPracticeChoice:deptPickerNetworkChoice();
 const found=deptOptions.filter(d=>(!college||d.college===college)&&(!query||deptSearchKey([d.name,d.short,d.college,...d.aliases].join(' ')).includes(query)));
 const cards=$('deptCharacterCards'),fragment=document.createDocumentFragment(),limit=Number(dialog.dataset.limit||24);
 for(const d of found.slice(0,limit)){const button=el('button','campus-character-card');button.type='button';button.dataset.department=d.id;button.setAttribute('aria-pressed',String(d.id===current));button.setAttribute('aria-label',d.name+' 캐릭터 선택');const portrait=el('span','campus-character-art');portrait.innerHTML=deptAvatarSvg(d.id);button.append(portrait,el('strong','',d.name),el('small','',d.college));if(/모집중지|2027|계약/.test(d.status))button.append(el('em','',/모집중지/.test(d.status)?'재학생 전공':d.status));button.addEventListener('click',()=>deptPickerSelect(d.id));fragment.append(button);}
 cards.replaceChildren(fragment);$('deptSearchCount').textContent=found.length?found.length+'개 중 '+Math.min(limit,found.length)+'개 표시 · 캐릭터를 누르면 선택돼요':'찾는 학과가 없어요. 다른 이름으로 검색해주세요.';
 $('deptPickerMore').hidden=found.length<=limit;
 for(const button of $('deptCollegeButtons').children)button.setAttribute('aria-pressed',String(button.dataset.college===college));
}
function deptPickerSync(){
 const wrap=document.querySelector('.net-department-wrap');if(!wrap)return;const ready=!!netReady[netSelfId()],select=$('netDepartment'),current=deptPickerNetworkChoice();select.value=current;
 const option=current?deptOption(current):null,button=$('deptPickerOpen');button.disabled=ready;button.dataset.selected=String(!!option);button.querySelector('strong').textContent=option?option.name:'? 캐릭터 선택';button.querySelector('b').textContent=ready?'준비 완료':option?'변경 →':'선택 →';button.setAttribute('aria-label',option?'학과·캐릭터 고르기 · 현재 '+option.name:'캐릭터 미선택 · 캐릭터 선택하기');
 const dialog=$('deptPickerDialog');if(ready&&dialog?.open&&dialog.dataset.context!=='practice')deptPickerCancel();
}
function deptPracticeSync(){
 const menu=$('arcadeMenu');if(!menu)return;let bar=$('deptPracticeBar');
 if(!bar){bar=el('div','campus-practice-character');bar.id='deptPracticeBar';bar.innerHTML='<span class="campus-practice-art" aria-hidden="true"></span><div><small>연습할 내 캐릭터</small><strong id="deptPracticeName"></strong><span id="deptPracticeHint"></span></div><button id="deptPracticeOpen" type="button" class="tiny-btn" aria-haspopup="dialog"></button>';$('arcadeTournamentBtn').before(bar);$('deptPracticeOpen').addEventListener('click',()=>deptPickerOpen('practice'));}
 bar.hidden=netIsActive();const chosen=deptById.has(deptPracticeChoice),signature=chosen?deptPracticeChoice:'unselected';
 if(bar.dataset.department!==signature){bar.dataset.department=signature;bar.querySelector('.campus-practice-art').innerHTML=chosen?deptAvatarSvg(deptPracticeChoice):deptUnselectedSvg();$('deptPracticeName').textContent=chosen?deptOption(deptPracticeChoice).name:'? 캐릭터를 골라주세요';$('deptPracticeHint').textContent=chosen?'선택한 캐릭터로 모든 연습 게임에 참가해요.':'먼저 고르면 컴퓨터 친구들과 한 판 시작!';$('deptPracticeOpen').textContent=chosen?'캐릭터 변경':'? 캐릭터 선택';}
}
const deptPickerSetupBase=renderSetup;renderSetup=function(){const out=deptPickerSetupBase.apply(this,arguments);deptPickerSync();return out;};
const deptPracticeEnsureBase=arcadeEnsureUI;arcadeEnsureUI=function(){const out=deptPracticeEnsureBase.apply(this,arguments);deptPracticeSync();return out;};
const deptPracticeRenderBase=arcadeRender;arcadeRender=function(){const out=deptPracticeRenderBase.apply(this,arguments);deptPracticeSync();return out;};
/* END_CAMPUS_DEPARTMENT_PICKER */

/* DUEL_SINGLE_CONTROLS_V1 */
let duelControlsLocalSide=0,duelControlsLastKey='',duelControlsView=null;
function duelControlsOnline(){return typeof netActionOnline==='function'?netActionOnline():typeof netIsActive==='function'&&netIsActive();}
function duelControlsSide(){if(!duelControlsOnline())return duelControlsLocalSide;const side=typeof netActionSide==='function'?netActionSide():typeof netSelfSide==='function'?netSelfSide():-1;return side===0||side===1?side:-1;}
function duelControlsElements(){
 const view=typeof $==='function'?$('duelView'):document.getElementById('duelView');if(!view)return null;
 if(duelControlsView?.view===view)return duelControlsView;
 const controls=view.querySelector('.battle-controls'),panels=controls?[...controls.querySelectorAll('.battle-control-panel')]:[];if(!controls||panels.length!==2)return null;
 const toolbar=document.createElement('div');toolbar.className='duel-control-toolbar';toolbar.id='duelControlToolbar';
 const label=document.createElement('label');label.htmlFor='duelControlSideSelect';label.textContent='터치 조작 대상';
 const select=document.createElement('select');select.id='duelControlSideSelect';select.setAttribute('aria-label','이 기기에서 터치로 조작할 캐릭터');
 for(const [value,text]of [[0,'도전자'],[1,'방어자']]){const option=document.createElement('option');option.value=String(value);option.textContent=text;select.append(option);}
 const note=document.createElement('span');note.id='duelControlPadNote';toolbar.append(label,select,note);controls.before(toolbar);
 const spectator=document.createElement('p');spectator.id='duelSpectatorControls';spectator.className='duel-spectator-controls';spectator.hidden=true;spectator.textContent='관전 중이에요. 두 선수의 승부를 지켜봐 주세요.';controls.after(spectator);
 select.addEventListener('change',()=>{if(duelControlsOnline())return;const side=Number(select.value);if(side!==0&&side!==1)return;if(typeof actionReleaseAll==='function')actionReleaseAll();duelControlsLocalSide=side;duelControlsLastKey='';duelControlsRefresh();});
 duelControlsView={view,controls,panels,toolbar,label,select,note,spectator};return duelControlsView;
}
function duelControlsRefresh(){
 if(typeof document==='undefined')return;const ui=duelControlsElements();if(!ui)return;
 if(typeof mode==='undefined'||mode!=='duel'||!duel||ui.view.hidden){ui.toolbar.hidden=true;ui.spectator.hidden=true;duelControlsLastKey='';return;}
 const online=duelControlsOnline(),side=duelControlsSide(),phase=duel.phase||'idle',names=[duel.challenger||'도전자',duel.defender||'방어자'];
 const key=[online,side,duel.id||'',phase,names.join('|')].join(':');if(key===duelControlsLastKey)return;duelControlsLastKey=key;
 ui.controls.dataset.singlePad='true';ui.controls.dataset.controlSide=String(side);ui.view.dataset.singleDuelPad='true';
 ui.controls.hidden=online&&side<0;ui.spectator.hidden=!ui.controls.hidden;ui.toolbar.hidden=online&&side<0;ui.label.hidden=online;ui.select.hidden=online;ui.select.value=String(duelControlsLocalSide);
 ui.note.textContent=online?'내 캐릭터 키패드 · 이동과 공격을 함께 누를 수 있어요.':'화면에는 선택한 캐릭터 키패드만 보여요. 두 사람의 키보드는 모두 사용할 수 있어요.';
 for(let i=0;i<2;i++){
  const panel=ui.panels[i],own=i===side;panel.hidden=!own;panel.setAttribute('aria-label',(online?'내 캐릭터':names[i])+' 조작 키패드');
  const title=panel.querySelector('strong');if(title)title.textContent=names[i]+(online?' · 내 조작':' · 터치 조작');
  const hint=panel.querySelector('.battle-key-hint');if(hint)hint.textContent=online?'A/D 또는 ←/→ 이동 · W/↑ 점프 · F/K 공격 · G/L 방어':i===0?'A / D 이동 · W 점프 · F 공격 · G 방어':'← / → 이동 · ↑ 점프 · K 공격 · L 방어';
  ui.select.options[i].textContent=(i===0?'도전자 · ':'방어자 · ')+names[i];
  for(const button of panel.querySelectorAll('[data-battle-action]')){
   const action=button.dataset.battleAction,labels={left:'왼쪽 이동',right:'오른쪽 이동',jump:'점프',attack:'공격',guard:'방어'},keys=online?{left:'A / ←',right:'D / →',jump:'W / ↑',attack:'F / K',guard:'G / L'}:i===0?{left:'A',right:'D',jump:'W',attack:'F',guard:'G'}:{left:'←',right:'→',jump:'↑',attack:'K',guard:'L'};
   button.setAttribute('aria-label',(online?'내 캐릭터':names[i])+' '+(labels[action]||action));const kbd=button.querySelector('kbd');if(kbd)kbd.textContent=keys[action]||'';
  }
 }
 const instructions=ui.view.querySelector('.battle-instructions');if(instructions)instructions.textContent=online?(side<0?'관전자에게는 조작 키패드가 표시되지 않아요.':'내 키패드 하나로 조작해요. 왼손은 이동, 오른손은 점프·공격·방어! 머리를 밟으면 추가 피해를 줘요.'):'터치 조작 대상을 바꿔 하나의 키패드로 조종해요. 키보드는 A/D/W/F/G와 방향키/K/L 두 사람 모두 그대로 사용할 수 있어요.';
 const intro=ui.view.querySelector('.battle-intro p');if(intro)intro.textContent=online?'내 기기에서는 내 캐릭터만 조작해요. 점프로 머리를 밟고, 방어로 공격을 버티세요.':'터치는 한 키패드로, 키보드는 두 사람 그대로! 점프와 공격으로 메뉴를 지켜요.';
 if(online&&['idle','paused'].includes(phase)){const status=typeof $==='function'?$('battleStatus'):document.getElementById('battleStatus');if(status)status.textContent=side<0?'관전 중 · 두 선수의 준비를 기다리고 있어요.':'내 캐릭터 준비 완료를 누르세요. 내 키패드만 표시되며 키보드는 두 방식 모두 사용할 수 있어요.';}
}
const duelControlsBaseActionControls=actionControls;
actionControls=function(...args){const out=duelControlsBaseActionControls(...args);duelControlsRefresh();return out;};
const duelControlsBaseNetRefresh=netRefreshCombatControls;
netRefreshCombatControls=function(...args){const out=duelControlsBaseNetRefresh(...args);duelControlsRefresh();return out;};
const duelControlsBaseRender=actionRender;
actionRender=function(...args){const out=duelControlsBaseRender(...args);duelControlsRefresh();return out;};
setInterval(duelControlsRefresh,200);
/* END_DUEL_SINGLE_CONTROLS_V1 */
/* DEVICE_UI_V1: presentation preferences stay on this device, outside room state. */
function deviceLayoutFor(width,height,coarse,wideFine){
 if(wideFine&&width>=1100&&height>=650)return 'desktop';
 if(width<=720)return 'phone';
 if(coarse||(width<1100&&height<=600))return 'touch-wide';
 return 'compact';
}
const deviceCoarse=matchMedia('(pointer:coarse)'),deviceWideFine=matchMedia('(min-width:1100px) and (min-height:650px) and (hover:hover) and (pointer:fine)');
let deviceLayout='',deviceInfoOpen=false,deviceRoomMode='create',deviceResizeFrame=0;
function deviceIsTouchLayout(){return deviceLayout==='phone'||deviceLayout==='touch-wide';}
function deviceSetText(node,value){if(node&&node.textContent!==value)node.textContent=value;}
function deviceTouchRule(text=''){
 return text.replace(/Space/gi,'액션 버튼').replace(/방향키/g,'이동 버튼').replace(/A\s*\/\s*W\s*\/\s*D/g,'왼쪽·가운데·오른쪽 버튼').replace(/←\s*\/\s*→/g,'좌우 버튼').replace(/↑\s*\/\s*↓/g,'위아래 버튼').replace(/↑로/g,'위 버튼으로').replace(/\bA\b/g,'왼쪽 버튼').replace(/\bW\b/g,'가운데 버튼').replace(/\bD\b/g,'오른쪽 버튼').replace(/버튼로/g,'버튼으로').replace(/버튼를/g,'버튼을').replace(/버튼는/g,'버튼은').replace(/버튼가/g,'버튼이').replace(/버튼와/g,'버튼과');
}
function deviceSetRoomMode(mode,focus=false){
 if(!['create','join'].includes(mode)||$('roomNickname')?.disabled)return false;
 deviceRoomMode=mode;deviceRenderRoom();
 if(focus)$(mode==='create'?'deviceCreateTab':'deviceJoinTab')?.focus();
 return true;
}
function deviceRenderRoom(){
 const lobby=$('roomLobby');if(!lobby||!$('deviceRoomTabs'))return;
 const mobile=deviceIsTouchLayout(),busy=!!$('roomNickname')?.disabled;
 lobby.dataset.roomMode=deviceRoomMode;
 for(const mode of ['create','join']){
  const tab=$(mode==='create'?'deviceCreateTab':'deviceJoinTab'),pane=$(mode==='create'?'deviceCreatePane':'deviceJoinPane'),selected=mode===deviceRoomMode;
  tab.disabled=busy;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;
  if(mobile){pane.setAttribute('role','tabpanel');pane.setAttribute('aria-labelledby',tab.id);}
  else{pane.removeAttribute('role');pane.removeAttribute('aria-labelledby');}
 }
}
function deviceInstallRoom(){
 const form=document.querySelector('.room-lobby-form'),create=$('roomCreateBtn'),divider=form?.querySelector('.room-divider'),codeLabel=form?.querySelector('label[for="roomCodeInput"]'),joinRow=form?.querySelector('.room-join-row');
 if(!form||!create||!divider||!codeLabel||!joinRow||$('deviceRoomTabs'))return;
 const tabs=el('div','device-room-tabs');tabs.id='deviceRoomTabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','점심방 참여 방법');
 const createPane=el('section','device-room-pane'),joinPane=el('section','device-room-pane');createPane.id='deviceCreatePane';joinPane.id='deviceJoinPane';
 form.insertBefore(tabs,create);form.insertBefore(createPane,create);createPane.append(create);form.insertBefore(joinPane,divider);joinPane.append(divider,codeLabel,joinRow);
 for(const [mode,label,id,pane]of [['create','새 방 만들기','deviceCreateTab',createPane],['join','초대 코드로 입장','deviceJoinTab',joinPane]]){
  const button=el('button','device-room-tab',label);button.id=id;button.type='button';button.dataset.deviceUiControl='true';button.setAttribute('role','tab');button.setAttribute('aria-controls',pane.id);button.addEventListener('click',()=>deviceSetRoomMode(mode));
  button.addEventListener('keydown',event=>{let next;if(['ArrowLeft','Home'].includes(event.key))next='create';else if(['ArrowRight','End'].includes(event.key))next='join';if(next){event.preventDefault();deviceSetRoomMode(next,true);}});tabs.append(button);
 }
 deviceRoomMode=$('roomCodeInput').value.trim()?'join':'create';
 // Observe transport-owned busy fields, never the new buttons themselves.
 const observer=new MutationObserver(deviceRenderRoom);for(const id of ['roomNickname','roomConsent'])observer.observe($(id),{attributes:true,attributeFilter:['disabled']});
 $('roomNickname').addEventListener('keydown',event=>{if(event.key!=='Enter'||!deviceIsTouchLayout())return;event.preventDefault();event.stopImmediatePropagation();const button=$(deviceRoomMode==='create'?'roomCreateBtn':'roomJoinBtn');if(!button.disabled)button.click();},true);
 deviceRenderRoom();
}
function deviceEnsureGameUI(){
 if(!arcadeDialog)return;
 const strip=arcadeDialog.querySelector('.five-round-strip');if(!strip||$('deviceInfoToggle'))return;
 const own=el('span','device-own-summary');own.id='deviceOwnSummary';
 const hint=el('span','device-input-hint');hint.id='deviceInputHint';
 const rule=el('p','device-rule-summary');rule.id='deviceRuleSummary';
 const toggle=el('button','device-info-toggle','규칙·점수');toggle.id='deviceInfoToggle';toggle.type='button';toggle.dataset.deviceUiControl='true';toggle.setAttribute('aria-controls','arcadeHelp arcadeRoster');toggle.addEventListener('click',()=>{deviceInfoOpen=!deviceInfoOpen;deviceRenderGame();});
 strip.append(own,hint,toggle,rule);deviceRenderGame();
}
function deviceRenderGame(){
 if(!arcadeDialog)return;
 const state=arcadeState,phase=state?.phase||'menu',mobile=deviceIsTouchLayout(),expanded=!mobile||deviceInfoOpen||phase==='done';
 arcadeDialog.dataset.deviceLayout=deviceLayout;arcadeDialog.dataset.infoOpen=String(deviceInfoOpen);arcadeDialog.dataset.sessionPhase=phase;
 const toggle=$('deviceInfoToggle');if(!toggle)return;
 toggle.setAttribute('aria-expanded',String(expanded));toggle.hidden=!mobile||!state||phase==='invite'||phase==='done';deviceSetText(toggle,expanded?'정보 접기':'규칙·점수');
 const game=arcadeGames[state?.world?.game||state?.chosen],self=arcadeSelf(),own=state?.members.find(member=>member.id===self),player=state?.world?.players.find(p=>p.id===self);
 const points=state?.format==='points',summary=!own||own.response!=='join'?'관전':points?'내 누적 '+(state.totalPoints?.[self]||0)+'점':state?.world?.game==='parking'?'내 주차 '+(player?.parked||0)+'대':state?.world?.meta?.roundSurvival?(player?.eliminated?'이번 판 관전':typeof player?.hp==='number'?'내 체력 '+Math.ceil(player.hp)+'HP':'생존 · '+'♥'.repeat(Math.max(0,player?.health||0))):'내 점수 '+Math.round(player?.score||0)+'점';
 const rules=game?.hint||'매판 순위 점수를 더해요.';deviceSetText($('deviceOwnSummary'),summary);deviceSetText($('deviceRuleSummary'),mobile?deviceTouchRule(rules):rules);if(mobile)deviceSetText($('arcadeHelp'),deviceTouchRule(rules));
 const dpad=$('arcadeDpad'),keys=(dpad&&!dpad.hidden?'이동 WASD / 방향키 · ':'')+(game?.key||'Space');deviceSetText($('deviceInputHint'),mobile?'화면 버튼으로 조작':keys);
 if(mobile&&game){
  const hint=$('arcadeActionHint'),current=hint?.textContent||'';
  // Preserve live cooldown/retrieval feedback; only replace the keyboard prompt.
  deviceSetText(hint,current===game.key?(game.key?.includes('두 번')||game.key?.includes('두번')?'두 번 눌러 조절':state?.world?.game==='sneak'?'길게 누르기':'버튼을 눌러 실행'):deviceTouchRule(current));
  const status=$('arcadeStatus');if(status)deviceSetText(status,deviceTouchRule(status.textContent));
 }
}
function deviceRefreshLayout(){
 deviceResizeFrame=0;const next=deviceLayoutFor(innerWidth,innerHeight,deviceCoarse.matches,deviceWideFine.matches);
 if(next!==deviceLayout){deviceLayout=next;document.body.dataset.deviceLayout=next;document.body.dataset.inputMode=deviceIsTouchLayout()?'touch':'keyboard';if(typeof arcadeClearKeys==='function')arcadeClearKeys();}
 deviceRenderRoom();deviceRenderGame();
}
const deviceBaseEnsureArcade=arcadeEnsureUI;
arcadeEnsureUI=function(...args){const value=deviceBaseEnsureArcade(...args);deviceEnsureGameUI();return value;};
const deviceBaseRenderArcade=arcadeRender;
arcadeRender=function(...args){const value=deviceBaseRenderArcade(...args);deviceRenderGame();return value;};
const scheduleDeviceLayout=()=>{if(!deviceResizeFrame)deviceResizeFrame=requestAnimationFrame(deviceRefreshLayout);};
window.addEventListener('resize',scheduleDeviceLayout);for(const query of [deviceCoarse,deviceWideFine])query.addEventListener('change',scheduleDeviceLayout);
deviceRefreshLayout();deviceInstallRoom();
/* END_DEVICE_UI_V1 */
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
/* GAME_VISUALS_V1 — local, bounded aiming cues and readable action states. */
const gameVisualKinds={sneak:'race',dodge:'arena',coins:'arena',stamp:'timing',runner:'race',brawl:'arena',kart:'race',basket:'aim',doors:'decision',rhythm:'timing',tray:'arena',pong:'court',curling:'court',bowling:'court',volley:'court',golf:'court',parking:'court',dodgeball:'arena',crown:'arena',lasers:'arena',frogger:'race',bridge:'race',claw:'aim',memory:'decision',sorter:'decision',receipt:'decision',safe:'decision',auction:'decision',stacker:'timing',reaction:'timing'};
const gameVisualAxes={sneak:'up',dodge:'all',coins:'all',stamp:'none',runner:'none',brawl:'all',kart:'all',basket:'horizontal',doors:'none',rhythm:'none',tray:'all',pong:'vertical',curling:'horizontal',bowling:'horizontal',volley:'horizontal',golf:'horizontal',parking:'all',dodgeball:'all',crown:'all',lasers:'all',frogger:'all',bridge:'all',claw:'horizontal',memory:'none',sorter:'none',receipt:'none',safe:'horizontal',auction:'none',stacker:'none',reaction:'none'};
const gameVisualCooldowns={dodge:['dashReadyAt',1.8],coins:['dashReadyAt',2],brawl:['hitReadyAt',.55],kart:['dashReadyAt',2.4],basket:['shotReadyAt',.78],tray:['dashReadyAt',2.1],dodgeball:['throwReadyAt',.72],crown:['dashReadyAt',2.25],lasers:['dashReadyAt',1.65],frogger:['leapReadyAt',1.25],bridge:['buildReadyAt',.28],claw:['hookReadyAt',.4],pong:['readyAt',.68],volley:['readyAt',.42],parking:['readyAt',.25]};
function gameVisualNumber(value,fallback=0){return Number.isFinite(value)?value:fallback;}
function gameVisualAction(w,p,g={}){
 const t=gameVisualNumber(w.elapsed),game=w.game,base=g.action||'시작!',out={verb:base,state:'ready',ready:1};
 if(!p||p.forfeited||p.eliminated)return{verb:'관전 중',state:'watch',ready:0};
 if(w.phase!=='play')return{verb:w.phase==='countdown'?'준비!':'한 판 끝',state:'watch',ready:0};
 if(t<gameVisualNumber(p.respawnUntil)||t<gameVisualNumber(p.stunUntil))return{verb:'회복 중',state:'recover',ready:0};
 const spec=gameVisualCooldowns[game];if(spec){const left=Math.max(0,gameVisualNumber(p[spec[0]])-t);out.ready=Math.max(0,Math.min(1,1-left/spec[1]));if(left>.02)out.state='cooling';}
 if(game==='sneak'){out.verb=w.meta.signal==='green'?'달려!':'손 떼기';out.state=w.meta.signal==='green'?'ready':'stop';}
 if(game==='runner')out.verb=p.jumpHeight>.01?(p.jumpVy<0?'착지 예약':'점프 중'):'점프!';
 if(game==='coins')out.verb='돌진!';
 if(game==='brawl')out.verb='펀치!';
 if(game==='stamp'&&p.lastStampStage===w.meta.stage){out.verb='다음 도장';out.state='watch';}
 if(['curling','bowling','golf'].includes(game)){
  out.verb=p.phase==='power'?(game==='bowling'?'투구!':game==='golf'?'퍼팅!':'발사!'):game==='curling'&&p.phase==='moving'?'슥슥 쓸기':'파워 시작';
  if(p.phase==='power'){out.state='charge';out.ready=Math.max(0,Math.min(1,gameVisualNumber(p.power)));}
  else if(['between','done'].includes(p.phase)||p.phase==='moving'&&game!=='curling'){out.state='watch';out.verb=p.phase==='done'?'완료!':'이동 중';}
  if(game==='bowling'&&p.phase==='moving')out.verb='←→ 커브';
 }
 if(game==='volley')out.verb='받아쳐!';
 if(game==='parking')out.verb='브레이크';
 if(game==='bridge'){out.verb=p.finishedAt>=0?'완성!':p.carried?'다리 놓기':'나무 줍기';if(!p.carried||p.finishedAt>=0)out.state='watch';}
 if(game==='claw'){out.verb=p.hookState==='down'?'조기 회수':p.hookState==='up'?'회수 중':'집게 내리기';if(p.hookState==='up')out.state='watch';}
 if(['memory','safe'].includes(game)&&w.meta.phase==='watch'){out.state='watch';out.verb='보고 기억!';}
 if(game==='reaction'){out.state=p.locked?'watch':w.meta.signal==='go'?'ready':w.meta.signal==='fake'?'stop':'watch';out.verb=p.locked?'다음 신호':w.meta.signal==='go'?'지금 찍어!':'아직 기다려';}
 if(['doors','memory','sorter','receipt','auction'].includes(game)&&(p.locked||p.choiceLocked)&&game!=='auction'){out.state='watch';out.verb='선택 완료';}
 if(game==='safe'&&p.locked){out.state='watch';out.verb='금고 열림!';}
 if(['doors','memory','sorter','receipt','safe','auction'].includes(game)&&w.meta.phase==='reveal'){out.state='watch';out.verb='결과 확인';}
 return out;
}
function gameVisualLine(x,y,dx,dy,length){
 const d=Math.hypot(dx,dy)||1,ux=dx/d,uy=dy/d,ex=x+ux*length,ey=y+uy*length;
 return 'M'+x.toFixed(2)+' '+y.toFixed(2)+' L'+ex.toFixed(2)+' '+ey.toFixed(2)+' M'+(ex-ux*12-uy*7).toFixed(2)+' '+(ey-uy*12+ux*7).toFixed(2)+' L'+ex.toFixed(2)+' '+ey.toFixed(2)+' L'+(ex-ux*12+uy*7).toFixed(2)+' '+(ey-uy*12-ux*7).toFixed(2);
}
function gameVisualCone(x,y,dx,dy,radius,halfAngle=1.52){
 const angle=Math.atan2(dy,dx),a=angle-halfAngle,b=angle+halfAngle;
 return 'M'+x.toFixed(2)+' '+y.toFixed(2)+' L'+(x+Math.cos(a)*radius).toFixed(2)+' '+(y+Math.sin(a)*radius).toFixed(2)+' A'+radius+' '+radius+' 0 0 1 '+(x+Math.cos(b)*radius).toFixed(2)+' '+(y+Math.sin(b)*radius).toFixed(2)+' Z';
}
function gameVisualPreview(w,p){
 const out={line:'',zone:'',ring:null,target:null,caption:''};if(!p)return out;
 const x=gameVisualNumber(p.x),y=gameVisualNumber(p.y),game=w.game;
 // Only show the direction already chosen. Future paths, landing points and hit targets stay hidden.
 if(['curling','bowling','golf'].includes(game)&&['ready','power'].includes(p.phase)){
  const aim=gameVisualNumber(p.aim),golf=game==='golf';out.line=gameVisualLine(golf?x:350,golf?y:418,golf?Math.cos(aim):Math.sin(aim),golf?Math.sin(aim):-Math.cos(aim),65);
 }else if(game==='basket'){
  const aim=gameVisualNumber(p.aim,90)*Math.PI/180;out.line=gameVisualLine(x,y-30,Math.cos(aim),-Math.sin(aim),45);
 }else if(game==='parking'){
  const aim=gameVisualNumber(p.angle);out.line=gameVisualLine(x,y,Math.cos(aim),Math.sin(aim),32);
 }else if(['brawl','coins','tray','dodgeball','crown','dodge','lasers'].includes(game)){
  const dx=gameVisualNumber(p.faceX,gameVisualNumber(p.dirX,gameVisualNumber(p.dx,1))),dy=gameVisualNumber(p.faceY,gameVisualNumber(p.dirY,gameVisualNumber(p.dy)));
  out.line=gameVisualLine(x,y,dx,dy,32);
 }else if(game==='frogger')out.line=gameVisualLine(x,y,gameVisualNumber(p.faceCol),gameVisualNumber(p.faceRow,1),22);
 else if(game==='claw')out.line=gameVisualLine(gameVisualNumber(p.hookX,350),gameVisualNumber(p.hookY,100),0,p.hookState==='up'?-1:1,24);
 return out;
}
let gameVisualView=null;
function gameVisualAttr(node,key,value){const next=String(value);if(node.getAttribute(key)!==next)node.setAttribute(key,next);}
function gameVisualSvg(parent){
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.classList.add('gv-field-lines');svg.setAttribute('viewBox','0 0 700 460');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');
 const zone=document.createElementNS(ns,'path'),line=document.createElementNS(ns,'path'),ring=document.createElementNS(ns,'circle'),target=document.createElementNS(ns,'circle');zone.classList.add('gv-range-zone');line.classList.add('gv-aim-line');ring.classList.add('gv-target-ring');target.classList.add('gv-contact-target');svg.append(zone,line,ring,target);parent.append(svg);return{svg,zone,line,ring,target};
}
function gameVisualBuild(w){
 const board=$('arcadeBoard');if(!board)return;board.dataset.visualKind=gameVisualKinds[w.game]||'arena';board.dataset.visualArena=w.game==='brawl'?['cafeteria','rooftop','office'][(gameVisualNumber(w.seed)>>>0)%3]:'';
 const view={key:w.id+':'+w.game,main:null,courts:new Map(),health:new Map()};gameVisualView=view;
 if(['basket','brawl','coins','tray','dodgeball','crown','dodge','lasers','frogger','bridge','claw'].includes(w.game))view.main=gameVisualSvg($('arcadeScenery'));
 if(typeof arcadeSportsPanels!=='undefined'&&gameVisualKinds[w.game]==='court'){
  const root=$('arcadeSportsCourts');if(root&&w.players.some(p=>p.id===arcadeSelf())){root.classList.add('gv-focused');root.style.setProperty('--gv-rivals',String(Math.max(1,w.players.length-1)));}
  for(const p of w.players){const panel=arcadeSportsPanels.get(p.id);if(!panel||p.id!==arcadeSelf())continue;view.courts.set(p.id,gameVisualSvg(panel.field));}
 }
 if(w.game==='brawl')for(const p of w.players){const actor=arcadeUIActors.get(p.id);if(!actor)continue;const bar=el('span','gv-health'),fill=el('i');bar.setAttribute('role','meter');bar.setAttribute('aria-label',p.name+' 체력');bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax','100');bar.append(fill);actor.append(bar);view.health.set(p.id,{bar,fill});}
}
function gameVisualPaint(shape,preview,visible,state){
 gameVisualAttr(shape.svg,'display',visible?'block':'none');shape.svg.dataset.state=state;if(!visible)return;gameVisualAttr(shape.line,'d',preview.line);gameVisualAttr(shape.zone,'d',preview.zone);
 for(const [node,point]of [[shape.ring,preview.ring],[shape.target,preview.target]]){gameVisualAttr(node,'display',point?'block':'none');if(point){gameVisualAttr(node,'cx',point.x.toFixed(2));gameVisualAttr(node,'cy',point.y.toFixed(2));gameVisualAttr(node,'r',point.r);}}
}
const gameVisualBuildBase=arcadeBuildBoard;
arcadeBuildBoard=function(w){const result=gameVisualBuildBase(w);gameVisualBuild(w);return result;};
const gameVisualDrawBase=arcadeDrawWorld;
arcadeDrawWorld=function(s,w,g,self){
 const result=gameVisualDrawBase(s,w,g,self);if(!gameVisualView||gameVisualView.key!==w.id+':'+w.game)gameVisualBuild(w);const view=gameVisualView,own=w.players.find(p=>p.id===self);if(!view)return result;
 const action=gameVisualAction(w,own,g),playing=s.phase==='round'&&w.phase==='play',visible=!!own&&!own.eliminated&&!own.forfeited;
 const board=$('arcadeBoard');if(board){board.dataset.visualState=action.state;board.dataset.visualPhase=String(w.meta.phase||'play');}
 if(view.main)gameVisualPaint(view.main,own?gameVisualPreview(w,own):{line:'',zone:'',ring:null,target:null},visible&&playing,action.state);
 for(const [id,shape]of view.courts){const p=w.players.find(player=>player.id===id);gameVisualPaint(shape,p?gameVisualPreview(w,p):{line:'',zone:'',ring:null,target:null},!!p&&playing&&!p.forfeited,action.state);}
 for(const p of w.players){const health=view.health.get(p.id);if(!health)continue;const hp=Math.max(0,Math.min(100,gameVisualNumber(p.hp)));health.fill.style.width=hp+'%';health.bar.dataset.low=String(hp<=28);gameVisualAttr(health.bar,'aria-valuenow',Math.ceil(hp));}
 const dpad=$('arcadeDpad');if(dpad){const axes=gameVisualAxes[w.game]||'all';dpad.dataset.visualAxes=axes;for(const direction of ['up','down','left','right']){const key=dpad.querySelector('[data-arcade-control="'+direction+'"]');if(!key)continue;const used=axes==='all'||axes==='horizontal'&&['left','right'].includes(direction)||axes==='vertical'&&['up','down'].includes(direction)||axes==='up'&&direction==='up';key.hidden=!used;}if(axes==='none')dpad.hidden=true;}
 const button=arcadeDialog?.querySelector('[data-arcade-control="action"]');if(button){button.dataset.visualState=action.state;button.style.setProperty('--gv-ready',action.ready.toFixed(3));gameVisualAttr(button,'aria-label',action.verb);if(playing&&own&&!button.hidden)arcadeSetText('arcadeActionLabel',action.verb);}
 return result;
};
/* END_GAME_VISUALS_V1 */
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

safeRead();showSetup();if(!canStore)$('storageNote').textContent='이번 게임은 정상 진행돼요. 이 환경에서는 기록 저장이 제한돼요.';
})();


;

(function decorateArcade(assets){
  'use strict';
  const $=id=>document.getElementById(id);
  const tones=['mint','lilac','lemon'];
  function make(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
  function food(name,category){
    if(assets.foods[name])return assets.foods[name];
    // Extra shared menus inherit artwork from the source's existing food set.
    if(/밥|덮밥|카레|리조토|오므라이스/.test(name))return {emoji:'🍛',tone:'peach'};
    if(/찌개|국|탕|수제비/.test(name))return {emoji:'🍲',tone:'lemon'};
    if(/면|우동|라멘|소바|팟타이|칼국수/.test(name))return {emoji:'🍜',tone:'sky'};
    if(/포케|샐러드/.test(name))return {emoji:'🥗',tone:'leaf'};
    if(/초밥|김밥|주먹밥|회덮밥/.test(name))return {emoji:'🍙',tone:'mint'};
    if(/피자|파스타/.test(name))return {emoji:'🍝',tone:'tomato'};
    if(/햄버거|샌드위치|토스트/.test(name))return {emoji:'🍔',tone:'lemon'};
    const categoryMenu={'한식':'국밥','중식':'짜장면','일식':'김밥','양식':'돈가스','아시안':'쌀국수','간편식':'햄버거','가벼운식':'비빔밥'}[category];
    if(categoryMenu&&assets.foods[categoryMenu])return assets.foods[categoryMenu];
    let hash=0;for(const c of name)hash=(hash*31+c.codePointAt(0))>>>0;
    return {letter:Array.from(name)[0]||'밥',tone:['sand','lemon','leaf','peach','mint','lilac','pink','sky'][hash%8]};
  }
  function sticker(name,category,rotation=-6){const f=food(name,category),node=make('span','arcade-sticker t-'+f.tone);node.setAttribute('aria-hidden','true');node.style.setProperty('--rot',rotation+'deg');if(f.emoji)node.textContent=f.emoji;else node.append(make('span','arcade-letter',f.letter));return node;}
  function svg(markup,className){const wrap=make('span',className);wrap.setAttribute('aria-hidden','true');wrap.innerHTML=markup;return wrap;}
  function hero(){const side=document.querySelector('.hero .dossier');if(!side||side.querySelector('.arcade-hero-illustration'))return;side.prepend(svg(assets.hero,'arcade-hero-illustration'));}
  function players(){document.querySelectorAll('#players>.player').forEach((card,i)=>{if(card.querySelector('.arcade-player-slots'))return;const names=[...card.querySelectorAll('.nominee .choice-line')].map(n=>n.textContent);const slots=make('span','arcade-player-slots');for(let j=0;j<1;j++){const slot=make('span','arcade-slot'+(names[j]?' filled':''));if(names[j])slot.append(sticker(names[j],null,j?-3:-9),make('span','arcade-slot__name',names[j]));else slot.append(make('span','arcade-empty-plus','+'),make('span','arcade-slot__empty','후보 '+(j+1)));slots.append(slot);}const hint=card.querySelector('.player-hint');card.insertBefore(slots,hint);card.style.setProperty('--person-tone',tones[i]||'mint');});}
  function menus(){document.querySelectorAll('#menuGrid>.menu-btn').forEach((button,i)=>{if(button.querySelector('.arcade-sticker'))return;const nameNode=[...button.children].find(n=>n.tagName==='SPAN'&&!n.classList.contains('menu-category'));if(!nameNode)return;const name=nameNode.textContent,category=button.querySelector('.menu-category')?.textContent;button.append(sticker(name,category,i%2?-3:-8));});}
  function racers(){document.querySelectorAll('#raceCourse .runner').forEach(token=>{if(token.querySelector('.arcade-cart-wrap'))return;const menu=token.querySelector('.runner-menu')?.textContent||'점심';token.append(svg(assets.cart,'arcade-cart-wrap'),sticker(menu,null,-5));});updateMotion();}
  function updateMotion(){const count=$('countdown')?.textContent||'';const view=$('raceView');if(view)view.dataset.arcadeMoving=String(!view.hidden&&(/출발|질주|임박/.test(count))&&!/추첨/.test(count));}
  function result(){const heading=$('winningMenu');if(!heading||!heading.textContent)return;let art=document.querySelector('#resultView .arcade-result-art');if(!art){art=make('div','arcade-result-art');heading.before(art);}const name=heading.textContent;if(art.dataset.menu!==name){art.dataset.menu=name;art.replaceChildren(svg(assets.steam,'arcade-result-steam'),sticker(name,null,-7));}document.querySelectorAll('#resultNominations .submitted-row').forEach(row=>{if(row.querySelector('.arcade-sticker'))return;const menu=row.querySelector('strong')?.textContent.split(' · ')[0]||'';if(menu)row.prepend(sticker(menu,null,-7));});}
  hero();players();menus();racers();result();
  const observe=(id,fn,options={childList:true})=>{const target=$(id);if(!target)return;let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;fn();});}).observe(target,options);};
  observe('players',players);observe('menuGrid',menus);observe('raceCourse',racers);observe('countdown',updateMotion,{childList:true,subtree:true,characterData:true});observe('winningMenu',result,{childList:true,subtree:true,characterData:true});
})({"hero":"<svg class=\"hero-art\" viewBox=\"0 0 320 262\" aria-hidden=\"true\" focusable=\"false\">\n        <rect x=\"46\" y=\"28\" width=\"220\" height=\"226\" rx=\"18\" fill=\"#1b1813\"/>\n        <rect x=\"36\" y=\"18\" width=\"220\" height=\"226\" rx=\"18\" fill=\"#f07a22\" stroke=\"#1b1813\" stroke-width=\"4\"/>\n        <rect x=\"56\" y=\"48\" width=\"180\" height=\"180\" rx=\"6\" fill=\"#fffaf0\" stroke=\"#1b1813\" stroke-width=\"3\"/>\n        <rect x=\"110\" y=\"6\" width=\"72\" height=\"34\" rx=\"9\" fill=\"#ede2c8\" stroke=\"#1b1813\" stroke-width=\"4\"/>\n        <rect x=\"128\" y=\"15\" width=\"36\" height=\"9\" rx=\"4.5\" fill=\"#1b1813\"/>\n        <path d=\"M72 70 h96 M72 86 h62\" stroke=\"#1b1813\" stroke-width=\"5\" stroke-linecap=\"round\"/>\n        <path d=\"M72 212 h150\" stroke=\"#1b1813\" stroke-width=\"2.5\" stroke-dasharray=\"6 6\"/>\n        <g class=\"steam\" fill=\"none\" stroke=\"#1b1813\" stroke-width=\"3.5\" stroke-linecap=\"round\">\n          <path d=\"M122 120 c-8 -9 8 -15 0 -26\"/><path d=\"M146 116 c-8 -9 8 -15 0 -26\"/><path d=\"M170 120 c-8 -9 8 -15 0 -26\"/>\n        </g>\n        <path d=\"M200 98 L232 160 M211 93 L240 152\" stroke=\"#1b1813\" stroke-width=\"5\" stroke-linecap=\"round\"/>\n        <path d=\"M86 140 A60 48 0 0 0 206 140 Z\" fill=\"#fde27a\" stroke=\"#1b1813\" stroke-width=\"4\" stroke-linejoin=\"round\"/>\n        <ellipse cx=\"146\" cy=\"140\" rx=\"60\" ry=\"10\" fill=\"#ff8f70\" stroke=\"#1b1813\" stroke-width=\"4\"/>\n        <circle cx=\"128\" cy=\"139\" r=\"5\" fill=\"#bfe28f\" stroke=\"#1b1813\" stroke-width=\"2\"/><circle cx=\"160\" cy=\"141\" r=\"4\" fill=\"#fffaf0\" stroke=\"#1b1813\" stroke-width=\"2\"/>\n        <path d=\"M108 166 q38 12 76 0\" fill=\"none\" stroke=\"#1b1813\" stroke-width=\"3\" stroke-linecap=\"round\"/>\n        <rect x=\"124\" y=\"186\" width=\"44\" height=\"9\" rx=\"3\" fill=\"#1b1813\"/>\n        <g class=\"stamp-g\">\n          <circle cx=\"256\" cy=\"200\" r=\"42\" fill=\"rgba(255,250,240,.6)\" stroke=\"#d63c1d\" stroke-width=\"5\"/>\n          <circle cx=\"256\" cy=\"200\" r=\"33\" fill=\"none\" stroke=\"#d63c1d\" stroke-width=\"2\"/>\n          <text x=\"256\" y=\"210\" text-anchor=\"middle\" font-size=\"27\" font-weight=\"900\" fill=\"#d63c1d\" font-family=\"Apple SD Gothic Neo, Noto Sans KR, Malgun Gothic, sans-serif\">승인</text>\n        </g>\n      </svg>","steam":"<svg class=\"r-steam\" viewBox=\"0 0 90 40\" aria-hidden=\"true\" focusable=\"false\"><g fill=\"none\" stroke=\"#1b1813\" stroke-width=\"3.5\" stroke-linecap=\"round\"><path d=\"M28 38 c-8 -9 8 -15 0 -30\"/><path d=\"M45 36 c-8 -9 8 -15 0 -30\"/><path d=\"M62 38 c-8 -9 8 -15 0 -30\"/></g></svg>","cart":"<svg class=\"cart-svg\" viewBox=\"0 0 120 84\" aria-hidden=\"true\" focusable=\"false\"><g class=\"cart-bob\"><path d=\"M14 24 V34 M104 24 V34\" stroke=\"#1b1813\" stroke-width=\"3.5\" stroke-linecap=\"round\"/><path class=\"cart-awn\" d=\"M14 2 H100 L112 18 H4 Z\"/><path d=\"M31 2 H48 L47 18 H25 Z M66 2 H83 L91 18 H69 Z\" fill=\"#fffaf0\"/><path class=\"cart-awn\" d=\"M4 18 a9 6 0 0 0 18 0 a9 6 0 0 0 18 0 a9 6 0 0 0 18 0 a9 6 0 0 0 18 0 a9 6 0 0 0 18 0 a9 6 0 0 0 18 0 Z\" stroke=\"#1b1813\" stroke-width=\"3\" stroke-linejoin=\"round\"/><path d=\"M14 2 H100 L112 18 H4 Z\" fill=\"none\" stroke=\"#1b1813\" stroke-width=\"3.5\" stroke-linejoin=\"round\"/><rect class=\"cart-body\" x=\"8\" y=\"32\" width=\"98\" height=\"32\" rx=\"6\" stroke=\"#1b1813\" stroke-width=\"3.5\"/><rect x=\"18\" y=\"38\" width=\"40\" height=\"16\" rx=\"3\" fill=\"#fffaf0\" stroke=\"#1b1813\" stroke-width=\"2.5\"/><path d=\"M24 44 h22 M24 49 h14\" stroke=\"#1b1813\" stroke-width=\"2.5\" stroke-linecap=\"round\"/><circle cx=\"84\" cy=\"46\" r=\"7\" fill=\"#fffaf0\" stroke=\"#1b1813\" stroke-width=\"2.5\"/><path d=\"M8 40 h-6 v-10\" fill=\"none\" stroke=\"#1b1813\" stroke-width=\"3.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></g><g class=\"wheel\"><circle cx=\"30\" cy=\"70\" r=\"11\" fill=\"#1b1813\"/><circle cx=\"30\" cy=\"70\" r=\"4\" fill=\"#fffaf0\"/><path d=\"M30 61 V79 M21 70 H39\" stroke=\"#fffaf0\" stroke-width=\"2\"/></g><g class=\"wheel\"><circle cx=\"86\" cy=\"70\" r=\"11\" fill=\"#1b1813\"/><circle cx=\"86\" cy=\"70\" r=\"4\" fill=\"#fffaf0\"/><path d=\"M86 61 V79 M77 70 H95\" stroke=\"#fffaf0\" stroke-width=\"2\"/></g></svg>","foods":{"돈가스":{"emoji":"🍖","tone":"sand"},"국밥":{"emoji":"🍲","tone":"lemon"},"비빔밥":{"emoji":"🥗","tone":"leaf"},"제육덮밥":{"emoji":"🍛","tone":"peach"},"김치찌개":{"emoji":"🥘","tone":"tomato"},"된장찌개":{"emoji":"🥣","tone":"sand"},"짜장면":{"emoji":"🥢","tone":"lilac"},"짬뽕":{"emoji":"🌶️","tone":"pink"},"쌀국수":{"emoji":"🍜","tone":"sky"},"파스타":{"emoji":"🍝","tone":"tomato"},"햄버거":{"emoji":"🍔","tone":"lemon"},"김밥":{"emoji":"🍙","tone":"mint"},"순두부찌개":{"emoji":"🥘","tone":"tomato"},"부대찌개":{"emoji":"🍲","tone":"peach"},"육개장":{"emoji":"🍲","tone":"tomato"},"갈비탕":{"emoji":"🍲","tone":"sand"},"설렁탕":{"emoji":"🥣","tone":"sand"},"냉면":{"emoji":"🍜","tone":"sky"},"칼국수":{"emoji":"🍜","tone":"lemon"},"수제비":{"emoji":"🥣","tone":"mint"},"김치볶음밥":{"emoji":"🍛","tone":"tomato"},"불고기덮밥":{"emoji":"🍚","tone":"peach"},"초밥":{"emoji":"🍣","tone":"pink"},"회덮밥":{"emoji":"🍣","tone":"sky"},"우동":{"emoji":"🍜","tone":"sand"},"라멘":{"emoji":"🍜","tone":"tomato"},"메밀소바":{"emoji":"🥢","tone":"lilac"},"가츠동":{"emoji":"🍚","tone":"lemon"},"마라탕":{"emoji":"🌶️","tone":"tomato"},"마파두부덮밥":{"emoji":"🍛","tone":"peach"},"중화비빔밥":{"emoji":"🍛","tone":"pink"},"볶음밥":{"emoji":"🍚","tone":"mint"},"카레":{"emoji":"🍛","tone":"lemon"},"팟타이":{"emoji":"🍜","tone":"leaf"},"나시고렝":{"emoji":"🍛","tone":"peach"},"포케":{"emoji":"🥗","tone":"mint"},"샐러드":{"emoji":"🥗","tone":"leaf"},"샌드위치":{"emoji":"🥪","tone":"lemon"},"토스트":{"emoji":"🍞","tone":"sand"},"피자":{"emoji":"🍕","tone":"tomato"},"리조토":{"emoji":"🍚","tone":"lilac"},"오므라이스":{"emoji":"🍳","tone":"lemon"}}});
