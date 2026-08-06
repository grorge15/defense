const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const ANIM_DIR = path.join(ROOT, 'assets/resources/Animation/characters');
const PREFAB_PATH = path.join(ROOT, 'assets/resources/prefabs/Player.prefab');
const FOLDER = '9011加拉哈德序列帧';
const SAMPLE = 10;
const FRAME_DT = 1 / SAMPLE;
const SPRITE_PATH = 'frame_00000';

/** clipName → [start, end, wrapMode]  wrap 2=Loop 1=Normal(Once) */
const CLIPS = [
    { name: 'idle', start: 0, end: 8, wrap: 2 },
    { name: 'run', start: 9, end: 14, wrap: 2 },
    { name: 'meleeAttack', start: 14, end: 24, wrap: 1 },
    { name: 'dead', start: 25, end: 31, wrap: 1 },
    { name: 'rangeAttack', start: 33, end: 56, wrap: 1 },
    { name: 'chop', start: 58, end: 64, wrap: 1 },
];

function pad(n) {
    return String(n).padStart(5, '0');
}

function frameMetaPath(frameNum) {
    return path.join(ROOT, 'assets/resources/sprite/frames', FOLDER, `frame_${pad(frameNum)}.png.meta`);
}

function getSpriteFrameUuid(frameNum) {
    const meta = JSON.parse(fs.readFileSync(frameMetaPath(frameNum), 'utf8'));
    const sf = meta.subMetas && meta.subMetas.f9941;
    return sf ? sf.uuid : `${meta.uuid}@f9941`;
}

function collectFrames(start, end) {
    const frames = [];
    for (let i = start; i <= end; i++) {
        if (fs.existsSync(frameMetaPath(i))) {
            frames.push(i);
        } else {
            console.warn(`  skip missing frame_${pad(i)}`);
        }
    }
    if (!frames.length) {
        throw new Error(`No frames [${start}, ${end}]`);
    }
    return frames;
}

function buildClip(clipName, frameUuids, wrapMode) {
    const n = frameUuids.length;
    const times = Array.from({ length: n }, (_, i) => i * FRAME_DT);
    const values = frameUuids.map((uuid) => ({
        __uuid__: uuid,
        __expectedType__: 'cc.SpriteFrame',
    }));
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
        { __type__: 'cc.animation.HierarchyPath', path: SPRITE_PATH },
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

function writeAnimMeta(filePath, clipName) {
    const metaPath = `${filePath}.meta`;
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

function clipRef(uuid) {
    return { __uuid__: uuid, __expectedType__: 'cc.AnimationClip' };
}

fs.mkdirSync(ANIM_DIR, { recursive: true });

const clipUuids = [];
let firstIdleUuid = null;

for (const c of CLIPS) {
    const frames = collectFrames(c.start, c.end);
    const frameUuids = frames.map(getSpriteFrameUuid);
    if (c.name === 'idle') {
        firstIdleUuid = frameUuids[0];
    }
    const file = `Player_${c.name}.anim`;
    const animPath = path.join(ANIM_DIR, file);
    fs.writeFileSync(animPath, JSON.stringify(buildClip(c.name, frameUuids, c.wrap), null, 2));
    const uuid = writeAnimMeta(animPath, c.name);
    clipUuids.push(uuid);
    console.log(`Wrote ${file} (${frames.length} frames)`);
}

const prefab = JSON.parse(fs.readFileSync(PREFAB_PATH, 'utf8'));
const clipsPayload = clipUuids.map(clipRef);
const defaultClip = clipRef(clipUuids[0]);

let animId = prefab.findIndex((x) => x.__type__ === 'cc.Animation');
if (animId >= 0) {
    // 幂等：只更新已有 Animation 的 clips
    prefab[animId]._clips = clipsPayload;
    prefab[animId]._defaultClip = defaultClip;
    prefab[animId].playOnLoad = true;
    prefab[animId].node = { __id__: 1 };
} else {
    animId = prefab.length;
    const animPfId = animId + 1;
    prefab.push(
        {
            __type__: 'cc.Animation',
            _name: '',
            _objFlags: 0,
            __editorExtras__: {},
            node: { __id__: 1 },
            _enabled: true,
            __prefab: { __id__: animPfId },
            playOnLoad: true,
            _clips: clipsPayload,
            _defaultClip: defaultClip,
            _id: '',
        },
        { __type__: 'cc.CompPrefabInfo', fileId: 'playerAnimPF01' },
    );
    const root = prefab.find((x) => x.__type__ === 'cc.Node' && x._name === 'Player');
    if (!root._components.some((c) => c.__id__ === animId)) {
        root._components.push({ __id__: animId });
    }
}

const playerComp = prefab.find((x) => x.__type__ === 'e1d6epLB2RG4rFMEKd1PXPb');
playerComp.anim = { __id__: animId };

const spriteComp = prefab.find(
    (x) => x.__type__ === 'cc.Sprite' && x.node && x.node.__id__ === 4,
);
if (spriteComp && firstIdleUuid) {
    spriteComp._spriteFrame = {
        __uuid__: firstIdleUuid,
        __expectedType__: 'cc.SpriteFrame',
    };
}

fs.writeFileSync(PREFAB_PATH, JSON.stringify(prefab, null, 2));
console.log(`Patched Player.prefab Animation id=${animId}`);
console.log('Task 1.1 generation complete.');
