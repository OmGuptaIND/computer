import { execSync } from "node:child_process";

export interface NetworkToolInput {
  operation: "ports" | "curl" | "dns" | "ping";
  url?: string;
  host?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export const networkToolDefinition = {
  name: "network",
  description:
    "Network operations: scan listening ports, make HTTP requests, DNS lookups, ping hosts. " +
    "Use 'ports' to see what's running on this server, 'curl' for HTTP requests, " +
    "'dns' for domain lookups, 'ping' to check connectivity.",
  parameters: {
    type: "object" as const,
    properties: {
      operation: {
        type: "string",
        enum: ["ports", "curl", "dns", "ping"],
      },
      url: {
        type: "string",
        description: "URL for curl operation",
      },
      host: {
        type: "string",
        description: "Hostname for dns/ping operations",
      },
      method: {
        type: "string",
        description: "HTTP method for curl (default: GET)",
      },
      headers: {
        type: "object",
        description: "HTTP headers for curl",
      },
      body: {
        type: "string",
        description: "Request body for curl POST/PUT",
      },
    },
    required: ["operation"],
  },
};

export function executeNetwork(input: NetworkToolInput): string {
  const { operation, url, host, method = "GET", headers, body } = input;

  try {
    switch (operation) {
      case "ports": {
        try {
          return execSync("ss -tlnp 2>/dev/null || lsof -iTCP -sTCP:LISTEN -n -P 2>/dev/null", {
            encoding: "utf-8",
            timeout: 5_000,
          });
        } catch {
          return "Could not scan ports (ss and lsof not available)";
        }
      }

      case "curl": {
        if (!url) return "Error: url is required for curl operation";
        let cmd = `curl -sL --max-time 15 -X ${method}`;
        if (headers) {
          for (const [k, v] of Object.entries(headers)) {
            cmd += ` -H "${k}: ${v}"`;
          }
        }
        if (body) {
          cmd += ` -d '${body.replace(/'/g, "'\\''")}'`;
        }
        cmd += ` "${url}"`;
        const result = execSync(cmd, { encoding: "utf-8", timeout: 20_000 });
        if (result.length > 50_000) {
          return result.slice(0, 50_000) + "\n\n... (truncated)";
        }
        return result || "(empty response)";
      }

      case "dns": {
        if (!host) return "Error: host is required for dns operation";
        return execSync(`dig +short "${host}" 2>/dev/null || nslookup "${host}" 2>/dev/null`, {
          encoding: "utf-8",
          timeout: 10_000,
        });
      }

      case "ping": {
        if (!host) return "Error: host is required for ping operation";
        return execSync(`ping -c 3 "${host}"`, {
          encoding: "utf-8",
          timeout: 15_000,
        });
      }

      default:
        return `Unknown operation: ${operation}`;
    }
  } catch (err: any) {
    return `Error: ${err.message}`;
  }
}
