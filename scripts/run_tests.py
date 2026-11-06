"""Run the offline test suites and print a readable, grouped report.

    backend/.venv/bin/python scripts/run_tests.py                 # every suite
    backend/.venv/bin/python scripts/run_tests.py tests           # one folder

Only the report format differs from `python -m unittest discover`: the same
tests run, and the exit code is 1 if anything failed.
"""
import argparse
import logging
import os
from pathlib import Path
import re
import sys
from time import perf_counter
import unittest
import warnings

ROOT = Path(__file__).resolve().parent.parent
SUITES = {
    "tests": "Simulator, agent and evaluation",
    "backend/tests": "API",
}
USE_COLOR = sys.stdout.isatty() and "NO_COLOR" not in os.environ


def paint(text: str, code: str) -> str:
    return f"\033[{code}m{text}\033[0m" if USE_COLOR else text


PASS, FAIL, SKIP = paint("✓", "32"), paint("✗", "31"), paint("-", "33")


def group_title(test) -> str:
    """MockedAdkWorkflowTests -> Mocked Adk Workflow."""
    name = type(test).__name__
    if name == "_FailedTest":
        return "Could not load"
    words = re.findall(r"[A-Z][a-z0-9]*", name.removesuffix("Tests"))
    return " ".join(words) or name


def test_title(test) -> str:
    """test_service_at_deadline_is_on_time -> Service at deadline is on time."""
    name = test.id().rsplit(".", 1)[-1].removeprefix("test_").replace("_", " ")
    return name[:1].upper() + name[1:]


class ReadableResult(unittest.TestResult):
    def __init__(self, stream):
        super().__init__()
        self.stream = stream
        self.buffer = True  # Show a test's own prints only if it fails.
        self.group = None
        self.passed = 0
        self.problem = None
        self.skip_reason = None

    def startTest(self, test):
        super().startTest(test)
        self.problem = self.skip_reason = None

    def addError(self, test, err):
        super().addError(test, err)
        self.problem = True

    def addFailure(self, test, err):
        super().addFailure(test, err)
        self.problem = True

    def addSubTest(self, test, subtest, err):
        super().addSubTest(test, subtest, err)
        if err is not None:
            self.problem = True

    def addUnexpectedSuccess(self, test):
        super().addUnexpectedSuccess(test)
        self.problem = True

    def addSkip(self, test, reason):
        super().addSkip(test, reason)
        self.skip_reason = reason

    def stopTest(self, test):
        # Keep a failing test's prints out of the list; "What went wrong" has them.
        self._mirrorOutput = False
        super().stopTest(test)
        title = group_title(test)
        if title != self.group:
            self.group = title
            print(f"\n  {paint(title, '1')}", file=self.stream)
        if self.problem:
            mark, note = FAIL, ""
        elif self.skip_reason is not None:
            mark, note = SKIP, f"  (skipped: {self.skip_reason})"
        else:
            mark, note = PASS, ""
            self.passed += 1
        print(f"    {mark} {test_title(test)}{note}", file=self.stream, flush=True)


def print_problems(result, stream):
    problems = result.failures + result.errors + [
        (test, "Passed, but was expected to fail.\n") for test in result.unexpectedSuccesses
    ]
    if not problems:
        return
    print(f"\n{paint('What went wrong', '1;31')}", file=stream)
    for test, details in problems:
        print(f"\n{FAIL} {test.id()}\n{details}", end="", file=stream)


def print_warnings(caught, stream):
    messages = sorted({f"{w.category.__name__}: {w.message}" for w in caught})
    if messages:
        print(f"\n{paint('Warnings', '1;33')}", file=stream)
        for message in messages:
            print(f"  {message}", file=stream)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run tests with a readable report.")
    parser.add_argument("folders", nargs="*", help="Test folders; default: " + ", ".join(SUITES))
    folders = parser.parse_args().folders or list(SUITES)

    # Same imports as `PYTHONPATH=backend/src python -m unittest` from the root.
    sys.path[:0] = [str(ROOT / "backend/src"), str(ROOT)]
    os.chdir(ROOT)
    # Async tests run in asyncio debug mode, which logs a warning for any slow
    # step. Those timing messages do not affect whether a test passes.
    logging.getLogger("asyncio").setLevel(logging.ERROR)

    stream = sys.stdout
    result = ReadableResult(stream)
    started = perf_counter()
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("default")
        for folder in folders:
            label = SUITES.get(folder.rstrip("/"))
            print(paint(f"\n{label} tests ({folder})" if label else f"\n{folder}", "1;36"), file=stream)
            suite = unittest.TestLoader().discover(start_dir=folder, top_level_dir=folder)
            suite.run(result)
            result.group = None

    print_problems(result, stream)
    print_warnings(caught, stream)

    # A test with several failing subTests still counts as one failed test.
    failed = len({
        getattr(test, "test_case", test).id() for test, _ in result.failures + result.errors
    }) + len(result.unexpectedSuccesses)
    success = result.wasSuccessful() and result.testsRun > 0
    print(f"\n{'─' * 50}", file=stream)
    print(
        f"{PASS} {result.passed} passed   {FAIL} {failed} failed   "
        f"{SKIP} {len(result.skipped)} skipped   ({perf_counter() - started:.1f}s)",
        file=stream,
    )
    if result.testsRun == 0:
        print(paint("NO TESTS FOUND", "1;31"), file=stream)
    else:
        print(paint("ALL PASSED", "1;32") if success else paint("FAILED", "1;31"), file=stream)
    return 0 if success else 1


if __name__ == "__main__":
    raise SystemExit(main())
