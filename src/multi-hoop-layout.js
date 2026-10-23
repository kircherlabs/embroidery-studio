import { getMachine } from './equipment.js';
import { bounds, pointsOf, uid } from './model.js';
import { isVisible } from './hierarchy.js';
import { clipping, coordinates, fillPolygons, polygonArea } from './geometry.js';
export const artworkForHooping = p => p.objects.filter(o => o.type !== 'reference' && isVisible(p,o));
export const masterBounds = p => bounds(artworkForHooping(p).flatMap(pointsOf));
export const newLayout = () => ({version:1, enabled:true, overlap:10, margin:2, registration:false, hoops:[], assignments:{}});
export function hoopRect(p,h,inset=0) {
  const m=getMachine(p), w=m.width/2-inset, t=m.height/2-inset;
  if(w<=0 || t<=0) throw Error('Safety margin leaves no usable sewing field.');
  return [[[[h.x-w,h.y-t],[h.x+w,h.y-t],[h.x+w,h.y+t],[h.x-w,h.y+t],[h.x-w,h.y-t]]]];
}
export function suggestHoops(p) {
  const layout=p.multiHoop || newLayout(), m=getMachine(p), b=masterBounds(p);
  const w=m.width-2*layout.margin, h=m.height-2*layout.margin;
  if(layout.overlap>=Math.min(w,h) || w<=0 || h<=0) throw Error('Overlap must be smaller than the usable sewing field.');
  const nx=Math.max(1,Math.ceil(Math.max(0,b.width-w)/(w-layout.overlap))+1);
  const ny=Math.max(1,Math.ceil(Math.max(0,b.height-h)/(h-layout.overlap))+1);
  if(nx*ny>64) throw Error('This layout needs more than 64 hoopings. Increase the field or divide production manually.');
  const dx=nx>1?(b.width-w)/(nx-1):0, dy=ny>1?(b.height-h)/(ny-1):0;
  return Array.from({length:ny},(_,y)=>Array.from({length:nx},(_,x)=>({id:uid(), x:(nx===1?(b.minX+b.maxX)/2:b.minX+w/2+x*dx), y:(ny===1?(b.minY+b.maxY)/2:b.minY+h/2+y*dy),seamX:0,seamY:0}))).flat();
}
export function containsBounds(p,h,b,pad=0) {
  const m=getMachine(p), margin=(p.multiHoop?.margin||0)+pad;
  return b.minX>=h.x-m.width/2+margin-1e-6 && b.maxX<=h.x+m.width/2-margin+1e-6 && b.minY>=h.y-m.height/2+margin-1e-6 && b.maxY<=h.y+m.height/2-margin+1e-6;
}
// Restrict each sewing domain to its own field, then remove only the part of
// overlapping fields owned by a closer split center. This covers irregular 2D
// layouts without duplicating fill area, even when the nearest *uncovered* hoop
// would otherwise win a naive global Voronoi partition.
function halfPlane(ring,a,b,c) {
  const out=[];
  for(let i=0;i<ring.length;i++) {
    const u=ring[i],v=ring[(i+1)%ring.length],du=a*u[0]+b*u[1]-c,dv=a*v[0]+b*v[1]-c;
    if(du<=0) out.push(u);
    if((du<0&&dv>0)||(du>0&&dv<0)) {const t=du/(du-dv);out.push([u[0]+t*(v[0]-u[0]),u[1]+t*(v[1]-u[1])]);}
  }
  if(out.length<3) return [];
  out.push(out[0]); return [[out]];
}
export function splitDomains(p) {
  const hoops=p.multiHoop?.hoops||[],margin=p.multiHoop?.margin||0;
  return hoops.map((h,i)=>{
    let domain=hoopRect(p,h,margin);
    const u={x:h.x+(h.seamX||0),y:h.y+(h.seamY||0)};
    for(let j=0;j<hoops.length && domain.length;j++) {
      if(j===i) continue;
      const other=hoops[j],v={x:other.x+(other.seamX||0),y:other.y+(other.seamY||0)};
      if(Math.hypot(v.x-u.x,v.y-u.y)<1e-8) {if(j<i) domain=clipping.difference(domain,hoopRect(p,other,margin));continue;}
      // Other owns points where distance(other)^2 < distance(this)^2.
      const a=2*(u.x-v.x),b=2*(u.y-v.y),c=u.x*u.x+u.y*u.y-v.x*v.x-v.y*v.y;
      const win=halfPlane(hoopRect(p,other,margin)[0][0].slice(0,-1),a,b,c);
      if(win.length) domain=clipping.difference(domain,win);
    }
    return domain;
  });
}
export function coverage(p) {
  const fields=(p.multiHoop?.hoops||[]).map(h=>hoopRect(p,h,p.multiHoop.margin));
  const union=fields.length?clipping.union(...fields):[];
  const uncovered=[];
  for(const o of artworkForHooping(p)) {
    if(!(o.type==='fill'||o.closed)) continue;
    const poly=fillPolygons(o.rings,o.fillRule);
    const gap=union.length?clipping.difference(poly,union):poly;
    if(polygonArea(gap)>0.0001) uncovered.push({objectId:o.id,area:polygonArea(gap),polygon:gap});
  }
  return {union,uncovered};
}
