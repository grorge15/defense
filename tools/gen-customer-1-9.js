const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const ANIM_DIR = path.join(ROOT, 'assets/resources/Animation/characters');
const PREFAB_PATH = path.join(ROOT, 'assets/resources/prefabs/customer.prefab');
const FOLDER = 'npc1_frames';
const SAMPLE = 10;
const FRAME_DT = 1 / SAMPLE;
const SPRITE_PATH = 'customer';

const VARIANTS = [
    { idle: [0, 7], walk: [8, 15] },
    { idle: [16, 23], walk: [24, 32] },
    { idle: [33, 39], walk: [40, 47] },
    { idle: [48, 55], walk: [56, 63] },
];

function pad(n) {
    return String(n).padStart(3, '0');
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
            _duration: (n - 1) * FRAME_DT,
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
for (let v = 0; v < VARIANTS.length; v++) {
    for (const kind of ['idle', 'walk']) {
        const range = VARIANTS[v][kind];
        const frames = collectFrames(range[0], range[1]);
        const uuids = frames.map(getSpriteFrameUuid);
        const clipName = `Customer_${v}_${kind}`;
        const animPath = path.join(ANIM_DIR, `${clipName}.anim`);
        const wrapMode = 2;
        fs.writeFileSync(animPath, JSON.stringify(buildClip(clipName, uuids, wrapMode), null, 2));
        const clipUuid = writeAnimMeta(animPath, clipName);
        clipUuids.push({ clipName, clipUuid, v, kind, firstUuid: uuids[0] });
        console.log(`Wrote ${clipName}.anim (${frames.length} frames)`);
    }
}

const prefab = JSON.parse(fs.readFileSync(PREFAB_PATH, 'utf8'));

const animId = 49;
const animPrefabInfoId = 50;
const animCompInfoId = 51;

const clipRefs = clipUuids.map((c) => clipRef(c.clipUuid));
const defaultClip = clipRef(clipUuids[0].clipUuid);

prefab.push(
    {
        __type__: 'cc.Animation',
        _name: '',
        _objFlags: 0,
        __editorExtras__: {},
        node: { __id__: 1 },
        _enabled: true,
        __prefab: { __id__: animPrefabInfoId },
        playOnLoad: true,
        _clips: clipRefs,
        _defaultClip: defaultClip,
        _id: '',
    },
    { __type__: 'cc.CompPrefabInfo', fileId: 'custAnimPF01' },
);

const root = prefab.find((x) => x.__type__ === 'cc.Node' && x._name === 'customer');
root._components.push({ __id__: animId });

const customerComp = prefab.find((x) => x.__type__ === '0f371ugDmNAiolS4fgLOUFh');
customerComp.anim = { __id__: animId };

const firstIdle = clipUuids.find((c) => c.v === 0 && c.kind === 'idle');
const spriteComp = prefab.find((x) => x.__type__ === 'cc.Sprite' && x.node && x.node.__id__ === 1);
if (spriteComp && firstIdle) {
    spriteComp._spriteFrame = {
        __uuid__: firstIdle.firstUuid,
        __expectedType__: 'cc.SpriteFrame',
    };
}

fs.writeFileSync(PREFAB_PATH, JSON.stringify(prefab, null, 2));
console.log('Patched customer.prefab with Animation + 8 clips');
