#!/usr/bin/env python3
"""
Extract Q&A pairs from AI_Training_QA_Dataset_100K.docx more intelligently.
The docx contains numbered Q&A pairs like:
  Q1: What is AI?
  A1: Artificial Intelligence is...
"""

import sys
from pathlib import Path
import re

try:
    import docx2txt
except ImportError:
    print("ERROR: pip install docx2txt")
    sys.exit(1)


def extract_qa_pairs(docx_path: str, output_questions: str):
    """Extract questions from Q&A dataset."""

    print(f"Reading: {docx_path}")
    text = docx2txt.process(docx_path)

    # The docx has structured Q&A: Q1: ... A1: ... Q2: ... A2: ...
    # Let's extract all Q lines
    lines = text.split('\n')

    questions = []
    current_q = None

    for i, line in enumerate(lines):
        line = line.strip()

        # Skip empty lines and headers
        if not line or line.startswith(('AI Training', 'Total Q&A', 'Table of Contents', 'Note:', 'QUESTION & ANSWER', 'Based on:', 'High-Fidelity', 'Generation Method', 'Content Domain', 'Source Document', 'Question Categories', 'The dataset', 'This document', 'The Q&A pairs', 'Total:', '14', 'hybrid', 'Frontier AI')):
            continue

        # Check for question pattern: Q<number>: <text>
        q_match = re.match(r'^Q(\d+):\s*(.+)$', line, re.IGNORECASE)
        if q_match:
            current_q = q_match.group(2).strip()
            continue

        # Check for answer pattern: A<number>: <text> - skip
        a_match = re.match(r'^A(\d+):\s*', line, re.IGNORECASE)
        if a_match:
            # If we have a pending question, save it
            if current_q:
                questions.append(current_q)
                current_q = None
            continue

        # If line continues a question (multi-line), append
        if current_q and not a_match:
            current_q += ' ' + line

    # Save
    unique_questions = list(dict.fromkeys(questions))

    print(f"Extracted {len(questions)} questions")
    print(f"Unique: {len(unique_questions)}")

    with open(output_questions, 'w', encoding='utf-8') as f:
        for q in unique_questions:
            f.write(q + '\n')

    print(f"Saved to: {output_questions}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python extract_qa_from_docx.py <input.docx> <output_questions.txt>")
        sys.exit(1)

    extract_qa_pairs(sys.argv[1], sys.argv[2])
