export { ConnectorManager } from './connector-manager.js'
export type { DirectConnector, ConnectorFactory, TokenGetter } from './types.js'

export { SlackConnector } from './slack/index.js'
export { GitHubConnector } from './github/index.js'
export { GmailConnector } from './gmail/index.js'
export { NotionConnector } from './notion/index.js'
export { TelegramConnector } from './telegram/index.js'
export { ExaConnector } from './exa/index.js'

import type { ConnectorFactory } from './types.js'
import { SlackConnector } from './slack/index.js'
import { GitHubConnector } from './github/index.js'
import { GmailConnector } from './gmail/index.js'
import { NotionConnector } from './notion/index.js'
import { TelegramConnector } from './telegram/index.js'
import { ExaConnector } from './exa/index.js'

/** Built-in direct connector factories keyed by provider ID. */
export const CONNECTOR_FACTORIES: Record<string, ConnectorFactory> = {
  slack: () => new SlackConnector(),
  github: () => new GitHubConnector(),
  gmail: () => new GmailConnector(),
  notion: () => new NotionConnector(),
  telegram: () => new TelegramConnector(),
  'exa-search': () => new ExaConnector(),
}
