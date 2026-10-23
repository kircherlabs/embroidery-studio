import assert from 'node:assert/strict';
import {test} from 'node:test';
import {object,validateProject,bounds} from '../src/model.js';
import {newLayout,suggestHoops,splitDomains,hoopRect,coverage} from '../src/multi-hoop-layout.js';
import {clipping,polygonArea,fillPolygons} from '../src/geometry.js';
import {assignWholeObjects,sectionProject} from '../src/multi-hoop-assignment.js';
import {generate} from '../src/engine.js';
import {deriveSections,generateMultiHoop} from '../src/multi-hoop-split.js';
import {inside} from '../src/geometry.js';
const rect=(x,y,w,h)=>[[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}]];
const project=(rings=rect(-125,-30,250,60))=>({version:1,name:'Rehoop',machine:'se700',objects:[object('Area',rings,{compensation:0,underlay:false})],multiHoop:newLayout()});
test('A: field-aware horizontal and vertical suggestions, persistence and validation',()=>{
 const p=project();p.multiHoop.hoops=suggestHoops(p);assert.equal(p.multiHoop.hoops.length,3);assert.equal(coverage(p).uncovered.length,0);validateProject(JSON.parse(JSON.stringify(p)));
 const v=project(rect(-25,-125,50,250));v.multiHoop.hoops=suggestHoops(v);assert.equal(v.multiHoop.hoops.length,3);assert.equal(new Set(v.multiHoop.hoops.map(h=>h.x)).size,1);
 p.multiHoop.hoops[0].x=NaN;assert.throws(()=>validateProject(p),/hooping/);
});
test('A: irregular and manually balanced domains partition union without holes or overlap',()=>{
 const p=project();p.multiHoop.hoops=[{id:'a',x:0,y:0},{id:'b',x:70,y:35,seamX:8},{id:'c',x:15,y:75,seamY:-4}];
 const domains=splitDomains(p),union=clipping.union(...p.multiHoop.hoops.map(h=>hoopRect(p,h,2)));
 assert(Math.abs(domains.reduce((n,d)=>n+polygonArea(d),0)-polygonArea(union))<0.001);
 for(let i=0;i<domains.length;i++)for(let j=i+1;j<domains.length;j++)assert(polygonArea(clipping.intersection(domains[i],domains[j]))<0.001);
});
test('A: uncovered holes and references never expand coverage',()=>{
 const p=project();p.multiHoop.hoops=[{id:'a',x:0,y:0}];assert(coverage(p).uncovered[0].area>1000);
 p.objects=[object('Reference',rect(900,900,30,30),{type:'reference'})];assert.equal(coverage(p).uncovered.length,0);
});
test('B: complete objects/actions keep source, colors, threads, groups and physical size',()=>{
 const p=project();p.objects=[object('Left',rect(-100,-15,20,30),{operations:[{id:'f',type:'fill',color:'#123456'},{id:'b',type:'border',color:'#654321',width:2}] }),object('Right',rect(70,-15,20,30))];p.multiHoop.hoops=[{id:'l',x:-90,y:0},{id:'r',x:80,y:0}];
 const before=JSON.stringify(p),a=assignWholeObjects(p);assert.equal(a.unassigned.length,0);assert.equal(a.assignments.get(p.objects[0].id),'l');
 const s=sectionProject(p,p.multiHoop.hoops[0],[p.objects[0]]),plan=generate(s);assert(plan.stats.fits);assert.equal(plan.stats.uniqueColors,2);assert.equal(JSON.stringify(p),before);assert.equal(s.objects[0].rings[0][1].x-s.objects[0].rings[0][0].x,20);
 s.objects[0].operations[0].color='#ffffff';assert.equal(p.objects[0].operations[0].color,'#123456');
});
test('B: construction dependencies are atomic; invalid manual assignment is actionable',()=>{
 const p=project();p.objects=[object('Fabric',rect(-60,-20,120,40)),object('Decoration',rect(-4,-4,8,8))];p.objects[0].constructionArtworkIds=[p.objects[1].id];p.multiHoop.hoops=[{id:'l',x:-40,y:0},{id:'r',x:40,y:0}];
 const a=assignWholeObjects(p);assert.equal(a.assignments.size,0);assert.match(a.problems[0].message,/construction must fit/);
 delete p.objects[0].constructionArtworkIds;p.multiHoop.assignments={[p.objects[1].id]:'missing'};assert.match(assignWholeObjects(p).problems.at(-1).message,/assigned hooping/);
});
test('C: oversized Tatami with hole regenerates disjoint source regions, shared rows and safe commands',()=>{
 const p=project([...rect(-110,-20,220,40),...rect(-12,-9,24,18)]);p.objects[0].angle=0;p.objects[0].compensation=0.3;p.objects[0].underlay=true;p.multiHoop.hoops=[{id:'a',x:-65,y:0},{id:'b',x:0,y:0},{id:'c',x:65,y:0}];
 const before=JSON.stringify(p),r=generateMultiHoop(p);assert.deepEqual(r.problems,[]);assert.equal(JSON.stringify(p),before);assert.equal(r.splits[0].kind,'fill');
 let area=0;const rows=new Set();
 for(const s of r.sections){assert(s.plan.stats.fits);assert(s.plan.stats.maxLength<=7.01);area+=polygonArea(fillPolygons(s.project.objects[0].rings,'nonzero'));
  for(const e of s.plan.events.filter(e=>e.cmd==='stitch'&&e.phase==='top')){
   const world={x:e.x+s.hoop.x,y:e.y+s.hoop.y};assert(!inside(world,rect(-11.5,-8.5,23,17)),JSON.stringify(world));rows.add(Math.round((world.y+20-0.21)/0.42));
   const b=bounds(r.domains[s.number-1].flat(2).map(([x,y])=>({x,y})));assert(world.x>=b.minX-.051&&world.x<=b.maxX+.051,'compensation must stop at seam');
  }
 }
 assert(Math.abs(area-(220*40-24*18))<0.01);assert(rows.size>80);
 const parts=deriveSections(p).sections;p.multiHoop.hoops[1].seamX=10;const next=deriveSections(p).sections;assert.notDeepEqual(parts[0].project.objects[0].rings,next[0].project.objects[0].rings);
});
test('C: source running paths split without connecting artificial closing edges; Bean/Triple identities remain',()=>{
 const p=project();p.objects=[object('Long line',[[{x:-110,y:0},{x:0,y:5},{x:110,y:0}]],{type:'run',operations:[{id:'bean',type:'bean',length:2,color:'#112233'},{id:'triple',type:'triple',length:2,color:'#445566'}]})];p.multiHoop.hoops=[{id:'a',x:-65,y:0},{id:'b',x:0,y:0},{id:'c',x:65,y:0}];
 const r=generateMultiHoop(p);assert.deepEqual(r.problems,[]);assert(r.sections.every(s=>s.plan.stats.fits));assert(r.sections.every(s=>s.project.objects[0].operations.every(op=>op.closed===false)));assert(r.sections.every(s=>s.plan.stats.uniqueColors===2));
});
test('C: unsupported oversized rails/satin/decorative fills are blocked; complete lettering islands remain intact',()=>{
 const p=project();p.objects[0].operations=[{id:'s',type:'column'}];p.multiHoop.hoops=[{id:'a',x:-70,y:0},{id:'b',x:0,y:0},{id:'c',x:70,y:0}];assert.match(deriveSections(p).problems[0].message,/cannot be cut automatically/);
 p.objects[0].rings=[...rect(-92,-10,20,20),...rect(72,-10,20,20)];p.objects[0].textSource={text:'AB'};const r=deriveSections(p);assert.equal(r.problems.length,0);assert.equal(r.splits[0].kind,'islands');assert.equal(r.sections.filter(s=>s.objectIds.length).length,2);assert.equal(p.objects[0].textSource.text,'AB');
 p.objects[0].rings=rect(-110,-10,220,20);p.objects[0].operations=[{id:'c',type:'fill',fillSettings:{version:1,method:'cross'}}];assert.match(deriveSections(p).problems[0].message,/decorative fill/);
});
