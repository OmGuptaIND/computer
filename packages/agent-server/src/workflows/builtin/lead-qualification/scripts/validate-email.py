#!/usr/bin/env python3
"""
Basic email validation — checks format and MX records.

Usage:
    python validate-email.py --email john@acme.com

Returns JSON with validation result.
Does NOT verify if the mailbox exists (no SMTP check) — just format + DNS.
"""

import argparse
import json
import re
import socket
import sys


def validate_email(email: str) -> dict:
    """Validate an email address format and check for MX records."""

    # Basic format check
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if not re.match(pattern, email):
        return {
            "valid": False,
            "email": email,
            "reason": "Invalid email format",
            "has_mx": False
        }

    domain = email.split("@")[-1].lower()

    # Check for known disposable email providers
    disposable = {
        "mailinator.com", "guerrillamail.com", "tempmail.com",
        "throwaway.email", "yopmail.com", "10minutemail.com",
        "trashmail.com", "getnada.com", "dispostable.com"
    }
    if domain in disposable:
        return {
            "valid": False,
            "email": email,
            "reason": "Disposable email provider",
            "has_mx": False
        }

    # Check MX records
    has_mx = False
    try:
        import subprocess
        result = subprocess.run(
            ["dig", "+short", "MX", domain],
            capture_output=True, text=True, timeout=5
        )
        has_mx = bool(result.stdout.strip())
    except Exception:
        # Fallback: try socket to check if domain resolves
        try:
            socket.getaddrinfo(domain, 25, socket.AF_INET)
            has_mx = True
        except socket.gaierror:
            has_mx = False

    if not has_mx:
        return {
            "valid": False,
            "email": email,
            "reason": f"No MX records found for domain: {domain}",
            "has_mx": False
        }

    # Check for known role-based addresses (less likely to be personal)
    local_part = email.split("@")[0].lower()
    role_addresses = {
        "info", "support", "admin", "sales", "contact",
        "hello", "help", "noreply", "no-reply", "postmaster",
        "webmaster", "abuse", "team", "office"
    }
    is_role = local_part in role_addresses

    return {
        "valid": True,
        "email": email,
        "reason": "Valid email" + (" (role-based address)" if is_role else ""),
        "has_mx": True,
        "is_role_address": is_role,
        "domain": domain
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Validate an email address")
    parser.add_argument("--email", required=True, help="Email address to validate")
    args = parser.parse_args()

    result = validate_email(args.email)
    print(json.dumps(result, indent=2))
