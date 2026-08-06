/**
 * 统一 AnimationClip 播放名：脚本 anim.play('run'/'walk'/...) 必须与
 * .anim 内 _name 以及 .anim.meta userData.name 一致。
 * Cocos 导入时常以 meta/文件名作为 clip.name，导致 Player_run 无法被 play('run') 命中。
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'assets/resources/Animation/characters');
const EFFECTS = path.join(__dirname, '..', 'assets/resources/Animation/effects');

/** filename without .anim → desired clip._name for anim.play() */
const NAME_MAP = {
    // Player
    Player_idle: 'idle',
    Player_run: 'run',
    Player_meleeAttack: 'meleeAttack',
    Player_rangeAttack: 'rangeAttack',
    Player_dead: 'dead',
    Player_chop: 'chop',
    // Enemy
    Enemy_idle: 'idle',
    Enemy_walk: 'walk',
    Enemy_attack: 'attack',
    Enemy_dead: 'dead',
    // Helper
    Helper_idle: 'idle',
    Helper_walk: 'walk',
    // Lumberjack
    Lumberjack_idle: 'idle',
    Lumberjack_walk: 'walk',
    Lumberjack_chop: 'chop',
    // Heroes: Hero_Ice_idle → idle
};

function desiredName(fileBase) {
    if (NAME_MAP[fileBase]) {
        return NAME_MAP[fileBase];
    }
    // Customer_0_idle stays Customer_0_idle (script plays full name)
    if (fileBase.startsWith('Customer_')) {
        return fileBase;
    }
    // Hero_Fire_idle → idle
    const m = fileBase.match(/^Hero_\w+_(idle|attack|skill)$/);
    if (m) {
        return m[1];
    }
    return null;
}

function fixDir(dir) {
    if (!fs.existsSync(dir)) {
        return;
    }
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.anim'))) {
        const base = file.replace(/\.anim$/, '');
        const want = desiredName(base);
        if (!want) {
            continue;
        }
        const animPath = path.join(dir, file);
        const metaPath = animPath + '.meta';
        const clip = JSON.parse(fs.readFileSync(animPath, 'utf8'));
        const oldName = clip[0]._name;
        let changed = false;
        if (oldName !== want) {
            clip[0]._name = want;
            fs.writeFileSync(animPath, JSON.stringify(clip, null, 2));
            changed = true;
        }
        if (fs.existsSync(metaPath)) {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            meta.userData = meta.userData || {};
            if (meta.userData.name !== want) {
                meta.userData.name = want;
                fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
                changed = true;
            }
        }
        console.log(`${changed ? 'FIX' : 'ok '} ${file}: '${oldName}' -> '${want}'`);
    }
}

fixDir(DIR);
fixDir(EFFECTS);
console.log('Done. In Cocos: refresh assets / reimport Animation/characters, then reopen scene.');
