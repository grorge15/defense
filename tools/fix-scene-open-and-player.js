/**
 * 修复 Main.scene 打不开 + Player 攻击动画缺失：
 * - 去掉 World 下损坏的 Player.prefab 实例（767）
 * - 把真正的 Player(32) 挂回 GameRoot
 * - 清理指向 767 的 targetOverrides
 * - 绑定 Combat.player / Economy.carryRoot
 * - 给 Player 挂 Animation（含 meleeAttack）
 */
const fs = require('fs');
const path = require('path');

const SCENE = path.join(__dirname, '..', 'assets/scenes/Main.scene');
const scene = JSON.parse(fs.readFileSync(SCENE, 'utf8'));

const PLAYER_ID = 32;
const CARRY_ROOT_ID = 33;
const PLAYER_CTRL_ID = 40;
const GAME_ROOT_ID = 100;
const WORLD_ID = 133;
const COMBAT_SYS_ID = 130;
const BROKEN_PREFAB_NODE = 767;

const CLIP_UUIDS = [
    '481cb958-98ef-4943-9ae7-71719348c8a8', // idle
    '3d46bd63-ea82-4812-a765-db3cf0aec2a2', // run
    '26899a06-af10-4cd9-ad83-ad6cda78ce07', // meleeAttack
    'c7cb66f6-2ae8-4275-b5ce-ba5cb118fa00', // dead
    '07525d42-83f2-4d40-bd9a-a8651f049e6f', // rangeAttack
    '18ba787d-8e00-4eb3-b4bc-56227f3f1fd9', // chop
];

function clipRef(uuid) {
    return { __uuid__: uuid, __expectedType__: 'cc.AnimationClip' };
}

const player = scene[PLAYER_ID];
const gameRoot = scene[GAME_ROOT_ID];
const world = scene[WORLD_ID];

if (!player || player._name !== 'Player') {
    throw new Error('Player node missing');
}
if (!gameRoot || gameRoot._name !== 'GameRoot') {
    throw new Error('GameRoot missing');
}

// 1) 从 World 移除损坏的 Player prefab 占位
world._children = (world._children || []).filter((c) => c.__id__ !== BROKEN_PREFAB_NODE);
if (scene[BROKEN_PREFAB_NODE]) {
    scene[BROKEN_PREFAB_NODE]._parent = null;
    scene[BROKEN_PREFAB_NODE]._objFlags = scene[BROKEN_PREFAB_NODE]._objFlags | 0; // keep object to avoid id shift
    console.log('Detached broken PrefabInstance node', BROKEN_PREFAB_NODE);
}

// 2) Player 挂回 GameRoot
gameRoot._children = (gameRoot._children || []).filter((c) => {
    const n = scene[c.__id__];
    if (!n) {
        return false;
    }
    if (!n._name && n._prefab) {
        console.log('Drop broken stub under GameRoot', c.__id__);
        return false;
    }
    return c.__id__ !== PLAYER_ID;
});
gameRoot._children.push({ __id__: PLAYER_ID });
player._parent = { __id__: GAME_ROOT_ID };
console.log('Player parent -> GameRoot');

// 3) 清理指向 767 的 targetOverrides
const prefabInfo = scene.find(
    (x) => x && x.__type__ === 'cc.PrefabInfo' && Array.isArray(x.targetOverrides) && x.targetOverrides.length,
);
if (prefabInfo) {
    const before = prefabInfo.targetOverrides.length;
    prefabInfo.targetOverrides = prefabInfo.targetOverrides.filter((ref) => {
        const ov = scene[ref.__id__];
        if (!ov) {
            return false;
        }
        const src = ov.source && ov.source.__id__;
        const tgt = ov.target && ov.target.__id__;
        if (src === BROKEN_PREFAB_NODE || tgt === BROKEN_PREFAB_NODE) {
            console.log('Remove override', ref.__id__, ov.propertyPath);
            return false;
        }
        return true;
    });
    console.log('targetOverrides', before, '->', prefabInfo.targetOverrides.length);
}

// 4) Combat.player
const combat = scene[COMBAT_SYS_ID];
if (combat) {
    combat.player = { __id__: PLAYER_CTRL_ID };
    console.log('Combat.player ->', PLAYER_CTRL_ID);
}

// 5) Economy.carryRoot
const econ = scene.find((x) => x && x.deposits && x.stalls && x.dropRoot !== undefined);
if (econ) {
    delete econ.playerCarry;
    econ.carryRoot = { __id__: CARRY_ROOT_ID };
    console.log('Economy.carryRoot ->', CARRY_ROOT_ID);
}

// 6) Player Animation
let animId = player._components.map((c) => c.__id__).find((id) => scene[id]?.__type__ === 'cc.Animation');
if (animId == null) {
    animId = scene.length;
    scene.push({
        __type__: 'cc.Animation',
        _name: '',
        _objFlags: 0,
        __editorExtras__: {},
        node: { __id__: PLAYER_ID },
        _enabled: true,
        __prefab: null,
        playOnLoad: true,
        _clips: CLIP_UUIDS.map(clipRef),
        _defaultClip: clipRef(CLIP_UUIDS[0]),
        _id: 'Comp.PlayerAnim',
    });
    player._components.push({ __id__: animId });
    console.log('Added Animation', animId);
} else {
    scene[animId]._clips = CLIP_UUIDS.map(clipRef);
    scene[animId]._defaultClip = clipRef(CLIP_UUIDS[0]);
    scene[animId].playOnLoad = true;
    console.log('Updated Animation', animId);
}
scene[PLAYER_CTRL_ID].anim = { __id__: animId };

// idle 首帧
try {
    const idleAnim = JSON.parse(
        fs.readFileSync(
            path.join(__dirname, '..', 'assets/resources/Animation/characters/Player_idle.anim'),
            'utf8',
        ),
    );
    const curve = idleAnim.find((x) => x.__type__ === 'cc.ObjectCurve');
    const first = curve?._values?.[0]?.__uuid__;
    if (first) {
        const spr = scene.find((x) => x && x.__type__ === 'cc.Sprite' && x.node && x.node.__id__ === 34);
        if (spr) {
            spr._spriteFrame = { __uuid__: first, __expectedType__: 'cc.SpriteFrame' };
        }
    }
} catch (_) {
    /* ignore */
}

fs.writeFileSync(SCENE, JSON.stringify(scene, null, 2));
console.log('Done. Reopen Main.scene');
console.log('GameRoot children', gameRoot._children.map((c) => c.__id__ + ':' + (scene[c.__id__] && scene[c.__id__]._name)));
console.log('Player parent', player._parent);
