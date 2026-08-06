const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PREFAB_DIR = path.join(ROOT, 'assets/resources/prefabs');
const ANIM_DIR = path.join(ROOT, 'assets/resources/Animation/characters');

function readClipUuid(heroName, clipName) {
    const metaPath = path.join(ANIM_DIR, `${heroName}_${clipName}.anim.meta`);
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    return meta.uuid;
}

function clipRef(uuid) {
    return { __uuid__: uuid, __expectedType__: 'cc.AnimationClip' };
}

function prefabRef(uuid) {
    return { __uuid__: uuid, __expectedType__: 'cc.Prefab' };
}

function buildHeroPrefab(cfg) {
    const clips = {
        idle: readClipUuid(cfg.heroAssetName, 'idle'),
        attack: readClipUuid(cfg.heroAssetName, 'attack'),
        skill: readClipUuid(cfg.heroAssetName, 'skill'),
    };

    const wavePrefab = cfg.wavePrefabUuid ? prefabRef(cfg.wavePrefabUuid) : null;
    const skillPrefab = cfg.skillPrefabUuid ? prefabRef(cfg.skillPrefabUuid) : null;

    return [
        {
            __type__: 'cc.Prefab',
            _name: cfg.prefabName,
            _objFlags: 0,
            __editorExtras__: {},
            _native: '',
            data: { __id__: 1 },
            optimizationPolicy: 0,
            persistent: false,
        },
        {
            __type__: 'cc.Node',
            _name: cfg.prefabName,
            _objFlags: 0,
            __editorExtras__: {},
            _parent: null,
            _children: [{ __id__: 2 }],
            _active: true,
            _components: [{ __id__: 10 }],
            _prefab: { __id__: 12 },
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
            _components: [{ __id__: 3 }, { __id__: 5 }, { __id__: 7 }],
            _prefab: { __id__: 9 },
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
            __editorExtras__: {},
            node: { __id__: 2 },
            _enabled: true,
            __prefab: { __id__: 4 },
            _contentSize: {
                __type__: 'cc.Size',
                width: cfg.spriteWidth,
                height: cfg.spriteHeight,
            },
            _anchorPoint: { __type__: 'cc.Vec2', x: 0.5, y: 0.5 },
            _id: '',
        },
        { __type__: 'cc.CompPrefabInfo', fileId: 'c4sx+r559LTZJZAuSfhzhJ' },
        {
            __type__: 'cc.Sprite',
            _name: '',
            _objFlags: 0,
            __editorExtras__: {},
            node: { __id__: 2 },
            _enabled: true,
            __prefab: { __id__: 6 },
            _customMaterial: null,
            _srcBlendFactor: 2,
            _dstBlendFactor: 4,
            _color: { __type__: 'cc.Color', r: 255, g: 255, b: 255, a: 255 },
            _spriteFrame: {
                __uuid__: cfg.idleSpriteUuid,
                __expectedType__: 'cc.SpriteFrame',
            },
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
        { __type__: 'cc.CompPrefabInfo', fileId: '56PSw8izdMs45SDiWOhuSk' },
        {
            __type__: 'cc.Animation',
            _name: '',
            _objFlags: 0,
            __editorExtras__: {},
            node: { __id__: 2 },
            _enabled: true,
            __prefab: { __id__: 8 },
            playOnLoad: true,
            _clips: [
                clipRef(clips.idle),
                clipRef(clips.attack),
                clipRef(clips.skill),
            ],
            _defaultClip: clipRef(clips.idle),
            _id: '',
        },
        { __type__: 'cc.CompPrefabInfo', fileId: 'd4sfpDLCdKS4zzzOZqSqPr' },
        {
            __type__: 'cc.PrefabInfo',
            root: { __id__: 1 },
            asset: { __id__: 0 },
            fileId: 'dcDAk2DHhP+pw/U+mK0eRv',
            instance: null,
            targetOverrides: null,
            nestedPrefabInstanceRoots: null,
        },
        {
            __type__: 'ef9c1v1x15GLqIgQmgs40zp',
            _name: '',
            _objFlags: 0,
            __editorExtras__: {},
            node: { __id__: 1 },
            _enabled: true,
            __prefab: { __id__: 11 },
            heroType: cfg.heroType,
            depositId: '',
            wavePrefab,
            skillPrefab,
            normalInterval: 1,
            skillCd: 8,
            skillRows: 3,
            skillCols: 4,
            skillSpacing: 60,
            skillStartDelay: 0.15,
            skySpawnOffsetY: 200,
            skillHitRadius: 40,
            anim: { __id__: 7 },
            spawner: null,
            _id: '',
        },
        { __type__: 'cc.CompPrefabInfo', fileId: '6chPxbBqhGw45PXjhEuxdJ' },
        {
            __type__: 'cc.PrefabInfo',
            root: { __id__: 1 },
            asset: { __id__: 0 },
            fileId: 'c46/YsCPVOJYA4mWEpNYRx',
            instance: null,
            targetOverrides: null,
        },
    ];
}

const heroes = [
    {
        prefabName: 'pref_Hero_Ice',
        heroAssetName: 'Hero_Ice',
        heroType: 0,
        idleSpriteUuid: '5d781da0-0952-4bc4-be7d-91faed07c510@f9941',
        spriteWidth: 71,
        spriteHeight: 76,
        wavePrefabUuid: null,
        skillPrefabUuid: null,
    },
    {
        prefabName: 'pref_Hero_Wind',
        heroAssetName: 'Hero_Wind',
        heroType: 1,
        idleSpriteUuid: 'fc6228c2-589d-44b3-a9f0-fd3360a69a10@f9941',
        spriteWidth: 82,
        spriteHeight: 75,
        wavePrefabUuid: '1e71f594-9817-42e7-b376-56dd43989496',
        skillPrefabUuid: 'f03ad2f8-8af3-4ab1-8058-5d6821969c08',
    },
    {
        prefabName: 'pref_Hero_Thunder',
        heroAssetName: 'Hero_Thunder',
        heroType: 2,
        idleSpriteUuid: '00f66223-06ad-47a2-a3dd-fe9f926f4168@f9941',
        spriteWidth: 63,
        spriteHeight: 78,
        wavePrefabUuid: '11dd2ec2-b3d0-4bb6-92e0-db96ba9d1156',
        skillPrefabUuid: '28a71fec-4a8a-4a19-92ae-0d8fc1857044',
    },
    {
        prefabName: 'pref_Hero_Fire',
        heroAssetName: 'Hero_Fire',
        heroType: 3,
        idleSpriteUuid: 'eec77021-d48b-4fe2-8235-abcd5abefa9d@f9941',
        spriteWidth: 60,
        spriteHeight: 81,
        wavePrefabUuid: null,
        skillPrefabUuid: null,
    },
];

for (const cfg of heroes) {
    const outPath = path.join(PREFAB_DIR, `${cfg.prefabName}.prefab`);
    const prefab = buildHeroPrefab(cfg);
    fs.writeFileSync(outPath, JSON.stringify(prefab, null, 2));
    console.log(`Wrote ${cfg.prefabName}.prefab (heroType=${cfg.heroType})`);
}

console.log('All hero prefabs generated.');
