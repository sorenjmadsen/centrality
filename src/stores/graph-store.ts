import { create } from 'zustand'
import type { Node, Edge } from '@xyflow/react'

export interface DepEdge {
  source: string
  target: string
}

interface GraphStore {
  nodes: Node[]
  edges: Edge[]
  depEdges: DepEdge[]
  setNodes(nodes: Node[]): void
  setEdges(edges: Edge[]): void
  setGraph(nodes: Node[], edges: Edge[]): void
  setDepEdges(edges: DepEdge[]): void
}

export const useGraphStore = create<GraphStore>(set => ({
  nodes: [],
  edges: [],
  depEdges: [],
  setNodes: nodes => set({ nodes }),
  setEdges: edges => set({ edges }),
  setGraph: (nodes, edges) => set({ nodes, edges }),
  setDepEdges: depEdges => set({ depEdges }),
}))
