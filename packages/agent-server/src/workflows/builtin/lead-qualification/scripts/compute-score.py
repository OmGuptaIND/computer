#!/usr/bin/env python3
"""
Compute weighted lead score from dimension scores.

Usage (pipe JSON in):
    echo '{"company_fit": 35, "contact_fit": 25, "intent": 20}' | python compute-score.py

Or with arguments:
    python compute-score.py --company-fit 35 --contact-fit 25 --intent 20

Validates ranges, computes total, and returns classification.
"""

import argparse
import json
import sys


def compute_score(company_fit: int, contact_fit: int, intent: int) -> dict:
    """Compute total score and classification."""

    # Validate ranges
    company_fit = max(0, min(40, company_fit))
    contact_fit = max(0, min(30, contact_fit))
    intent = max(0, min(30, intent))

    total = company_fit + contact_fit + intent

    # Classify
    if total >= 80:
        label = "hot"
        action = "Send outreach immediately. High-priority follow up."
    elif total >= 60:
        label = "warm"
        action = "Send outreach, standard priority."
    elif total >= 40:
        label = "cool"
        action = "Log and monitor. No outreach yet."
    else:
        label = "skip"
        action = "Log as not a fit. No outreach."

    return {
        "total": total,
        "label": label,
        "action": action,
        "breakdown": {
            "company_fit": {"score": company_fit, "max": 40},
            "contact_fit": {"score": contact_fit, "max": 30},
            "intent": {"score": intent, "max": 30}
        }
    }


if __name__ == "__main__":
    # Try reading from stdin first (piped JSON)
    if not sys.stdin.isatty():
        try:
            data = json.load(sys.stdin)
            result = compute_score(
                company_fit=data.get("company_fit", 0),
                contact_fit=data.get("contact_fit", 0),
                intent=data.get("intent", 0)
            )
            print(json.dumps(result, indent=2))
            sys.exit(0)
        except json.JSONDecodeError:
            pass

    # Fall back to command-line arguments
    parser = argparse.ArgumentParser(description="Compute lead score")
    parser.add_argument("--company-fit", type=int, default=0, help="Company fit score (0-40)")
    parser.add_argument("--contact-fit", type=int, default=0, help="Contact fit score (0-30)")
    parser.add_argument("--intent", type=int, default=0, help="Intent score (0-30)")
    args = parser.parse_args()

    result = compute_score(args.company_fit, args.contact_fit, args.intent)
    print(json.dumps(result, indent=2))
