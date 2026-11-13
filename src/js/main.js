import { initSynth } from "./synth.js";
import { createPiano } from "./piano.js";
import { initMIDI } from "./midi.js";
import { initKeyboard } from "./keyboard.js";
import { handleFileSelect, loadScoreFromUrl } from "./sheet.js";
import { loadDocFor, clearDoc, loadWelcome } from "./layout.js";

// piano
await initSynth();
createPiano();
initKeyboard();
console.log("Piano Started");

// load midi
document.getElementById("midiBtn").addEventListener("click", async () => {
	await initMIDI();
});

document.getElementById("File").addEventListener("change", (e) => {
	scoreList.querySelector(".active")?.classList.remove("active");
	clearDoc();
	handleFileSelect(e);
	e.target.value = "";
});

// colored hint
const hintCb = document.getElementById("hintColorCb");
const applyHintColor = () => document.body.classList.toggle("hint-color", hintCb.checked);

hintCb.addEventListener("change", applyHintColor);
applyHintColor(); // 重新整理時，瀏覽器可能會還原勾選狀態，這裡同步一次

// scores
const SCORE_BASE = import.meta.env.BASE_URL + "score/";
const scoreList = document.getElementById("scoreList");

function selectScore(file, btn) {
	scoreList.querySelector(".active")?.classList.remove("active");
	btn.classList.add("active");

	loadScoreFromUrl(SCORE_BASE + encodeURIComponent(file));
	loadDocFor(file);
	document.body.classList.add("nav-collapsed");
}

fetch(SCORE_BASE + "index.json")
	.then((r) => r.json())
	.then((files) => {
		for (const f of files) {
			const li = document.createElement("li");
			const btn = document.createElement("button");
			btn.type = "button";
			btn.textContent = f.replace(/\.(xml|musicxml|mxl)$/i, ""); // 用 textContent，檔名不會被當成 HTML
			btn.addEventListener("click", () => selectScore(f, btn));
			li.appendChild(btn);
			scoreList.appendChild(li);
		}
	});

loadWelcome();
