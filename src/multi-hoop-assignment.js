import { bounds, pointsOf, translate } from './model.js';
import { ancestors } from './hierarchy.js';
import { artworkForHooping, containsBounds } from './multi-hoop-layout.js';
import { operationsOf, effectiveOperation, isSewing } from './operations.js';
import { resolvedLinkedProject } from './linked-artwork.js';
export function footprintPadding(o) {
  return Math.max(0,...operationsOf(o).filter(isSewing).map(op=>{
    const s=effectiveOperation(o,op);
    return Math.abs(s.offset||0)+(s.compensation||0)+(['satin','border'].includes(s.type)?s.width/2:0);
  }));
}
export function assignWholeObjects(master) {
  const project=resolvedLinkedProject(master),objects=artworkForHooping(project),hoops=project.multiHoop?.hoops||[];
  const assignments=new Map(), required=new Map(objects.map(o=>[o.id,new Set([o.id])])), problems=[];
  // Construction links are indivisible manufacturing blocks, not decorative groups.
  for(const o of objects) if(o.constructionArtworkIds?.length) {
    const ids=[o.id,...o.constructionArtworkIds].filter(id=>required.has(id));
    const union=new Set(ids.flatMap(id=>[...required.get(id)]));
    for(const id of union) required.set(id,union);
  }
  const fits=(h,list)=>list.every(o=>containsBounds(project,h,bounds(pointsOf(o)),footprintPadding(o)));
  const choose=list=>{
    const explicit=[...new Set(list.map(o=>project.multiHoop.assignments?.[o.id]).filter(Boolean))];
    if(explicit.length>1) return null;
    if(explicit.length) return hoops.find(h=>h.id===explicit[0]&&fits(h,list))||null;
    return hoops.filter(h=>fits(h,list)).sort((a,b)=>{
      const r=bounds(list.flatMap(pointsOf)),x=(r.minX+r.maxX)/2,y=(r.minY+r.maxY)/2;
      return Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y);
    })[0];
  };
  // First try a complete top-level group, without overriding explicit choices.
  for(const g of (project.groups||[]).filter(g=>!g.parentId)) {
    const list=objects.filter(o=>ancestors(project,o).some(a=>a.id===g.id));
    if(!list.length) continue;
    const h=choose(list);if(h)for(const o of list)assignments.set(o.id,h.id);
  }
  const seen=new Set();
  for(const o of objects) {
    const set=required.get(o.id);if(seen.has(set))continue;seen.add(set);
    const list=objects.filter(n=>set.has(n.id));
    if(list.every(n=>assignments.has(n.id)) && new Set(list.map(n=>assignments.get(n.id))).size===1) continue;
    const h=choose(list);
    if(h)for(const n of list)assignments.set(n.id,h.id);
    else if(list.length>1) { for(const n of list)assignments.delete(n.id);problems.push({objectId:o.id,message:`${o.name}: linked fabric construction must fit one hooping. Move a hoop or revise the construction manually.`}); }
    else if(project.multiHoop.assignments?.[o.id]) problems.push({objectId:o.id,message:`${o.name}: its assigned hooping is missing or does not contain its full stitch footprint. Choose Automatic or move that hoop.`});
  }
  return {project,objects,assignments,problems,unassigned:objects.filter(o=>!assignments.has(o.id))};
}
export function sectionProject(master,hoop,objects) {
  const p=structuredClone(master);
  delete p.multiHoop;
  p.name=`${master.name} · hoop ${master.multiHoop.hoops.indexOf(hoop)+1}`;
  p.objects=structuredClone(objects);
  // Linked geometry is already resolved in world coordinates. Do not resolve it
  // a second time after changing to this section's local sewing coordinates.
  for(const o of p.objects) {
    delete o.linkedGeometry;
    // A shared master grid must translate with the section's coordinate origin.
    for(const action of [o,...(o.operations||[])])if(action.fillSettings)action.fillSettings.anchor='object';
    translate(o,-hoop.x,-hoop.y);
  }
  const needed=new Set(objects.flatMap(o=>ancestors(master,o).map(g=>g.id)));
  p.groups=(p.groups||[]).filter(g=>needed.has(g.id));
  return p;
}
