import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import { readProduction } from './read-production.mjs';
const dir=new URL('./',import.meta.url),official=JSON.parse(fs.readFileSync(new URL('departments-official.json',dir),'utf8'));
const data=vm.runInNewContext(fs.readFileSync(new URL('departments.mjs',dir),'utf8')+';({options:deptOptions,byName:deptByName,search:deptSearchKey})');
assert.equal(data.options.filter(d=>!d.kind).length,118);assert.equal(new Set(data.options.map(d=>d.id)).size,119);assert.equal(data.options.some(d=>d.id==='student_worker'||d.name==='근로생'),false);
for(const group of official.groups)for(const row of group.departments){const option=data.options.find(d=>d.name===row.name);assert(option,'Missing '+row.name);assert.equal(option.college,group.label);for(const alias of row.aliases||[])assert(data.byName.has(data.search(alias)),'Missing alias '+alias);}
for(const id of ['business','accounting','economics','tourism','hotel','japanese','korean','international','facility'])assert(data.options.some(d=>d.id===id),'Lost existing ID '+id);
const html=readProduction();assert(html.includes("BUILD='party30-20261115-points5'"));assert(!html.includes('qaLayoutReport'));assert(!html.includes('QA8888'));assert(!html.includes("id:'student_worker'"));
for(const [i,script]of [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].entries())new vm.Script(script[1],{filename:'assembled-'+i});
console.log('PASS: 118 official undergraduate/legacy/new departments, 14 groups, searchable renames, stable existing IDs, worker removed, compiled scripts and production/QA separation.');
