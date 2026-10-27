"""AWS integrations: S3 for session reports, Amazon Comprehend for sentiment.

Everything degrades gracefully when AWS_ENABLED=false or credentials are missing.
"""
import json
import logging

from backend.config import settings

log = logging.getLogger("focuslink.aws")

_s3 = None
_comprehend = None


def _client(name: str):
    import boto3

    return boto3.client(name, region_name=settings.AWS_REGION)


def s3():
    global _s3
    if _s3 is None and settings.AWS_ENABLED:
        _s3 = _client("s3")
    return _s3


def comprehend():
    global _comprehend
    if _comprehend is None and settings.AWS_ENABLED:
        _comprehend = _client("comprehend")
    return _comprehend


def upload_session_report(user_id: int, session_id: int, report: dict) -> str | None:
    """Upload a JSON session report to S3 and return a 7-day pre-signed URL."""
    client = s3()
    if client is None:
        return None
    key = f"reports/user_{user_id}/session_{session_id}.json"
    try:
        client.put_object(
            Bucket=settings.S3_BUCKET,
            Key=key,
            Body=json.dumps(report, default=str, indent=2).encode(),
            ContentType="application/json",
        )
        return client.generate_presigned_url(
            "get_object", Params={"Bucket": settings.S3_BUCKET, "Key": key}, ExpiresIn=7 * 24 * 3600
        )
    except Exception as exc:  # network / permission problems should never break the app
        log.warning("S3 upload failed: %s", exc)
        return None


def comprehend_sentiment(text: str) -> tuple[str, float] | None:
    client = comprehend()
    if client is None:
        return None
    try:
        res = client.detect_sentiment(Text=text[:4500], LanguageCode="en")
        label = res["Sentiment"].lower()
        scores = res["SentimentScore"]
        score = scores["Positive"] - scores["Negative"]
        return ("neutral" if label == "mixed" else label), score
    except Exception as exc:
        log.warning("Comprehend failed, falling back to VADER: %s", exc)
        return None
