#!/usr/bin/env python3
"""把任务完成的通知发出去：优先飞书自定义机器人（FEISHU_WEBHOOK），否则退回 CSU 邮箱。

飞书自定义机器人（群机器人）：
  POST <webhook>  {"msg_type":"text","content":{"text":"..."}}
  返回 {"code":0,...} 才算送达（HTTP 200 也可能是 code≠0 的错误）。

邮箱：CSU_MAIL_ADDR / CSU_MAIL_AUTHCODE 走 smtp.office365.com:587 + STARTTLS。

用法：python3 notify.py "标题" "正文"     # 正文支持多行
"""
import json
import os
import smtplib
import ssl
import sys
import urllib.request
from email.message import EmailMessage


def send_feishu(webhook: str, title: str, body: str) -> bool:
    text = f"{title}\n\n{body}"
    req = urllib.request.Request(
        webhook,
        data=json.dumps({"msg_type": "text", "content": {"text": text}}).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            payload = json.loads(r.read().decode("utf-8", "replace") or "{}")
        code = payload.get("code", payload.get("StatusCode", -1))
        if code != 0:
            print(f"feishu rejected: {payload}", file=sys.stderr)
            return False
        print("sent via feishu")
        return True
    except Exception as exc:  # noqa: BLE001 - 发不出去就退回邮件
        print(f"feishu failed: {exc}", file=sys.stderr)
        return False


def send_mail(title: str, body: str) -> bool:
    addr = os.environ.get("CSU_MAIL_ADDR") or os.environ.get("ZOHO_MAIL_ADDR")
    code = os.environ.get("CSU_MAIL_AUTHCODE") or os.environ.get("ZOHO_MAIL_PASSWORD")
    if not addr or not code:
        print("no mail credentials", file=sys.stderr)
        return False
    # CSU 邮箱在 Office 365 上；ZOHO_* 那组对应 Zoho 的 SMTP。
    if os.environ.get("CSU_MAIL_ADDR"):
        host, port = "smtp.office365.com", 587
    else:
        host, port = "smtp.zoho.com", 587
    msg = EmailMessage()
    msg["From"] = addr
    msg["To"] = addr
    msg["Subject"] = title
    msg.set_content(body)
    with smtplib.SMTP(host, port, timeout=30) as s:
        s.ehlo()
        s.starttls(context=ssl.create_default_context())
        s.login(addr, code)
        s.send_message(msg)
    print(f"sent via mail to {addr}")
    return True


def main() -> int:
    title = sys.argv[1] if len(sys.argv) > 1 else "Adelie"
    body = sys.argv[2] if len(sys.argv) > 2 else ""
    hook = os.environ.get("FEISHU_WEBHOOK", "").strip()
    if hook and send_feishu(hook, title, body):
        return 0
    return 0 if send_mail(title, body) else 1


if __name__ == "__main__":
    sys.exit(main())
