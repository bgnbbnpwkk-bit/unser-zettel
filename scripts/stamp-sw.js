import { readFileSync, writeFileSync } from 'fs'

const path = 'public/sw.js'
const sw = readFileSync(path, 'utf8')
const version = Date.now()
const stamped = sw.replace(/const CACHE = 'zettel-[^']*'/, `const CACHE = 'zettel-${version}'`)
writeFileSync(path, stamped)
console.log(`SW stamped: zettel-${version}`)
