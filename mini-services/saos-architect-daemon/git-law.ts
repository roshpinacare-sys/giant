/* ═══ git-law.ts — the git constitution, enforced INSIDE the daemon ═══════
 * Owner constitution (standing): every landed commit MUST be GPG-signed
 * (sovereign key E0E28CEB) and the push MUST be fetch→rebase→ff-only with
 * cloud==local identity proof. Until now the daemon trusted the ambient
 * gitconfig (commit.gpgsign=true on this runner). Zero-slop law: the daemon
 * carries its own constitution — signing is forced by argv, never trusted
 * to the environment (a runner that forgot the law cannot produce an
 * unsigned sovereign commit).
 */

/** argv for a GPG-forced commit: `-c commit.gpgsign=true commit -m <msg>`. */
export function commitArgs(msg: string): string[] {
  return ["-c", "commit.gpgsign=true", "commit", "-m", msg];
}

/** argv for the rebase step of the land loop (autoStash over live writers). */
export function rebaseArgs(): string[] {
  return ["-c", "rebase.autoStash=true", "rebase", "origin/main"];
}
