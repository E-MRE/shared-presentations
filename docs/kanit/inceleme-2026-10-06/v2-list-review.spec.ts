import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const fixture=vi.hoisted(()=>({ records: [] as Array<{id:string,data:()=>Record<string,unknown>}>, reads: [] as string[], missing: '', blank: '' }));
const observations: unknown[]=[];
vi.mock('../../../src/firebase',()=>({db:{},auth:{currentUser:null}}));
vi.mock('firebase/firestore',async importOriginal=>({
 ...(await importOriginal<object>()),
 collection: (_db:unknown,...path:string[])=>path.join('/'),
 doc: (_db:unknown,...path:string[])=>({path:path.join('/')}),
 query: (ref:unknown,...constraints:unknown[])=>({ref,constraints}),
 getDocs: vi.fn(async()=>({docs:fixture.records})),
 getDoc: vi.fn(async(ref:{path:string})=>{
  fixture.reads.push(ref.path);
  const parts=ref.path.split('/'),id=parts[1],index=Number(parts[3]);
  const data=id===fixture.missing?undefined:{index,label:id===fixture.blank?'   ':'Link',url:`https://example.com/${index}`};
  return {exists:()=>!!data,data:()=>data};
 }),
}));
import { FirestorePresentationDataService } from '../../../src/data/service';
function record(id:string,count?:number) {
 const data={ownerUid:'owner',title:id,description:'',kind:'pptx',status:'pending',fileName:'deck.pptx',
  sizes:{encoded:1,unpacked:1,fileCount:1},chunkCount:1,manifestVersion:count===undefined?1:2,
  ...(count===undefined?{links:[{label:'   ',url:'https://example.com'}],chunks:[{index:0,size:1}]}:{linkCount:count}),
  createdAt:new Date(),updatedAt:new Date()};
 return {id,data:()=>data};
}
beforeEach(()=>{fixture.records=[];fixture.reads=[];fixture.missing='';fixture.blank='';});
afterAll(()=>{const dir=resolve(process.env.EVIDENCE_DIR ?? 'test-results/review');mkdirSync(dir,{recursive:true});writeFileSync(resolve(dir,'v2-list-observations.json'),JSON.stringify(observations,null,2));});
describe('Independent v2 list review; mocked SDK transport, real production service',()=>{
 it('loads 120 child documents for a 12-card page with ten links each',async()=>{
  fixture.records=Array.from({length:13},(_,i)=>record(`deck-${i}`,10));
  const result=await new FirestorePresentationDataService().getPublishedFeed();
  expect(result.ok).toBe(true);if(!result.ok)throw new Error('Unexpected list error');
  expect(result.value.items).toHaveLength(12);expect(result.value.hasMore).toBe(true);expect(fixture.reads).toHaveLength(120);
  observations.push({case:'12 cards, 10 links each',items:12,childReads:fixture.reads.length});
 });
 it('one missing child makes the entire review queue fail, including a healthy deck',async()=>{
  fixture.records=[record('healthy',1),record('incomplete',1)];fixture.missing='incomplete';
  const result=await new FirestorePresentationDataService().getReviewQueue();
  expect(result.ok).toBe(false);if(result.ok)throw new Error('Unexpected success');expect(result.error.code).toBe('NOT_FOUND');
  observations.push({case:'missing child in a two-deck queue',result});
 });
 it('one whitespace label makes the entire published feed fail',async()=>{
  fixture.records=[record('healthy',1),record('blank-label',1)];fixture.blank='blank-label';
  const result=await new FirestorePresentationDataService().getPublishedFeed();
  expect(result.ok).toBe(false);if(result.ok)throw new Error('Unexpected success');expect(result.error.code).toBe('NOT_FOUND');
  observations.push({case:'whitespace label in a two-deck feed',result});
 });
 it('the same legacy inline label does not break metadata listing',async()=>{
  fixture.records=[record('legacy')];
  const result=await new FirestorePresentationDataService().getPublishedFeed();expect(result.ok).toBe(true);expect(fixture.reads).toHaveLength(0);
  observations.push({case:'legacy inline label',ok:result.ok,childReads:fixture.reads.length});
 });
});
