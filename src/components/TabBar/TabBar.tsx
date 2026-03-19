import React from 'react'
import { LayoutDashboard, X } from 'lucide-react'
import { useTabsStore, type SessionTab } from '../../stores/tabs-store'
import { tabStoreMap } from '../../stores/tab-stores'

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useTabsStore()

  const handleTabClick = (tab: SessionTab) => {
    if (tab.id === activeTabId) return
    setActiveTab(tab.id)
  }

  const handleClose = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const { tabs: currentTabs, activeTabId: currentActive } = useTabsStore.getState()

    if (currentActive === id) {
      const idx = currentTabs.findIndex(t => t.id === id)
      const remaining = currentTabs.filter(t => t.id !== id)
      if (remaining.length > 0) {
        const next = idx > 0 ? remaining[idx - 1] : remaining[0]
        setActiveTab(next.id)
      } else {
        setActiveTab(null)
      }
    }

    closeTab(id)
    tabStoreMap.delete(id)
  }

  return (
    <div className="flex items-stretch h-9 bg-zinc-950 border-b border-zinc-800 shrink-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {/* Dashboard tab */}
      <button
        onClick={() => setActiveTab(null)}
        className={[
          'flex items-center gap-1.5 px-4 text-base shrink-0 border-r border-zinc-800 font-medium',
          'relative transition-colors select-none',
          activeTabId === null
            ? 'text-zinc-100 bg-zinc-900 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-blue-500'
            : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/60',
        ].join(' ')}
      >
        <LayoutDashboard size={13} />
        <span>Dashboard</span>
      </button>

      {/* Session tabs */}
      {tabs.map(tab => {
        const isActive = tab.id === activeTabId
        const date = new Date(tab.mtime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        const projectShort = tab.projectDisplayName.split('/').slice(-1)[0]

        return (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab)}
            className={[
              'group flex items-center gap-2 pl-4 pr-2 text-base shrink-0 border-r border-zinc-800',
              'relative transition-colors select-none',
              isActive
                ? 'text-zinc-100 bg-zinc-900 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-blue-500'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/60',
            ].join(' ')}
          >
            <span className="max-w-[160px] truncate">{projectShort} · {date}</span>
            <span
              role="button"
              aria-label="Close tab"
              onClick={e => handleClose(e, tab.id)}
              className={[
                'flex items-center justify-center w-4 h-4 rounded transition-colors',
                isActive
                  ? 'text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100'
                  : 'text-transparent group-hover:text-zinc-500 hover:!text-zinc-200 hover:bg-zinc-700',
              ].join(' ')}
            >
              <X size={10} />
            </span>
          </button>
        )
      })}
    </div>
  )
}
