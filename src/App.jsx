import { useState, useEffect, useRef } from 'react'
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc,
  serverTimestamp, query, orderBy, setDoc, increment
} from 'firebase/firestore'
import { db } from './firebase.js'
import {
  DndContext, closestCenter,
  PointerSensor, TouchSensor,
  useSensor, useSensors,
  DragOverlay
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const CATEGORIES = [
  { id: 'fruit',     label: 'Obst & Gemüse',  emoji: '🥦', color: '#4ade80' },
  { id: 'dairy',     label: 'Milch & Käse',   emoji: '🥛', color: '#93c5fd' },
  { id: 'meat',      label: 'Fleisch & Fisch', emoji: '🥩', color: '#f87171' },
  { id: 'bread',     label: 'Brot & Gebäck',  emoji: '🍞', color: '#fbbf24' },
  { id: 'drinks',    label: 'Getränke',        emoji: '🥤', color: '#a78bfa' },
  { id: 'frozen',    label: 'Tiefkühl',        emoji: '❄️', color: '#67e8f9' },
  { id: 'household', label: 'Haushalt',        emoji: '🧹', color: '#fb923c' },
  { id: 'other',     label: 'Sonstiges',       emoji: '📦', color: '#d1d5db' },
]
const DEFAULT_CAT_ORDER = CATEGORIES.map(c => c.id)

function getCategoryById(id) {
  return CATEGORIES.find(c => c.id === id) || CATEGORIES[7]
}

function toTemplateId(name) {
  return name.toLowerCase()
    .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
    .replace(/[^a-z0-9]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'')
}

function getSortedItems(list) {
  return [...list].sort((a, b) => {
    if (a.order != null && b.order != null) return a.order - b.order
    if (a.order != null) return -1
    if (b.order != null) return 1
    const at = a.createdAt?.toMillis?.() ?? 0
    const bt = b.createdAt?.toMillis?.() ?? 0
    return at - bt
  })
}

// ── SortableCatGroup ──────────────────────────────────────────────────────────
function SortableCatGroup({ catId, cat, catItems, getToBuy, getChecked,
  toggleToBuy, toggleChecked, removeItem }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: `cat-${catId}` })

  return (
    <div ref={setNodeRef} style={{
      ...S.catGroup,
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.4 : 1,
    }}>
      <div style={S.catHeader}>
        <span style={S.dragHandle} {...attributes} {...listeners}>⠿</span>
        <span style={{...S.catDot, background: cat.color}} />
        <span style={S.catLabel}>{cat.emoji} {cat.label}</span>
        <span style={S.catCount}>{catItems.length}</span>
      </div>
      <SortableContext
        items={catItems.map(i => `item-${i.id}`)}
        strategy={verticalListSortingStrategy}
      >
        {catItems.map(item => (
          <SortableItem
            key={item.id}
            item={item}
            toBuy={getToBuy(item)}
            checked={getChecked(item)}
            onToggleToBuy={() => toggleToBuy(item)}
            onToggleChecked={() => toggleChecked(item)}
            onRemove={() => removeItem(item.id)}
            catColor={cat.color}
          />
        ))}
      </SortableContext>
    </div>
  )
}

// ── SortableItem ──────────────────────────────────────────────────────────────
function SortableItem({ item, ...props }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: `item-${item.id}` })

  return (
    <div ref={setNodeRef} style={{
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.4 : 1,
    }}>
      <ItemRow item={item} dragHandleProps={{ ...attributes, ...listeners }} {...props} />
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [homeUser, setHomeUser] = useState(() => {
    const saved = localStorage.getItem('zettel-user')
    return (saved === 'Marc' || saved === 'Melli') ? saved : ''
  })
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('zettel-user')
    return (saved === 'Marc' || saved === 'Melli') ? saved : ''
  })
  const [items, setItems] = useState([])
  const [templates, setTemplates] = useState([])
  const [catOrder, setCatOrder] = useState(DEFAULT_CAT_ORDER)
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState('all')
  const [newItem, setNewItem] = useState('')
  const [newCategory, setNewCategory] = useState('other')
  const [showAdd, setShowAdd] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [isLandscape, setIsLandscape] = useState(false)
  const [activeDragId, setActiveDragId] = useState(null)
  const inputRef = useRef(null)

  const closeAll = () => { setShowAdd(false); setShowInfo(false); setSuggestions([]) }
  const selectHomeUser = (name) => { localStorage.setItem('zettel-user', name); setHomeUser(name); setUser(name) }
  const isForeignMode = homeUser !== '' && user !== homeUser

  const getToBuy   = item => item[`toBuy_${user}`]   || false
  const getChecked = item => item[`checked_${user}`] || false

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 250, tolerance: 8 } })
  )

  useEffect(() => {
    const check = () => {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
      setIsLandscape(isMobile && window.innerWidth > window.innerHeight)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Kategorie-Reihenfolge aus Firestore
  useEffect(() => {
    return onSnapshot(doc(db, 'settings', 'categoryOrder'), snap => {
      if (snap.exists()) {
        const saved = snap.data().order
        const merged = [
          ...saved.filter(id => DEFAULT_CAT_ORDER.includes(id)),
          ...DEFAULT_CAT_ORDER.filter(id => !saved.includes(id)),
        ]
        setCatOrder(merged)
      }
    })
  }, [])

  useEffect(() => {
    const q = query(collection(db, 'items'), orderBy('createdAt', 'asc'))
    return onSnapshot(q, snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    const q = query(collection(db, 'templates'), orderBy('usedCount', 'desc'))
    return onSnapshot(q, snap => {
      setTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [])

  useEffect(() => {
    if (!newItem.trim() || newItem.length < 2) { setSuggestions([]); return }
    const lower = newItem.toLowerCase()
    setSuggestions(templates.filter(t => t.name.toLowerCase().includes(lower)).slice(0, 5))
  }, [newItem, templates])

  useEffect(() => {
    if (showAdd && inputRef.current) setTimeout(() => inputRef.current?.focus(), 100)
  }, [showAdd])

  const upsertTemplate = async (name, category) => {
    const ref = doc(db, 'templates', toTemplateId(name))
    try {
      await updateDoc(ref, { usedCount: increment(1), lastUsed: serverTimestamp(), category })
    } catch {
      await setDoc(ref, { name, category, usedCount: 1, lastUsed: serverTimestamp() })
    }
  }

  const addItem = async (name, category) => {
    const n = (name || newItem).trim()
    const c = category || newCategory
    if (!n) return
    const catItems = items.filter(i => i.category === c)
    const maxOrder = catItems.reduce((max, i) => Math.max(max, i.order ?? -1), -1)
    await addDoc(collection(db, 'items'), {
      name: n, category: c, createdAt: serverTimestamp(),
      order: maxOrder + 1,
      toBuy_Marc: false, checked_Marc: false,
      toBuy_Melli: false, checked_Melli: false,
    })
    await upsertTemplate(n, c)
    setNewItem('')
    setSuggestions([])
    setShowAdd(false)
  }

  const toggleToBuy = async item => {
    const current = getToBuy(item)
    await updateDoc(doc(db, 'items', item.id), {
      [`toBuy_${user}`]: !current,
      [`checked_${user}`]: false,
    })
  }

  const toggleChecked = async item => {
    if (!getToBuy(item)) return
    await updateDoc(doc(db, 'items', item.id), {
      [`checked_${user}`]: !getChecked(item)
    })
  }

  const removeItem = async id => deleteDoc(doc(db, 'items', id))

  const finishShopping = async () =>
    Promise.all(items.filter(i => getToBuy(i)).map(i =>
      updateDoc(doc(db, 'items', i.id), {
        [`toBuy_${user}`]: false,
        [`checked_${user}`]: false,
      })
    ))

  const handleDragEnd = async ({ active, over }) => {
    setActiveDragId(null)
    if (!over || active.id === over.id) return
    const aId = String(active.id)
    const oId = String(over.id)

    if (aId.startsWith('cat-') && oId.startsWith('cat-')) {
      const aCatId = aId.slice(4)
      const oCatId = oId.slice(4)
      const ai = catOrder.indexOf(aCatId)
      const oi = catOrder.indexOf(oCatId)
      if (ai < 0 || oi < 0) return
      const newOrder = arrayMove(catOrder, ai, oi)
      setCatOrder(newOrder)
      await setDoc(doc(db, 'settings', 'categoryOrder'), { order: newOrder })
      return
    }

    if (aId.startsWith('item-') && oId.startsWith('item-')) {
      const aItemId = aId.slice(5)
      const oItemId = oId.slice(5)
      const aItem = items.find(i => i.id === aItemId)
      const oItem = items.find(i => i.id === oItemId)
      if (!aItem || !oItem || aItem.category !== oItem.category) return
      const catItems = getSortedItems(items.filter(i => i.category === aItem.category))
      const ai = catItems.findIndex(i => i.id === aItemId)
      const oi = catItems.findIndex(i => i.id === oItemId)
      const reordered = arrayMove(catItems, ai, oi)
      await Promise.all(reordered.map((item, idx) =>
        updateDoc(doc(db, 'items', item.id), { order: idx })
      ))
    }
  }

  const toBuyCount   = items.filter(i => getToBuy(i)).length
  const checkedCount = items.filter(i => getChecked(i)).length

  const filtered =
    activeFilter === 'all'     ? items :
    activeFilter === 'today'   ? items.filter(i => getToBuy(i)) :
    activeFilter === 'checked' ? items.filter(i => getChecked(i)) :
    items.filter(i => i.category === activeFilter)

  const grouped = filtered.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = []
    acc[item.category].push(item)
    return acc
  }, {})

  const orderedGroups = catOrder
    .filter(catId => grouped[catId])
    .map(catId => [catId, getSortedItems(grouped[catId])])

  const avatarOrder = homeUser === 'Marc'
    ? [{ name: 'Marc', color: '#818cf8' }, { name: 'Melli', color: '#fb7185' }]
    : [{ name: 'Melli', color: '#fb7185' }, { name: 'Marc', color: '#818cf8' }]

  const activeDragItem = activeDragId?.startsWith('item-')
    ? items.find(i => i.id === activeDragId.slice(5)) : null
  const activeDragCat = activeDragId?.startsWith('cat-')
    ? getCategoryById(activeDragId.slice(4)) : null

  if (!homeUser) return (
    <div style={S.root}>
      <div style={S.blob1} /><div style={S.blob2} />
      <div style={S.onboarding}>
        <div style={{ fontSize:56, marginBottom:16 }}>🛒</div>
        <div style={S.onboardingTitle}>Einkaufszettel</div>
        <div style={S.onboardingSubtitle}>von Melli & Marc</div>
        <div style={{ color:'rgba(255,255,255,0.4)', fontSize:14, marginTop:24, marginBottom:8 }}>Wer bist du?</div>
        <div style={{ display:'flex', gap:12 }}>
          <button style={{...S.onboardingBtn, background:'#818cf8', boxShadow:'0 8px 24px rgba(129,140,248,0.4)'}} onClick={() => selectHomeUser('Marc')}>Marc</button>
          <button style={{...S.onboardingBtn, background:'#fb7185', boxShadow:'0 8px 24px rgba(251,113,133,0.4)'}} onClick={() => selectHomeUser('Melli')}>Melli</button>
        </div>
      </div>
    </div>
  )

  if (isLandscape) return (
    <div style={S.root}>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%' }}>
        <div style={{ fontSize:48 }}>📱</div>
        <div style={{ color:'#fff', fontSize:18, fontWeight:700, marginTop:16 }}>Bitte drehe dein Gerät</div>
        <div style={{ color:'rgba(255,255,255,0.5)', fontSize:14, marginTop:8 }}>Diese App funktioniert nur im Hochformat</div>
      </div>
    </div>
  )

  return (
    <div style={S.root}>
      <div style={S.blob1} /><div style={S.blob2} />
      <div style={S.frame}>

        <div style={S.header}>
          <div>
            <div style={S.appName}>
              {isForeignMode ? `👀 ${user}s Zettel` : '🛒 Einkaufszettel'}
            </div>
            <div style={S.subtitle}>
              {isForeignMode
                ? <span style={{ color: user === 'Melli' ? '#fb7185' : '#818cf8', opacity: 0.8 }}>eigenen Avatar tippen zum Zurückwechseln</span>
                : <>
                    von Melli & Marc
                    {!loading && toBuyCount > 0 && (
                      <span style={{ color:'rgba(255,255,255,0.3)' }}> · {toBuyCount - checkedCount} offen · {checkedCount} im Korb</span>
                    )}
                  </>
              }
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={S.avatars}>
              {avatarOrder.map((u, i) => (
                <div key={u.name}
                  style={{
                    ...S.avatar,
                    background: u.color,
                    marginLeft: i > 0 ? -6 : 0,
                    opacity: u.name === user ? 1 : 0.45,
                    zIndex: i === 0 ? 2 : 1,
                    cursor: 'pointer',
                    boxShadow: u.name === user ? `0 0 0 2px rgba(15,12,26,0.9), 0 0 0 3.5px ${u.color}` : 'none',
                    transform: u.name === user ? 'scale(1.08)' : 'scale(1)',
                    transition: 'opacity 0.2s, box-shadow 0.2s, transform 0.2s',
                  }}
                  onClick={() => setUser(u.name)}
                >
                  {u.name}
                </div>
              ))}
            </div>
            <button style={S.infoBtn} onClick={() => { closeAll(); setShowInfo(true) }}>ℹ️</button>
          </div>
        </div>

        <div style={S.filterRow}>
          <Chip label="Alle" active={activeFilter==='all'} onClick={() => setActiveFilter('all')} />
          <Chip label="🛒 Heute" active={activeFilter==='today'} onClick={() => setActiveFilter('today')} color="#a78bfa" />
          {CATEGORIES.filter(c => items.some(i => i.category===c.id)).map(cat => (
            <Chip key={cat.id} label={cat.emoji} active={activeFilter===cat.id} onClick={() => setActiveFilter(cat.id)} color={cat.color} />
          ))}
          {checkedCount > 0 && <Chip label="✓" active={activeFilter==='checked'} onClick={() => setActiveFilter('checked')} color="#86efac" />}
        </div>

        <div style={S.list}>
          {!loading && orderedGroups.length === 0 && (
            <div style={S.empty}>
              <div style={{fontSize:40}}>🛍️</div>
              <div style={{color:'rgba(255,255,255,0.4)',marginTop:8}}>
                {activeFilter === 'today' ? 'Noch nichts für heute ausgewählt' : 'Hier ist noch nichts'}
              </div>
            </div>
          )}

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={({ active }) => setActiveDragId(String(active.id))}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveDragId(null)}
          >
            <SortableContext
              items={orderedGroups.map(([catId]) => `cat-${catId}`)}
              strategy={verticalListSortingStrategy}
            >
              {orderedGroups.map(([catId, catItems]) => {
                const cat = getCategoryById(catId)
                return (
                  <SortableCatGroup
                    key={catId}
                    catId={catId}
                    cat={cat}
                    catItems={catItems}
                    getToBuy={getToBuy}
                    getChecked={getChecked}
                    toggleToBuy={toggleToBuy}
                    toggleChecked={toggleChecked}
                    removeItem={removeItem}
                  />
                )
              })}
            </SortableContext>

            <DragOverlay>
              {activeDragCat && (
                <div style={S.dragOverlayCat}>
                  <span style={S.dragHandle}>⠿</span>
                  <span style={{...S.catDot, background: activeDragCat.color}} />
                  <span style={S.catLabel}>{activeDragCat.emoji} {activeDragCat.label}</span>
                </div>
              )}
              {activeDragItem && (
                <div style={{...S.itemRow, opacity:1, boxShadow:'0 8px 24px rgba(0,0,0,0.5)', border:'1px solid rgba(255,255,255,0.15)'}}>
                  <span style={S.dragHandle}>⠿</span>
                  <span style={{ fontSize:15, color:'#fff', fontWeight:500 }}>{activeDragItem.name}</span>
                </div>
              )}
            </DragOverlay>
          </DndContext>

          {checkedCount > 0 && (
            <button style={S.finishBtn} onClick={finishShopping}>
              🛒 Einkauf beenden · {checkedCount} im Korb
            </button>
          )}
        </div>

        {!showAdd && !showInfo && (
          <button style={S.fab} onClick={() => setShowAdd(true)}>+</button>
        )}

        {showAdd && (
          <div style={S.panel}>
            <div style={S.panelInner}>
              <div style={{ position:'relative' }}>
                <input ref={inputRef} style={S.input} value={newItem}
                  onChange={e => setNewItem(e.target.value)}
                  placeholder="Artikel eingeben…"
                  onKeyDown={e => e.key==='Enter' && addItem()} />
                {suggestions.length > 0 && (
                  <div style={S.suggestions}>
                    {suggestions.map(s => (
                      <button key={s.id} style={S.suggestion}
                        onClick={() => { setNewItem(s.name); setNewCategory(s.category); setSuggestions([]) }}>
                        <span>{getCategoryById(s.category).emoji}</span>
                        <span style={{ flex:1, textAlign:'left' }}>{s.name}</span>
                        <span style={{ fontSize:10, color:'rgba(255,255,255,0.3)' }}>×{s.usedCount}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div style={S.catSelect}>
                {CATEGORIES.map(cat => (
                  <button key={cat.id}
                    style={{...S.catBtn, background:newCategory===cat.id?cat.color+'33':'transparent', border:`1.5px solid ${newCategory===cat.id?cat.color:'rgba(255,255,255,0.1)'}`}}
                    onClick={() => setNewCategory(cat.id)}>{cat.emoji}</button>
                ))}
              </div>
              <div style={S.actions}>
                <button style={S.cancel} onClick={closeAll}>Abbrechen</button>
                <button style={S.confirm} onClick={() => addItem()}>Hinzufügen</button>
              </div>
            </div>
          </div>
        )}

        {showInfo && (
          <div style={S.panel}>
            <div style={S.panelInner}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                <span style={{ color:'#fff', fontWeight:700, fontSize:16 }}>ℹ️ Über diese App</span>
                <button style={{...S.cancel, flex:'none', padding:'6px 14px'}} onClick={closeAll}>✕</button>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:16, maxHeight:360, overflowY:'auto' }}>
                <div>
                  <div style={S.infoSection}>App</div>
                  <div style={{ color:'#fff', fontWeight:600 }}>🛒 Einkaufszettel von Melli & Marc <span style={{ color:'rgba(255,255,255,0.4)', fontWeight:400, fontSize:12 }}>v1.9.0</span></div>
                </div>
                <div>
                  <div style={S.infoSection}>Flow</div>
                  <div style={{ color:'rgba(255,255,255,0.7)', fontSize:13, lineHeight:1.8 }}>
                    1. 🛒 antippen = „will ich heute kaufen"{'\n'}
                    2. ☐ abhaken = „ist im Korb"{'\n'}
                    3. „Einkauf beenden" = eigenen Stand zurücksetzen
                  </div>
                </div>
                <div>
                  <div style={S.infoSection}>Features</div>
                  {[
                    'Avatar-Umschalter im Header zum schnellen Wechseln',
                    'Gemeinsame Artikelliste für Melli & Marc',
                    'Getrennte Einkaufsstände pro Person',
                    'Echtzeit-Sync zwischen Geräten',
                    'Kategorien per ⠿ Drag & Drop sortierbar',
                    'Artikel per ⠿ Drag & Drop sortierbar',
                    'Reihenfolge wird in Firestore gespeichert',
                    'Heute-kaufen Selektion per 🛒',
                    'Checkbox nur für selektierte Artikel',
                    'Autocomplete beim Tippen',
                    'Einkauf beenden – eigenen Stand zurücksetzen',
                    'Sicherheitsabfrage beim Löschen',
                    'Hochformat-Optimierung für Mobilgeräte',
                  ].map(f => (
                    <div key={f} style={{ color:'rgba(255,255,255,0.7)', fontSize:13, paddingBottom:4 }}>✓ {f}</div>
                  ))}
                </div>
                <div>
                  <div style={S.infoSection}>Changelog</div>
                  <div style={{ color:'rgba(255,255,255,0.5)', fontSize:11, marginBottom:4 }}>v1.9.0 – 28.05.2026</div>
                  {['Avatar-Umschalter im Header (antippen zum Wechseln)','Fremd-Modus: Titel zeigt „👀 Mellis/Marcs Zettel"','Eigener Avatar immer links, Hinweis zum Zurückwechseln','Aktiver Nutzer mit Ring & Scale hervorgehoben'].map(c => (
                    <div key={c} style={{ color:'rgba(255,255,255,0.7)', fontSize:12, paddingBottom:3 }}>+ {c}</div>
                  ))}
                  <div style={{ color:'rgba(255,255,255,0.5)', fontSize:11, marginTop:8, marginBottom:4 }}>v1.8.0 – 26.05.2026</div>
                  {['Drag & Drop für Kategorien (⠿ Handle)','Drag & Drop für Artikel (⠿ Handle)','Reihenfolge persistent in Firestore','Neue Artikel kommen ans Ende der Kategorie'].map(c => (
                    <div key={c} style={{ color:'rgba(255,255,255,0.7)', fontSize:12, paddingBottom:3 }}>+ {c}</div>
                  ))}
                  <div style={{ color:'rgba(255,255,255,0.5)', fontSize:11, marginTop:8, marginBottom:4 }}>v1.7.0 – 26.05.2026</div>
                  {['Getrennte Einkaufsstände pro Person','toBuy & checked jetzt pro User'].map(c => (
                    <div key={c} style={{ color:'rgba(255,255,255,0.7)', fontSize:12, paddingBottom:3 }}>+ {c}</div>
                  ))}
                  <div style={{ color:'rgba(255,255,255,0.5)', fontSize:11, marginTop:8, marginBottom:4 }}>v1.6.0 – 26.05.2026</div>
                  {['Neuer Einkaufs-Flow','🛒 Selektion','Kategorien in fester Reihenfolge'].map(c => (
                    <div key={c} style={{ color:'rgba(255,255,255,0.7)', fontSize:12, paddingBottom:3 }}>+ {c}</div>
                  ))}
                </div>
                <div>
                  <div style={S.infoSection}>Tech Stack</div>
                  {[['Frontend','React + Vite'],['Drag & Drop','@dnd-kit'],['Datenbank','Firebase Firestore'],['Hosting','GitHub Pages'],['CI/CD','GitHub Actions']].map(([k,v]) => (
                    <div key={k} style={{ display:'flex', justifyContent:'space-between', paddingBottom:4 }}>
                      <span style={{ color:'rgba(255,255,255,0.4)', fontSize:12 }}>{k}</span>
                      <span style={{ color:'rgba(255,255,255,0.7)', fontSize:12 }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Chip({ label, active, onClick, color }) {
  return (
    <button style={{...S.chip,
      background: active?(color?color+'33':'rgba(255,255,255,0.15)'):'rgba(255,255,255,0.06)',
      border: `1.5px solid ${active?(color||'rgba(255,255,255,0.5)'):'rgba(255,255,255,0.1)'}`,
      color: active?'#fff':'rgba(255,255,255,0.5)'
    }} onClick={onClick}>{label}</button>
  )
}

function ItemRow({ item, toBuy, checked, onToggleToBuy, onToggleChecked, onRemove, catColor, dragHandleProps }) {
  return (
    <div style={{...S.itemRow, opacity: toBuy ? 1 : 0.5}}>
      <span style={S.dragHandle} {...dragHandleProps}>⠿</span>
      <button style={{...S.cartBtn, color: toBuy ? '#a78bfa' : 'rgba(255,255,255,0.25)'}} onClick={onToggleToBuy}>
        🛒
      </button>
      <div style={S.itemContent}>
        <span style={{...S.itemName, textDecoration: checked ? 'line-through' : 'none'}}>{item.name}</span>
      </div>
      {toBuy && (
        <button style={{...S.checkbox, borderColor: catColor}} onClick={onToggleChecked}>
          {checked && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6L5 9L10 3" stroke={catColor} strokeWidth="2" strokeLinecap="round"/></svg>}
        </button>
      )}
      <button style={S.removeBtn} onClick={() => {
        if (window.confirm(`"${item.name}" wirklich löschen?`)) onRemove()
      }}>×</button>
    </div>
  )
}

const S = {
  root: { position:'fixed', inset:0, background:'linear-gradient(135deg,#0f0c1a 0%,#1a1030 50%,#0d1829 100%)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Outfit',sans-serif", overflow:'hidden', overscrollBehavior:'none' },
  blob1: { position:'absolute', top:-100, right:-80, width:350, height:350, borderRadius:'50%', background:'radial-gradient(circle,rgba(129,140,248,0.15) 0%,transparent 70%)', pointerEvents:'none' },
  blob2: { position:'absolute', bottom:-80, left:-60, width:300, height:300, borderRadius:'50%', background:'radial-gradient(circle,rgba(251,113,133,0.12) 0%,transparent 70%)', pointerEvents:'none' },
  frame: { width:'100%', maxWidth:390, height:'100%', background:'rgba(15,12,26,0.85)', backdropFilter:'blur(20px)', border:'1px solid rgba(255,255,255,0.08)', boxShadow:'0 30px 80px rgba(0,0,0,0.6)', display:'flex', flexDirection:'column', overflow:'hidden', position:'relative', paddingTop:'env(safe-area-inset-top)' },
  onboarding: { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', padding:32, textAlign:'center', position:'relative', zIndex:1 },
  onboardingTitle: { fontSize:28, fontWeight:700, color:'#fff', letterSpacing:'-0.5px' },
  onboardingSubtitle: { fontSize:16, color:'rgba(255,255,255,0.5)', marginTop:4 },
  onboardingBtn: { padding:'16px 32px', borderRadius:16, border:'none', color:'#fff', fontSize:18, fontWeight:700, cursor:'pointer', fontFamily:'inherit', minWidth:120 },
  header: { padding:'20px 20px 12px', display:'flex', justifyContent:'space-between', alignItems:'flex-start', borderBottom:'1px solid rgba(255,255,255,0.06)', flexShrink:0 },
  appName: { fontSize:18, fontWeight:700, color:'#fff', letterSpacing:'-0.3px' },
  subtitle: { fontSize:11, color:'rgba(255,255,255,0.6)', marginTop:2 },
  avatars: { display:'flex', alignItems:'center' },
  avatar: { height:28, paddingLeft:10, paddingRight:10, borderRadius:14, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fff', border:'2px solid rgba(15,12,26,0.9)', whiteSpace:'nowrap', transition:'opacity 0.2s' },
  infoBtn: { background:'transparent', border:'none', fontSize:14, cursor:'pointer', opacity:0.4, padding:'4px' },
  filterRow: { display:'flex', gap:6, padding:'10px 16px', overflowX:'auto', scrollbarWidth:'none', flexShrink:0 },
  chip: { padding:'5px 12px', borderRadius:20, fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' },
  list: { flex:1, overflowY:'auto', padding:'8px 16px 80px', scrollbarWidth:'none', overscrollBehavior:'contain' },
  empty: { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', paddingTop:80 },
  catGroup: { marginBottom:20 },
  catHeader: { display:'flex', alignItems:'center', gap:6, marginBottom:8, paddingLeft:2 },
  catDot: { width:6, height:6, borderRadius:'50%', flexShrink:0 },
  catLabel: { fontSize:11, fontWeight:600, color:'rgba(255,255,255,0.4)', letterSpacing:'0.6px', textTransform:'uppercase', flex:1 },
  catCount: { fontSize:11, color:'rgba(255,255,255,0.25)', fontWeight:600 },
  dragHandle: { display:'inline-flex', alignItems:'center', justifyContent:'center', width:20, height:20, color:'rgba(255,255,255,0.2)', cursor:'grab', fontSize:14, flexShrink:0, touchAction:'none', userSelect:'none' },
  itemRow: { display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderRadius:12, marginBottom:4, border:'1px solid rgba(255,255,255,0.05)', background:'rgba(255,255,255,0.04)', transition:'opacity 0.2s' },
  cartBtn: { width:28, height:28, border:'none', background:'transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:16, transition:'color 0.2s', padding:0 },
  itemContent: { flex:1, display:'flex', flexDirection:'column', gap:1, minWidth:0 },
  itemName: { fontSize:15, color:'#fff', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  checkbox: { width:22, height:22, borderRadius:7, border:'1.5px solid', background:'transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
  removeBtn: { width:22, height:22, borderRadius:'50%', border:'none', background:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.3)', cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
  finishBtn: { width:'100%', padding:'14px', marginTop:12, borderRadius:16, border:'none', background:'linear-gradient(135deg,#818cf8 0%,#c084fc 100%)', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 16px rgba(129,140,248,0.35)' },
  fab: { position:'absolute', bottom:24, right:20, width:56, height:56, borderRadius:'50%', background:'linear-gradient(135deg,#818cf8 0%,#c084fc 100%)', border:'none', color:'#fff', fontSize:28, cursor:'pointer', boxShadow:'0 8px 24px rgba(129,140,248,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:10 },
  panel: { position:'absolute', bottom:0, left:0, right:0, background:'rgba(20,16,36,0.97)', backdropFilter:'blur(20px)', borderTop:'1px solid rgba(255,255,255,0.08)', borderRadius:'24px 24px 0 0', padding:'20px 20px 36px', zIndex:20 },
  panelInner: { display:'flex', flexDirection:'column', gap:12 },
  input: { background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:12, padding:'13px 16px', fontSize:15, color:'#fff', outline:'none', width:'100%', boxSizing:'border-box', fontFamily:'inherit' },
  suggestions: { position:'absolute', top:'100%', left:0, right:0, background:'rgba(22,18,42,0.99)', border:'1px solid rgba(255,255,255,0.1)', borderTop:'none', borderRadius:'0 0 12px 12px', overflow:'hidden', zIndex:30 },
  suggestion: { width:'100%', display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'transparent', border:'none', borderBottom:'1px solid rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.85)', fontSize:14, cursor:'pointer' },
  catSelect: { display:'flex', gap:6, flexWrap:'wrap' },
  catBtn: { width:38, height:38, borderRadius:10, fontSize:18, cursor:'pointer' },
  actions: { display:'flex', gap:8 },
  cancel: { flex:1, padding:'12px', borderRadius:12, border:'1px solid rgba(255,255,255,0.1)', background:'transparent', color:'rgba(255,255,255,0.5)', fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'inherit' },
  confirm: { flex:2, padding:'12px', borderRadius:12, border:'none', background:'linear-gradient(135deg,#818cf8 0%,#c084fc 100%)', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'inherit' },
  infoSection: { color:'#818cf8', fontWeight:700, fontSize:11, letterSpacing:'0.6px', textTransform:'uppercase', marginBottom:8, marginTop:4 },
  dragOverlayCat: { display:'flex', alignItems:'center', gap:6, padding:'8px 12px', borderRadius:10, background:'rgba(30,24,50,0.95)', border:'1px solid rgba(255,255,255,0.15)', backdropFilter:'blur(10px)', boxShadow:'0 8px 24px rgba(0,0,0,0.4)' },
}
