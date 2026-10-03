# Remote access to the detector PC (Tailscale)

> Goal: reach the university detector PC (Ubuntu) from the maintainer's laptop (Windows + WSL2)
> over SSH — to inspect serial ports, capture data formats, and later manage the MuonHub agent —
> without opening any port on the university network.
>
> **Tailscale** builds a private network (a "tailnet") between your own devices, encrypted end to
> end. Facts marked **[verified]** were checked against the Tailscale documentation on 2026-10-02;
> **(verify)** marks steps to confirm at install time.

## 1. Detector PC (Ubuntu) — done on site

1. Install with the official script **[verified]**:
   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   ```
2. Join the tailnet **[verified]**:
   ```bash
   sudo tailscale up
   ```
   It prints a URL. Open it, sign in with **the same account you will use on the laptop**, and
   approve the machine. It then appears on the **Machines** page of the Tailscale admin console.
3. Enable Tailscale SSH **[verified]**:
   ```bash
   sudo tailscale set --ssh
   ```
   ⚠️ Running this makes any SSH session already open to this machine's Tailscale IP hang. Do it
   before relying on remote SSH, not during a remote session.
4. **Disable key expiry for this machine.** Machine keys expire after 180 days by default
   **[verified]**; an unattended lab PC would silently drop off the tailnet. In the admin console:
   **Machines** → the detector PC → menu (⋯) → **Disable key expiry** **[verified]**. Tailscale
   suggests this for trusted servers and hard-to-reach devices.
5. Note the machine's name and its `100.x.y.z` address (`tailscale ip -4`).

Tailscale SSH works on Linux and macOS machines. Windows cannot act as a Tailscale SSH server
**[verified]** — that does not matter here, because the laptop is only the client.

## 2. Laptop (Windows + WSL2)

1. Install the Tailscale app for Windows from <https://tailscale.com/download> and sign in with the
   **same account**.
2. From WSL, connect with SSH. Clients work from any OS **[verified]**:
   ```bash
   ssh <ubuntu-user>@<machine-name>      # with MagicDNS
   ssh <ubuntu-user>@100.x.y.z           # with the Tailscale IP
   ```
3. **(verify)** Whether WSL2 reaches the tailnet through the Windows Tailscale app depends on the WSL
   networking mode. If `ssh` from WSL cannot reach `100.x.y.z`, try from Windows PowerShell
   (`ssh` is built into Windows), or install Tailscale inside WSL as a separate machine. MagicDNS
   names may not resolve inside WSL; the `100.x.y.z` address always works once routing does.
4. **First connection:** the default tailnet policy uses SSH **check mode** — you re-authenticate in
   the browser periodically (every 12 hours by default) **[verified]**. That is expected, not an
   error.

## 3. Safety

- Only your own devices should be in the tailnet. Do not share the detector PC with other accounts.
- Protect the account you sign in with (two-factor authentication on that identity provider).
- Remove devices you no longer use from the **Machines** page.
- Keep the default SSH policy (owner only, check mode) unless the Adjutant proposes a change in the
  chat.
- University IT rules for remote-access software are unknown — check them if in doubt.

## 4. Which program is reading the serial port? (read-only)

These commands only **look**; they do not open or disturb the port.

```bash
ls -l /dev/serial/by-id/          # stable device names → which /dev/ttyUSB* or /dev/ttyACM* they point to
sudo fuser -v /dev/ttyUSB0        # who has the port open (use the real tty from the line above)
sudo lsof /dev/ttyUSB0            # same information, more detail
ps -fp <PID>                      # the full command line of that process
```

How to read the result:
- a `chrome` / `chromium` process → v5 is reading through **Web Serial** in the browser;
- a `python3 … serial_bridge.py` process → v5 is reading through its **Python bridge**
  (`ws://localhost:8765`; see [`docs/archive/v5/V5-LEGACY-REFERENCE.md`](../archive/v5/V5-LEGACY-REFERENCE.md)).

Always prefer the `/dev/serial/by-id/...` path: `/dev/ttyUSB0` can change after a reboot or a
re-plug; the by-id name does not.

## 5. Capturing a data-format sample safely

A serial port has **one reader at a time**. To record what a detector really emits, the v5 reader
pauses for a few minutes. The maintainer accepted short pauses. A gap in v5 data is the only
side-effect.

1. **Pause v5.** Stop its reader the normal way: close the Web Serial connection in the browser, or
   stop the Python bridge with `Ctrl+C` (or `kill -INT <PID>`). Do not unplug the device.
2. **Confirm the port is free.** `sudo fuser -v /dev/serial/by-id/<device>` prints nothing.
3. **Capture the raw bytes**, read-only, for a fixed time (here 10 minutes):
   ```bash
   DEV=/dev/serial/by-id/<device>
   stty -F "$DEV" 9600 raw -echo
   timeout 600 cat "$DEV" > ~/muonhub-capture-$(date +%Y%m%dT%H%M%S).log
   ```
   - `raw -echo` ensures nothing is written back to the device.
   - 9600 baud is the CosmicWatch rate. For an unknown detector, if the file looks like garbage, try
     `115200` (and other common rates) — the wrong rate produces unreadable bytes.
   - Opening the port can reset an Arduino-based detector. It then prints its start-up header, which
     is useful for format discovery, and restarts its own event counter.
4. **Look at it:** `head -n 20 <file>` for text, `xxd <file> | head` for the exact bytes (line
   endings, separators).
5. **Resume v5.** Restart its reader and check that the v5 dashboard shows live data again.
6. **Bring the file to the laptop:** `scp <ubuntu-user>@<machine>:~/muonhub-capture-*.log .`
   Captures may later become test fixtures for the agent's parsers; they enter the repository only
   after review.

From milestone M1, the MuonHub agent mirrors every raw line to a log and a local socket, so the
stream can be watched remotely **without** pausing acquisition, and `muonhub-agent capture`
automates format discovery.
