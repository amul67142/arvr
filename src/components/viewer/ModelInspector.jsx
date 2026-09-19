import { memo, useCallback, useMemo, useState } from 'react'

import { useViewer } from '../../state/viewerStore'
import {
  filterHierarchy,
  formatBytes,
  formatCount,
  formatDimensions,
} from '../../utils/modelUtils'
import { ChevronIcon, CloseIcon, CubeIcon, SearchIcon } from '../common/Icons'

const AUTO_EXPAND_DEPTH = 1

const TreeNode = memo(function TreeNode({
  node,
  expandAll,
  selectedId,
  onFocus,
}) {
  const [open, setOpen] = useState(node.depth < AUTO_EXPAND_DEPTH)
  const hasChildren = node.children.length > 0
  const isOpen = expandAll || open

  return (
    <li>
      <div
        className="group flex items-center gap-1"
        style={{ paddingLeft: `${node.depth * 12}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-label={isOpen ? 'Collapse' : 'Expand'}
            data-open={isOpen}
            className="shrink-0 p-1 text-white/25 transition-transform duration-300 hover:text-white/60 data-[open=true]:rotate-90"
          >
            <ChevronIcon size={11} />
          </button>
        ) : (
          <span className="w-[19px] shrink-0" />
        )}

        <button
          type="button"
          onClick={() => onFocus(node)}
          data-selected={node.id === selectedId}
          className="min-w-0 flex-1 truncate py-1.5 text-left text-[13px] font-light text-white/55 transition-colors duration-300 hover:text-white data-[selected=true]:text-white"
        >
          <span className={node.isSelectable ? 'text-brass-300' : undefined}>
            {node.name}
          </span>
          {node.isMesh ? (
            <span className="ml-2 text-[10px] tracking-wider text-white/20">mesh</span>
          ) : null}
        </button>
      </div>

      {hasChildren && isOpen ? (
        <ul>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              expandAll={expandAll}
              selectedId={selectedId}
              onFocus={onFocus}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
})

function Stat({ label, value }) {
  return (
    <div>
      <p className="label text-white/30">{label}</p>
      <p className="mt-1.5 text-sm font-light tabular-nums text-white/80">{value}</p>
    </div>
  )
}

/**
 * The Model Inspector is the safety net for badly-named files: it exposes the
 * real object graph, lets any object be focused, and reports scene weight.
 */
export default function ModelInspector({ source }) {
  const { model, inspectorOpen, setInspectorOpen, focusObject, selectTower, selection } =
    useViewer()
  const [query, setQuery] = useState('')

  const normalizedQuery = query.trim().toLowerCase()

  const tree = useMemo(() => {
    if (!model?.tree) return null
    if (!normalizedQuery) return model.tree
    return filterHierarchy(model.tree, normalizedQuery)
  }, [model, normalizedQuery])

  const handleFocus = useCallback(
    (node) => {
      const tower = model?.towers.find((entry) => entry.object === node.object)
      if (tower) selectTower(tower)
      else focusObject(node.object)
    },
    [focusObject, model, selectTower],
  )

  const dimensions = model ? formatDimensions(model.bounds.size) : null

  return (
    <aside
      data-open={inspectorOpen}
      aria-hidden={!inspectorOpen}
      className="glass pointer-events-none absolute top-0 left-0 z-30 flex h-full w-full max-w-[368px] -translate-x-full flex-col border-r transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] data-[open=true]:pointer-events-auto data-[open=true]:translate-x-0 md:w-[368px]"
    >
      <header className="flex items-center justify-between px-7 pt-8 pb-6">
        <div className="flex items-center gap-3 text-white/85">
          <CubeIcon size={16} />
          <span className="label-lg">Model Inspector</span>
        </div>
        <button
          type="button"
          onClick={() => setInspectorOpen(false)}
          aria-label="Close inspector"
          className="ctrl -mr-2 px-3"
        >
          <CloseIcon size={16} />
        </button>
      </header>

      <div className="px-7 pb-6">
        <div className="flex items-center gap-3 border border-white/12 bg-white/[0.03] px-4 py-3">
          <span className="text-white/30">
            <SearchIcon size={14} />
          </span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search objects..."
            className="w-full bg-transparent text-[13px] font-light text-white/85 placeholder:text-white/25 focus:outline-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="text-white/30 transition-colors hover:text-white/70"
            >
              <CloseIcon size={13} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        {tree ? (
          <ul>
            <TreeNode
              node={tree}
              expandAll={Boolean(normalizedQuery)}
              selectedId={selection?.id ?? null}
              onFocus={handleFocus}
            />
          </ul>
        ) : (
          <p className="px-2 py-8 text-sm text-white/35">
            No objects match “{query}”.
          </p>
        )}

        {model?.treeTruncated ? (
          <p className="mt-4 px-2 text-[11px] leading-relaxed text-white/25">
            Hierarchy truncated — this model contains more objects than the
            inspector displays.
          </p>
        ) : null}
      </div>

      {model ? (
        <footer className="border-t border-white/10 px-7 py-7">
          <div className="grid grid-cols-2 gap-y-6">
            <Stat label="Objects" value={formatCount(model.stats.objects)} />
            <Stat label="Meshes" value={formatCount(model.stats.meshes)} />
            <Stat label="Selectable Towers" value={formatCount(model.towers.length)} />
            <Stat label="Model Size" value={formatBytes(source.size)} />
          </div>

          {dimensions ? (
            <div className="mt-7 grid grid-cols-3 gap-y-6 border-t border-white/10 pt-6">
              <Stat label="Width" value={dimensions.width} />
              <Stat label="Height" value={dimensions.height} />
              <Stat label="Depth" value={dimensions.depth} />
            </div>
          ) : null}

          <p className="mt-6 text-[11px] text-white/25">
            {formatCount(model.stats.triangles)} triangles ·{' '}
            {formatCount(model.stats.materials)} materials ·{' '}
            {model.shadowsEnabled ? 'shadows on' : 'shadows off for performance'}
          </p>
        </footer>
      ) : null}
    </aside>
  )
}
