#!/usr/bin/env python3
"""Validate a Citation Reviewer import JSON and declarative checks."""
import json, re, sys
from pathlib import Path

ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
ORDERS = {"author-year", "year-author", "appearance"}
CONDITIONS = {"mustMatch", "mustNotMatch"}

def validate(data):
    errors, warnings = [], []
    if not isinstance(data, dict): return ["top level must be an object"], warnings
    if data.get("schemaVersion") != 1: errors.append("schemaVersion must be 1")
    rule_id = data.get("id")
    if not isinstance(rule_id, str) or not ID_RE.fullmatch(rule_id): errors.append("id is missing or invalid")
    if rule_id == "apa7": errors.append("apa7 is a reserved id")
    if not isinstance(data.get("name"), str) or not data["name"].strip(): errors.append("name is required")
    if not isinstance(data.get("config"), dict): errors.append("config must be an object")
    if data.get("ruleType") == "independent":
        if "baseStyle" in data: errors.append("independent rules must omit baseStyle")
        rules = data.get("rules")
        if not isinstance(rules, dict): errors.append("independent rules require a rules object"); rules = {}
        order = data.get("config", {}).get("referenceOrder")
        if order is not None and order not in ORDERS: errors.append(f"unsupported referenceOrder: {order}")
        for group in ("reference", "inTextStructural", "inTextStyle"):
            checks = rules.get(group, [])
            if not isinstance(checks, list): errors.append(f"rules.{group} must be an array"); continue
            seen = set()
            for index, check in enumerate(checks):
                label = f"rules.{group}[{index}]"
                if not isinstance(check, dict): errors.append(f"{label} must be an object"); continue
                check_id = check.get("id")
                if not isinstance(check_id, str) or not check_id: warnings.append(f"{label} should have a stable id")
                elif check_id in seen: errors.append(f"duplicate id in {group}: {check_id}")
                else: seen.add(check_id)
                if check.get("condition") not in CONDITIONS: errors.append(f"{label}.condition is invalid")
                pattern = check.get("pattern")
                if not isinstance(pattern, str): errors.append(f"{label}.pattern must be a string")
                else:
                    try: re.compile(pattern, re.I if "i" in str(check.get("flags", "i")) else 0)
                    except re.error as error: errors.append(f"{label}.pattern is invalid: {error}")
                if not isinstance(check.get("message"), str) or not check["message"].strip(): errors.append(f"{label}.message is required")
    elif data.get("baseStyle") != "apa7": errors.append('use baseStyle "apa7" or ruleType "independent"')
    return errors, warnings

def main():
    if len(sys.argv) != 2: raise SystemExit("usage: validate_rule.py RULE.json")
    try: data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error: raise SystemExit(f"JSON read failed: {error}")
    errors, warnings = validate(data)
    for item in warnings: print(f"WARNING: {item}")
    for item in errors: print(f"ERROR: {item}")
    if errors: raise SystemExit(1)
    print("OK: rule JSON is structurally valid")

if __name__ == "__main__": main()
