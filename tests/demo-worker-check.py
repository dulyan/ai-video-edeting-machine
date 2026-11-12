"""Real CPU media checks; optional --gpu smoke uses only synthetic footage."""
import importlib.util, json, sys
from pathlib import Path
import cv2
import numpy as np

root=Path(sys.argv[1]);ffmpeg=sys.argv[2];root.mkdir(parents=True,exist_ok=True)
spec=importlib.util.spec_from_file_location('demo_worker',Path(__file__).parents[1]/'server/demo-worker.py')
worker=importlib.util.module_from_spec(spec);spec.loader.exec_module(worker)
corners=[[.2,.2],[.8,.2],[.8,.8],[.2,.8]]
cal={'time':0,'corners':corners,'hand':[[.5,.5]],'holding':[],'exclude':[],
     'editRegion':[[.1,.1],[.9,.1],[.9,.9],[.1,.9]],
     'maskStrokes':[{'object':'hand','points':[[.5,.5]],'radius':.06,'erase':False}]}
draft={'duration':3,'inputMode':'screenshots','recordingStart':0,'useGpu':False,'scene':'preserve',
       'sourceCalibration':[cal],'candidateCalibration':[cal],
       'actions':[{'id':'a','screen':0,'next':1,'at':.5,'until':1,'transition':'fade','transitionDuration':.25,'viewport':[0,1]}]}
red=np.full((240,160,3),(20,20,210),np.uint8);green=np.full_like(red,(20,210,20))
for image in [red,green]:
    for x,y in [(32,48),(128,48),(128,192),(32,192)]:cv2.rectangle(image,(x-4,y-4),(x+4,y+4),(230,230,230),-1)
    cv2.rectangle(image,(72,112),(88,128),(0,255,0),-1)
for name,image in [('source',red),('candidate',green)]:
    proc=worker.writer(root/(name+'.mp4'),160,240,ffmpeg)
    for _ in range(90):proc.stdin.write(image.tobytes())
    worker.finish(proc)
blue=np.full((240,160,3),(210,20,20),np.uint8);yellow=np.full_like(blue,(20,210,210))
screens=[]
for name,image in [('first',blue),('last',yellow)]:
    file=str(root/(name+'.png'));cv2.imwrite(file,image);screens.append(file)
worker.walkthrough({'draft':draft,'screens':screens,'output':str(root/'walkthrough.mp4'),'ffmpeg':ffmpeg})
assert worker.frame_at(root/'walkthrough.mp4',.5)[10,10,0]>180
assert worker.frame_at(root/'walkthrough.mp4',2)[10,10,2]>180
worker.walkthrough({'draft':{**draft,'inputMode':'recording'},'screens':[],'recording':str(root/'walkthrough.mp4'),'output':str(root/'recording.mp4'),'ffmpeg':ffmpeg})
assert np.abs(worker.frame_at(root/'recording.mp4',2).astype(float)-worker.frame_at(root/'walkthrough.mp4',2)).mean()<5
try:worker.scroll_canvas(blue,yellow,[0,1]);raise AssertionError('Unrelated scroll states accepted')
except ValueError:pass
# Actual translation with shared content must preserve its intermediate pixels.
rng=np.random.default_rng(4);ribbon=rng.integers(0,255,(300,160,3),dtype=np.uint8)
top,bottom,offset,assembled=worker.scroll_canvas(ribbon[:240],ribbon[35:275],[0,1])
assert abs(offset-35)<=1 and assembled.shape[0]>=274
manifest={'draft':draft,'source':str(root/'source.mp4'),'candidate':str(root/'candidate.mp4'),'directory':str(root),'output':str(root/'tracks.json')}
if '--gpu' in sys.argv:
    manifest['draft']={**draft,'useGpu':True};manifest['checkpoint']=sys.argv[sys.argv.index('--gpu')+1]
worker.tracking(manifest)
track=json.loads((root/'tracks.json').read_text());assert len(track['source']['frames'])==90
if '--gpu' in sys.argv:assert 0<track['gpuPeakBytes']<4*1024**3
worker.composite({**manifest,'draft':draft,'tracks':str(root/'tracks.json'),'trackingDirectory':str(root),'walkthrough':str(root/'walkthrough.mp4'),'output':str(root/'composite.mp4'),'ffmpeg':ffmpeg})
result=worker.frame_at(root/'composite.mp4',.5)
assert result[15,15,2]>180, 'Original background changed outside editable region'
if '--gpu' not in sys.argv:
    assert result[75,55,0]>130, 'Deterministic screen not inserted'
    assert result[120,80,1]>150 and result[120,80,0]<70, 'Finger mask not above the screen'
print(json.dumps({'checked':'animation, recording order, scroll validation, corner tracks, foreground masks, original pixels, composition','gpuPeakBytes':track['gpuPeakBytes']}))
