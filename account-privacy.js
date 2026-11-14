/* 나와봄 v4.37: account awareness and accidental cross-account sync prevention.
   A local guard is NOT device encryption or access control. Supabase Storage RLS
   controls actual remote privacy. Existing IndexedDB data stays on this device. */
(function(){
 "use strict";
 var bridge=window.nawabomCloudBridge,panel=document.getElementById("managePanel");
 if(!bridge||!panel)return;
 var OWNER_KEY="nawabom-device-cloud-owner-v437";
 var OLD_PREF_PREFIX="nawabom-auto-sync-v436:";
 function errorText(e){return String(e&&e.message||e||"알 수 없는 오류");}
 function storedOwner(){
  try{
   var owner=localStorage.getItem(OWNER_KEY);
   if(owner)return owner;
   // Existing v4.36 auto-sync users already associated this browser with a UID.
   var matches=[];
   for(var i=0;i<localStorage.length;i++){
    var key=localStorage.key(i);
    if(key&&key.indexOf(OLD_PREF_PREFIX)===0){
     var uid=key.slice(OLD_PREF_PREFIX.length);
     if(uid&&matches.indexOf(uid)<0)matches.push(uid);
    }
   }
   return matches.length>1?"__multiple_accounts__":(matches[0]||"");
  }catch(e){return "__unavailable__";}
 }
 function compatible(user){
  if(!user||!user.id||!user.email||user.is_anonymous===true)return false;
  var owner=storedOwner();
  return !owner||owner===user.id;
 }
 function assertCompatible(user){
  if(compatible(user))return true;
  var owner=storedOwner();
  if(owner==="__unavailable__")throw Error("이 기기의 계정 보호 정보를 확인할 수 없어요. Safari 저장 공간을 확인해 주세요.");
  throw Error("이 기기는 다른 이메일 계정의 기록과 연결되어 있어요. 기록이 다른 계정으로 전송되지 않도록 서버 백업·동기화를 차단했어요. 기존 이메일로 로그인하거나 별도 브라우저를 이용해 주세요.");
 }
 function claim(user){
  assertCompatible(user);
  var owner=storedOwner();
  if(!owner){
   try{localStorage.setItem(OWNER_KEY,user.id);}
   catch(e){throw Error("기기 계정 연결을 저장하지 못했어요. Safari 저장 공간을 확인해 주세요.");}
  }else if(owner===user.id&&!localStorage.getItem(OWNER_KEY)){
   try{localStorage.setItem(OWNER_KEY,user.id);}
   catch(e){throw Error("기기 계정 연결을 저장하지 못했어요. Safari 저장 공간을 확인해 주세요.");}
  }
  return true;
 }
 window.nawabomAccountGuard={compatible:compatible,assertCompatible:assertCompatible,claim:claim,storedOwner:storedOwner};
 var section=document.createElement("section");
 section.className="backup";
 section.setAttribute("aria-labelledby","accountSafetyTitle");
 section.innerHTML=[
  '<h3 id="accountSafetyTitle">🔐 로그인 및 내 기록 보호</h3>',
  '<p id="accountSafetyStatus" class="subtle" role="status" aria-live="polite">로그인 상태를 확인하고 있어요…</p>',
  '<div class="actions"><button type="button" class="btn secondary" id="accountGoToLogin">이메일 로그인 위치로 이동</button></div>',
  '<details class="search-more"><summary>내 장소·사진은 누가 볼 수 있나요?</summary>',
  '<p class="searchhelp">① <strong>기기 기록:</strong> 로그인하지 않아도 이 기기의 브라우저에서는 장소·후기가 보입니다. 로그아웃해도 자동 삭제되지 않아요. 공용 기기에서는 사용하지 마세요.</p>',
  '<p class="searchhelp">② <strong>서버 백업·동기화:</strong> 이메일 로그인 후 직접 활성화해야 사용합니다. 비공개 저장소에 기록되며 로그인 계정의 폴더로 접근이 제한됩니다.</p>',
  '<p class="searchhelp">③ <strong>공유 링크:</strong> 사진 포함 공유 링크를 직접 준비하면 선택한 장소 정보·사진이 공개용 저장소에 올라가 링크를 아는 사람이 볼 수 있어요. 공유 링크는 비공개 기록과 별개입니다.</p>',
  '<p class="searchhelp">④ <strong>계정 변경:</strong> 이 기기를 다른 이메일 계정에 연결하면 기존 기록이 잘못 전송될 수 있어 차단합니다. 다른 사람의 계정은 별도 기기·브라우저에서 이용해 주세요.</p></details>'
 ].join("");
 var heading=panel.querySelector(".sectiontitle");
 panel.insertBefore(section,heading?heading.nextSibling:panel.firstChild);
 var status=document.getElementById("accountSafetyStatus");
 var go=document.getElementById("accountGoToLogin");
 go.addEventListener("click",function(){
  var target=document.getElementById("cloudEmail")||document.getElementById("cloudAccountStatus");
  if(target){target.scrollIntoView({behavior:"smooth",block:"center"});if(!target.disabled&&target.focus)target.focus({preventScroll:true});}
 });
 var refreshId=0;
 async function refresh(){
  var id=++refreshId;
  try{
   var result=await bridge.client().auth.getUser();
   if(result.error&&!/session missing|auth session missing/i.test(result.error.message||""))throw result.error;
   var u=result.data&&result.data.user;
   var count=(await bridge.readLocal()).length;
   if(id!==refreshId)return;
   if(!u||!u.id||!u.email||u.is_anonymous===true){
    status.textContent="체험 모드 · 이 기기에서 "+count+"개 장소를 볼 수 있어요. 로그인하면 서버 백업과 동기화를 사용할 수 있습니다.";
    return;
   }
   if(!compatible(u)){
    status.textContent="⚠️ 계정 확인 필요 · "+count+"개 장소는 이 브라우저에 남아 있어요. 다른 이메일 계정과의 서버 연결은 안전을 위해 차단했습니다.";
    return;
   }
   status.textContent="✅ 이메일 로그인: "+u.email+" · 이 기기 장소 "+count+"개 · 서버 백업/자동 동기화는 아래에서 관리할 수 있어요.";
  }catch(e){if(id===refreshId)status.textContent="로그인 또는 기기 기록 상태를 확인하지 못했어요: "+errorText(e);}
 }
 window.addEventListener("nawabom:local-change",refresh);
 window.addEventListener("nawabom:local-delete",refresh);
 window.addEventListener("load",refresh);
 document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible")refresh();});
 try{bridge.client().auth.onAuthStateChange(function(){setTimeout(refresh,0);});}catch(e){}
 // IndexedDB initialization takes place asynchronously in the main script.
 setTimeout(refresh,600);
})();
