let Path 	= require('path')
let Fs 		= require('fs');
let imageminApi = require('../lib/imagemin.min')
let packageCfg 	= require('../package.json')

module.exports =  {

	async getZipRate(){
		let rate = parseInt(await Editor.Profile.getConfig(packageCfg.name,'zipRate')) || 30;
		if(rate<0){
			rate = 1;
		}else if(rate>100){
			rate = 100
		}

		return rate;
	},

	/**
	 * 调用压缩工具api
	 * @param {Array<{file:string,uuid:string}>} fileInfo 
	 */
	 async compressPicture(arrList,imageFileList){
		let rate = await this.getZipRate();
		let pngRate = rate*0.01;
		
		console.log("压缩值:",rate+"%");

        imageminApi.imagemin(arrList, {
            plugins: [
                imageminApi.imageminMozjpeg({ quality: rate  }), //压缩质量（0,1）
                imageminApi.imageminPngquant({
                    quality: [pngRate, Math.min(pngRate+0.25,1)]  //压缩质量（0,1）
                })
            ]
			
        }).then((arrRes) => {
            console.log("压缩成功,详情:\n")
			for (let i = 0; i < arrRes.length; i++) {
				const res = arrRes[i];
				this.onCompressedSucceed(imageFileList,res)
			}

        }).catch(err => {
            console.log("压缩失败:",err)
        });
	},
	
	/**
	 * 压缩成功
	 * @param {Array<{file:string,uuid:string,size:number}>} imageFileList 
	 * @param {Object<{data:Buffer,sourcePath:string}>} res 
	 */
	onCompressedSucceed(imageFileList,res){
		let desc = ""
		for (let i = 0; i < imageFileList.length; i++) {
			const fileInfo = imageFileList[i];
			if(fileInfo.file.replace(/\\/g,'/') == res.sourcePath){
				const fileName = Path.basename(fileInfo.file);
				const newSize = res.data.byteLength;
				const rate = (fileInfo.size-newSize)/fileInfo.size;
				const oldMb = (fileInfo.size / 1024).toFixed(1) + " KB";
				const newMb = (newSize / 1024).toFixed(1) + " KB";
				if(newSize < fileInfo.size){
					Fs.writeFileSync(res.sourcePath, res.data)
					desc += `${fileName}、压缩率:${parseInt(rate*100)}%、压缩前后大小:${newMb} / ${oldMb}`
				}else{
					desc += `${fileName}、无法继续压缩`
				}
				break;
			}
		}
		console.log(desc);
	},
}


