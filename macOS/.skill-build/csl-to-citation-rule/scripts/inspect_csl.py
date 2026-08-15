#!/usr/bin/env python3
"""Print a compact JSON summary of a CSL style."""
import json, sys
import xml.etree.ElementTree as ET
from pathlib import Path

def local(tag): return tag.rsplit("}", 1)[-1]

def selected_attrs(element):
    keys = ("variable", "macro", "term", "form", "and", "delimiter", "prefix", "suffix",
            "font-style", "font-weight", "text-case", "quotes", "name-as-sort-order",
            "sort-separator", "initialize-with", "et-al-min", "et-al-use-first", "collapse")
    return {key: element.attrib[key] for key in keys if key in element.attrib}

def summarize(path):
    root = ET.parse(path).getroot()
    info = next((e for e in root if local(e.tag) == "info"), None)
    metadata = {}
    if info is not None:
        for child in info:
            name = local(child.tag)
            if name in {"title", "id", "updated", "summary"} and child.text:
                metadata[name] = child.text.strip()
    macros = {}
    for macro in (e for e in root if local(e.tag) == "macro"):
        macros[macro.attrib.get("name", "")] = [
            {"element": local(node.tag), **selected_attrs(node)} for node in macro.iter() if node is not macro
        ]
    sections = {}
    for section_name in ("citation", "bibliography"):
        section = next((e for e in root if local(e.tag) == section_name), None)
        if section is not None:
            sections[section_name] = {
                "attributes": dict(section.attrib),
                "elements": [{"element": local(node.tag), **selected_attrs(node)} for node in section.iter() if node is not section]
            }
    return {"file": str(path.resolve()), "style_attributes": dict(root.attrib), "metadata": metadata,
            "macros": macros, "sections": sections}

def main():
    if len(sys.argv) != 2: raise SystemExit("usage: inspect_csl.py STYLE.csl")
    try: print(json.dumps(summarize(Path(sys.argv[1])), ensure_ascii=False, indent=2))
    except (OSError, ET.ParseError) as error: raise SystemExit(f"CSL parse failed: {error}")

if __name__ == "__main__": main()
