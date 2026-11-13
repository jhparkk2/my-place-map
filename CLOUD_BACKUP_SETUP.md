# 나와봄 개인 클라우드 백업 설정 (v4.35)

이 기능은 **시험용 수동 백업/복원**입니다. 자동 동기화가 아닙니다. 기존 기록은 IndexedDB에 남고, 서버 복원은 **기존 기기에 없는 ID만 추가**합니다. 다른 기기의 변경이나 삭제를 자동으로 통합하지 않습니다.

1. 기존 나와봄에서 **내 기록 관리 → 백업 내보내기**로 JSON 파일을 내려받아 안전하게 보관합니다.
2. Supabase 프로젝트 [axnipmcwpevjofnpcqpj]에서 **Authentication → Providers → Email** 활성화를 확인합니다. 실제 이메일 링크 발송과 수신도 테스트해야 합니다.
3. Supabase **Authentication → URL Configuration**에서 사이트 URL 또는 Redirect URLs에 정확히 다음 주소를 허용합니다: \`https://jhparkk2.github.io/my-place-map/\`.
4. **SQL Editor**에서 \`supabase-cloud-backup.sql\` 파일 내용을 **프로젝트 관리자가** 실행합니다. Storage에 \`nawabom-private-backups\`라는 private 버킷이 생성되고, 이메일 로그인 사용자 본인 폴더에만 접근할 수 있도록 설정됩니다.
5. 나와봄 **내 기록 관리 → 내 기록 서버 백업**에서 이메일 입력 후 링크 발송 → 이메일에서 링크 클릭 → 같은 앱에서 로그인 상태 확인.
6. **서버에 백업하기**를 눌러 올리고, 다른 브라우저에서 같은 이메일로 로그인 후 **누락 기록 복원하기**로 확인합니다.
7. 기존 내보내기 JSON 백업을 유지합니다. 서버 백업은 40MB 이하의 사진 포함 JSON에 한하며, 기존 클라우드 백업을 덮어쓸 때 경고가 표시됩니다.

보안: 이메일이 확인되지 않은 익명 로그인은 서버 백업을 사용할 수 없으며, private 버킷에 공개 URL이 없습니다. 관리자는 Storage RLS 정책을 점검하고 서비스 역할 키(service_role)를 웹 프런트엔드에 넣지 마세요.

문제 확인:
- Bucket not found: SQL 설정/버킷 이름 확인.
- Permission denied / RLS: 이메일 인증 및 SQL 정책 확인.
- 로그인 메일이 오지 않음: Email provider와 SMTP 제한, 스팸함 확인.
- 오래된 앱이 보임: 강력 새로고침 또는 기존 서비스워커 갱신 확인.
