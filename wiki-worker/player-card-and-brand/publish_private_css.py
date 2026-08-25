#!/usr/bin/env python3
import http.cookiejar
import json
import os
import time
import urllib.parse
import urllib.request
from pathlib import Path

API = os.environ.get("WIKI_API", "https://enthusia.miraheze.org/w/api.php")
USERNAME = os.environ["WIKI_BOT_USERNAME"].strip()
PASSWORD = os.environ["WIKI_BOT_PASSWORD"]
TITLE = "User:P2wn/common.css"
ROOT = Path(__file__).resolve().parent
CSS = (ROOT / "common-brand.css").read_text(encoding="utf-8").strip()
OUT = Path(os.environ.get("WIKI_BRAND_OUT", "wiki-private-brand-css-output"))
COMMENT = "Stage real Enthusia logo and gradient in private wiki theme"
START = "/* Enthusia CSS-only brand block START */"
END = "/* Enthusia CSS-only brand block END */"
BLOCK = f"{START}\n{CSS}\n{END}"

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def api(params, method="POST"):
    full = {"format": "json", "formatversion": "2", "maxlag": "5", **params}
    headers = {"User-Agent": "EnthusiaWikiPrivateBrandCss/1.0", "Accept": "application/json"}
    if method == "GET":
        req = urllib.request.Request(API + "?" + urllib.parse.urlencode(full), headers=headers)
    else:
        headers["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8"
        req = urllib.request.Request(API, data=urllib.parse.urlencode(full).encode(), headers=headers)
    with opener.open(req, timeout=60) as response:
        return json.loads(response.read().decode())


def read_page():
    result = api({
        "action": "query", "prop": "revisions|info", "titles": TITLE,
        "rvprop": "ids|timestamp|user|comment|content|contentmodel",
        "rvslots": "main", "curtimestamp": "1",
    }, "GET")
    if result.get("error"):
        raise RuntimeError(result["error"])
    rev = result["query"]["pages"][0]["revisions"][0]
    return {
        "revid": rev["revid"], "timestamp": rev["timestamp"],
        "comment": rev.get("comment") or "", "content": rev["slots"]["main"].get("content", ""),
        "curtimestamp": result.get("curtimestamp"),
    }


def write_report(data):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "private-css-report.json").write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def main():
    login_token = api({"action": "query", "meta": "tokens", "type": "login"}, "GET")["query"]["tokens"]["logintoken"]
    login = api({"action": "login", "lgname": USERNAME, "lgpassword": PASSWORD, "lgtoken": login_token})
    if login.get("login", {}).get("result") != "Success":
        raise RuntimeError(login.get("login"))
    who = api({"action": "query", "meta": "userinfo"}, "GET")["query"]["userinfo"]
    csrf = api({"action": "query", "meta": "tokens"}, "GET")["query"]["tokens"]["csrftoken"]
    before = read_page()
    current = before["content"].rstrip()
    report = {"authenticatedAs": who.get("name"), "target": TITLE, "beforeRevid": before["revid"]}

    if START in current or END in current:
        if START not in current or END not in current:
            raise RuntimeError("partial private brand CSS marker found")
        existing = current[current.index(START): current.index(END) + len(END)]
        if existing.strip() != BLOCK.strip():
            raise RuntimeError("existing private brand CSS block differs from approved source")
        report.update({"result": "already-current", "afterRevid": before["revid"]})
        write_report(report)
        print(json.dumps(report, indent=2))
        return

    desired = current + "\n\n" + BLOCK + "\n"
    edit = api({
        "action": "edit", "title": TITLE, "text": desired, "token": csrf,
        "summary": COMMENT, "assert": "user", "watchlist": "nochange",
        "basetimestamp": before["timestamp"], "starttimestamp": before["curtimestamp"],
    })
    data = edit.get("edit") or {}
    if data.get("result") != "Success":
        report.update({"result": "blocked", "editResponse": data})
        write_report(report)
        raise RuntimeError(f"edit blocked: {data}")
    time.sleep(1)
    after = read_page()
    if after["content"].rstrip() != desired.rstrip():
        raise RuntimeError("exact private CSS readback failed")
    report.update({"result": "published", "afterRevid": after["revid"]})
    write_report(report)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
