import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('./game-experience.mjs',import.meta.url),'utf8');
const gameKeys=['sneak','dodge','coins','stamp','runner','brawl','kart','basket','doors','rhythm','tray','pong','curling','bowling','volley','golf','parking','dodgeball','crown','lasers','frogger','bridge','claw','memory','sorter','receipt','safe','auction','stacker','reaction'];
const ids=new Map(),nodes=[];
class Node{
 constructor(tag='div',cls='',text=''){this.tagName=tag;this.className=cls;this.textContent=text;this.children=[];this.parentNode=null;this.hidden=false;this.attrs={};this.dataset={};this.style={};nodes.push(this);}
 set id(value){this._id=value;ids.set(value,this);}get id(){return this._id||'';}
 setAttribute(key,value){this.attrs[key]=String(value);}getAttribute(key){return this.attrs[key]??null;}
 append(...items){for(const item of items){item.parentNode=this;this.children.push(item);}}
 after(item){assert(this.parentNode);const at=this.parentNode.children.indexOf(this);this.parentNode.children.splice(at+1,0,item);item.parentNode=this.parentNode;}
}
const make=(id,tag='div')=>{const n=new Node(tag);n.id=id;return n;};
const dialog=make('arcadeDialog','dialog'),help=make('arcadeHelp','p'),board=make('arcadeBoard'),overlay=make('arcadeOverlay'),hint=make('arcadeOverlayHint'),summary=make('deviceRuleSummary'),toggle=make('deviceInfoToggle','button'),clock=make('arcadeClock'),controls=make('arcadeControls'),ownStatus=make('arcadeOwnStatus','span');
overlay.append(hint);board.append(overlay,clock);controls.append(ownStatus);dialog.append(help,board,summary,toggle,controls);
let baseCalls=0;
const context=vm.createContext({arcadeGames:Object.fromEntries(gameKeys.map(key=>[key,{hint:'old '+key,action:'old action'}])),arcadeDialog:dialog,arcadeState:null,arcadeSelf:()=> 'me',arcadeClockSeconds:w=>w.duration-w.elapsed,arcadeRender:()=>{baseCalls++;},el:(...args)=>new Node(...args),$:id=>ids.get(id)||null});
vm.runInContext(source+'\nglobalThis.testExperience={guides:gameExperienceGuides,delta:gameExperienceDelta,marker:gameExperienceMarker};',context);
const {guides,delta,marker}=context.testExperience;
assert.deepEqual(Object.keys(guides).sort(),gameKeys.sort());
assert.equal(new Set(Object.values(guides).map(g=>g.goal)).size,30,'each game has a tailored objective');
for(const [game,guide]of Object.entries(guides))for(const part of ['goal','score','tip','first']){
 assert.equal(typeof guide[part],'string',game+' '+part);assert(guide[part].length>=8&&guide[part].length<=110,game+' '+part+' stays readable');
}
assert.equal(delta(0,100,'stamp',true),100);
assert.equal(delta(100,85,'stamp',true),-15);
assert.equal(delta(1000,1050,'dodge',true),0,'passive survival progress does not spam score feedback');
assert.equal(delta(0,100,'stamp',false),0,'countdown and completed rounds never emit gains');
assert.equal(delta(undefined,100,'stamp',true),0);
assert.equal(marker('brawl',{damageDealt:28}),28);
assert.equal(marker('dodge',undefined),0);
context.arcadeRender();assert.equal(baseCalls,1);
assert.equal(help.getAttribute('aria-hidden'),'true');assert.equal(toggle.getAttribute('aria-controls'),'gameGuide arcadeRoster');
assert.equal(ids.get('gameScoreFeedback').parentNode,ids.get('gameOwnStatus'),'feedback stays in the control status region, outside all arena targets');
assert(ids.get('gameGuide').hidden);assert(ids.get('gameScoreFeedback').hidden);
const player={id:'me',score:0};
const world={id:'round-1',game:'stamp',phase:'countdown',elapsed:0,duration:24,players:[player]};
context.arcadeState={phase:'round',chosen:'stamp',world};context.arcadeRender();
assert.equal(ids.get('gameCountdownTip').hidden,false);
assert.equal(hint.textContent,guides.stamp.goal);
assert.equal(ids.get('gameGuide').children[0].children[1].textContent,guides.stamp.goal);
world.phase='play';world.elapsed=1;context.arcadeRender();assert(ids.get('gameCountdownTip').hidden);
player.score=80;context.arcadeRender();assert.equal(ids.get('gameScoreFeedback').textContent,'+80점');assert.equal(ids.get('gameScoreFeedback').hidden,false);
world.elapsed=1.2;player.score=95;context.arcadeRender();assert.equal(ids.get('gameScoreFeedback').textContent,'+95점','nearby gains accumulate without stacking DOM nodes');
world.elapsed=1.3;player.score=80;context.arcadeRender();assert.equal(ids.get('gameScoreFeedback').textContent,'-15점');assert.equal(ids.get('gameScoreFeedback').dataset.direction,'loss');
world.elapsed=2.2;context.arcadeRender();assert(ids.get('gameScoreFeedback').hidden,'feedback expires');
world.elapsed=20;context.arcadeRender();assert.equal(dialog.dataset.timePressure,'true');assert.equal(clock.getAttribute('aria-label'),'남은 시간 4초');assert.equal(ids.get('gameScoreFeedback').hidden,true);
const count=nodes.length;for(let n=0;n<100;n++)context.arcadeRender();assert.equal(nodes.length,count,'stable frames never allocate more presentation nodes');
world.phase='done';context.arcadeState.phase='between';context.arcadeRender();assert.equal(dialog.dataset.timePressure,'false');assert(ids.get('gameTimeTrack').hidden);assert(ids.get('gameScoreFeedback').hidden);
world.id='round-2';world.game='dodge';world.phase='play';world.elapsed=1;player.score=1000;player.nearMisses=0;context.arcadeState.phase='round';context.arcadeRender();
assert.equal(ids.get('gameGuide').children[0].children[1].textContent,guides.dodge.goal);assert(ids.get('gameScoreFeedback').hidden,'new round resets feedback');
world.elapsed=1.02;player.score=1020;context.arcadeRender();assert(ids.get('gameScoreFeedback').hidden);
player.nearMisses=1;context.arcadeRender();assert.equal(ids.get('gameScoreFeedback').textContent,'아슬아슬 회피!');assert.equal(ids.get('gameScoreFeedback').hidden,false);
context.arcadeState=null;context.arcadeRender();assert(ids.get('gameGuide').hidden);assert(ids.get('gameScoreFeedback').hidden);assert.equal(dialog.dataset.timePressure,'false');
const css=fs.readFileSync(new URL('./game-experience.css',import.meta.url),'utf8');
assert(css.includes('prefers-reduced-motion:reduce'));
assert(!css.includes('backdrop-filter')&&!css.includes('blur('),'polish avoids costly blur layers');
console.log('30 tailored guides, round resets, discrete and skill-event feedback, countdown, final countdown, stable DOM and reduced motion passed.');
