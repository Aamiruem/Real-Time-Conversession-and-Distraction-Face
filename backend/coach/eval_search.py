"""How well does the coach find the right advice? Graded on everyday questions that mostly avoid the guide's wording.

    python -m coach.eval_search

Each question has a known right passage. Reports how often it comes first (hit@1), is in the top 3 (hit@3, what the
coach reads) and how high it ranks on average (MRR), per search method, so a change to search is judged by numbers.
"""
import re
import sys

from coach import assistant, semantic

CASES = [
    ("My mind goes blank from fear before I start talking", r"nerv|breath"),
    ("What colour shirt looks good on a webcam", r"colours"),
    ("Should I wear a suit to a bank job", r"Formal \(banks"),
    ("How long should each of my replies last", r"60.120 seconds"),
    ("I talk too quickly when I'm stressed", r"speed up"),
    ("My voice sounds flat and dull", r"monotone"),
    ("How do I get someone inside the company to recommend me", r"Referrals"),
    ("I have no work experience to show, what can I present", r"Build proof"),
    ("How much should I stare at the person asking", r"60.70%"),
    ("Several people are interviewing me, who do I look at", r"With a panel"),
    ("How early should I log in to an online meeting", r"join video calls"),
    ("My sentences sound like questions at the end", r"falling pitch"),
    ("How should I structure a story about a past challenge", r"STAR"),
    ("What should I learn about the employer beforehand", r"company website"),
    ("What do I do with my hands and legs while seated", r"cross your arms"),
    ("How do I get my resume past automated screening", r"applicant track"),
    ("Which little words make me sound weak", r"minimisers"),
    ("How do I describe my achievements strongly", r"action verbs"),
    ("Do I need nice trousers on a zoom interview", r"dress fully"),
    ("What should I wear to a startup", r"Smart casual"),
    ("How many times should I rehearse", r"Practise out loud"),
    ("How do I make a good impression in the opening moments", r"opening line|handshake|Arrive 10"),
    ("How do I find things in common with the people interviewing me", r"Look up your interviewers"),
    ("Should I tilt my head", r"head level"),
]
OFF_TOPIC = ["What is the best pizza in Delhi", "How do I fix a flat bicycle tyre", "Who won the cricket world cup",
             "What is the capital of Australia", "How do I bake sourdough bread"]


def score(rank_of) -> dict:
    ranks = []
    for question, answer in CASES:
        right = next((pos for pos, doc in enumerate(rank_of(question), 1) if re.search(answer, doc)), None)
        ranks.append(right)
    n = len(CASES)
    return {"hit@1": sum(r == 1 for r in ranks) / n, "hit@3": sum(r is not None and r <= 3 for r in ranks) / n,
            "mrr": sum(1 / r for r in ranks if r) / n}


def show(name: str, s: dict):
    print(f"  {name:<14} hit@1 {s['hit@1']:.0%}   hit@3 {s['hit@3']:.0%}   MRR {s['mrr']:.3f}")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    print(f"{len(CASES)} questions, {len(assistant._DOCS)} passages")
    show("keywords", score(lambda q: assistant.ranked_keywords(q)))
    if semantic.enabled():
        show("meaning", score(lambda q: [assistant._DOCS[i] for i, _ in semantic.search(q, assistant._DOCS)]))
        show("hybrid", score(lambda q: assistant.ranked_hybrid(q)))
        print("  off-topic best similarity:", {q[:24]: round(semantic.search(q, assistant._DOCS)[0][1], 2) for q in OFF_TOPIC})
    print("  off-topic answers:", {q[:24]: len(assistant.retrieve(q)) for q in OFF_TOPIC})


if __name__ == "__main__":
    main()
