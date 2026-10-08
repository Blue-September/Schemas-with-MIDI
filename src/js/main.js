import { initSynth } from "./synth.js";
import { createPiano } from "./piano.js";
import { initMIDI } from "./midi.js";
import { initKeyboard } from "./keyboard.js";
import { handleFileSelect, loadScoreFromUrl } from "./sheet.js";

let started = false;

// buttom
document.getElementById("midiBtn").addEventListener("click", async () => {
	await initMIDI();
});

document
	.getElementById("File")
	.addEventListener("change", handleFileSelect, false);

document.getElementById("openPianoBtn").addEventListener("click", async () => {
	// open piano
	started = true;
	await initSynth();
	createPiano();
	initKeyboard();
	console.log("Piano Started");
});

// scores
const SCORE_BASE = import.meta.env.BASE_URL + "score/";

fetch(SCORE_BASE + "index.json")
	.then((r) => r.json())
	.then((files) => {
		for (const f of files) {
			const opt = document.createElement("option");
			opt.value = f;
			opt.textContent = f.replace(/\.(xml|musicxml|mxl)$/i, "");
			scoreSelect.appendChild(opt);
		}
	});

scoreSelect.addEventListener("change", () => {
	if (scoreSelect.value)
		loadScoreFromUrl(SCORE_BASE + encodeURIComponent(scoreSelect.value));
});
