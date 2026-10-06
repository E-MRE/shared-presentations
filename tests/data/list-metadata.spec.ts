import { beforeEach, describe, expect, it, vi } from 'vitest';
const fixture=vi.hoisted(()=>({ records: [] as Array<{id:string,data:()=>Record<string,unknown>}>, reads: [] as string[], missing: '', blank: '' }));
vi.mock('../../src/firebase',()=>({db:{},auth:{currentUser:null}}));
vi.mock('firebase/firestore',async importOriginal=>({
 ...(await importOriginal<object>()),
 collection: (_db:unknown,...path:string[])=>path.join('/'),
 doc: (_db:unknown,...path:string[])=>({path:path.join('/')}),
 query: (ref:unknown,...constraints:unknown[])=>({ref,constraints}),
 getDocs: vi.fn(async()=>({docs:fixture.records})),
 getDoc: vi.fn(async(ref:{path:string})=>{
  fixture.reads.push(ref.path);
  const parts=ref.path.split('/'),id=parts[1],index=Number(parts[3]);
  const data=parts.length===2 ? record(id,2).data() : id===fixture.missing?undefined:{index,label:id===fixture.blank?'   ':'Link',url:`https://example.com/${index}`};
  return {exists:()=>!!data,data:()=>data};
 }),
}));
import { FirestorePresentationDataService } from '../../src/data/service';
function record(id:string,count?:number) {
 const data={ownerUid:'owner',title:id,description:'',kind:'pptx',status:'pending',fileName:'deck.pptx',
  sizes:{encoded:1,unpacked:1,fileCount:1},chunkCount:1,manifestVersion:count===undefined?1:2,
  ...(count===undefined?{links:[{label:'   ',url:'https://example.com'}],chunks:[{index:0,size:1}]}:{linkCount:count}),
  createdAt:new Date(),updatedAt:new Date()};
 return {id,data:()=>data};
}
beforeEach(()=>{fixture.records=[];fixture.reads=[];fixture.missing='';fixture.blank='';});
describe('Metadata lists isolate link failures; real service with mocked SDK transport',()=>{
 it('loads zero child documents for a 12-card page with ten links each',async()=>{
  fixture.records=Array.from({length:13},(_,i)=>record(`deck-${i}`,10));
  const result=await new FirestorePresentationDataService().getPublishedFeed();
  expect(result.ok).toBe(true);if(!result.ok)throw new Error('Unexpected list error');
  expect(result.value.items).toHaveLength(12);expect(result.value.hasMore).toBe(true);expect(fixture.reads).toHaveLength(0);
 });
 it('keeps the review queue available when a deck has a missing link',async()=>{
  fixture.records=[record('healthy',1),record('incomplete',1)];fixture.missing='incomplete';
  const result=await new FirestorePresentationDataService().getReviewQueue();
  expect(result.ok).toBe(true);if(!result.ok)throw new Error('Unexpected failure');expect(result.value.items).toHaveLength(2);expect(fixture.reads).toHaveLength(0);
 });
 it('keeps the feed available when a deck has an invalid link',async()=>{
  fixture.records=[record('healthy',1),record('blank-label',1)];fixture.blank='blank-label';
  const result=await new FirestorePresentationDataService().getPublishedFeed();
  expect(result.ok).toBe(true);if(!result.ok)throw new Error('Unexpected failure');expect(result.value.items).toHaveLength(2);expect(fixture.reads).toHaveLength(0);
 });
 it('detail fetch resolves links and reports missing or invalid links for only that deck',async()=>{
  const api=new FirestorePresentationDataService();
  const detail=await api.getDeck('detail');expect(detail.ok).toBe(true);if(!detail.ok)throw new Error('No detail');expect(detail.value.links).toHaveLength(2);expect(fixture.reads.filter(path=>path.includes('/links/'))).toHaveLength(2);
  fixture.missing='detail';expect((await api.getDeck('detail')).ok).toBe(false);fixture.missing='';fixture.blank='detail';expect((await api.getDeck('detail')).ok).toBe(false);
 });
 it('the same legacy inline label does not break metadata listing',async()=>{
  fixture.records=[record('legacy')];
  const result=await new FirestorePresentationDataService().getPublishedFeed();expect(result.ok).toBe(true);expect(fixture.reads).toHaveLength(0);
 });
});
