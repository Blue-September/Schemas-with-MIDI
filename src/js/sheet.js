import "opensheetmusicdisplay";
import { playNote, stopNote } from "./piano.js";
import { Player } from "./player.js";

let player;
let osmd;

function loadScore(data) {
	// 清掉舊的 player 和舊的譜面
	if (player) player.dispose();
	document.getElementById("osmdContainer").innerHTML = "";

	osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay("osmdContainer", {
		// set options here
		autoResize: true,
		align: "Center",
		backend: "svg",
		drawCredits: false,
		drawComposer: false,
		drawLyricist: false,
		drawTitle: true,
		drawFromMeasureNumber: 1,
		drawUpToMeasureNumber: Number.MAX_SAFE_INTEGER, // draw all measures, up to the end of the sample
		followCursor: true,
	});
	osmd.load(data).then(function () {
		window.osmd = osmd; // give access to osmd object in Browser console, e.g. for osmd.setOptions()
		//console.log("e.target.result: " + e.target.result);
		osmd.render();
		let cursorsOptions = [
			{ type: 0, color: "#33e02f", alpha: 0.5, follow: true },
			{ type: 3, color: "#ff5454", alpha: 0.1, follow: false },
		];
		osmd.setOptions({ cursorsOptions: cursorsOptions });
		osmd.enableOrDisableCursors(true);
		player = new Player(osmd);
		player.getOSMDInfo();
		player.parserOSMDcursor();
		osmd.render();
	});
}

export function handleFileSelect(evt) {
	var file = evt.target.files[0];
	var reader = new FileReader();
	reader.onload = (e) => loadScore(e.target.result);

	if (file.name.match(/\.mxl$/i)) reader.readAsBinaryString(file);
	else reader.readAsText(file);
}

export async function loadScoreFromUrl(url) {
	const res = await fetch(url);
	if (/\.mxl$/i.test(url)) {
		// mxl 是 zip，要轉成 binary string 給 OSMD
		const bytes = new Uint8Array(await res.arrayBuffer());
		let bin = "";
		for (let i = 0; i < bytes.length; i++)
			bin += String.fromCharCode(bytes[i]);
		loadScore(bin);
	} else {
		loadScore(await res.text());
	}
}
