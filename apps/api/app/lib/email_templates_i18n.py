"""my/en transactional email layouts — merged into TRANSACTIONAL_LAYOUTS."""

from __future__ import annotations

from app.lib.email_render import Cta, EmailLayout


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

TRANSACTIONAL_I18N: dict[str, dict[str, object]] = {
    "application_approved": {
        "my": _layout(
            subject="[TOPIK Myanmar] လျှောက်လွှာ အတည်ပြုပြီးကြောင်း အသိပေးချက်",
            preheader="လျှောက်လွှာကို အတည်ပြုပြီးပါပြီ။ နောက်တစ်ဆင့်မှာ အော့ဖ်လိုင်း ဖြေဆိုကြေး ပေးသွင်းခြင်း ဖြစ်သည်။",
            eyebrow_ko="လျှောက်လွှာ အတည်ပြုပြီး",
            eyebrow_en="APPLICATION APPROVED",
            index_no="03",
            h1="လျှောက်လွှာကို အတည်ပြုပြီးပါပြီ",
            intro="မင်္ဂလာပါ {userName} ရှင့်၊ သင် လျှောက်ထားသော TOPIK လျှောက်လွှာကို အောင်မြင်စွာ အတည်ပြုပြီးပါပြီ။",
            blocks=[
                {
                    "type": "infoTable",
                    "rows": [
                        ["အကြိမ်ရေ", "{roundName}"],
                        ["အဆင့်", "{level}"],
                        ["စာမေးပွဲ ရက်", "{examDate}"],
                        ["စာမေးပွဲခန်း", "{venueName}"],
                    ],
                },
                {
                    "type": "steps",
                    "title": "နောက်တစ်ဆင့်များ",
                    "items": [
                        "အော့ဖ်လိုင်း ဖြေဆိုကြေး ပေးသွင်းခြင်း (ပေးသွင်းရာနေရာ·ရက်စွဲကို ကြေညာချက်တွင် ကြည့်ပါ)",
                        "ပေးသွင်းမှု အတည်ပြုပြီးနောက် သတ်မှတ်ရက်တွင် ဖြေဆိုသူနံပါတ် တစ်ပြိုင်နက် ပေးအပ်ခြင်း",
                        "My Page · လျှောက်လွှာ အတည်ပြုချက်တွင် ဖြေဆိုသူနံပါတ် စစ်ဆေးခြင်း",
                    ],
                },
                {
                    "type": "notice",
                    "tone": "info",
                    "text": "ဖြေဆိုသူနံပါတ်ကို အီးမေးလ်ဖြင့် မပို့ပါ။ ဖြေဆိုကြေး ပေးသွင်းမှု အတည်ပြုပြီးနောက် သတ်မှတ်ရက်တွင် My Page · လျှောက်လွှာ အတည်ပြုချက်တွင် စစ်ဆေးနိုင်ပါသည်။",
                },
            ],
            ctas=[{"label": "My Page", "href": "{myPageUrl}", "kind": "primary"}],
        ),
        "en": _layout(
            subject="[TOPIK Myanmar] Application approved",
            preheader="Your application has been approved. Next step: pay the exam fee offline.",
            eyebrow_ko="접수 승인 완료",
            eyebrow_en="APPLICATION APPROVED",
            index_no="03",
            h1="Your application has been approved",
            intro="Dear {userName}, your TOPIK application has been successfully approved.",
            blocks=[
                {
                    "type": "infoTable",
                    "rows": [
                        ["Session", "{roundName}"],
                        ["Level", "{level}"],
                        ["Test date", "{examDate}"],
                        ["Venue", "{venueName}"],
                    ],
                },
                {
                    "type": "steps",
                    "title": "Next steps",
                    "items": [
                        "Pay the exam fee offline (see notices for payment location and schedule)",
                        "Exam numbers assigned in bulk on a set date after payment is confirmed",
                        "Check your exam number on My Page · Application confirmation",
                    ],
                },
                {
                    "type": "notice",
                    "tone": "info",
                    "text": "Your exam number is not sent by email. After your fee payment is confirmed, you can check it on My Page · Application confirmation on the scheduled date.",
                },
            ],
            ctas=[{"label": "My Page", "href": "{myPageUrl}", "kind": "primary"}],
        ),
    },
    "application_rejected": {
        "my": _layout(
            subject="[TOPIK Myanmar] လျှောက်လွှာ ပယ်ချခြင်း အသိပေးချက်",
            preheader="လျှောက်လွှာကို ပယ်ချထားပါသည်။ အကြောင်းရင်းကို စစ်ဆေးပြီး ပြန်လည်လျှောက်ထားပါ။",
            eyebrow_ko="လျှောက်လွှာ ပယ်ချ",
            eyebrow_en="APPLICATION REJECTED",
            index_no="04",
            h1="လျှောက်လွှာကို ပယ်ချထားပါသည်",
            intro="မင်္ဂလာပါ {userName} ရှင့်၊ သင် လျှောက်ထားသော လျှောက်လွှာကို ပယ်ချထားပါသည်။ အောက်ပါ အကြောင်းရင်းကို စစ်ဆေးပါ။",
            blocks=[
                {
                    "type": "infoTable",
                    "rows": [["အကြိမ်ရေ", "{roundName}"], ["လျှောက်လွှာနံပါတ်", "{applicantNo}"]],
                },
                {
                    "type": "reasonBox",
                    "tone": "negative",
                    "title": "ပယ်ချ အကြောင်းရင်း — {rejectCode}",
                    "reason": "{rejectReason}",
                },
                {
                    "type": "paragraph",
                    "text": "My Page တွင် လက်ရှိ လျှောက်လွှာကို ပယ်ဖျက်ပြီးနောက် ပြန်လည်လျှောက်ထားနိုင်ပါသည်။ ငွေပြန်အမ်း သို့မဟုတ် အချက်အလက် ပြင်ဆင်မှု လိုပါက ဘုတ်မှတစ်ဆင့် လျှောက်ထားပါ။",
                },
            ],
            ctas=[
                {"label": "My Page", "href": "{myPageUrl}", "kind": "primary"},
                {"label": "ငွေပြန်အမ်း·အချက်အလက်ပြင်ဆင်ခြင်း", "href": "{refundUrl}", "kind": "secondary"},
            ],
        ),
        "en": _layout(
            subject="[TOPIK Myanmar] Application rejected",
            preheader="Your application was rejected. Please review the reason and apply again.",
            eyebrow_ko="접수 반려",
            eyebrow_en="APPLICATION REJECTED",
            index_no="04",
            h1="Your application was rejected",
            intro="Dear {userName}, unfortunately your application was rejected. Please review the reason below.",
            blocks=[
                {
                    "type": "infoTable",
                    "rows": [["Session", "{roundName}"], ["Application no.", "{applicantNo}"]],
                },
                {
                    "type": "reasonBox",
                    "tone": "negative",
                    "title": "Rejection reason — {rejectCode}",
                    "reason": "{rejectReason}",
                },
                {
                    "type": "paragraph",
                    "text": "You can cancel your existing application on My Page and apply again. For a refund or information correction, please submit a request on the board.",
                },
            ],
            ctas=[
                {"label": "My Page", "href": "{myPageUrl}", "kind": "primary"},
                {"label": "Refund/correction request", "href": "{refundUrl}", "kind": "secondary"},
            ],
        ),
    },
    "photo_rejected": {
        "my": _layout(
            subject="[TOPIK Myanmar] သက်သေခံ ဓာတ်ပုံ စိစစ်မှု ပယ်ချ အသိပေးချက်",
            preheader="သက်သေခံ ဓာတ်ပုံကို ပယ်ချထားပါသည်။ My Page တွင် ဓာတ်ပုံကို ပြန်လည်တင်ပါ။",
            eyebrow_ko="သက်သေခံ ဓာတ်ပုံ စိစစ်မှု",
            eyebrow_en="PHOTO REVIEW",
            index_no="05",
            h1="သက်သေခံ ဓာတ်ပုံကို ပြန်လည်တင်ပါ",
            intro="မင်္ဂလာပါ {userName} ရှင့်၊ တင်ထားသော သက်သေခံ ဓာတ်ပုံသည် စိစစ်မှု စံနှုန်းနှင့် မကိုက်ညီသောကြောင့် ပယ်ချထားပါသည်။ လျှောက်လွှာကို ဆက်လက်ထားရှိပြီး ဓာတ်ပုံကိုသာ ပြန်လည်တင်ပါ။",
            blocks=[
                {
                    "type": "reasonBox",
                    "tone": "warn",
                    "title": "ပယ်ချ အကြောင်းရင်း — {photoRejectCode}",
                    "reason": "{photoRejectReason}",
                },
                {
                    "type": "paragraph",
                    "text": "ပတ်စ်ပို့သုံး ရှေ့မျက်နှာ ဓာတ်ပုံ (ဦးထုပ်·နေကာမျက်မှန် မတပ်ဆင်၊ အရောင်၊ ရှင်းလင်းသော) ဖြင့် ပြန်လည်တင်ပါက ပြန်လည် စိစစ်ပါမည်။",
                },
            ],
            ctas=[{"label": "ဓာတ်ပုံ ပြန်လည်တင်ရန်", "href": "{editProfileUrl}", "kind": "primary"}],
        ),
        "en": _layout(
            subject="[TOPIK Myanmar] ID photo review rejected",
            preheader="Your ID photo was rejected. Please upload a new photo on My Page.",
            eyebrow_ko="증명사진 심사",
            eyebrow_en="PHOTO REVIEW",
            index_no="05",
            h1="Please upload your ID photo again",
            intro="Dear {userName}, your uploaded ID photo did not meet the review criteria and was rejected. Your application remains active; you only need to upload a new photo.",
            blocks=[
                {
                    "type": "reasonBox",
                    "tone": "warn",
                    "title": "Rejection reason — {photoRejectCode}",
                    "reason": "{photoRejectReason}",
                },
                {
                    "type": "paragraph",
                    "text": "Upload a passport-style frontal photo (no hat/sunglasses, color, clear) to proceed with re-review.",
                },
            ],
            ctas=[{"label": "Re-upload photo", "href": "{editProfileUrl}", "kind": "primary"}],
        ),
    },
    "temp_password": {
        "my": _layout(
            subject="[TOPIK Myanmar] ယာယီ စကားဝှက် အသိပေးချက်",
            preheader="ယာယီ စကားဝှက်ဖြင့် ဝင်ရောက်ပြီး အသစ် စကားဝှက်သို့ ပြောင်းပါ။",
            eyebrow_ko="ယာယီ စကားဝှက်",
            eyebrow_en="TEMPORARY PASSWORD",
            index_no="06",
            h1="ယာယီ စကားဝှက် အသိပေးချက်",
            intro="မင်္ဂလာပါ {userName} ရှင့်၊ စီမံခန့်ခွဲသူက ယာယီ စကားဝှက်ကို ထုတ်ပေးထားပါသည်။ အောက်ပါ ယာယီ စကားဝှက်ဖြင့် ဝင်ရောက်ပါ။",
            blocks=[
                {
                    "type": "code",
                    "label": "ယာယီ စကားဝှက်",
                    "value": "{temporaryPassword}",
                    "sub": "ဝင်ရောက်ပြီးနောက် ချက်ချင်း ပြောင်းရန် အကြံပြု",
                    "mono": True,
                },
                {"type": "notice", "tone": "warn", "text": "လုံခြုံရေးအတွက် ဝင်ရောက်ပြီးနောက် အသစ် စကားဝှက်သို့ ပြောင်းပါ။"},
            ],
            ctas=[{"label": "ဝင်ရောက်ရန်", "href": "{loginUrl}", "kind": "primary"}],
        ),
        "en": _layout(
            subject="[TOPIK Myanmar] Temporary password notice",
            preheader="Sign in with the temporary password, then change it to a new one.",
            eyebrow_ko="임시 비밀번호",
            eyebrow_en="TEMPORARY PASSWORD",
            index_no="06",
            h1="Temporary password notice",
            intro="Dear {userName}, an administrator has issued a temporary password. Please sign in with the temporary password below.",
            blocks=[
                {
                    "type": "code",
                    "label": "Temporary password",
                    "value": "{temporaryPassword}",
                    "sub": "Change immediately after sign-in",
                    "mono": True,
                },
                {"type": "notice", "tone": "warn", "text": "For security, please change to a new password after signing in."},
            ],
            ctas=[{"label": "Sign in", "href": "{loginUrl}", "kind": "primary"}],
        ),
    },
    "temp_password_admin": {
        "my": _layout(
            subject="[TOPIK Myanmar BO] ယာယီ စကားဝှက် အသိပေးချက်",
            preheader="စီမံခန့်ခွဲမှုစနစ် ယာယီ စကားဝှက် ဖြစ်သည်။ ပထမဝင်ရောက်ချိန်တွင် ပြောင်းပါ။",
            eyebrow_ko="စီမံခန့်ခွဲသူ ယာယီ စကားဝှက်",
            eyebrow_en="ADMIN ACCESS",
            index_no="07",
            h1="စီမံခန့်ခွဲသူ ယာယီ စကားဝှက်",
            intro="မင်္ဂလာပါ {adminUsername} ရှင့်၊ စီမံခန့်ခွဲမှုစနစ် (BO) အကောင့်၏ ယာယီ စကားဝှက်ကို ထုတ်ပေးထားပါသည်။",
            blocks=[
                {"type": "infoTable", "rows": [["စီမံခန့်ခွဲသူ ID", "{adminUsername}"]]},
                {
                    "type": "code",
                    "label": "ယာယီ စကားဝှက်",
                    "value": "{temporaryPassword}",
                    "sub": "ပထမဝင်ရောက်ချိန်တွင် ပြောင်းရန် မဖြစ်မနေ",
                    "mono": True,
                },
                {
                    "type": "notice",
                    "tone": "negative",
                    "text": "ယာယီ စကားဝှက်ကို အခြားသူနှင့် မျှဝေမထားပါနှင့်။ ပထမဝင်ရောက်ချိန်တွင် စကားဝှက် ပြောင်းလဲမှု မဖြစ်မနေ လုပ်ဆောင်ပါမည်။",
                },
            ],
            ctas=[{"label": "စီမံခန့်ခွဲသူ ဝင်ရောက်ရန်", "href": "{boLoginUrl}", "kind": "primary"}],
        ),
        "en": _layout(
            subject="[TOPIK Myanmar BO] Temporary password notice",
            preheader="Temporary password for the admin system. You must change it on first sign-in.",
            eyebrow_ko="관리자 임시 비밀번호",
            eyebrow_en="ADMIN ACCESS",
            index_no="07",
            h1="Admin temporary password",
            intro="Dear {adminUsername}, a temporary password has been issued for your admin system (BO) account.",
            blocks=[
                {"type": "infoTable", "rows": [["Admin ID", "{adminUsername}"]]},
                {
                    "type": "code",
                    "label": "Temporary password",
                    "value": "{temporaryPassword}",
                    "sub": "Password change required on first sign-in",
                    "mono": True,
                },
                {
                    "type": "notice",
                    "tone": "negative",
                    "text": "Never share the temporary password with others. You will be required to change your password on first sign-in.",
                },
            ],
            ctas=[{"label": "Admin sign-in", "href": "{boLoginUrl}", "kind": "primary"}],
        ),
    },
    "board_refund_received": {
        "my": _layout(
            subject="[TOPIK Myanmar] {boardName} လက်ခံရရှိကြောင်း အတည်ပြုချက်",
            preheader="ရေးသားထားသော ပို့စ်ကို အောင်မြင်စွာ လက်ခံရရှိပါသည်။",
            eyebrow_ko="လက်ခံရရှိ အတည်ပြုချက်",
            eyebrow_en="SUBMISSION RECEIVED",
            index_no="08",
            h1="ပို့စ်ကို အောင်မြင်စွာ လက်ခံရရှိပါသည်",
            intro="မင်္ဂလာပါ {userName} ရှင့်၊ ရေးသားထားသော ပို့စ်ကို အောင်မြင်စွာ လက်ခံရရှိပါသည်။ ဆောင်ရွက်မှု အခြေအနေကို အီးမေးလ်နှင့် ဘုတ်မှတစ်ဆင့် အသိပေးပါမည်။",
            blocks=[
                {
                    "type": "infoTable",
                    "rows": [
                        ["ဘုတ်", "{boardName}"],
                        ["ခေါင်းစဉ်", "{postTitle}"],
                        ["လက်ခံနံပါတ်", "{postId}"],
                        ["လက်ခံချိန်", "{submittedAt}"],
                        ["ဆောင်ရွက်မှု အခြေအနေ", "လက်ခံရရှိ"],
                    ],
                },
            ],
            ctas=[{"label": "ပို့စ် ကြည့်ရန်", "href": "{postUrl}", "kind": "primary"}],
        ),
        "en": _layout(
            subject="[TOPIK Myanmar] {boardName} submission received",
            preheader="Your post has been successfully received.",
            eyebrow_ko="접수 확인",
            eyebrow_en="SUBMISSION RECEIVED",
            index_no="08",
            h1="Your post has been received",
            intro="Dear {userName}, your post has been successfully received. We will notify you of the processing status by email and on the board.",
            blocks=[
                {
                    "type": "infoTable",
                    "rows": [
                        ["Board", "{boardName}"],
                        ["Title", "{postTitle}"],
                        ["Reference no.", "{postId}"],
                        ["Submitted at", "{submittedAt}"],
                        ["Status", "Received"],
                    ],
                },
            ],
            ctas=[{"label": "View post", "href": "{postUrl}", "kind": "primary"}],
        ),
    },
    "board_admin_new_post": {
        "my": _layout(
            subject="[TOPIK Myanmar BO] အသစ် {boardName} လက်ခံရရှိ",
            preheader="ပို့စ်အသစ် လက်ခံရရှိပါသည်။ BO တွင် ဆောင်ရွက်ပါ။",
            eyebrow_ko="အသစ် လက်ခံရရှိ အသိပေးချက်",
            eyebrow_en="NEW SUBMISSION",
            index_no="09",
            h1="ပို့စ်အသစ် လက်ခံရရှိပါသည်",
            intro="ပို့စ်အသစ် လက်ခံရရှိပါသည်။ အောက်ပါ အချက်အလက်များကို စစ်ဆေးပြီး ဆောင်ရွက်ပါ။",
            blocks=[
                {
                    "type": "infoTable",
                    "rows": [
                        ["ရေးသားသူ", "{userName}"],
                        ["ဘုတ်", "{boardName}"],
                        ["အမျိုးအစား", "{category}"],
                        ["ခေါင်းစဉ်", "{postTitle}"],
                        ["လက်ခံချိန်", "{submittedAt}"],
                        ["လျှို့ဝှက်ပို့စ်", "{secretFlag}"],
                    ],
                },
                {
                    "type": "notice",
                    "tone": "info",
                    "text": "လျှို့ဝှက်ပို့စ်၏ အကြောင်းအရာကို အီးမေးလ်တွင် မပါဝင်ပါ။ အုပ်ချုပ်သူတွင် တိုက်ရိုက် စစ်ဆေးပါ။",
                },
            ],
            ctas=[{"label": "စီမံခန့်ခွဲရန်", "href": "{boPostUrl}", "kind": "primary"}],
        ),
        "en": _layout(
            subject="[TOPIK Myanmar BO] New {boardName} submission",
            preheader="A new post has been submitted. Please process it in BO.",
            eyebrow_ko="신규 접수 알림",
            eyebrow_en="NEW SUBMISSION",
            index_no="09",
            h1="A new post has been submitted",
            intro="A new post has been submitted. Please review the information below and process it.",
            blocks=[
                {
                    "type": "infoTable",
                    "rows": [
                        ["Author", "{userName}"],
                        ["Board", "{boardName}"],
                        ["Type", "{category}"],
                        ["Title", "{postTitle}"],
                        ["Submitted at", "{submittedAt}"],
                        ["Secret post", "{secretFlag}"],
                    ],
                },
                {
                    "type": "notice",
                    "tone": "info",
                    "text": "The body of a secret post is not included in this email. Please check it directly in admin.",
                },
            ],
            ctas=[{"label": "Manage in admin", "href": "{boPostUrl}", "kind": "primary"}],
        ),
    },
    "board_reply": {
        "my": _layout(
            subject="[TOPIK Myanmar] {boardName} အဖြေ/မှတ်ချက် အသိပေးချက်",
            preheader="ရေးသားထားသော ပို့စ်တွင် လုပ်ဆောင်ချက်အသစ် ရှိပါသည်။",
            eyebrow_ko="အဖြေ/မှတ်ချက် အသိပေးချက်",
            eyebrow_en="ACTIVITY",
            index_no="10",
            h1="အသစ် {activityType} တင်ထားပါသည်",
            intro="မင်္ဂလာပါ {userName} ရှင့်၊ ရေးသားထားသော ပို့စ်တွင် လုပ်ဆောင်ချက်အသစ် ရှိပါသည်။",
            blocks=[
                {
                    "type": "infoTable",
                    "rows": [
                        ["ဘုတ်", "{boardName}"],
                        ["ခေါင်းစဉ်", "{postTitle}"],
                        ["လုပ်ဆောင်ချက်", "{activityType}"],
                    ],
                },
                {
                    "type": "notice",
                    "tone": "info",
                    "text": "လျှို့ဝှက်ပို့စ်၏ အကြောင်းအရာကို အီးမေးလ်တွင် မပါဝင်ပါ။ ဝင်ရောက်ပြီး ဘုတ်တွင် စစ်ဆေးပါ။",
                },
            ],
            ctas=[{"label": "ပို့စ် ကြည့်ရန်", "href": "{postUrl}", "kind": "primary"}],
        ),
        "en": _layout(
            subject="[TOPIK Myanmar] {boardName} reply/comment notice",
            preheader="There is new activity on your post.",
            eyebrow_ko="답변/댓글 알림",
            eyebrow_en="ACTIVITY",
            index_no="10",
            h1="A new {activityType} has been posted",
            intro="Dear {userName}, there is new activity on your post.",
            blocks=[
                {
                    "type": "infoTable",
                    "rows": [
                        ["Board", "{boardName}"],
                        ["Title", "{postTitle}"],
                        ["Activity", "{activityType}"],
                    ],
                },
                {
                    "type": "notice",
                    "tone": "info",
                    "text": "The content of a secret post is not included in this email. Please sign in and check the board.",
                },
            ],
            ctas=[{"label": "View post", "href": "{postUrl}", "kind": "primary"}],
        ),
    },
    "notice_marketing": {
        "my": _layout(
            subject="[TOPIK Myanmar] ကြေညာချက်အသစ် အသိပေးချက်",
            preheader="ကြေညာချက်အသစ် တင်ထားပါသည်။",
            eyebrow_ko="ကြေညာချက်အသစ်",
            eyebrow_en="NOTICE",
            index_no="11",
            h1="ကြေညာချက်အသစ် တင်ထားပါသည်",
            intro="TOPIK Myanmar တွင် ကြေညာချက်အသစ် တင်ထားပါသည်။",
            blocks=[
                {
                    "type": "infoTable",
                    "rows": [
                        ["ခေါင်းစဉ်", "{noticeTitle}"],
                        ["အမျိုးအစား", "{noticeCategory}"],
                        ["တင်သည့်ရက်", "{publishedAt}"],
                    ],
                },
                {"type": "paragraph", "text": "ကြေညာချက် အပြည့်အစုံကို ဆိုက်တွင် စစ်ဆေးနိုင်ပါသည်။"},
                {
                    "type": "notice",
                    "tone": "info",
                    "text": "ဤအီးမေးလ်ကို ကြော်ငြာ အချက်အလက် လက်ခံရန် သဘောတူထားသော အဖွဲ့ဝင်များသို့ ပို့ထားပါသည်။",
                },
            ],
            ctas=[{"label": "ကြေညာချက် ကြည့်ရန်", "href": "{noticeUrl}", "kind": "primary"}],
        ),
        "en": _layout(
            subject="[TOPIK Myanmar] New notice",
            preheader="A new notice has been posted.",
            eyebrow_ko="새 공지사항",
            eyebrow_en="NOTICE",
            index_no="11",
            h1="A new notice has been posted",
            intro="A new notice has been posted on TOPIK Myanmar.",
            blocks=[
                {
                    "type": "infoTable",
                    "rows": [
                        ["Title", "{noticeTitle}"],
                        ["Category", "{noticeCategory}"],
                        ["Published", "{publishedAt}"],
                    ],
                },
                {"type": "paragraph", "text": "You can read the full notice on the website."},
                {
                    "type": "notice",
                    "tone": "info",
                    "text": "This email was sent to members who consented to receive marketing information.",
                },
            ],
            ctas=[{"label": "View notices", "href": "{noticeUrl}", "kind": "primary"}],
        ),
    },
    "account_status": {
        "my": _layout(
            subject="[TOPIK Myanmar] အဖွဲ့ဝင်အကောင့် {accountStatusLabel} အကြောင်းကြားချက်",
            preheader="သင့်အကောင့်ကို {accountStatusLabel} လုပ်ဆောင်ထားပါသည်။ အကြောင်းရင်းကို စစ်ဆေးပါ။",
            eyebrow_ko="အကောင့်အခြေအနေ",
            eyebrow_en="ACCOUNT STATUS",
            index_no="12",
            h1="အဖွဲ့ဝင်အကောင့်ကို {accountStatusLabel} လုပ်ဆောင်ပြီးပါပြီ",
            intro="မင်္ဂလာပါ {userName} ရှင့်၊ TOPIK Myanmar အဖွဲ့ဝင်အကောင့်ကို စီမံခန့်ခွဲသူက {accountStatusLabel} လုပ်ဆောင်ထားပါသည်။",
            blocks=[
                {
                    "type": "infoTable",
                    "rows": [
                        ["လုပ်ဆောင်ချက်", "{accountStatusLabel}"],
                        ["အကြောင်းရင်း", "{statusReason}"],
                        ["သက်တမ်းကာလ", "{statusUntil}"],
                    ],
                },
                {
                    "type": "notice",
                    "tone": "warn",
                    "showWhen": {"accountAction": "suspended"},
                    "text": "ရပ်ဆိုင်းကာလအတွင်း ဝင်ရောက်ခြင်း၊ စာရင်းသွင်းခြင်းနှင့် My Page အသုံးပြုခြင်းကို ကန့်သတ်ထားပါသည်။",
                },
                {
                    "type": "notice",
                    "tone": "negative",
                    "showWhen": {"accountAction": "withdrawn"},
                    "text": "အဖွဲ့ဝင်မှ ထွက်ခွာပါက လက်ရှိ စာရင်းသွင်းမှု {canceledApplications} ခု အလိုအလျောက် ပယ်ဖျက်ပါသည်။ ပြန်အမ်းငွေသည် စာမေးပွဲကြေးစည်းမျဉ်းအရ ဆောင်ရွက်ပါသည်။",
                },
                {
                    "type": "paragraph",
                    "text": "သင်တောင်းဆိုမထားသော လုပ်ဆောင်ချက်ဖြစ်ပါက ချက်ချင်း {supportEmail} သို့ ဆက်သွယ်ပါ။",
                },
            ],
            ctas=[],
        ),
        "en": _layout(
            subject="[TOPIK Myanmar] Account {accountStatusLabel} notice",
            preheader="Your membership account has been {accountStatusLabel}. Please review the reason.",
            eyebrow_ko="계정 상태",
            eyebrow_en="ACCOUNT STATUS",
            index_no="12",
            h1="Your account has been {accountStatusLabel}",
            intro="Dear {userName}, your TOPIK Myanmar membership account has been {accountStatusLabel} by an administrator.",
            blocks=[
                {
                    "type": "infoTable",
                    "rows": [
                        ["Action", "{accountStatusLabel}"],
                        ["Reason", "{statusReason}"],
                        ["Effective period", "{statusUntil}"],
                    ],
                },
                {
                    "type": "notice",
                    "tone": "warn",
                    "showWhen": {"accountAction": "suspended"},
                    "text": "While suspended, login, exam registration, and My Page access are restricted.",
                },
                {
                    "type": "notice",
                    "tone": "negative",
                    "showWhen": {"accountAction": "withdrawn"},
                    "text": "If withdrawn, {canceledApplications} in-progress application(s) were automatically cancelled. Refunds follow the fee policy. Re-registration with the same email may be restricted for 30 days.",
                },
                {
                    "type": "paragraph",
                    "text": "If you did not request this action, please contact us immediately at {supportEmail}.",
                },
            ],
            ctas=[],
        ),
    },
    "member_info_changed": {
        "my": _layout(
            subject="[TOPIK Myanmar] အဖွဲ့ဝင်အချက်အလက် ပြောင်းလဲမှု အကြောင်းကြားချက်",
            preheader="စီမံခန့်ခွဲသူက အဖွဲ့ဝင်အချက်အလက်ကို ပြင်ဆင်ထားပါသည်။",
            eyebrow_ko="အဖွဲ့ဝင်အချက်အလက် ပြောင်းလဲမှု",
            eyebrow_en="PROFILE UPDATE",
            index_no="13",
            h1="အဖွဲ့ဝင်အချက်အလက် ပြင်ဆင်ပြီးပါပြီ",
            intro="မင်္ဂလာပါ {userName} ရှင့်၊ TOPIK Myanmar လုပ်ငန်းဆောင်ရွက်သူက အဖွဲ့ဝင်အချက်အလက်ကို ပြင်ဆင်ထားပါသည်။",
            blocks=[
                {
                    "type": "infoTable",
                    "rows": [
                        ["ပြင်ဆင်သည့်အချိန်", "{changedAt}"],
                        ["လုပ်ဆောင်သူ", "{changedBy}"],
                        ["ပြင်ဆင်သည့်အကွက်", "{changedFieldsSummary}"],
                    ],
                },
                {
                    "type": "reasonBox",
                    "tone": "info",
                    "title": "ပြောင်းလဲမှုအသေးစိတ်",
                    "reason": "{changeDiffHtml}",
                },
            ],
            ctas=[
                {"label": "My Page", "href": "{myPageUrl}", "kind": "primary"},
                {"label": "စုံစမ်းမေးမြန်းရေး ဘုတ်", "href": "{supportBoardUrl}", "kind": "secondary"},
            ],
        ),
        "en": _layout(
            subject="[TOPIK Myanmar] Profile update notice",
            preheader="An administrator updated your membership profile. Please review the changes.",
            eyebrow_ko="회원정보 변경",
            eyebrow_en="PROFILE UPDATE",
            index_no="13",
            h1="Your profile has been updated",
            intro="Dear {userName}, a TOPIK Myanmar administrator updated your membership information.",
            blocks=[
                {
                    "type": "infoTable",
                    "rows": [
                        ["Updated at", "{changedAt}"],
                        ["Processed by", "{changedBy}"],
                        ["Fields changed", "{changedFieldsSummary}"],
                    ],
                },
                {
                    "type": "reasonBox",
                    "tone": "info",
                    "title": "Change details",
                    "reason": "{changeDiffHtml}",
                },
            ],
            ctas=[
                {"label": "My Page", "href": "{myPageUrl}", "kind": "primary"},
                {"label": "Inquiry board", "href": "{supportBoardUrl}", "kind": "secondary"},
            ],
        ),
    },
    "password_expiry_reminder": {
        "my": _layout(
            subject="[TOPIK Myanmar] စကားဝှက်ပြောင်းရန် အကြံပြုချက်",
            preheader="နောက်ဆုံးပြောင်းလဲမှု ၆ လ ကျော်ပါပြီ။ အကောင့်လုံခြုံရေးအတွက် စကားဝှက်ကို ပြောင်းပါ။",
            eyebrow_ko="စကားဝှက်မူဝါဒ",
            eyebrow_en="PASSWORD POLICY",
            index_no="14",
            h1="စကားဝှက်ပြောင်းရန် အကြံပြုပါသည်",
            intro="မင်္ဂလာပါ {userName} ရှင့်၊ နောက်ဆုံးပြောင်းလဲမှု {daysSincePwChange} ရက်အကြာတွင် ရောက်ရှိပါသည်။",
            blocks=[
                {
                    "type": "infoTable",
                    "rows": [
                        ["နောက်ဆုံးပြောင်းသည့်ရက်", "{lastPasswordChange}"],
                        ["ကြာမြင့်သည့်ရက်", "{daysSincePwChange} ရက်"],
                    ],
                },
                {
                    "type": "notice",
                    "tone": "warn",
                    "text": "အနည်းဆုံး ၈ လုံး၊ အင်္ဂလိပ်၊ နံပါတ်နှင့် အထူးအက္ခရာ ပေါင်းစပ်သော အသစ် စကားဝှက် အသုံးပြုရန် အကြံပြုပါသည်။",
                },
            ],
            ctas=[
                {"label": "စကားဝှက်ပြောင်းရန်", "href": "{passwordChangeUrl}", "kind": "primary"},
                {"label": "ဝင်ရောက်ရန်", "href": "{loginUrl}", "kind": "secondary"},
            ],
        ),
        "en": _layout(
            subject="[TOPIK Myanmar] Password change recommended",
            preheader="Six months have passed since your last password change. Please update your password.",
            eyebrow_ko="비밀번호 정책",
            eyebrow_en="PASSWORD POLICY",
            index_no="14",
            h1="We recommend changing your password",
            intro="Dear {userName}, {daysSincePwChange} days have passed since your last password change.",
            blocks=[
                {
                    "type": "infoTable",
                    "rows": [
                        ["Last changed", "{lastPasswordChange}"],
                        ["Days elapsed", "{daysSincePwChange} days"],
                    ],
                },
                {
                    "type": "notice",
                    "tone": "warn",
                    "text": "We recommend a new password of at least 8 characters with letters, numbers, and symbols.",
                },
            ],
            ctas=[
                {"label": "Change password", "href": "{passwordChangeUrl}", "kind": "primary"},
                {"label": "Sign in", "href": "{loginUrl}", "kind": "secondary"},
            ],
        ),
    },
}
