"""Coremail 邮箱命令行工具 —— 走 IMAP/SMTP + 客户端专用密码，不经过统一身份认证（CAS）。

凭证（环境变量）：
    CSU_MAIL_ADDR        邮箱地址，如 1234567890@csu.edu.cn   ← 必填，不写死在代码里
    CSU_MAIL_AUTHCODE    客户端专用密码（App Password）        ← 必填，放在密钥库里
    CSU_MAIL_IMAP_HOST   默认 imap.csu.edu.cn
    CSU_MAIL_SMTP_HOST   默认 smtp.csu.edu.cn

没有专用密码就去网页邮箱「设置 → 个人信息 → 邮箱密码 → 客户端专用密码」点虚线 "+" 生成一个
（密码串只在生成时显示一次，不需要短信验证）。

用法：
    python mail.py check                       # 连通性自检（IMAP + SMTP 登录）
    python mail.py list [文件夹] [条数]         # 默认 INBOX 最近 10 封
    python mail.py search <关键词> [文件夹] [条数]
    python mail.py read <序号> [文件夹]         # 打印邮件正文
    python mail.py send --to a@b.com --subject 主题 [--body 正文 | --body-file f]
                       [--attach 文件]         # 发信并留一份到「已发送」
"""
import argparse
import email
import imaplib
import os
import ssl
import smtplib
import sys
import time
from email.header import decode_header, make_header
from email.message import EmailMessage
from email.utils import formatdate

IMAP_HOST = os.environ.get("CSU_MAIL_IMAP_HOST", "imap.csu.edu.cn")
IMAP_PORT = int(os.environ.get("CSU_MAIL_IMAP_PORT", "993"))
SMTP_HOST = os.environ.get("CSU_MAIL_SMTP_HOST", "smtp.csu.edu.cn")
SMTP_PORT = int(os.environ.get("CSU_MAIL_SMTP_PORT", "465"))
SENT = os.environ.get("CSU_MAIL_SENT_FOLDER", "Sent Items")

_ADDR = ""


def addr() -> str:
    a = _ADDR or os.environ.get("CSU_MAIL_ADDR", "").strip()
    if not a:
        sys.exit("缺少邮箱地址：设置环境变量 CSU_MAIL_ADDR，或用 --addr 指定")
    return a


def code() -> str:
    c = os.environ.get("CSU_MAIL_AUTHCODE", "").strip()
    if not c:
        sys.exit("缺少环境变量 CSU_MAIL_AUTHCODE（客户端专用密码）—— 在邮箱「设置 → 个人信息 → 邮箱密码 → 客户端专用密码」生成一条")
    return c


def _ctx() -> ssl.SSLContext:
    # 学校 IMAP 证书的 CN 与主机名不一致，跳过校验（Coremail 自身仍是 TLS 加密）
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def imap():
    m = imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT, ssl_context=_ctx())
    m.login(addr(), code())
    return m


def dec(s) -> str:
    if not s:
        return ""
    try:
        return str(make_header(decode_header(s)))
    except Exception:
        return s


def _mb(folder: str) -> str:
    """IMAP 文件夹名含空格时必须加引号。"""
    if folder.startswith('"') or not any(c in folder for c in " \t"):
        return folder
    return '"%s"' % folder


def body_text(msg) -> str:
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                return part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", "ignore")
        for part in msg.walk():
            if part.get_content_type() == "text/html":
                return part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", "ignore")
        return ""
    return msg.get_payload(decode=True).decode(msg.get_content_charset() or "utf-8", "ignore")


def cmd_check(_):
    m = imap()
    print("IMAP ok:", [x.decode().split(' "/" ')[-1] for x in m.list()[1]][:8])
    typ, d = m.select("INBOX", readonly=True)
    print("INBOX 封数:", d[0].decode())
    m.logout()
    s = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=_ctx(), timeout=30)
    s.login(addr(), code())
    print("SMTP ok (登录成功，未发信)")
    s.quit()


def cmd_list(a):
    m = imap()
    m.select(_mb(a.folder), readonly=True)
    typ, ids = m.search(None, "ALL")
    ids = ids[0].split()[-a.limit:][::-1]
    for i in ids:
        t, data = m.fetch(i, "(BODY.PEEK[HEADER.FIELDS (DATE FROM SUBJECT)])")
        raw = data[0][1].decode("utf-8", "ignore")
        msg = email.message_from_string(raw)
        print(f"[{i.decode()}] {dec(msg['Date'])} | {dec(msg['From'])} | {dec(msg['Subject'])}")
    m.logout()


def cmd_search(a):
    m = imap()
    m.select(_mb(a.folder), readonly=True)
    typ, ids = m.search("UTF-8", b"SUBJECT", a.keyword.encode("utf-8"))
    if typ != "OK":
        print("检索失败:", ids)
    ids = ids[0].split()[-a.limit:][::-1]
    print(f"{a.folder} 命中 {len(ids)} 封")
    for i in ids:
        t, data = m.fetch(i, "(BODY.PEEK[HEADER.FIELDS (DATE FROM TO SUBJECT)])")
        msg = email.message_from_string(data[0][1].decode("utf-8", "ignore"))
        print(f"[{i.decode()}] {dec(msg['Date'])} | {dec(msg['From'])} -> {dec(msg['To'])} | {dec(msg['Subject'])}")
    m.logout()


def cmd_read(a):
    m = imap()
    m.select(_mb(a.folder), readonly=True)
    t, data = m.fetch(a.uid, "(RFC822)")
    msg = email.message_from_bytes(data[0][1])
    print("From:", dec(msg["From"]))
    print("To:", dec(msg["To"]))
    print("Date:", dec(msg["Date"]))
    print("Subject:", dec(msg["Subject"]))
    print("-" * 60)
    print(body_text(msg))
    m.logout()


def cmd_send(a):
    body = a.body
    if a.body_file:
        body = open(a.body_file, encoding="utf-8").read()
    msg = EmailMessage()
    msg["From"] = addr()
    msg["To"] = ", ".join(a.to)
    msg["Subject"] = a.subject
    msg["Date"] = formatdate(localtime=True)
    msg.set_content(body)
    for f in a.attach or []:
        import mimetypes
        ctype, _ = mimetypes.guess_type(f)
        maintype, subtype = (ctype or "application/octet-stream").split("/", 1)
        msg.add_attachment(open(f, "rb").read(), maintype=maintype, subtype=subtype, filename=os.path.basename(f))
    raw = msg.as_bytes()
    s = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=_ctx(), timeout=60)
    s.login(addr(), code())
    s.send_message(msg)
    s.quit()
    print("SMTP 已投递:", ", ".join(a.to))
    # 自己留一份到「已发送」，否则在邮箱里看不到发送记录
    m = imap()
    m.append(_mb(SENT), "(\\Seen)", imaplib.Time2Internaldate(time.time()), raw)
    m.logout()
    print("已存入「已发送」")


def main():
    p = argparse.ArgumentParser(description="Coremail 邮箱 IMAP/SMTP 工具")
    p.add_argument("--addr", default="", help="邮箱地址（默认取环境变量 CSU_MAIL_ADDR）")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("check").set_defaults(fn=cmd_check)
    q = sub.add_parser("list"); q.add_argument("folder", nargs="?", default="INBOX"); q.add_argument("limit", nargs="?", type=int, default=10); q.set_defaults(fn=cmd_list)
    q = sub.add_parser("search"); q.add_argument("keyword"); q.add_argument("folder", nargs="?", default="INBOX"); q.add_argument("limit", nargs="?", type=int, default=10); q.set_defaults(fn=cmd_search)
    q = sub.add_parser("read"); q.add_argument("uid"); q.add_argument("folder", nargs="?", default="INBOX"); q.set_defaults(fn=cmd_read)
    q = sub.add_parser("send"); q.add_argument("--to", action="append", required=True); q.add_argument("--subject", required=True); q.add_argument("--body", default=""); q.add_argument("--body-file"); q.add_argument("--attach", action="append"); q.set_defaults(fn=cmd_send)
    a = p.parse_args()
    global _ADDR
    _ADDR = a.addr
    a.fn(a)


if __name__ == "__main__":
    main()
