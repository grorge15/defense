/**
 * 修复 Main.scene：Player 从 GameRoot 脱落成孤立节点，导致
 * 1) 不进场景树 → update/物理/事件异常 → 近战打不到怪
 * 2) CarryRoot 世界坐标无效 → Economy 背负挂不上
 *
 * 约定路径：GameRoot/Player（见 SceneAssemblySpec）
 */
const fs = require('fs');
const path = require('path');

const SCENE = path.join(__dirname, '..', 'assets/scenes/Main.scene');
const scene = JSON.parse(fs.readFileSync(SCENE, 'utf8'));

const PLAYER_ID = 32;
const GAME_ROOT_ID = 100;

const player = scene[PLAYER_ID];
const gameRoot = scene[GAME_ROOT_ID];

if (!player || player._name !== 'Player') {
    throw new Error(`Expected Player at ${PLAYER_ID}, got ${player && player._name}`);
}
if (!gameRoot || gameRoot._name !== 'GameRoot') {
    throw new Error(`Expected GameRoot at ${GAME_ROOT_ID}`);
}

console.log('Before: Player.parent=', player._parent);
console.log(
    'Before: GameRoot.children=',
    gameRoot._children.map((c) => {
        const n = scene[c.__id__];
        return `${c.__id__}:${n && n._name}`;
    }),
);

// 去掉 GameRoot 下损坏的无名 prefab 占位（原先替换 Player 失败留下的）
const cleaned = [];
for (const c of gameRoot._children) {
    const n = scene[c.__id__];
    if (!n) {
        console.log('  drop missing child', c.__id__);
        continue;
    }
    if (n.__type__ === 'cc.Node' && !n._name && n._prefab) {
        console.log('  drop broken prefab stub', c.__id__);
        continue;
    }
    if (c.__id__ === PLAYER_ID) {
        continue; // 稍后统一追加，避免重复
    }
    cleaned.push(c);
}

if (!cleaned.some((c) => c.__id__ === PLAYER_ID)) {
    cleaned.push({ __id__: PLAYER_ID });
}
gameRoot._children = cleaned;
player._parent = { __id__: GAME_ROOT_ID };

// 确认 CarryRoot / Economy 绑定仍指向 Player 身上的组件
const carry = scene[31];
if (!carry || carry.carryRoot?.__id__ !== 33) {
    console.warn('PlayerCarryStack.carryRoot unexpected', carry && carry.carryRoot);
} else {
    console.log('OK PlayerCarryStack.carryRoot -> CarryRoot(33)');
}
const econ = scene.find((x) => x && x.playerCarry && x.dropRoot);
if (econ?.playerCarry?.__id__ === 31) {
    console.log('OK Economy.playerCarry -> PlayerCarryStack(31)');
} else {
    console.warn('Economy.playerCarry unexpected', econ && econ.playerCarry);
}

fs.writeFileSync(SCENE, JSON.stringify(scene, null, 2));
console.log('After: Player.parent=', player._parent);
console.log(
    'After: GameRoot.children=',
    gameRoot._children.map((c) => {
        const n = scene[c.__id__];
        return `${c.__id__}:${n && n._name}`;
    }),
);
console.log('Fixed. Reopen Main.scene in editor.');
