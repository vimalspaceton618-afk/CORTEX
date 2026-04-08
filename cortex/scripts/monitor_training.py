#!/usr/bin/env python3
"""Monitor training progress in real-time."""
import time
import sys
from pathlib import Path

log_file = Path("C:/Users/ADMIN/AppData/Local/Temp/claude/E--verai/6fc1d931-2bc1-4ac3-9edf-8fd9fa3202c4/tasks/bjlg4aszp.output")

if not log_file.exists():
    print(f"Log file not found: {log_file}")
    sys.exit(1)

print("Monitoring training progress...")
print("Press Ctrl+C to stop\n")

try:
    last_size = 0
    while True:
        current_size = log_file.stat().st_size
        if current_size > last_size:
            with open(log_file, 'r', encoding='utf-8', errors='ignore') as f:
                f.seek(last_size)
                new_content = f.read()
                print(new_content, end='')
                last_size = current_size

        # Check if training complete
        with open(log_file, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
            if "✅ PROCESSING COMPLETE" in content or "TRAINING COMPLETE" in content or "COMPLETE" in content and "DONE" in content:
                print("\n\n🎉 Training completed successfully!")
                break

        time.sleep(5)

except KeyboardInterrupt:
    print("\nMonitoring stopped.")
