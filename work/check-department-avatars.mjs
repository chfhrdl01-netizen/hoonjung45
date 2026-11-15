import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
const source=fs.readFileSync(new URL('./department-avatars.mjs',import.meta.url),'utf8'),base='\n'+fs.readFileSync(new URL('./source/tests/original-avatar.mjs',import.meta.url),'utf8')+'\nfunction deptAvatarPreview(';
const ids=['business','accounting','economics','tourism','hotel','japanese','korean','international','student_worker','facility'],names=['경영학','회계학','경제금융통상학과','관광항공경영','호텔외식서비스','일본어일본학과','한국어교육·통번역','국제어문학','근로생','시설물관리'];
const options=ids.map((id,i)=>({id,name:names[i],short:names[i],passive:'기존 특성',description:'기존 설명'}));
const originalStart=base.indexOf('function deptAvatarSvg('),originalEnd=base.indexOf('\nfunction deptAvatarPreview(',originalStart);assert(originalStart>0&&originalEnd>originalStart);
const old={deptOptions:options,deptOption:v=>options.find(o=>o.id===v||o.name===v)||options[0]};vm.createContext(old);vm.runInContext(base.slice(originalStart,originalEnd),old);
const oldSvgs=new Map(options.map(o=>[o.id,old.deptAvatarSvg(o.id)]));
const microtasks=[],parts=new Map();const element=()=>({dataset:{},textContent:'',innerHTML:'',title:''});
const select=element();select.value='business';const preview=element();preview.querySelector=key=>{if(!parts.has(key))parts.set(key,element());return parts.get(key);};
const document={getElementById:id=>id==='netDepartment'?select:id==='deptAvatarPreview'?preview:null};
const ctx={deptOptions:options,deptOption:v=>ctx.deptOptions.find(o=>o.id===v||o.name===v||o.short===v)||ctx.deptOptions[0],Map,Object,String,Math,document,queueMicrotask:f=>microtasks.push(f),renderSetup(){return 'setup';},deptRender(){},deptRace:null,deptView:null,netMembers:()=>[]};
vm.createContext(ctx);vm.runInContext(source,ctx);const get=code=>vm.runInContext(code,ctx),svgs=[];
const expectedColors=['#bada73','#c8a1df','#edcc66','#8ec9d6','#efaa80','#e8a5b5','#b4c88b','#a6b3dd'];
for(let i=0;i<8;i++){
 const id=ids[i],svg=ctx.deptAvatarSvg(id),before=oldSvgs.get(id);svgs.push(svg);
 assert(svg.includes('fill="'+expectedColors[i]+'"'),'original skin remains');
 const originalFace=before.match(/<g fill="#29201f">([\s\S]*?)<\/g>/)?.[1],face=svg.match(/<g class="av-face" fill="#29201f">([\s\S]*?)<\/g>/)?.[1];assert.equal(face,originalFace,id+' exact old eyebrows, eyes and pupils remain');
 const mouth=i%2?'M60 84q10-7 22 1l-3 10H63z':'M54 82q8-13 16-2 9-10 18 3-12 1-18-2-8 4-16 1';assert(svg.includes(mouth),'old mouth remains');assert(svg.includes('M29 51Q13 10 71 20q56-3 46 39 22 49-32 51-68 8-60-31-16-21 4-28Z'),'original body outline remains');
 assert(svg.includes('av-costume'),'new outfit present');
}
const legacySvg=ctx.deptAvatarSvg('business');ctx.deptOptions.reverse();assert.equal(ctx.deptAvatarSvg('business'),legacySvg,'reordering options does not change original appearance');ctx.deptOptions.reverse();
const styles=get('Object.keys(deptAvatarWardrobe)');assert.equal(styles.length,16);
for(const style of styles){const o={id:'new_'+style,name:'학과 '+style,short:style,avatarStyle:style,college:'실험대학'};ctx.deptOptions.push(o);const svg=ctx.deptAvatarSvg(o.id);assert(svg.includes('data-costume="'+style+'"'));assert(!/undefined|NaN|Infinity/.test(svg));svgs.push(svg);}
const newAvatar=ctx.deptAvatarSvg('new_lab');ctx.deptOptions.reverse();assert.equal(ctx.deptAvatarSvg('new_lab'),newAvatar,'new departments stay stable across registry ordering');ctx.deptOptions.reverse();
assert.equal(get('deptAvatarStyle({name:"물리치료학과"})'),'medical');assert.equal(get('deptAvatarStyle({name:"기계자동차공학부"})'),'engineering');assert.equal(get('deptAvatarStyle({name:"유아특수교육과"})'),'education');assert.equal(get('deptAvatarStyle({name:"시각디자인학과"})'),'design');assert.equal(get('deptAvatarStyle({name:"사회복지학과"})'),'social');assert.equal(get('deptAvatarStyle({avatarStyle:"nursing"})'),'medical');
const cachedSize=get('deptAvatarCache.size');ctx.deptAvatarSvg('new_lab');ctx.deptAvatarSvg('학과 lab');assert.equal(get('deptAvatarCache.size'),cachedSize,'aliases and repeated paint reuse the same cached SVG');
ctx.deptOptions.push({id:'name"<bad>',name:'학과 <script>악성</script> & 친구',avatarStyle:'lab'});const escaped=ctx.deptAvatarSvg('name"<bad>');assert(!escaped.includes('<script>'));assert(escaped.includes('&lt;script&gt;'));svgs.push(escaped);
select.value='new_lab';ctx.deptAvatarPreview();while(microtasks.length)microtasks.shift()();assert.equal(preview.querySelector('b').textContent,'실험 가운');assert(preview.querySelector('.dept-avatar-preview-description').textContent.includes('실험대학'));assert(preview.querySelector('.dept-avatar-preview-description').textContent.includes('보안경'));
for(let i=0;i<600;i++){ctx.deptOptions.push({id:'extra_'+i,name:'추가학과 '+i});const svg=ctx.deptAvatarSvg('extra_'+i);assert(!svg.includes('undefined'));if(i<10)svgs.push(svg);}assert(get('deptAvatarCache.size')<=512,'cache remains bounded for a large catalog');
const xmlCheck='import sys,json,xml.etree.ElementTree as E\nfor text in json.load(sys.stdin):\n root=E.fromstring(text)\n assert root.tag.endswith("svg")\n assert root.attrib["viewBox"]=="0 0 140 130"\n for el in root.iter():\n  assert not el.tag.endswith(("script","foreignObject","image"))\n  assert not any(k.lower().startswith("on") for k in el.attrib)\nprint("SVG XML valid")';
const result=execFileSync('python3',['-c',xmlCheck],{input:JSON.stringify(svgs),encoding:'utf8'});assert(result.includes('SVG XML valid'));
console.log('PASS: original eight faces/colors/body outlines preserved; sixteen outfits, safe colors and hash-stable new departments; cached/bounded SVG reuse, aliases, escaped metadata, valid XML and department costume preview verified.');
