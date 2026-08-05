const fs = require('fs');

const mainPath = 'C:/Users/Admin/Defense2/assets/scenes/Main.scene';
const p4Path = 'C:/Users/Admin/Defense2/assets/scenes/Phase4Cooked.scene';
const main = JSON.parse(fs.readFileSync(mainPath, 'utf8'));
const p4 = JSON.parse(fs.readFileSync(p4Path, 'utf8'));

function findNode(arr, name) {
  return arr.findIndex((o) => o && o.__type__ === 'cc.Node' && o._name === name);
}

function walkIds(obj, out) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (const v of obj) walkIds(v, out);
    return;
  }
  if (typeof obj.__id__ === 'number') out.add(obj.__id__);
  for (const k of Object.keys(obj)) walkIds(obj[k], out);
}

/** BFS only through children + components + prefab links of nodes we own */
function collectOwned(arr, rootIdx) {
  const keep = new Set([rootIdx]);
  const q = [rootIdx];
  while (q.length) {
    const i = q.shift();
    const o = arr[i];
    if (!o) continue;

    const push = (id) => {
      if (typeof id !== 'number') return;
      if (id < 0 || id >= arr.length) return;
      if (keep.has(id)) return;
      keep.add(id);
      q.push(id);
    };

    if (o.__type__ === 'cc.Node') {
      for (const c of o._children || []) push(c && c.__id__);
      for (const c of o._components || []) push(c && c.__id__);
      if (o._prefab) push(o._prefab.__id__);
      continue;
    }

    // For components / prefab meta: follow __id__ refs BUT skip parent nodes outside subtree
    const refs = new Set();
    walkIds(o, refs);
    for (const id of refs) {
      if (id === i) continue;
      const t = arr[id];
      if (!t) continue;
      // Never pull scene roots / wrappers
      if (t.__type__ === 'cc.Scene') continue;
      if (t.__type__ === 'cc.SceneGlobals') continue;
      if (t.__type__ === 'cc.Node') {
        const n = t._name;
        if (['City', 'Stalls', 'Purchases', 'Canvas', 'Camera', 'Phase4Cooked'].includes(n)) continue;
        // only allow nodes already reachable as children (already in keep) — skip external
        if (!keep.has(id)) {
          // allow if this node's parent is already kept
          const pid = t._parent && t._parent.__id__;
          if (typeof pid === 'number' && keep.has(pid)) push(id);
          continue;
        }
      }
      push(id);
    }
  }
  return keep;
}

const stallP4 = findNode(p4, 'Stall_CookedMeat');
const buyP4 = findNode(p4, 'BuyCookedStall');
const cityP4 = findNode(p4, 'City');
if (stallP4 < 0 || buyP4 < 0) throw new Error('Phase4 missing roots');

const keep = new Set();
for (const id of collectOwned(p4, stallP4)) keep.add(id);
for (const id of collectOwned(p4, buyP4)) keep.add(id);

let siteOld = -1;
for (const c of p4[cityP4]._components || []) {
  const t = p4[c.__id__];
  if (t && String(t.__type__).includes('a7c4e')) {
    siteOld = c.__id__;
    keep.add(siteOld);
    break;
  }
}
if (siteOld < 0) {
  // fallback by stallId field
  for (let i = 0; i < p4.length; i++) {
    const t = p4[i];
    if (t && t.stallId === 'stall_cooked' && t.purchaseTrigger && t.stallRoot) {
      siteOld = i;
      keep.add(i);
      break;
    }
  }
}

console.log({ stallP4, buyP4, siteOld, keep: keep.size });

const forbidden = [];
for (const id of keep) {
  const o = p4[id];
  if (!o) continue;
  if (o.__type__ === 'cc.Scene' || o.__type__ === 'cc.SceneGlobals') forbidden.push(id);
  if (o.__type__ === 'cc.Node' && ['City', 'Stalls', 'Purchases', 'Camera'].includes(o._name)) {
    if (id !== stallP4 && id !== buyP4) forbidden.push(id);
  }
}
for (const id of forbidden) keep.delete(id);
console.log('after filter', keep.size, 'removed', forbidden.length);

const mainStalls = findNode(main, 'Stalls');
const mainPurch = findNode(main, 'Purchases');
const mainCity = findNode(main, 'City');
if (findNode(main, 'Stall_CookedMeat') >= 0) {
  console.log('already merged');
  process.exit(0);
}

const sorted = [...keep].sort((a, b) => a - b);
const idMap = new Map();
let nextId = main.length;
for (const oldId of sorted) idMap.set(oldId, nextId++);

function remap(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(remap);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === '__id__' && typeof v === 'number') {
      out[k] = idMap.has(v) ? idMap.get(v) : v; // dangling kept as-is only if missing — better null?
      if (!idMap.has(v) && v !== mainStalls && v !== mainPurch && v !== mainCity) {
        // leave unmapped external ids — will fix parents manually
        out[k] = v;
      }
    } else out[k] = remap(v);
  }
  return out;
}

const appended = sorted.map((oldId) => remap(JSON.parse(JSON.stringify(p4[oldId]))));

const newStallId = idMap.get(stallP4);
const newBuyId = idMap.get(buyP4);
appended[sorted.indexOf(stallP4)]._parent = { __id__: mainStalls };
appended[sorted.indexOf(buyP4)]._parent = { __id__: mainPurch };

main[mainStalls]._children.push({ __id__: newStallId });
main[mainPurch]._children.push({ __id__: newBuyId });

if (siteOld >= 0 && idMap.has(siteOld)) {
  const siteNew = idMap.get(siteOld);
  main[mainCity]._components = main[mainCity]._components || [];
  main[mainCity]._components.push({ __id__: siteNew });
  appended[sorted.indexOf(siteOld)].node = { __id__: mainCity };
}

for (const obj of appended) main.push(obj);

// sanity
const types = {};
for (let i = 465; i < main.length; i++) {
  const t = main[i].__type__;
  types[t] = (types[t] || 0) + 1;
}
console.log('appended types', types);
console.log('newStall', newStallId, 'newBuy', newBuyId, 'len', main.length);

fs.writeFileSync(mainPath, JSON.stringify(main, null, 2));
console.log('OK');
