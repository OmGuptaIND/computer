const { getDefaultConfig } = require('expo/metro-config')
const path = require('node:path')

const projectRoot = __dirname
const monorepoRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

// Watch the monorepo root for changes in other packages
config.watchFolders = [monorepoRoot]

// Resolve modules from both the project and monorepo root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
]

// Ensure @anton/protocol resolves to the workspace package
config.resolver.disableHierarchicalLookup = false

module.exports = config
