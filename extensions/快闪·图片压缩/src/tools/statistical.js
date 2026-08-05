const tools = require("./tools")

let isStatistical = false;
module.exports = {

	// 用户使用次数统计
	countStartupTimes(){
		if(!isStatistical && Editor.User && Editor.User.getData){
			Editor.User.getData().then((post_data)=>{
				if(!post_data) {
					return
				}
				post_data.version = Editor.App ? Editor.App.version : "?";
				tools.httpPost('120.77.174.207','/compressImageLogincount',8081,post_data);
			});
			isStatistical = true;
		}
	},

}
