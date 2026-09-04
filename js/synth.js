import { WorkletSynthesizer } from "spessasynth_lib";

let audioContext;
let synth;

export async function initSynth() {
  audioContext = new AudioContext({
    sampleRate: 44100,
  });

  await audioContext.resume();
  // 載入 worklet
  await audioContext.audioWorklet.addModule("../spessasynth_processor.min.js");

  // 建立 synth
  synth = new WorkletSynthesizer(audioContext, {
    enableEventSystem: true,
    initializeReverbProcessor: true,
    initializeChorusProcessor: true,
  });

  // 接到輸出
  synth.connect(audioContext.destination);

  // 載入 soundfont
  const response = await fetch("../soundfonts/GeneralUserGS.sf3");
  const sfBuffer = await response.arrayBuffer();

  // 加入 soundfont
  await synth.soundBankManager.addSoundBank(sfBuffer, "main");

  // 等待初始化
  await synth.isReady;

  // 設定鋼琴音色
  synth.programChange(0, 6); // channel :0, program: harpsichord(6)
  console.log("Synth Ready");
}

export function noteOn(note, velocity = 100) {
  if (!synth) return;
  synth.noteOn(0, note, velocity);
}

export function noteOff(note) {
  if (!synth) return;
  synth.noteOff(0, note);
}
