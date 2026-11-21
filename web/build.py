#!/usr/bin/env python3
"""Bundle the dashboard into web/build so it opens straight from disk.

Browsers refuse JavaScript modules (import/export) on file:// pages. This
script joins the modules into one plain script (app.js), copies the page and
styles, and puts the vendored Three.js script next to them. Then it opens the
result.

    python3 build.py              macOS / Linux
    py build.py                   Windows
    python3 build.py --no-open    build only, do not open the browser
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
BUILD = ROOT / "build"
ENTRY = SRC / "main.js"
THREE = ROOT / "vendor" / "three" / "three.min.js"

IMPORT_RE = re.compile(
    r"""^import\s+(?P<body>.+?)\s+from\s+['"](?P<spec>[^'"]+)['"];?\s*$"""
)
EXPORT_RE = re.compile(r"^export\s+")
UNSUPPORTED_EXPORT_RE = re.compile(r"^export\s+(\{|default\b|\*)")
TOP_LEVEL_NAME_RE = re.compile(
    r"^(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)"
)


def parse(path: Path) -> tuple[list[Path], str, list[str]]:
    """Return local dependencies, the file with import/export removed, and its top-level names.

    The bundle puts every module in one scope, so the source has to stick to a simple
    style: one-line relative imports and `export` in front of a declaration. Anything
    else stops the build with a clear message instead of producing a broken page.
    Three.js is not imported; it is the global THREE from three.min.js.
    """
    deps: list[Path] = []
    lines: list[str] = []
    names: list[str] = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(keepends=True), 1):
        where = f"{path.relative_to(ROOT)}:{number}"
        stripped = line.strip()
        match = IMPORT_RE.match(stripped)
        if match:
            spec = match.group("spec")
            if not spec.startswith("."):
                raise SystemExit(f"{where}: only relative imports are supported, got '{spec}'")
            deps.append((path.parent / spec).resolve())
            continue
        if re.match(r"^import\s", stripped):
            raise SystemExit(f"{where}: keep each import on one line")
        if UNSUPPORTED_EXPORT_RE.match(line):
            raise SystemExit(f"{where}: write `export` directly in front of a declaration")
        declared = TOP_LEVEL_NAME_RE.match(EXPORT_RE.sub("", line, count=1))
        if declared:
            names.append(declared.group(1))
        lines.append(EXPORT_RE.sub("", line, count=1))
    return deps, "".join(lines), names


def bundle() -> str:
    order: list[Path] = []
    seen: set[Path] = set()
    visiting: set[Path] = set()
    bodies: dict[Path, str] = {}
    declared_in: dict[str, Path] = {}

    def visit(path: Path) -> None:
        if path in seen:
            return
        if path in visiting:
            raise SystemExit(f"import cycle involving {path}")
        if not path.is_file():
            raise SystemExit(f"missing module {path}")
        visiting.add(path)
        deps, body, names = parse(path)
        bodies[path] = body
        for name in names:
            other = declared_in.setdefault(name, path)
            if other != path:
                raise SystemExit(
                    f"'{name}' is declared at the top level of both "
                    f"{other.relative_to(ROOT)} and {path.relative_to(ROOT)}. "
                    "The bundle shares one scope, so rename one of them."
                )
        for dep in deps:
            visit(dep)
        visiting.remove(path)
        seen.add(path)
        order.append(path)

    visit(ENTRY.resolve())
    parts = ["(() => {", '"use strict";', ""]
    for path in order:
        relative = path.relative_to(SRC)
        parts.append(f"// --- {relative} ---")
        parts.append(bodies[path].rstrip())
        parts.append("")
    parts.append("})();")
    parts.append("")
    return "\n".join(parts)


def page() -> str:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css_tag = '<link rel="stylesheet" href="./src/styles/main.css" />'
    three_tag = '<script src="./vendor/three/three.min.js"></script>'
    module_tag = '<script type="module" src="./src/main.js"></script>'
    for tag in (css_tag, three_tag, module_tag, "  </body>"):
        if tag not in html:
            raise SystemExit(f"index.html no longer contains {tag}; update build.py to match")

    html = html.replace(css_tag, '<link rel="stylesheet" href="./main.css" />')
    # The module script becomes two plain scripts at the end of the page, so they
    # run after the HTML exists. Plain scripts also load from file://.
    for tag in (three_tag, module_tag):
        html = re.sub(r"\n[ \t]*" + re.escape(tag), "", html, count=1)
    scripts = (
        '    <script src="./three.min.js"></script>\n'
        '    <script src="./app.js"></script>\n'
    )
    return html.replace("  </body>", scripts + "  </body>", 1)


def open_page(index: Path) -> None:
    if sys.platform == "darwin":
        subprocess.run(["open", index], check=False)
        return
    if sys.platform == "win32":
        os.startfile(index)  # type: ignore[attr-defined]
        return
    webbrowser.open(index.as_uri())


def main() -> None:
    open_after = "--no-open" not in sys.argv[1:]
    if not THREE.is_file():
        raise SystemExit(f"missing {THREE}")
    if BUILD.exists():
        shutil.rmtree(BUILD)
    BUILD.mkdir()
    (BUILD / "app.js").write_text(bundle(), encoding="utf-8")
    (BUILD / "index.html").write_text(page(), encoding="utf-8")
    shutil.copyfile(SRC / "styles" / "main.css", BUILD / "main.css")
    shutil.copyfile(THREE, BUILD / "three.min.js")
    index = BUILD / "index.html"
    print(f"Built {index}")
    if open_after:
        print("Opening it in your browser. You can also double-click that file.")
        open_page(index)


if __name__ == "__main__":
    main()
