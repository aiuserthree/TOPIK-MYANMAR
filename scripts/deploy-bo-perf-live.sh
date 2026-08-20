#!/usr/bin/env bash
# BO 성능 개선(B: 갱신 행만 반영 / C: JSX 사전 컴파일) 운영 반영.
#
# 예약 실행(무인)을 전제로 만들었다. 사람이 지켜보지 않는 사이 API 기동에 실패하면
# 접수가 통째로 멈추므로, 헬스체크가 통과하지 못하면 직전 배포 커밋으로 되돌리고
# 다시 기동한다.
#
# 전체 배포(deploy-all-from-git.sh)와 달리 migration 은 돌리지 않는다 — 이 갈래의
# 변경은 스키마를 바꾸지 않는다. 의존성도 추가되지 않아 pip install 도 생략한다.
#
# API 재시작은 apps/api/ 가 실제로 바뀐 배포에서만 한다. 재시작은 워커 2개를 동시에
# 내려 몇 초간 502 가 나가므로(2026-08-20 배포 때 응시자 3명이 겪음), BO 정적 파일만
# 바뀌는 배포는 무중단으로 끝낸다.
#
# 본문을 main() 으로 감싼 이유: 이 스크립트는 실행 도중 scripts/ 를 체크아웃하며
# 자기 자신을 덮어쓴다. bash 는 스크립트를 파일 오프셋 기준으로 이어 읽으므로,
# 실행 중 파일이 바뀌면 엉뚱한 위치를 읽어 깨진다. 함수 정의는 호출 전에 통째로
# 파싱되므로 마지막 줄의 main "$@" 까지 읽히고 나면 파일이 바뀌어도 영향이 없다.
# (deploy-all-from-git.sh 가 같은 이유로 같은 구조를 쓴다.)
#
# 사용:
#   bash scripts/deploy-bo-perf-live.sh              # 지금 실행
#   DRY_RUN=1 bash scripts/deploy-bo-perf-live.sh    # 무엇을 할지만 출력
set -uo pipefail

APP_ROOT="${APP_ROOT:-/opt/myanmar-v2}"
LOG="${LOG:-/var/log/myanmar-deploy-bo-perf.log}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-60}"
DRY_RUN="${DRY_RUN:-0}"

# 마지막으로 배포에 성공한 커밋을 적어 두는 표식.
# origin/main 을 "현재 배포된 것"으로 쓰면 안 된다 — 그건 원격 참조라 누가 fetch 만
# 해도 앞으로 움직이고, 작업 트리에 실제로 체크아웃된 것과는 무관하다. 그렇게 하면
# 배포 직전에 누가 fetch 한 것만으로 PREV == NEW 가 되어 배포가 조용히 건너뛰어진다.
STATE_FILE="${STATE_FILE:-${APP_ROOT}/.deployed-commit}"

# 저장소 소유자가 root 가 아니라서(UNKNOWN:staff / .git 은 deploy:deploy) git 이
# "dubious ownership" 으로 거부한다. 대화형 SSH 에서는 /root/.gitconfig 의
# safe.directory 예외를 읽어 넘어가지만, systemd 로 돌 때는 HOME 이 없어 그 설정을
# 못 읽는다 — 2026-08-20 첫 예약 배포가 이것 때문에 fetch 단계에서 멈췄다.
# 환경에 기대지 않도록 호출마다 예외를 직접 준다.
GIT=(git -c "safe.directory=${APP_ROOT}")

# 이 배포가 건드리는 경로 — 롤백도 같은 목록으로 되돌린다.
PATHS=(
  "apps/api/app/"
  "html/C안/BO(admin)/"
  "build-bo.py"
  "scripts/"
)

log() { echo "[$(date '+%F %T %Z')] $*" | tee -a "${LOG}"; }

health_wait() {
  local i
  for i in $(seq 1 "${HEALTH_TIMEOUT}"); do
    if curl -sf -m 3 http://127.0.0.1:8000/health >/dev/null 2>&1; then
      echo "${i}"
      return 0
    fi
    sleep 1
  done
  return 1
}

rollback() {
  log "!!! 롤백 — ${PREV} 로 되돌립니다"
  "${GIT[@]}" checkout "${PREV}" -- "${PATHS[@]}" 2>&1 | tee -a "${LOG}"
  if [[ "${API_CHANGED:-1}" == "1" ]]; then
    systemctl restart myanmar-api
    health_wait >/dev/null
  fi
  python3 build-bo.py 2>&1 | tee -a "${LOG}"
  echo "${PREV}" > "${STATE_FILE}"
  if curl -sf -m 3 http://127.0.0.1:8000/health >/dev/null 2>&1; then
    log "롤백 완료 — 서비스 정상"
  else
    log "CRITICAL: 롤백 후에도 API 가 응답하지 않습니다. 수동 조치 필요."
  fi
}

main() {
  cd "${APP_ROOT}" || { echo "APP_ROOT 없음: ${APP_ROOT}"; exit 1; }

  log "===== BO 성능 개선 배포 시작 ====="

  # 현재 배포되어 있는 커밋 — 롤백 지점.
  if [[ -s "${STATE_FILE}" ]]; then
    PREV="$(cat "${STATE_FILE}")"
  else
    PREV="$("${GIT[@]}" rev-parse origin/main)"
    log "WARN: ${STATE_FILE} 가 없어 현재 origin/main 을 롤백 지점으로 삼습니다"
  fi
  log "현재 배포 커밋: $("${GIT[@]}" log -1 --format='%h %s' "${PREV}")"

  "${GIT[@]}" fetch origin --quiet || { log "ERROR: git fetch 실패 — 중단"; exit 1; }
  NEW="$("${GIT[@]}" rev-parse origin/main)"
  log "반영할 커밋:   $("${GIT[@]}" log -1 --format='%h %s' "${NEW}")"

  if [[ "${PREV}" == "${NEW}" ]]; then
    log "origin/main 에 변경이 없습니다 — 할 일 없음"
    exit 0
  fi

  if [[ "${DRY_RUN}" == "1" ]]; then
    if "${GIT[@]}" diff --quiet "${PREV}" "${NEW}" -- apps/api/; then
      log "[DRY_RUN] API 변경 없음 → 재시작 없이 BO 만 재빌드합니다. 갱신 경로:"
    else
      log "[DRY_RUN] API 변경 있음 → 재시작 + BO 재빌드합니다. 갱신 경로:"
    fi
    printf '  %s\n' "${PATHS[@]}" | tee -a "${LOG}"
    log "[DRY_RUN] 실제 변경 없음"
    exit 0
  fi

  log "==> 소스 갱신"
  if ! "${GIT[@]}" checkout "${NEW}" -- "${PATHS[@]}" 2>&1 | tee -a "${LOG}"; then
    log "ERROR: checkout 실패 — 변경 없이 중단"
    exit 1
  fi

  # 재시작은 워커 2개를 동시에 내려 몇 초간 502 가 나간다 — 2026-08-20 배포 때
  # 응시자 3명이 실제로 겪었다. BO 정적 파일만 바뀌는 배포에서는 그럴 이유가 없다.
  if "${GIT[@]}" diff --quiet "${PREV}" "${NEW}" -- apps/api/; then
    API_CHANGED=0
    log "==> API 변경 없음 — 재시작 건너뜀 (무중단)"
  else
    API_CHANGED=1
    log "==> API 재시작 (apps/api 변경 있음)"
    systemctl restart myanmar-api
    if elapsed="$(health_wait)"; then
      log "  /health OK (${elapsed}s)"
    else
      log "ERROR: API 가 ${HEALTH_TIMEOUT}s 안에 응답하지 않았습니다"
      journalctl -u myanmar-api -n 30 --no-pager 2>&1 | tee -a "${LOG}"
      rollback
      exit 1
    fi
  fi

  log "==> BO 정적 재빌드"
  if ! python3 build-bo.py 2>&1 | tee -a "${LOG}"; then
    log "ERROR: BO 빌드 실패"
    rollback
    exit 1
  fi

  log "==> 검증"
  local fail=0

  # C 가 적용되면 .jsx 는 사라지고 babel 도 산출물에서 빠진다.
  local jsx_left babel_left
  jsx_left="$(find public-bo -name '*.jsx' | wc -l | tr -d ' ')"
  babel_left="$(find public-bo/vendor -name 'babel-standalone-*' 2>/dev/null | wc -l | tr -d ' ')"
  log "  남은 .jsx: ${jsx_left} / babel 산출물: ${babel_left} (사전 컴파일되면 둘 다 0)"
  if [[ "${jsx_left}" != "0" ]]; then
    log "  WARN: JSX 사전 컴파일이 적용되지 않았습니다 (node 확인 필요) — 동작 자체는 정상"
  fi

  # B 가 실제로 올라갔는지 — API 와 BO 양쪽 모두 확인한다.
  if grep -q "_app_row_after_mutation" apps/api/app/routers/admin_api.py; then
    log "  API: 갱신 행 반환 OK"
  else
    log "  ERROR: API 에 B 가 반영되지 않음"
    fail=1
  fi

  if grep -q "applyServerRows" public-bo/assets/bo-api-bridge.js; then
    log "  BO: 갱신 행 반영 OK"
  else
    log "  ERROR: BO 에 B 가 반영되지 않음"
    fail=1
  fi

  # D 가 적용됐는지: 화면 열 때 겹치는 명단 조회를 합치는 코드가 있는지.
  if grep -q "applicantsRequestKey" public-bo/assets/bo-api-bridge.js; then
    log "  BO: 중복 조회 합치기 OK"
  else
    log "  ERROR: BO 에 D 가 반영되지 않음"
    fail=1
  fi

  if [[ -f public-bo/admin.html ]]; then
    log "  admin.html OK"
  else
    log "  ERROR: admin.html 없음"
    fail=1
  fi

  if [[ ${fail} -ne 0 ]]; then
    rollback
    exit 1
  fi

  if ! curl -sf -m 5 http://127.0.0.1:8000/health >/dev/null 2>&1; then
    log "ERROR: 마지막 헬스체크 실패"
    rollback
    exit 1
  fi

  echo "${NEW}" > "${STATE_FILE}"
  log "===== 배포 완료: $("${GIT[@]}" log -1 --format='%h %s' "${NEW}") ====="
}

main "$@"
