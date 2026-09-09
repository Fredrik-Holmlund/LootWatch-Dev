import React, { useState, useMemo, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { DndContext, DragOverlay, useDraggable, useDroppable, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAssignmentSheet, type SheetRow, type SheetCell, type SheetColumn, type CompPlayer } from '../../hooks/useAssignmentSheet';
import { getClassColor } from '../../utils/classColors';
import { canEditAssignments } from '../../types';
import type { UserRole } from '../../types';
import { supabase } from '../../utils/supabase';
import { HelpModal } from '../ui/HelpModal';

// ─── Raid markers ─────────────────────────────────────────────────────────────

const RAID_MARKERS = [
  { key: 'star',     label: 'Star'     },
  { key: 'circle',   label: 'Circle'   },
  { key: 'diamond',  label: 'Diamond'  },
  { key: 'triangle', label: 'Triangle' },
  { key: 'moon',     label: 'Moon'     },
  { key: 'square',   label: 'Square'   },
  { key: 'cross',    label: 'Cross'    },
  { key: 'skull',    label: 'Skull'    },
] as const;

function RaidMarkerIcon({ markerKey, size = 18 }: { markerKey: string; size?: number }) {
  const s = size;
  switch (markerKey) {
    case 'star':     return <svg width={s} height={s} viewBox="0 0 20 20"><path d="M10,0 L12.5,7.5 L20,10 L12.5,12.5 L10,20 L7.5,12.5 L0,10 L7.5,7.5 Z" fill="#FFD700" stroke="#B8960C" strokeWidth="0.5"/></svg>;
    case 'circle':   return <svg width={s} height={s} viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="#FF8000" stroke="#CC5500" strokeWidth="0.5"/><circle cx="10" cy="10" r="5" fill="none" stroke="#FFB060" strokeWidth="1.5" opacity="0.5"/></svg>;
    case 'diamond':  return <svg width={s} height={s} viewBox="0 0 20 20"><polygon points="10,1 19,10 10,19 1,10" fill="#9B30FF" stroke="#6600CC" strokeWidth="0.5"/><polygon points="10,5 15,10 10,15 5,10" fill="none" stroke="#CC88FF" strokeWidth="1" opacity="0.5"/></svg>;
    case 'triangle': return <svg width={s} height={s} viewBox="0 0 20 20"><polygon points="10,18 1,3 19,3" fill="#00BB00" stroke="#007700" strokeWidth="0.5"/><polygon points="10,14 5,6 15,6" fill="none" stroke="#88FF88" strokeWidth="1" opacity="0.4"/></svg>;
    case 'moon':     return (<svg width={s} height={s} viewBox="0 0 20 20"><defs><mask id="mm"><rect width="20" height="20" fill="white"/><circle cx="13.5" cy="10" r="7" fill="black"/></mask></defs><circle cx="10" cy="10" r="9" fill="#5BB8D4" mask="url(#mm)" stroke="#2288AA" strokeWidth="0.5"/></svg>);
    case 'square':   return <svg width={s} height={s} viewBox="0 0 20 20"><rect x="1.5" y="1.5" width="17" height="17" rx="2" fill="#4169E1" stroke="#2244AA" strokeWidth="0.5"/><rect x="5" y="5" width="10" height="10" rx="1" fill="none" stroke="#88AAFF" strokeWidth="1" opacity="0.4"/></svg>;
    case 'cross':    return <svg width={s} height={s} viewBox="0 0 20 20"><line x1="3" y1="3" x2="17" y2="17" stroke="#DD2222" strokeWidth="4.5" strokeLinecap="round"/><line x1="17" y1="3" x2="3" y2="17" stroke="#DD2222" strokeWidth="4.5" strokeLinecap="round"/></svg>;
    case 'skull':    return (<svg width={s} height={s} viewBox="0 0 20 20"><ellipse cx="10" cy="8.5" rx="7.5" ry="7" fill="#E0E0E0" stroke="#999" strokeWidth="0.5"/><rect x="5.5" y="14" width="9" height="5" rx="1.5" fill="#E0E0E0" stroke="#999" strokeWidth="0.5"/><circle cx="7.5" cy="8.5" r="2" fill="#555"/><circle cx="12.5" cy="8.5" r="2" fill="#555"/><line x1="10" y1="14.5" x2="10" y2="19" stroke="#aaa" strokeWidth="1.5"/><line x1="7.5" y1="14.5" x2="7.5" y2="19" stroke="#aaa" strokeWidth="1" opacity="0.5"/><line x1="12.5" y1="14.5" x2="12.5" y2="19" stroke="#aaa" strokeWidth="1" opacity="0.5"/></svg>);
    default:         return <span className="text-xs">{markerKey}</span>;
  }
}

function renderMarkerText(text: string): React.ReactNode {
  const parts = text.split(/(\{[a-z]+\})/g);
  if (parts.length === 1) return text;
  return <>{parts.map((p, i) => { const m = p.match(/^\{([a-z]+)\}$/); return m ? <RaidMarkerIcon key={i} markerKey={m[1]} size={14} /> : p ? <span key={i}>{p}</span> : null; })}</>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveColor(playerClass: string | null): string {
  if (!playerClass) return '#9ca3af';
  return playerClass.startsWith('#') ? playerClass : (getClassColor(playerClass) || '#9ca3af');
}

export const SECTION_ACCENT: Record<string, string> = {
  Tanks:        '#60a5fa',
  Healers:      '#34d399',
  Ranged:       '#a78bfa',
  Melee:        '#fb923c',
  'Clickers 1': '#f59e0b',
  'Clickers 2': '#ef4444',
  'Clickers 3': '#ec4899',
  'Clickers 4': '#8b5cf6',
  Misc:         '#6b7280',
};

const ACCENT_PALETTE = ['#60a5fa', '#34d399', '#a78bfa', '#fb923c', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#6b7280'];
function sectionAccent(section: string, idx: number): string {
  return SECTION_ACCENT[section] ?? ACCENT_PALETTE[idx % ACCENT_PALETTE.length];
}

// ─── Draggable player pill ────────────────────────────────────────────────────

function DraggablePlayerPill({ player }: { player: CompPlayer }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `p:${player.name}` });
  const color = player.color || getClassColor(player.className) || '#9ca3af';
  return (
    <div
      ref={setNodeRef}
      style={{ transform: transform ? `translate3d(${transform.x}px,${transform.y}px,0)` : undefined, backgroundColor: color + '22', color, borderColor: color + '55', zIndex: isDragging ? 50 : undefined, position: isDragging ? 'relative' : undefined }}
      {...listeners} {...attributes}
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-xs font-medium cursor-grab select-none whitespace-nowrap ${isDragging ? 'opacity-40' : 'hover:brightness-125'}`}
    >
      <span className="opacity-50 text-[10px]">{player.specName}</span>
      {player.name}
    </div>
  );
}

// ─── Player picker dropdown ───────────────────────────────────────────────────

function PlayerPicker({ anchor, compPool, profiles, onSelect, onClose }: {
  anchor: DOMRect; compPool: CompPlayer[]; profiles: string[];
  onSelect: (name: string, cls: string | null) => void; onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const options = useMemo(() => {
    const compNames = new Set(compPool.map(p => p.name.toLowerCase()));
    const compOptions = compPool.map(p => ({ name: p.name, cls: p.color || p.className }));
    const profileOnly = profiles
      .filter(name => !compNames.has(name.toLowerCase()))
      .map(name => ({ name, cls: null as string | null }));
    return [...compOptions, ...profileOnly];
  }, [compPool, profiles]);

  const filtered = search
    ? options.filter(o => o.name.toLowerCase().includes(search.toLowerCase()))
    : options;

  const style: React.CSSProperties = {
    position: 'fixed',
    top: anchor.bottom + 4,
    left: anchor.left,
    minWidth: Math.max(anchor.width, 180),
    zIndex: 9999,
  };

  return ReactDOM.createPortal(
    <>
      <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={onClose} />
      <div style={style} className="bg-[var(--color-lw-card)] border border-[var(--color-lw-border)] rounded-lg shadow-2xl max-h-[240px] flex flex-col overflow-hidden">
        <div className="p-1.5 border-b border-[var(--color-lw-border-sub)]">
          <input
            ref={inputRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Escape' && onClose()}
            placeholder="Search player…"
            className="w-full bg-[var(--color-lw-elevated)] border border-[var(--color-lw-border)] rounded px-2 py-1 text-xs text-[var(--color-lw-text)] focus:outline-none focus:border-[var(--color-lw-fel-400)]/50"
          />
        </div>
        <div className="overflow-y-auto">
          {filtered.map(o => {
            const color = resolveColor(o.cls);
            return (
              <button
                key={o.name}
                onClick={() => { onSelect(o.name, o.cls); onClose(); }}
                className="w-full text-left px-2 py-1 hover:bg-[var(--color-lw-elevated)]/60 transition-colors"
              >
                <span
                  style={{ backgroundColor: color + '28', borderColor: color + '55', color }}
                  className="inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full border"
                >
                  {o.name}
                </span>
              </button>
            );
          })}
          {filtered.length === 0 && <p className="text-[11px] text-[var(--color-lw-text-muted)] px-3 py-2 italic">No players found</p>}
        </div>
      </div>
    </>,
    document.body
  );
}

// ─── Droppable + draggable slot ───────────────────────────────────────────────

function DroppableSlot({ row, compPool, profiles, onAssign, onClear, canWrite }: {
  row: SheetRow; compPool: CompPlayer[]; profiles: string[];
  onAssign: (name: string, cls: string | null) => void;
  onClear: () => void; canWrite: boolean;
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `r:${row.id}`, disabled: !canWrite });
  const { setNodeRef: setDragRef, listeners, attributes, isDragging } = useDraggable({
    id: `slot:${row.id}`,
    disabled: !canWrite || !row.player_name,
  });
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const color = resolveColor(row.player_class);

  const openPicker = (e: React.MouseEvent<HTMLElement>) => {
    setAnchor(e.currentTarget.getBoundingClientRect());
  };

  const setRef = (el: HTMLElement | null) => {
    setDropRef(el);
  };

  return (
    <div ref={setRef} className={`min-h-[24px] rounded px-1.5 py-0.5 flex items-center gap-1 transition-colors ${isOver ? 'ring-1 ring-[var(--color-lw-gold-400)]/60 bg-[var(--color-lw-gold-400)]/10' : ''}`}>
      {row.player_name ? (
        <div className="flex items-center gap-1 w-full">
          <span
            ref={setDragRef}
            {...listeners}
            {...attributes}
            onClick={canWrite ? openPicker : undefined}
            style={{ backgroundColor: color + '28', borderColor: color + '55', color, opacity: isDragging ? 0.4 : 1 }}
            className={`text-xs font-medium px-2.5 py-0.5 rounded-full border flex-1 truncate ${canWrite ? 'cursor-grab hover:brightness-125' : ''}`}
          >
            {row.player_name}
          </span>
          {canWrite && <button onClick={onClear} className="text-[var(--color-lw-border)] hover:text-[var(--color-lw-text-muted)] text-[10px] flex-shrink-0">✕</button>}
        </div>
      ) : (
        <div className="flex items-center gap-1 w-full">
          <span className="text-[11px] text-[var(--color-lw-text-muted)]/40 italic flex-1">{canWrite ? 'drag or pick' : '—'}</span>
          {canWrite && (
            <button
              onClick={openPicker}
              className="text-[var(--color-lw-text-muted)] hover:text-[var(--color-lw-text-sub)] flex-shrink-0 text-base leading-none px-0.5 transition-colors"
              title="Pick player"
            >
              ⌄
            </button>
          )}
        </div>
      )}
      {anchor && (
        <PlayerPicker
          anchor={anchor} compPool={compPool} profiles={profiles}
          onSelect={(name, cls) => { onAssign(name, cls); setAnchor(null); }}
          onClose={() => setAnchor(null)}
        />
      )}
    </div>
  );
}

// ─── Assignment cell ──────────────────────────────────────────────────────────

function AssignmentCell({ cell, rows, canWrite, onSave }: {
  cell: SheetCell | undefined;
  rows: SheetRow[];
  canWrite: boolean;
  onSave: (value: { ref_row_ids?: number[] | null; text_value?: string | null } | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [refs, setRefs] = useState<number[]>([]);

  const open = () => {
    if (!canWrite) return;
    setText(cell?.text_value ?? '');
    setRefs(cell?.ref_row_ids ?? []);
    setEditing(true);
  };
  const save = () => {
    const hasRefs = refs.length > 0;
    const hasText = text.trim() !== '';
    if (!hasRefs && !hasText) onSave(null);
    else onSave({ ref_row_ids: hasRefs ? refs : null, text_value: hasText ? text.trim() : null });
    setEditing(false);
  };
  const addRef = (id: number) => { if (!refs.includes(id)) setRefs(prev => [...prev, id]); };
  const removeRef = (id: number) => setRefs(prev => prev.filter(r => r !== id));

  const displayParts: React.ReactNode[] = [];
  if (cell?.ref_row_ids?.length) {
    for (const refId of cell.ref_row_ids) {
      const refRow = rows.find(r => r.id === refId);
      if (refRow) {
        const color = resolveColor(refRow.player_class);
        displayParts.push(
          <span key={refId} style={{ backgroundColor: color + '28', borderColor: color + '55', color }} className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border whitespace-nowrap">
            {refRow.player_name ?? <em className="not-italic opacity-50">{refRow.label}</em>}
          </span>
        );
      }
    }
  }
  if (cell?.text_value) {
    displayParts.push(
      <span key="text" className="text-xs text-[var(--color-lw-text-sub)] inline-flex items-center gap-0.5 flex-wrap">{renderMarkerText(cell.text_value)}</span>
    );
  }
  const display = displayParts.length > 0 ? <div className="flex items-center gap-1 flex-wrap">{displayParts}</div> : null;

  if (editing) {
    const unselected = rows.filter(r => !refs.includes(r.id));
    return (
      <div className="relative z-30">
        <div className="absolute top-0 left-0 bg-[var(--color-lw-card)] border border-[var(--color-lw-border)] rounded-lg shadow-2xl p-3 min-w-[220px]">
          <div className="space-y-2">
            <div>
              <p className="text-[10px] text-[var(--color-lw-text-muted)] uppercase tracking-wider mb-1">Link to roles</p>
              {refs.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {refs.map(id => {
                    const r = rows.find(x => x.id === id);
                    return (
                      <span key={id} className="flex items-center gap-1 text-[11px] bg-[var(--color-lw-elevated)] text-[var(--color-lw-text-sub)] rounded-full px-2 py-0.5">
                        {r?.label ?? id}
                        <button onClick={() => removeRef(id)} className="text-[var(--color-lw-text-muted)] hover:text-red-400 leading-none">✕</button>
                      </span>
                    );
                  })}
                </div>
              )}
              <select
                value=""
                onChange={e => { if (e.target.value) addRef(Number(e.target.value)); }}
                className="w-full bg-[var(--color-lw-elevated)] border border-[var(--color-lw-border)] rounded px-2 py-1 text-xs text-[var(--color-lw-text)] focus:outline-none focus:border-[var(--color-lw-fel-400)]/50"
              >
                <option value="">{refs.length === 0 ? '— none —' : '+ add role…'}</option>
                {unselected.map(r => <option key={r.id} value={r.id}>{r.label}{r.player_name ? ` · ${r.player_name}` : ''}</option>)}
              </select>
            </div>
            <div>
              <p className="text-[10px] text-[var(--color-lw-text-muted)] uppercase tracking-wider mb-1">Custom text</p>
              <input
                autoFocus
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
                className="w-full bg-[var(--color-lw-elevated)] border border-[var(--color-lw-border)] rounded px-2 py-1 text-xs text-[var(--color-lw-text)] focus:outline-none focus:border-[var(--color-lw-fel-400)]/50"
                placeholder="e.g. Boss, MT healer…"
              />
              <div className="flex gap-1.5 mt-1.5 flex-wrap">
                {RAID_MARKERS.map(m => (
                  <button key={m.key} type="button" title={m.label} onClick={() => setText(t => t ? `${t} {${m.key}}` : `{${m.key}}`)} className="hover:scale-125 transition-transform leading-none flex items-center justify-center">
                    <RaidMarkerIcon markerKey={m.key} size={20} />
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-1.5">
              <button onClick={save} className="flex-1 bg-[var(--color-lw-gold-400)] hover:bg-[var(--color-lw-gold-300)] text-[var(--color-lw-base)] rounded px-2 py-1 text-xs font-semibold">Save</button>
              <button onClick={() => { onSave(null); setEditing(false); }} className="text-xs text-[var(--color-lw-text-muted)] hover:text-red-400 px-2">Clear</button>
              <button onClick={() => setEditing(false)} className="text-xs text-[var(--color-lw-text-muted)] hover:text-[var(--color-lw-text-sub)] px-2">✕</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div onClick={open} className={`min-h-[30px] w-full px-2 py-1 flex items-center justify-center group-hover/row:bg-[var(--color-lw-fel-500)]/[0.05] ${canWrite ? 'cursor-pointer hover:bg-[var(--color-lw-elevated)]/30' : ''}`}>
      {display ?? (canWrite ? <span className="text-[10px] text-[var(--color-lw-border)]">+</span> : <span className="text-xs text-[var(--color-lw-border)]">—</span>)}
    </div>
  );
}

// ─── Boss column header (with thumbnail) ─────────────────────────────────────

function BossColumnHeader({ col, canWrite, onUpload, onRemove, onEnlarge }: {
  col: SheetColumn; canWrite: boolean;
  onUpload: (f: File) => Promise<string | null>; onRemove: () => void; onEnlarge: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleFile = async (f: File) => {
    setUploading(true);
    setUploadErr(null);
    const err = await onUpload(f);
    setUploading(false);
    if (err) setUploadErr(err);
  };

  return (
    <div className="flex flex-col items-center gap-1.5 w-full">
      <span className="text-sm font-bold text-[var(--color-lw-gold-300)] text-center leading-tight px-1">{col.label}</span>
      <div className="w-full">
        {col.image_path ? (
          <div className="relative group/th">
            <img
              src={col.image_path} alt={col.label}
              onClick={() => onEnlarge(col.image_path!)}
              className="h-12 w-full object-cover rounded-md border border-[var(--color-lw-border)] cursor-pointer hover:opacity-80 hover:border-[var(--color-lw-border-sub)] transition-all"
            />
            {canWrite && (
              <div
                className="absolute inset-0 hidden group-hover/th:flex items-center justify-center gap-1 bg-black/50 rounded-md cursor-pointer"
                onClick={() => { if (!confirmDelete) onEnlarge(col.image_path!); }}
              >
                {confirmDelete ? (
                  <>
                    <span className="text-[9px] text-white font-semibold">Delete?</span>
                    <button onClick={e => { e.stopPropagation(); onRemove(); setConfirmDelete(false); }} className="text-[9px] bg-red-600 hover:bg-red-500 text-white rounded px-1.5 py-0.5">Yes</button>
                    <button onClick={e => { e.stopPropagation(); setConfirmDelete(false); }} className="text-[9px] bg-[var(--color-lw-elevated)] hover:bg-[var(--color-lw-surface)] text-[var(--color-lw-text-sub)] rounded px-1.5 py-0.5">No</button>
                  </>
                ) : (
                  <>
                    <button onClick={e => { e.stopPropagation(); inputRef.current?.click(); }} className="text-[9px] bg-black/70 text-[var(--color-lw-text-sub)] rounded px-1.5 py-0.5 hover:bg-black/90">↑</button>
                    <button onClick={e => { e.stopPropagation(); setConfirmDelete(true); }} className="text-[9px] bg-black/70 text-red-400 rounded px-1.5 py-0.5 hover:bg-black/90">✕</button>
                  </>
                )}
              </div>
            )}
          </div>
        ) : canWrite ? (
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="w-full h-8 border border-dashed border-[var(--color-lw-border)] hover:border-[var(--color-lw-gold-500)]/30 rounded-md text-[10px] text-[var(--color-lw-text-muted)] hover:text-[var(--color-lw-text-sub)] transition-colors disabled:opacity-50"
          >
            {uploading ? '⏳' : '+ image'}
          </button>
        ) : (
          <div className="h-8 border border-transparent" />
        )}
      </div>
      {uploadErr && <p className="text-[10px] text-red-400 break-all text-center">{uploadErr}</p>}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
    </div>
  );
}

// ─── Sortable table row ───────────────────────────────────────────────────────

function SortableTableRow({ row, rowBg, columns, cellMap, allRows, compPool, profiles, canWrite, onAssign, onClear, onDelete, onSave }: {
  row: SheetRow; rowBg: string; columns: SheetColumn[];
  cellMap: Map<string, SheetCell>; allRows: SheetRow[];
  compPool: CompPlayer[]; profiles: string[];
  canWrite: boolean; onAssign: (name: string, cls: string | null) => void;
  onClear: () => void; onDelete: () => void;
  onSave: (colId: number, val: { ref_row_ids?: number[] | null; text_value?: string | null } | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id, disabled: !canWrite });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.25 : 1 };
  return (
    <tr ref={setNodeRef} style={style} className={`${rowBg} border-b border-[var(--color-lw-border-sub)] group/row transition-colors`}>
      <td className={`sticky left-0 z-10 ${rowBg} px-3 py-1 text-xs text-[var(--color-lw-text-sub)] font-medium border-r border-[var(--color-lw-border)] whitespace-nowrap group-hover/row:bg-[var(--color-lw-fel-500)]/[0.06]`}>
        <div className="flex items-center gap-1.5">
          {canWrite && (
            <span {...attributes} {...listeners} className="cursor-grab text-[var(--color-lw-border)] hover:text-[var(--color-lw-text-muted)] opacity-0 group-hover/row:opacity-100 transition-opacity select-none touch-none" title="Drag to reorder">⠿</span>
          )}
          <span>{row.label}</span>
          {canWrite && <button onClick={onDelete} className="opacity-0 group-hover/row:opacity-100 text-[10px] text-[var(--color-lw-border)] hover:text-red-500 transition-opacity ml-auto" title="Delete row">✕</button>}
        </div>
      </td>
      <td className={`sticky left-[90px] z-10 ${rowBg} px-2 py-1 border-r border-[var(--color-lw-border)] group-hover/row:bg-[var(--color-lw-fel-500)]/[0.06]`}>
        <DroppableSlot row={row} compPool={compPool} profiles={profiles} onAssign={onAssign} onClear={onClear} canWrite={canWrite} />
      </td>
      {columns.map((col, colIdx) => (
        <td key={col.id} className={`border-r border-[var(--color-lw-border-sub)]/40 relative ${colIdx % 2 !== 0 ? 'bg-black/[0.06]' : ''}`}>
          <AssignmentCell cell={cellMap.get(`${row.id}-${col.id}`)} rows={allRows} canWrite={canWrite} onSave={val => onSave(col.id, val)} />
        </td>
      ))}
    </tr>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

interface Props { role: UserRole | null; username: string; helpContent?: string; }

export function AssignmentSheetView({ role, username, helpContent }: Props) {
  const { sheets, columns, rows, cells, loading, profiles, sections, selectedSheetId, setSelectedSheetId, assignPlayer, clearPlayer, setCell, importComp, uploadImage, removeImage, addRow, deleteRow, reorderRows } = useAssignmentSheet();

  const canWrite = canEditAssignments(role);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const [compJson, setCompJson] = useState('');
  const [compPool, setCompPool] = useState<CompPlayer[]>(() => {
    try { const s = localStorage.getItem('lootwatch_comp_pool'); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [importErr, setImportErr] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [addingRowSection, setAddingRowSection] = useState<string | null>(null);
  const [newRowLabel, setNewRowLabel] = useState('');
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | number | null>(null);
  const [presentUsers, setPresentUsers] = useState<string[]>([]);
  const [showHelp, setShowHelp] = useState(false);

  // Presence: track who else is on this sheet
  useEffect(() => {
    if (!selectedSheetId || !username) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase.channel(`assignment_presence_${selectedSheetId}`);
      channel
        .on('presence', { event: 'sync' }, () => {
          if (!channel) return;
          const state = channel.presenceState<{ username: string }>();
          const others = [...new Set(
            Object.values(state).flat().map(p => p.username).filter(u => u !== username)
          )];
          setPresentUsers(others);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel!.track({ username });
          }
        });
    } catch (err) {
      console.error('[AssignmentSheet] presence failed:', err);
    }
    return () => {
      if (channel) supabase.removeChannel(channel);
      setPresentUsers([]);
    };
  }, [selectedSheetId, username]);

  const cellMap = useMemo(() => { const m = new Map<string, SheetCell>(); for (const c of cells) m.set(`${c.row_id}-${c.column_id}`, c); return m; }, [cells]);
  const assignedNames = useMemo(() => new Set(rows.map(r => r.player_name?.toLowerCase()).filter(Boolean) as string[]), [rows]);
  const pool = useMemo(() => compPool.filter(p => !assignedNames.has(p.name.toLowerCase())), [compPool, assignedNames]);
  const groupedPool = useMemo(() => { const g = new Map<number, CompPlayer[]>(); for (const p of pool) { if (!g.has(p.groupNumber)) g.set(p.groupNumber, []); g.get(p.groupNumber)!.push(p); } return [...g.entries()].sort((a, b) => a[0] - b[0]); }, [pool]);
  const rowsBySection = useMemo(() => { const m: Record<string, SheetRow[]> = {}; for (const s of sections) m[s] = rows.filter(r => r.section === s); return m; }, [rows, sections]);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeStr = String(active.id);
    const overStr = String(over.id);

    if (activeStr.startsWith('p:')) {
      // Drag from player pool to a row slot
      const name = activeStr.replace(/^p:/, '');
      const rowId = Number(overStr.replace(/^r:/, ''));
      const player = compPool.find(p => p.name === name);
      if (!player || !rowId) return;
      assignPlayer(rowId, player.name, player.color || player.className);
    } else if (activeStr.startsWith('slot:')) {
      // Drag an assigned player from one slot to another (move or swap)
      if (overStr.startsWith('r:')) {
        const sourceRowId = Number(activeStr.slice(5));
        const targetRowId = Number(overStr.slice(2));
        if (sourceRowId === targetRowId) return;
        const sourceRow = rows.find(r => r.id === sourceRowId);
        if (!sourceRow?.player_name) return;
        const targetRow = rows.find(r => r.id === targetRowId);
        if (targetRow?.player_name) {
          assignPlayer(targetRowId, sourceRow.player_name, sourceRow.player_class);
          assignPlayer(sourceRowId, targetRow.player_name, targetRow.player_class);
        } else {
          assignPlayer(targetRowId, sourceRow.player_name, sourceRow.player_class);
          clearPlayer(sourceRowId);
        }
      }
    } else {
      // Row reordering via sortable
      const overId = Number(over.id);
      if (!overId) return;
      const activeRow = rows.find(r => r.id === Number(active.id));
      if (!activeRow) return;
      reorderRows(Number(active.id), overId, activeRow.section);
    }
  }

  function handleImport() {
    setImportErr('');
    const result = importComp(compJson, selectedSheetId!, rows);
    if (typeof result === 'string') { setImportErr(result); return; }
    setCompPool(result);
    try { localStorage.setItem('lootwatch_comp_pool', JSON.stringify(result)); } catch { /* storage full */ }
    setShowImport(false);
    setCompJson('');
  }

  async function handleAddRow() {
    if (!addingRowSection || !newRowLabel.trim()) return;
    await addRow(addingRowSection, newRowLabel.trim());
    setNewRowLabel('');
    setAddingRowSection(null);
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-[var(--color-lw-text-muted)] text-sm"><span className="animate-spin mr-2">⏳</span> Loading…</div>;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      autoScroll={{ enabled: true, layoutShiftCompensation: false }}
    >
      <div className="max-w-[1600px] mx-auto px-4 py-6 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-bold text-[var(--color-lw-text)]">Raid Assignments</h2>
            {helpContent && (
              <button
                onClick={() => setShowHelp(true)}
                className="w-5 h-5 rounded-full bg-[var(--color-lw-elevated)] border border-[var(--color-lw-border)] hover:border-[var(--color-lw-fel-400)]/50 hover:text-[var(--color-lw-fel-400)] text-[var(--color-lw-text-muted)] text-xs font-bold flex items-center justify-center transition-colors shrink-0"
              >
                ?
              </button>
            )}
            {presentUsers.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs text-[var(--color-lw-text-muted)]">Also here:</span>
                {presentUsers.map(u => (
                  <span key={u} className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">{u}</span>
                ))}
              </div>
            )}
          </div>
          {canWrite && (
            <button onClick={() => setShowImport(v => !v)} className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-lw-elevated)] hover:bg-[var(--color-lw-surface)] text-[var(--color-lw-text-sub)] border border-[var(--color-lw-border)]">
              {showImport ? 'Hide import' : '⬆ Import comp JSON'}
            </button>
          )}
        </div>

        {/* Import panel */}
        {showImport && canWrite && (
          <div className="bg-[var(--color-lw-card)] border border-[var(--color-lw-border)] rounded-xl p-4 space-y-3">
            <p className="text-xs text-[var(--color-lw-text-muted)]">Paste the raid comp JSON. Existing assignments are kept if the player is still in the comp; missing players are cleared.</p>
            <textarea value={compJson} onChange={e => setCompJson(e.target.value)} rows={4} className="w-full bg-[var(--color-lw-elevated)] border border-[var(--color-lw-border)] rounded-lg px-3 py-2 text-xs text-[var(--color-lw-text)] font-mono focus:outline-none focus:border-[var(--color-lw-fel-400)]/50" placeholder='{"slots":[...]}' />
            {importErr && <p className="text-xs text-red-400">{importErr}</p>}
            <button onClick={handleImport} className="bg-[var(--color-lw-gold-400)] hover:bg-[var(--color-lw-gold-300)] text-[var(--color-lw-base)] font-semibold text-xs px-4 py-1.5 rounded-lg">Import</button>
          </div>
        )}

        {/* Player pool */}
        {pool.length > 0 && (
          <div className="bg-[var(--color-lw-card)] border border-[var(--color-lw-border)] rounded-xl p-3 space-y-2">
            <p className="text-[11px] text-[var(--color-lw-text-muted)] uppercase tracking-wider font-semibold">Unassigned players — drag to a role slot</p>
            <div className="space-y-1.5">
              {groupedPool.map(([group, players]) => (
                <div key={group} className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-[var(--color-lw-text-muted)] w-12 flex-shrink-0">Group {group}</span>
                  {players.map(p => <DraggablePlayerPill key={p.name} player={p} />)}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sheet tabs */}
        <div className="flex gap-1">
          {sheets.map(sheet => (
            <button key={sheet.id} onClick={() => setSelectedSheetId(sheet.id)} className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors ${selectedSheetId === sheet.id ? 'bg-[var(--color-lw-gold-400)] text-[var(--color-lw-base)]' : 'bg-[var(--color-lw-elevated)] text-[var(--color-lw-text-muted)] hover:text-[var(--color-lw-text-sub)] hover:bg-[var(--color-lw-surface)]'}`}>
              {sheet.title}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="overflow-x-auto rounded-xl border border-[var(--color-lw-border)]">
          <table className="border-collapse text-sm w-full">
            <thead>
              <tr className="bg-[var(--color-lw-elevated)]">
                <th className="sticky left-0 z-10 bg-[var(--color-lw-elevated)] text-left px-3 py-2 text-xs font-semibold text-[var(--color-lw-text-muted)] uppercase tracking-wider w-[90px] min-w-[90px] border-b border-r border-[var(--color-lw-border)]">Role</th>
                <th className="sticky left-[90px] z-10 bg-[var(--color-lw-elevated)] text-left px-3 py-2 text-xs font-semibold text-[var(--color-lw-text-muted)] uppercase tracking-wider w-[140px] min-w-[140px] border-b border-r border-[var(--color-lw-border)]">Player</th>
                {columns.map((col, colIdx) => (
                  <th key={col.id} className={`text-center px-2 py-2 border-b border-r border-[var(--color-lw-border)] min-w-[80px] ${colIdx % 2 === 0 ? 'bg-[var(--color-lw-elevated)]' : 'bg-[var(--color-lw-surface)]'}`}>
                    <BossColumnHeader
                      col={col} canWrite={canWrite}
                      onUpload={f => uploadImage(col.id, f)}
                      onRemove={() => removeImage(col.id)}
                      onEnlarge={setLightboxImage}
                    />
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {(() => {
                let rowIdx = 0;
                return sections.map((section, sectionIdx) => {
                  const sectionRows = rowsBySection[section] ?? [];
                  const accent = sectionAccent(section, sectionIdx);
                  return (
                    <React.Fragment key={section}>
                      <tr>
                        <td
                          colSpan={2 + columns.length}
                          style={{ borderLeftColor: accent }}
                          className="px-4 py-1.5 bg-[var(--color-lw-surface)]/70 border-y border-[var(--color-lw-border)]/80 border-l-2"
                        >
                          <span style={{ color: accent }} className="text-[10px] font-bold uppercase tracking-widest opacity-90">{section}</span>
                        </td>
                      </tr>

                      <SortableContext items={sectionRows.map(r => r.id)} strategy={verticalListSortingStrategy}>
                        {sectionRows.map(row => {
                          const even = rowIdx++ % 2 === 0;
                          const rowBg = even ? 'bg-[var(--color-lw-base)]' : 'bg-[var(--color-lw-elevated)]/20';
                          return (
                            <SortableTableRow
                              key={row.id}
                              row={row}
                              rowBg={rowBg}
                              columns={columns}
                              cellMap={cellMap}
                              allRows={rows}
                              compPool={compPool}
                              profiles={profiles}
                              canWrite={canWrite}
                              onAssign={(name, cls) => assignPlayer(row.id, name, cls)}
                              onClear={() => clearPlayer(row.id)}
                              onDelete={() => deleteRow(row.id)}
                              onSave={(colId, val) => setCell(row.id, colId, val)}
                            />
                          );
                        })}
                      </SortableContext>

                      {canWrite && (
                        <tr key={`add-${section}`} className="border-b border-[var(--color-lw-border-sub)]/30">
                          <td className="sticky left-0 z-10 bg-[var(--color-lw-base)] px-3 py-1 border-r border-[var(--color-lw-border)]" colSpan={2}>
                            {addingRowSection === section ? (
                              <div className="flex items-center gap-1.5">
                                <input autoFocus value={newRowLabel} onChange={e => setNewRowLabel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAddRow(); if (e.key === 'Escape') { setAddingRowSection(null); setNewRowLabel(''); } }} onBlur={() => { if (!newRowLabel.trim()) setAddingRowSection(null); }} className="bg-[var(--color-lw-elevated)] border border-[var(--color-lw-border)] rounded px-2 py-0.5 text-xs text-[var(--color-lw-text)] focus:outline-none focus:border-[var(--color-lw-fel-400)]/50 w-32" placeholder="Role name…" />
                                <button onClick={handleAddRow} className="text-[10px] text-[var(--color-lw-gold-300)] hover:text-[var(--color-lw-gold-200)]">Add</button>
                                <button onClick={() => { setAddingRowSection(null); setNewRowLabel(''); }} className="text-[10px] text-[var(--color-lw-text-muted)]">✕</button>
                              </div>
                            ) : (
                              <button onClick={() => { setAddingRowSection(section); setNewRowLabel(''); }} className="text-[10px] text-[var(--color-lw-border)] hover:text-[var(--color-lw-text-muted)]">+ Add row</button>
                            )}
                          </td>
                          {columns.map(col => <td key={col.id} className="border-r border-[var(--color-lw-border-sub)]/30" />)}
                        </tr>
                      )}
                    </React.Fragment>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay modifiers={[restrictToWindowEdges]}>
        {activeId != null ? (() => {
          const id = String(activeId);
          if (id.startsWith('p:')) {
            const name = id.slice(2);
            const player = compPool.find(p => p.name === name);
            if (!player) return null;
            const color = player.color || getClassColor(player.className) || '#9ca3af';
            return (
              <div style={{ backgroundColor: color + '33', color, borderColor: color + '66' }}
                className="inline-flex items-center px-3 py-1 rounded-full border text-xs font-semibold whitespace-nowrap shadow-2xl">
                {player.name}
              </div>
            );
          }
          if (id.startsWith('slot:')) {
            const row = rows.find(r => r.id === Number(id.slice(5)));
            if (!row?.player_name) return null;
            const color = resolveColor(row.player_class);
            return (
              <div style={{ backgroundColor: color + '33', color, borderColor: color + '66' }}
                className="inline-flex items-center px-3 py-1 rounded-lg border text-xs font-semibold whitespace-nowrap shadow-2xl rotate-1">
                {row.player_name}
              </div>
            );
          }
          // Row reorder ghost
          const row = rows.find(r => r.id === Number(activeId));
          if (!row) return null;
          return (
            <div className="bg-[var(--color-lw-elevated)] border border-[var(--color-lw-gold-500)]/50 rounded px-3 py-1.5 shadow-2xl text-xs text-[var(--color-lw-text-sub)] opacity-90 whitespace-nowrap">
              {row.label}{row.player_name ? ` · ${row.player_name}` : ''}
            </div>
          );
        })() : null}
      </DragOverlay>

      {/* Lightbox */}
      {lightboxImage && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={() => setLightboxImage(null)}>
          <div className="relative max-w-5xl max-h-full" onClick={e => e.stopPropagation()}>
            <img src={lightboxImage} alt="" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" />
            <button onClick={() => setLightboxImage(null)} className="absolute top-2 right-2 text-white bg-black/60 hover:bg-black rounded-full w-8 h-8 flex items-center justify-center text-sm">✕</button>
          </div>
        </div>
      )}

      {/* Help modal */}
      {showHelp && helpContent && (
        <HelpModal title="Raid Assignments" content={helpContent} onClose={() => setShowHelp(false)} />
      )}
    </DndContext>
  );
}
