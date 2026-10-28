#!/usr/bin/env bash
# One-time AWS setup: S3 bucket for reports + RDS PostgreSQL + SES email + SNS SMS + IAM policy.
# Requires the AWS CLI configured with `aws configure`.
set -euo pipefail

REGION="${AWS_REGION:-ap-south-1}"
BUCKET="${S3_BUCKET:-focuslink-ai-reports-$RANDOM}"
DB_ID="focuslink-db"
DB_USER="${DB_USER:-focuslink}"
DB_PASS="${DB_PASS:?Set DB_PASS to a strong password}"
SES_SENDER="${SES_SENDER:?Set SES_SENDER to the email address OTP emails are sent from}"

echo ">> Creating S3 bucket $BUCKET"
aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
  --create-bucket-configuration LocationConstraint="$REGION"
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

echo ">> Creating RDS PostgreSQL instance $DB_ID (takes ~5-10 min)"
aws rds create-db-instance --region "$REGION" \
  --db-instance-identifier "$DB_ID" --db-instance-class db.t3.micro \
  --engine postgres --allocated-storage 20 --db-name focuslink \
  --master-username "$DB_USER" --master-user-password "$DB_PASS" \
  --backup-retention-period 1 --no-multi-az

echo ">> Verifying $SES_SENDER in Amazon SES (click the link AWS emails to that address)"
aws sesv2 create-email-identity --email-identity "$SES_SENDER" --region "$REGION" || true
echo "   NOTE: new SES accounts are in the sandbox (can only email verified addresses)."
echo "   Request production access: SES console -> Account dashboard -> Request production access."

echo ">> Configuring Amazon SNS for transactional SMS"
aws sns set-sms-attributes --region "$REGION"   --attributes DefaultSMSType=Transactional,MonthlySpendLimit=5 || true
echo "   NOTE: SNS SMS also starts in a sandbox — add test numbers in SNS console -> Text messaging,"
echo "   or request production access. India requires DLT entity + template registration."

echo ">> Creating IAM policy for the app"
cat > /tmp/focuslink-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {"Effect": "Allow", "Action": ["s3:PutObject", "s3:GetObject"], "Resource": "arn:aws:s3:::$BUCKET/*"},
    {"Effect": "Allow", "Action": ["comprehend:DetectSentiment"], "Resource": "*"},
    {"Effect": "Allow", "Action": ["ses:SendEmail", "ses:SendRawEmail"], "Resource": "*"},
    {"Effect": "Allow", "Action": ["sns:Publish"], "Resource": "*"}
  ]
}
EOF
aws iam create-policy --policy-name FocusLinkAIPolicy --policy-document file:///tmp/focuslink-policy.json

aws rds wait db-instance-available --db-instance-identifier "$DB_ID" --region "$REGION"
ENDPOINT=$(aws rds describe-db-instances --db-instance-identifier "$DB_ID" --region "$REGION" \
  --query "DBInstances[0].Endpoint.Address" --output text)

echo
echo "Done. Put these in backend/.env:"
echo "AWS_ENABLED=true"
echo "AWS_REGION=$REGION"
echo "S3_BUCKET=$BUCKET"
echo "SES_SENDER=$SES_SENDER"
echo "DATABASE_URL_OVERRIDE=postgresql+psycopg2://$DB_USER:$DB_PASS@$ENDPOINT:5432/focuslink"
