import { useState, useEffect, useRef } from 'react'
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore'
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

function getCategoryById(id) {
  return CATEGORIES.find(c => c.id === id) || CATEGORIES[7]
}

export default function App() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState('all')
  const [newItem, setNewItem] = useState('')
  const [newCategory, setNewCategory] = useState('other')
  const [showAdd, setShowAdd] = useState(false)
  const [user] = useState(() => {
    const saved = localStorage.getItem('zettel-user')
    if (saved) return saved
    const name = prompt('Wie heißt du?') || 'Anonym'
    localStorage.setItem('zettel-user', name)
    return name
  })
  const inputRef = useRef(null)

  useEffect(() => {
    const q = query(collection(db, 'items'), orderBy('createdAt', 'desc'))
    const unsubscribe = onSnapshot(q, snapshot => {
      setItems(snapshot.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (showAdd && inputRef.current) setTimeout(() => inputRef.current?.focus(), 100)
  }, [showAdd])

  const addItem = async () => {
    if (!newItem.trim()) return
    await addDoc(collection(db, 'items'), { name: newItem.trim(), category: newCategory, checked: false, addedBy: user, createdAt: serverTimestamp() })
    setNewItem('')
    setShowAdd(false)
  }

  const toggleItem = async (item) => await updateDoc(doc(db, 'items', item.id), { checked: !item.checked })
  const removeItem = async (id) => await deleteDoc(doc(db, 'items', id))
  const clearChecked = async () => await Promise.all(items.filter(i => i.checked).map(i => deleteDoc(doc(db, 'items', i.id))))

  const filtered = activeFilter === 'all' ? items : activeFilter === 'checked' ? items.filter(i => i.checked) : items.filter(i => i.category === activeFilter)
  const uncheckedCount = items.filter(i => !i.checked).length
  const checkedCount = items.filter(i => i.checked).length
  const grouped = filtered.reduce((acc, item) => { if (!acc[item.category]) acc[item.category] = []; acc[item.category].push(item); return acc }, {})

  return (
    <div style={styles.root}>
      <div style={styles.blob1} /><div style={styles.blob2} />
      <div style={styles.phoneFrame}>
        <div style={styles.header}>
          <div>
            <div style={styles.appName}>🛒 Unser Zettel</div>
            <div style={styles.subtitle}>{loading ? 'Laden…' : `${uncheckedCount} offen · ${checkedCount} erledigt`}</div>
          </div>
          <div style={styles.avatars}>
            <div style={{...styles.avatar, background:'#818cf8'}}>M</div>
            <div style={{...styles.avatar, background:'#fb7185', marginLeft:-8}}>D</div>
          </div>
        </div>
        <div style={styles.filterRow}>
          <FilterChip label="Alle" active={activeFilter==='all'} onClick={() => setActiveFilter('all')} />
          {CATEGORIES.filter(c => items.some(i => i.category === c.id)).map(cat => (
            <FilterChip key={cat.id} label={cat.emoji} active={activeFilter===cat.id} onClick={() => setActiveFilter(cat.id)} color={cat.color} />
          ))}
          {checkedCount > 0 && <FilterChip label="✓" active={activeFilter==='checked'} onClick={() => setActiveFilter('checked')} color="#86efac" />}
        </div>
        <div style={styles.listArea}>
          {!loading && Object.keys(grouped).length === 0 && <div style={styles.empty}><div style={{fontSize:40}}>🛍️</div><div style={{color:'rgba(255,255,255,0.4)',marginTop:8}}>Hier ist noch nichts</div></div>}
          {Object.entries(grouped).map(([catId, catItems]) => {
            const cat = getCategoryById(catId)
            return (
              <div key={catId} style={styles.categoryGroup}>
                <div style={styles.categoryHeader}>
                  <span style={{...styles.categoryDot, background:cat.color}} />
                  <span style={styles.categoryLabel}>{cat.emoji} {cat.label}</span>
                  <span style={styles.categoryCount}>{catItems.length}</span>
                </div>
                {catItems.map(item => <ItemRow key={item.id} item={item} onToggle={() => toggleItem(item)} onRemove={() => removeItem(item.id)} catColor={cat.color} />)}
              </div>
            )
          })}
          {checkedCount > 0 && activeFilter !== 'checked' && <button style={styles.clearBtn} onClick={clearChecked}>Erledigte löschen ({checkedCount})</button>}
        </div>
        {showAdd && (
          <div style={styles.addPanel}>
            <div style={styles.addPanelInner}>
              <input ref={inputRef} style={styles.input} value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="Artikel eingeben…" onKeyDown={e => e.key==='Enter' && addItem()} />
              <div style={styles.catSelect}>
                {CATEGORIES.map(cat => <button key={cat.id} style={{...styles.catBtn, background:newCategory===cat.id?cat.color+'33':'transparent', border:`1.5px solid ${newCategory===cat.id?cat.color:'rgba(255,255,255,0.1)'}`}} onClick={() => setNewCategory(cat.id)}>{cat.emoji}</button>)}
              </div>
              <div style={styles.addActions}>
                <button style={styles.cancelBtn} onClick={() => setShowAdd(false)}>Abbrechen</button>
                <button style={styles.confirmBtn} onClick={addItem}>Hinzufügen</button>
              </div>
            </div>
          </div>
        )}
        {!showAdd && <button style={styles.fab} onClick={() => setShowAdd(true)}>+</button>}
      </div>
    </div>
  )
}

function FilterChip({ label, active, onClick, color }) {
  return <button style={{...styles.chip, background:active?(color?color+'33':'rgba(255,255,255,0.15)'):'rgba(255,255,255,0.06)', border:`1.5px solid ${active?(color||'rgba(255,255,255,0.5)'):'rgba(255,255,255,0.1)'}`, color:active?'#fff':'rgba(255,255,255,0.5)'}} onClick={onClick}>{label}</button>
}

function ItemRow({ item, onToggle, onRemove, catColor }) {
  return (
    <div style={{...styles.itemRow, opacity:item.checked?0.45:1}}>
      <button style={{...styles.checkbox, borderColor:catColor}} onClick={onToggle}>
        {item.checked && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6L5 9L10 3" stroke={catColor} strokeWidth="2" strokeLinecap="round"/></svg>}
      </button>
      <div style={styles.itemContent}>
        <span style={{...styles.itemName, textDecoration:item.checked?'line-through':'none'}}>{item.name}</span>
        <span style={styles.addedBy}>{item.addedBy}</span>
      </div>
      <button style={styles.removeBtn} onClick={onRemove}>×</button>
    </div>
  )
}

const styles = {
  root:{minHeight:'100vh',background:'linear-gradient(135deg,#0f0c1a 0%,#1a1030 50%,#0d1829 100%)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Outfit',sans-serif",position:'relative',overflow:'hidden',padding:'20px'},
  blob1:{position:'absolute',top:-100,right:-80,width:350,height:350,borderRadius:'50%',background:'radial-gradient(circle,rgba(129,140,248,0.15) 0%,transparent 70%)',pointerEvents:'none'},
  blob2:{position:'absolute',bottom:-80,left:-60,width:300,height:300,borderRadius:'50%',background:'radial-gradient(circle,rgba(251,113,133,0.12) 0%,transparent 70%)',pointerEvents:'none'},
  phoneFrame:{width:'100%',maxWidth:390,minHeight:720,background:'rgba(15,12,26,0.85)',backdropFilter:'blur(20px)',borderRadius:32,border:'1px solid rgba(255,255,255,0.08)',boxShadow:'0 30px 80px rgba(0,0,0,0.6)',display:'flex',flexDirection:'column',overflow:'hidden',position:'relative'},
  header:{padding:'28px 24px 16px',display:'flex',justifyContent:'space-between',alignItems:'flex-start',borderBottom:'1px solid rgba(255,255,255,0.06)'},
  appName:{fontSize:22,fontWeight:700,color:'#fff',letterSpacing:'-0.3px'},
  subtitle:{fontSize:12,color:'rgba(255,255,255,0.4)',marginTop:2},
  avatars:{display:'flex',alignItems:'center'},
  avatar:{width:32,height:32,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:'#fff',border:'2px solid rgba(15,12,26,0.9)'},
  filterRow:{display:'flex',gap:6,padding:'12px 16px',overflowX:'auto',scrollbarWidth:'none'},
  chip:{padding:'5px 12px',borderRadius:20,fontSize:12,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'},
  listArea:{flex:1,overflowY:'auto',padding:'8px 16px 100px',scrollbarWidth:'none'},
  empty:{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',paddingTop:80},
  categoryGroup:{marginBottom:20},
  categoryHeader:{display:'flex',alignItems:'center',gap:6,marginBottom:8,paddingLeft:2},
  categoryDot:{width:6,height:6,borderRadius:'50%'},
  categoryLabel:{fontSize:11,fontWeight:600,color:'rgba(255,255,255,0.4)',letterSpacing:'0.6px',textTransform:'uppercase',flex:1},
  categoryCount:{fontSize:11,color:'rgba(255,255,255,0.25)',fontWeight:600},
  itemRow:{display:'flex',alignItems:'center',gap:12,padding:'11px 12px',borderRadius:12,marginBottom:4,border:'1px solid rgba(255,255,255,0.05)',background:'rgba(255,255,255,0.04)'},
  checkbox:{width:22,height:22,borderRadius:7,border:'1.5px solid',background:'transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0},
  itemContent:{flex:1,display:'flex',flexDirection:'column',gap:2},
  itemName:{fontSize:15,color:'#fff',fontWeight:500},
  addedBy:{fontSize:10,color:'rgba(255,255,255,0.3)',fontWeight:500},
  removeBtn:{width:22,height:22,borderRadius:'50%',border:'none',background:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.3)',cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0},
  clearBtn:{width:'100%',padding:'10px',marginTop:8,borderRadius:12,border:'1px dashed rgba(255,255,255,0.12)',background:'transparent',color:'rgba(255,255,255,0.3)',fontSize:12,fontWeight:600,cursor:'pointer'},
  fab:{position:'absolute',bottom:28,right:24,width:56,height:56,borderRadius:'50%',background:'linear-gradient(135deg,#818cf8 0%,#c084fc 100%)',border:'none',color:'#fff',fontSize:28,cursor:'pointer',boxShadow:'0 8px 24px rgba(129,140,248,0.45)',display:'flex',alignItems:'center',justifyContent:'center',lineHeight:1},
  addPanel:{position:'absolute',bottom:0,left:0,right:0,background:'rgba(20,16,36,0.97)',backdropFilter:'blur(20px)',borderTop:'1px solid rgba(255,255,255,0.08)',borderRadius:'24px 24px 0 0',padding:'20px 20px 32px'},
  addPanelInner:{display:'flex',flexDirection:'column',gap:12},
  input:{background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:12,padding:'13px 16px',fontSize:15,color:'#fff',outline:'none',width:'100%',boxSizing:'border-box',fontFamily:'inherit'},
  catSelect:{display:'flex',gap:6,flexWrap:'wrap'},
  catBtn:{width:38,height:38,borderRadius:10,fontSize:18,cursor:'pointer'},
  addActions:{display:'flex',gap:8},
  cancelBtn:{flex:1,padding:'12px',borderRadius:12,border:'1px solid rgba(255,255,255,0.1)',background:'transparent',color:'rgba(255,255,255,0.5)',fontSize:14,fontWeight:600,cursor:'pointer',fontFamily:'inherit'},
  confirmBtn:{flex:2,padding:'12px',borderRadius:12,border:'none',background:'linear-gradient(135deg,#818cf8 0%,#c084fc 100%)',color:'#fff',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'inherit'},
}