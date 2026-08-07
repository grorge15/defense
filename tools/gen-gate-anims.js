const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'assets/resources/Animation/characters');
const FOLDER = 'H-9011-SFK征兵模拟经营地（门序列帧 256X256）';
const SAMPLE = 10;
const FRAME_DT = 1 / SAMPLE;
const VISUAL_PATH = 'wj_wooddoor1';

function pad(n) {
    return String(n).padStart(3, '0');
}

function getSpriteFrameUuid(frameNum) {
    const metaPath = path.join(
        ROOT,
        'assets/resources/sprite/frames',
        FOLDER,
        `frame_${pad(frameNum)}.png.meta`,
    );
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const sf = meta.subMetas && meta.subMetas.f9941;
    if (sf) {
        return sf.uuid;
    }
    return `${meta.uuid}@f9941`;
}

function buildClip(clipName, frameNums, wrapMode) {
    const frameUuids = frameNums.map(getSpriteFrameUuid);
    const n = frameUuids.length;
    const duration = (n - 1) * FRAME_DT;
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
            _duration: duration,
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
        { __type__: 'cc.animation.HierarchyPath', path: VISUAL_PATH },
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

function writeClipMeta(fileName, uuid, displayName) {
    const meta = {
        ver: '2.0.4',
        importer: 'animation-clip',
        imported: true,
        uuid,
        files: ['.bin'],
        subMetas: {},
        userData: { name: displayName },
    };
    fs.writeFileSync(path.join(OUT_DIR, `${fileName}.meta`), JSON.stringify(meta, null, 2) + '\n');
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const clips = [
    {
        file: 'Gate_open',
        logical: 'open',
        frames: [0, 1, 2, 3],
        uuid: 'b7e21f4a-6c38-4d9e-9a12-8f3e5c7d1b90',
        wrapMode: 1,
    },
    {
        file: 'Gate_close',
        logical: 'close',
        frames: [3, 2, 1, 0],
        uuid: 'e2a94c6b-1f75-4a83-b8d0-3c5e9f2a7d14',
        wrapMode: 1,
    },
];

for (const c of clips) {
    const clip = buildClip(c.logical, c.frames, c.wrapMode);
    const filePath = path.join(OUT_DIR, `${c.file}.anim`);
    fs.writeFileSync(filePath, JSON.stringify(clip, null, 2) + '\n');
    writeClipMeta(c.file + '.anim', c.uuid, c.file);
    console.log(`Wrote ${c.file}.anim (${c.frames.length} frames)`);
}

console.log('Gate animation clips generated.');
