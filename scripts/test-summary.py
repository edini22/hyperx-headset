"""Print a Markdown summary of a JUnit XML report, for $GITHUB_STEP_SUMMARY."""

import sys
import xml.etree.ElementTree as ET


def main(report, title):
    root = ET.parse(report).getroot()
    suites = [root] if root.tag == "testsuite" else list(root.iter("testsuite"))
    counts = {key: sum(int(s.get(key, 0)) for s in suites) for key in ("tests", "failures", "errors", "skipped")}
    total, failures, errors, skipped = counts.values()
    seconds = sum(float(s.get("time", 0)) for s in suites)
    passed = total - failures - errors - skipped
    failed_cases = [
        f"{case.get('classname')}::{case.get('name')}"
        for case in root.iter("testcase")
        if case.find("failure") is not None or case.find("error") is not None
    ]

    print(f"### {'❌' if failed_cases else '✅'} {title}\n")
    print("| Passed | Failed | Errors | Skipped | Time |")
    print("| -----: | -----: | -----: | ------: | ---: |")
    print(f"| {passed} | {failures} | {errors} | {skipped} | {seconds:.2f} s |")
    if failed_cases:
        print("\n**Failed tests**\n")
        for case in failed_cases:
            print(f"- `{case}`")
    print()


if __name__ == "__main__":
    main(*sys.argv[1:3])
