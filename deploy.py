#!/usr/bin/env python3
"""Build the dashboard here, then deploy it with the GitHub Actions workflow.

GitHub builds the site again from your pushed code, so this script first checks
that everything is committed and pushed. Then it starts the workflow in
.github/workflows/deploy.yml and waits for it to finish.

    python3 deploy.py                  build, check, deploy, wait
    python3 deploy.py --no-watch       start the deploy and return right away
    python3 deploy.py --allow-unpushed deploy even with uncommitted or unpushed work
    python3 deploy.py --help

Needs git and the GitHub CLI (gh). On Windows use `py deploy.py`.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WORKFLOW = "deploy.yml"


class Stop(Exception):
    """A problem the person can fix; the message says how."""


def run(*command: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
    if check and result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise Stop(f"`{' '.join(command)}` failed:\n{detail}")
    return result


def output(*command: str) -> str:
    return run(*command).stdout.strip()


def build() -> None:
    print("Building web/build ...", flush=True)
    result = subprocess.run([sys.executable, str(ROOT / "web" / "build.py"), "--no-open"], cwd=ROOT)
    if result.returncode != 0:
        raise Stop("The build failed, see the message above.")


def check_tools() -> None:
    missing = [tool for tool in ("git", "gh") if shutil.which(tool) is None]
    if not missing:
        return
    raise Stop(
        f"Missing: {', '.join(missing)}.\n"
        "Install the GitHub CLI with `brew install gh` (macOS) or "
        "`winget install GitHub.cli` (Windows), and git from git-scm.com."
    )


def check_repo() -> str:
    """Return the GitHub repo as owner/name, or explain how to create it."""
    if run("git", "rev-parse", "--is-inside-work-tree", check=False).returncode != 0:
        raise Stop(
            "This folder is not a git repository yet. Create it and a GitHub repo with:\n"
            "  git init\n"
            "  git add -A\n"
            "  git commit -m 'Initial commit'\n"
            "  git branch -M main\n"
            "  gh repo create smart-dice --public --source . --push\n"
            "GitHub Pages is free for public repositories. Then run this script again."
        )
    if run("gh", "auth", "status", check=False).returncode != 0:
        raise Stop("You are not signed in to GitHub. Run `gh auth login`, then try again.")
    result = run("gh", "repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner", check=False)
    if result.returncode != 0 or not result.stdout.strip():
        raise Stop(
            "This repository has no GitHub remote yet. Create one with:\n"
            "  gh repo create smart-dice --public --source . --push"
        )
    return result.stdout.strip()


def check_pushed(allow_unpushed: bool) -> str:
    """Return the current branch. Stop if the deployed code would differ from yours."""
    branch = output("git", "rev-parse", "--abbrev-ref", "HEAD")
    problems: list[str] = []
    if output("git", "status", "--porcelain"):
        problems.append("You have uncommitted changes.")
    upstream = run("git", "rev-parse", "--abbrev-ref", f"{branch}@{{upstream}}", check=False)
    if upstream.returncode != 0:
        problems.append(f"Branch '{branch}' is not pushed to GitHub yet.")
    elif output("git", "rev-list", "--count", f"{upstream.stdout.strip()}..HEAD") != "0":
        problems.append("You have commits that are not pushed.")
    if problems and not allow_unpushed:
        raise Stop(
            " ".join(problems)
            + "\nGitHub deploys what is pushed. Commit and push first:\n"
            "  git add -A && git commit -m 'Update dashboard' && git push\n"
            "or run with --allow-unpushed to deploy the last pushed version."
        )
    if problems:
        print("Warning: " + " ".join(problems) + " Deploying the last pushed version.")
    return branch


def ensure_pages(repo: str) -> None:
    """Make sure the repo publishes Pages from GitHub Actions."""
    current = run("gh", "api", f"repos/{repo}/pages", check=False)
    if current.returncode == 0:
        return
    print("Turning on GitHub Pages (source: GitHub Actions) ...")
    created = run(
        "gh", "api", "-X", "POST", f"repos/{repo}/pages", "-f", "build_type=workflow", check=False
    )
    if created.returncode != 0:
        raise Stop(
            "Could not turn on GitHub Pages automatically (it needs admin rights, and a public "
            "repo on a free account).\nTurn it on by hand: GitHub repo > Settings > Pages > "
            "Source: GitHub Actions. Then run this script again."
        )


def start_deploy(branch: str) -> str:
    """Start the workflow and return the id of the run it created."""
    known = run(
        "gh", "run", "list", "--workflow", WORKFLOW, "--limit", "1", "--json", "databaseId",
        "-q", ".[0].databaseId", check=False,
    ).stdout.strip()
    run("gh", "workflow", "run", WORKFLOW, "--ref", branch)
    print(f"Started the '{WORKFLOW}' workflow on '{branch}'.")
    for _ in range(20):
        time.sleep(1.5)
        latest = run(
            "gh", "run", "list", "--workflow", WORKFLOW, "--limit", "1", "--json", "databaseId",
            "-q", ".[0].databaseId", check=False,
        ).stdout.strip()
        if latest and latest != known:
            return latest
    raise Stop("The workflow was started, but its run did not show up. Check the Actions tab.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build locally and deploy with GitHub Actions.")
    parser.add_argument("--no-watch", action="store_true", help="do not wait for the deploy")
    parser.add_argument(
        "--allow-unpushed",
        action="store_true",
        help="deploy even if you have uncommitted or unpushed work",
    )
    args = parser.parse_args()

    try:
        build()
        check_tools()
        repo = check_repo()
        branch = check_pushed(args.allow_unpushed)
        ensure_pages(repo)
        run_id = start_deploy(branch)
        url = run("gh", "run", "view", run_id, "--json", "url", "-q", ".url").stdout.strip()
        print(f"Run: {url}")
        if args.no_watch:
            return
        watched = subprocess.run(["gh", "run", "watch", run_id, "--exit-status"], cwd=ROOT)
        if watched.returncode != 0:
            raise Stop(f"The deploy failed. See the run for details: {url}")
        site = run("gh", "api", f"repos/{repo}/pages", "-q", ".html_url", check=False).stdout.strip()
        print(f"Deployed: {site or 'see the Pages settings of the repo'}")
    except Stop as problem:
        print(f"\n{problem}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
