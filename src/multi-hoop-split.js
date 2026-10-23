import { bounds, pointsOf, translate } from './model.js';
import { clipping, fillPolygons, points, polygonArea, inside, distance } from './geometry.js';
import { operationsOf, effectiveOperation } from './operations.js';
import { assignWholeObjects, sectionProject, footprintPadding } from './multi-hoop-assignment.js';
import { containsBounds, hoopRect, splitDomains } from './multi-hoop-layout.js';
import { preparePlan } from './planning.js';
import { generate, analyze } from './engine.js';
import { getMachine } from './equipment.js';

const areaTolerance = 0.002; // mm²; clipping uses the existing 0.001 mm grid.
function sharedFill(op,o) {
  if(op.fillSettings) return {...structuredClone(op.fillSettings),anchor:'object'};
  const a=(op.angle??o.angle??0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  const minY=Math.min(...o.rings.flat().map(p=>-s*p.x+c*p.y));
  return {version:1,method:'tatami',anchor:'object',frame:[c,s,-s,c,-s*minY,c*minY],angle:0,texture:op.pattern||o.pattern||'quarter'};
}
const snapshot = o => {
  const copy=structuredClone(o);
  // Source controls remain exclusively in the editable master; derived sections
  // consume exact existing flattened world geometry, never redraw stale controls.
  for(const k of ['shape','curve','textSource','rounding','effects','linkedGeometry']) delete copy[k];
  return copy;
};
function clipPath(ring,closed,p,hoops) {
  const paths=hoops.map(()=>[]),missing=[];
  const source=closed?[...ring,ring[0]]:ring;
  const fields=hoops.map(h=>hoopRect(p,h,p.multiHoop.margin)[0][0]);
  let current=null,lastOwner=-1;
  for(let k=1;k<source.length;k++) {
    const a=source[k-1],b=source[k],dx=b.x-a.x,dy=b.y-a.y,ts=[0,1];
    // Segment intersections with every physical field and every pair's split line.
    for(const r of fields) for(let j=1;j<r.length;j++) {
      const u=r[j-1],v=r[j],ex=v[0]-u[0],ey=v[1]-u[1],det=dx*ey-dy*ex;
      if(Math.abs(det)<1e-12)continue;
      const t=((u[0]-a.x)*ey-(u[1]-a.y)*ex)/det,q=((u[0]-a.x)*dy-(u[1]-a.y)*dx)/det;
      if(t>0&&t<1&&q>=0&&q<=1)ts.push(t);
    }
    for(let i=0;i<hoops.length;i++)for(let j=i+1;j<hoops.length;j++) {
      const u={x:hoops[i].x+(hoops[i].seamX||0),y:hoops[i].y+(hoops[i].seamY||0)},v={x:hoops[j].x+(hoops[j].seamX||0),y:hoops[j].y+(hoops[j].seamY||0)};
      const A=2*(v.x-u.x),B=2*(v.y-u.y),C=v.x*v.x+v.y*v.y-u.x*u.x-u.y*u.y,den=A*dx+B*dy;
      if(Math.abs(den)>1e-12) {const t=(C-A*a.x-B*a.y)/den;if(t>0&&t<1)ts.push(t);}
    }
    ts.sort((x,y)=>x-y);
    for(let j=1;j<ts.length;j++) {
      if(ts[j]-ts[j-1]<1e-9)continue;
      const at=t=>({x:a.x+t*dx,y:a.y+t*dy}),mid=at((ts[j]+ts[j-1])/2),from=at(ts[j-1]),to=at(ts[j]);
      const owners=hoops.map((h,i)=>({i,h,score:(mid.x-h.x-(h.seamX||0))**2+(mid.y-h.y-(h.seamY||0))**2})).filter(({i})=>inside(mid,[fields[i].map(points=>({x:points[0],y:points[1]}))]) || containsBounds(p,hoops[i],bounds([mid]))).sort((x,y)=>x.score-y.score||x.i-y.i);
      const owner=owners[0]?.i??-1;
      if(owner<0) {missing.push(distance(from,to));current=null;lastOwner=-1;continue;}
      if(owner!==lastOwner||!current||distance(current.at(-1),from)>0.001){current=[from];paths[owner].push(current);}
      current.push(to);lastOwner=owner;
    }
  }
  return {paths,missing:missing.reduce((a,b)=>a+b,0)};
}
export function deriveSections(master) {
  const assigned=assignWholeObjects(master),p=assigned.project,hoops=p.multiHoop.hoops;
  const buckets=hoops.map(h=>assigned.objects.filter(o=>assigned.assignments.get(o.id)===h.id)),domains=splitDomains(p),problems=[...assigned.problems],splits=[];
  const order=[...new Set(preparePlan(p).units.map(u=>u.id))];
  for(const o of assigned.unassigned) {
    if(problems.some(q=>q.objectId===o.id))continue;
    const ops=operationsOf(o).filter(op=>op.enabled!==false),active=ops.map(op=>effectiveOperation(o,op));
    const fail=message=>problems.push({objectId:o.id,message:`${o.name}: ${message}`});
    if(o.satinRails||o.type==='manual'||o.constructionArtworkIds?.length) {fail('automatic splitting of manual stitches, satin rails or linked construction is unsafe. Use the existing path/rail split tools and assign each complete piece to a hooping.');continue;}
    const closed=o.type==='fill'||o.closed,polygons=closed?fillPolygons(o.rings,o.fillRule):null;
    if(closed&&polygons===null){fail('resolve invalid/intersecting outlines before splitting.');continue;}
    // A word or imported compound illustration can span hoops without cutting
    // any individual glyph/island. Keep each complete contour with its counters.
    if(polygons?.length>1) {
      const choices=polygons.map(poly=>hoops.findIndex(h=>containsBounds(p,h,bounds(poly.flat().map(([x,y])=>({x,y}))),footprintPadding(o))));
      if(choices.every(i=>i>=0)) {
        hoops.forEach((h,i)=>{const rings=polygons.filter((_,j)=>choices[j]===i).flatMap(poly=>poly.map(points));if(rings.length)buckets[i].push({...snapshot(o),rings,fillRule:'nonzero'});});
        splits.push({objectId:o.id,kind:'islands',message:'Complete disconnected contours assigned without cutting their interiors.'});continue;
      }
    }
    const fill=active.length && active.every(op=>op.type==='fill'&&['tatami','emboss'].includes(op.fillSettings?.method||'tatami')&&!(op.fillSettings?.inset>0));
    const run=active.length && active.every(op=>['run','bean','triple'].includes(op.type)&&!op.offset);
    if(fill&&closed) {
      const clips=domains.map(domain=>domain.length?clipping.intersection(polygons,domain):[]),area=polygonArea(polygons),covered=clips.reduce((n,poly)=>n+polygonArea(poly),0);
      if(area-covered>areaTolerance){fail(`${(area-covered).toFixed(2)} mm² is outside the usable hoop fields. Move/add a hoop before export.`);continue;}
      clips.forEach((poly,i)=>{if(!poly.length||polygonArea(poly)<1e-8)return;
        const copy=snapshot(o);copy.rings=poly.flatMap(poly=>poly.map(points));copy.fillRule='nonzero';copy.closed=true;
        copy.operations=operationsOf(o).map(op=>({...structuredClone(op),fillSettings:op.type==='fill'?sharedFill(effectiveOperation(o,op),o):op.fillSettings}));
        copy.multiHoopDomain=domains[i].flatMap(poly=>poly.map(points));
        buckets[i].push(copy);
      });
      splits.push({objectId:o.id,kind:'fill',message:'Source geometry partitioned with a shared row/texture grid; compensation capped at each seam. Inspect actual stitches and test the join.'});
    } else if(run) {
      const rings=hoops.map(()=>[]);let missing=0;
      for(const ring of o.rings){const r=clipPath(ring,closed,p,hoops);r.paths.forEach((paths,i)=>rings[i].push(...paths));missing+=r.missing;}
      if(missing>0.01){fail(`${missing.toFixed(2)} mm of path is uncovered. Move/add a hoop.`);continue;}
      rings.forEach((rings,i)=>{if(rings.length)buckets[i].push({...snapshot(o),type:'run',closed:false,rings,operations:operationsOf(o).map(op=>({...structuredClone(op),closed:false}))});});
      splits.push({objectId:o.id,kind:'path',message:'Source paths cut at ownership boundaries and regenerated with independent entry/exit ties.'});
    } else fail('this satin, lettering, construction or decorative fill cannot be cut automatically without changing its construction. Move the seam between complete contours, split it with existing editing tools, or revise its sewing action explicitly. No stitches have been silently clipped.');
  }
  const sections=hoops.map((h,i)=>{
    buckets[i].sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));
    const project=sectionProject(p,h,buckets[i]);
    project.sequencing={mode:'manual',origin:'sequence',order:project.objects.map(o=>o.id)};
    project.planning={...project.planning,smallDetail:0};
    for(const o of project.objects)if(o.multiHoopDomain)o.multiHoopDomain=o.multiHoopDomain.map(r=>r.map(q=>({x:q.x-h.x,y:q.y-h.y})));
    return {hoop:h,number:i+1,project,objectIds:project.objects.map(o=>o.id)};
  });
  // Cross-hooping order must not reverse physically overlapping paints. Test
  // derived source interiors (not just master boxes), so disjoint butt seams
  // of two ordered full-design fills do not create false dependencies.
  for(let later=1;later<sections.length;later++)for(let earlier=0;earlier<later;earlier++)
    for(const a of buckets[later])for(const b of buckets[earlier]) {
      if(a.id===b.id || order.indexOf(a.id)>=order.indexOf(b.id))continue;
      const A=bounds(pointsOf(a)),B=bounds(pointsOf(b));
      if(A.minX>=B.maxX||A.maxX<=B.minX||A.minY>=B.maxY||A.maxY<=B.minY)continue;
      const pa=(a.type==='fill'||a.closed)?fillPolygons(a.rings,a.fillRule):null,pb=(b.type==='fill'||b.closed)?fillPolygons(b.rings,b.fillRule):null;
      if(pa&&pb&&polygonArea(clipping.intersection(pa,pb))<areaTolerance)continue;
      problems.push({objectId:a.id,message:`Hooping order reverses overlapping artwork “${a.name}” / “${b.name}”. Reorder hoopings or change whole-object assignments.`});
    }
  return {sections,domains,problems,splits};
}
export function generateMultiHoop(master) {
  const result=deriveSections(master),events=[];
  let total=0;
  for(const s of result.sections) {
    s.plan=generate(s.project);total+=s.plan.events.length;
    if(total>1000000)throw Error('Multi-hoop preview exceeds one million commands. Simplify the master or use wider spacing.');
    if(!s.plan.stats.fits)result.problems.push({hoopId:s.hoop.id,message:`Hooping ${s.number}: regenerated stitches exceed its sewing field. Move the hoop or adjust the source settings.`});
    for(const issue of s.plan.issues||[])if(issue.severity==='error')result.problems.push({hoopId:s.hoop.id,message:`Hooping ${s.number}: ${issue.message}`});
    s.plan.events.forEach((e,i)=>events.push({...e,x:e.x+s.hoop.x,y:e.y+s.hoop.y,hoopingId:s.hoop.id,...(i===0?{hoopStart:{x:s.hoop.x,y:s.hoop.y}}:{})}));
  }
  const stats=analyze(events,getMachine(master));
  for(const key of ['stitches','jumps','trims','changes','stops','manualChanges','thread','minutes','jumpDistance','travelStitches','anchorStitches'])stats[key]=result.sections.reduce((n,s)=>n+(s.plan.stats[key]||0),0);
  stats.fits=!result.problems.length&&result.sections.every(s=>s.plan.stats.fits);
  const issues=result.problems.map(p=>({...p,severity:'error',action:'Review Multi-Hoop placement, assignments and source seams before export.'}));
  return {...result,assembled:{events,stats,issues,warnings:[],diagnostics:{multiHoop:true},order:result.sections.flatMap(s=>s.plan.order||[])}};
}
