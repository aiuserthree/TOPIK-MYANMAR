"""Transactional email layouts (C안 에디토리얼) — ported from 시안/email/templates/data.js."""

from __future__ import annotations

from app.lib.email_render import Cta, EmailLayout

# KO master + my/en (email_templates_i18n). render_transactional falls back to ko.


def _layout(
    *,
    subject: str,
    preheader: str,
    eyebrow_ko: str,
    eyebrow_en: str,
    index_no: str,
    h1: str,
    intro: str,
    blocks: list,
    ctas: list | None = None,
) -> EmailLayout:
    return EmailLayout(
        subject=subject,
        preheader=preheader,
        eyebrow_ko=eyebrow_ko,
        eyebrow_en=eyebrow_en,
        index_no=index_no,
        h1=h1,
        intro=intro,
        blocks=blocks,
        ctas=[Cta(**c) for c in (ctas or [])],
    )


TRANSACTIONAL_LAYOUTS: dict[str, dict[str, EmailLayout]] = {
    "application_approved": {
        "ko": _layout(
            subject="[TOPIK Myanmar] 접수 승인 완료 안내",
            preheader="접수가 승인되었습니다. 다음 단계는 오프라인 응시료 수납입니다.",
            eyebrow_ko="접수 승인 완료",
            eyebrow_en="APPLICATION APPROVED",
            index_no="03",
            h1="접수가 승인되었습니다",
            intro="{userName} 님, 신청하신 TOPIK 접수가 정상적으로 승인되었습니다.",
            blocks=[
                {
                    "type": "infoTable",
                    "rows": [
                        ["회차", "{roundName}"],
                        ["급수", "{level}"],
                        ["시험일", "{examDate}"],
                        ["시험장", "{venueName}"],
                    ],
                },
                {
                    "type": "steps",
                    "title": "다음 단계",
                    "items": [
                        "오프라인 응시료 수납 (수납처·일정은 공지 참고)",
                        "수납 확인 후 정해진 날짜에 수험번호 일괄 부여",
                        "마이페이지·접수확인에서 수험번호 확인",
                    ],
                },
                {
                    "type": "notice",
                    "tone": "info",
                    "text": "수험번호는 이메일로 발송되지 않습니다. 응시료 수납이 확인된 후 정해진 날짜에 마이페이지·접수확인에서 확인하실 수 있습니다.",
                },
            ],
            ctas=[{"label": "마이페이지", "href": "{myPageUrl}", "kind": "primary"}],
        ),
    },
    "application_rejected": {
        "ko": _layout(
            subject="[TOPIK Myanmar] 접수 반려 안내",
            preheader="접수가 반려되었습니다. 사유를 확인하고 다시 접수해 주세요.",
            eyebrow_ko="접수 반려",
            eyebrow_en="APPLICATION REJECTED",
            index_no="04",
            h1="접수가 반려되었습니다",
            intro="{userName} 님, 아쉽게도 신청하신 접수가 반려되었습니다. 아래 사유를 확인해 주세요.",
            blocks=[
                {
                    "type": "infoTable",
                    "rows": [["회차", "{roundName}"], ["접수번호", "{applicantNo}"]],
                },
                {
                    "type": "reasonBox",
                    "tone": "negative",
                    "title": "반려 사유 — {rejectCode}",
                    "reason": "{rejectReason}",
                },
                {
                    "type": "paragraph",
                    "text": "마이페이지에서 기존 접수를 취소한 뒤 다시 접수하실 수 있습니다. 환불 또는 정보 정정이 필요하시면 게시판으로 신청해 주세요.",
                },
            ],
            ctas=[
                {"label": "마이페이지", "href": "{myPageUrl}", "kind": "primary"},
                {"label": "환불·정보정정신청", "href": "{refundUrl}", "kind": "secondary"},
            ],
        ),
    },
    "photo_rejected": {
        "ko": _layout(
            subject="[TOPIK Myanmar] 증명사진 심사 반려 안내",
            preheader="증명사진이 반려되었습니다. 마이페이지에서 사진을 다시 등록해 주세요.",
            eyebrow_ko="증명사진 심사",
            eyebrow_en="PHOTO REVIEW",
            index_no="05",
            h1="증명사진을 다시 등록해 주세요",
            intro="{userName} 님, 등록하신 증명사진이 심사 기준에 맞지 않아 반려되었습니다. 접수 자체는 유지되며, 사진만 다시 등록하시면 됩니다.",
            blocks=[
                {
                    "type": "reasonBox",
                    "tone": "warn",
                    "title": "반려 사유 — {photoRejectCode}",
                    "reason": "{photoRejectReason}",
                },
                {
                    "type": "paragraph",
                    "text": "여권용 정면 사진(모자·선글라스 미착용, 컬러, 선명)으로 다시 등록하시면 재심사가 진행됩니다.",
                },
            ],
            ctas=[{"label": "사진 재등록하기", "href": "{editProfileUrl}", "kind": "primary"}],
        ),
    },
    "temp_password": {
        "ko": _layout(
            subject="[TOPIK Myanmar] 임시 비밀번호 안내",
            preheader="임시 비밀번호로 로그인 후 반드시 새 비밀번호로 변경해 주세요.",
            eyebrow_ko="임시 비밀번호",
            eyebrow_en="TEMPORARY PASSWORD",
            index_no="06",
            h1="임시 비밀번호 안내",
            intro="{userName} 님, 관리자에 의해 임시 비밀번호가 발급되었습니다. 아래 임시 비밀번호로 로그인해 주세요.",
            blocks=[
                {
                    "type": "code",
                    "label": "임시 비밀번호",
                    "value": "{temporaryPassword}",
                    "sub": "로그인 후 즉시 변경 권장",
                    "mono": True,
                },
                {"type": "notice", "tone": "warn", "text": "보안을 위해 로그인 후 반드시 새 비밀번호로 변경해 주세요."},
            ],
            ctas=[{"label": "로그인", "href": "{loginUrl}", "kind": "primary"}],
        ),
    },
    "temp_password_admin": {
        "ko": _layout(
            subject="[TOPIK Myanmar BO] 임시 비밀번호 안내",
            preheader="관리자 시스템 임시 비밀번호입니다. 첫 로그인 시 반드시 변경하세요.",
            eyebrow_ko="관리자 임시 비밀번호",
            eyebrow_en="ADMIN ACCESS",
            index_no="07",
            h1="관리자 임시 비밀번호",
            intro="{adminUsername} 님, 관리자 시스템(BO) 계정의 임시 비밀번호가 발급되었습니다.",
            blocks=[
                {"type": "infoTable", "rows": [["관리자 ID", "{adminUsername}"]]},
                {
                    "type": "code",
                    "label": "임시 비밀번호",
                    "value": "{temporaryPassword}",
                    "sub": "첫 로그인 시 변경 강제",
                    "mono": True,
                },
                {
                    "type": "notice",
                    "tone": "negative",
                    "text": "임시 비밀번호는 타인에게 절대 공유하지 마세요. 첫 로그인 시 비밀번호 변경이 강제됩니다.",
                },
            ],
            ctas=[{"label": "관리자 로그인", "href": "{boLoginUrl}", "kind": "primary"}],
        ),
    },
    "board_refund_received": {
        "ko": _layout(
            subject="[TOPIK Myanmar] {boardName} 접수 확인",
            preheader="작성하신 글이 정상적으로 접수되었습니다.",
            eyebrow_ko="접수 확인",
            eyebrow_en="SUBMISSION RECEIVED",
            index_no="08",
            h1="글이 정상적으로 접수되었습니다",
            intro="{userName} 님, 작성하신 글이 정상적으로 접수되었습니다. 처리 상태는 이메일과 게시판을 통해 안내드립니다.",
            blocks=[
                {
                    "type": "infoTable",
                    "rows": [
                        ["게시판", "{boardName}"],
                        ["제목", "{postTitle}"],
                        ["접수번호", "{postId}"],
                        ["접수일시", "{submittedAt}"],
                        ["처리 상태", "접수"],
                    ],
                },
            ],
            ctas=[{"label": "게시글 보기", "href": "{postUrl}", "kind": "primary"}],
        ),
    },
    "board_admin_new_post": {
        "ko": _layout(
            subject="[TOPIK Myanmar BO] 신규 {boardName} 접수",
            preheader="새로운 게시글이 접수되었습니다. BO에서 처리해 주세요.",
            eyebrow_ko="신규 접수 알림",
            eyebrow_en="NEW SUBMISSION",
            index_no="09",
            h1="신규 게시글이 접수되었습니다",
            intro="새로운 게시글이 접수되었습니다. 아래 정보를 확인하고 처리해 주세요.",
            blocks=[
                {
                    "type": "infoTable",
                    "rows": [
                        ["작성자", "{userName}"],
                        ["게시판", "{boardName}"],
                        ["유형", "{category}"],
                        ["제목", "{postTitle}"],
                        ["접수일시", "{submittedAt}"],
                        ["비밀글", "{secretFlag}"],
                    ],
                },
                {
                    "type": "notice",
                    "tone": "info",
                    "text": "비밀글은 본문이 메일에 포함되지 않습니다. 관리자에서 직접 확인해 주세요.",
                },
            ],
            ctas=[{"label": "관리자에서 처리하기", "href": "{boPostUrl}", "kind": "primary"}],
        ),
    },
    "board_reply": {
        "ko": _layout(
            subject="[TOPIK Myanmar] {boardName} 답변/댓글 알림",
            preheader="작성하신 글에 새로운 활동이 있습니다.",
            eyebrow_ko="답변/댓글 알림",
            eyebrow_en="ACTIVITY",
            index_no="10",
            h1="새로운 {activityType}이 등록되었습니다",
            intro="{userName} 님, 작성하신 글에 새로운 활동이 있습니다.",
            blocks=[
                {
                    "type": "infoTable",
                    "rows": [
                        ["게시판", "{boardName}"],
                        ["제목", "{postTitle}"],
                        ["활동", "{activityType}"],
                    ],
                },
                {
                    "type": "notice",
                    "tone": "info",
                    "text": "비밀글의 내용은 메일에 포함되지 않습니다. 로그인 후 게시판에서 확인해 주세요.",
                },
            ],
            ctas=[{"label": "게시글 보기", "href": "{postUrl}", "kind": "primary"}],
        ),
    },
    "notice_marketing": {
        "ko": _layout(
            subject="[TOPIK Myanmar] 새 공지사항 안내",
            preheader="새로운 공지사항이 등록되었습니다.",
            eyebrow_ko="새 공지사항",
            eyebrow_en="NOTICE",
            index_no="11",
            h1="새 공지사항이 등록되었습니다",
            intro="TOPIK Myanmar에 새로운 공지사항이 등록되었습니다.",
            blocks=[
                {
                    "type": "infoTable",
                    "rows": [
                        ["제목", "{noticeTitle}"],
                        ["카테고리", "{noticeCategory}"],
                        ["게시일", "{publishedAt}"],
                    ],
                },
                {"type": "paragraph", "text": "공지 전문은 사이트에서 확인하실 수 있습니다."},
                {
                    "type": "notice",
                    "tone": "info",
                    "text": "본 메일은 광고성 정보 수신에 동의하신 회원에게 발송되었습니다.",
                },
            ],
            ctas=[{"label": "공지사항 보기", "href": "{noticeUrl}", "kind": "primary"}],
        ),
    },
    "account_status": {
        "ko": _layout(
            subject="[TOPIK Myanmar] 회원 계정 {accountStatusLabel} 안내",
            preheader="회원 계정이 {accountStatusLabel} 처리되었습니다. 사유와 기간을 확인해 주세요.",
            eyebrow_ko="계정 상태",
            eyebrow_en="ACCOUNT STATUS",
            index_no="12",
            h1="회원 계정이 {accountStatusLabel}되었습니다",
            intro="{userName} 님, TOPIK Myanmar 회원 계정이 관리자에 의해 {accountStatusLabel} 처리되었습니다. 아래 내용을 확인해 주세요.",
            blocks=[
                {
                    "type": "infoTable",
                    "rows": [
                        ["처리 구분", "{accountStatusLabel}"],
                        ["사유", "{statusReason}"],
                        ["적용 기간", "{statusUntil}"],
                    ],
                },
                {
                    "type": "notice",
                    "tone": "warn",
                    "showWhen": {"accountAction": "suspended"},
                    "text": "정지 기간 동안 로그인·시험 접수·마이페이지 이용이 제한됩니다. 문의가 필요하시면 문의 게시판을 이용해 주세요.",
                },
                {
                    "type": "notice",
                    "tone": "negative",
                    "showWhen": {"accountAction": "withdrawn"},
                    "text": "탈퇴 처리 시 진행 중이던 접수 {canceledApplications}건이 자동 취소되었습니다. 환불은 응시료 규정에 따릅니다. 동일 이메일 재가입은 30일간 제한될 수 있습니다.",
                },
                {
                    "type": "paragraph",
                    "text": "본인이 요청하지 않은 처리라면 즉시 {supportEmail} 또는 문의 게시판으로 연락해 주세요.",
                },
            ],
            ctas=[
                {"label": "문의 게시판", "href": "{supportBoardUrl}", "kind": "primary"},
                {"label": "사이트 바로가기", "href": "{siteUrlFull}", "kind": "secondary"},
            ],
        ),
    },
    "member_info_changed": {
        "ko": _layout(
            subject="[TOPIK Myanmar] 회원정보 변경 안내",
            preheader="관리자에 의해 회원정보가 변경되었습니다. 변경 항목을 확인해 주세요.",
            eyebrow_ko="회원정보 변경",
            eyebrow_en="PROFILE UPDATE",
            index_no="13",
            h1="회원정보가 변경되었습니다",
            intro="{userName} 님, TOPIK Myanmar 운영 담당자가 회원정보를 수정했습니다.",
            blocks=[
                {
                    "type": "infoTable",
                    "rows": [
                        ["변경 일시", "{changedAt}"],
                        ["처리자", "{changedBy}"],
                        ["변경 항목", "{changedFieldsSummary}"],
                    ],
                },
                {
                    "type": "reasonBox",
                    "tone": "info",
                    "title": "변경 내역",
                    "reason": "{changeDiffHtml}",
                },
            ],
            ctas=[
                {"label": "마이페이지", "href": "{myPageUrl}", "kind": "primary"},
                {"label": "문의 게시판", "href": "{supportBoardUrl}", "kind": "secondary"},
            ],
        ),
    },
    "password_expiry_reminder": {
        "ko": _layout(
            subject="[TOPIK Myanmar] 비밀번호 변경 권고 안내",
            preheader="마지막 변경 후 6개월이 경과했습니다. 계정 보호를 위해 비밀번호를 변경해 주세요.",
            eyebrow_ko="비밀번호 정책",
            eyebrow_en="PASSWORD POLICY",
            index_no="14",
            h1="비밀번호 변경을 권장합니다",
            intro="{userName} 님, 마지막 변경일로부터 {daysSincePwChange}일이 경과했습니다.",
            blocks=[
                {
                    "type": "infoTable",
                    "rows": [
                        ["마지막 변경일", "{lastPasswordChange}"],
                        ["경과 일수", "{daysSincePwChange}일"],
                    ],
                },
                {
                    "type": "notice",
                    "tone": "warn",
                    "text": "8자 이상, 영문·숫자·특수문자를 조합한 새 비밀번호 사용을 권장합니다.",
                },
            ],
            ctas=[
                {"label": "비밀번호 변경", "href": "{passwordChangeUrl}", "kind": "primary"},
                {"label": "로그인", "href": "{loginUrl}", "kind": "secondary"},
            ],
        ),
    },
}

for _key, _locales in __import__(
    "app.lib.email_templates_i18n", fromlist=["TRANSACTIONAL_I18N"]
).TRANSACTIONAL_I18N.items():
    TRANSACTIONAL_LAYOUTS.setdefault(_key, {}).update(_locales)
