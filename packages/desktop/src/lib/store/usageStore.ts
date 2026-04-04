/**
 * Usage stats domain store — analytics and token usage tracking.
 */

import { Channel } from '@anton/protocol'
import { create } from 'zustand'
import { connection } from '../connection.js'
import type { UsageStats } from './types.js'

interface UsageState {
  usageStats: UsageStats | null
  usageStatsLoading: boolean

  // Actions
  setUsageStats: (stats: UsageStats | null) => void
  requestUsageStats: () => void

  // Reset
  reset: () => void
}

export const usageStore = create<UsageState>((set) => ({
  usageStats: null,
  usageStatsLoading: false,

  setUsageStats: (stats) => set({ usageStats: stats, usageStatsLoading: false }),

  requestUsageStats: () => {
    set({ usageStatsLoading: true })
    connection.send(Channel.AI, { type: 'usage_stats' })
  },

  reset: () => set({ usageStats: null, usageStatsLoading: false }),
}))
