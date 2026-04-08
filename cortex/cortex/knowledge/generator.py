"""Question Generator for self-training curriculum."""

import random
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from .graph import KnowledgeGraph


# Seed questions by topic - will expand this
SEED_QUESTIONS = {
    'python': [
        "How do I validate an email address in Python?",
        "Write a Python function to reverse a string",
        "What's the difference between list and tuple?",
        "How do I read a file in Python?",
        "Explain Python decorators with an example",
        "What is a context manager and how do I create one?",
        "How do I handle exceptions in Python?",
        "Write a generator function that yields Fibonacci numbers",
        "What are *args and **kwargs?",
        "How do I use asyncio in Python?"
    ],
    'javascript': [
        "Explain closures in JavaScript",
        "What's the difference between == and ===?",
        "How do I make an HTTP request in JavaScript?",
        "Explain event bubbling",
        "What are Promises and async/await?",
        "How do I deep clone an object?",
        "What is the this keyword?",
        "Explain map, filter, and reduce",
        "How do I handle errors in async code?",
        "What are JavaScript modules?"
    ],
    'api': [
        "What is a REST API?",
        "How do I authenticate with an API?",
        "What are HTTP status codes?",
        "Explain rate limiting",
        "How do I use OAuth 2.0?",
        "What is GraphQL vs REST?",
        "How do I paginate API responses?",
        "How do I cache API calls?",
        "What are webhooks?",
        "How do I secure API endpoints?"
    ],
    'dns': [
        "What is a DNS A record?",
        "How do I set up a CNAME?",
        "What's the difference between A and AAAA records?",
        "How does DNS resolution work?",
        "What is DNS propagation?",
        "How do I configure MX records?",
        "What is DNSSEC?",
        "How do I use Cloudflare DNS?",
        "What are TXT records used for?",
        "How do I check DNS records using dig?"
    ],
    'git': [
        "How do I undo a git commit?",
        "What's the difference between merge and rebase?",
        "How do I resolve merge conflicts?",
        "How do I cherry-pick a commit?",
        "What is a detached HEAD?",
        "How do I amend a commit message?",
        "How do I ignore files in git?",
        "What are git hooks?",
        "How do I revert a merge?",
        "Explain git bisect"
    ]
}


def generate_training_questions(
    count: int = 100,
    seed_topics: List[str] = None,
    knowledge_graph: Optional[KnowledgeGraph] = None
) -> List[str]:
    """
    Generate training questions for self-learning.

    Args:
        count: Number of questions to generate
        seed_topics: List of topics to draw from (default: all)
        knowledge_graph: Optional knowledge graph to detect gaps

    Returns:
        List of questions
    """
    questions = []

    if seed_topics is None:
        seed_topics = list(SEED_QUESTIONS.keys())

    # 1. Start with seed questions
    for topic in seed_topics:
        if topic in SEED_QUESTIONS:
            questions.extend(SEED_QUESTIONS[topic])

    random.shuffle(questions)

    # 2. If knowledge graph provided, identify gaps and generate more
    if knowledge_graph:
        gap_questions = _generate_gap_questions(knowledge_graph, count - len(questions))
        questions.extend(gap_questions)

    # 3. If still not enough, paraphrase existing questions
    while len(questions) < count:
        if questions:
            base_question = random.choice(questions)
            paraphrased = _paraphrase_question(base_question)
            questions.append(paraphrased)
        else:
            break

    return questions[:count]


def _generate_gap_questions(knowledge_graph: KnowledgeGraph, count: int) -> List[str]:
    """
    Generate questions for topics with low coverage in knowledge graph.
    """
    gaps = []

    # Get top topics with least entries
    stats = knowledge_graph.get_stats()
    by_topic = stats.get('by_topic', {})

    # Find underrepresented topics
    all_topics = SEED_QUESTIONS.keys()
    for topic in all_topics:
        current = by_topic.get(topic, 0)
        if current < 10:  # Need more data
            if topic in SEED_QUESTIONS:
                gaps.extend(SEED_QUESTIONS[topic][:5])  # Add 5 from that topic

    random.shuffle(gaps)
    return gaps[:count]


def _paraphrase_question(question: str) -> str:
    """
    Create a variation of the question.
    Simple heuristics - upasi with LLM-based paraphrasing later.
    """
    prefixes = [
        "How can I",
        "What's the best way to",
        "Explain how to",
        "I need to know how to",
        "Can you show me how to",
        "Please describe:"
    ]

    suffixes = [
        " in Python",
        " using modern tools",
        " with examples",
        " step by step",
        " for beginners",
        " efficiently"
    ]

    choice = random.random()

    if choice < 0.3:
        prefix = random.choice(prefixes)
        return f"{prefix} {question[0].lower() + question[1:]}"
    elif choice < 0.6:
        suffix = random.choice(suffixes)
        return f"{question}{suffix}"
    else:
        return question  # Keep original sometimes


def generate_mcq(question: str, choices: List[str], correct_index: int) -> Dict[str, Any]:
    """
    Generate a multiple-choice question format.
    Useful for testing model accuracy.
    """
    return {
        'type': 'multiple_choice',
        'question': question,
        'choices': choices,
        'correct_index': correct_index,
        'correct_answer': choices[correct_index]
    }


def generate_from_pattern(pattern: str, variants: List[Dict[str, str]]) -> List[str]:
    """
    Generate questions from a pattern with variable substitution.

    Example:
        pattern = "How do I {verb} a {object} in {language}?"
        variants = [
            {'verb': 'validate', 'object': 'email', 'language': 'Python'},
            {'verb': 'parse', 'object': 'JSON', 'language': 'JavaScript'}
        ]
    """
    questions = []
    for variant in variants:
        question = pattern.format(**variant)
        questions.append(question)
    return questions


# Curriculum learning: progress from easy to hard
CURRICULUM_STAGES = {
    'beginner': [
        'basic syntax questions',
        'simple function definitions',
        'what is X questions'
    ],
    'intermediate': [
        'code optimization',
        'debugging scenarios',
        'API integration'
    ],
    'advanced': [
        'distributed systems',
        'complex algorithms',
        'performance tuning'
    ],
    'expert': [
        'novel architecture design',
        'theoretical CS problems',
        'cutting-edge research topics'
    ]
}


def get_curriculum_stage(knowledge_size: int) -> str:
    """
    Determine appropriate curriculum stage based on knowledge graph size.
    """
    if knowledge_size < 100:
        return 'beginner'
    elif knowledge_size < 1000:
        return 'intermediate'
    elif knowledge_size < 10000:
        return 'advanced'
    else:
        return 'expert'
