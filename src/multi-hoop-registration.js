import { object, bounds, pointsOf } from './model.js';
import { getMachine } from './equipment.js';
import { artworkForHooping } from './multi-hoop-layout.js';
import { inside } from './geometry.js';
import { footprintPadding } from './multi-hoop-assignment.js';
export const MARK_RADIUS=0.7;
const segmentDistance=(p,a,b)=>{
  const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
};
export function registrationFor(p) {
  if(!p.multiHoop.registration)return {pairs:[],problems:[]};
  const hoops=p.multiHoop.hoops,m=getMachine(p),pairs=[],problems=[],links=[];
  const source=artworkForHooping(p).map(o=>({o,b:bounds(pointsOf(o)),pad:footprintPadding(o)}));
  const clear=q=>!source.some(({o,b,pad})=>{
    const r=MARK_RADIUS+pad+0.2;
    if(q.x<b.minX-r||q.x>b.maxX+r||q.y<b.minY-r||q.y>b.maxY+r)return false;
    if((o.type==='fill'||o.closed)&&inside(q,o.rings,o.fillRule))return true;
    const rings=o.type==='manual'?[pointsOf(o)]:o.rings;
    return rings.some(ring=>ring.some((a,i)=>{
      const b=ring[i+1]||((o.closed||o.type==='fill')?ring[0]:null);
      return b&&segmentDistance(q,a,b)<r;
    }));
  });
  for(let i=0;i<hoops.length;i++)for(let j=i+1;j<hoops.length;j++) {
    const a=hoops[i],b=hoops[j],pad=MARK_RADIUS+0.5;
    const x0=Math.max(a.x,b.x)-m.width/2+pad,x1=Math.min(a.x,b.x)+m.width/2-pad;
    const y0=Math.max(a.y,b.y)-m.height/2+pad,y1=Math.min(a.y,b.y)+m.height/2-pad;
    if(x1<=x0||y1<=y0)continue;
    links.push({i,j,a,b,x0,x1,y0,y1,d:Math.hypot(a.x-b.x,a.y-b.y)});
  }
  links.sort((a,b)=>a.d-b.d||a.i-b.i||a.j-b.j);
  const parent=hoops.map((_,i)=>i),root=i=>parent[i]===i?i:root(parent[i]);
  for(const link of links) {
    if(root(link.i)===root(link.j))continue;
    const candidates=[];
    for(let y=0;y<=24;y++)for(let x=0;x<=12;x++) {
      const q={x:link.x0+(link.x1-link.x0)*x/12,y:link.y0+(link.y1-link.y0)*y/24};
      if(clear(q))candidates.push(q);
    }
    let best=null,length=0;
    for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++) {
      const d=Math.hypot(candidates[i].x-candidates[j].x,candidates[i].y-candidates[j].y);
      if(d>length){length=d;best=[candidates[i],candidates[j]];}
    }
    if(!best||length<8)continue;
    parent[root(link.j)]=root(link.i);
    pairs.push({id:`R${pairs.length+1}`,a:link.a.id,b:link.b.id,points:best,baseline:length});
  }
  if(hoops.length>1&&new Set(parent.map((_,i)=>root(i))).size>1)
    problems.push({message:'Stitchable registration needs two clear shared points at least 8 mm apart between connected hoopings. Move the fields to create clear overlap, or disable stitched marks and use the measured templates. Marks will never be placed over artwork silently.'});
  return {pairs,problems};
}
export function registrationObjects(registration,hoop) {
  const objects=registration.pairs.filter(p=>p.a===hoop.id||p.b===hoop.id).flatMap(pair=>pair.points.map((q,i)=>{
    const x=q.x-hoop.x,y=q.y-hoop.y,r=MARK_RADIUS;
    return object(`Registration ${pair.id}${i?'B':'A'} · temporary thread`,[[{x:x-r,y},{x:x+r,y}],[{x,y:y-r},{x,y:y+r}]],{id:`@registration:${pair.id}:${i}`,type:'run',closed:false,color:'#c54b49',length:0.7,underlay:false,compensation:0,operations:[{id:'mark',type:'run',name:'Temporary registration · align before sewing',color:'#c54b49',closed:false,length:0.7,underlay:false,tieIn:false,tieOff:false}]});
  }));
  if(objects.length)objects.at(-1).operations.push({id:'registration-stop',type:'stop',name:'Verify registration; replace temporary thread before artwork',color:'#c54b49'});
  return objects;
}
