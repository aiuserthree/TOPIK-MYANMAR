#!/usr/bin/env bash
# BO 성능 개선(B: 갱신 행만 반영 / C: JSX 사전 컴파일) 운영 반영.
#
# 예약 실행(무인)을 전제로 만들었다. 사람이 지켜보지 않는 사이 API 기동에 실패하면
# 접수가 통째로 멈추므로, 헬스체크가 통과하지 못하면 직전 배포 커밋으로 되돌리고
# 다시 기동한다.
#
# 전체 배포(deploy-all-from-git.sh)와 달리 migration 은 돌리지 않는다 — B·C 는
# 스키마를 바꾸지 않는다. 의존성도 추가되지 않아 pip install 도 생략한다.
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
  git checkout "${PREV}" -- "${PATHS[@]}" 2>&1 | tee -a "${LOG}"
  systemctl restart myanmar-api
  health_wait >/dev/null
  python3 build-bo.py 2>&1 | tee -a "${LOG}"
  if curl -sf -m 3 http://127.0.0.1:8000/health >/dev/null 2>&1; then
    log "롤백 완료 — 서비스 정상"
  else
    log "CRITICAL: 롤백 후에도 API 가 응답하지 않습니다. 수동 조치 필요."
  fi
}

main() {
  cd "${APP_ROOT}" || { echo "APP_ROOT 없음: ${APP_ROOT}"; exit 1; }

  log "===== BO 성능 개선 배포 시작 ====="

  # 현재 배포되어 있는 커밋 — 롤백 지점. fetch 前에 잡아야 한다.
  PREV="$(git rev-parse origin/main)"
  log "현재 배포 커밋: $(git log -1 --format='%h %s' "${PREV}")"

  git fetch origin --quiet || { log "ERROR: git fetch 실패 — 중단"; exit 1; }
  NEW="$(git rev-parse origin/main)"
  log "반영할 커밋:   $(git log -1 --format='%h %s' "${NEW}")"

  if [[ "${PREV}" == "${NEW}" ]]; then
    log "origin/main 에 변경이 없습니다 — 할 일 없음"
    exit 0
  fi

  if [[ "${DRY_RUN}" == "1" ]]; then
    log "[DRY_RUN] 아래 경로를 ${NEW} 로 갱신하고 API 재시작 + BO 재빌드합니다:"
    printf '  %s\n' "${PATHS[@]}" | tee -a "${LOG}"
    log "[DRY_RUN] 실제 변경 없음"
    exit 0
  fi

  log "==> 소스 갱신"
  if ! git checkout "${NEW}" -- "${PATHS[@]}" 2>&1 | tee -a "${LOG}"; then
    log "ERROR: checkout 실패 — 변경 없이 중단"
    exit 1
  fi

  log "==> API 재시작"
  systemctl restart myanmar-api

  if elapsed="$(health_wait)"; then
    log "  /health OK (${elapsed}s)"
  else
    log "ERROR: API 가 ${HEALTH_TIMEOUT}s 안에 응답하지 않았습니다"
    journalctl -u myanmar-api -n 30 --no-pager 2>&1 | tee -a "${LOG}"
    rollback
    exit 1
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

  log "===== 배포 완료: $(git log -1 --format='%h %s' "${NEW}") ====="
}

main "$@"
