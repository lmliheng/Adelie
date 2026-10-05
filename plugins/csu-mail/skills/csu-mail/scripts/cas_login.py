#!/usr/bin/env python3
"""登录网页邮箱，换取 Coremail 的 sid —— 只用于首次引导。

日常收发信**不需要**这个脚本：有了客户端专用密码就能直接走 IMAP/SMTP（见 mail.py）。
只有当邮箱里还没有专用密码、又必须进网页邮箱生成一条时才用它。

两条登录路径（`--mode`）：

  cas     走统一身份认证 SSO（默认）。Coremail 侧二次验证开着时，这是**唯一可靠**的路。
  direct  直接用 `学号 + 密码` POST 网页登录表单 `/coremail/index.jsp?cus=1`。
          只有当邮箱有自己的密码（≠ 统一身份认证密码）时才会成功。
          中南大学实测：用统一身份认证密码直登返回 `FA_UNAUTHORIZED`，并开始要验证码 —— 走不通。

无论哪条路：**不要重试**。失败就停下来问用户，别连续试密码（CAS 会被风控，邮箱会要验证码）。

用法：
    CSU_MAIL_ADDR=学号@csu.edu.cn CSU_CAS_USER=学号 CSU_CAS_PASS=密码 \
        python cas_login.py [--mode cas|direct] [--out mail_session.json]

产出：JSON（sid + cookies，权限 600），可直接喂给 create_apppw.mjs。
"""
import argparse
import base64
import json
import os
import random
import re
import sys

import requests
from bs4 import BeautifulSoup
from Crypto.Cipher import AES

CAS = os.environ.get("CSU_CAS_URL", "https://ca.csu.edu.cn/authserver/login")
SERVICE = os.environ.get("CSU_MAIL_SSO", "https://mail.csu.edu.cn/coremail/cmcu_addon/sso.jsp")
MAIL_BASE = os.environ.get("CSU_MAIL_BASE", "https://mail.csu.edu.cn")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
CHARS = "ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678"


def _rand(n: int) -> str:
    return "".join(random.choice(CHARS) for _ in range(n))


def encrypt_password(password: str, salt: str) -> str:
    """与 CAS 页面 static/common/encrypt.js 的 encryptAES 一致：
    明文 = 64 位随机串 + 密码，AES-CBC（key = pwdEncryptSalt，iv = 16 位随机串），PKCS7，Base64。"""
    text = _rand(64) + password
    pad_len = AES.block_size - len(text) % AES.block_size
    text += pad_len * chr(pad_len)
    cipher = AES.new(salt.encode(), AES.MODE_CBC, _rand(16).encode())
    return base64.b64encode(cipher.encrypt(text.encode())).decode()


def cas_login(user: str, password: str, service: str = SERVICE) -> requests.Session:
    s = requests.Session()
    s.headers["User-Agent"] = UA
    page = s.get(CAS, params={"service": service}, timeout=20)
    div = BeautifulSoup(page.text, "lxml").find(id="pwdLoginDiv")
    if div is None:
        raise RuntimeError("CAS 页面结构变化，取不到 pwdLoginDiv（可能要求验证码）")
    resp = s.post(CAS, params={"service": service}, timeout=25, data={
        "username": user,
        "password": encrypt_password(password, div.find(id="pwdEncryptSalt")["value"]),
        "passwordText": "", "_eventId": "submit", "cllt": "userNameLogin",
        "dllt": "generalLogin", "lt": "",
        "execution": div.find(id="execution")["value"], "rmShown": "1",
    })
    if "/authserver/login" in resp.url and "ticket" not in resp.url:
        raise RuntimeError("统一身份认证登录失败（账号或密码错误，或触发风控/需要验证码）")
    return s


def direct_login(user: str, password: str):
    """网页直登，返回 (session, sid)：POST /coremail/index.jsp?cus=1（明文的 uid + password + 表单隐藏字段）。

    要先把登录页上的隐藏字段原样回传（`loginType`、`locale`、`action:login` 等），
    少了它们会被判非法请求。Coremail 的失败信息在页面的 #warnOrErrDiv 里，
    同时 `CM.config.user.loginResultCode` 会给一个代码（如 FA_UNAUTHORIZED）。
    """
    s = requests.Session()
    s.headers["User-Agent"] = UA
    page = s.get(MAIL_BASE + "/", timeout=20)
    html = page.text
    fi = html.find('class="j-login-form')
    if fi < 0:
        raise RuntimeError("取不到登录表单：页面结构可能变了")
    seg = html[fi: html.find("</form>", fi)]
    data = {}
    for m in re.finditer(r"<input([^>]*)>", seg):
        attrs = m.group(1)
        n = re.search(r'name="([^"]+)"', attrs)
        v = re.search(r'value="([^"]*)"', attrs)
        if n:
            data[n.group(1)] = v.group(1) if v else ""
    data["uid"] = user
    data["password"] = password
    resp = s.post(MAIL_BASE + "/coremail/index.jsp?cus=1", data=data, timeout=25,
                  headers={"Referer": MAIL_BASE + "/"})
    # 注意：失败页面里也会出现 "sid=" 字样（SSO 链接），必须先判错再用 sid 判成功
    err = (re.search(r'id="warnOrErrDiv"[^>]*>\s*<label>([^<]+)', resp.text)
           or re.search(r'class="[^"]*\berrMsg\b[^"]*"[^>]*>\s*<label>([^<]+)', resp.text))
    code = re.search(r"loginResultCode:\s*'([^']+)'", resp.text)
    m = re.search(r"sid=([A-Za-z0-9_\-]+)", resp.url) or re.search(r'sid="([A-Za-z0-9_\-]+)"', resp.text)
    if err or not m:
        detail = err.group(1).strip() if err else "没有返回可用的 sid"
        if code:
            detail += f"（loginResultCode={code.group(1)}）"
        raise RuntimeError(f"网页直登失败：{detail} —— 邮箱有自己的密码才走得通，中南大学实测走不通；"
                           "请改用默认的 --mode cas，或让用户在浏览器里手动生成专用密码")
    return s, m.group(1)


def mail_sid(s: requests.Session, resp) -> str:
    m = re.search(r"sid=([A-Za-z0-9_\-]+)", resp.url)
    if not m:
        r = s.get("https://mail.csu.edu.cn/coremail/XT5/index.jsp", allow_redirects=True, timeout=25)
        m = (re.search(r"sid=([A-Za-z0-9_\-]+)", r.url)
             or re.search(r'name="sid"\s+value="([^"]+)"', r.text))
    if not m:
        raise RuntimeError("SSO 回调里没有 sid")
    return m.group(1)


def main():
    ap = argparse.ArgumentParser(description="登录网页邮箱换 sid（仅引导时使用）")
    ap.add_argument("--mode", choices=["cas", "direct"], default=os.environ.get("CSU_LOGIN_MODE", "cas"))
    ap.add_argument("--user", default=os.environ.get("CSU_CAS_USER", ""))
    ap.add_argument("--password", default=os.environ.get("CSU_CAS_PASS", ""))
    ap.add_argument("--service", default=SERVICE)
    ap.add_argument("--out", default="mail_session.json")
    a = ap.parse_args()
    if not a.user or not a.password:
        sys.exit("需要 CSU_CAS_USER / CSU_CAS_PASS（或用 --user/--password）")

    if a.mode == "direct":
        s, sid = direct_login(a.user, a.password)
    else:
        s = cas_login(a.user, a.password, a.service)
        resp = s.get(a.service, timeout=25)
        sid = mail_sid(s, resp)

    with open(a.out, "w", encoding="utf-8") as f:
        json.dump({"sid": sid, "cookies": s.cookies.get_dict()}, f)
    os.chmod(a.out, 0o600)
    print(f"sid 已写入 {a.out}（{sid[:4]}…{sid[-4:]}，模式 {a.mode}），接下来可用 create_apppw.mjs 生成客户端专用密码")


if __name__ == "__main__":
    main()
