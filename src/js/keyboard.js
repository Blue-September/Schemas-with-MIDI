import { playNote, stopNote } from "./piano.js";

const keyboardMap = {
  a: 60,
  w: 61,
  s: 62,
  e: 63,
  d: 64,
  f: 65,
  t: 66,
  g: 67,
  y: 68,
  h: 69,
  u: 70,
  j: 71,
  k: 72,
};

const pressed = new Set();

export function initKeyboard() {
  window.addEventListener("keydown", (e) => {
    if (pressed.has(e.key)) return;

    const note = keyboardMap[e.key];

    if (note !== undefined) {
      pressed.add(e.key);
      playNote(note);
    }
  });

  window.addEventListener("keyup", (e) => {
    const note = keyboardMap[e.key];

    if (note !== undefined) {
      pressed.delete(e.key);
      stopNote(note);
    }
  });
}
