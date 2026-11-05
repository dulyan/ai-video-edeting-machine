import {renderHookPNG} from './emoji-hook.ts';
process.on('message',async (message:any)=>{
 try {
  const png=await renderHookPNG(message.hook,message.composition,message.width,message.height);
  process.send?.({png,rss:process.memoryUsage().rss});
 }catch(error){process.send?.({error:error instanceof Error?error.message:String(error)});}
});
