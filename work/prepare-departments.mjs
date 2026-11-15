import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
const dir=new URL('./',import.meta.url),official=JSON.parse(fs.readFileSync(new URL('departments-official.json',dir),'utf8'));
const old=vm.runInNewContext(fs.readFileSync(new URL('departments-existing.mjs',dir),'utf8')+';deptOptions');
const options=[];
for(const group of official.groups)for(const row of group.departments){
 const previous=old.find(d=>d.name===row.name),id=previous?.id||'du-'+crypto.createHash('sha1').update(row.name).digest('hex').slice(0,10);
 const short=previous?.short||(row.name.includes(' ')?row.name.split(' ').slice(1).join(' '):row.name);
 options.push({...previous,id,name:row.name,short,college:group.label,aliases:row.aliases||[],status:row.status,source:group.url,color:previous?.color||['#addcbd','#c9b7ed','#f4d46e','#9acdec','#f5b593','#f0acc2'][parseInt(id.slice(-2),16)%6]||'#addcbd',icon:previous?.icon||'🎓',passive:previous?.passive||'내 메뉴 수호',description:previous?.description||'학과를 닮은 밥친구. 토너먼트 능력치는 모두 같아요.'});
}
options.push({...old.find(d=>d.id==='facility'),college:'추가 역할',aliases:[],status:'추가 역할'});
if(options.length!==119||new Set(options.map(d=>d.id)).size!==options.length||options.some(d=>d.id==='student_worker'))throw Error('Invalid campus roster');
const generated='/* CAMPUS_DEPARTMENTS_V1 */\nconst deptOptions='+JSON.stringify(options,null,1)+';\nconst deptSearchKey=value=>String(value||\'\').normalize(\'NFKC\').toLocaleLowerCase(\'ko\').replace(/[\\s·,()ㆍ・]/g,\'\');\nconst deptById=new Map(deptOptions.map(d=>[d.id,d]));\nconst deptByName=new Map();for(const d of deptOptions)for(const name of [d.name,d.short,...(d.aliases||[])])if(!deptByName.has(deptSearchKey(name)))deptByName.set(deptSearchKey(name),d);\n/* END_CAMPUS_DEPARTMENTS_V1 */';
fs.writeFileSync(new URL('departments.mjs',dir),generated);
let base=fs.readFileSync(new URL('base.html',dir),'utf8');
if(base.includes('const deptOptions=[')){const a=base.indexOf('const deptOptions=['),b=base.indexOf('\nlet deptRace=',a);base=base.slice(0,a)+'/* CAMPUS_DEPARTMENTS_V1 */\n/* END_CAMPUS_DEPARTMENTS_V1 */'+base.slice(b);}
base=base.replace("function deptOption(value){return deptOptions.find(x=>x.id===value||x.name===value||x.short===value)||deptOptions[0];}","function deptOption(value){return deptById.get(value)||deptByName.get(deptSearchKey(value))||deptById.get('business');}");
base=base.replace("function netDepartment(id){return netDepartments[id]||deptOptions[0].id;}","function netDepartment(id){return deptById.has(netDepartments[id])?netDepartments[id]:'business';}");
base=base.replace('공식 전공 8개는','학과·전공 목록은').replace('대구대학교 2026학년도 글로벌경영대학 안내','대구대학교 공식 대학 안내').replace('근로생·시설물관리는 추가한 역할 캐릭터입니다.','시설물관리는 별도 역할 캐릭터입니다.');
base=base.replace("  if(lane.department==='student_worker'&&!lane.passiveUsed&&lane.finishedAt===null&&t>=6){lane.boostUntil=Math.max(lane.boostUntil,t+1.2);deptUsePassive(lane,t,'점심시간을 지켜라!');}\n",'');
fs.writeFileSync(new URL('base.html',dir),base);
const path=new URL('parts.json',dir),parts=JSON.parse(fs.readFileSync(path,'utf8'));parts['departments.mjs']=['/* CAMPUS_DEPARTMENTS_V1 */','/* END_CAMPUS_DEPARTMENTS_V1 */'];fs.writeFileSync(path,JSON.stringify(parts,null,2));
console.log(JSON.stringify({departments:118,roles:1,groups:official.groups.length}));
