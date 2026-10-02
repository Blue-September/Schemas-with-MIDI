import { initSynth } from "./synth.js";
import { createPiano } from "./piano.js";
import { initMIDI } from "./midi.js";
import { initKeyboard } from "./keyboard.js";
import { handleFileSelect } from "./sheet.js";
import { Player } from "./player.js";

let started = false;

// buttom
document.getElementById("midiBtn").addEventListener("click", async () => {
	await initMIDI();
});

document.getElementById("File")
	.addEventListener("change", handleFileSelect, false);

document.getElementById("openPianoBtn").addEventListener("click", async () => {
	// open piano
	started = true;
	await initSynth();
	createPiano();
	initKeyboard();
	console.log("Piano Started");
});
