/* 나와봄 v4.36 — optional, per-place cloud synchronization.
   Legacy places.json is read-only here. It remains a recovery backup.
   Last-write-wins per place; deletions use tombstones, never silently overwrite legacy backups. */
(function(){
 "use strict";
 var bridge=window.nawabomCloudBridge, panel=document.getElementById("managePanel");
 if(!bridge||!panel)return;
 var BUCKET="nawabom-private-backups",DIR="sync-records",MAX_BYTES=40*1024*1024;
 var user=null,running=false,timer=null,needsResync=false,enabled=false;
 var section=document.createElement("section");section.className="backup";
 section.innerHTML=[
  '<h3>🔄 내 기록 자동 동기화 (베타)</h3>',
  '<p>같은 이메일로 로그인한 기기끼리 장소·후기·사진의 <strong>추가·수정·삭제</strong>를 맞춥니다. 기기 기록은 그대로 사용하고 서버에도 개별 장소를 저장합니다.</p>',
  '<div class="actions"><button type="button" class="btn secondary" id="autoSyncToggle" disabled>자동 동기화 켜기</button><button type="button" class="btn light" id="autoSyncNow" disabled>지금 동기화</button></div>',
  '<p class="subtle" id="autoSyncStatus" role="status" aria-live="polite">로그인 상태 확인 중…</p>',
  '<p class="beta-note">⚠️ 처음 켤 때 현재 기기의 장소를 로그인한 계정의 비공개 저장 공간에 복사합니다. 앱이 열려 있고 인터넷에 연결돼 있을 때 동기화됩니다. 여러 기기에서 같은 장소를 동시에 수정하면 최근 수정 시간의 기록이 우선합니다. 기존 JSON 백업 파일은 계속 보관해 주세요.</p>'
 ].join("");
 var warning=panel.querySelector(".alert");panel.insertBefore(section,warning||null);
 var toggle=document.getElementById("autoSyncToggle"),now=document.getElementById("autoSyncNow"),status=document.getElementById("autoSyncStatus");
 var KEY="nawabom-auto-sync-v436:", TOMBS="nawabom-auto-sync-tombstones-v436:";
 var textStatus=function(s){status.textContent=s;};
 function prefKey(){return user?KEY+user.id:"";}
 function tombKey(){return user?TOMBS+user.id:"";}
 function getTombs(){try{var v=JSON.parse(localStorage.getItem(tombKey())||"{}");return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}catch(err){return {};}}
 function saveTombs(t){try{localStorage.setItem(tombKey(),JSON.stringify(t));}catch(err){textStatus("⚠️ 삭제 기록을 보관하지 못해 삭제 동기화가 제한될 수 있어요. 저장 공간을 확인하세요.");}}
 function putTombstone(id,at){
  if(!user||typeof id!=="string"||!id||id.length>80)return;
  var t=getTombs();t[id]=Math.max(Number(t[id])||0,Number(at)||Date.now());saveTombs(t);
 }
 function saveSetting(value){try{localStorage.setItem(prefKey(),value?"1":"0");return true;}catch(err){textStatus("자동 동기화 설정을 저장하지 못했어요. 브라우저 저장 공간을 확인하세요.");return false;}}
 function updateButtons(){
  toggle.disabled=!user||running;now.disabled=!user||!enabled||running;
  toggle.textContent=enabled?"자동 동기화 끄기":"자동 동기화 켜기";
 }
 function errorText(err){return String(err&&err.message||err||"알 수 없는 오류");}
 async function checkedUser(){
  var r=await bridge.client().auth.getUser();
  if(r.error){
   if(/session missing|auth session missing/i.test(r.error.message||""))return null;
   throw r.error;
  }
  var u=r.data&&r.data.user;
  return u&&u.id&&u.email&&u.is_anonymous!==true?u:null;
 }
 async function refreshAccount(){
  try{
   var found=await checkedUser(),previous=user&&user.id;
   user=found;
   enabled=!!user&&localStorage.getItem(prefKey())==="1";
   if(previous!==(user&&user.id)){if(timer)clearTimeout(timer);timer=null;}
   updateButtons();
   if(!user)textStatus("위쪽 ‘내 기록 서버 백업’에서 이메일로 로그인하면 사용할 수 있어요.");
   else if(!enabled)textStatus("이메일 로그인 완료. 자동 동기화는 아직 꺼져 있어요. 버튼을 눌러 시작할 수 있어요.");
   else{ textStatus("✅ 자동 동기화 사용 중 · 앱을 열거나 기록을 바꾸면 서버와 확인해요.");schedule(700);}
  }catch(err){user=null;enabled=false;updateButtons();textStatus("⚠️ 로그인 확인 실패: "+errorText(err));}
 }
 function schedule(delay){
  if(!user||!enabled)return;
  if(running){needsResync=true;return;}
  if(timer)clearTimeout(timer);
  timer=setTimeout(function(){timer=null;syncOnce();},delay||1500);
 }
 async function hashId(id){
  if(!crypto||!crypto.subtle)throw Error("HTTPS 보안 환경이 필요해요.");
  var digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(id));
  return Array.from(new Uint8Array(digest)).map(function(v){return v.toString(16).padStart(2,"0");}).join("");
 }
 function storage(uid){return bridge.client().storage.from(BUCKET);}
 async function remoteList(uid){
  var files=[],offset=0;
  for(;;){
   var r=await storage(uid).list(uid+"/"+DIR,{limit:100,offset:offset,sortBy:{column:"name",order:"asc"}});
   if(r.error)throw r.error;
   var batch=r.data||[];
   files=files.concat(batch.filter(function(x){return x.name&&/^[a-f0-9]{64}\.json$/.test(x.name);}));
   if(batch.length<100)break;
   offset+=batch.length;if(offset>=10000)throw Error("기록이 너무 많아 자동 동기화를 중단했어요.");
  }
  return files;
 }
 function validEntry(x){
  return !!(x&&x.app==="nawabom"&&x.schema===1&&typeof x.id==="string"&&x.id.length>0&&x.id.length<=80&&
    Number.isFinite(Number(x.updatedAt))&&Number(x.updatedAt)>0&&
    (x.deleted===true||(x.deleted===false&&x.place&&x.place.id===x.id)));
 }
 async function downloadFile(uid,name){
  var r=await storage(uid).download(uid+"/"+DIR+"/"+name);
  if(r.error)throw r.error;
  if(!r.data||r.data.size>MAX_BYTES)throw Error("서버의 장소 파일이 너무 커요.");
  var entry=JSON.parse(await r.data.text());
  if(!validEntry(entry)||await hashId(entry.id)+".json"!==name)throw Error("서버의 장소 파일 정보가 올바르지 않아요.");
  return entry;
 }
 async function downloadAll(uid,files){
  var data=[];
  for(var i=0;i<files.length;i+=4){
   var batch=await Promise.all(files.slice(i,i+4).map(function(file){return downloadFile(uid,file.name);}));
   data.push.apply(data,batch);
  }
  return data;
 }
 function isMissing(err){
  var m=errorText(err);return /object not found|not found|404/i.test(m)||String(err&&err.statusCode||"")==="404";
 }
 async function legacyEntries(uid){
  var r=await storage(uid).download(uid+"/places.json");
  if(r.error){if(isMissing(r.error))return [];throw r.error;}
  if(!r.data||r.data.size>MAX_BYTES)throw Error("기존 서버 백업 용량이 너무 커요. JSON 백업 파일로 복원해 주세요.");
  var payload=JSON.parse(await r.data.text());
  if(!payload||payload.app!=="footprint"||!Array.isArray(payload.places)||payload.places.length>10000)throw Error("기존 서버 백업 형식이 올바르지 않아요.");
  return payload.places.map(function(p){
   if(!p||typeof p.id!=="string"||!p.id||p.id.length>80)throw Error("기존 백업의 장소 ID를 확인해 주세요.");
   return {app:"nawabom",schema:1,id:p.id,updatedAt:Number(p.updatedAt)||1,deleted:false,place:p};
  });
 }
 async function uploadEntry(uid,entry){
  var name=await hashId(entry.id)+".json";
  var blob=new Blob([JSON.stringify(entry)],{type:"application/json"});
  if(blob.size>MAX_BYTES)throw Error("장소 '"+(entry.place&&entry.place.name||entry.id)+"'의 데이터가 40MB를 넘어 동기화할 수 없어요.");
  var r=await storage(uid).upload(uid+"/"+DIR+"/"+name,blob,{contentType:"application/json",cacheControl:"0",upsert:true});
  if(r.error)throw r.error;
 }
 function fromLocal(p){return {app:"nawabom",schema:1,id:p.id,updatedAt:Number(p.updatedAt)||Date.now(),deleted:false,place:p};}
 function fromTomb(id,at){return {app:"nawabom",schema:1,id:id,updatedAt:Number(at)||Date.now(),deleted:true};}
 async function syncOnce(){
  if(running||!user||!enabled)return;
  running=true;updateButtons();
  var uid=user.id; textStatus("🔄 서버와 장소 기록을 확인하고 있어요…");
  try{
   var names=await remoteList(uid), remote=await downloadAll(uid,names);
   var migratingLegacy=false;
   if(!remote.length){
    var legacy=await legacyEntries(uid);
    if(legacy.length){
     migratingLegacy=true;remote=legacy;
     textStatus("🔄 기존 서버 백업을 개별 장소 저장 방식으로 옮기고 있어요…");
    }
   }
   if(!user||user.id!==uid||!enabled)return;
   var tomb=getTombs(),current=await bridge.readLocal(),localMap=new Map(current.map(function(p){return [p.id,p];}));
   var remoteMap=new Map(remote.map(function(e){return [e.id,e];}));
   // Migration must seed EVERY legacy place into per-record storage, including unchanged ones.
   // The original places.json is never overwritten by this automatic synchronization.
   if(migratingLegacy)remoteMap.clear();
   var changes=[],tombChanged=false;
   // During first migration, preserve ALL locations in the previous manual backup.
   // Explicit tombstones still win; otherwise prefer recovering a missing record to losing it.
   // An older deleted location might reappear once: it can be deleted after migration.

   for(var e of remote){
    var local=localMap.get(e.id),del=Number(tomb[e.id])||0;
    if(del&&del>=Number(e.updatedAt))continue;
    if(del&&del<Number(e.updatedAt)){delete tomb[e.id];tombChanged=true;}
    if(e.deleted){if(local&&Number(e.updatedAt)>Number(local.updatedAt||0))changes.push(e);}
    else if(!local||Number(e.updatedAt)>Number(local.updatedAt||0))changes.push(e);
   }
   if(changes.length){
    textStatus("🔄 다른 기기에서 변경한 기록 "+changes.length+"개를 반영하고 있어요…");
    await bridge.applyRemoteChanges(changes);
   }
   if(!user||user.id!==uid||!enabled)return;
   current=await bridge.readLocal();localMap=new Map(current.map(function(p){return [p.id,p];}));
   var outgoing=[];
   for(var p of current){
    var deletedAt=Number(tomb[p.id])||0;
    if(deletedAt>Number(p.updatedAt||0))continue;
    if(deletedAt){delete tomb[p.id];tombChanged=true;}
    var re=remoteMap.get(p.id);
    if(!re||Number(p.updatedAt||0)>Number(re.updatedAt))outgoing.push(fromLocal(p));
   }
   for(var id in tomb){
    if(!Object.prototype.hasOwnProperty.call(tomb,id)||localMap.has(id))continue;
    var at=Number(tomb[id])||0,re=remoteMap.get(id);
    if(at>0&&(!re||at>Number(re.updatedAt)))outgoing.push(fromTomb(id,at));
   }
   if(outgoing.length>10000)throw Error("업로드할 기록이 너무 많아요.");
   if(tombChanged)saveTombs(tomb);
   for(var j=0;j<outgoing.length;j++){
    if(!user||user.id!==uid||!enabled)throw Error("동기화 도중 계정 또는 설정이 변경되었어요.");
    textStatus("🔄 서버에 기록 저장 중… "+(j+1)+"/"+outgoing.length);
    await uploadEntry(uid,outgoing[j]);
   }
   if(!user||user.id!==uid)return;
   var count=(await bridge.readLocal()).length;
   textStatus("✅ 동기화 완료 · 현재 "+count+"개 장소 · "+new Date().toLocaleString("ko-KR")+
    (changes.length||outgoing.length?" (받은 변경 "+changes.length+"개, 보낸 변경 "+outgoing.length+"개)":" (변경 없음)"));
  }catch(err){textStatus("⚠️ 자동 동기화 중 일부 작업을 완료하지 못했어요: "+errorText(err)+" · 기록 보관 상태를 확인하고 ‘지금 동기화’를 눌러 다시 확인해 주세요.");}
  finally{running=false;updateButtons();if(needsResync){needsResync=false;schedule(300);}}
 }
 toggle.addEventListener("click",function(){
  if(running||!user)return;
  if(enabled){
   if(!confirm("자동 동기화를 끌까요? 이 기기의 장소와 이미 저장된 서버 기록은 삭제되지 않아요."))return;
   enabled=false;if(!saveSetting(false)){enabled=true;return;}
   if(timer){clearTimeout(timer);timer=null;}
   textStatus("자동 동기화가 꺼졌어요. 기기 기록과 서버 기록은 유지돼요.");
  }else{
   if(!confirm("자동 동기화를 켤까요?\n\n이 기기의 장소·후기·사진을 현재 로그인한 이메일 계정의 비공개 서버에 저장하고, 같은 계정의 다른 기기와 변경사항을 맞춥니다.\n\n기존 JSON 백업 파일은 계속 보관해 주세요."))return;
   enabled=true;if(!saveSetting(true)){enabled=false;return;}
   textStatus("자동 동기화를 시작합니다…");schedule(100);
  }
  updateButtons();
 });
 now.addEventListener("click",function(){if(!running&&enabled)schedule(50);});
 window.addEventListener("nawabom:local-change",function(){schedule(1800);});
 window.addEventListener("nawabom:local-delete",function(ev){
  if(!user||!ev.detail||!ev.detail.id)return;
  putTombstone(ev.detail.id,ev.detail.deletedAt);schedule(400);
 });
 window.addEventListener("online",function(){schedule(400);});
 window.addEventListener("focus",function(){if(document.visibilityState!=="hidden")schedule(400);});
 document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible")schedule(400);});
 setInterval(function(){if(document.visibilityState!=="hidden")schedule(1000);},5*60*1000);
 try{bridge.client().auth.onAuthStateChange(function(){setTimeout(refreshAccount,0);});}
 catch(err){textStatus("로그인 감시를 시작하지 못했어요: "+errorText(err));}
 refreshAccount();
})();
