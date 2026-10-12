/**
 * systemd socket activation (sd_listen_fds(3)): when the unit is started through a `.socket` unit,
 * systemd passes the already-listening sockets starting at file descriptor 3 and sets
 * `LISTEN_PID` (must equal our own pid, otherwise the variables were inherited and are not ours)
 * and `LISTEN_FDS` (how many). Holding the port in `muonhub-agent-panel.socket` keeps it reserved
 * across daemon restarts, so no other local user can take it over and read the panel token that
 * `sudo muonhub-agent panel-url` hands out.
 */
export const SD_LISTEN_FDS_START = 3;

export interface ActivationEnv {
  [key: string]: string | undefined;
}

/**
 * Returns the descriptor of the passed panel socket, or `null` when not socket-activated (dev run,
 * or variables meant for another process). The variables are removed so child processes do not
 * inherit them.
 */
export function adoptListenFd(
  env: ActivationEnv = process.env,
  pid: number = process.pid,
): number | null {
  const listenPid = env["LISTEN_PID"];
  const listenFds = env["LISTEN_FDS"];
  delete env["LISTEN_PID"];
  delete env["LISTEN_FDS"];
  delete env["LISTEN_FDNAMES"];
  if (listenPid === undefined || listenFds === undefined) return null;
  if (!/^\d+$/.test(listenPid) || Number(listenPid) !== pid) return null;
  if (!/^\d+$/.test(listenFds) || Number(listenFds) < 1) return null;
  return SD_LISTEN_FDS_START;
}
