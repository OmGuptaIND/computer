#!/usr/bin/env python3
"""
Enrich a lead using Apollo.io API.

Usage:
    python enrich-lead.py --email john@acme.com --api-key YOUR_KEY

Returns JSON with person and company data.
Falls back gracefully if API key not provided or API fails.
"""

import argparse
import json
import sys

def enrich_with_apollo(email: str, api_key: str) -> dict:
    """Call Apollo People Match API to enrich a lead by email."""
    try:
        import requests
    except ImportError:
        return {
            "success": False,
            "error": "requests library not installed. Run: pip install requests",
            "data": None
        }

    try:
        resp = requests.post(
            "https://api.apollo.io/v1/people/match",
            json={"email": email, "api_key": api_key},
            timeout=15
        )

        if resp.status_code == 401:
            return {
                "success": False,
                "error": "Invalid Apollo API key",
                "data": None
            }

        if resp.status_code == 429:
            return {
                "success": False,
                "error": "Apollo API rate limit exceeded. Try again later.",
                "data": None
            }

        if resp.status_code != 200:
            return {
                "success": False,
                "error": f"Apollo API returned status {resp.status_code}",
                "data": None
            }

        body = resp.json()
        person = body.get("person")

        if not person:
            return {
                "success": False,
                "error": "No match found for this email",
                "data": None
            }

        org = person.get("organization") or {}

        return {
            "success": True,
            "error": None,
            "data": {
                "name": person.get("name"),
                "first_name": person.get("first_name"),
                "last_name": person.get("last_name"),
                "title": person.get("title"),
                "headline": person.get("headline"),
                "city": person.get("city"),
                "state": person.get("state"),
                "country": person.get("country"),
                "linkedin_url": person.get("linkedin_url"),
                "twitter_url": person.get("twitter_url"),
                "github_url": person.get("github_url"),
                "photo_url": person.get("photo_url"),
                "company": {
                    "name": org.get("name"),
                    "website_url": org.get("website_url"),
                    "industry": org.get("industry"),
                    "employee_count": org.get("estimated_num_employees"),
                    "annual_revenue": org.get("annual_revenue_printed"),
                    "founded_year": org.get("founded_year"),
                    "city": org.get("city"),
                    "state": org.get("state"),
                    "country": org.get("country"),
                    "description": (org.get("short_description") or "")[:200],
                    "keywords": (org.get("keywords") or [])[:10],
                    "technologies": (org.get("current_technologies") or [])[:15],
                }
            }
        }

    except requests.Timeout:
        return {
            "success": False,
            "error": "Apollo API request timed out",
            "data": None
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Enrichment failed: {str(e)}",
            "data": None
        }


def enrich_from_domain(email: str) -> dict:
    """Basic enrichment from email domain when no API key is available."""
    domain = email.split("@")[-1].lower()

    # Skip personal email providers
    personal_domains = {
        "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
        "aol.com", "icloud.com", "me.com", "mail.com",
        "protonmail.com", "hey.com", "fastmail.com"
    }

    if domain in personal_domains:
        return {
            "success": True,
            "error": None,
            "data": {
                "name": None,
                "title": None,
                "company": {
                    "name": None,
                    "website_url": None,
                    "industry": None,
                    "employee_count": None,
                    "is_personal_email": True
                }
            }
        }

    return {
        "success": True,
        "error": None,
        "data": {
            "name": None,
            "title": None,
            "company": {
                "name": domain.split(".")[0].title(),
                "website_url": f"https://{domain}",
                "industry": None,
                "employee_count": None,
                "is_personal_email": False
            }
        }
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Enrich a lead by email")
    parser.add_argument("--email", required=True, help="Lead's email address")
    parser.add_argument("--api-key", default="", help="Apollo.io API key (optional)")
    args = parser.parse_args()

    if args.api_key:
        result = enrich_with_apollo(args.email, args.api_key)
    else:
        result = enrich_from_domain(args.email)

    print(json.dumps(result, indent=2))
