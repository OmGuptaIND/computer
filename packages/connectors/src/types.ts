import type { AgentTool } from '@mariozechner/pi-agent-core'

/**
 * Interface for direct API connectors.
 * Each connector wraps a service's REST/GraphQL API and exposes tools.
 */
export interface DirectConnector {
  readonly id: string
  readonly name: string

  /** Set the access token. Called on activation and token refresh. */
  setToken(accessToken: string): void

  /** Get all tools this connector provides. */
  getTools(): AgentTool[]

  /** Test the connection by making a lightweight API call. */
  testConnection(): Promise<{ success: boolean; error?: string; info?: string }>
}

/** Factory type for creating connector instances. */
export type ConnectorFactory = () => DirectConnector

/** Token getter function — resolves to a valid access token, handling refresh. */
export type TokenGetter = (provider: string) => Promise<string>
