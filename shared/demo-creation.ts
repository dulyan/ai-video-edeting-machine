import {z} from 'zod';
const point=z.tuple([z.number().finite().min(0).max(1),z.number().finite().min(0).max(1)]);
export const demoActionSchema=z.object({id:z.string().min(1).max(100),description:z.string().max(2000),gesture:z.enum(['tap','swipe','hold']),at:z.number().min(0).max(30),until:z.number().min(0).max(30),screen:z.number().int().min(0).max(29),next:z.number().int().min(0).max(29),target:point,end:point,transition:z.enum(['hold','fade','slide','scroll']),viewport:z.tuple([z.number().min(0).max(1),z.number().min(0).max(1)]).default([0,1]),transitionDuration:z.number().min(0).max(2).default(.25)});
export const demoCalibrationSchema=z.object({time:z.number().min(0).max(30),corners:z.tuple([point,point,point,point]),hand:z.array(point).max(30).default([]),holding:z.array(point).max(30).default([]),exclude:z.array(point).max(30).default([]),editRegion:z.array(point).max(100).optional(),maskStrokes:z.array(z.object({object:z.enum(['hand','holding']).default('hand'),points:z.array(point).min(1).max(500),radius:z.number().min(.001).max(.15),erase:z.boolean()})).max(100).default([])});
export const demoCreationSchema=z.object({version:z.literal(1),useGpu:z.boolean().default(true),step:z.number().int().min(0).max(5),sourceId:z.string().max(200),start:z.number().min(0).max(86400),duration:z.number().int().min(3).max(30),device:z.enum(['phone','tablet']),scene:z.enum(['preserve','recreate']),accuracy:z.enum(['strict','approximate']),inputMode:z.enum(['screenshots','recording']),screens:z.array(z.object({assetId:z.string().max(200),name:z.string().max(200),instructions:z.string().max(4000)})).max(30),recordingId:z.string().max(200),recordingStart:z.number().min(0).max(86400),instructions:z.string().max(20000),actions:z.array(demoActionSchema).max(30),planningModel:z.string().max(200),videoModel:z.string().max(200),size:z.enum(['720p','1080p']),sourceCalibration:z.array(demoCalibrationSchema).max(100),candidateCalibration:z.array(demoCalibrationSchema).max(100),previewId:z.string().max(200).default(''),walkthroughId:z.string().max(200),candidateId:z.string().max(200),sceneApproved:z.boolean(),reviews:z.record(z.string(),z.object({point:point,end:point,startRecorded:z.boolean().default(false),endRecorded:z.boolean().default(false),startTime:z.number().min(0).max(30).default(0),endTime:z.number().min(0).max(30).default(0),approved:z.boolean()})),trackingJobId:z.string().max(200),recordingApproved:z.boolean()});
export type DemoCreationDraft=z.infer<typeof demoCreationSchema>;
export type DemoAction=z.infer<typeof demoActionSchema>;
export type DemoCalibration=z.infer<typeof demoCalibrationSchema>;
export const defaultCorners:DemoCalibration['corners']=[[.3,.2],[.7,.2],[.7,.8],[.3,.8]];
export function newDemoCreation():DemoCreationDraft{return {version:1,useGpu:true,step:0,sourceId:'',start:0,duration:5,device:'phone',scene:'preserve',accuracy:'strict',inputMode:'screenshots',screens:[],recordingId:'',recordingStart:0,instructions:'',actions:[],planningModel:'google/gemini-3.1-pro-preview',videoModel:'kuaishou/kling-4.0-video-edit',size:'1080p',sourceCalibration:[],candidateCalibration:[],previewId:'',walkthroughId:'',candidateId:'',sceneApproved:false,reviews:{},trackingJobId:'',recordingApproved:false};}
export function validateDemoTimeline(d:DemoCreationDraft){
 if(!d.instructions.trim())throw new Error('Describe the walkthrough before continuing.');
 if(!d.actions.length)throw new Error('Add at least one action.');
 let last=0;for(const a of d.actions){if(a.viewport[1]<=a.viewport[0])throw new Error('Scroll viewport bottom must be below its top.');if(a.at<last||a.until<a.at||a.until+a.transitionDuration>d.duration+.001)throw new Error('Actions must be chronological, non-overlapping, and fit the selected duration.');last=a.until+a.transitionDuration;if(d.inputMode==='screenshots'&&(a.screen>=d.screens.length||a.next>=d.screens.length))throw new Error('An action references a missing screenshot.');}
 if(new Set(d.actions.map(a=>a.id)).size!==d.actions.length)throw new Error('Action IDs must be unique.');
 if(d.inputMode==='screenshots'&&!d.screens.length)throw new Error('Add screenshots.');
 if(d.inputMode==='recording'&&!d.recordingId)throw new Error('Choose a screen recording.');
}
export function validateDemoReview(d:DemoCreationDraft){
 if(!d.previewId)throw new Error('Render and inspect a composited preview first.');
 if(!d.sceneApproved)throw new Error('Review and approve the scene, hands, nails, tracking and masks first.');
 if(d.accuracy==='strict')for(const a of d.actions.filter(a=>a.gesture!=='hold')){
  const r=d.reviews[a.id];if(!r?.approved||!r.startRecorded||(a.gesture==='swipe'&&!r.endRecorded))throw new Error('Strict mode requires an approved contact review for every action.');
  if(Math.abs(r.startTime-(a.gesture==='swipe'?a.at:a.until))>.12||(a.gesture==='swipe'&&Math.abs(r.endTime-a.until)>.12))throw new Error('Review the contact at the action time, or correct the timeline.');
  const distance=(x:number[],y:number[])=>Math.hypot(x[0]-y[0],x[1]-y[1]);
  if(distance(r.point,a.target)>.04||(a.gesture==='swipe'&&distance(r.end,a.end)>.04))throw new Error('A reviewed contact misses its target. Correct the movement/timing or use approximate mode.');
 }
}
/** Changes invalidate downstream results; never silently keep approval after editing. */
export function changeDemo(d:DemoCreationDraft,patch:Partial<DemoCreationDraft>):DemoCreationDraft{
 const keys=Object.keys(patch);
 const inputChange=keys.some(k=>['sourceId','start','duration','screens','inputMode','recordingId','recordingStart','instructions','actions'].includes(k));
 const motionChange=inputChange||keys.some(k=>['scene','device','videoModel','size'].includes(k));
 const trackChange=motionChange||keys.some(k=>['candidateId','sourceCalibration','candidateCalibration','useGpu'].includes(k));
 return {...d,...(inputChange?{walkthroughId:'',recordingApproved:false}:{}),...(motionChange?{candidateId:''}:{}),...(trackChange?{trackingJobId:'',previewId:'',sceneApproved:false,reviews:{}}:{}),...(keys.some(k=>['walkthroughId','trackingJobId','useGpu'].includes(k))?{previewId:'',sceneApproved:false,reviews:{}}:{}),...patch};
}
export function demoMotionPrompt(d:DemoCreationDraft){return `Edit the provided ${d.device} reference video into one continuous ${d.duration}-second app demonstration. ${d.scene==='preserve'?'Preserve the camera movement, phone/tablet position, holding-hand pose, background, lighting, skin, nail design and finger anatomy. Replace ONLY the interacting hand movements; remove the old gesture trajectory.':'Recreate a coherent realistic scene inspired by the reference; keep a clearly visible, trackable device screen and natural hands.'} The screen will be replaced afterward: do not rely on generated interface lettering. Perform these gestures in chronological order. Coordinates are normalized device-screen coordinates, x left-to-right and y top-to-bottom. Match gesture timing and touch locations as closely as possible. No extra gestures, duplicate fingers, cuts, or camera jumps.\n${d.actions.map(a=>`${a.at}s–${a.until}s: ${a.gesture}, ${a.description}, target ${a.target.join(',')}${a.gesture==='swipe'?`, swipe end ${a.end.join(',')}`:''}`).join('\n')}\nWalkthrough context: ${d.instructions}`;}
