#!/usr/bin/env python3
"""PreToolUse(Bash) guard: hold commit messages to the CLAUDE.md budget.

Rationale belongs in doc/03-decisions.md, not in git history. This blocks a
`git commit` whose message overruns the budget and says what to do instead.

Fails open on purpose: anything it cannot confidently parse is allowed through.
A guard that blocks on its own confusion is worse than no guard.
"""
import json
import re
import shlex
import sys

SUBJECT_MAX = 72
BODY_LINES_MAX = 10
BODY_WORDS_MAX = 120

TRAILER = re.compile(r"^(co-authored-by|signed-off-by|change-id):", re.I)
EXCEPTION = re.compile(r"^Budget-exception:\s*\S", re.M)
# Deliberately loose: catches `git -C dir commit`, `git -c k=v commit`, etc.
# Over-matching is harmless -- a command with no parseable message is allowed.
IS_COMMIT = re.compile(r"\bgit\b[^\n;|&]{0,200}?\bcommit\b")
# --amend --no-edit, -C <commit>, --fixup/--squash reuse an existing message.
REUSES_MESSAGE = re.compile(r"--no-edit|--fixup|--squash|(?:^|\s)-C\s|--reuse-message|--reedit-message")
# Only a heredoc bound to -m/-F is the commit message. Matching any heredoc in
# the command would mistake an unrelated `cat <<EOF > notes.md` for the message.
HEREDOC = re.compile(
    r"(?:-m|--message|-F|--file)[=\s]+[\"']?\$\(\s*cat\s*"
    r"<<-?\s*['\"]?([A-Za-z_][A-Za-z0-9_]*)['\"]?\s*\n(.*?)\n[ \t]*\1\b",
    re.S,
)


def extract_message(cmd):
    """Return the commit message, or None if it cannot be determined."""
    heredoc = HEREDOC.search(cmd)
    if heredoc:
        return heredoc.group(2)

    try:
        tokens = shlex.split(cmd)
    except ValueError:
        return None

    parts, i = [], 0
    while i < len(tokens):
        tok = tokens[i]
        if tok in ("-m", "--message"):
            if i + 1 < len(tokens):
                parts.append(tokens[i + 1])
                i += 1
        elif tok.startswith("--message="):
            parts.append(tok.split("=", 1)[1])
        elif tok.startswith("-m") and len(tok) > 2:
            parts.append(tok[2:])
        elif tok in ("-F", "--file") or tok.startswith("--file="):
            return None  # message lives in a file we are not going to read
        i += 1
    return "\n\n".join(parts) if parts else None


def violations(message):
    lines = message.strip().splitlines()
    if not lines:
        return []

    subject = lines[0].strip()
    body = [
        ln for ln in lines[1:]
        if ln.strip() and not TRAILER.match(ln.strip())
    ]

    found = []
    if len(subject) > SUBJECT_MAX:
        found.append("subject is %d chars (max %d)" % (len(subject), SUBJECT_MAX))
    if len(body) > BODY_LINES_MAX:
        found.append("body is %d lines (max %d)" % (len(body), BODY_LINES_MAX))
    words = sum(len(ln.split()) for ln in body)
    if words > BODY_WORDS_MAX:
        found.append("body is %d words (max %d)" % (words, BODY_WORDS_MAX))
    return found


def main():
    try:
        payload = json.load(sys.stdin)
    except (ValueError, OSError):
        return 0

    if payload.get("tool_name") != "Bash":
        return 0
    cmd = payload.get("tool_input", {}).get("command", "")
    match = IS_COMMIT.search(cmd)
    if not match:
        return 0
    # Only look for reuse flags after the `commit` keyword: `git -C dir commit`
    # means run-in-directory, while `commit -C <ref>` means reuse that message.
    if REUSES_MESSAGE.search(cmd[match.end():]):
        return 0

    message = extract_message(cmd)
    if message is None or EXCEPTION.search(message):
        return 0

    found = violations(message)
    if not found:
        return 0

    sys.stderr.write(
        "Commit message over budget: %s.\n\n"
        "Per CLAUDE.md: the commit says WHAT changed and cites the record; the\n"
        "reasoning goes in doc/03-decisions.md as a D-nn entry and the behaviour in\n"
        "doc/01-requirements.md as FR-nn. Budget is subject <=%d chars, body <=%d\n"
        "lines and <=%d words.\n\n"
        "Do not compress the essay to fit -- move it. Write the rationale to\n"
        "doc/03-decisions.md, then cite it (\"Implements FR-nn; see D-nn.\") and\n"
        "commit again.\n"
        % ("; ".join(found), SUBJECT_MAX, BODY_LINES_MAX, BODY_WORDS_MAX)
    )
    return 2


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        # A bug in this guard must never block an unrelated Bash call.
        sys.exit(0)
