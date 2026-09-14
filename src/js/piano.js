import { noteOn, noteOff } from "./synth.js";

const piano = document.getElementById("piano");

const WHITE_NOTES = [0, 2, 4, 5, 7, 9, 11];

const BLACK_NOTES = [
  { pitch: 1, left: "11%" },
  { pitch: 3, left: "25%" },
  { pitch: 6, left: "54%" },
  { pitch: 8, left: "68%" },
  { pitch: 10, left: "82%" },
];

const keyMap = new Map();

export function createPiano() {
  piano.innerHTML = "";

  // A0 ~ C8
  for (let octave = 0; octave < 8; octave++) {
    createOctave(octave);
  }

  // 最後高音 C8
  createLastC();
}

function createOctave(octave) {
  const octaveDiv = document.createElement("div");
  octaveDiv.className = "octave";

  // 白鍵
  WHITE_NOTES.forEach((pitch) => {
    const note = octave * 12 + pitch + 12;
    const key = document.createElement("div");
    key.className = "white-key";
    bindKey(key, note);
    octaveDiv.appendChild(key);
    keyMap.set(note, key);
  });

  // 黑鍵
  BLACK_NOTES.forEach((item) => {
    const note = octave * 12 + item.pitch + 12;
    const key = document.createElement("div");
    key.className = "black-key";
    key.style.left = item.left;
    bindKey(key, note);
    octaveDiv.appendChild(key);
    keyMap.set(note, key);
  });

  piano.appendChild(octaveDiv);
}

function createLastC() {
  const key = document.createElement("div");
  key.className = "white-key";
  bindKey(key, 108);
  piano.appendChild(key);
  keyMap.set(108, key);
}

function bindKey(key, note) {
  key.addEventListener("mousedown", () => {
    playNote(note);
  });

  key.addEventListener("mouseup", () => {
    stopNote(note);
  });

  key.addEventListener("mouseleave", () => {
    stopNote(note);
  });
}

export function playNote(note, velocity = 100) {
  noteOn(note, velocity);
  const key = keyMap.get(note);
  if (key) key.classList.add("active");
}

export function stopNote(note) {
  noteOff(note);
  const key = keyMap.get(note);
  if (key) key.classList.remove("active");
}
