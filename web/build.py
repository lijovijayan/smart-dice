#!/usr/bin/env python3
"""Bundle the dashboard into web/build so it opens straight from disk.

Browsers refuse JavaScript modules (import/export) on file:// pages. This
script joins the modules into one plain script (app.js), joins the stylesheets
into one file (main.css), copies the page, and puts the vendored Three.js
script next to them. Then it opens the result.

    python3 build.py              macOS / Linux
    py build.py                   Windows
    python3 build.py --no-open    build only, do not open the browser

Each module gets its own scope in the bundle, so two files may use the same
top-level names. The source has to stick to a simple style, and the build stops
with a clear message when it does not:

    - one-line imports with names: import { a, b as c } from './x.js';
    - `export` directly in front of a declaration
    - relative imports only (Three.js is the global THREE)

The build also checks where files may import from, so pages stay independent:

    src/features/<name>/   its own folder, src/dice/, src/shared/
    src/app/               src/dice/, src/shared/, and (only app/features.js) the features
    src/dice/, src/shared/ each other only
"""

from __future__ import annotations

import json
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
STYLES = SRC / "styles" / "index.css"
THREE = ROOT / "vendor" / "three" / "three.min.js"
FEATURE_REGISTRY = "app/features.js"

IMPORT_RE = re.compile(
    r"""^import\s+\{(?P<names>[^}]*)\}\s+from\s+['"](?P<spec>[^'"]+)['"];?\s*$"""
)
EXPORT_RE = re.compile(r"^export\s+")
UNSUPPORTED_EXPORT_RE = re.compile(r"^export\s+(\{|default\b|\*)")
TOP_LEVEL_NAME_RE = re.compile(
    r"^(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)"
)
CSS_IMPORT_RE = re.compile(r"""^@import\s+['"](?P<spec>[^'"]+)['"];[ \t]*$""", re.MULTILINE)


def rel(path: Path) -> str:
    """Path of a source file relative to src/, with forward slashes."""
    return path.relative_to(SRC).as_posix()


def layer(path: Path) -> str:
    """Which part of the app a file belongs to: features/<name>, app, dice, shared, or main."""
    parts = path.relative_to(SRC).parts
    if parts[0] == "features" and len(parts) > 2:
        return f"features/{parts[1]}"
    return parts[0] if len(parts) > 1 else "main"


def check_boundary(importer: Path, imported: Path) -> None:
    """Stop the build when a file imports from somewhere it should not."""
    source, target = layer(importer), layer(imported)
    if source == target or source == "main":
        return

    problem = None
    if source.startswith("features/"):
        if target not in ("dice", "shared"):
            problem = (
                "a page may only import its own folder, src/dice/ and src/shared/. "
                "To share code between pages, move it into src/shared/."
            )
    elif source in ("dice", "shared"):
        if target not in ("dice", "shared"):
            problem = "src/dice/ and src/shared/ must not depend on pages or the app shell"
    elif source == "app":
        if target.startswith("features/"):
            if rel(importer) != FEATURE_REGISTRY:
                problem = f"only {FEATURE_REGISTRY} may import pages, so the rest of the shell stays page-agnostic"
        elif target not in ("dice", "shared"):
            problem = "the app shell may only import src/app/, src/dice/ and src/shared/"

    if problem:
        raise SystemExit(f"{rel(importer)} imports {rel(imported)}: {problem}")


def parse(path: Path) -> tuple[list[tuple[Path, list[tuple[str, str]]]], str, list[str]]:
    """Return imports, the file with import/export removed, and the names it exports.

    Each import is (module path, [(name in that module, name used here)]).
    """
    imports: list[tuple[Path, list[tuple[str, str]]]] = []
    lines: list[str] = []
    exported: list[str] = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(keepends=True), 1):
        where = f"{path.relative_to(ROOT)}:{number}"
        stripped = line.strip()
        match = IMPORT_RE.match(stripped)
        if match:
            spec = match.group("spec")
            if not spec.startswith("."):
                raise SystemExit(f"{where}: only relative imports are supported, got '{spec}'")
            bindings: list[tuple[str, str]] = []
            for item in match.group("names").split(","):
                item = item.strip()
                if not item:
                    continue
                name, _, alias = item.partition(" as ")
                bindings.append((name.strip(), (alias or name).strip()))
            imports.append(((path.parent / spec).resolve(), bindings))
            continue
        if re.match(r"^import\s", stripped):
            raise SystemExit(
                f"{where}: write each import on one line with names, like "
                "import { a, b } from './x.js';"
            )
        if UNSUPPORTED_EXPORT_RE.match(line):
            raise SystemExit(f"{where}: write `export` directly in front of a declaration")
        if EXPORT_RE.match(line):
            declared = TOP_LEVEL_NAME_RE.match(EXPORT_RE.sub("", line, count=1))
            if not declared:
                raise SystemExit(f"{where}: could not tell what this export declares")
            exported.append(declared.group(1))
        lines.append(EXPORT_RE.sub("", line, count=1))
    return imports, "".join(lines), exported


def bundle() -> str:
    order: list[Path] = []
    seen: set[Path] = set()
    visiting: set[Path] = set()
    modules: dict[Path, tuple[list[tuple[Path, list[tuple[str, str]]]], str, list[str]]] = {}

    def visit(path: Path) -> None:
        if path in seen:
            return
        if path in visiting:
            raise SystemExit(f"import cycle involving {path}")
        if not path.is_file():
            raise SystemExit(f"missing module {path}")
        visiting.add(path)
        parsed = parse(path)
        modules[path] = parsed
        for dep, _ in parsed[0]:
            if SRC not in dep.parents:
                raise SystemExit(f"{rel(path)} imports {dep}, which is outside src/")
            visit(dep)
            check_boundary(path, dep)
        visiting.remove(path)
        seen.add(path)
        order.append(path)

    visit(ENTRY.resolve())

    # Each name an import asks for must be exported by that module.
    for path, (imports, _, _) in modules.items():
        for dep, bindings in imports:
            available = modules[dep][2]
            for name, _ in bindings:
                if name not in available:
                    raise SystemExit(f"{rel(path)} imports '{name}' from {rel(dep)}, which does not export it")

    parts = ["(() => {", '"use strict";', "const __modules = {};", ""]
    for path in order:
        imports, body, exported = modules[path]
        parts.append(f"// --- {rel(path)} ---")
        parts.append(f"__modules[{json.dumps(rel(path))}] = (() => {{")
        for dep, bindings in imports:
            names = ", ".join(name if name == alias else f"{name}: {alias}" for name, alias in bindings)
            if names:
                parts.append(f"const {{ {names} }} = __modules[{json.dumps(rel(dep))}];")
        parts.append(body.rstrip())
        parts.append(f"return {{ {', '.join(exported)} }};" if exported else "return {};")
        parts.append("})();")
        parts.append("")
    parts.append("})();")
    parts.append("")
    return "\n".join(parts)


def stylesheet() -> str:
    """The stylesheet with every `@import './x.css';` replaced by that file's contents."""
    included: set[Path] = set()

    def inline(path: Path) -> str:
        if not path.is_file():
            raise SystemExit(f"missing stylesheet {path}")
        included.add(path)

        def replace(match: re.Match[str]) -> str:
            dep = (path.parent / match.group("spec")).resolve()
            if dep in included:
                raise SystemExit(f"{rel(path)} imports {rel(dep)} a second time")
            return f"/* ---- {rel(dep)} ---- */\n{inline(dep)}"

        return CSS_IMPORT_RE.sub(replace, path.read_text(encoding="utf-8"))

    return inline(STYLES)


def page() -> str:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css_tag = '<link rel="stylesheet" href="./src/styles/index.css" />'
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
    # Build everything before touching web/build, so a mistake in the source
    # leaves the last good build in place.
    script, html, styles = bundle(), page(), stylesheet()
    if BUILD.exists():
        shutil.rmtree(BUILD)
    BUILD.mkdir()
    (BUILD / "app.js").write_text(script, encoding="utf-8")
    (BUILD / "index.html").write_text(html, encoding="utf-8")
    (BUILD / "main.css").write_text(styles, encoding="utf-8")
    shutil.copyfile(THREE, BUILD / "three.min.js")
    index = BUILD / "index.html"
    print(f"Built {index}")
    if open_after:
        print("Opening it in your browser. You can also double-click that file.")
        open_page(index)


if __name__ == "__main__":
    main()
