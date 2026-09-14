import { playNote, stopNote } from "./piano.js";

let midiAccess;

export async function initMIDI() {
  if (!navigator.requestMIDIAccess) {
    alert("WebMIDI not supported");
    return;
  }

  midiAccess = await navigator.requestMIDIAccess();
  for (const input of midiAccess.inputs.values()) {
    input.onmidimessage = onMIDIMessage;
    console.log("Connected MIDI:", input.name);
  }
  document.getElementById("midiStatus").textContent = "MIDI Connected";
}

function onMIDIMessage(event) {
  const [status, note, velocity] = event.data;
  const command = status & 0xf0;

  if (command === 0x90 && velocity > 0) playNote(note, velocity);
  else if (command === 0x80 || (command === 0x90 && velocity === 0))
    stopNote(note);
}
