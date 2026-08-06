const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const ANIM_DIR = path.join(ROOT, 'assets/resources/Animation/effects');
const PREFAB_DIR = path.join(ROOT, 'assets/resources/prefabs');
const SAMPLE = 10;
const FRAME_DT = 1 / SAMPLE;

function uuid() {
    return crypto.randomUUID();
}

function writeMeta(filePath, clipName) {
    const metaPath = `${filePath}.meta`;
    if (fs.existsSync(metaPath)) {
        return JSON.parse(fs.readFileSync(metaPath, 'utf8')).uuid;
    }
    const id = uuid();
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

function writePrefabMeta(filePath, syncName) {
    const metaPath = `${filePath}.meta`;
    if (fs.existsSync(metaPath)) {
        return JSON.parse(fs.readFileSync(metaPath, 'utf8')).uuid;
    }
    const id = uuid();
    fs.writeFileSync(
        metaPath,
        JSON.stringify(
            {
                ver: '1.1.50',
                importer: 'prefab',
                imported: true,
                uuid: id,
                files: ['.json'],
                subMetas: {},
                userData: { syncNodeName: syncName },
            },
            null,
            2,
        ),
    );
    return id;
}

function pad(n) {
    return String(n).padStart(3, '0');
}

function frameMetaPath(folder, frameNum) {
    return path.join(ROOT, 'assets/resources/sprite/frames', folder, `frame_${pad(frameNum)}.png.meta`);
}

function getSpriteFrameUuid(folder, frameNum) {
    const meta = JSON.parse(fs.readFileSync(frameMetaPath(folder, frameNum), 'utf8'));
    const sf = meta.subMetas && meta.subMetas.f9941;
    return sf ? sf.uuid : `${meta.uuid}@f9941`;
}

function collectFrames(folder, start, end) {
    const frames = [];
    for (let i = start; i <= end; i++) {
        if (fs.existsSync(frameMetaPath(folder, i))) {
            frames.push(i);
        }
    }
    if (!frames.length) {
        throw new Error(`No frames in ${folder} [${start},${end}]`);
    }
    return frames;
}

function buildClip(clipName, frameUuids, visualPath, wrapMode = 1) {
    const n = frameUuids.length;
    const times = Array.from({ length: n }, (_, i) => i * FRAME_DT);
    const values = frameUuids.map((u) => ({ __uuid__: u, __expectedType__: 'cc.SpriteFrame' }));
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
            _binding: { __type__: 'cc.animation.TrackBinding', path: { __id__: 2 }, proxy: null },
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
        { __type__: 'cc.AnimationClipAdditiveSettings', enabled: false, refClip: null },
    ];
}

function clipRef(id) {
    return { __uuid__: id, __expectedType__: 'cc.AnimationClip' };
}

function buildProjectilePrefab(name, clipUuid, firstFrameUuid, spriteW, spriteH) {
    return [
        {
            __type__: 'cc.Prefab',
            _name: name,
            _objFlags: 0,
            __editorExtras__: {},
            _native: '',
            data: { __id__: 1 },
            optimizationPolicy: 0,
            persistent: false,
        },
        {
            __type__: 'cc.Node',
            _name: name,
            _objFlags: 0,
            __editorExtras__: {},
            _parent: null,
            _children: [{ __id__: 2 }],
            _active: true,
            _components: [{ __id__: 8 }],
            _prefab: { __id__: 10 },
            _lpos: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 },
            _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 },
            _lscale: { __type__: 'cc.Vec3', x: 1, y: 1, z: 1 },
            _mobility: 0,
            _layer: 1073741824,
            _euler: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 },
            _id: '',
        },
        {
            __type__: 'cc.Node',
            _name: 'visual',
            _objFlags: 0,
            __editorExtras__: {},
            _parent: { __id__: 1 },
            _children: [],
            _active: true,
            _components: [{ __id__: 3 }, { __id__: 5 }],
            _prefab: { __id__: 7 },
            _lpos: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 },
            _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 },
            _lscale: { __type__: 'cc.Vec3', x: 1, y: 1, z: 1 },
            _mobility: 0,
            _layer: 1073741824,
            _euler: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 },
            _id: '',
        },
        {
            __type__: 'cc.UITransform',
            _name: '',
            _objFlags: 0,
            node: { __id__: 2 },
            _enabled: true,
            __prefab: { __id__: 4 },
            _contentSize: { __type__: 'cc.Size', width: spriteW, height: spriteH },
            _anchorPoint: { __type__: 'cc.Vec2', x: 0.5, y: 0.5 },
            _id: '',
        },
        { __type__: 'cc.CompPrefabInfo', fileId: 'projUT01' },
        {
            __type__: 'cc.Sprite',
            _name: '',
            _objFlags: 0,
            node: { __id__: 2 },
            _enabled: true,
            __prefab: { __id__: 6 },
            _customMaterial: null,
            _srcBlendFactor: 2,
            _dstBlendFactor: 4,
            _color: { __type__: 'cc.Color', r: 255, g: 255, b: 255, a: 255 },
            _spriteFrame: { __uuid__: firstFrameUuid, __expectedType__: 'cc.SpriteFrame' },
            _type: 0,
            _fillType: 0,
            _sizeMode: 0,
            _fillCenter: { __type__: 'cc.Vec2', x: 0, y: 0 },
            _fillStart: 0,
            _fillRange: 0,
            _isTrimmedMode: true,
            _useGrayscale: false,
            _atlas: null,
            _id: '',
        },
        { __type__: 'cc.CompPrefabInfo', fileId: 'projSP01' },
        {
            __type__: 'cc.PrefabInfo',
            root: { __id__: 1 },
            asset: { __id__: 0 },
            fileId: 'projPI01',
            instance: null,
            targetOverrides: null,
            nestedPrefabInstanceRoots: null,
        },
        {
            __type__: 'cc.Animation',
            _name: '',
            _objFlags: 0,
            node: { __id__: 1 },
            _enabled: true,
            __prefab: { __id__: 9 },
            playOnLoad: false,
            _clips: [clipRef(clipUuid)],
            _defaultClip: clipRef(clipUuid),
            _id: '',
        },
        { __type__: 'cc.CompPrefabInfo', fileId: 'projAN01' },
        {
            __type__: 'cc.PrefabInfo',
            root: { __id__: 1 },
            asset: { __id__: 0 },
            fileId: 'projPI02',
            instance: null,
            targetOverrides: null,
        },
    ];
}

function buildSkillEffectPrefab(name, clipUuid, firstFrameUuid, spriteW, spriteH) {
    return [
        {
            __type__: 'cc.Prefab',
            _name: name,
            _objFlags: 0,
            __editorExtras__: {},
            _native: '',
            data: { __id__: 1 },
            optimizationPolicy: 0,
            persistent: false,
        },
        {
            __type__: 'cc.Node',
            _name: name,
            _objFlags: 0,
            __editorExtras__: {},
            _parent: null,
            _children: [{ __id__: 2 }],
            _active: true,
            _components: [{ __id__: 8 }],
            _prefab: { __id__: 10 },
            _lpos: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 },
            _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 },
            _lscale: { __type__: 'cc.Vec3', x: 1, y: 1, z: 1 },
            _mobility: 0,
            _layer: 1073741824,
            _euler: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 },
            _id: '',
        },
        {
            __type__: 'cc.Node',
            _name: 'frame_000',
            _objFlags: 0,
            __editorExtras__: {},
            _parent: { __id__: 1 },
            _children: [],
            _active: true,
            _components: [{ __id__: 3 }, { __id__: 5 }],
            _prefab: { __id__: 7 },
            _lpos: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 },
            _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 },
            _lscale: { __type__: 'cc.Vec3', x: 1, y: 1, z: 1 },
            _mobility: 0,
            _layer: 1073741824,
            _euler: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 },
            _id: '',
        },
        {
            __type__: 'cc.UITransform',
            _name: '',
            _objFlags: 0,
            node: { __id__: 2 },
            _enabled: true,
            __prefab: { __id__: 4 },
            _contentSize: { __type__: 'cc.Size', width: spriteW, height: spriteH },
            _anchorPoint: { __type__: 'cc.Vec2', x: 0.5, y: 0.5 },
            _id: '',
        },
        { __type__: 'cc.CompPrefabInfo', fileId: 'skUT01' },
        {
            __type__: 'cc.Sprite',
            _name: '',
            _objFlags: 0,
            node: { __id__: 2 },
            _enabled: true,
            __prefab: { __id__: 6 },
            _customMaterial: null,
            _srcBlendFactor: 2,
            _dstBlendFactor: 4,
            _color: { __type__: 'cc.Color', r: 255, g: 255, b: 255, a: 255 },
            _spriteFrame: { __uuid__: firstFrameUuid, __expectedType__: 'cc.SpriteFrame' },
            _type: 0,
            _fillType: 0,
            _sizeMode: 1,
            _fillCenter: { __type__: 'cc.Vec2', x: 0, y: 0 },
            _fillStart: 0,
            _fillRange: 0,
            _isTrimmedMode: true,
            _useGrayscale: false,
            _atlas: null,
            _id: '',
        },
        { __type__: 'cc.CompPrefabInfo', fileId: 'skSP01' },
        {
            __type__: 'cc.PrefabInfo',
            root: { __id__: 1 },
            asset: { __id__: 0 },
            fileId: 'skPI01',
            instance: null,
            targetOverrides: null,
            nestedPrefabInstanceRoots: null,
        },
        {
            __type__: 'cc.Animation',
            _name: '',
            _objFlags: 0,
            node: { __id__: 1 },
            _enabled: true,
            __prefab: { __id__: 9 },
            playOnLoad: false,
            _clips: [clipRef(clipUuid)],
            _defaultClip: clipRef(clipUuid),
            _id: '',
        },
        { __type__: 'cc.CompPrefabInfo', fileId: 'skAN01' },
        {
            __type__: 'cc.PrefabInfo',
            root: { __id__: 1 },
            asset: { __id__: 0 },
            fileId: 'skPI02',
            instance: null,
            targetOverrides: null,
        },
    ];
}

function readSpriteSize(folder, frameNum) {
    const meta = JSON.parse(fs.readFileSync(frameMetaPath(folder, frameNum), 'utf8'));
    const sf = meta.subMetas && meta.subMetas.f9941;
    if (sf && sf.userData) {
        return { w: sf.userData.width || 64, h: sf.userData.height || 64, uuid: sf.uuid };
    }
    return { w: 64, h: 64, uuid: `${meta.uuid}@f9941` };
}

function makeClipAndPrefab({ clipFile, clipName, visualPath, folder, start, end, prefabName, kind }) {
    const frames = collectFrames(folder, start, end);
    const uuids = frames.map((f) => getSpriteFrameUuid(folder, f));
    const size = readSpriteSize(folder, frames[0]);

    const animPath = path.join(ANIM_DIR, clipFile);
    fs.writeFileSync(animPath, JSON.stringify(buildClip(clipName, uuids, visualPath), null, 2));
    const clipUuid = writeMeta(animPath, clipName);

    const prefabPath = path.join(PREFAB_DIR, `${prefabName}.prefab`);
    const prefab =
        kind === 'skill'
            ? buildSkillEffectPrefab(prefabName, clipUuid, size.uuid, size.w, size.h)
            : buildProjectilePrefab(prefabName, clipUuid, size.uuid, size.w, size.h);
    fs.writeFileSync(prefabPath, JSON.stringify(prefab, null, 2));
    const prefabUuid = writePrefabMeta(prefabPath, prefabName);
    console.log(`Created ${prefabName} clip=${clipFile} uuid=${prefabUuid}`);
    return prefabUuid;
}

function patchHeroPrefab(prefabName, waveUuid, skillUuid) {
    const p = path.join(PREFAB_DIR, `${prefabName}.prefab`);
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const item of data) {
        if (item.__type__ === 'ef9c1v1x15GLqIgQmgs40zp') {
            if (waveUuid) {
                item.wavePrefab = { __uuid__: waveUuid, __expectedType__: 'cc.Prefab' };
            }
            if (skillUuid) {
                item.skillPrefab = { __uuid__: skillUuid, __expectedType__: 'cc.Prefab' };
            }
        }
    }
    fs.writeFileSync(p, JSON.stringify(data, null, 2));
    console.log(`Patched ${prefabName} wave=${waveUuid} skill=${skillUuid}`);
}

fs.mkdirSync(ANIM_DIR, { recursive: true });

const NORMAL = 'hero_normal_atk';
const ULT = 'hero_ult_frames';

const iceSkillUuid = makeClipAndPrefab({
    clipFile: 'SkillEffect_Ice.anim',
    clipName: 'SkillEffect_Ice',
    visualPath: 'frame_000',
    folder: ULT,
    start: 16,
    end: 23,
    prefabName: 'pref_SkillEffect_Ice',
    kind: 'skill',
});

const fireSkillUuid = makeClipAndPrefab({
    clipFile: 'SkillEffect_Fire.anim',
    clipName: 'SkillEffect_Fire',
    visualPath: 'frame_000',
    folder: ULT,
    start: 24,
    end: 31,
    prefabName: 'pref_SkillEffect_Fire',
    kind: 'skill',
});

makeClipAndPrefab({
    clipFile: 'ArrowFly.anim',
    clipName: 'ArrowFly',
    visualPath: 'visual',
    folder: NORMAL,
    start: 0,
    end: 7,
    prefabName: 'pref_Arrow',
    kind: 'projectile',
});

makeClipAndPrefab({
    clipFile: 'HeroProjectileFly.anim',
    clipName: 'HeroProjectileFly',
    visualPath: 'visual',
    folder: NORMAL,
    start: 0,
    end: 7,
    prefabName: 'pref_HeroProjectile',
    kind: 'projectile',
});

const lightningWaveUuid = JSON.parse(
    fs.readFileSync(path.join(PREFAB_DIR, 'lightningGnenAttack.prefab.meta'), 'utf8'),
).uuid;

patchHeroPrefab('pref_Hero_Ice', lightningWaveUuid, iceSkillUuid);
patchHeroPrefab('pref_Hero_Fire', lightningWaveUuid, fireSkillUuid);

console.log('Task 1.8 generation complete.');
