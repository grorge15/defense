/**
 * 修复所有角色序列帧动画：
 * 1) sample 60→10（原先约 0.12s 播完一整段，看起来像加速）
 * 2) HierarchyPath：Animation 在根、Sprite 在子节点用子节点名；
 *    Sprite 与 Animation 同节点则不加 HierarchyPath
 * 3) Hero：把 Animation 从 visual 挪到根，与 clip 路径 visual 对齐
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const ANIM_DIR = path.join(ROOT, 'assets/resources/Animation/characters');
const SAMPLE = 10;
const FRAME_DT = 1 / SAMPLE;

function pad(n, w) {
    return String(n).padStart(w, '0');
}

function getSfUuid(folder, frameNum, width) {
    const metaPath = path.join(
        ROOT,
        'assets/resources/sprite/frames',
        folder,
        `frame_${pad(frameNum, width)}.png.meta`,
    );
    if (!fs.existsSync(metaPath)) {
        return null;
    }
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const sf = meta.subMetas && meta.subMetas.f9941;
    return sf ? sf.uuid : `${meta.uuid}@f9941`;
}

function collect(folder, start, end, width) {
    const out = [];
    for (let i = start; i <= end; i++) {
        const u = getSfUuid(folder, i, width);
        if (u) {
            out.push(u);
        } else {
            console.warn(`  skip ${folder} frame ${i}`);
        }
    }
    if (!out.length) {
        throw new Error(`No frames ${folder} [${start},${end}]`);
    }
    return out;
}

/** spritePath: string=子节点名；null=同节点 Sprite */
function buildClip(clipName, frameUuids, wrapMode, spritePath) {
    const n = frameUuids.length;
    const times = Array.from({ length: n }, (_, i) => i * FRAME_DT);
    const values = frameUuids.map((uuid) => ({
        __uuid__: uuid,
        __expectedType__: 'cc.SpriteFrame',
    }));

    if (spritePath) {
        return [
            {
                __type__: 'cc.AnimationClip',
                _name: clipName,
                _objFlags: 0,
                __editorExtras__: { embeddedPlayerGroups: [] },
                _native: '',
                sample: SAMPLE,
                speed: 1,
                wrapMode,
                enableTrsBlending: false,
                _duration: Math.max(0, (n - 1) * FRAME_DT),
                _hash: 500763545,
                _tracks: [{ __id__: 1 }],
                _exoticAnimation: null,
                _events: [],
                _embeddedPlayers: [],
                _additiveSettings: { __id__: 7 },
                _auxiliaryCurveEntries: [],
            },
            {
                __type__: 'cc.animation.ObjectTrack',
                _binding: {
                    __type__: 'cc.animation.TrackBinding',
                    path: { __id__: 2 },
                    proxy: null,
                },
                _channel: { __id__: 5 },
            },
            {
                __type__: 'cc.animation.TrackPath',
                _paths: [{ __id__: 3 }, { __id__: 4 }, 'spriteFrame'],
            },
            { __type__: 'cc.animation.HierarchyPath', path: spritePath },
            { __type__: 'cc.animation.ComponentPath', component: 'cc.Sprite' },
            { __type__: 'cc.animation.Channel', _curve: { __id__: 6 } },
            { __type__: 'cc.ObjectCurve', _times: times, _values: values },
            {
                __type__: 'cc.AnimationClipAdditiveSettings',
                enabled: false,
                refClip: null,
            },
        ];
    }

    // 同节点：无 HierarchyPath
    return [
        {
            __type__: 'cc.AnimationClip',
            _name: clipName,
            _objFlags: 0,
            __editorExtras__: { embeddedPlayerGroups: [] },
            _native: '',
            sample: SAMPLE,
            speed: 1,
            wrapMode,
            enableTrsBlending: false,
            _duration: Math.max(0, (n - 1) * FRAME_DT),
            _hash: 500763545,
            _tracks: [{ __id__: 1 }],
            _exoticAnimation: null,
            _events: [],
            _embeddedPlayers: [],
            _additiveSettings: { __id__: 6 },
            _auxiliaryCurveEntries: [],
        },
        {
            __type__: 'cc.animation.ObjectTrack',
            _binding: {
                __type__: 'cc.animation.TrackBinding',
                path: { __id__: 2 },
                proxy: null,
            },
            _channel: { __id__: 4 },
        },
        {
            __type__: 'cc.animation.TrackPath',
            _paths: [{ __id__: 3 }, 'spriteFrame'],
        },
        { __type__: 'cc.animation.ComponentPath', component: 'cc.Sprite' },
        { __type__: 'cc.animation.Channel', _curve: { __id__: 5 } },
        { __type__: 'cc.ObjectCurve', _times: times, _values: values },
        {
            __type__: 'cc.AnimationClipAdditiveSettings',
            enabled: false,
            refClip: null,
        },
    ];
}

function ensureMeta(animPath, clipName) {
    const metaPath = `${animPath}.meta`;
    if (fs.existsSync(metaPath)) {
        return JSON.parse(fs.readFileSync(metaPath, 'utf8')).uuid;
    }
    const id = crypto.randomUUID();
    fs.writeFileSync(
        metaPath,
        JSON.stringify(
            {
                ver: '2.0.4',
                importer: 'animation-clip',
                imported: true,
                uuid: id,
                files: ['.bin'],
                subMetas: {},
                userData: { name: clipName },
            },
            null,
            2,
        ),
    );
    return id;
}

function writeClip(fileName, clipName, uuids, wrap, spritePath) {
    const animPath = path.join(ANIM_DIR, fileName);
    fs.writeFileSync(animPath, JSON.stringify(buildClip(clipName, uuids, wrap, spritePath), null, 2));
    const uuid = ensureMeta(animPath, clipName);
    console.log(`  ${fileName} frames=${uuids.length} dur=${((uuids.length - 1) / SAMPLE).toFixed(2)}s path=${spritePath ?? '(self)'}`);
    return uuid;
}

function clipRef(uuid) {
    return { __uuid__: uuid, __expectedType__: 'cc.AnimationClip' };
}

function moveAnimToRoot(prefabPath, opts) {
    const prefab = JSON.parse(fs.readFileSync(prefabPath, 'utf8'));
    const animId = prefab.findIndex((x) => x.__type__ === 'cc.Animation');
    if (animId < 0) {
        console.warn(`no Animation in ${prefabPath}`);
        return;
    }
    const root = prefab.find((x) => x.__type__ === 'cc.Node' && x._name === opts.rootName);
    const visual = prefab.find((x) => x.__type__ === 'cc.Node' && x._name === opts.visualName);
    prefab[animId].node = { __id__: 1 };
    prefab[animId].playOnLoad = true;
    if (opts.clipUuids) {
        prefab[animId]._clips = opts.clipUuids.map(clipRef);
        prefab[animId]._defaultClip = clipRef(opts.clipUuids[0]);
    }
    if (visual) {
        visual._components = visual._components.filter((c) => c.__id__ !== animId);
    }
    if (root && !root._components.some((c) => c.__id__ === animId)) {
        root._components.push({ __id__: animId });
    }
    if (opts.scriptType) {
        const comp = prefab.find((x) => x.__type__ === opts.scriptType);
        if (comp) {
            comp.anim = { __id__: animId };
        }
    }
    if (opts.firstIdle && visual) {
        const spr = prefab.find(
            (x) => x.__type__ === 'cc.Sprite' && x.node && x.node.__id__ === 2,
        );
        if (spr) {
            spr._spriteFrame = { __uuid__: opts.firstIdle, __expectedType__: 'cc.SpriteFrame' };
        }
    }
    fs.writeFileSync(prefabPath, JSON.stringify(prefab, null, 2));
    console.log(`  patched ${path.basename(prefabPath)} anim→root id=${animId}`);
}

function patchClipsOnly(prefabPath, clipUuids, scriptType) {
    const prefab = JSON.parse(fs.readFileSync(prefabPath, 'utf8'));
    const animId = prefab.findIndex((x) => x.__type__ === 'cc.Animation');
    if (animId < 0) {
        throw new Error(`no Animation ${prefabPath}`);
    }
    prefab[animId]._clips = clipUuids.map(clipRef);
    prefab[animId]._defaultClip = clipRef(clipUuids[0]);
    prefab[animId].playOnLoad = true;
    if (scriptType) {
        const comp = prefab.find((x) => x.__type__ === scriptType);
        if (comp) {
            comp.anim = { __id__: animId };
        }
    }
    fs.writeFileSync(prefabPath, JSON.stringify(prefab, null, 2));
    console.log(`  updated clips ${path.basename(prefabPath)}`);
}

fs.mkdirSync(ANIM_DIR, { recursive: true });

console.log('=== Player (path frame_00000) ===');
const playerClips = [
    { name: 'idle', start: 0, end: 8, wrap: 2 },
    { name: 'run', start: 9, end: 14, wrap: 2 },
    { name: 'meleeAttack', start: 14, end: 24, wrap: 1 },
    { name: 'dead', start: 25, end: 31, wrap: 1 },
    { name: 'rangeAttack', start: 33, end: 56, wrap: 1 },
    { name: 'chop', start: 58, end: 64, wrap: 1 },
].map((c) =>
    writeClip(
        `Player_${c.name}.anim`,
        c.name,
        collect('9011加拉哈德序列帧', c.start, c.end, 5),
        c.wrap,
        'frame_00000',
    ),
);
patchClipsOnly(
    path.join(ROOT, 'assets/resources/prefabs/Player.prefab'),
    playerClips,
    'e1d6epLB2RG4rFMEKd1PXPb',
);

console.log('=== Enemy (path viusal) ===');
const enemyClips = [
    { name: 'idle', start: 0, end: 7, wrap: 2 },
    { name: 'walk', start: 8, end: 15, wrap: 2 },
    { name: 'attack', start: 16, end: 23, wrap: 1 },
    { name: 'dead', start: 24, end: 31, wrap: 1 },
].map((c) =>
    writeClip(
        `Enemy_${c.name}.anim`,
        c.name,
        collect('gebuling1_frames', c.start, c.end, 3),
        c.wrap,
        'viusal',
    ),
);
patchClipsOnly(
    path.join(ROOT, 'assets/resources/prefabs/enemy.prefab'),
    enemyClips,
    'd76ecW3HhhKIpnBRhzYluK2',
);

console.log('=== Helper (self Sprite, no HierarchyPath) ===');
const helperClips = [
    { name: 'idle', start: 0, end: 7, wrap: 2 },
    { name: 'walk', start: 8, end: 15, wrap: 2 },
].map((c) =>
    writeClip(
        `Helper_${c.name}.anim`,
        c.name,
        collect('bangshou1_frames', c.start, c.end, 3),
        c.wrap,
        null,
    ),
);
patchClipsOnly(
    path.join(ROOT, 'assets/resources/prefabs/helper.prefab'),
    helperClips,
    '0e90dRyOutOSa3xdlSv/Sl6',
);

console.log('=== Lumberjack (path visual) ===');
const ljackClips = [
    { name: 'idle', start: 0, end: 7, wrap: 2 },
    { name: 'walk', start: 8, end: 15, wrap: 2 },
    { name: 'chop', start: 16, end: 23, wrap: 1 },
].map((c) =>
    writeClip(
        `Lumberjack_${c.name}.anim`,
        c.name,
        collect('bangshou1_frames', c.start, c.end, 3),
        c.wrap,
        'visual',
    ),
);
patchClipsOnly(
    path.join(ROOT, 'assets/resources/prefabs/lumberJack.prefab'),
    ljackClips,
    '5805cQcbHxAubJRUo7jHJOp',
);

console.log('=== Customer (self Sprite, no HierarchyPath) ===');
const customerVariants = [
    { idle: [0, 7], walk: [8, 15] },
    { idle: [16, 23], walk: [24, 32] },
    { idle: [33, 39], walk: [40, 47] },
    { idle: [48, 55], walk: [56, 63] },
];
const customerClips = [];
for (let v = 0; v < customerVariants.length; v++) {
    for (const kind of ['idle', 'walk']) {
        const [a, b] = customerVariants[v][kind];
        customerClips.push(
            writeClip(
                `Customer_${v}_${kind}.anim`,
                `Customer_${v}_${kind}`,
                collect('npc1_frames', a, b, 3),
                2,
                null,
            ),
        );
    }
}
patchClipsOnly(
    path.join(ROOT, 'assets/resources/prefabs/customer.prefab'),
    customerClips,
    '0f371ugDmNAiolS4fgLOUFh',
);

console.log('=== Heroes (path visual, Animation→root) ===');
const heroes = [
    {
        key: 'Fire',
        folder: 'yingxiongdazhao2_frames',
        ranges: { idle: [0, 7], attack: [8, 24], skill: [25, 39] },
        prefab: 'pref_Hero_Fire.prefab',
    },
    {
        key: 'Ice',
        folder: 'yingxiongdazhao1_frames',
        ranges: { idle: [0, 7], attack: [8, 16], skill: [17, 32] },
        prefab: 'pref_Hero_Ice.prefab',
    },
    {
        key: 'Thunder',
        folder: 'yingxiongdazhao1_frames',
        ranges: { idle: [33, 39], attack: [40, 48], skill: [49, 63] },
        prefab: 'pref_Hero_Thunder.prefab',
    },
    {
        key: 'Wind',
        folder: 'yingxiongdazhao3_frames',
        ranges: { idle: [0, 7], attack: [8, 16], skill: [17, 33] },
        prefab: 'pref_Hero_Wind.prefab',
    },
];

const heroScriptType = 'ef9c1v1x15GLqIgQmgs40zp';

for (const h of heroes) {
    const uuids = [];
    let firstIdle = null;
    for (const kind of ['idle', 'attack', 'skill']) {
        const [a, b] = h.ranges[kind];
        const frames = collect(h.folder, a, b, 3);
        if (kind === 'idle') {
            firstIdle = frames[0];
        }
        uuids.push(
            writeClip(
                `Hero_${h.key}_${kind}.anim`,
                kind,
                frames,
                kind === 'idle' ? 2 : 1,
                'visual',
            ),
        );
    }
    moveAnimToRoot(path.join(ROOT, 'assets/resources/prefabs', h.prefab), {
        rootName: path.basename(h.prefab, '.prefab'),
        visualName: 'visual',
        clipUuids: uuids,
        scriptType: heroScriptType,
        firstIdle,
    });
}

console.log('Done. Refresh assets in Cocos Editor.');
