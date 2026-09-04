import "opensheetmusicdisplay";
import { playNote, stopNote } from "./piano.js";

let osmd;
let cursors = [];
let cursorFlag = 0;

let bpm = 60;
let timeSignature = 4;
let playbackData = [];
let timers = [];

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
			cursors = osmd.cursors;
			console.log(osmd);
			//console.log(cursors[0]);
			// build playbackdata
			playbackData = parserOSMDcursor(cursors);
			bpm = osmd.Sheet.SourceMeasures[0].tempoInBPM;
			timeSignature =
				osmd.sheet.sourceMeasures[0].activeTimeSignature.numerator;
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

function parserOSMDcursor(cursors) {
	const cursor = cursors[0];
	let playbackData = [];

	let tieNote = [];
	while (!cursor.iterator.EndReached) {
		// voice part
		for (const VoiceEntries of cursor.iterator.currentVoiceEntries) {
			console.log(VoiceEntries);
			let time = VoiceEntries.timestamp.realValue;
			let bar = cursor.iterator.currentMeasure.MeasureNumberXML - 1; // from bar 1
			// note part
			for (const note of VoiceEntries.notes) {
				//console.log(note);
				// rest flag
				if (!note.isRestFlag) {
					let pitch = note.halfTone + 12;
					let dur = note.length.realValue;

					// check tie
					if (note.tie) {
						// start of tie
						if (tieNote.length == 0)
							// first tie
							tieNote.push([pitch, bar + time, dur]);
						else if (pitch != tieNote[0][0])
							// not stored in tie list
							tieNote.push([pitch, bar + time, dur]);
						// end of tie
						else {
							time = tieNote[0][1];
							dur += tieNote[0][2];
							tieNote.shift();
							playbackData.push({
								pitch: pitch,
								time: time * 4,
								dur: dur * 4,
							});
						}
					} else {
						// no tie
						playbackData.push({
							pitch: pitch,
							time: (bar + time) * 4,
							dur: dur * 4,
						});
					}
				}
			}
		}
		cursor.next();
	}
	cursor.reset();
	playbackData.sort((a, b) => {
		a.time - b.time;
	});
	//console.log(playbackData);
	return playbackData;
}

// buttom

export function startPlayback() {
	stopPlayback();
	cursors[0].reset();
	cursors[0].show();
	let CurCursorTime = 0;
	const bps = 60 / bpm;

	playbackData.forEach((note, index) => {
		// note on
		if (note.pitch != 0) {
			const onTimer = setTimeout(
				() => {
					playNote(note.pitch);
					if (note.time != CurCursorTime) {
						CurCursorTime = note.time;
						cursors[0].next();
					}
				},
				note.time * 1000 * bps,
			);

			// note off
			const offTimer = setTimeout(
				() => {
					stopNote(note.pitch);
				},
				(note.time + note.dur) * 1000 * bps,
			);

			timers.push(onTimer);
			timers.push(offTimer);
		}
	});
}

export function stopPlayback() {
	timers.forEach((timer) => {
		clearTimeout(timer);
	});
	timers = [];
	// 保險：全部 note off
	for (let i = 0; i < 128; i++) {
		stopNote(i);
	}
}

export function cursorNext() {
	cursors[0].next();
	console.log(cursors[0]);
}
