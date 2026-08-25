#!/usr/bin/env python3
import http.cookiejar
import json
import os
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

API = os.environ.get("WIKI_API", "https://enthusia.miraheze.org/w/api.php")
USERNAME = os.environ["WIKI_BOT_USERNAME"].strip()
PASSWORD = os.environ["WIKI_BOT_PASSWORD"]
ROOT = Path(__file__).resolve().parent
OUT = Path(os.environ.get("WIKI_BRAND_OUT", "wiki-player-brand-output"))
TEMPLATE_TITLE = "Template:Player.dpl"
CSS_TITLE = "MediaWiki:Common.css"
LOGO_TITLE = "File:Enthusia-logo-v2.png"
LOGO_PATH = Path("public/assets/enthusia-logo-v2.png")
TEMPLATE_PATH = ROOT / "Template_Player.dpl.wiki"
CSS_PATH = ROOT / "common-brand.css"
COMMENT = "Normalize player cards and add Enthusia wiki branding"
START = "/* Enthusia wiki brand/player-card block START */"
END = "/* Enthusia wiki brand/player-card block END */"

EXPECTED_OLD_TEMPLATE = """<includeonly>
\t<div style=\"width: 120px; text-align:center; display:inline-block;\">
\t\t[[{{{image|}}}|120x120px]]
\t\t[[%PAGE%|{{{title|%TITLE%}}}]]
\t</div>
</includeonly>"""

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def api(params, method="POST"):
    full = {"format": "json", "formatversion": "2", "maxlag": "5", **params}
    headers = {"User-Agent": "EnthusiaWikiPlayerBrandPublisher/1.0", "Accept": "application/json"}
    if method == "GET":
        req = urllib.request.Request(API + "?" + urllib.parse.urlencode(full), headers=headers)
    else:
        headers["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8"
        req = urllib.request.Request(API, data=urllib.parse.urlencode(full).encode(), headers=headers)
    with opener.open(req, timeout=60) as response:
        result = json.loads(response.read().decode())
    if result.get("error"):
        raise RuntimeError(result["error"])
    return result


def multipart_upload(params, field_name, filename, content, content_type="application/octet-stream"):
    boundary = "----EnthusiaWiki" + uuid.uuid4().hex
    body = bytearray()
    for key, value in params.items():
        body.extend(f"--{boundary}\r\n".encode())
        body.extend(f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode())
        body.extend(str(value).encode())
        body.extend(b"\r\n")
    body.extend(f"--{boundary}\r\n".encode())
    body.extend(f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"\r\n'.encode())
    body.extend(f"Content-Type: {content_type}\r\n\r\n".encode())
    body.extend(content)
    body.extend(b"\r\n")
    body.extend(f"--{boundary}--\r\n".encode())
    req = urllib.request.Request(
        API,
        data=bytes(body),
        headers={
            "User-Agent": "EnthusiaWikiPlayerBrandPublisher/1.0",
            "Accept": "application/json",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
    )
    with opener.open(req, timeout=120) as response:
        result = json.loads(response.read().decode())
    if result.get("error"):
        raise RuntimeError(result["error"])
    return result


def read_page(title):
    result = api(
        {
            "action": "query",
            "prop": "revisions|info",
            "titles": title,
            "rvprop": "ids|timestamp|user|comment|content|contentmodel",
            "rvslots": "main",
            "curtimestamp": "1",
        },
        "GET",
    )
    page = result["query"]["pages"][0]
    if page.get("missing"):
        return {"missing": True, "curtimestamp": result.get("curtimestamp")}
    rev = page["revisions"][0]
    slot = rev["slots"]["main"]
    return {
        "missing": False,
        "revid": rev["revid"],
        "timestamp": rev["timestamp"],
        "comment": rev.get("comment") or "",
        "content": slot.get("content", ""),
        "contentmodel": slot.get("contentmodel", ""),
        "curtimestamp": result.get("curtimestamp"),
    }


def edit_page(title, desired, before, token):
    edit = api(
        {
            "action": "edit",
            "title": title,
            "text": desired,
            "token": token,
            "summary": COMMENT,
            "assert": "user",
            "watchlist": "nochange",
            "basetimestamp": before["timestamp"],
            "starttimestamp": before["curtimestamp"],
        }
    )
    data = edit.get("edit") or {}
    if data.get("result") != "Success":
        raise RuntimeError(f"edit failed for {title}: {data}")
    time.sleep(1)
    after = read_page(title)
    if after.get("content", "").strip() != desired.strip():
        raise RuntimeError(f"exact readback failed for {title}")
    return after


def parse_check(title, text):
    result = api({"action": "parse", "title": title, "text": text, "prop": "text"})
    html = (result.get("parse") or {}).get("text") or ""
    if not html:
        raise RuntimeError(f"empty parse result for {title}")
    return len(html)


def write_report(report):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


def main():
    desired_template = TEMPLATE_PATH.read_text(encoding="utf-8").strip()
    css_source = CSS_PATH.read_text(encoding="utf-8").strip()
    if not LOGO_PATH.is_file() or not LOGO_PATH.stat().st_size:
        raise RuntimeError(f"missing logo asset: {LOGO_PATH}")
    if "flex-direction:column" not in desired_template.replace(" ", ""):
        raise RuntimeError("template source does not force vertical player-card layout")
    if "#ff4b12" not in css_source or "#ff8a00" not in css_source or "#ffd36a" not in css_source:
        raise RuntimeError("brand gradient missing from CSS source")
    parse_check(TEMPLATE_TITLE, desired_template)

    login_token = api({"action": "query", "meta": "tokens", "type": "login"}, "GET")["query"]["tokens"]["logintoken"]
    login = api({"action": "login", "lgname": USERNAME, "lgpassword": PASSWORD, "lgtoken": login_token})
    if login.get("login", {}).get("result") != "Success":
        raise RuntimeError(login.get("login"))
    who = api({"action": "query", "meta": "userinfo"}, "GET")["query"]["userinfo"]
    csrf = api({"action": "query", "meta": "tokens"}, "GET")["query"]["tokens"]["csrftoken"]
    report = {"authenticatedAs": who.get("name"), "steps": []}
    write_report(report)

    before_template = read_page(TEMPLATE_TITLE)
    current_template = before_template.get("content", "").strip()
    if current_template == desired_template:
        report["steps"].append({"target": TEMPLATE_TITLE, "result": "already-current", "revid": before_template.get("revid")})
    elif current_template == EXPECTED_OLD_TEMPLATE.strip():
        after_template = edit_page(TEMPLATE_TITLE, desired_template + "\n", before_template, csrf)
        report["steps"].append({"target": TEMPLATE_TITLE, "result": "published", "beforeRevid": before_template.get("revid"), "afterRevid": after_template.get("revid")})
    else:
        raise RuntimeError(f"{TEMPLATE_TITLE} has unexpected live content at rev {before_template.get('revid')}; refusing overwrite")
    write_report(report)

    logo_query = api({"action": "query", "titles": LOGO_TITLE}, "GET")["query"]["pages"][0]
    if logo_query.get("missing"):
        upload = multipart_upload(
            {
                "action": "upload",
                "format": "json",
                "formatversion": "2",
                "filename": "Enthusia-logo-v2.png",
                "token": csrf,
                "comment": COMMENT,
                "text": "Official Enthusia logo used by the wiki shell.",
                "assert": "user",
            },
            "file",
            "enthusia-logo-v2.png",
            LOGO_PATH.read_bytes(),
            "image/png",
        )
        data = upload.get("upload") or {}
        if data.get("result") != "Success":
            raise RuntimeError(f"logo upload failed: {data}")
        report["steps"].append({"target": LOGO_TITLE, "result": "uploaded"})
    else:
        report["steps"].append({"target": LOGO_TITLE, "result": "already-exists"})
    write_report(report)

    block = f"{START}\n{css_source}\n{END}"
    before_css = read_page(CSS_TITLE)
    if before_css.get("missing"):
        raise RuntimeError(f"{CSS_TITLE} unexpectedly missing")
    current_css = before_css["content"].rstrip()
    if START in current_css or END in current_css:
        if START not in current_css or END not in current_css:
            raise RuntimeError("partial brand CSS marker found; refusing edit")
        existing = current_css[current_css.index(START): current_css.index(END) + len(END)]
        if existing.strip() != block.strip():
            raise RuntimeError("existing brand CSS block differs from approved source")
        report["steps"].append({"target": CSS_TITLE, "result": "already-current", "revid": before_css.get("revid")})
    else:
        desired_css = current_css + "\n\n" + block + "\n"
        after_css = edit_page(CSS_TITLE, desired_css, before_css, csrf)
        report["steps"].append({"target": CSS_TITLE, "result": "published", "beforeRevid": before_css.get("revid"), "afterRevid": after_css.get("revid")})
    write_report(report)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
