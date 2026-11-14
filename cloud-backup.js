/* 나와봄 v4.35 — opt-in private cloud backup. Local records always remain primary. */
(function(){
 "use strict";
 var bridge=window.nawabomCloudBridge, panel=document.getElementById("managePanel");
 if(!bridge||!panel)return;
 var BUCKET="nawabom-private-backups", FILE="places.json", MAX_BYTES=40*1024*1024;
 var section=document.createElement("section");
 section.className="backup";
 section.innerHTML=[
  '<h3>☁️ 내 기록 서버 백업 (시험 기능)</h3>',
  '<p>이메일로 로그인한 뒤 장소·후기·사진을 비공개 공간에 보관할 수 있어요. 다른 기기에서는 같은 이메일로 로그인해 <strong>없는 기록만 추가</strong>할 수 있습니다.</p>',
  '<label class="field" for="cloudEmail"><span>백업용 이메일</span><input id="cloudEmail" type="email" autocomplete="email" inputmode="email" placeholder="example@email.com" maxlength="254"></label>',
  '<div class="actions"><button type="button" class="btn secondary" id="cloudEmailSignIn">이메일 로그인 링크 보내기</button><button type="button" class="btn light" id="cloudSignOut" hidden>로그아웃</button></div>',
  '<p class="subtle" id="cloudAccountStatus" role="status" aria-live="polite">로그인 상태 확인 중…</p>',
  '<div class="actions"><button type="button" class="btn secondary" id="cloudUpload" disabled>☁️ 서버에 백업하기</button><button type="button" class="btn light" id="cloudRestore" disabled>📥 누락 기록 복원하기</button></div>',
  '<p class="subtle" id="cloudStatus" role="status" aria-live="polite">기존 아이폰 기록은 변경하지 않습니다. 서버 설정이 완료돼야 백업할 수 있어요.</p>',
  '<p class="beta-note">⚠️ 이 영역은 수동 백업입니다. 별도 ‘자동 동기화’를 아래에서 켤 수 있어요. 수동 백업은 기존 서버의 places.json을 덮어쓸 수 있으므로 주의해 주세요. JSON 내보내기도 계속 이용해 주세요.</p>'
 ].join("");
 var warning=panel.querySelector(".alert");
 panel.insertBefore(section,warning||null);
 function id(key){return document.getElementById(key);}
 var email=id("cloudEmail"), login=id("cloudEmailSignIn"), logout=id("cloudSignOut"),
 upload=id("cloudUpload"), restore=id("cloudRestore"),
 account=id("cloudAccountStatus"), status=id("cloudStatus"),busy=false,currentUser=null;
 function message(s){status.textContent=s;}
 function canUse(){return !!(currentUser&&(!window.nawabomAccountGuard||window.nawabomAccountGuard.compatible(currentUser)));}
 function setBusy(value){busy=value;login.disabled=value;logout.disabled=value||!currentUser;upload.disabled=value||!canUse();restore.disabled=value||!canUse();}
 function validUser(user){return !!(user&&user.id&&user.email&&user.is_anonymous!==true);}
 function friendlyError(err){
  var m=String(err&&err.message||err||"알 수 없는 오류");
  if(/bucket not found|not found|404/i.test(m))return "서버 백업 공간을 찾지 못했어요. Supabase 설정 파일을 먼저 적용해 주세요. ("+m+")";
  if(/row-level security|unauthorized|forbidden|403/i.test(m))return "백업 접근 권한을 확인해 주세요. 이메일 로그인 여부와 서버 정책을 점검해야 해요. ("+m+")";
  return m;
 }
 function storageAndPath(){
  if(!currentUser)throw Error("이메일 로그인이 필요해요.");
  if(window.nawabomAccountGuard)window.nawabomAccountGuard.claim(currentUser);
  return {storage:bridge.client().storage.from(BUCKET),path:currentUser.id+"/"+FILE};
 }
 async function userFromServer(){
  var r=await bridge.client().auth.getUser();
  if(r.error){
   if(/session missing|auth session missing/i.test(r.error.message||""))return null;
   throw r.error;
  }
  return validUser(r.data&&r.data.user)?r.data.user:null;
 }
 async function refresh(){
  try{
   currentUser=await userFromServer();
   if(currentUser){
    account.textContent=canUse()?"✅ 이메일 계정 연결: "+currentUser.email:
     "⚠️ 다른 이메일 계정이 연결돼 있어요. 현재 기기의 기록을 보호하기 위해 서버 백업·복원을 차단했습니다. 로그아웃한 뒤 원래 이메일로 로그인해 주세요.";
    email.value=currentUser.email;
    email.disabled=true;
    login.hidden=true;logout.hidden=false;
   }else{
    account.textContent="현재 개인 서버 백업 계정이 연결되지 않았어요. 이메일 로그인 후 사용할 수 있어요.";
    email.disabled=false;login.hidden=false;logout.hidden=true;
   }
  }catch(err){
   currentUser=null;
   account.textContent="로그인 상태를 확인할 수 없어요: "+friendlyError(err);
   email.disabled=false;login.hidden=false;logout.hidden=true;
  }finally{setBusy(false);}
 }
 login.addEventListener("click",async function(){
  if(busy)return;
  var address=email.value.trim();
  if(!email.checkValidity()||!address){email.reportValidity();return;}
  setBusy(true);message("이메일 로그인 링크를 요청하고 있어요…");
  try{
   var r=await bridge.client().auth.signInWithOtp({
    email:address,
    options:{emailRedirectTo:window.location.origin+window.location.pathname,shouldCreateUser:true}
   });
   if(r.error)throw r.error;
   message("✅ 로그인 링크를 보냈어요. 이메일에서 링크를 열면 이 앱으로 돌아와요. 메일이 안 오면 스팸함과 Supabase 이메일 설정을 확인해 주세요.");
  }catch(err){message("⚠️ 로그인 링크 발송 실패: "+friendlyError(err));}
  finally{setBusy(false);}
 });
 logout.addEventListener("click",async function(){
  if(busy||!currentUser)return;
  if(!confirm("이메일 계정에서 로그아웃할까요?\n\n주의: 로그아웃해도 이 기기의 장소·사진·후기는 삭제되지 않으며 Safari를 열면 계속 볼 수 있습니다. 공용 기기라면 사용하지 마세요."))return;
  setBusy(true);
  try{
   var r=await bridge.client().auth.signOut({scope:"local"});
   if(r.error)throw r.error;
   currentUser=null;message("로그아웃했어요. 기기 기록은 유지됩니다.");
  }catch(err){message("⚠️ 로그아웃 실패: "+friendlyError(err));}
  await refresh();
 });
 upload.addEventListener("click",async function(){
  if(busy||!currentUser)return;
  setBusy(true);message("백업할 장소를 확인하고 있어요…");
  try{
   var records=await bridge.readLocal();
   if(!records.length)throw Error("기기에 저장된 장소가 없어요. 빈 백업으로 기존 서버 기록을 덮어쓰지 않습니다.");
   var payload={app:"footprint",version:3,backupVersion:1,exportedAt:new Date().toISOString(),places:records};
   var blob=new Blob([JSON.stringify(payload)],{type:"application/json"});
   if(blob.size>MAX_BYTES)throw Error("백업 파일이 40MB를 넘어요. 기존 JSON 내보내기를 사용하고 서버 백업은 추후 사진 분리 기능을 기다려 주세요.");
   var config=storageAndPath();
   var listed=await config.storage.list(currentUser.id,{limit:100,search:FILE});
   if(listed.error)throw listed.error;
   var exists=(listed.data||[]).some(function(x){return x.name===FILE;});
   if(exists&&!confirm("서버에 이미 백업이 있습니다.\n이 기기 기록 "+records.length+"개로 서버 백업을 덮어쓸까요?\n다른 기기에서만 추가한 기록은 서버 백업에서 사라질 수 있어요.")){message("서버 백업 덮어쓰기를 취소했어요.");return;}
   message(records.length+"개 장소를 비공개 서버에 업로드하고 있어요…");
   var result=await config.storage.upload(config.path,blob,{contentType:"application/json",upsert:true,cacheControl:"0"});
   if(result.error)throw result.error;
   message("✅ "+records.length+"개 장소를 서버에 백업했어요. 업로드 시각: "+new Date().toLocaleString("ko-KR")+" (이메일 계정 전용)");
  }catch(err){message("⚠️ 서버 백업 실패: "+friendlyError(err));}
  finally{setBusy(false);}
 });
 restore.addEventListener("click",async function(){
  if(busy||!currentUser)return;
  setBusy(true);message("서버 백업을 읽고 있어요…");
  try{
   var config=storageAndPath();
   var r=await config.storage.download(config.path);
   if(r.error)throw r.error;
   if(!r.data||r.data.size>MAX_BYTES)throw Error("백업 파일이 너무 크거나 읽을 수 없어요.");
   var data=JSON.parse(await r.data.text());
   if(!data||data.app!=="footprint"||!Array.isArray(data.places)||data.places.length>10000)throw Error("올바른 나와봄 백업 파일이 아니에요.");
   var existing=await bridge.readLocal(), ids=new Set(existing.map(function(x){return x.id;}));
   var missing=data.places.filter(function(x){return x&&typeof x.id==="string"&&!ids.has(x.id);});
   if(!missing.length){message("✅ 서버 백업 확인 완료. 누락된 장소가 없어요. 동일한 장소의 기존 기록은 변경하지 않았어요.");return;}
   if(!confirm("서버 백업에서 이 기기에 없는 "+missing.length+"개 장소를 추가할까요?\n현재 기록과 사진은 덮어쓰지 않습니다.")){message("복원을 취소했어요.");return;}
   var result=await bridge.restoreMissing(data.places);
   if(result.cancelled){message("기록 보호를 위해 복원을 취소했어요.");return;}
   message("✅ 서버 백업에서 "+result.added+"개 장소를 추가했어요. 기존 장소 "+result.skipped+"개는 변경하지 않았어요.");
  }catch(err){message("⚠️ 복원 실패: "+friendlyError(err));}
  finally{setBusy(false);}
 });
 refresh();
})();
