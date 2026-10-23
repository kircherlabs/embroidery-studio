import assert from 'node:assert/strict';
import {test} from 'node:test';
import {object,validateProject} from '../src/model.js';
import {newLayout,suggestHoops,splitDomains,hoopRect,coverage} from '../src/multi-hoop-layout.js';
import {clipping,polygonArea} from '../src/geometry.js';
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
