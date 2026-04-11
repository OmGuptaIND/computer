/**
 * Project domain store — projects, agents, project sessions.
 */

import type { AgentSession, Project } from '@anton/protocol'
import { create } from 'zustand'
import { connection } from '../connection'
import type { SessionMeta } from './types'

interface ProjectStoreState {
  projects: Project[]
  activeProjectId: string | null
  projectSessions: SessionMeta[]
  projectSessionsLoading: boolean
  projectAgents: AgentSession[]
  projectAgentsLoading: boolean

  setProjects: (projects: Project[]) => void
  addProject: (project: Project) => void
  updateProject: (project: Project) => void
  removeProject: (id: string) => void
  setActiveProject: (id: string | null) => void
  setProjectSessions: (sessions: SessionMeta[]) => void
  setProjectAgents: (agents: AgentSession[]) => void

  listProjects: () => void
  listProjectSessions: (projectId: string) => void
  listAgents: (projectId: string) => void

  reset: () => void
  resetTransient: () => void
}

export const projectStore = create<ProjectStoreState>((set, _get) => ({
  projects: [],
  activeProjectId: null,
  projectSessions: [],
  projectSessionsLoading: false,
  projectAgents: [],
  projectAgentsLoading: false,

  setProjects: (projects) => set({ projects }),

  addProject: (project) => set((s) => ({ projects: [...s.projects, project] })),

  updateProject: (project) =>
    set((s) => ({
      projects: s.projects.map((p) => (p.id === project.id ? project : p)),
    })),

  removeProject: (id) => set((s) => ({ projects: s.projects.filter((p) => p.id !== id) })),

  setActiveProject: (id) => {
    set({
      activeProjectId: id,
      projectSessions: [],
      projectSessionsLoading: !!id,
      projectAgents: [],
      projectAgentsLoading: !!id,
    })
    if (id) {
      connection.sendProjectSessionsList(id)
      connection.sendAgentsList(id)
    }
  },

  setProjectSessions: (sessions) =>
    set({ projectSessions: sessions, projectSessionsLoading: false }),

  setProjectAgents: (agents) => set({ projectAgents: agents, projectAgentsLoading: false }),

  listProjects: () => connection.sendProjectsList(),

  listProjectSessions: (projectId) => {
    set({ projectSessionsLoading: true })
    connection.sendProjectSessionsList(projectId)
  },

  listAgents: (projectId) => {
    set({ projectAgentsLoading: true })
    connection.sendAgentsList(projectId)
  },

  reset: () =>
    set({
      projects: [],
      activeProjectId: null,
      projectSessions: [],
      projectSessionsLoading: false,
      projectAgents: [],
      projectAgentsLoading: false,
    }),

  resetTransient: () =>
    set({
      projectSessions: [],
      projectSessionsLoading: false,
      projectAgents: [],
      projectAgentsLoading: false,
    }),
}))
