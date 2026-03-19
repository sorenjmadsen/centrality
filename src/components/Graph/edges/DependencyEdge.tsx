import React from 'react'
import { getSmoothStepPath, type EdgeProps } from '@xyflow/react'

export function DependencyEdge({
  sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
}: EdgeProps) {
  const [pathD] = getSmoothStepPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
  })

  return (
    <>
      <defs>
        <marker
          id="dep-arrow"
          viewBox="0 0 12 12"
          refX="10"
          refY="6"
          markerWidth="8"
          markerHeight="8"
          orient="auto"
        >
          <path d="M 2 2 L 10 6 L 2 10" fill="none" stroke="#06b6d4" strokeWidth="1.5" />
        </marker>
      </defs>
      <path
        d={pathD}
        stroke="#06b6d4"
        strokeWidth={1.5}
        strokeDasharray="6 3"
        fill="none"
        markerEnd="url(#dep-arrow)"
        opacity={0.7}
      />
    </>
  )
}
