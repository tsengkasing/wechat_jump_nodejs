const { execSync } = require('child_process');
const cv = require('opencv');
const Jimp = require('jimp');
const sleep = require('thread-sleep');
const SCREENSHOT_NAME = '_screenshot.png';
const OUTPUT_IMAGE_PATH = './output.png';

const CYAN = [255, 255, 0];
const BLACK = [0, 0, 0];
var BLUE = [255, 0, 0]; // B, G, R
var GREEN = [0, 255, 0]; // B, G, R
var WHITE = [255, 255, 255]; // B, G, R
var RED   = [0, 0, 255]; // B, G, R

var minArea = 8000;
var maxArea = 80000;

(async function main() {
	let n = 1;
	// try {
		while(n--) {
			getScreenShot(SCREENSHOT_NAME);
	
			const rgbBuffer = await rgba2rgb(SCREENSHOT_NAME);
			const {location, image} = await getSourceLocation(rgbBuffer);
			const [srcCol, srcRow] = location;

			// const buffer = await preProcessImage(SCREENSHOT_NAME);
			const [desCol, desRow] = await getDestinationPoint(image);

			console.log(`[起始点] x: ${srcCol} y: ${srcRow}`);
			console.log(`[目标点] x: ${desCol} y: ${desRow}`);
			let distance = Math.sqrt((srcCol - desCol) ** 2 + (srcRow - desRow) ** 2);
			// let distance = await calcDistance(buffer, sourceLocation);
			let time = parseInt(distance * 1.8 + 80, 10);
			if (isNaN(time)) throw new Error('失败啦'); //time = 1000;
			console.log(`[按压时间] ${time}`);
			
			jump(time);
			sleep(time + 1000);
		}
	// } catch (e) {
		// console.error(e);
	// }

})();

/**
 * 
 * @param {string} fileName
 */
function getScreenShot(fileName) {
	execSync(`adb shell screencap -p /sdcard/${fileName}`);
	execSync(`adb pull /sdcard/${fileName} .`);
}

/**
 * 
 * @param {number} time
 */
function jump(time = 1000) {
	execSync(`adb shell input swipe 360 970 360 980 ${time}`);
}

function rgba2rgb(file) {
	return new Promise((resolve, reject) => {
		Jimp.read(file).then(image => {
			image
				.rgba(false)
				// .write('./end-.png')
				.getBuffer(Jimp.MIME_PNG, (err, buffer) => {
					resolve(buffer);
				});
		});
	})
}

/**
 * deprecated
 * @param {*} file 
 */
function preProcessImage(file) {
	return new Promise((resolve, reject) => {
		Jimp.read(file).then(image => {
			const { width, height } = image.bitmap;
			const cropSize = Math.round(height / 3.0);
			image
				// .contrast(-0.1)
				// .posterize(22)
				// .color([
				// 	{ apply: 'darken', params: [ 40 ] }
				// ])
				// .crop(0, cropSize, width, cropSize)
				.rgba(false)
				.write('./output.png')
				.getBuffer(Jimp.MIME_PNG, (err, buffer) => {
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

			// const [matched] = im.matchTemplate('./end.png', 5, true);
			// const {minVal, maxVal, minLoc, maxLoc} = matched.minMaxLoc();
			// console.dir({minVal, maxVal, minLoc, maxLoc});
			// if (maxLoc.y > 1000) throw new Error('失败啦');

			const [width, height] = [im.width(), im.height()];
			
			/* 获取小人坐标 */
			let sourceRow = 0, sourceColumn = 0;
			let columns = [];
			for(let row = 0; row < height; ++row) {
				for (let col = 0; col < width; ++col) {
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
			const halfBodyWidth = 26;
			const bodyColumns = new Array(halfBodyWidth * 2).fill(0).map(
				(item, index) => sourceColumn - halfBodyWidth + index
			);
			const [head, bottom] = [sourceRow - 140, sourceRow + 10];
			for (let ptrRow = head; ptrRow < bottom; ++ptrRow) {
				let backgroundColor = im.pixelRow(sourceRow).slice(0, 3);
				bodyColumns.forEach(ptrColumn => im.pixel(
					ptrRow, ptrColumn, backgroundColor)
				);
			}
			// im.save('./remove.png');

			resolve({location: [sourceColumn, sourceRow], image: im});
		});
	});
}

/**
 * deprecated
 * @param {*} file 
 * @param {*} sourceLocation 
 */
function calcDistance(file, sourceLocation) {
	return new Promise((resolve ,reject) => {
		cv.readImage(file, function(err, im) {
			if (err) throw err;
			let to = [];

			let width = im.width();
			let height = im.height();

			console.log(width, height);
			

			let mat = new cv.Matrix(height, width);
			let all = new cv.Matrix(height, width);


			im.gaussianBlur([3, 3]);
			im.convertGrayscale();
			// im.save('./grey1.png');
			im.equalizeHist();
			// im.save('./grey2.png');

			im.houghLinesP();
			var im_canny = im.copy();
	
			let threshold_min = 20;
			let threshold_max = threshold_min * 3;
			im_canny.canny(threshold_min, threshold_max);
			im_canny.dilate(3);
			// im_canny.save('./canny.png');
	
			let contours = im_canny.findContours();
	
			const lineType = 8;
			const maxLevel = 0;
			const thickness = 2;
	



			/* 目标坐标 */
			for(i = 0; i < contours.size(); i++) {
				let area = contours.area(i);
				if(area > minArea && area < maxArea) {
					var moments = contours.moments(i);
					var cgx = Math.round(moments.m10 / moments.m00);
					var cgy = Math.round(moments.m01 / moments.m00);
					if (cgy < 100 || cgy > 900) continue;
					mat.drawContour(contours, i, GREEN, thickness, lineType, maxLevel, [0, 0]);
					
					// if (cgy < 640 && cgy > 400) {
						to.push({x: cgx, y: cgy});
						mat.line([cgx - 5, cgy], [cgx + 5, cgy], WHITE);
						mat.line([cgx, cgy - 5], [cgx, cgy + 5], WHITE);
					// }
				}
			}

			all.drawAllContours(contours, WHITE);
			all.save('./all.png');

			if (to.length < 1) {
				mat.save('./edge.png', () => {
					reject(`can not find points\n to=${to.length}`)
				});
			} else {
				const src = sourceLocation;
				mat.ellipse(src.x, src.y, 4, 4, 0, 2);
				// mat.line([src.x - 5, src.y], [src.x + 5, src.y], CYAN);
				// mat.line([src.x, src.y - 5], [src.x, src.y + 5], CYAN);
				
				to.sort((a, b) => a.y -b.y);
				let des = to[0];
				mat.line([des.x - 5, des.y], [des.x + 5, des.y], RED);
				mat.line([des.x, des.y - 5], [des.x, des.y + 5], RED);
	
				mat.save('./edge.png',() => {
					let distance = Math.sqrt((src.x - des.x) ** 2 + (src.y - des.y) ** 2);
		
					resolve(distance);
				});
			}
		});
	});
}

/**
 * 获取目标点
 * @param {Matrix} im
 */
function getDestinationPoint(im) {
	return new Promise((resolve ,reject) => {
		// cv.readImage(file, (err, im) => {
			// if (err) throw err;

			im.gaussianBlur([3, 3]);
			// to gray
			// im.convertGrayscale();
			// im.save('./gray.png');

			let threshold_min = 20;
			let threshold_max = threshold_min * 3;
			im.canny(threshold_min, threshold_max);
			im.dilate(1);
			// im.save('./canny.png');

			let [width, height] = [im.width(), im.height()];
			const oneOfThrid = Math.round(height / 3.0);
			im = im.crop(0, oneOfThrid, width, oneOfThrid);
			[width, height] = [im.width(), im.height()];

			const backgroundColor = im.pixel(0, 0);
			let topRow, topCol, shape;

			for (let row = 0; row < height; ++row) {
				let colList = [];
				for (let col = 0; col < width; ++col) {
					if (!isBackgroundPoint(im, col, row)) {
						colList.push(col);
					}
				}
				if (colList.length > 0) {
					topRow = row;
					topCol = parseInt(colList.reduce((sum, item) => sum + item, 0) / colList.length, 10);
					shape = colList.length > 5 ? 'circle' : 'square';
					console.log(`[colList.length] ${colList.length}`)
					break;
				}
			}
			console.log(`[目标块顶点坐标] ${topRow} ${topCol}`);
			im.ellipse({
				center: {
					y: topRow,
					x: topCol
				},
				axes: {
					width: 10,
					height: 10
				},
				thickness: 3,
				color: RED
			});

			let canFindRightPoint = true;
			let sampleList = [];
			switch(shape) {
				case 'circle':
					sampleList.push([189, 508], [254, 542]);
					break;
				case 'square':
					sampleList.push([525, 479], [676, 566]);
					break;
				default: console.error('不存在的');
			}
			console.log(`[目标块形状] ${shape}`);
			const step = (sampleList[1][0] - sampleList[0][0]) / (sampleList[1][1] - sampleList[0][1]);
			// console.log(`[Step] ${step}`);
			let [x, y] = [topCol, topRow];
			while (true) {
				++y;
				x = parseInt(x + step, 10);
				console.dir(im.pixel(y, x));
				if (
					im.pixel(y, x + 1) === 0 &&
					im.pixel(y + 1, x) === 0 &&
					im.pixel(y + 1, x + 1) === 0
				) { break; }
				// if (Math.abs(backgroundColor - im.pixel(y, x)) < 5) break;

				if (x >= width) {
					canFindRightPoint = false;
					break;
				}
			}
			let [rightCol, rightRow] = [x, y];
			console.log(`[目标块右点坐标] ${rightRow} ${rightCol}`);

			im.ellipse({
				center: {
					y: rightRow,
					x: rightCol
				},
				axes: {
					width: 10,
					height: 10
				},
				thickness: 2,
				color: RED
			});

			im.save('./des.png');
			if (!canFindRightPoint) {
				rightRow = oneOfThrid + topRow + 50
			} else {
				rightRow = oneOfThrid + rightRow;
			}
			resolve([topCol, rightRow]);
		// });
	});
}

/**
 * 
 * @param {Matrix} image
 * @param {number} x 列
 * @param {number} y 行
 */
function isBackgroundPoint(image, x, y) {
	const [width, height] = [image.width(), image.height()];
	return image.pixel(y, x) === 0;
	if (
		x > 0 && x < width -1 &&
		y > 0 && y < height - 1
	) {
		const [c1, c2] = [image.pixel(y - 1, x), image.pixel(y, x)];
		const diff = c1 - c2;
		return diff >= 0 && diff < 3;
	} else return true;
}
