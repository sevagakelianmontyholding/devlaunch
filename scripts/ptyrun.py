#!/usr/bin/env python3
# Runs a command inside a pseudo-terminal, relaying our stdin to it and its
# output to our stdout, and exits with the command's exit code. DevLaunch uses
# it so actions can prompt (php artisan migrate, npm init, …) and be answered
# from the browser. macOS's script(1) refuses to work without a tty; this does.
import fcntl
import os
import pty
import select
import struct
import sys
import termios

argv = sys.argv[1:]
if not argv:
    sys.exit("usage: pty.py command [args...]")

pid, fd = pty.fork()
if pid == 0:
    os.execvp(argv[0], argv)

# Match the size of the terminal panel in the browser.
cols = int(os.environ.get("PTY_COLS", "100"))
rows = int(os.environ.get("PTY_ROWS", "30"))
try:
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
except OSError:
    pass

stdin_open = True
while True:
    watch = [fd] + ([0] if stdin_open else [])
    try:
        ready, _, _ = select.select(watch, [], [], 0.25)
    except InterruptedError:
        continue
    if fd in ready:
        try:
            data = os.read(fd, 65536)
        except OSError:
            break
        if not data:
            break
        os.write(1, data)
    if 0 in ready:
        try:
            data = os.read(0, 65536)
        except OSError:
            data = b""
        if not data:
            stdin_open = False
        else:
            os.write(fd, data)
    done, status = os.waitpid(pid, os.WNOHANG)
    if done:
        # Drain whatever is left, then leave.
        while True:
            try:
                data = os.read(fd, 65536)
            except OSError:
                break
            if not data:
                break
            os.write(1, data)
        sys.exit(os.waitstatus_to_exitcode(status))

_, status = os.waitpid(pid, 0)
sys.exit(os.waitstatus_to_exitcode(status))
