#!/usr/bin/env python3
"""
Run a command in a pseudo-terminal to capture real-time output.
This forces unbuffered output from commands that buffer when piped.
"""

import sys
import os
import pty
import select
import subprocess

def run_with_pty(cmd: list[str], input_data: str | None = None, log_file: str | None = None):
    """Run command in a PTY, streaming output in real-time."""

    # Create pseudo-terminal
    master_fd, slave_fd = pty.openpty()

    # Start process with PTY as stdout/stderr
    process = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=slave_fd,
        stderr=slave_fd,
        close_fds=True
    )

    os.close(slave_fd)  # Close slave in parent

    # Send input if provided
    if input_data:
        process.stdin.write(input_data.encode())
        process.stdin.close()

    output_chunks = []
    log_handle = open(log_file, 'w') if log_file else None

    try:
        while True:
            # Check if there's data to read
            ready, _, _ = select.select([master_fd], [], [], 0.1)

            if ready:
                try:
                    data = os.read(master_fd, 1024)
                    if not data:
                        break

                    text = data.decode('utf-8', errors='replace')
                    output_chunks.append(text)

                    # Print to stdout immediately
                    sys.stdout.write(text)
                    sys.stdout.flush()

                    # Write to log file
                    if log_handle:
                        log_handle.write(text)
                        log_handle.flush()

                except OSError:
                    break

            # Check if process has finished
            if process.poll() is not None:
                # Read any remaining data
                try:
                    while True:
                        ready, _, _ = select.select([master_fd], [], [], 0.1)
                        if not ready:
                            break
                        data = os.read(master_fd, 1024)
                        if not data:
                            break
                        text = data.decode('utf-8', errors='replace')
                        output_chunks.append(text)
                        sys.stdout.write(text)
                        sys.stdout.flush()
                        if log_handle:
                            log_handle.write(text)
                            log_handle.flush()
                except OSError:
                    pass
                break

    finally:
        os.close(master_fd)
        if log_handle:
            log_handle.close()

    return process.returncode, ''.join(output_chunks)


def main():
    if len(sys.argv) < 2:
        print("Usage: pty_runner.py <prompt_file> [log_file]", file=sys.stderr)
        sys.exit(1)

    prompt_file = sys.argv[1]
    log_file = sys.argv[2] if len(sys.argv) > 2 else None

    # Read the prompt
    with open(prompt_file, 'r') as f:
        prompt = f.read()

    # Run claude with the prompt via PTY
    cmd = ['claude', '-p']

    returncode, output = run_with_pty(cmd, input_data=prompt, log_file=log_file)

    sys.exit(returncode)


if __name__ == '__main__':
    main()
