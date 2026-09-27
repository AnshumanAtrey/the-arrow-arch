#!/usr/bin/env python3
"""Fetch and build a curated Stack Overflow problem-question snapshot.

Run without arguments to rebuild from api_snapshot.json. Run with --fetch to
query the public Stack Exchange API and refresh both the snapshot and CSV.
"""
import argparse
import csv
import datetime as dt
import html
from html.parser import HTMLParser
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SNAPSHOT = ROOT / "api_snapshot.json"
OUTPUT = ROOT / "problems.csv"
COLLECTED_AT = "2026-09-27"
SINCE = int(dt.datetime(2022, 1, 1, tzinfo=dt.timezone.utc).timestamp())
PER_TAG = 7
# Specific repeated/curiosity-only questions removed after reviewing the selected titles and bodies.
EXCLUDED_QUESTION_IDS = {
    71849415, 73485958, 71901632,       # duplicate Git dubious-ownership reports (keep 72978485)
    70837397,                           # same pandas append deprecation issue as 75956209
    72027949, 72543728, 71463698,       # conceptual Vite/bitcode/TypeScript option questions
    77139617,                           # duplicate Xcode libarclite build issue (keep 75574268)
    71828288, 72843016, 70730831,       # C++ language/design questions, not a concrete incident
    75229793, 76748330,                 # conceptual .NET builder/framework questions
    71913692,                           # duplicate missing react-dom/client report (keep 71713405)
    73558355, 78751187,                 # joke/theoretical undefined-behavior questions
    71265229, 74271261, 71570607, 71163623, # conceptual PHP/SQLAlchemy/TinyMCE/Prisma questions
    75316741,                           # duplicate SQLAlchemy Engine.execute failure (keep 75309237)
    75804599,                           # overlaps the concrete OpenAI context-length failure (keep 75396481)
    79686427, 71870205, 71977961,       # language trivia/opinion rather than a concrete developer problem
    78431167,                           # SQL-injection course exercise rather than a reported incident
}
TAGS = [
    "python", "javascript", "typescript", "java", "c#", "c++", "reactjs",
    "node.js", "sql", "git", "docker", "linux", "android", "ios", "php",
    "django", "pandas", "postgresql", "mysql", "openai-api",
]

FIELDS = [
    "record_id", "platform", "post_date", "author_name", "author_handle",
    "person_profile_as_stated", "prominence_basis", "problem_category",
    "affected_area", "problem_statement", "evidence_excerpt", "post_url",
    "post_type", "language", "reply_count_visible", "reply_review_notes",
    "evidence_type", "confidence", "tags", "question_id",
    "author_profile_url", "question_score", "answer_count", "is_answered",
    "content_license", "question_body_excerpt",
]

class VisibleText(HTMLParser):
    """Extract a short readable question excerpt, omitting code and markup."""
    def __init__(self):
        super().__init__()
        self.parts = []
        self.skip = 0
    def handle_starttag(self, tag, attrs):
        if tag in {"pre", "code", "script", "style"}:
            self.skip += 1
        elif tag in {"p", "br", "li", "div", "blockquote"}:
            self.parts.append(" ")
    def handle_endtag(self, tag):
        if tag in {"pre", "code", "script", "style"} and self.skip:
            self.skip -= 1
        elif tag in {"p", "li", "div", "blockquote"}:
            self.parts.append(" ")
    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)

def plain_text(value):
    parser = VisibleText()
    parser.feed(value or "")
    return re.sub(r"\s+", " ", html.unescape(" ".join(parser.parts))).strip()

def fetch_questions():
    found = {}
    for tag in TAGS:
        params = {
            "site": "stackoverflow", "tagged": tag, "pagesize": 100,
            "sort": "votes", "fromdate": SINCE, "min": 1,
            "closed": "false", "filter": "withbody",
        }
        url = "https://api.stackexchange.com/2.3/search/advanced?" + urllib.parse.urlencode(params)
        request = urllib.request.Request(url, headers={"User-Agent": "Arrow-DB research dataset/1.0"})
        with urllib.request.urlopen(request, timeout=40) as response:
            payload = json.load(response)
        if payload.get("error_message"):
            raise RuntimeError(f"Stack Exchange API error for {tag}: {payload['error_message']}")
        for item in payload.get("items", []):
            found.setdefault(item["question_id"], item)
        print(f"Fetched {tag}: {len(payload.get('items', []))} questions; API quota remaining {payload.get('quota_remaining')}", file=sys.stderr)
        if payload.get("backoff"):
            time.sleep(int(payload["backoff"]))
        else:
            time.sleep(0.2)
    return found

CONCEPTUAL = (
    "what is the difference", "difference between", "does it make sense",
    "what does the", "what does", "why use ", "when should i", "explanation of",
    "can someone explain", "what is the point of", "why was ",
)
PROBLEM_MARKERS = re.compile(
    r"\b(error|exception|warning|fail(?:ed|ing|s)?|crash(?:ed|es)?|cannot|can't|couldn't|"
    r"doesn't work|not working|not found|denied|unable|unexpected|wrong|issue|problem|"
    r"timeout|deprecated|incompatible|missing|broken|refused|unavailable|stuck|"
    r"does not|won't|isn't|aren't|why does|how can i fix|how do i fix)\b", re.I
)

def keep_question(q):
    title = plain_text(q.get("title", ""))
    body = plain_text(q.get("body", ""))
    if len(body) < 45 or len(title) < 12 or q.get("score", 0) < 1:
        return False
    low = title.casefold()
    if any(phrase in low for phrase in CONCEPTUAL):
        # Retain only if it is actually reporting a concrete failure.
        if not PROBLEM_MARKERS.search(title + " " + body[:450]):
            return False
    if title.casefold().startswith(("what is ", "what does ")) and not PROBLEM_MARKERS.search(title + " " + body[:450]):
        return False
    return True

def title_key(title):
    return re.sub(r"[^a-z0-9]+", " ", plain_text(title).lower()).strip()

def meaning_duplicate(q, selected):
    key = title_key(q["title"])
    tokens = set(key.split()) - {"how", "do", "i", "the", "a", "an", "to", "in", "on", "with", "for", "is", "it", "of", "my", "this", "error"}
    for old in selected:
        old_key = title_key(old["title"])
        if key == old_key or SequenceMatcher(None, key, old_key).ratio() >= 0.93:
            return True
        old_tokens = set(old_key.split()) - {"how", "do", "i", "the", "a", "an", "to", "in", "on", "with", "for", "is", "it", "of", "my", "this", "error"}
        if len(tokens) >= 5 and len(old_tokens) >= 5 and len(tokens & old_tokens) / len(tokens | old_tokens) >= 0.82:
            return True
    return False

def select_questions(found):
    selected, seen_ids = [], set()
    for tag in TAGS:
        candidates = [q for q in found.values() if tag in q.get("tags", [])]
        candidates.sort(key=lambda q: (q.get("score", 0), q.get("view_count", 0)), reverse=True)
        got = 0
        for q in candidates:
            qid = q["question_id"]
            if qid in seen_ids or qid in EXCLUDED_QUESTION_IDS or not keep_question(q) or meaning_duplicate(q, selected):
                continue
            selected.append(q)
            seen_ids.add(qid)
            got += 1
            if got == PER_TAG:
                break
    if len(selected) < 100:
        raise RuntimeError(f"Only {len(selected)} distinct problem questions passed the filters; refusing to pad the dataset.")
    return selected

def category(q, focus_tag):
    title = plain_text(q.get("title", ""))
    body = plain_text(q.get("body", ""))[:600]
    text = (title + " " + body).lower()
    if any(x in text for x in ("permission denied", "access denied", "not authorized", "authentication", "credentials", "login")):
        return "Authentication and permissions"
    if any(x in text for x in ("deprecated", "upgrade", "version", "compatib", "dependency", "package", "install", "module not found", "cannot find module")):
        return "Dependencies and version compatibility"
    if any(x in text for x in ("build", "compile", "deployment", "deploy", "docker", "runtime", "environment", "not recognized", "command not found")):
        return "Build, runtime, and environment failures"
    if any(x in text for x in ("timeout", "timed out", "connection", "network", "refused", "unreachable", "ssl", "certificate")):
        return "Connectivity and integration failures"
    if any(x in text for x in ("error", "exception", "warning", "traceback", "crash", "failed", "failure")):
        return "Errors and exceptions"
    if focus_tag in {"sql", "postgresql", "mysql"}:
        return "Database and query behavior"
    if focus_tag in {"git"}:
        return "Version control"
    if focus_tag in {"openai-api"}:
        return "AI API integration"
    return "Unexpected behavior and debugging"

def build_rows(questions):
    rows=[]
    tag_for={}
    for q in questions:
        tag_for[q["question_id"]]=next(t for t in TAGS if t in q.get("tags", []))
    # Stable order for this stored snapshot; source IDs remain the primary keys.
    questions=sorted(questions,key=lambda q:(-q.get("score",0), q["question_id"]))
    for i,q in enumerate(questions,1):
        owner=q.get("owner") or {}
        user_id=owner.get("user_id")
        author=owner.get("display_name") or (f"Stack Overflow user {user_id}" if user_id else "Stack Overflow user (name not exposed)")
        profile=owner.get("link") or (f"https://stackoverflow.com/users/{user_id}" if user_id else "")
        focus=tag_for[q["question_id"]]
        title=plain_text(q.get("title", ""))
        body_excerpt=plain_text(q.get("body", ""))[:320]
        created=dt.datetime.fromtimestamp(q["creation_date"],dt.timezone.utc).date().isoformat()
        rows.append({
            "record_id":f"SO-{q['question_id']}", "platform":"Stack Overflow", "post_date":created,
            "author_name":author, "author_handle":(f"user:{user_id}" if user_id else "not exposed"),
            "person_profile_as_stated":"Stack Overflow public display name only; no job or seniority claim inferred",
            "prominence_basis":"Selected for a concrete problem report, topical coverage, and source quality; votes are not treated as expertise",
            "problem_category":category(q,focus), "affected_area":", ".join(q.get("tags",[])),
            "problem_statement":title, "evidence_excerpt":(body_excerpt[:180].rsplit(" ",1)[0] if len(body_excerpt)>180 else body_excerpt),
            "post_url":q.get("link",f"https://stackoverflow.com/questions/{q['question_id']}"),
            "post_type":"question", "language":"en",
            "reply_count_visible":str(q.get("answer_count",0)),
            "reply_review_notes":"Original question title and body excerpt reviewed through the Stack Exchange API. Answers and comments were not used to add problems or solutions; answer count is API metadata only.",
            "evidence_type":"Stack Overflow problem question", "confidence":"High" if PROBLEM_MARKERS.search(title+" "+body_excerpt[:450]) else "Medium",
            "tags":";".join(q.get("tags",[])), "question_id":str(q["question_id"]),
            "author_profile_url":profile, "question_score":str(q.get("score",0)),
            "answer_count":str(q.get("answer_count",0)), "is_answered":str(bool(q.get("is_answered",False))).lower(),
            "content_license":q.get("content_license","not exposed"), "question_body_excerpt":body_excerpt,
        })
    return rows

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--fetch",action="store_true",help="Fetch and curate a fresh public API snapshot")
    args=parser.parse_args()
    if args.fetch:
        found=fetch_questions()
        selected=select_questions(found)
        snapshot=[]
        for q in selected:
            owner=q.get("owner") or {}
            snapshot.append({
                "question_id":q["question_id"], "title":q["title"], "body":plain_text(q.get("body",""))[:320],
                "tags":q.get("tags",[]), "owner":owner, "score":q.get("score",0),
                "answer_count":q.get("answer_count",0), "is_answered":q.get("is_answered",False),
                "creation_date":q["creation_date"], "view_count":q.get("view_count",0),
                "link":q.get("link"), "content_license":q.get("content_license","not exposed"),
            })
        SNAPSHOT.write_text(json.dumps({"collected_at":COLLECTED_AT,"questions":snapshot},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    if not SNAPSHOT.exists():
        raise SystemExit("No api_snapshot.json. Run this script with --fetch first.")
    snapshot=json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    rows=build_rows(snapshot["questions"])
    with OUTPUT.open("w",newline="",encoding="utf-8") as f:
        writer=csv.DictWriter(f,fieldnames=FIELDS,lineterminator="\n")
        writer.writeheader(); writer.writerows(rows)
    print(f"Wrote {len(rows)} distinct question records to {OUTPUT}")

if __name__=="__main__":
    main()
