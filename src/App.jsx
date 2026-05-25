import { useState, useEffect, useRef } from 'react'
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc,
  serverTimestamp, query, orderBy, setDoc, increment
} from 'firebase/firestore'
import { db } from './firebase.js'

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

const USERS = [
  { name: 'Marc',  color: '#818cf8' },
  { name: 'Melli', color: '#fb7185' },
]

function getCategoryById(id) {
  return CATEGORIES.find(c => c.id === id) || CATEGORIES[7]
}

function getUserColor(name) {
  return USERS.find(u => u.name === name)?.color || '#818cf8'
}

function toTemplateId(name) {
  return name.toLowerCase()
    .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
    .replace(/[^a-z0-9]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'')
}

export default function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('zettel-user')
    if (saved === 'Marc' || saved === 'Melli') return saved
    localStorage.removeItem('zettel-user')
    return ''
  })
  const [items, setItems] = useState([])
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState('all')
  const [newItem, setNewItem] = useState('')
  const [newCategory, setNewCategory] = useState('other')
  const [showAdd, setShowAdd] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [isLandscape, setIsLandscape] = useState(false)
  const inputRef = useRef(null)

  const closeAll = () => { setShowAdd(false); setShowInfo(false); setSuggestions([]) }

  const selectUser = (name) => {
    localStorage.setItem('zettel-user', name)
    setUser(name)
  }

  useEffect(() => {
  const check = () => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    setIsLandscape(isMobile && window.innerWidth > window.innerHeight)
  }
  check()
  window.addEventListener('resize', check)
  return () => window.removeEventListener('resize', check)
}, [])

  useEffect(() => {
    const q = query(collection(db, 'items'), orderBy('createdAt', 'desc'))
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
      await setDoc(ref, { name, category, favorite: false, usedCount: 1, lastUsed: serverTimestamp() })
    }
  }

  const addItem = async (name, category) => {
    const n = (name || newItem).trim()
    const c = category || newCategory
    if (!n) return
    await addDoc(collection(db, 'items'), { name: n, category: c, checked: false, addedBy: user, createdAt: serverTimestamp() })
    await upsertTemplate(n, c)
    setNewItem('')
    setSuggestions([])
    setShowAdd(false)
  }

  const toggleItem = async item => updateDoc(doc(db, 'items', item.id), { checked: !item.checked })
  const removeItem = async id => deleteDoc(doc(db, 'items', id))
  const clearChecked = async () => Promise.all(items.filter(i => i.checked).map(i => deleteDoc(doc(db, 'items', i.id))))

  const toggleFavorite = async (item) => {
    const tmpl = templates.find(t => t.name.toLowerCase() === item.name.toLowerCase())
    if (tmpl) {
      await updateDoc(doc(db, 'templates', tmpl.id), { favorite: !tmpl.favorite })
    } else {
      await setDoc(doc(db, 'templates', toTemplateId(item.name)), {
        name: item.name, category: item.category,
        favorite: true, usedCount: 1, lastUsed: serverTimestamp()
      })
    }
  }

  const isFavorite = (name) => templates.some(t => t.name.toLowerCase() === name.toLowerCase() && t.favorite)

  const uncheckedCount = items.filter(i => !i.checked).length
  const checkedCount   = items.filter(i => i.checked).length
  const favCount       = templates.filter(t => t.favorite).length

  const filtered =
    activeFilter === 'all'       ? items :
    activeFilter === 'checked'   ? items.filter(i => i.checked) :
    activeFilter === 'favorites' ? items.filter(i => isFavorite(i.name)) :
    items.filter(i => i.category === activeFilter)

  const grouped = filtered.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = []
    acc[item.category].push(item)
    return acc
  }, {})

  const avatarOrder = user === 'Marc'
    ? [{ name: 'Marc', color: '#818cf8' }, { name: 'Melli', color: '#fb7185' }]
    : [{ name: 'Melli', color: '#fb7185' }, { name: 'Marc', color: '#818cf8' }]

  if (!user) return (
    <div style={S.root}>
      <div style={S.blob1} /><div style={S.blob2} />
      <div style={S.onboarding}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🛒</div>
        <div style={S.onboardingTitle}>Einkaufszettel</div>
        <div style={S.onboardingSubtitle}>von Melli & Marc</div>
        <div style={{ color:'rgba(255,255,255,0.4)', fontSize:14, marginTop:24, marginBottom:8 }}>Wer bist du?</div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button style={{...S.onboardingBtn, background: '#818cf8', boxShadow: '0 8px 24px rgba(129,140,248,0.4)'}} onClick={() => selectUser('Marc')}>Marc</button>
          <button style={{...S.onboardingBtn, background: '#fb7185', boxShadow: '0 8px 24px rgba(251,113,133,0.4)'}} onClick={() => selectUser('Melli')}>Melli</button>
        </div>
      </div>
    </div>
  )

  if (isLandscape) return (
    <div style={S.root}>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%' }}>
        <div style={{ fontSize: 48 }}>📱</div>
        <div style={{ color: '#fff', fontSize: 18, fontWeight: 700, marginTop: 16 }}>Bitte drehe dein Gerät</div>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginTop: 8 }}>Diese App funktioniert nur im Hochformat</div>
      </div>
    </div>
  )

  return (
    <div style={S.root}>
      <div style={S.blob1} /><div style={S.blob2} />
      <div style={S.frame}>

        <div style={S.header}>
          <div>
            <div style={S.appName}>🛒 Einkaufszettel</div>
            <div style={S.subtitle}>
              von Melli & Marc
              {!loading && <span style={{ color:'rgba(255,255,255,0.3)' }}> · {uncheckedCount} offen · {checkedCount} erledigt</span>}
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <button style={S.favBtn} onClick={() => { closeAll(); setShowInfo(true) }}>ℹ️</button>
            <button
              style={{...S.favBtn, background: activeFilter==='favorites' ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.06)', border: activeFilter==='favorites' ? '1px solid #fbbf24' : '1px solid rgba(255,255,255,0.1)'}}
              onClick={() => { closeAll(); setActiveFilter(activeFilter === 'favorites' ? 'all' : 'favorites') }}>
              ⭐{favCount > 0 && <span style={S.badge}>{favCount}</span>}
            </button>
            <div style={S.avatars}>
              {avatarOrder.map((u, i) => (
                <div key={u.name} style={{...S.avatar, background:u.color, marginLeft:i>0?-6:0, opacity:u.name===user?1:0.5, zIndex:i===0?2:1}}>
                  {u.name}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={S.filterRow}>
          <Chip label="Alle" active={activeFilter==='all'} onClick={() => setActiveFilter('all')} />
          {CATEGORIES.filter(c => items.some(i => i.category===c.id)).map(cat => (
            <Chip key={cat.id} label={cat.emoji} active={activeFilter===cat.id} onClick={() => setActiveFilter(cat.id)} color={cat.color} />
          ))}
          {checkedCount > 0 && <Chip label="✓" active={activeFilter==='checked'} onClick={() => setActiveFilter('checked')} color="#86efac" />}
        </div>

        <div style={S.list}>
          {!loading && Object.keys(grouped).length === 0 && (
            <div style={S.empty}>
              <div style={{fontSize:40}}>{activeFilter === 'favorites' ? '⭐' : '🛍️'}</div>
              <div style={{color:'rgba(255,255,255,0.4)',marginTop:8}}>
                {activeFilter === 'favorites' ? 'Keine Favoriten auf dem Zettel' : 'Hier ist noch nichts'}
              </div>
            </div>
          )}
          {Object.entries(grouped).map(([catId, catItems]) => {
            const cat = getCategoryById(catId)
            return (
              <div key={catId} style={S.catGroup}>
                <div style={S.catHeader}>
                  <span style={{...S.catDot, background:cat.color}} />
                  <span style={S.catLabel}>{cat.emoji} {cat.label}</span>
                  <span style={S.catCount}>{catItems.length}</span>
                </div>
                {catItems.map(item => (
                  <ItemRow key={item.id} item={item}
                    onToggle={() => toggleItem(item)}
                    onRemove={() => removeItem(item.id)}
                    catColor={cat.color}
                    addedByColor={getUserColor(item.addedBy)}
                    isFav={isFavorite(item.name)}
                    onToggleFav={() => toggleFavorite(item)}
                  />
                ))}
              </div>
            )
          })}
          {checkedCount > 0 && activeFilter !== 'checked' && (
            <button style={S.clearBtn} onClick={clearChecked}>Erledigte löschen ({checkedCount})</button>
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
                        <span style={{ fontSize:10, color:'rgba(255,255,255,0.3)' }}>{isFavorite(s.name) ? '★' : ''} ×{s.usedCount}</span>
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
                  <div style={{ color:'#fff', fontWeight:600 }}>🛒 Einkaufszettel von Melli & Marc <span style={{ color:'rgba(255,255,255,0.4)', fontWeight:400, fontSize:12 }}>v1.3.0</span></div>
                </div>
                <div>
                  <div style={S.infoSection}>Features</div>
                  {['Echtzeit-Sync zwischen Geräten','Artikel mit Kategorien','Favoriten als Filter','Autocomplete beim Tippen','Onboarding Screen','Hochformat-Optimierung'].map(f => (
                    <div key={f} style={{ color:'rgba(255,255,255,0.7)', fontSize:13, paddingBottom:4 }}>✓ {f}</div>
                  ))}
                </div>
                <div>
                  <div style={S.infoSection}>Changelog</div>
                  <div style={{ color:'rgba(255,255,255,0.5)', fontSize:11, marginBottom:4 }}>v1.3.0 – 25.05.2026</div>
                  {['Favoriten als Filter statt Panel','App-Name aktualisiert','Bugfixes'].map(c => (
                    <div key={c} style={{ color:'rgba(255,255,255,0.7)', fontSize:12, paddingBottom:3 }}>+ {c}</div>
                  ))}
                  <div style={{ color:'rgba(255,255,255,0.5)', fontSize:11, marginTop:8, marginBottom:4 }}>v1.2.0 – 25.05.2026</div>
                  {['Bugfixes Scrollen & Favoriten','Info Screen'].map(c => (
                    <div key={c} style={{ color:'rgba(255,255,255,0.7)', fontSize:12, paddingBottom:3 }}>+ {c}</div>
                  ))}
                  <div style={{ color:'rgba(255,255,255,0.5)', fontSize:11, marginTop:8, marginBottom:4 }}>v1.1.0 – 25.05.2026</div>
                  {['Favoriten & Verlauf','Autocomplete','Onboarding','Avatare'].map(c => (
                    <div key={c} style={{ color:'rgba(255,255,255,0.7)', fontSize:12, paddingBottom:3 }}>+ {c}</div>
                  ))}
                  <div style={{ color:'rgba(255,255,255,0.5)', fontSize:11, marginTop:8, marginBottom:4 }}>v1.0.0 – 25.05.2026</div>
                  <div style={{ color:'rgba(255,255,255,0.7)', fontSize:12 }}>+ Erstveröffentlichung</div>
                </div>
                <div>
                  <div style={S.infoSection}>Tech Stack</div>
                  {[['Frontend','React + Vite'],['Datenbank','Firebase Firestore'],['Hosting','GitHub Pages'],['CI/CD','GitHub Actions']].map(([k,v]) => (
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

function ItemRow({ item, onToggle, onRemove, catColor, addedByColor, isFav, onToggleFav }) {
  return (
    <div style={{...S.itemRow, opacity:item.checked?0.45:1}}>
      <button style={{...S.checkbox, borderColor:catColor}} onClick={onToggle}>
        {item.checked && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6L5 9L10 3" stroke={catColor} strokeWidth="2" strokeLinecap="round"/></svg>}
      </button>
      <div style={S.itemContent}>
        <span style={{...S.itemName, textDecoration:item.checked?'line-through':'none'}}>{item.name}</span>
        <span style={{...S.addedBy, color: addedByColor + '99'}}>{item.addedBy}</span>
      </div>
      <button style={{...S.iconBtn, color: isFav ? '#fbbf24' : 'rgba(255,255,255,0.2)', fontSize:16}} onClick={onToggleFav}>
        {isFav ? '★' : '☆'}
      </button>
      <button style={S.removeBtn} onClick={onRemove}>×</button>
    </div>
  )
}

const S = {
  root: { position:'fixed', inset:0, background:'linear-gradient(135deg,#0f0c1a 0%,#1a1030 50%,#0d1829 100%)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Outfit',sans-serif", overflow:'hidden', overscrollBehavior:'none' },
  blob1: { position:'absolute', top:-100, right:-80, width:350, height:350, borderRadius:'50%', background:'radial-gradient(circle,rgba(129,140,248,0.15) 0%,transparent 70%)', pointerEvents:'none' },
  blob2: { position:'absolute', bottom:-80, left:-60, width:300, height:300, borderRadius:'50%', background:'radial-gradient(circle,rgba(251,113,133,0.12) 0%,transparent 70%)', pointerEvents:'none' },
  frame: { width:'100%', maxWidth:390, height:'100%', background:'rgba(15,12,26,0.85)', backdropFilter:'blur(20px)', border:'1px solid rgba(255,255,255,0.08)', boxShadow:'0 30px 80px rgba(0,0,0,0.6)', display:'flex', flexDirection:'column', overflow:'hidden', position:'relative' },
  onboarding: { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', padding:32, textAlign:'center', position:'relative', zIndex:1 },
  onboardingTitle: { fontSize:28, fontWeight:700, color:'#fff', letterSpacing:'-0.5px' },
  onboardingSubtitle: { fontSize:16, color:'rgba(255,255,255,0.5)', marginTop:4 },
  onboardingBtn: { padding:'16px 32px', borderRadius:16, border:'none', color:'#fff', fontSize:18, fontWeight:700, cursor:'pointer', fontFamily:'inherit', minWidth:120 },
  header: { padding:'20px 20px 12px', display:'flex', justifyContent:'space-between', alignItems:'flex-start', borderBottom:'1px solid rgba(255,255,255,0.06)', flexShrink:0 },
  appName: { fontSize:18, fontWeight:700, color:'#fff', letterSpacing:'-0.3px' },
  subtitle: { fontSize:11, color:'rgba(255,255,255,0.6)', marginTop:2 },
  avatars: { display:'flex', alignItems:'center' },
  avatar: { height:28, paddingLeft:10, paddingRight:10, borderRadius:14, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fff', border:'2px solid rgba(15,12,26,0.9)', whiteSpace:'nowrap', transition:'opacity 0.2s' },
  favBtn: { background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:20, padding:'5px 10px', fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:4, color:'#fff', transition:'all 0.2s' },
  badge: { background:'#fbbf24', color:'#000', borderRadius:'50%', width:16, height:16, fontSize:9, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center' },
  filterRow: { display:'flex', gap:6, padding:'10px 16px', overflowX:'auto', scrollbarWidth:'none', flexShrink:0 },
  chip: { padding:'5px 12px', borderRadius:20, fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' },
  list: { flex:1, overflowY:'auto', padding:'8px 16px 80px', scrollbarWidth:'none', overscrollBehavior:'contain' },
  empty: { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', paddingTop:80 },
  catGroup: { marginBottom:20 },
  catHeader: { display:'flex', alignItems:'center', gap:6, marginBottom:8, paddingLeft:2 },
  catDot: { width:6, height:6, borderRadius:'50%' },
  catLabel: { fontSize:11, fontWeight:600, color:'rgba(255,255,255,0.4)', letterSpacing:'0.6px', textTransform:'uppercase', flex:1 },
  catCount: { fontSize:11, color:'rgba(255,255,255,0.25)', fontWeight:600 },
  itemRow: { display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderRadius:12, marginBottom:4, border:'1px solid rgba(255,255,255,0.05)', background:'rgba(255,255,255,0.04)' },
  checkbox: { width:22, height:22, borderRadius:7, border:'1.5px solid', background:'transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
  itemContent: { flex:1, display:'flex', flexDirection:'column', gap:1, minWidth:0 },
  itemName: { fontSize:15, color:'#fff', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  addedBy: { fontSize:10, fontWeight:600 },
  iconBtn: { width:26, height:26, border:'none', background:'transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'color 0.2s' },
  removeBtn: { width:22, height:22, borderRadius:'50%', border:'none', background:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.3)', cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
  clearBtn: { width:'100%', padding:'10px', marginTop:8, borderRadius:12, border:'1px dashed rgba(255,255,255,0.12)', background:'transparent', color:'rgba(255,255,255,0.3)', fontSize:12, fontWeight:600, cursor:'pointer' },
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
}
