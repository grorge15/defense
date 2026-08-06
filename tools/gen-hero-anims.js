const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'assets/resources/Animation/characters');
const SAMPLE = 10;
const FRAME_DT = 1 / SAMPLE;
const VISUAL_PATH = 'visual';

function pad(n) {
    return String(n).padStart(3, '0');
}

function frameMetaPath(folder, frameNum) {
    return path.join(
        ROOT,
        'assets/resources/sprite/frames',
        folder,
        `frame_${pad(frameNum)}.png.meta`,
    );
}

function getSpriteFrameUuid(folder, frameNum) {
    const metaPath = frameMetaPath(folder, frameNum);
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const sf = meta.subMetas && meta.subMetas.f9941;
    if (sf) {
        return sf.uuid;
    }
    return `${meta.uuid}@f9941`;
}

function collectExistingFrames(folder, start, end) {
    const frames = [];
    for (let i = start; i <= end; i++) {
        if (fs.existsSync(frameMetaPath(folder, i))) {
            frames.push(i);
        }
    }
    if (frames.length === 0) {
        throw new Error(`No frames found in ${folder} [${start}, ${end}]`);
    }
    return frames;
}

function buildClip(clipName, frameUuids, wrapMode) {
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

const heroes = [
    {
        name: 'Hero_Fire',
        folder: 'yingxiongdazhao2_frames',
        clips: { idle: [0, 7], attack: [8, 24], skill: [25, 39] },
    },
    {
        name: 'Hero_Ice',
        folder: 'yingxiongdazhao1_frames',
        clips: { idle: [0, 7], attack: [8, 16], skill: [17, 32] },
    },
    {
        name: 'Hero_Thunder',
        folder: 'yingxiongdazhao1_frames',
        clips: { idle: [33, 39], attack: [40, 48], skill: [49, 63] },
    },
    {
        name: 'Hero_Wind',
        folder: 'yingxiongdazhao3_frames',
        clips: { idle: [0, 7], attack: [8, 16], skill: [17, 33] },
    },
];

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const hero of heroes) {
    for (const [clipName, [start, end]] of Object.entries(hero.clips)) {
        const frames = collectExistingFrames(hero.folder, start, end);
        const uuids = frames.map((f) => getSpriteFrameUuid(hero.folder, f));
        const wrapMode = clipName === 'idle' ? 2 : 1;
        const fileName = `${hero.name}_${clipName}.anim`;
        const filePath = path.join(OUT_DIR, fileName);
        const clip = buildClip(clipName, uuids, wrapMode);
        fs.writeFileSync(filePath, JSON.stringify(clip, null, 2));
        console.log(`Wrote ${fileName} (${frames.length} frames)`);
    }
}

console.log('All hero animation clips generated.');
