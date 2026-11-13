import { WorkletSynthesizer } from "spessasynth_lib";
// load "spessasynth_processor.min.js"
// load "soundfonts/GeneralUserGS.sf3"

let audioContext;
let synth;

// key = 音色名稱，value = GM program（0 起算）；key 的順序就是 channel 編號
export const prog = { PIANO: 6, VIOLIN: 40, VIOLA: 41 };
// 名稱 → channel： CH.PIANO = 0, CH.VIOLIN = 1, CH.VIOLA = 2
export const CH = Object.fromEntries(Object.keys(prog).map((k, i) => [k, i]));

export function setProgram(channel, program) {
	synth?.programChange(channel, program);
}

export async function initSynth() {
	audioContext = new AudioContext({
		sampleRate: 44100,
	});
	setupAutoUnlock();

	// 載入 worklet
	await audioContext.audioWorklet.addModule("spessasynth_processor.min.js");

	// 建立 synth
	synth = new WorkletSynthesizer(audioContext, {
		enableEventSystem: true,
		initializeReverbProcessor: true,
		initializeChorusProcessor: true,
	});

	// 接到輸出
	synth.connect(audioContext.destination);

	// 載入 soundfont
	const response = await fetch("soundfonts/GeneralUserGS.sf3");
	const sfBuffer = await response.arrayBuffer();

	// 加入 soundfont
	await synth.soundBankManager.addSoundBank(sfBuffer, "main");

	// 等待初始化
	await synth.isReady;

	// 設定鋼琴音色
	Object.values(prog).forEach((p, ch) => setProgram(ch, p));
	console.log("Synth Ready");
}

function setupAutoUnlock() {
	const events = ["pointerdown", "keydown", "touchend"];
	const unlock = () => audioContext.resume();

	audioContext.addEventListener("statechange", () => {
		if (audioContext.state === "running") {
			events.forEach((e) => window.removeEventListener(e, unlock, true));
		}
	});
	// capture 階段，確保在琴鍵自己的 mousedown / keydown 處理之前先解鎖
	events.forEach((e) => window.addEventListener(e, unlock, true));
}

// 節拍器 click：channel 9 是 GM 打擊樂，76 高木魚（重音）、77 低木魚
export function click(accent = false) {
	if (!synth) return;
	synth.noteOn(9, accent ? 76 : 77, accent ? 127 : 90);
}

export function noteOn(note, velocity = 100, channel = CH.PIANO) {
	if (!synth) return;
	synth.noteOn(channel, note, velocity);
}

export function noteOff(note, channel = CH.PIANO) {
	if (!synth) return;
	synth.noteOff(channel, note);
}
