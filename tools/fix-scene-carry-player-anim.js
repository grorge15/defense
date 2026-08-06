/**
 * 场景修复：
 * 1) Economy.carryRoot → Player/CarryRoot
 * 2) Player 挂 Animation + 6 个 Player_* clips，并绑 PlayerController.anim
 */
const fs = require('fs');
const path = require('path');

const SCENE = path.join(__dirname, '..', 'assets/scenes/Main.scene');
const scene = JSON.parse(fs.readFileSync(SCENE, 'utf8'));

const PLAYER_ID = 32;
const CARRY_ROOT_ID = 33;
const PLAYER_CTRL_ID = 40;

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

// —— Economy.carryRoot ——
const econ = scene.find((x) => x && x.dropRoot !== undefined && (x.playerCarry !== undefined || x.carryRoot !== undefined || x.__type__?.includes?.('ae095')));
// more reliable: find by script type used in scene
const econComp = scene.find((x) => x && x.deposits && x.stalls && x.dropRoot !== undefined);
if (!econComp) {
    throw new Error('ResourceEconomySystem not found');
}
delete econComp.playerCarry;
econComp.carryRoot = { __id__: CARRY_ROOT_ID };
console.log('Economy.carryRoot ->', CARRY_ROOT_ID, 'type', econComp.__type__);

// —— Player Animation ——
const player = scene[PLAYER_ID];
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
    console.log('Added Animation at', animId);
} else {
    scene[animId]._clips = CLIP_UUIDS.map(clipRef);
    scene[animId]._defaultClip = clipRef(CLIP_UUIDS[0]);
    scene[animId].playOnLoad = true;
    scene[animId].node = { __id__: PLAYER_ID };
    console.log('Updated existing Animation', animId);
}

const pc = scene[PLAYER_CTRL_ID];
pc.anim = { __id__: animId };
console.log('PlayerController.anim ->', animId);

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
        const spr = scene.find(
            (x) => x && x.__type__ === 'cc.Sprite' && x.node && x.node.__id__ === 34,
        );
        if (spr) {
            spr._spriteFrame = { __uuid__: first, __expectedType__: 'cc.SpriteFrame' };
            console.log('Synced frame_00000 sprite to idle[0]');
        }
    }
} catch (e) {
    console.warn('skip sprite sync', e.message);
}

fs.writeFileSync(SCENE, JSON.stringify(scene, null, 2));
console.log('Main.scene patched. length=', scene.length);
