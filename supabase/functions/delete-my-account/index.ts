// 나와봄 계정 삭제: 배포 전 운영자 검증 필수 (Edge Function; 브라우저에서 직접 실행하지 않음)
// 중요한 제한: 로그인 계정 UID로 만든 Storage 파일만 자동 정리합니다.
// 과거 익명 로그인 UID로 만든 공개 공유 파일은 연결 정보가 없다면 별도 확인/삭제가 필요합니다.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ORIGIN = "https://jhparkk2.github.io";
const headers = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
const reply = (code: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), { status: code, headers });

type StorageFile = { name: string; id?: string | null; metadata?: unknown };

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return reply(405, { error: "POST만 지원합니다." });

  // Never accept a user id from the request; derive it from the verified JWT.
  const authorization = request.headers.get("authorization") ?? "";
  const jwt = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!jwt) return reply(401, { error: "이메일 로그인이 필요합니다." });

  const projectUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!projectUrl || !serviceRole) return reply(503, { error: "관리자 환경 설정이 누락되었습니다." });

  const admin = createClient(projectUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: verifyError } = await admin.auth.getUser(jwt);
  const user = userData?.user;
  if (verifyError || !user?.id || !user.email || user.is_anonymous === true) {
    return reply(401, { error: "유효한 이메일 로그인 세션이 필요합니다." });
  }

  let body: { confirmation?: string } = {};
  try {
    body = await request.json();
  } catch {
    return reply(400, { error: "요청 형식을 확인해 주세요." });
  }
  if (body.confirmation !== "나와봄 계정 삭제") {
    return reply(400, { error: "삭제 확인 문구가 일치하지 않습니다." });
  }

  // Collect all keys BEFORE deleting anything, so pagination cannot skip shifted rows.
  async function enumerate(bucket: string, folder: string) {
    const paths: string[] = [];
    const queue = [folder];
    let scanned = 0;
    while (queue.length) {
      const directory = queue.shift()!;
      let offset = 0;
      for (;;) {
        const { data, error } = await admin.storage.from(bucket).list(directory, {
          limit: 100, offset, sortBy: { column: "name", order: "asc" },
        });
        if (error) throw error;
        const batch = (data ?? []) as StorageFile[];
        for (const item of batch) {
          if (!item.name || item.name.includes("/") || item.name === "." || item.name === "..") continue;
          const path = directory ? directory + "/" + item.name : item.name;
          if (item.id) paths.push(path);
          else queue.push(path);
          scanned++;
          if (scanned > 10000) throw Error("삭제 대상이 너무 많아 관리자 점검이 필요합니다.");
        }
        if (batch.length < 100) break;
        offset += batch.length;
      }
    }
    return paths;
  }
  async function removePaths(bucket: string, paths: string[]) {
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
      if (error) throw error;
    }
  }

  try {
    // Always delete all own storage objects first. Auth deletion rejects owners of Storage objects.
    const privatePaths = await enumerate("nawabom-private-backups", user.id);
    const publicPaths = await enumerate("baljaguk-photos", "shares/" + user.id);
    await removePaths("nawabom-private-backups", privatePaths);
    await removePaths("baljaguk-photos", publicPaths);

    // Reactions are keyed by user ID; remove those for the authenticated account.
    const { error: reactionsError } = await admin
      .from("nawabom_place_reactions").delete().eq("user_id", user.id);
    if (reactionsError) throw reactionsError;

    const { error: accountError } = await admin.auth.admin.deleteUser(user.id, false);
    if (accountError) throw accountError;

    // This does NOT erase browser-local IndexedDB, browser recovery snapshots,
    // exported JSON files, or public shares that were uploaded via a prior anonymous UID.
    return reply(200, {
      ok: true,
      removedPrivateObjects: privatePaths.length,
      removedPublicShareObjects: publicPaths.length,
      message: "현재 이메일 계정과 해당 계정의 서버 기록을 삭제했습니다. 이 기기 기록과 이전 익명 계정의 공유 파일은 별도 확인이 필요합니다.",
    });
  } catch (error) {
    // On partial failure, the verified user can retry while the account still exists.
    // Do not log JWTs or reveal internal Storage paths to the caller.
    console.error("delete-my-account failed:", (error as Error)?.message ?? "unknown");
    return reply(500, {
      error: "삭제 절차를 완료하지 못했습니다. 일부 파일만 삭제되었을 수 있으므로 운영자에게 문의하거나 다시 시도해 주세요.",
    });
  }
});
