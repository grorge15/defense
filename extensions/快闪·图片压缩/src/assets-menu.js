let Path 	= require('path')
let Fs 		= require('fs');
let imageminApi = require('../lib/imageminApi')
let tinypngApi 	= require('../lib/tinypngApi')
let statistical = require('./tools/statistical') 
let packageCfg 	= require('../package.json');
const tools = require('./tools/tools');

let AssetsMenu = {

	onAssetMenu(assetInfo) {
		if(assetInfo.importer != 'image'){
			return [];
		}

		return [
			{
				label: 'i18n:quick-compress-image.compressPicture',
				enabled: true,
				click() {
					if(confirm('确定压缩图片?')){
						AssetsMenu.onStartCompressPicture(assetInfo)
					}
				},
			},
		];
	},

	onCreateMenu(assetInfo) {
		statistical.countStartupTimes();
		return [];
	},

	isImageFile(filePath){
		let extname = Path.extname(filePath).toLocaleLowerCase()
		if(extname == '.png' || extname == '.jpg' || extname == '.jpeg'){
			return true;
		}
		return false;
	},

	getFileSize(fsPath){
		try {
			return Fs.statSync(fsPath).size
		} catch (error) {
			return -1
		}
	},

	/**
	 * 返回选中的图片
	 * @param {*} assetInfo 
	 * @returns {Promise<Array<{file:string,uuid:string,size:number}>>}
	 */
	async getImageFileList(assetInfo){
		let fileUuidList = Editor.Selection.getSelected('asset');
		let imageFileList = [];

		if(fileUuidList.includes(assetInfo.uuid)){
			for (let i = 0; i < fileUuidList.length; i++) {
				const uuid = fileUuidList[i];
				const fsPath = await Editor.Message.request("asset-db",'query-path',uuid);

				if(fsPath && this.isImageFile(fsPath)){
					imageFileList.push({
						file: fsPath,
						uuid: uuid,
						size: this.getFileSize(fsPath)
					})
				}
			}

		}else{
			if(assetInfo.file && this.isImageFile(assetInfo.file)){
				imageFileList.push({
					file: assetInfo.file,
					uuid: assetInfo.uuid,
				})
			}
		}
		
		return imageFileList;
	},

	async getMode(){
		let mode = tools.isX64() ? await Editor.Profile.getConfig(packageCfg.name,'zipMode') || 0 : 1;
		return mode;
	},

	async onStartCompressPicture(assetInfo){
		let imageFileList = await this.getImageFileList(assetInfo);
		if(imageFileList.length == 0){
			return console.log("不支持该图片格式的压缩")
		}
		let arrList = [];
		for (let i = 0; i < imageFileList.length; i++) {
			const fileInfo = imageFileList[i];
			arrList.push(fileInfo.file);
		}

		let mode = await this.getMode();
		if(mode == 0){
			console.log("---------------------压缩模式:Imagemin---------------------------");
			imageminApi.compressPicture(arrList,imageFileList);
		}else{
			console.log("---------------------压缩模式:TinyPng---------------------------");
			tinypngApi.compressPicture(arrList,imageFileList);
		}
	},
}

module.exports = AssetsMenu;

