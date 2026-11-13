-- 나와봄 v4.35: 사용자 전용 비공개 백업 버킷
-- Supabase 프로젝트 > SQL Editor에서 프로젝트 소유자가 실행합니다.
-- 기존 baljaguk-photos 버킷/공유·좋아요 정책은 수정하지 않습니다.
-- 반드시 이메일 OTP 로그인 활성화 및 Redirect URL 설정도 필요합니다.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('nawabom-private-backups', 'nawabom-private-backups', false, 52428800, array['application/json']::text[])
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- 이메일로 확인된 일반 계정만 본인 UID의 폴더를 사용할 수 있습니다.
-- Supabase 익명 세션(is_anonymous=true)으로는 접근할 수 없습니다.
create policy "nawabom_backup_select_own"
on storage.objects for select to authenticated
using (
 bucket_id = 'nawabom-private-backups'
 and (storage.foldername(name))[1] = (select auth.uid())::text
 and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
);

create policy "nawabom_backup_insert_own"
on storage.objects for insert to authenticated
with check (
 bucket_id = 'nawabom-private-backups'
 and (storage.foldername(name))[1] = (select auth.uid())::text
 and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
);

create policy "nawabom_backup_update_own"
on storage.objects for update to authenticated
using (
 bucket_id = 'nawabom-private-backups'
 and (storage.foldername(name))[1] = (select auth.uid())::text
 and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
)
with check (
 bucket_id = 'nawabom-private-backups'
 and (storage.foldername(name))[1] = (select auth.uid())::text
 and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
);

create policy "nawabom_backup_delete_own"
on storage.objects for delete to authenticated
using (
 bucket_id = 'nawabom-private-backups'
 and (storage.foldername(name))[1] = (select auth.uid())::text
 and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
);
