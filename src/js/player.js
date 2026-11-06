import { playNote, stopNote, setIndicator, clearIndicator, clearAllIndicators } from "./piano.js";

const VEL_NORMAL = 100; // 沒勾選時所有音符
const VEL_LOUD = 127; // 勾選後：有數字（MIDI velocity 上限 127）
const VEL_SOFT = 45; // 勾選後：沒數字

// 把各種 Unicode 數字轉成一般 0-9
const SOLID_TO_HOLLOW = {
	"❶": "①",
	"❷": "②",
	"❸": "③",
	"❹": "④",
	"❺": "⑤",
	"❻": "⑥",
	"❼": "⑦",
};

function solidToHollow(text) {
	return String(text).replace(/./gu, (c) => SOLID_TO_HOLLOW[c] ?? c);
}

const LEAD_MS = 2000; // 提前多少毫秒顯示指示器：1秒

export class Player {
	// _INIT_
	constructor(osmd) {
		this.ac = new AbortController();
		const opt = { signal: this.ac.signal };

		this.osmd = osmd;

		this.cursors;
		this.cursorFlag = 0;
		this.baseBpm = 60;
		this.speed = 1;
		this.timeSignature = 1;
		this.playbackData = [];
		this.timers = [];

		this.isPlaying = false;
		this.playStartTimestamp = 0; // performance.now() 記錄的實際開始時間
		this.playFromTime = 0; // 這次播放是從歌曲的第幾拍開始的
		this.curCursorTime = 0;

		this.stepIndex = 0; // 下一個要播的 step
		this.stepHeld = []; // 目前按住中的音符

		this.stepBtn = document.getElementById("stepBtn");
		this.stepBtn.addEventListener("click", () => this.stepPlay(), opt);

		// 按鈕
		this.playBtn = document.getElementById("playBtn").addEventListener(
			"click",
			() => {
				this.startPlayback();
			},
			opt,
		);

		this.stopBtn = document.getElementById("stopBtn").addEventListener(
			"click",
			() => {
				this.stopPlayback();
			},
			opt,
		);

		this.nextBtn = document.getElementById("nextBtn").addEventListener(
			"click",
			() => {
				this.cursorNext();
			},
			opt,
		);

		// BPM 滑條
		this.bpmValue = document.getElementById("bpmValue");
		this.bpmSlider = document.getElementById("bpmSlider").addEventListener(
			"input",
			(e) => {
				this.setSpeed(Number(e.target.value));
			},
			opt,
		);

		this.emphasisCb = document.getElementById("emphasisCb");
	}

	getOSMDInfo(osmd = this.osmd) {
		//console.log(this.osmd);
		this.cursors = osmd.cursors;
		this.bpm = osmd.Sheet.SourceMeasures[0].tempoInBPM;
		this.setBpm(this.bpm);
		this.timeSignature = osmd.sheet.sourceMeasures[0].activeTimeSignature.realValue;
	}

	//===============
	// Playback data
	//===============

	pushPlayBackData(pitch, time, dur, lyrics, hand, step) {
		this.playbackData.push({
			pitch: pitch,
			time: time * 4,
			dur: dur * 4,
			lyrics: lyrics,
			hand: hand, // "R" or "L"
			step: step,
		});
	}

	parserOSMDcursor() {
		const cursor = this.cursors[0];
		const bartime = this.timeSignature;
		let offset = 0;
		let tieNote = [];
		let step = 0;

		this.playbackData = [];

		while (!cursor.iterator.EndReached) {
			// voice part
			for (const VoiceEntries of cursor.iterator.currentVoiceEntries) {
				//console.dir(VoiceEntries);
				const hand = VoiceEntries.ParentSourceStaffEntry.ParentStaff.Id === 1 ? "R" : "L";

				// note part
				for (const note of VoiceEntries.notes) {
					//console.dir(note);

					// note: implicit
					let implicit = cursor.iterator.currentMeasure.ImplicitMeasureFromXml;

					// note: pitch
					let pitch = 0;
					if (!note.isRestFlag) pitch = note.halfTone + 12;

					// note: time
					let bar = cursor.iterator.currentMeasure.MeasureNumberXML - 1; // from bar 1
					if (bar < 0) bar = 0;
					let time = VoiceEntries.timestamp.realValue;
					time = bar * bartime + time + offset;

					// note: durng
					let dur = note.length.realValue;

					// note: lyrics
					let lyrics = VoiceEntries.lyricsEntries;
					if (lyrics.nElements > 0) lyrics = lyrics.table.$$s1.value.text;
					else lyrics = false;
					//console.dir(lyrics);

					// check tie
					if (note.tie) {
						// start of tie
						if (tieNote.length == 0)
							// first tie
							tieNote.push([pitch, time, dur, lyrics, hand]);
						else if (pitch != tieNote[0][0])
							// not stored in tie list
							tieNote.push([pitch, time, dur, lyrics, hand]);
						// end of tie
						else {
							this.pushPlayBackData(0, time, dur, lyrics, hand, step);
							//
							time = tieNote[0][1];
							dur += tieNote[0][2];
							tieNote.shift();
							this.pushPlayBackData(pitch, time, dur, lyrics, hand, step);
						}
					} else {
						// no tie
						this.pushPlayBackData(pitch, time, dur, lyrics, hand, step);
						if (implicit) {
							offset = dur;
							//console.log("implicit!, offset = ", offset);
						}
					}
				}
			}
			cursor.next();
			step++;
		}
		cursor.reset();
		this.playbackData.sort((a, b) => a.time - b.time);
		this.stepNotes = [];
		for (const n of this.playbackData) {
			(this.stepNotes[n.step] ??= []).push(n);
		}
		console.dir(this.playbackData);
	}

	//===================================
	// Playback & Cursors Control
	//===================================

	getCurrentSongTime() {
		if (!this.isPlaying) return this.curCursorTime;

		const elapsedRealSeconds = (performance.now() - this.playStartTimestamp) / 1000;
		const bps = 60 / this.bpm;
		const elapsedSongTime = elapsedRealSeconds / bps;

		return this.playFromTime + elapsedSongTime;
	}

	get bpm() {
		return this.baseBpm * this.speed;
	}

	setSpeed(newSpeed) {
		// 必須在套用新倍率之前，用舊倍率算出目前播放進度
		const currentTime = this.isPlaying ? this.getCurrentSongTime() : null;

		this.speed = newSpeed;
		this.bpmValue.textContent = newSpeed.toFixed(2) + "x";

		// 播放中就從目前進度用新速度重新排程
		if (currentTime !== null) this.startPlayback(currentTime);
	}

	getOSMDInfo() {
		this.cursors = this.osmd.cursors;
		this.baseBpm = this.osmd.Sheet.SourceMeasures[0].tempoInBPM;
		this.setSpeed(1);
		document.getElementById("bpmSlider").value = 1;
		this.timeSignature = this.osmd.sheet.sourceMeasures[0].activeTimeSignature.realValue;
	}

	// 將 cursor 快進到指定位置
	acclerCursor(toTime = 0) {
		for (const n of this.playbackData) {
			if (n.time > toTime) break;
			if (this.curCursorTime != n.time) {
				this.curCursorTime = n.time;
				this.cursors[0].next();
			}
		}
	}

	noteVelocity(note) {
		if (!this.emphasisCb.checked) return VEL_NORMAL;
		return note.lyrics ? VEL_LOUD : VEL_SOFT;
	}

	startPlayback(fromTime = 0) {
		this.stopPlayback();
		this.cursors[0].hide();
		this.cursors[0].reset();
		this.cursors[0].show();
		this.acclerCursor(fromTime);

		this.playFromTime = fromTime;
		this.playStartTimestamp = performance.now();
		this.isPlaying = true;

		// set beat per second
		const bps = 60 / this.bpm;

		// 只排程「時間點 >= fromTime」的音符
		const remainingNotes = this.playbackData.filter((note) => note.time >= fromTime);

		remainingNotes.forEach((note) => {
			const delta = (note.time - fromTime) * 1000 * bps;

			// 指示器：提前顯示，音符開始時清掉
			let text;
			if (note.pitch != 0) {
				if (note.lyrics) text = solidToHollow(note.lyrics);
				const showTimer = setTimeout(
					() => {
						setIndicator(note.pitch, text, note.hand);
					},
					Math.max(0, delta - LEAD_MS),
				);

				const hideTimer = setTimeout(() => {
					clearIndicator(note.pitch);
				}, delta);

				this.timers.push(showTimer, hideTimer);
			}

			// note on
			const onTimer = setTimeout(() => {
				const vel = this.noteVelocity(note);
				if (note.pitch == 0) {
					// rest
				} else if (!note.lyrics) {
					playNote(note.pitch, vel);
				} else {
					playNote(note.pitch, vel, true);
				}

				if (note.time != this.curCursorTime) {
					this.curCursorTime = note.time;
					this.cursors[0].next();
				}
			}, delta);

			// note off
			const offTimer = setTimeout(
				() => {
					if (note.pitch == 0) {
						// rest
					} else if (!note.lyrics) {
						stopNote(note.pitch);
					} else {
						stopNote(note.pitch);
					}
				},
				delta + note.dur * 1000 * bps,
			);

			this.timers.push(onTimer);
			this.timers.push(offTimer);
		});
	}

	releaseStepNotes() {
		for (const n of this.stepHeld) {
			if (n.pitch == 0) continue;
			if (!n.lyrics) {
				stopNote(n.pitch);
				clearIndicator(n.pitch);
			} else {
				stopNote(n.pitch);
				clearIndicator(n.pitch);
			}
		}
		this.stepHeld = [];
	}

	stepPlay() {
		if (!this.stepNotes) return;
		if (this.stepIndex >= this.stepNotes.length) return; // 已到結尾

		this.releaseStepNotes();

		// 游標移到目前這一步（第一次按時游標在開頭，不用動）
		if (this.stepIndex > 0) this.cursors[0].next();
		this.cursors[0].show();

		const notes = this.stepNotes[this.stepIndex] ?? [];
		for (const n of notes) {
			let text;
			if (n.lyrics) text = solidToHollow(n.lyrics);

			if (n.pitch == 0) continue;
			const vel = this.noteVelocity(n);
			if (!n.lyrics) playNote(n.pitch, vel);
			else playNote(n.pitch, vel, true);
		}
		this.stepHeld = notes;
		this.stepIndex++;
	}

	resetStep() {
		this.releaseStepNotes();
		this.stepIndex = 0;
		this.cursors[0].hide();
		this.cursors[0].reset();
		this.cursors[0].show();
	}

	stopPlayback() {
		this.isPlaying = false;
		this.timers.forEach((timer) => {
			clearTimeout(timer);
		});

		this.timers = [];
		this.curCursorTime = 0;

		clearAllIndicators();

		this.resetStep();

		// ALL note off
		for (let i = 0; i < 128; i++) {
			stopNote(i);
		}
	}

	cursorNext() {
		this.cursors[0].next();
	}

	dispose() {
		this.stopPlayback();
		this.ac.abort(); // 一次移除這個 Player 綁的所有監聽器
	}
}
