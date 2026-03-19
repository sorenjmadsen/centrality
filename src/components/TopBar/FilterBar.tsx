import React from 'react'
import { useUiStore } from '../../stores/tab-stores'
import { ActionBadge } from '../Graph/overlays/ActionBadge'

const ACTION_TYPES = ['read', 'created', 'edited', 'deleted', 'executed', 'searched']

export function FilterBar() {
  const { actionTypeFilter, toggleActionTypeFilter, clearActionTypeFilter } = useUiStore()
  const isFiltered = actionTypeFilter.size > 0

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-zinc-600 uppercase tracking-wide shrink-0">Filter</span>
      {ACTION_TYPES.map(type => {
        const active = actionTypeFilter.size === 0 || actionTypeFilter.has(type)
        return (
          <button
            key={type}
            onClick={() => toggleActionTypeFilter(type)}
            className={`transition-opacity ${active ? 'opacity-100' : 'opacity-30'}`}
            title={type}
          >
            <ActionBadge actionType={type} />
          </button>
        )
      })}
      {isFiltered && (
        <button
          onClick={clearActionTypeFilter}
          className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors ml-1"
        >
          clear
        </button>
      )}
    </div>
  )
}
