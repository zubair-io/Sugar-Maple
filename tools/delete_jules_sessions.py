#!/usr/bin/env python3
"""Preview or delete Jules sessions using the REST API; Python 3, no dependencies."""

import argparse
import getpass
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://jules.googleapis.com/v1alpha/"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Client:
    def __init__(self, key):
        self.key = key
        self.opener = urllib.request.build_opener(NoRedirect)

    def request(self, method, path):
        for attempt in range(4):
            request = urllib.request.Request(
                API + path, method=method, headers={"x-goog-api-key": self.key}
            )
            try:
                with self.opener.open(request, timeout=30) as response:
                    data = response.read()
                    return json.loads(data) if data else {}
            except urllib.error.HTTPError as error:
                if method == "DELETE" and error.code == 404:
                    return {}
                if error.code in (429, 500, 502, 503, 504) and attempt < 3:
                    time.sleep(2 ** attempt)
                    continue
                raise RuntimeError(f"{method} failed with HTTP {error.code}") from None
            except (urllib.error.URLError, TimeoutError):
                raise RuntimeError(f"{method} failed: connection error or timeout") from None
            except (ValueError, UnicodeError):
                raise RuntimeError("API returned invalid JSON") from None


def list_sessions(client, page_size=10, limit=None):
    if not 1 <= page_size <= 100 or (limit is not None and limit < 1):
        raise ValueError("page_size must be 1–100 and limit must be positive")
    sessions = {}
    page_token = ""
    seen_tokens = set()
    # Collect the bounded batch before deleting so page boundaries cannot shift.
    while True:
        query = {"pageSize": min(page_size, limit - len(sessions)) if limit else page_size}
        if page_token:
            query["pageToken"] = page_token
        page = client.request("GET", "sessions?" + urllib.parse.urlencode(query))
        if not isinstance(page, dict) or not isinstance(page.get("sessions", []), list):
            raise RuntimeError("Invalid session list response; nothing deleted")
        for session in page.get("sessions", []):
            name = session.get("name", "") if isinstance(session, dict) else ""
            if not re.fullmatch(r"sessions/[A-Za-z0-9_-]+", name):
                raise RuntimeError("Invalid session name; nothing deleted")
            sessions[name] = session
            if limit is not None and len(sessions) >= limit:
                return list(sessions.values())
        page_token = page.get("nextPageToken", "")
        if not page_token:
            return list(sessions.values())
        if not isinstance(page_token, str) or page_token in seen_tokens:
            raise RuntimeError("Invalid or repeated page token; nothing deleted")
        seen_tokens.add(page_token)


def run(client, all_sessions=False, delete=False, page_size=10, limit=None):
    sessions = list_sessions(client, page_size=page_size, limit=limit)
    selected = [s for s in sessions if all_sessions or s.get("state") == "COMPLETED"]
    print(f"Scope: {'ALL states, including active work' if all_sessions else 'COMPLETED only'}; all repositories.")
    for session in selected:
        # JSON quoting prevents terminal control characters in session titles.
        print(json.dumps({k: session.get(k, "") for k in ("name", "state", "title")}))
    print(f"{len(selected)} selected from {len(sessions)} fetched sessions.")
    if limit is not None:
        print(f"Fetch limit: {limit}; additional sessions may exist. State filtering applies within this batch.")
    if not delete:
        print("Preview only. Add --delete to delete the selected sessions.")
        return 0
    failures = 0
    for session in selected:
        name = session["name"]
        try:
            client.request("DELETE", name)
            print(f"Deleted (or already absent): {name}")
        except RuntimeError as error:
            failures += 1
            print(f"Failed: {name}: {error}", file=sys.stderr)
    print(f"Finished: {len(selected) - failures} deleted/already absent; {failures} failed.")
    return 1 if failures else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    scope = parser.add_mutually_exclusive_group(required=True)
    scope.add_argument("--all", action="store_true", help="Select every session, including active work, across all repositories")
    scope.add_argument("--completed", action="store_true", help="Select completed sessions only, across all repositories")
    parser.add_argument("--delete", action="store_true", help="Delete selected sessions; without this flag only preview")
    parser.add_argument("--page-size", type=int, default=10, help="Sessions per API request, 1–100 (default: 10)")
    parser.add_argument("--limit", type=int, help="Fetch at most this many sessions total, before filtering by state")
    args = parser.parse_args()
    if not 1 <= args.page_size <= 100:
        parser.error("--page-size must be between 1 and 100")
    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be positive")
    key = os.environ.get("JULES_API_KEY", "").strip()
    if not key and sys.stdin.isatty():
        key = getpass.getpass("Jules API key (hidden): ").strip()
    if not key:
        parser.error("Set JULES_API_KEY or run interactively to enter it securely")
    try:
        return run(Client(key), all_sessions=args.all, delete=args.delete,
                   page_size=args.page_size, limit=args.limit)
    except RuntimeError as error:
        print(error, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
