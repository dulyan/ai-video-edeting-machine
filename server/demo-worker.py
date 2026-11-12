"""Private, single-job media worker. All paths originate in the authenticated backend."""
import json, os, sys, shutil, subprocess, tempfile
from pathlib import Path
import cv2
import numpy as np

cv2.setNumThreads(2)

def capture(file):
    return cv2.VideoCapture(str(file), cv2.CAP_FFMPEG, [cv2.CAP_PROP_N_THREADS, 2])

def report(progress, message):
    print(json.dumps({'progress': progress, 'message': message}), flush=True)

def frame_at(file, time):
    cap = capture(file); cap.set(cv2.CAP_PROP_POS_MSEC, time * 1000)
    ok, frame = cap.read(); cap.release()
    if not ok: raise ValueError('Could not read the requested video frame')
    return frame

def dimensions(frame, limit=1920):
    h, w = frame.shape[:2]; scale = min(1, limit / max(w, h))
    return max(2, round(w * scale / 2) * 2), max(2, round(h * scale / 2) * 2)

def points(values, w, h): return np.asarray(values, dtype=np.float32) * [w, h]

def brush_mask(stroke,w,h):
    # Match the editor's normalized SVG brush on portrait and landscape frames.
    mask=np.zeros((1000,1000),np.uint8);ps=points(stroke['points'],1000,1000).astype(np.int32);radius=max(1,round(stroke['radius']*1000))
    for p in ps:cv2.circle(mask,tuple(p),radius,255,-1)
    if len(ps)>1:cv2.polylines(mask,[ps],False,255,radius*2)
    return cv2.resize(mask,(w,h),interpolation=cv2.INTER_NEAREST)>0

def writer(file, w, h, ffmpeg):
    return subprocess.Popen([ffmpeg, '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{w}x{h}', '-r', '30', '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-threads', '2', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(file)], stdin=subprocess.PIPE, creationflags=0x08000000 if os.name == 'nt' else 0)

def finish(proc):
    proc.stdin.close()
    if proc.wait(timeout=120): raise RuntimeError('Video encoding failed')

def fit(image, w, h):
    ih, iw = image.shape[:2]; scale = min(w / iw, h / ih)
    sw, sh = max(1, round(iw * scale)), max(1, round(ih * scale))
    out = np.zeros((h, w, 3), np.uint8); x, y = (w-sw)//2, (h-sh)//2
    out[y:y+sh, x:x+sw] = cv2.resize(image, (sw, sh), interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_LINEAR)
    return out

def scroll_canvas(old, new, viewport):
    h,w=old.shape[:2];top,bottom=round(viewport[0]*h),round(viewport[1]*h)
    a,b=old[top:bottom],new[top:bottom];rh=len(a)
    if rh<8:raise ValueError('Scroll viewport is too small')
    (dx,dy),confidence=cv2.phaseCorrelate(cv2.cvtColor(a,cv2.COLOR_BGR2GRAY).astype(np.float32),cv2.cvtColor(b,cv2.COLOR_BGR2GRAY).astype(np.float32))
    offset=round(-dy)
    if confidence<.1 or abs(dx)>max(3,w*.02) or abs(offset)<3 or abs(offset)>=rh*.9:raise ValueError('Scroll states need recognizable overlapping content. Correct the viewport, supply more screenshots, or use a recording/slide.')
    overlap_a,overlap_b=(a[offset:],b[:-offset]) if offset>0 else (a[:offset],b[-offset:])
    if np.abs(overlap_a.astype(np.float32)-overlap_b.astype(np.float32)).mean()>25:raise ValueError('Scroll screenshots do not align within the viewport. Supply matching overlapping states.')
    ribbon=np.concatenate([a,b[-offset:]],axis=0) if offset>0 else np.concatenate([b[:-offset],a],axis=0)
    return top,bottom,offset,ribbon

def walkthrough(m):
    d = m['draft']; files = m['screens']; duration = d['duration']; recording = None
    if d['inputMode'] == 'recording':
        recording = capture(m['recording']); recording.set(cv2.CAP_PROP_POS_MSEC, d['recordingStart']*1000)
        ok, initial = recording.read()
        if not ok: raise ValueError('Screen recording cannot be read')
        recording.set(cv2.CAP_PROP_POS_MSEC, d['recordingStart']*1000)
    else:
        initial = cv2.imread(files[0])
        if initial is None: raise ValueError('Screenshot cannot be read')
    w, h = dimensions(initial); images = [fit(cv2.imread(p), w, h) for p in files] if not recording else []
    scrolls={a['id']:scroll_canvas(images[a['screen']],images[a['next']],a['viewport']) for a in d['actions'] if a['transition']=='scroll'} if not recording else {}
    proc = writer(m['output'], w, h, m['ffmpeg'])
    try:
        for i in range(duration*30):
            t = i/30
            if recording:
                ok, image = recording.read()
                if not ok: raise ValueError('Screen recording ends before the walkthrough; choose another start/duration')
                image = fit(image, w, h)
            else:
                index = 0; image = images[index]
                for a in d['actions']:
                    if t < a['until']: break
                    old, new = images[a['screen']], images[a['next']]
                    length = a['transitionDuration']; mix = min(1, max(0, (t-a['until'])/length)) if length else 1
                    if a['transition']=='hold': image=new
                    elif a['transition']=='fade': image=cv2.addWeighted(old, 1-mix, new, mix, 0)
                    elif a['transition']=='scroll':
                        top,bottom,offset,ribbon=scrolls[a['id']];shift=round(abs(offset)*mix)
                        start=shift if offset>0 else abs(offset)-shift
                        image=old.copy();image[top:bottom]=ribbon[start:start+bottom-top]
                    else:
                        shift=round(h*mix); image=np.empty_like(old)
                        image[:h-shift]=old[shift:]; image[h-shift:]=new[:shift]
                    index=a['next']
                    if mix < 1: break
                    image=images[index]
            proc.stdin.write(image.tobytes())
            if i%30==0: report(i/(duration*30)*95, 'Animating app screens')
        finish(proc)
    finally:
        if proc.poll() is None: proc.kill()
        if recording: recording.release()

def track_one(file, calibrations, prefix, m, predictor):
    folder=Path(m['directory']); cap=capture(file); total=m['draft']['duration']*30
    initial=frame_at(file,0); w,h=dimensions(initial,1280); prev=None; corners=None; tracks=[]; warnings=[]
    keyframes={round(c['time']*30):c for c in calibrations}; cal=calibrations[0]; masks={1:np.zeros((h,w),np.uint8),2:np.zeros((h,w),np.uint8)}
    for start in range(0,total,90):
        frames=[]
        for _ in range(min(90,total-start)):
            ok,frame=cap.read()
            if not ok: raise ValueError('Candidate/reference is shorter than the selected duration')
            frames.append(cv2.resize(frame,(w,h)))
        gpu_masks={}
        if predictor:
            temp=Path(tempfile.mkdtemp(dir=folder,prefix='sam-window-'))
            try:
                for j,f in enumerate(frames): cv2.imwrite(str(temp/f'{j:05d}.jpg'),f)
                state=predictor.init_state(video_path=str(temp),offload_video_to_cpu=True,offload_state_to_cpu=True,async_loading_frames=False)
                seeded=False
                for obj,key in [(1,'hand'),(2,'holding')]:
                    prompts=[]
                    for offset in range(len(frames)):
                        if start+offset in keyframes: prompts.append((offset,keyframes[start+offset]))
                    if not prompts or prompts[0][0]!=0:
                        ys,xs=np.where(masks[obj]>127)
                        if start and len(xs):
                            box=np.array([xs.min(),ys.min(),xs.max(),ys.max()],dtype=np.float32)
                            predictor.add_new_points_or_box(state,frame_idx=0,obj_id=obj,box=box);seeded=True
                        elif cal.get(key): prompts.insert(0,(0,cal))
                    for offset,k in prompts:
                        pos=k.get(key,[]); neg=k.get('exclude',[])+k.get('holding' if key=='hand' else 'hand',[])
                        if pos:
                            predictor.add_new_points_or_box(state,frame_idx=offset,obj_id=obj,points=points(pos+neg,w,h).astype(np.float32),labels=np.array([1]*len(pos)+[0]*len(neg),np.int32));seeded=True
                if seeded:
                    for fi,ids,logits in predictor.propagate_in_video(state):
                        gpu_masks[fi]={int(obj):(logits[j,0]>0).cpu().numpy().astype(np.uint8)*255 for j,obj in enumerate(ids)}
                predictor.reset_state(state);del state
            finally: shutil.rmtree(temp,ignore_errors=True)
        for j,frame in enumerate(frames):
            i=start+j; gray=cv2.cvtColor(frame,cv2.COLOR_BGR2GRAY)
            if i in keyframes:
                cal=keyframes[i];corners=points(cal['corners'],w,h).astype(np.float32)
                corrections={1:np.full((h,w),-1,np.int16),2:np.full((h,w),-1,np.int16)}
                for stroke in cal.get('maskStrokes',[]):corrections[2 if stroke.get('object')=='holding' else 1][brush_mask(stroke,w,h)]=0 if stroke['erase'] else 255
            elif prev is not None:
                moved,status,error=cv2.calcOpticalFlowPyrLK(prev,gray,corners.reshape(-1,1,2),None,winSize=(31,31),maxLevel=3)
                if moved is not None and status.sum()==4 and np.isfinite(moved).all(): corners=moved[:,0]
                elif not warnings or warnings[-1]!=i-1: warnings.append(i)
            if corners is None: raise ValueError('Screen corners need a calibration at time zero')
            for obj in [1,2]:
                if j in gpu_masks: masks[obj]=gpu_masks[j].get(obj,np.zeros((h,w),np.uint8))
            hand,holding=[np.where(corrections[obj]>=0,corrections[obj],masks[obj]).astype(np.uint8) for obj in [1,2]]
            cv2.imwrite(str(folder/f'{prefix}-hand-{i:05d}.png'),hand)
            cv2.imwrite(str(folder/f'{prefix}-hold-{i:05d}.png'),holding)
            tracks.append({'corners':(corners/[w,h]).tolist(),'editRegion':cal.get('editRegion',[])})
            prev=gray
        report(10+80*(start+len(frames))/total, f'Tracking {prefix} / GPU segmentation' if predictor else f'Tracking {prefix} / manual masks')
    cap.release();return {'width':w,'height':h,'frames':tracks,'warnings':warnings}

def tracking(m):
    predictor=None
    if m['draft']['useGpu']:
        import torch
        from sam2.build_sam import build_sam2_video_predictor
        torch.set_num_threads(2)
        torch.set_num_interop_threads(1)
        if not torch.cuda.is_available():raise RuntimeError('CUDA unavailable. Choose manual masks or repair the demo worker.')
        free,total=torch.cuda.mem_get_info()
        if free<3*1024**3:raise RuntimeError('Less than 3 GB GPU memory available. Close GPU apps or choose manual masks.')
        torch.cuda.set_per_process_memory_fraction(min(.65,4*1024**3/total))
        predictor=build_sam2_video_predictor('configs/sam2.1/sam2.1_hiera_s.yaml',m['checkpoint'],device='cuda',apply_postprocessing=False)
        with torch.inference_mode(),torch.autocast('cuda',dtype=torch.float16):
            source=track_one(m['source'],m['draft']['sourceCalibration'],'source',m,predictor)
            candidate=track_one(m['candidate'],m['draft']['candidateCalibration'],'candidate',m,predictor)
    else:
        source=track_one(m['source'],m['draft']['sourceCalibration'],'source',m,None)
        candidate=track_one(m['candidate'],m['draft']['candidateCalibration'],'candidate',m,None)
    Path(m['output']).write_text(json.dumps({'source':source,'candidate':candidate,'gpuPeakBytes':torch.cuda.max_memory_allocated() if predictor else 0}),encoding='utf8')

def composite(m):
    d=m['draft']; track=json.loads(Path(m['tracks']).read_text(encoding='utf8')); folder=Path(m['trackingDirectory'])
    source=capture(m['source']);candidate=capture(m['candidate']);screen=capture(m['walkthrough'])
    initial=frame_at(m['source'],0); w,h=dimensions(initial);proc=writer(m['output'],w,h,m['ffmpeg'])
    try:
        for i in range(d['duration']*30):
            images=[]
            for cap in [source,candidate,screen]:
                ok,f=cap.read()
                if not ok:raise ValueError('A required video ends early')
                images.append(f)
            original,generated,ui=images;original=cv2.resize(original,(w,h));generated=cv2.resize(generated,(w,h))
            st=track['source']['frames'][i];ct=track['candidate']['frames'][i]
            old=points(st['corners'],w,h).astype(np.float32);new=points(ct['corners'],w,h).astype(np.float32)
            if d['scene']=='preserve':
                transform=cv2.getPerspectiveTransform(new,old);generated=cv2.warpPerspective(generated,transform,(w,h));target=old
            else:transform=np.eye(3);target=new
            def mask(prefix,kind):
                im=cv2.imread(str(folder/f'{prefix}-{kind}-{i:05d}.png'),0)
                if im is None:raise ValueError('Tracking masks are missing. Run tracking again.')
                im=cv2.resize(im,(w,h),interpolation=cv2.INTER_NEAREST)
                return cv2.warpPerspective(im,transform,(w,h)) if prefix=='candidate' else im
            ch,sh,holding=mask('candidate','hand'),mask('source','hand'),mask('source','hold')
            if d['scene']=='preserve':
                region=np.zeros((h,w),np.uint8);cv2.fillPoly(region,[points(st['editRegion'],w,h).astype(np.int32)],255)
                edit=cv2.bitwise_and(cv2.bitwise_or(ch,sh),region);edit[holding>127]=0
                out=np.where((edit>127)[...,None],generated,original)
                foreground=cv2.bitwise_or(ch,holding)
            else:out=generated.copy();foreground=cv2.bitwise_or(ch,mask('candidate','hold'))
            uh,uw=ui.shape[:2];warp=cv2.getPerspectiveTransform(np.array([[0,0],[uw-1,0],[uw-1,uh-1],[0,uh-1]],np.float32),target)
            insert=cv2.warpPerspective(ui,warp,(w,h));alpha=cv2.warpPerspective(np.full((uh,uw),255,np.uint8),warp,(w,h));alpha[foreground>100]=0
            # Preserve gentle lighting variation, never copy original UI lettering.
            low=cv2.GaussianBlur(cv2.cvtColor(out,cv2.COLOR_BGR2GRAY),(0,0),max(3,w/80)).astype(np.float32)/255
            insert=np.clip(insert.astype(np.float32)*(.85+.15*low[...,None]),0,255).astype(np.uint8)
            alpha=cv2.GaussianBlur(alpha,(3,3),0).astype(np.float32)/255;out=(insert*alpha[...,None]+out*(1-alpha[...,None])).astype(np.uint8)
            proc.stdin.write(out.tobytes())
            if i%30==0:report(i/(d['duration']*30)*95,'Compositing exact app screens under fingers')
        finish(proc)
    finally:
        for cap in [source,candidate,screen]:cap.release()
        if proc.poll() is None:proc.kill()

def main():
    m=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8-sig'));mode=m['mode']
    if mode=='walkthrough':walkthrough(m)
    elif mode=='track':tracking(m)
    elif mode=='composite':composite(m)
    elif mode=='frame':
        image=frame_at(m['source'],m['time'])
        if m.get('tracks'):
            track=json.loads(Path(m['tracks']).read_text(encoding='utf8'))[m['view']];index=min(len(track['frames'])-1,round(m.get('trackTime',m['time'])*30));corners=track['frames'][index]['corners'];h,w=image.shape[:2]
            if m.get('overlay') in ['hand','holding']:
                kind='hand' if m['overlay']=='hand' else 'hold';mask=cv2.imread(str(Path(m['trackingDirectory'])/f"{m['view']}-{kind}-{index:05d}.png"),0)
                if mask is None:raise ValueError('Tracking mask is missing')
                alpha=cv2.resize(mask,(w,h)).astype(np.float32)/255*.4;image=(image*(1-alpha[...,None])+np.array([60,200,60])*alpha[...,None]).astype(np.uint8)
            if m.get('rectified'):
                sw,sh=m.get('screenSize') or [1080,1920]
                target=np.array([[0,0],[sw-1,0],[sw-1,sh-1],[0,sh-1]],np.float32);image=cv2.warpPerspective(image,cv2.getPerspectiveTransform(points(corners,w,h).astype(np.float32),target),(sw,sh))
        cv2.imwrite(m['output'],image)
    else:raise ValueError('Unsupported demo operation')
    report(100,'Complete')

if __name__=='__main__':
    try:main()
    except Exception as e:print(json.dumps({'error':str(e)}),flush=True);sys.exit(1)
