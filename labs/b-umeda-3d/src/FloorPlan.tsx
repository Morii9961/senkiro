import { floors,nodes,station } from './model'
import { vertical, type Step } from './domain/graph'
import type { Language } from './domain/types'
export function FloorPlan({floor,lang,steps,active,zoom}:{floor:number;lang:Language;steps:Step[];active:number;zoom:number}) {
  const places=station.places.filter(n=>floors.get(n.levelId)!.ordinal===floor)
  const xs=places.flatMap(n=>[n.point[0]-n.size[0]/2,n.point[0]+n.size[0]/2]),zs=places.flatMap(n=>[n.point[1]-n.size[1]/2,n.point[1]+n.size[1]/2])
  const cx=(Math.max(...xs)+Math.min(...xs))/2,cz=(Math.max(...zs)+Math.min(...zs))/2
  const w=(Math.max(...xs)-Math.min(...xs)+15)/zoom,h=(Math.max(...zs)-Math.min(...zs)+14)/zoom
  return <svg className="plan" role="img" aria-label={lang==='en'?'Schematic floor plan':'模式平面図'} viewBox={[cx-w/2,cz-h/2,w,h].join(' ')}>
    {places.filter(n=>n.kind!=='Landing').map(n=><rect key={n.id} x={n.point[0]-n.size[0]/2} y={n.point[1]-n.size[1]/2} width={n.size[0]} height={n.size[1]} rx=".25" className={n.kind==='Platform'?'platform':n.zone}/>)}
    {station.links.map(e=>{
      const a=nodes.get(e.from)!,b=nodes.get(e.to)!,here=places.includes(a),there=places.includes(b)
      if(!here&&!there)return null
      const color=steps[active]?.link.id===e.id?'#e65618':steps.some(s=>s.link.id===e.id)?'#e99922':'#748c90'
      const [x,y]=(here?a:b).point
      if(vertical(e))return <g key={e.id}><title>{e.names[lang]}</title><rect x={x-.65} y={y-.65} width="1.3" height="1.3" fill={color}/></g>
      return <g key={e.id}><title>{e.names[lang]}</title><line x1={a.point[0]} y1={a.point[1]} x2={b.point[0]} y2={b.point[1]} stroke={color} strokeWidth={steps.some(s=>s.link.id===e.id)?.55:.2}/>{e.kind==='Gate'&&<circle cx={(a.point[0]+b.point[0])/2} cy={(a.point[1]+b.point[1])/2} r=".8" fill={color}/>}</g>
    })}
    {places.filter(n=>n.kind==='Platform'||n.kind==='Concourse'&&n.size.some(v=>v>=7)).map(n=><text key={n.id} x={n.point[0]} y={n.point[1]} textAnchor="middle">{n.names[lang]}</text>)}
  </svg>
}
