import { describe,it,expect } from 'vitest'
import { model, firstPlatform,westOutside } from '../data/manual/model'
import { sources } from '../data/manual/sources'
import { route,validate } from '../src/domain/graph'
const ids=new Set(sources.map(s=>s.id))
describe('Osaka indoor graph',()=>{
  it('resolves every endpoint, floor and source',()=>expect(()=>validate(model,ids)).not.toThrow())
  it('rejects a missing endpoint',()=>{const m=structuredClone(model);m.links[0].to='missing';expect(()=>validate(m,ids)).toThrow('Missing endpoint')})
  it('routes from the JR West gate across two floors',()=>{
    const path=route(model,westOutside.id,firstPlatform.id)!
    expect(path.map(e=>e.link.kind)).toEqual(['Gate','Passage','Elevator','Passage'])
  })
})
