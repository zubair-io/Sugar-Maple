import contextlib
import importlib.util
import io
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("cleanup", Path(__file__).parents[1] / "delete_jules_sessions.py")
cleanup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cleanup)


class FakeClient:
    def __init__(self, pages, fail_delete=False):
        self.pages = iter(pages)
        self.calls = []
        self.fail_delete = fail_delete

    def request(self, method, path):
        self.calls.append((method, path))
        if method == "GET":
            page = next(self.pages)
            if isinstance(page, Exception):
                raise page
            return page
        if self.fail_delete:
            raise RuntimeError("HTTP 403")
        return {}


def session(number, state="COMPLETED"):
    return {"name": f"sessions/{number}", "state": state}


class CleanupTests(unittest.TestCase):
    def invoke(self, client, **kwargs):
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            return cleanup.run(client, **kwargs)

    def test_limit_stops_before_next_page(self):
        client = FakeClient([{"sessions": [session(1), session(2)], "nextPageToken": "more"}])
        self.invoke(client, all_sessions=True, delete=True, page_size=5, limit=2)
        self.assertEqual(client.calls, [
            ("GET", "sessions?pageSize=2"),
            ("DELETE", "sessions/1"), ("DELETE", "sessions/2"),
        ])

    def test_page_size_and_remaining_limit(self):
        client = FakeClient([
            {"sessions": [session(1), session(2)], "nextPageToken": "next"},
            {"sessions": [session(3)], "nextPageToken": "more"},
        ])
        self.invoke(client, all_sessions=True, page_size=2, limit=3)
        self.assertEqual(client.calls, [
            ("GET", "sessions?pageSize=2"),
            ("GET", "sessions?pageSize=1&pageToken=next"),
        ])

    def test_limit_counts_active_sessions_before_filtering(self):
        client = FakeClient([{"sessions": [session(1, "IN_PROGRESS")], "nextPageToken": "more"}])
        self.invoke(client, delete=True, limit=1)
        self.assertEqual(client.calls, [("GET", "sessions?pageSize=1")])

    def test_invalid_limits_rejected_before_request(self):
        for options in ({"page_size": 0}, {"page_size": 101}, {"limit": 0}):
            client = FakeClient([])
            with self.assertRaises(ValueError):
                cleanup.list_sessions(client, **options)
            self.assertEqual(client.calls, [])

    def test_preview_never_deletes(self):
        client = FakeClient([{"sessions": [session(1)]}])
        self.assertEqual(self.invoke(client, all_sessions=True), 0)
        self.assertEqual([m for m, p in client.calls], ["GET"])

    def test_all_pages_read_before_deletion_and_duplicates_removed(self):
        client = FakeClient([
            {"sessions": [session(1)], "nextPageToken": "a+b="},
            {"sessions": [session(1), session(2, "IN_PROGRESS")]},
        ])
        self.assertEqual(self.invoke(client, all_sessions=True, delete=True), 0)
        self.assertEqual([m for m, p in client.calls], ["GET", "GET", "DELETE", "DELETE"])
        self.assertIn("pageToken=a%2Bb%3D", client.calls[1][1])

    def test_completed_excludes_active(self):
        client = FakeClient([{"sessions": [session(1), session(2, "IN_PROGRESS")]}])
        self.invoke(client, delete=True)
        self.assertEqual(client.calls[-1], ("DELETE", "sessions/1"))
        self.assertEqual(len(client.calls), 2)

    def test_listing_failure_prevents_any_deletion(self):
        client = FakeClient([{"sessions": [session(1)], "nextPageToken": "next"}, RuntimeError("offline")])
        with self.assertRaises(RuntimeError):
            self.invoke(client, all_sessions=True, delete=True)
        self.assertTrue(all(m == "GET" for m, p in client.calls))

    def test_repeated_token_rejected(self):
        client = FakeClient([{"nextPageToken": "same"}, {"nextPageToken": "same"}])
        with self.assertRaises(RuntimeError):
            self.invoke(client, delete=True)

    def test_bad_resource_rejected(self):
        client = FakeClient([{"sessions": [{"name": "sessions/../other"}]}])
        with self.assertRaises(RuntimeError):
            self.invoke(client, delete=True)
        self.assertEqual(len(client.calls), 1)

    def test_delete_failures_exit_nonzero(self):
        client = FakeClient([{"sessions": [session(1), session(2)]}], fail_delete=True)
        self.assertEqual(self.invoke(client, delete=True), 1)
        self.assertEqual(len(client.calls), 3)


if __name__ == "__main__":
    unittest.main()
