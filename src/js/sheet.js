import "opensheetmusicdisplay";
import { playNote, stopNote } from "./piano.js";
import { Player } from "./player.js";

let player;
let osmd;

export function handleFileSelect(evt) {
	var file = evt.target.files[0]; // FileList object
	var reader = new FileReader();

	reader.onload = function (e) {
		osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(
			"osmdContainer",
			{
				// set options here
				autoResize: true,
				backend: "svg",
				drawCredits: false,
				drawComposer: false,
				drawLyricist: false,
				drawTitle: true,
				drawFromMeasureNumber: 1,
				drawUpToMeasureNumber: Number.MAX_SAFE_INTEGER, // draw all measures, up to the end of the sample
				followCursor: true,
			},
		);
		osmd.load(e.target.result).then(function () {
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
	};

	if (file.name.match(".*\.mxl")) {
		// have to read as binary, otherwise JSZip will throw ("corrupted zip: missing 37 bytes" or similar)
		reader.readAsBinaryString(file);
	} else {
		reader.readAsText(file);
	}
}
