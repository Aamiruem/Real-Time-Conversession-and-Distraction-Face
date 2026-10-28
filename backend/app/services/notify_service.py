"""Delivers one-time codes: email through Amazon SES, SMS through Amazon SNS.

When AWS is not configured (local development) the code is logged instead, and the caller can
return it to the UI because OTP_DEV_MODE is on. In production a delivery failure is an error.
"""
import logging

from app.config import settings
from app.services.aws_service import _client

log = logging.getLogger("focuslink.notify")

PURPOSE_TEXT = {
    "verify": "verify your account",
    "login": "sign in",
    "reset": "reset your password",
}


def _email_html(code: str, purpose: str) -> str:
    return f"""
<div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:480px;margin:auto;padding:24px;
            border:1px solid #e2e8f0;border-radius:16px">
  <h2 style="margin:0 0 8px;color:#0f172a">🎯 {settings.APP_NAME}</h2>
  <p style="color:#334155">Use this code to {PURPOSE_TEXT[purpose]}:</p>
  <p style="font-size:32px;letter-spacing:8px;font-weight:700;color:#0ea5e9;margin:16px 0">{code}</p>
  <p style="color:#64748b;font-size:13px">It expires in {settings.OTP_TTL_MINUTES} minutes.
     If you didn't request it, you can ignore this email.</p>
</div>"""


def send_email(to: str, code: str, purpose: str) -> bool:
    if not (settings.AWS_ENABLED and settings.SES_SENDER):
        return False
    try:
        _client("ses").send_email(
            Source=f"{settings.APP_NAME} <{settings.SES_SENDER}>",
            Destination={"ToAddresses": [to]},
            Message={
                "Subject": {"Data": f"{code} is your {settings.APP_NAME} code"},
                "Body": {
                    "Text": {"Data": f"Your code to {PURPOSE_TEXT[purpose]}: {code} "
                                     f"(expires in {settings.OTP_TTL_MINUTES} min)"},
                    "Html": {"Data": _email_html(code, purpose)},
                },
            },
        )
        return True
    except Exception as exc:
        log.warning("SES send to %s failed: %s", to, exc)
        return False


def send_sms(phone: str, code: str, purpose: str) -> bool:
    if not settings.AWS_ENABLED:
        return False
    try:
        _client("sns").publish(
            PhoneNumber=phone,
            Message=f"{code} is your {settings.APP_NAME} code to {PURPOSE_TEXT[purpose]}. "
                    f"Valid {settings.OTP_TTL_MINUTES} min. Don't share it.",
            MessageAttributes={
                "AWS.SNS.SMS.SMSType": {"DataType": "String", "StringValue": "Transactional"},
                "AWS.SNS.SMS.SenderID": {"DataType": "String", "StringValue": settings.SNS_SENDER_ID},
            },
        )
        return True
    except Exception as exc:
        log.warning("SNS SMS to %s failed: %s", phone, exc)
        return False


def deliver(channel: str, target: str, code: str, purpose: str) -> bool:
    sent = send_email(target, code, purpose) if channel == "email" else send_sms(target, code, purpose)
    if not sent:
        log.warning("[OTP %s] %s code for %s: %s", "DEV" if settings.OTP_DEV_MODE else "UNSENT",
                    channel, target, code if settings.OTP_DEV_MODE else "******")
    return sent
