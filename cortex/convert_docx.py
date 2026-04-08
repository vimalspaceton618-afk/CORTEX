#!/usr/bin/env python3
"""
Convert AI_Training_QA_Dataset_100K.docx to plain text questions file.
Usage: python convert_docx.py <input.docx> <output.txt>
"""

import sys
from pathlib import Path

try:
    import docx2txt
except ImportError:
    print("ERROR: Missing docx2txt. Install it:")
    print("  pip install docx2txt")
    sys.exit(1)


def extract_questions(docx_path: str, output_path: str):
    """Extract questions from .docx file and save as plain text (one per line)."""

    print(f"Extracting text from: {docx_path}")
    text = docx2txt.process(docx_path)

    # Split into lines and clean
    lines = text.split('\n')
    questions = []

    for line in lines:
        line = line.strip()
        if not line:
            continue
        # Skip headers, numbering, etc.
        if line.startswith('Q') and ':' in line:
            # Format: "Q1: What is AI?" -> "What is AI?"
            parts = line.split(':', 1)
            if len(parts) > 1:
                questions.append(parts[1].strip())
        elif line.startswith('#') or line.startswith('==='):
            # Skip markdown headers
            continue
        elif len(line) > 10 and line[0].isupper():
            # Likely a question (starts with capital, minimum length)
            questions.append(line)

    # Deduplicate
    unique_questions = list(dict.fromkeys(questions))

    print(f"Found {len(questions)} questions, {len(unique_questions)} unique")

    # Save to output file
    with open(output_path, 'w', encoding='utf-8') as f:
        for q in unique_questions:
            f.write(q + '\n')

    print(f"Saved to: {output_path}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python convert_docx.py <input.docx> <output.txt>")
        print("Example: python convert_docx.py AI_Training_QA_Dataset_100K.docx questions_100k.txt")
        sys.exit(1)

    input_docx = sys.argv[1]
    output_txt = sys.argv[2]

    if not Path(input_docx).exists():
        print(f"ERROR: File not found: {input_docx}")
        sys.exit(1)

    extract_questions(input_docx, output_txt)
