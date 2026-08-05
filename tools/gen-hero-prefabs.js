const fs = require('fs');
const path = require('path');
const dir = path.join('C:/Users/Admin/Defense2/assets/resources/prefabs');
const spriteUuid = 'c92be3f4-c048-4b39-9dc2-782e38ce420c@f9941';

function makePrefab(name) {
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
            _components: [{ __id__: 7 }],
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
            __type__: 'cc.Node',
            _name: 'Visual',
            _objFlags: 0,
            __editorExtras__: {},
            _parent: { __id__: 1 },
            _children: [],
            _active: true,
            _components: [{ __id__: 3 }, { __id__: 5 }],
            _prefab: { __id__: 6 },
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
            _contentSize: { __type__: 'cc.Size', width: 48, height: 48 },
            _anchorPoint: { __type__: 'cc.Vec2', x: 0.5, y: 0.5 },
            _id: '',
        },
        { __type__: 'cc.CompPrefabInfo', fileId: `${name}_vui` },
        {
            __type__: 'cc.Sprite',
            _name: '',
            _objFlags: 0,
            __editorExtras__: {},
            node: { __id__: 2 },
            _enabled: true,
            __prefab: { __id__: 51 },
            _customMaterial: null,
            _srcBlendFactor: 2,
            _dstBlendFactor: 4,
            _color: { __type__: 'cc.Color', r: 255, g: 255, b: 255, a: 255 },
            _spriteFrame: { __uuid__: spriteUuid, __expectedType__: 'cc.SpriteFrame' },
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
        { __type__: 'cc.CompPrefabInfo', fileId: `${name}_vsp` },
        {
            __type__: 'cc.PrefabInfo',
            root: { __id__: 1 },
            asset: { __id__: 0 },
            fileId: `${name}_vis`,
            instance: null,
            targetOverrides: null,
            nestedPrefabInstanceRoots: null,
        },
        {
            __type__: 'cc.UITransform',
            _name: '',
            _objFlags: 0,
            __editorExtras__: {},
            node: { __id__: 1 },
            _enabled: true,
            __prefab: { __id__: 8 },
            _contentSize: { __type__: 'cc.Size', width: 48, height: 48 },
            _anchorPoint: { __type__: 'cc.Vec2', x: 0.5, y: 0.5 },
            _id: '',
        },
        { __type__: 'cc.CompPrefabInfo', fileId: `${name}_rui` },
        {
            __type__: 'cc.PrefabInfo',
            root: { __id__: 1 },
            asset: { __id__: 0 },
            fileId: `${name}_root`,
            instance: null,
            targetOverrides: null,
        },
        { __type__: 'cc.CompPrefabInfo', fileId: `${name}_vsp2` },
    ];
}

const list = [
    ['pref_hero_ice', 'a1111111-0001-4000-8000-000000000001'],
    ['pref_hero_storm', 'a1111111-0001-4000-8000-000000000002'],
    ['pref_hero_lightning', 'a1111111-0001-4000-8000-000000000003'],
    ['pref_hero_rocket', 'a1111111-0001-4000-8000-000000000004'],
    ['pref_hero_wave', 'a1111111-0001-4000-8000-000000000011'],
    ['pref_hero_skill', 'a1111111-0001-4000-8000-000000000012'],
];

for (const [name, uuid] of list) {
    const arr = makePrefab(name);
    // fix sprite __prefab id to 51 entry - use index 11
    arr[5].__prefab = { __id__: 11 };
    fs.writeFileSync(path.join(dir, `${name}.prefab`), JSON.stringify(arr, null, 2));
    fs.writeFileSync(
        path.join(dir, `${name}.prefab.meta`),
        JSON.stringify(
            {
                ver: '1.1.50',
                importer: 'prefab',
                imported: true,
                uuid,
                files: ['.json'],
                subMetas: {},
                userData: { syncNodeName: name },
            },
            null,
            2,
        ),
    );
    console.log('ok', name);
}
