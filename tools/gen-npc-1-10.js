const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const ANIM_DIR = path.join(ROOT, 'assets/resources/Animation/characters');
const FOLDER = 'bangshou1_frames';
const SAMPLE = 10;
const FRAME_DT = 1 / SAMPLE;

const FRAME_RANGES = {
    idle: [0, 7],
    walk: [8, 15],
    chop: [16, 23],
};

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

function buildClip(clipName, frameUuids, visualPath, wrapMode) {
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
        { __type__: 'cc.animation.HierarchyPath', path: visualPath },
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

function makeClips(prefix, spritePath, kinds) {
    const uuids = [];
    let firstIdle = null;
    for (const kind of kinds) {
        const [start, end] = FRAME_RANGES[kind];
        const frames = collectFrames(start, end);
        const frameUuids = frames.map(getSpriteFrameUuid);
        if (kind === 'idle') {
            firstIdle = frameUuids[0];
        }
        const wrap = kind === 'chop' ? 1 : 2;
        const file = `${prefix}_${kind}.anim`;
        const animPath = path.join(ANIM_DIR, file);
        fs.writeFileSync(
            animPath,
            JSON.stringify(buildClip(kind, frameUuids, spritePath, wrap), null, 2),
        );
        const uuid = writeAnimMeta(animPath, kind);
        uuids.push(uuid);
        console.log(`Wrote ${file} (${frames.length} frames)`);
    }
    return { uuids, firstIdle };
}

function patchPrefab(prefabPath, opts) {
    const prefab = JSON.parse(fs.readFileSync(prefabPath, 'utf8'));
    const animId = prefab.length;
    const animPfId = animId + 1;

    prefab.push(
        {
            __type__: 'cc.Animation',
            _name: '',
            _objFlags: 0,
            __editorExtras__: {},
            node: { __id__: opts.animNodeId },
            _enabled: true,
            __prefab: { __id__: animPfId },
            playOnLoad: true,
            _clips: opts.clipUuids.map(clipRef),
            _defaultClip: clipRef(opts.clipUuids[0]),
            _id: '',
        },
        { __type__: 'cc.CompPrefabInfo', fileId: opts.animFileId },
    );

    const animNode = prefab.find((x) => x.__type__ === 'cc.Node' && x._name === opts.animNodeName);
    const hasAnim = animNode._components.some((c) => c.__id__ === animId);
    if (!hasAnim) {
        animNode._components.push({ __id__: animId });
    }

    const npc = prefab.find((x) => x.__type__ === opts.npcScriptType);
    npc.anim = { __id__: animId };

    const spr = prefab.find(
        (x) => x.__type__ === 'cc.Sprite' && x.node && x.node.__id__ === opts.spriteNodeId,
    );
    if (spr && opts.firstIdleUuid) {
        spr._spriteFrame = { __uuid__: opts.firstIdleUuid, __expectedType__: 'cc.SpriteFrame' };
    }

    fs.writeFileSync(prefabPath, JSON.stringify(prefab, null, 2));
    console.log(`Patched ${path.basename(prefabPath)}`);
}

fs.mkdirSync(ANIM_DIR, { recursive: true });

const helperClips = makeClips('Helper', 'helper', ['idle', 'walk']);
const ljackClips = makeClips('Lumberjack', 'visual', ['idle', 'walk', 'chop']);

patchPrefab(path.join(ROOT, 'assets/resources/prefabs/helper.prefab'), {
    animNodeId: 1,
    animNodeName: 'helper',
    spriteNodeId: 1,
    firstIdleUuid: helperClips.firstIdle,
    npcScriptType: '0e90dRyOutOSa3xdlSv/Sl6',
    clipUuids: helperClips.uuids,
    animFileId: 'helperAnimPF01',
});

patchPrefab(path.join(ROOT, 'assets/resources/prefabs/lumberJack.prefab'), {
    animNodeId: 1,
    animNodeName: 'lumberJack',
    spriteNodeId: 2,
    firstIdleUuid: ljackClips.firstIdle,
    npcScriptType: '5805cQcbHxAubJRUo7jHJOp',
    clipUuids: ljackClips.uuids,
    animFileId: 'ljackAnimPF01',
});

console.log('Task 1.10 generation complete.');
