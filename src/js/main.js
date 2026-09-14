import { initSynth } from "./synth.js";
import { createPiano } from "./piano.js";
import { initMIDI } from "./midi.js";
import { initKeyboard } from "./keyboard.js";
import {
	handleFileSelect,
	startPlayback,
	stopPlayback,
	cursorNext,
} from "./sheet.js";

let started = false;

// buttom
document.getElementById("midiBtn").addEventListener("click", async () => {
	await initMIDI();
});

document
	.getElementById("File")
	.addEventListener("change", handleFileSelect, false);

document.getElementById("playBtn").addEventListener("click", () => {
	startPlayback();
});

document.getElementById("stopBtn").addEventListener("click", () => {
	stopPlayback();
});

document.getElementById("nxtBtn").addEventListener("click", () => {
	cursorNext();
});

document.getElementById("openPianoBtn").addEventListener("click", async () => {
	// open piano
	started = true;
	await initSynth();
	createPiano();
	initKeyboard();
	console.log("Piano Started");
});
