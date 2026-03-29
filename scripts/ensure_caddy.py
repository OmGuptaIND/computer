#!/usr/bin/env python3
"""Ensure Anton's Caddy routes are present. Safe to re-run."""
import os, sys

f = '/etc/caddy/Caddyfile'
if not os.path.exists(f):
    print('    No Caddyfile found, skipping')
    sys.exit(0)

content = open(f).read()
checks = ['_anton/oauth', '_anton/telegram', '/a/*', '/p/*', '_anton/*']
if all(c in content for c in checks):
    print('    Caddy routes already configured')
    sys.exit(0)

domain = content.split()[0]
new = f"""{domain} {{
    handle /_anton/oauth/* {{
        reverse_proxy localhost:9876
    }}
    handle /_anton/telegram/* {{
        reverse_proxy localhost:9876
    }}
    handle /a/* {{
        uri strip_prefix /a
        root * /home/anton/.anton/published
        file_server
    }}
    handle /p/* {{
        uri strip_prefix /p
        root * /home/anton/Anton
        file_server
    }}
    handle_path /_anton/* {{
        reverse_proxy localhost:9878
    }}
    reverse_proxy localhost:9876
}}
"""
open(f, 'w').write(new)
os.system('systemctl reload caddy 2>/dev/null || true')
print('    Caddy routes updated')
