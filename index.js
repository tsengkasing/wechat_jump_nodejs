const { execSync } = require('child_process');
const cv = require('opencv');
const Jimp = require('jimp');
const sleep = require('thread-sleep');
const SCREENSHOT_NAME = '_screenshot.png';

const HALF_BODY_WIDTH = 26; // 小人宽度的一半
const RED = [0, 0, 255]; // B, G, R
const BLUE = [255, 0, 0]; // B, G, R
const GREEN = [0, 255, 0]; // B, G, R

(async function main() {
	let n = 1;
	while (n) {
		getScreenShot(SCREENSHOT_NAME, n++);

		const rgbBuffer = await rgba2rgb(SCREENSHOT_NAME);

		const {location, image} = await getSourceLocation(rgbBuffer);
		const [srcCol, srcRow] = location;

		const [desCol, desRow] = await getDestinationPoint(image);

		console.log(`[起始点] x: ${srcCol} y: ${srcRow}`);
		console.log(`[目标点] x: ${desCol} y: ${desRow}`);
		await visualize(rgbBuffer, [srcRow, srcCol], [desRow, desCol]);

		let distance = Math.sqrt((srcCol - desCol) ** 2 + (srcRow - desRow) ** 2);
		let time = parseInt(distance * 1.8 + 80, 10);
		if (time < 420) time -= 50;
		if (isNaN(time)) throw new Error('失败啦'); // time = 1000;
		console.log(`[按压时间] ${time}`);

		jump(time);
		sleep(time + 1000);
	}
})();

/**
 * 获取截图
 * @param {string} fileName 文件名
 * @param {number} n 次数
 */
function getScreenShot(fileName, n) {
	execSync(`adb shell screencap -p /sdcard/${fileName}`);
	execSync(`adb pull /sdcard/${fileName} .`);
	if (n) execSync(`cp ${fileName} ./path/${n}.png`);
}

/**
 * 模拟跳跃
 * @param {number} time
 */
function jump(time = 1000) {
	execSync(`adb shell input swipe 360 970 360 980 ${time}`);
}

/**
 * 转换图片格式 RGBA => RGB
 * @param {string} file
 */
function rgba2rgb(file) {
	return new Promise((resolve, reject) => {
		Jimp.read(file).then(image => {
			image
				.rgba(false)
				.getBuffer(Jimp.MIME_PNG, (err, buffer) => {
					if (err) throw err;
					resolve(buffer);
				});
		});
	})
}

/**
 * 获取起始点坐标
 * @param {buffer | string} file
 */
function getSourceLocation(file) {
	return new Promise((resolve, reject) => {
		cv.readImage(file, function(err, im) {
			if (err) throw err;

			const [width, height] = [im.width(), im.height()];

			/* 获取小人坐标 */
			let [sourceRow, sourceColumn] = [0, 0];
			let columns = [];
			for (let row = 0; row < height; ++row) {
				for (let col = 0; col < width; ++col) {
					/* eslint-disable no-unused-vars */
					const [b, g, r] = im.pixel(row, col);
					if (
						b > 98 && b < 103 &&
						r > 49 && r < 60
					) {
						if (row !== sourceRow) {
							sourceRow = row;
							columns = [];
						}
						columns.push(col);
					}
				}
			}
			sourceRow -= 6;
			sourceColumn = columns.reduce((sum, x) => sum + x, 0) / columns.length;

			// 抹掉小人
			const bodyColumns = new Array(HALF_BODY_WIDTH * 2).fill(0).map(
				(item, index) => sourceColumn - HALF_BODY_WIDTH + index
			);
			const [head, bottom] = [sourceRow - 140, sourceRow + 10];
			for (let ptrRow = head; ptrRow < bottom; ++ptrRow) {
				let backgroundColor = im.pixelRow(sourceRow).slice(0, 3);
				bodyColumns.forEach(ptrColumn => im.pixel(
					ptrRow, ptrColumn, backgroundColor)
				);
			}

			resolve({location: [sourceColumn, sourceRow], image: im});
		});
	});
}

/**
 * 获取目标点
 * @param {Matrix} im
 */
function getDestinationPoint(im) {
	return new Promise((resolve, reject) => {
		im.gaussianBlur([3, 3]);

		let thresholdMin = 20;
		let thresholdMax = thresholdMin * 3;
		im.canny(thresholdMin, thresholdMax);
		im.dilate(1);

		let [width, height] = [im.width(), im.height()];
		const oneOfThrid = Math.round(height / 3.0);
		im = im.crop(0, oneOfThrid, width, oneOfThrid);
		[width, height] = [im.width(), im.height()];

		let topRow, topCol;

		for (let row = 0; row < height; ++row) {
			let colList = [];
			for (let col = 0; col < width; ++col) {
				if (im.pixel(row, col) !== 0) {
					colList.push(col);
					break;
				}
			}
			if (colList.length > 0) {
				topRow = row;
				topCol = parseInt(colList.reduce((sum, item) => sum + item, 0) / colList.length, 10);
				break;
			}
		}
		console.log(`[目标块顶点坐标] ${topRow} ${topCol}`);

		let canFindRightPoint = true;
		let [x, y] = [topCol, topRow];
		while (true) {
			if (im.pixel(y, x + 1) === 255) {
				++x;
			} else if (im.pixel(y + 1, x + 1) === 255) {
				++y;
				++x;
			} else {
				break;
			}

			if (x >= width) {
				canFindRightPoint = false;
				break;
			}
		}
		let [rightCol, rightRow] = [x, y];
		console.log(`[目标块右点坐标] ${rightRow} ${rightCol}`);

		im.save('./des.png');
		if (!canFindRightPoint) {
			rightRow = oneOfThrid + topRow + 50
		} else {
			rightRow = oneOfThrid + rightRow;
		}
		resolve([topCol, rightRow]);
	});
}

/**
 * 纯粹的可视化
 * @param {buffer} buffer
 */
function visualize(buffer, [srcRow, srcCol], [desRow, desCol]) {
	return new Promise(resolve => {
		cv.readImage(buffer, (err, im) => {
			if (err) throw err;

			im.ellipse({
				center: {
					y: srcRow,
					x: srcCol
				},
				axes: {
					width: 10,
					height: 10
				},
				thickness: 2,
				color: RED
			});

			im.ellipse({
				center: {
					y: desRow,
					x: desCol
				},
				axes: {
					width: 10,
					height: 10
				},
				thickness: 2,
				color: BLUE
			});

			im.line([srcCol, srcRow], [desCol, desRow], GREEN);
			im.save('./visualize.png');
			resolve();
		});
	});
}
