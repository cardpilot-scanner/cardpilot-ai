// CardPilot 4.8: geometry-based card ROI; only read printed collector number, never Pokedex number.
(function(){
 const $=id=>document.getElementById(id),status=$('scanStatus'),result=$('scanResult'),detected=$('scanDetected'),preview=$('scanPreview'),video=$('liveVideo'),area=$('liveArea');
 let stream=null,track=null,worker=null,loading=null,loop=null,busy=false,locked=false,session=0,torch=false,zoom=1,counts=new Map(),lastHint='',attempts=0;
 function setStatus(t){if(lastHint!==t){status.textContent=t;lastHint=t;}}
 async function getWorker(){
  if(worker)return worker;
  if(!loading)loading=(async()=>{if(!window.Tesseract){await new Promise((ok,no)=>{let x=document.createElement('script');x.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';x.onload=ok;x.onerror=()=>no(Error('OCR konnte nicht geladen werden'));document.head.append(x)})}
   const w=await Tesseract.createWorker('eng');await w.setParameters({tessedit_char_whitelist:'0123456789/OSIlBZ',tessedit_pageseg_mode:'7',preserve_interword_spaces:'0'});worker=w;return w;})();
  try{return await loading}catch(e){loading=null;throw e}
 }
 function parse(text){let t=String(text||'').toUpperCase().replace(/\s+/g,'').replace(/[|\\]/g,'/').replace(/O/g,'0').replace(/[IL]/g,'1').replace(/S/g,'5').replace(/B/g,'8').replace(/Z/g,'2');
  const m=t.match(/(?:^|[^0-9])([0-9]{1,4})\/([0-9]{2,4})(?![0-9])/);if(!m)return '';
  let a=Number(m[1]),b=Number(m[2]);if(!a||a>b||b>9999||b<20)return '';return m[1].padStart(3,'0')+'/'+m[2];
 }
 function rectInVideo(el){
  const r=video.getBoundingClientRect(),q=el.getBoundingClientRect(),vw=video.videoWidth,vh=video.videoHeight;
  const scale=Math.max(r.width/vw,r.height/vh),visibleW=r.width/scale,visibleH=r.height/scale,offsetX=(vw-visibleW)/2,offsetY=(vh-visibleH)/2;
  return {x:Math.max(0,offsetX+(q.left-r.left)/scale),y:Math.max(0,offsetY+(q.top-r.top)/scale),w:Math.min(vw,(q.width/scale)),h:Math.min(vh,(q.height/scale))};
 }
 function crop(source,rect,mode=0){
  let c=document.createElement('canvas'),factor=Math.min(3,Math.max(1.5,1100/rect.w));c.width=Math.round(rect.w*factor);c.height=Math.round(rect.h*factor);
  let ctx=c.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(source,rect.x,rect.y,rect.w,rect.h,0,0,c.width,c.height);
  if(mode){let im=ctx.getImageData(0,0,c.width,c.height),d=im.data;for(let i=0;i<d.length;i+=4){let g=.299*d[i]+.587*d[i+1]+.114*d[i+2];let v=mode===1?(g>130?255:0):Math.max(0,Math.min(255,(g-115)*2+125));d[i]=d[i+1]=d[i+2]=v}ctx.putImageData(im,0,0)}return c;
 }
 // The target is an overlay aligned to the actual video image, not arbitrary whole-frame OCR.
 function regions(){let target=document.querySelector('#liveArea .number-target');if(!target||!video.videoWidth)return [];
  let r=rectInVideo(target),pad=r.h*.20;
  let boxes=[{x:r.x,y:Math.max(0,r.y-pad),w:r.w,h:Math.min(video.videoHeight-r.y+pad,r.h+2*pad)},
   {x:r.x,y:Math.max(0,r.y-r.h*.75),w:r.w,h:Math.min(video.videoHeight-r.y+r.h*.75,r.h*2.5)}];
  return boxes.map((b,i)=>crop(video,b,i===0?2:1));
 }
 function reset(){locked=false;counts.clear();attempts=0;lastHint='';detected.value='';result.style.display='none'}
 function stop(keep=false){session++;if(loop){clearTimeout(loop);loop=null}if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}track=null;video.srcObject=null;area.style.display='none';$('scanCamera').textContent='📹 Live-Kamera starten';$('liveTorch').style.display='none';if(!keep)reset();}
 function confirm(n){locked=true;detected.value=n;result.style.display='block';setStatus('✓ Nummer '+n+' erkannt – bitte vor dem Verkauf auf der Karte prüfen.');stop(true);$('liveOnce').textContent='↻ Neue Karte scannen';}
 function observe(n){attempts++;if(n){counts.set(n,(counts.get(n)||0)+1);for(let [k,v] of counts)if(k!==n)counts.set(k,Math.max(0,v-1));
  let v=counts.get(n);detected.value=n;result.style.display='block';if(v>=2){confirm(n);return}setStatus('Mögliche Nummer '+n+' – zweite Prüfung läuft …');}
  else if(attempts%2===0)setStatus('Suche nur im markierten Nummernfeld … ('+attempts+' Prüfungen)');
 }
 async function scanOnce(live=true){if(busy||locked)return;busy=true;let sid=session;
  try{let w=await getWorker();if(live&&(!stream||sid!==session))return;
   let crops=live?regions():[];let found='';
   if(!live)return;
   for(let c of crops){let r=await w.recognize(c);if(sid!==session||!stream)return;found=parse(r.data.text);if(found)break}
   observe(found);
  }catch(e){if(sid===session)setStatus('Scannerfehler: '+e.message)}finally{busy=false}
 }
 function schedule(){if(!stream||locked)return;loop=setTimeout(async()=>{await scanOnce();schedule()},180)}
 $('scanCamera').onclick=async()=>{if(stream){stop();return}reset();let sid=++session;
  try{setStatus('Kamera wird gestartet …');stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1080},height:{ideal:1920}}});track=stream.getVideoTracks()[0];video.srcObject=stream;await video.play();if(sid!==session)return;area.style.display='block';preview.style.display='none';$('scanCamera').textContent='■ Kamera stoppen';$('quickScanPanel').scrollIntoView({behavior:'smooth',block:'start'});
   if(track.getCapabilities?.().torch)$('liveTorch').style.display='inline-block';setStatus('Lade Nummernerkennung …');await getWorker();if(!stream)return;setStatus('Nummer unten links in das türkisfarbene Feld halten …');schedule();
  }catch(e){stop();setStatus('Kamera konnte nicht starten: '+e.message)}
 };
 $('liveStop').onclick=()=>stop();$('liveOnce').onclick=()=>{if(locked){reset();$('scanCamera').click()}else scanOnce()};
 $('liveTorch').onclick=async()=>{if(!track)return;try{torch=!torch;await track.applyConstraints({advanced:[{torch}]});$('liveTorch').textContent=torch?'🔦 Licht aus':'🔦 Licht'}catch(e){setStatus('Licht nicht verfügbar')}};
 $('liveZoom').onclick=async()=>{if(!track)return;let caps=track.getCapabilities?.()||{};if(!caps.zoom){setStatus('Zoom nicht verfügbar');return}zoom=zoom>=Math.min(caps.zoom.max,3)?1:Math.min(caps.zoom.max,zoom+.5);try{await track.applyConstraints({advanced:[{zoom}]});$('liveZoom').textContent='🔍 Zoom '+zoom+'×'}catch(e){setStatus('Zoom nicht verfügbar')}};
 $('liveFocus').onclick=async()=>{if(!track)return;try{await track.applyConstraints({advanced:[{focusMode:'continuous'}]});setStatus('Autofokus aktiviert')}catch(e){setStatus('Fokus nicht verfügbar')}};
 $('scanScreen').onclick=()=>$('scanScreenFile').click();
 $('scanScreenFile').onchange=async()=>{let f=$('scanScreenFile').files?.[0];if(!f)return;stop();reset();preview.src=URL.createObjectURL(f);preview.style.display='block';setStatus('Bild geladen. Bitte Nummer bei Bedarf manuell eingeben – Bildanalyse ist noch nicht verlässlich.');result.style.display='block'};
 $('scanCameraFile').onchange=$('scanScreenFile').onchange;
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()});
 $('scanFind').onclick=()=>{let n=detected.value.trim();if(!n){setStatus('Bitte Nummer eingeben');return}stop(true);$('rGame').value='Pokemon';$('rQuery').value=/^\d{1,4}\/\d{1,4}$/.test(n)?'':n;$('rSet').value='';$('rNumber').value=/^\d{1,4}\/\d{1,4}$/.test(n)?n:'';catalogSearch();$('rResults').scrollIntoView({behavior:'smooth',block:'start'})};
})();