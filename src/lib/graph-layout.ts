import type { Node, Edge } from '@xyflow/react'
import type { CodebaseNode } from '../types/codebase'
import type { DepEdge } from '../stores/graph-store'
import { dominantActionType } from './action-mapper'

const FILE_WIDTH = 170
const FILE_HEIGHT = 68
const DIR_HEIGHT = 48
const SYMBOL_HEIGHT = 46
const V_GAP = 6
const INDENT_X = 220

export interface NodeData extends Record<string, unknown> {
  label: string
  nodeType: CodebaseNode['type']
  actions: CodebaseNode['actions']
  dominantAction: string | null
  activeAction: string | null   // dominant action from the current exchange only
  isPulsing: boolean
  isCompare?: boolean
  language?: string
  startLine?: number
  endLine?: number
}

const SYMBOL_TYPES = new Set(['class', 'function', 'method', 'type', 'enum', 'interface', 'struct'])

export function buildGraphFromNodes(
  nodes: Map<string, CodebaseNode>,
  rootIds: string[],
  pulsingNodeIds: Set<string> = new Set(),
  granularity: 'files' | 'symbols' = 'files',
  depEdges: DepEdge[] = [],
  compareNodeIds: Set<string> = new Set()
): { nodes: Node[]; edges: Edge[] } {
  const rfNodes: Node[] = []
  const rfEdges: Edge[] = []
  let yOffset = 0
  const renderedIds = new Set<string>()

  function layoutNode(id: string, depth: number) {
    const node = nodes.get(id)
    if (!node) return

    const isSymbol = SYMBOL_TYPES.has(node.type)

    // In 'files' granularity, skip symbol nodes
    if (granularity === 'files' && isSymbol) return

    const isDir = node.type === 'directory'
    const h = isDir ? DIR_HEIGHT : isSymbol ? SYMBOL_HEIGHT : FILE_HEIGHT
    const x = depth * INDENT_X

    const data: NodeData = {
      label: node.name,
      nodeType: node.type,
      actions: node.actions,
      dominantAction: dominantActionType(node.actions),
      activeAction: null,
      isPulsing: pulsingNodeIds.has(id),
      isCompare: compareNodeIds.has(id),
      language: node.language,
      startLine: node.startLine,
      endLine: node.endLine,
    }

    const rfType = isDir ? 'directoryNode' : isSymbol ? 'symbolNode' : 'fileNode'

    rfNodes.push({
      id,
      type: rfType,
      position: { x, y: yOffset },
      data,
      style: { width: FILE_WIDTH },
    })

    renderedIds.add(id)
    yOffset += h + V_GAP

    for (const childId of node.children) {
      // Skip symbol children when in files granularity
      const child = nodes.get(childId)
      if (!child) continue
      if (granularity === 'files' && SYMBOL_TYPES.has(child.type)) continue

      rfEdges.push({
        id: `${id}→${childId}`,
        source: id || '__root__',
        target: childId,
        type: 'smoothstep',
        style: { stroke: '#3f3f46', strokeWidth: 1 },
      })
      layoutNode(childId, depth + 1)
    }
  }

  for (const id of rootIds) {
    layoutNode(id, 0)
  }

  // Add dashed dependency edges between rendered file nodes
  for (const dep of depEdges) {
    if (renderedIds.has(dep.source) && renderedIds.has(dep.target)) {
      rfEdges.push({
        id: `dep:${dep.source}→${dep.target}`,
        source: dep.source,
        target: dep.target,
        type: 'smoothstep',
        style: {
          stroke: '#52525b',
          strokeWidth: 1,
          strokeDasharray: '4 2',
        },
        animated: false,
        label: '',
      })
    }
  }

  return { nodes: rfNodes, edges: rfEdges }
}
