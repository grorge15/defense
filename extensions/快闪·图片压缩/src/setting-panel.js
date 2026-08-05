let fs = require('fs')
let path = require('path')
let packageCfg = require('../package.json')
const tools = require('./tools/tools')
Editor.Panel.define = Editor.Panel.define || ((args)=>{return args})


function saveConfig(doms){
    Editor.Profile.setConfig(packageCfg.name,'zipRate',doms.zipRateSlider.value);
    Editor.Profile.setConfig(packageCfg.name,'zipMode',doms.zipModeTab.value);
}

async function getMode(){
    let mode = tools.isX64() ? await Editor.Profile.getConfig(packageCfg.name,'zipMode') || 0 : 1;
    return mode;
}

module.exports = Editor.Panel.define({
    template: fs.readFileSync(path.join(__dirname, '../template/setting.html'), 'utf-8'),
    style: fs.readFileSync(path.join(__dirname, '../template/setting.css'), 'utf-8'),

    $: {
        zipRateSlider: '#zipRateSlider',
        saveBtn: '#saveBtn',
        zipModeTab: '#zipModeTab',
    },

    async ready() {
        this.$.zipRateSlider.value = parseInt(await Editor.Profile.getConfig(packageCfg.name,'zipRate')) || 30;
        this.$.zipModeTab.value = await getMode();
        this.$.zipModeTab.value == 1 ? this.$.zipRateSlider.disabled = true : this.$.zipRateSlider.removeAttribute('disabled');
        this.$.zipModeTab.addEventListener('click',()=>{
            let mode = this.$.zipModeTab.value;
            if(!tools.isX64() && mode == 0){
                this.$.zipModeTab.value = 1;
                this.$.zipRateSlider.disabled = true 
                alert('CPU不支持该模式');
            }else{
                this.$.zipModeTab.value == 1 ? this.$.zipRateSlider.disabled = true : this.$.zipRateSlider.removeAttribute('disabled');
                saveConfig(this.$);
            }
        },0)

        this.$.saveBtn.addEventListener('click',()=>{
            saveConfig(this.$);
        },0)
    },


    listeners: {
    },
    methods: {
    },
    beforeClose() { },
    close() { 
        saveConfig(this.$);
    },
});
