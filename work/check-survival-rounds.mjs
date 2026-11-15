import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');
const source=read('game-rules.mjs');
const api=vm.runInNewContext('(function(){'+source+'\nreturn {engine:createArcadeEngine(),isSurvival:arcadeSurvivalGame};})()');
const games=['dodge','runner','brawl','tray','dodgeball','lasers','frogger'];
const participants=count=>Array.from({length:count},(_,i)=>({id:'p'+i,name:'Player '+i,department:'business'}));
const copy=value=>JSON.parse(JSON.stringify(value));
function create(game,count=3){
 const w=api.engine.create({id:game+'-'+count,game,seed:7191,participants:participants(count)});
 w.phase='play';w.elapsed=4;w.meta.partyRespawn=false;w.meta.pointsStage='regular';
 return w;
}
function fatal(w){
 const p=w.players[0],q=w.players[1];
 if(w.game==='tray'){p.x=-30;p.y=230;}
 if(w.game==='brawl'){p.hp=1;q.x=300;q.y=230;q.faceX=1;q.faceY=0;p.x=365;p.y=230;assert.equal(api.engine.input(w,q.id,{seq:1,action:'hit'},4000),true);}
 if(w.game==='dodge'){p.health=1;w.meta.nextSpawnAt=99;w.objects=[{id:'fatal-food',kind:'food',x:p.x,y:p.y,radius:45,impactAt:4,endAt:5,resolved:false}];}
 if(w.game==='runner'){p.health=1;p.lastHurtAt=-10;p.jumpHeight=0;p.jumpVy=0;w.meta.nextSpawnAt=99;w.objects=[{id:'fatal-hurdle',kind:'hurdle',x:p.x+2,y:w.meta.groundY,width:40,height:40,speed:100,hitIds:[],clearedIds:[]}];}
 if(w.game==='dodgeball'){p.health=1;w.objects=[{id:'fatal-ball',kind:'dodgeball',ownerId:q.id,x:p.x,y:p.y,vx:0,vy:0,until:5,bounces:0,hitIds:[]}];}
 if(w.game==='lasers'){p.health=1;p.y=230;w.meta.nextPatternAt=99;w.objects=[{id:'fatal-laser',kind:'laser',mode:'rotate',baseAngle:0,angle:0,spin:0,x:350,y:230,activeAt:0,endAt:5,hitIds:[],nearIds:[]}];}
 if(w.game==='frogger'){p.col=6;p.row=1;p.x=350;p.y=388;w.objects=[{id:'fatal-car',kind:'trafficCar',row:1,x:350,y:388,width:60,height:28,vx:0}];}
 api.engine.step(w,.02,4020);
 assert.equal(p.eliminated,true,w.game+' fatal event eliminates the character');
 assert.equal(p.health,0);assert.equal(p.forfeited,false,w.game+' round loss is not a series forfeit');
 return p;
}

for(const game of games){
 assert.equal(api.isSurvival(game),true);
 const w=create(game),p=fatal(w),death={x:p.x,y:p.y,score:p.score,time:p.fallAt};
 assert.equal(w.meta.roundSurvival,true);assert.equal(w.meta.partyRespawn,false);
 assert.equal(api.engine.input(w,p.id,{seq:999,action:'sync',held:['right']},4040),false,'dead movement input is rejected');
 assert.equal(api.engine.input(w,p.id,{seq:1000,action:'hit'},4040),false,'dead action input is rejected');
 for(let tick=0;tick<100;tick++)api.engine.step(w,.02,4040+tick*20);
 assert.equal(p.eliminated,true,game+' never revives later in the same round');
 assert.deepEqual({x:p.x,y:p.y,score:p.score,time:p.fallAt},death,game+' dead position and survival score stay frozen');
 api.engine.complete(w);
 assert(w.players.filter(p=>!p.eliminated&&!p.forfeited).every(alive=>alive.score>p.score),'every living player outranks a dead character');
 const next=api.engine.create({id:'next-'+game,game,seed:7,participants:participants(3)});
 assert(next.players.every(p=>!p.eliminated&&!p.forfeited&&p.health===3),'new minigame restores every participant');
}

// A same-frame completion must rank all remaining survivors above the KO,
// even if they had not yet received their first score update.
{
 const w=create('brawl'),[victim,attacker,idle]=w.players;victim.hp=1;attacker.x=300;attacker.y=230;attacker.faceX=1;attacker.faceY=0;victim.x=365;victim.y=230;
 api.engine.input(w,attacker.id,{seq:1,action:'hit'},4000);assert.equal(idle.score,0);api.engine.complete(w);
 assert(attacker.score>victim.score&&idle.score>victim.score);assert.equal(w.ranking.at(-1).id,victim.id);
}
// Simultaneous deaths tie; a later death wins over an earlier death regardless
// of historic hit counts, and no one can earn survival time after dying.
{
 const w=create('tray',4);w.players[0].x=-30;w.players[1].x=-30;api.engine.step(w,.02,4020);
 assert.equal(w.players[0].score,w.players[1].score);
 w.elapsed=7;w.players[2].x=-30;w.players[2].shoves=999;api.engine.step(w,.02,7020);api.engine.complete(w);
 assert(w.players[3].score>w.players[2].score);assert(w.players[2].score>w.players[0].score);assert.equal(w.ranking.filter(p=>p.rank===3).length,2);
}

// Actual controller progression keeps dead players in activeIds, awards normal
// round points and creates fresh characters in the very next minigame.
for(const count of [2,3,8])for(const game of games){
 const roster=participants(count),e={console,Map,Set,WeakMap,Math,Number,String,Array,Object,Error,JSON,Date,performance:{now:()=>0},setInterval(){},setTimeout(){},netApplying:false,netPhase:'setup',result:null,netSpec:null,netIsActive:()=>true,netIsHost:()=>true,netSelfId:()=> 'p0',netMembers:()=>roster,netDepartment:()=> 'business',netPublish(){},notify(){},arcadeRender(){},arcadeUpdateButtons(){},arcadeClearKeys(){},arcadeOpen(){},arcadeGames:Object.fromEntries(['sneak','dodge','runner','coins','stamp','brawl','kart','doors','rhythm','basket','tray','pong','curling','bowling','volley','golf','parking','dodgeball','crown','lasers','frogger','bridge','claw','memory','sorter','receipt','safe','auction','stacker','reaction'].map(key=>[key,{name:key}])),rand:()=>0,validName:s=>typeof s==='string'&&s.length>0,netRoom:{code:'SURVIV',onDisconnect(){},send(){}}};
 vm.createContext(e);vm.runInContext(source+'\n'+read('arcade-controller.mjs')+`\narcadeRandomGame=()=>${JSON.stringify(game)};arcadeState=arcadeMakeState('tournament',${JSON.stringify(game)},netMembers().map(m=>({...m,response:'join'})));arcadeState.activeIds=arcadeState.members.map(m=>m.id);arcadeStartWorld();this.test={engine:arcadeEngine,get state(){return arcadeState;},resolve:arcadeResolveRound,start:arcadeStartWorld,validate:arcadeValidate};`,e);
 const s=e.test.state,w=s.world;w.phase='play';w.elapsed=4;
 // A consistent authoritative death record is enough to end this round; the
 // seven actual fatal collision paths were exercised above.
 w.players[0].eliminated=true;w.players[0].health=0;if('hp'in w.players[0])w.players[0].hp=0;w.players[0].fallAt=4;w.players[0].survived=4;
 e.test.engine.complete(w);e.test.resolve();assert.equal(s.phase,'between');assert.equal(s.activeIds.length,count);assert.equal(s.members[0].forfeited,undefined);assert.equal(s.history[0].outIds.length,0);assert.equal(s.history[0].pointAwards.find(p=>p.id==='p0').points,1);
 assert.equal(e.test.validate(copy(s)),true,'legitimate round-death snapshot validates');
 const forged=copy(s);forged.world.meta.partyRespawn=true;assert.equal(e.test.validate(forged),false,'resurrection cannot be re-enabled through a guest snapshot');
 e.test.start();assert.equal(s.world.players.length,count);assert(s.world.players.every(p=>p.health===3&&!p.eliminated&&!p.forfeited));assert.equal(s.world.meta.partyRespawn,false);assert.equal(e.test.validate(copy(s)),true);
}
for(const game of ['kart','crown','coins','bowling','volley','bridge','claw'])assert.equal(api.isSurvival(game),false,'non-death mechanics stay separate');
console.log('PASS: seven real fatal collision paths, no same-round revival, frozen dead scores/input, alive priority and simultaneous-death ties; 2/3/8-player points progression restores every player next game with ordinary points and validated host state.');
