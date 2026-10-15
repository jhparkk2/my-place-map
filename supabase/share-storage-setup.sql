-- 발자국 v2.5: 선택한 장소 사진 한 장과 공개용 장소 요약만 공유합니다.
-- Supabase Dashboard > SQL Editor > New query 에서 1회 실행
-- 사용 전 Authentication > Providers 에서 Allow anonymous sign-ins 활성화
-- 경고: 공개 버킷이므로 저장된 공유 파일은 URL을 아는 사람이 열 수 있습니다.
-- 발자국 공유용 baljaguk-photos 버킷에만 적용하세요.

update storage.buckets
set public = true
where id = 'baljaguk-photos';

-- 업로드: 로그인한 사용자(익명 로그인 포함)는 자기 UID 폴더에만,
-- 정해진 두 파일명(photo.jpg, record.json)으로만 업로드 가능합니다.
drop policy if exists "baljaguk_share_upload_own" on storage.objects;
create policy "baljaguk_share_upload_own"
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'baljaguk-photos'
  and (storage.foldername(name))[1] = 'shares'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and storage.filename(name) in ('photo.jpg', 'record.json')
);

-- 실패 업로드 정리 및 향후 공유 취소 구현을 위한 자기 파일 삭제 권한
drop policy if exists "baljaguk_share_delete_own" on storage.objects;
create policy "baljaguk_share_delete_own"
on storage.objects
for delete to authenticated
using (
  bucket_id = 'baljaguk-photos'
  and (storage.foldername(name))[1] = 'shares'
  and (storage.foldername(name))[2] = (select auth.uid())::text
);

-- 공개 버킷은 공유 URL을 통한 파일 열람이 가능합니다.
-- 전체 버킷 목록 열람 권한이나 다른 사람 폴더 수정 권한은 부여하지 않습니다.
