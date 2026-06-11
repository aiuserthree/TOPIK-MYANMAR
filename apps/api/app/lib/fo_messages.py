"""FO-facing API error/info messages (KO / MY / EN)."""

from __future__ import annotations

from app.lib.locale import normalize_locale

_CATALOG: dict[str, dict[str, str]] = {
    "account_inactive": {
        "ko": "이용이 제한된 계정입니다.",
        "my": "ဤအကောင့်ကို အသုံးပြု၍မရပါ။",
        "en": "This account is restricted.",
    },
    "rejoin_restricted": {
        "ko": "탈퇴 후 {days}일간 동일 이메일로 재가입할 수 없습니다. ({remaining}일 후 가능)",
        "my": "ထွက်ပြီးနောက် {days} ရက်အတွင်း တူညီသော အီးမေးလ်ဖြင့် ပြန်မှတ်ပုံတင်၍ မရပါ။ ({remaining} ရက်အကြာ ခဏစောင့်ပါ)",
        "en": "You cannot re-register with this email for {days} days after withdrawal. (Available in {remaining} days)",
    },
    "email_already_registered": {
        "ko": "이미 가입된 이메일입니다.",
        "my": "ဤအီးမေးလ်ဖြင့် မှတ်ပုံတင်ပြီးသားဖြစ်သည်။",
        "en": "This email is already registered.",
    },
    "google_login_disabled": {
        "ko": "Google 로그인이 설정되지 않았습니다.",
        "my": "Google ဝင်ရောက်မှု မပြင်ဆင်ရသေးပါ။",
        "en": "Google sign-in is not configured.",
    },
    "google_token_required": {
        "ko": "Google 인증 토큰이 필요합니다.",
        "my": "Google အတည်ပြကန် လိုအပ်သည်။",
        "en": "A Google authentication token is required.",
    },
    "google_auth_failed": {
        "ko": "Google 인증에 실패했습니다.",
        "my": "Google အတည်ပြုမှု မအောင်မြင်ပါ။",
        "en": "Google authentication failed.",
    },
    "google_account_incomplete": {
        "ko": "Google 계정 정보가 부족합니다.",
        "my": "Google အကောင့် အချက်အလက် မပြည့်စုံပါ။",
        "en": "Google account information is incomplete.",
    },
    "google_email_unverified": {
        "ko": "이메일이 인증되지 않은 Google 계정입니다.",
        "my": "အီးမေးလ် အတည်မပြုရသေးသော Google အကောင့်ဖြစ်သည်။",
        "en": "This Google account email is not verified.",
    },
    "otp_exceeded": {
        "ko": "인증코드 확인에 {max_fail}회 실패했습니다. 인증코드를 다시 발송해 주세요.",
        "my": "အတည်ပြုကုဒ် {max_fail} ကြိမ် မအောင်မြင်ပါ။ ကုဒ်အသစ် ပြန်ပို့ပါ။",
        "en": "{max_fail} failed code attempts. Please resend the verification code.",
    },
    "otp_invalid_remaining": {
        "ko": "인증코드가 올바르지 않거나 만료되었습니다.",
        "my": "အတည်ပြုကုဒ် မမှန်ပါ သို့မဟုတ် သက်တမ်းကုန်ပြီ။",
        "en": "Invalid or expired verification code.",
    },
    "invalid_credentials": {
        "ko": "이메일 또는 비밀번호가 올바르지 않습니다.",
        "my": "အီးမေးလ် သို့မဟုတ် စကားဝှက် မမှန်ပါ။",
        "en": "Incorrect email or password.",
    },
    "account_locked": {
        "ko": "로그인 {max_fail}회 실패로 계정이 잠겼습니다. {lock_minutes}분 후 다시 시도해 주세요.",
        "my": "ဝင်ရောက်မှု {max_fail} ကြိမ် မအောင်မြင်သဖြင့် အကောင့် ပိတ်ထားသည်။ {lock_minutes} မိနစ် အကြာ ပြန်စမ်းပါ။",
        "en": "Account locked after {max_fail} failed sign-in attempts. Try again in {lock_minutes} minutes.",
    },
    "birth_invalid": {
        "ko": "생년월일 형식이 올바르지 않습니다.",
        "my": "မွေးနေ့ ပုံစံ မမှန်ပါ။",
        "en": "Invalid date of birth format.",
    },
    "invalid_refresh_token": {
        "ko": "유효하지 않은 refresh token입니다.",
        "my": "မမှန်သော refresh token ဖြစ်သည်။",
        "en": "Invalid refresh token.",
    },
    "user_not_found": {
        "ko": "사용자를 찾을 수 없습니다.",
        "my": "အသုံးပြုသူ မတွေ့ပါ။",
        "en": "User not found.",
    },
    "email_invalid": {
        "ko": "유효한 이메일을 입력해 주세요.",
        "my": "မှန်ကန်သော အီးမေးလ် ထည့်ပါ။",
        "en": "Please enter a valid email address.",
    },
    "invalid_code": {
        "ko": "인증코드가 올바르지 않거나 만료되었습니다.",
        "my": "အတည်ပြုကုဒ် မမှန်ပါ သို့မဟုတ် သက်တမ်းကုန်ပြီ။",
        "en": "Invalid or expired verification code.",
    },
    "email_verify_required": {
        "ko": "이메일 인증이 필요합니다.",
        "my": "အီးမေးလ် အတည်ပြုမှု လိုအပ်သည်။",
        "en": "Email verification is required.",
    },
    "password_rule": {
        "ko": "비밀번호는 8자 이상, 영문·숫자·특수문자를 포함해야 합니다.",
        "my": "စကားဝှက်သည် အနည်းဆုံး ၈ လုံး၊ အက္ခရာ·ဂဏန်း·သင်္ကေတ ပါရမည်။",
        "en": "Password must be 8+ characters and include letters, numbers, and symbols.",
    },
    "password_mismatch": {
        "ko": "비밀번호 확인이 일치하지 않습니다.",
        "my": "စကားဝှက် အတည်ပြုချက် မကိုက်ညီပါ။",
        "en": "Password confirmation does not match.",
    },
    "age_restricted": {
        "ko": "만 {age}세 미만은 회원가입할 수 없습니다.",
        "my": "အသက် {age} နှစ်အောက် မှတ်ပုံတင်၍ မရပါ။",
        "en": "You must be at least {age} years old to sign up.",
    },
    "roster_codes": {
        "ko": "직업·응시동기·응시목적을 선택해 주세요.",
        "my": "အလုပ်အကိုင်·ဖြေဆိုရခြင်း အကြောင်းရင်း·ရည်ရွယ်ချက်ကို ရွေးပါ။",
        "en": "Please select occupation, reason, and purpose.",
    },
    "job_code_invalid": {
        "ko": "직업 코드가 올바르지 않습니다.",
        "my": "အလုပ်အကိုင် ကုဒ် မမှန်ပါ။",
        "en": "Invalid occupation code.",
    },
    "motive_code_invalid": {
        "ko": "응시동기 코드가 올바르지 않습니다.",
        "my": "ဖြေဆိုရခြင်း အကြောင်းရင်း ကုဒ် မမှန်ပါ။",
        "en": "Invalid reason code.",
    },
    "purpose_code_invalid": {
        "ko": "응시목적 코드가 올바르지 않습니다.",
        "my": "ဖြေဆိုရခြင်း ရည်ရွယ်ချက် ကုဒ် မမှန်ပါ။",
        "en": "Invalid purpose code.",
    },
    "terms_required": {
        "ko": "필수 약관({names})에 동의해 주세요.",
        "my": "လိုအပ်သော စည်းကမ်း ({names}) ကို သဘောတူပါ။",
        "en": "Please agree to the required terms ({names}).",
    },
    "photo_too_large": {
        "ko": "증명사진은 2MB 이하로 업로드해 주세요.",
        "my": "သက်သေခံ ဓာတ်ပုံကို 2MB အောက် တင်ပါ။",
        "en": "ID photo must be 2MB or smaller.",
    },
    "password_rules_check": {
        "ko": "비밀번호 규칙을 확인해 주세요.",
        "my": "စကားဝှက် စည်းမျဉ်း စစ်ဆေးပါ။",
        "en": "Please check the password rules.",
    },
    "reset_token_invalid": {
        "ko": "재설정 토큰이 유효하지 않습니다.",
        "my": "ပြန်လည်သတ်မှတ်ရန် တိုကင် မမှန်ပါ။",
        "en": "Invalid reset token.",
    },
    "new_password_same": {
        "ko": "새 비밀번호는 현재 비밀번호와 달라야 합니다.",
        "my": "စကားဝှက်အသစ်သည် လက်ရှိစကားဝှက်နှင့် မတူရပါ။",
        "en": "New password must differ from the current one.",
    },
    "draft_not_found": {
        "ko": "임시 저장된 접수 정보가 없습니다.",
        "my": "ယာယီသိမ်းထားသော လျှောက်လွှာ အချက်အလက် မရှိပါ။",
        "en": "No saved draft found.",
    },
    "select_level": {
        "ko": "응시 급수를 선택해 주세요.",
        "my": "ဖြေဆိုအဆင့် ရွေးပါ။",
        "en": "Please select a test level.",
    },
    "photo_checklist": {
        "ko": "사진 확인 체크리스트에 동의해 주세요.",
        "my": "ဓာတ်ပုံ စစ်ဆေးစာရင်းကို သဘောတူပါ။",
        "en": "Please confirm the photo checklist.",
    },
    "round_not_open": {
        "ko": "접수 가능한 회차가 아닙니다.",
        "my": "လျှောက်ထားနိုင်သော အကြိမ်ရေ မဟုတ်ပါ။",
        "en": "This session is not open for registration.",
    },
    "venue_locked": {
        "ko": "다른 급수가 진행 중일 때는 기존 시험장으로만 접수할 수 있습니다.",
        "my": "အခြားအဆင့် ဆောင်ရွက်ဆဲဖြစ်ပါက ယခင်စာစစ်ဌာနဖြင့် သာ လျှောက်ထားနိုင်သည်။",
        "en": "While another level is in progress, you must use the same exam venue.",
    },
    "invalid_venue": {
        "ko": "유효하지 않은 시험장입니다.",
        "my": "မမှန်သော စာစစ်ဌာန ဖြစ်သည်။",
        "en": "Invalid exam venue.",
    },
    "invalid_venue_selected": {
        "ko": "선택한 시험장을 사용할 수 없습니다.",
        "my": "ရွေးချယ်ထားသော စာစစ်ဌာနကို အသုံးပြု၍ မရပါ။",
        "en": "The selected venue cannot be used.",
    },
    "reapply_not_found": {
        "ko": "재접수 가능한 반려 접수가 없습니다.",
        "my": "ပြန်လျှောက်ထားနိုင်သော ပယ်ချလျှောက်လွှာ မရှိပါ။",
        "en": "No rejected application eligible for re-application.",
    },
    "level_record_missing": {
        "ko": "{level} 접수 내역이 없습니다.",
        "my": "{level} လျှောက်လွှာ မှတ်တမ်း မရှိပါ။",
        "en": "No registration record for {level}.",
    },
    "level_reapply_locked": {
        "ko": "{level}은(는) 심사 진행 중이어서 재접수할 수 없습니다.",
        "my": "{level} သည် စိစစ်နေဆဲဖြစ်သဖြင့် ပြန်လျှောက်၍ မရပါ။",
        "en": "{level} is under review and cannot be re-applied.",
    },
    "level_reapply_needed": {
        "ko": "{levels}은(는) 재접수가 필요합니다. 마이페이지에서 재접수를 이용해 주세요.",
        "my": "{levels} အတွက် ပြန်လျှောက်ထားရန် လိုအပ်သည်။ ကျွန်ုပ်စာမျက်နှာမှ ပြန်လျှောက်ပါ။",
        "en": "{levels} require re-application. Use re-apply on My page.",
    },
    "level_in_progress": {
        "ko": "{levels}은(는) 이미 접수 진행 중입니다.",
        "my": "{levels} သည် လျှောက်ထားမှု ဆောင်ရွက်ဆဲ ရှိပြီးသားဖြစ်သည်။",
        "en": "{levels} already have a registration in progress.",
    },
    "already_submitted_round": {
        "ko": "이미 해당 회차에 접수한 내역이 있습니다.",
        "my": "ဤအကြိမ်ရေတွင် လျှောက်ထားမှု ရှိပြီးသားဖြစ်သည်။",
        "en": "You already have a registration for this session.",
    },
    "application_not_found": {
        "ko": "접수 내역을 찾을 수 없습니다.",
        "my": "လျှောက်လွှာ မှတ်တမ်း မတွေ့ပါ။",
        "en": "Application not found.",
    },
    "already_cancelled": {
        "ko": "이미 취소된 접수입니다.",
        "my": "ပယ်ဖျက်ပြီးသား လျှောက်လွှာဖြစ်သည်။",
        "en": "This registration is already cancelled.",
    },
    "cannot_cancel_paid": {
        "ko": "수납 완료된 접수는 취소할 수 없습니다.",
        "my": "ကြေးသွင်းပြီးသော လျှောက်လွှာကို ပယ်ဖျက်၍ မရပါ။",
        "en": "Paid registrations cannot be cancelled.",
    },
    "google_not_linked": {
        "ko": "Google 계정이 연동되지 않았습니다.",
        "my": "Google အကောင့် ချိတ်ဆက်ထားခြင်း မရှိပါ။",
        "en": "No Google account is linked.",
    },
    "google_account_mismatch": {
        "ko": "Google 계정이 일치하지 않습니다.",
        "my": "Google အကောင့် မကိုက်ညီပါ။",
        "en": "Google account does not match.",
    },
    "google_verify_expired": {
        "ko": "Google 인증이 만료되었습니다. 다시 시도해 주세요.",
        "my": "Google အတည်ပြုမှု သက်တမ်းကုန်ပြီ။ ပြန်စမ်းပါ။",
        "en": "Google authentication expired. Please try again.",
    },
    "password_wrong": {
        "ko": "비밀번호가 올바르지 않습니다.",
        "my": "စကားဝှက် မမှန်ပါ။",
        "en": "Incorrect password.",
    },
    "verify_identity_google": {
        "ko": "Google 계정으로 본인 확인이 필요합니다.",
        "my": "Google အကောင့်ဖြင့် ကိုယ်တိုင် အတည်ပြုရန် လိုအပ်သည်။",
        "en": "Verify your identity with your Google account.",
    },
    "password_required": {
        "ko": "비밀번호를 입력해 주세요.",
        "my": "စကားဝှက် ထည့်ပါ။",
        "en": "Please enter your password.",
    },
    "verify_identity_required": {
        "ko": "본인 확인이 필요합니다.",
        "my": "ကိုယ်တိုင် အတည်ပြုမှု လိုအပ်သည်။",
        "en": "Identity verification is required.",
    },
    "current_password_wrong": {
        "ko": "현재 비밀번호가 올바르지 않습니다.",
        "my": "လက်ရှိ စကားဝှက် မမှန်ပါ။",
        "en": "Current password is incorrect.",
    },
    "post_not_found": {
        "ko": "게시글을 찾을 수 없습니다.",
        "my": "ပို့စ် မတွေ့ပါ။",
        "en": "Post not found.",
    },
    "cannot_edit_replied": {
        "ko": "답변이 등록된 글은 수정할 수 없습니다.",
        "my": "အဖြေပြီးသား ပို့စ်ကို ပြင်၍ မရပါ။",
        "en": "Posts with an official reply cannot be edited.",
    },
    "title_too_long": {
        "ko": "제목을 100자 이내로 입력해 주세요.",
        "my": "ခေါင်းစဉ်ကို စာလုံး ၁၀၀ အတွင်း ထည့်ပါ။",
        "en": "Title must be within 100 characters.",
    },
    "body_too_short": {
        "ko": "내용을 10자 이상 입력해 주세요.",
        "my": "အကြောင်းအရာကို စာလုံး ၁၀ အထက် ထည့်ပါ။",
        "en": "Content must be at least 10 characters.",
    },
    "secret_pw_min": {
        "ko": "비밀글 비밀번호를 4자 이상 입력해 주세요.",
        "my": "လျှို့ဝှက်ပို့စ် စကားဝှက်ကို အနည်းဆုံး ၄ လုံး ထည့်ပါ။",
        "en": "Secret-post password must be at least 4 characters.",
    },
    "cannot_delete_replied": {
        "ko": "답변이 등록된 글은 삭제할 수 없습니다.",
        "my": "အဖြေပြီးသား ပို့စ်ကို ဖျက်၍ မရပါ။",
        "en": "Posts with an official reply cannot be deleted.",
    },
    "invalid_file_type": {
        "ko": "jpg, png, pdf 파일만 업로드할 수 있습니다.",
        "my": "jpg, png, pdf ဖိုင်သာ တင်နိုင်သည်။",
        "en": "Only jpg, png, and pdf files can be uploaded.",
    },
    "file_too_large": {
        "ko": "파일 크기는 {max_mb}MB 이하여야 합니다.",
        "my": "ဖိုင်အရွယ်အစား {max_mb}MB အောက် ဖြစ်ရမည်။",
        "en": "File size must be {max_mb}MB or smaller.",
    },
    "secret_forbidden": {
        "ko": "작성자만 열람할 수 있는 비밀글입니다.",
        "my": "ရေးသားသူသာ ကြည့်နိုင်သော လျှို့ဝှက်ပို့စ်ဖြစ်သည်။",
        "en": "This secret post can only be viewed by the author.",
    },
    "secret_locked": {
        "ko": "비밀번호 입력 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요.",
        "my": "စကားဝှက် ထည့်သွင်းမှု များလွန်းသည်။ ခဏနေ ပြန်စမ်းပါ။",
        "en": "Too many password attempts. Please try again later.",
    },
    "secret_lock_minutes": {
        "ko": "비밀번호 {max_fail}회 오류로 {minutes}분간 잠겼습니다.",
        "my": "စကားဝှက် {max_fail} ကြိမ် မှားသဖြင့် {minutes} မိနစ် ပိတ်ထားသည်။",
        "en": "Locked for {minutes} minutes after {max_fail} wrong passwords.",
    },
    "invalid_secret_password": {
        "ko": "비밀번호가 올바르지 않습니다. (남은 시도 {remaining}회)",
        "my": "စကားဝှက် မမှန်ပါ။ (ကျန် {remaining} ကြိမ်)",
        "en": "Incorrect password. ({remaining} attempts left)",
    },
    "secret_only_author_view": {
        "ko": "비밀글입니다. 작성자만 열람할 수 있습니다.",
        "my": "လျှို့ဝှက်ပို့စ်ဖြစ်သည်။ ရေးသားသူသာ ကြည့်နိုင်သည်။",
        "en": "This is a secret post. Only the author can view it.",
    },
    "secret_only_author_comment": {
        "ko": "비밀글입니다. 작성자만 댓글을 작성할 수 있습니다.",
        "my": "လျှို့ဝှက်ပို့စ်ဖြစ်သည်။ ရေးသားသူသာ မှတ်ချက် ရေးနိုင်သည်။",
        "en": "This is a secret post. Only the author can comment.",
    },
    "comment_required": {
        "ko": "댓글 내용을 입력해 주세요.",
        "my": "မှတ်ချက် အကြောင်းအရာ ထည့်ပါ။",
        "en": "Please enter a comment.",
    },
    "invalid_parent_comment": {
        "ko": "parent_comment_id가 올바르지 않습니다.",
        "my": "parent_comment_id မမှန်ပါ။",
        "en": "Invalid parent_comment_id.",
    },
    "otp_invalid_short": {
        "ko": "인증코드가 올바르지 않습니다.",
        "my": "အတည်ပြုကုဒ် မမှန်ပါ။",
        "en": "Incorrect verification code.",
    },
    "otp_remaining_suffix": {
        "ko": "({remaining}회 남음)",
        "my": "(ကျန် {remaining} ကြိမ်)",
        "en": "({remaining} attempts left)",
    },
    "google_password_change_blocked": {
        "ko": "Google 계정은 비밀번호 변경을 사용할 수 없습니다.",
        "my": "Google အကောင့်တွင် စကားဝှက် ပြောင်းလဲခြင်း မရပါ။",
        "en": "Password change is not available for Google accounts.",
    },
    "notice_not_found": {
        "ko": "공지를 찾을 수 없습니다.",
        "my": "ကြေညာချက် မတွေ့ပါ။",
        "en": "Notice not found.",
    },
    "terms_not_found": {
        "ko": "약관을 찾을 수 없습니다.",
        "my": "စည်းကမ်း မတွေ့ပါ။",
        "en": "Terms not found.",
    },
    "file_unauthorized": {
        "ko": "인증이 필요합니다.",
        "my": "အတည်ပြုမှု လိုအပ်သည်။",
        "en": "Authentication required.",
    },
    "file_not_found": {
        "ko": "파일을 찾을 수 없습니다.",
        "my": "ဖိုင် မတွေ့ပါ။",
        "en": "File not found.",
    },
    "file_unavailable": {
        "ko": "파일을 사용할 수 없습니다.",
        "my": "ဖိုင်ကို အသုံးပြု၍ မရပါ။",
        "en": "File is unavailable.",
    },
    "file_forbidden": {
        "ko": "파일 접근 권한이 없습니다.",
        "my": "ဖိုင် ဝင်ရောက်ခွင့် မရှိပါ။",
        "en": "You do not have permission to access this file.",
    },
    "attach_max_size": {
        "ko": "5MB 이하의 파일만 업로드할 수 있습니다.",
        "my": "5MB အောက် ဖိုင်သာ တင်နိုင်သည်။",
        "en": "Only files 5MB or smaller can be uploaded.",
    },
    "attach_upload_failed": {
        "ko": "파일을 업로드할 수 없습니다.",
        "my": "ဖိုင် တင်၍ မရပါ။",
        "en": "Could not upload the file.",
    },
    "post_submitted": {
        "ko": "접수되었습니다.",
        "my": "လျှောက်ထားပြီးပါပြီ။",
        "en": "Submitted.",
    },
    "post_updated": {
        "ko": "수정되었습니다.",
        "my": "ပြင်ဆင်ပြီးပါပြီ။",
        "en": "Updated.",
    },
    "post_deleted": {
        "ko": "삭제되었습니다.",
        "my": "ဖျက်ပြီးပါပြီ။",
        "en": "Deleted.",
    },
}

_TERM_LABELS = {
    "ko": {"service": "서비스 이용약관", "privacy": "개인정보 처리"},
    "my": {"service": "ဝန်ဆောင်မှု စည်းကမ်း", "privacy": "ကိုယ်ရေးအချက်အလက် ကိုင်တွယ်မှု"},
    "en": {"service": "Terms of Service", "privacy": "Privacy Policy"},
}

_LEVEL_LABELS = {
    "ko": {"I": "TOPIK Ⅰ", "II": "TOPIK Ⅱ"},
    "my": {"I": "TOPIK Ⅰ", "II": "TOPIK Ⅱ"},
    "en": {"I": "TOPIK I", "II": "TOPIK II"},
}


def level_label(level: str, lang: str | None = None) -> str:
    lang = normalize_locale(lang)
    return _LEVEL_LABELS.get(lang, _LEVEL_LABELS["ko"]).get(level, level)


def fo_message(key: str, lang: str | None = None, **params: str | int) -> str:
    lang = normalize_locale(lang)
    row = _CATALOG.get(key) or _CATALOG.get("user_not_found")
    text = (row or {}).get(lang) or (row or {}).get("ko") or key
    for k, v in params.items():
        text = text.replace("{" + k + "}", str(v))
    return text


def terms_missing_message(missing: list[str], lang: str | None = None) -> str:
    lang = normalize_locale(lang)
    labels = _TERM_LABELS.get(lang, _TERM_LABELS["ko"])
    names = "·".join(labels.get(t, t) for t in missing)
    return fo_message("terms_required", lang, names=names)
