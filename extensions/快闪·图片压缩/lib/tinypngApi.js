const fs = require("fs");
const path = require("path");
const https = require("https");
const URL = require("url").URL;
const EventEmitter = require("events");
const err = (msg) => new EventEmitter().emit("error", msg);

/**
 * TinyPng 远程压缩 HTTPS 请求的配置生成方法
 */

function getAjaxOptions() {
	return {
		method: "POST",
		hostname: "tinypng.com",
		path: "/web/shrink",
		headers: {
			rejectUnauthorized: false,
			"X-Forwarded-For": Array(4)
				.fill(1)
				.map(() => parseInt(Math.random() * 254 + 1))
				.join("."),
			"Postman-Token": Date.now(),
			"Cache-Control": "no-cache",
			"Content-Type": "application/x-www-form-urlencoded",
			"User-Agent":
				"Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.87 Safari/537.36"
		}
	};
}

/**
 * TinyPng 远程压缩 HTTPS 请求
 * @param {string} img 待处理的文件
 * @success {
 *              "input": { "size": 887, "type": "image/png" },
 *              "output": { "size": 785, "type": "image/png", "width": 81, "height": 81, "ratio": 0.885, "url": "https://tinypng.com/web/output/7aztz90nq5p9545zch8gjzqg5ubdatd6" }
 *           }
 * @error  {"error": "Bad request", "message" : "Request is invalid"}
 */
function fileUpload(imgPath) {
	let req = https.request(getAjaxOptions(), (res) => {
		res.on("data", (buf) => {
			let obj = JSON.parse(buf.toString());
			if (obj.error)
				console.log(`压缩失败！\n 当前文件：${imgPath} \n ${obj.message}`);
			else fileUpdate(imgPath, obj);
		});
	});

	req.write(fs.readFileSync(imgPath), "binary");
	req.on("error", (e) =>
		console.log(`请求错误! 当前文件：${path.basename(imgPath)} \n`, e)
	);
	req.end();
}

// 该方法被循环调用,请求图片数据
function fileUpdate(entryImgPath, obj) {
	let options = new URL(obj.output.url);
	let req = https.request(options, (res) => {
		let body = "";
		res.setEncoding("binary");
		res.on("data", (data) => (body += data));
		res.on("end", () => {
			fs.writeFile(entryImgPath, body, "binary", (err) => {
				if (err) return console.error(err);
				let log = `压缩成功:`;
				log += `${path.basename(entryImgPath)}、压缩率:${ ((1 - obj.output.ratio) * 100).toFixed(2) }%、压缩前后大小:${(obj.output.size / 1024).toFixed(2)} / ${(obj.input.size / 1024).toFixed(2)}`
				console.log(log);
			});
		});
	});
	req.on("error", (e) => console.warn('压缩失败:',path.basename(entryImgPath) ,e));
	req.end();
}

module.exports = {
	/**
	 * 调用压缩工具api
	 * @param {Array<{file:string,uuid:string}>} fileInfo 
	 */
	 async compressPicture(arrList,imageFileList){
		for (let i = 0; i < arrList.length; i++) {
			const imgPath = arrList[i];
			fileUpload(imgPath);
		}
	}
}