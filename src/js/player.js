import { playNote, stopNote, setIndicator, clearIndicator, clearAllIndicators } from "./piano.js";
import { click, CH } from "./synth.js";

const STRING_CH = { R: CH.VIOLIN, L: CH.VIOLA };
const ALL_CH = Object.values(CH); // [0, 1, 2]

const VEL_NORMAL = 96; // 沒勾選時所有音符
const VEL_LOUD = 100; // 勾選後：有數字（MIDI velocity 上限 127）
const VEL_SOFT = 40; // 勾選後：沒數字

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

		// 按鈕
		this.playBtn = document.getElementById("playBtn");
		this.playBtn.addEventListener(
			"click",
			() => {
				this.startPlayback();
			},
			opt,
		);

		this.stopBtn = document.getElementById("stopBtn");
		this.stopBtn.addEventListener(
			"click",
			() => {
				this.stopPlayback();
				this.showStepHint();
			},
			opt,
		);

		this.nextBtn = document.getElementById("nextBtn");
		this.nextBtn.addEventListener(
			"click",
			() => {
				this.cursorNext();
			},
			opt,
		);

		this.stepIndex = 0; // 下一個要播的 step
		this.stepHeld = []; // 目前按住中的音符
		this.stepBtn = document.getElementById("stepBtn");
		this.stepBtn.addEventListener("click", () => this.stepPlay(), opt);

		// BPM 滑條
		this.bpmValue = document.getElementById("bpmValue");
		this.bpmSlider = document.getElementById("bpmSlider");
		this.bpmSlider.addEventListener(
			"input",
			(e) => {
				this.setSpeed(Number(e.target.value));
			},
			opt,
		);

		// check blcok
		this.emphasisCb = document.getElementById("emphasisCb");
		this.metroCb = document.getElementById("metroCb");
		this.totalBeats = 0;
		this.pickupBeats = 0; // 弱起長度（單位：四分音符拍）
	}

	getOSMDInfo() {
		this.cursors = this.osmd.cursors;
		this.baseBpm = this.osmd.Sheet.SourceMeasures[0].tempoInBPM;
		this.setSpeed(1);
		this.bpmSlider.value = 1;
		this.timeSignature = this.osmd.sheet.sourceMeasures[0].activeTimeSignature.realValue;
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
		let tieNote = [];
		let step = 0;

		let measureStart = 0; // 目前小節的起點（全音符單位，跟 time 同單位）
		let measureEnd = 0; // 目前小節內看到的最大結尾（相對小節起點）
		let curMeasure = null;
		let firstMeasureLen = null;

		this.playbackData = [];

		while (!cursor.iterator.EndReached) {
			// 換小節：起點 += 上一小節的實際長度
			const m = cursor.iterator.currentMeasure;
			if (m !== curMeasure) {
				if (curMeasure !== null) {
					if (firstMeasureLen === null) firstMeasureLen = measureEnd;
					measureStart += measureEnd;
				}
				curMeasure = m;
				measureEnd = 0;
			}

			for (const VoiceEntries of cursor.iterator.currentVoiceEntries) {
				const hand = VoiceEntries.ParentSourceStaffEntry.ParentStaff.Id === 1 ? "R" : "L";

				for (const note of VoiceEntries.notes) {
					let pitch = 0;
					if (!note.isRestFlag) pitch = note.halfTone + 12;

					const rel = VoiceEntries.timestamp.realValue; // 相對小節起點
					let time = measureStart + rel;
					let dur = note.length.realValue;

					measureEnd = Math.max(measureEnd, rel + dur);

					let lyrics = VoiceEntries.lyricsEntries;
					if (lyrics.nElements > 0) lyrics = lyrics.table.$$s1.value.text;
					else lyrics = false;

					if (note.tie) {
						if (tieNote.length == 0) tieNote.push([pitch, time, dur, lyrics, hand]);
						else if (pitch != tieNote[0][0]) tieNote.push([pitch, time, dur, lyrics, hand]);
						else {
							this.pushPlayBackData(0, time, dur, lyrics, hand, step);
							time = tieNote[0][1];
							dur += tieNote[0][2];
							tieNote.shift();
							this.pushPlayBackData(pitch, time, dur, lyrics, hand, step);
						}
					} else {
						this.pushPlayBackData(pitch, time, dur, lyrics, hand, step);
					}
				}
			}
			cursor.next();
			step++;
		}
		cursor.reset();

		// 弱起長度：第一小節比拍號短，就是弱起（單位：四分音符拍）
		if (firstMeasureLen === null) firstMeasureLen = measureEnd;
		this.pickupBeats = firstMeasureLen < bartime - 1e-6 ? firstMeasureLen * 4 : 0;

		this.playbackData.sort((a, b) => a.time - b.time);
		this.totalBeats = Math.max(0, ...this.playbackData.map((n) => n.time + n.dur));

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

	// BPM
	get bpm() {
		return this.baseBpm * this.speed;
	}

	updateBpmLabel() {
		this.bpmValue.textContent = `${this.speed.toFixed(2)}x (${Math.round(this.bpm)} BPM)`;
	}

	setSpeed(newSpeed) {
		// 必須在套用新倍率之前，用舊倍率算出目前播放進度
		const currentTime = this.isPlaying ? this.getCurrentSongTime() : null;

		this.speed = newSpeed;
		this.updateBpmLabel();

		// 播放中就從目前進度用新速度重新排程
		if (currentTime !== null) this.startPlayback(currentTime);
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
		const numTimes = { R: [], L: [] };
		for (const n of this.playbackData) {
			if (n.pitch != 0 && n.lyrics) numTimes[n.hand]?.push(n.time);
		}
		for (const h of ["R", "L"]) {
			numTimes[h] = [...new Set(numTimes[h])].sort((a, b) => a - b);
		}
		const nextNumTime = (hand, t) => numTimes[hand]?.find((x) => x > t + 1e-6);

		// 只排程「時間點 >= fromTime」的音符
		const remainingNotes = this.playbackData.filter((note) => note.time >= fromTime);

		remainingNotes.forEach((note) => {
			const delta = (note.time - fromTime) * 1000 * bps;

			const isNum = note.pitch != 0 && !!note.lyrics;
			const stringCh = STRING_CH[note.hand] ?? STRING_CH.R;
			const holdTo = isNum ? (nextNumTime(note.hand, note.time) ?? note.time + note.dur * 2) : 0;
			let usedString = false;

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
				if (note.pitch != 0) {
					usedString = isNum && this.emphasisCb.checked;
					playNote(note.pitch, this.noteVelocity(note), note.hand, usedString ? stringCh : CH.PIANO);
				}

				// 時間點改變才前進一格（同時間的和弦、雙手只動一次，休止也算）
				if (note.time != this.curCursorTime) {
					this.curCursorTime = note.time;
					this.cursors[0].next();
				}
			}, delta);

			// note off
			const offTimer = setTimeout(
				() => {
					if (note.pitch == 0 || usedString) return;
					stopNote(note.pitch, CH.PIANO);
				},
				delta + note.dur * 1000 * bps,
			);

			this.timers.push(onTimer, offTimer);

			if (isNum) {
				// 小提琴音延續到下一個數字音符才放開
				const holdTimer = setTimeout(
					() => {
						if (usedString) stopNote(note.pitch, stringCh);
					},
					(holdTo - fromTime) * 1000 * bps,
				);
				this.timers.push(holdTimer);
			}
		});

		// 節拍器：第 j 拍位於 p + j，j % bpb == 0 是下拍（重音）
		const bpb = Math.max(1, Math.round(this.timeSignature * 4)); // 每小節幾拍
		const p = this.pickupBeats;
		for (let j = Math.ceil(fromTime - p - 1e-6); p + j <= this.totalBeats; j++) {
			const at = p + j;
			const isDownbeat = ((j % bpb) + bpb) % bpb === 0; // j 為負時也要取正餘數
			const t = setTimeout(
				() => {
					if (this.metroCb.checked) click(isDownbeat);
				},
				(at - fromTime) * 1000 * bps,
			);
			this.timers.push(t);
		}

		const endTimer = setTimeout(
			() => {
				this.isPlaying = false;
			},
			(this.totalBeats - fromTime) * 1000 * bps,
		);
		this.timers.push(endTimer);
	}

	releaseStepNotes() {
		for (const n of this.stepHeld) {
			if (n.pitch == 0) continue;
			for (const ch of ALL_CH) stopNote(n.pitch, ch);
			clearIndicator(n.pitch);
		}
		this.stepHeld = [];
	}

	// 在指定 step 的琴鍵上亮提示（預設是「下一個要按的 step」）
	showStepHint(index = this.stepIndex) {
		for (const n of this.stepNotes?.[index] ?? []) {
			if (n.pitch == 0) continue;
			setIndicator(n.pitch, n.lyrics ? solidToHollow(n.lyrics) : "", n.hand);
		}
	}

	stepPlay() {
		if (!this.stepNotes) return;
		if (this.stepIndex >= this.stepNotes.length) return; // 已到結尾

		this.releaseStepNotes();
		clearAllIndicators(); // 清掉剛才那個「下一鍵」提示

		// 游標移到目前這一步（第一次按時游標在開頭，不用動）
		if (this.stepIndex > 0) this.cursors[0].next();
		this.cursors[0].show();

		const notes = this.stepNotes[this.stepIndex] ?? [];
		for (const n of notes) {
			if (n.pitch == 0) continue;
			const ch = this.emphasisCb.checked && n.lyrics ? (STRING_CH[n.hand] ?? STRING_CH.R) : 0;
			playNote(n.pitch, this.noteVelocity(n), n.hand, ch);
		}
		this.stepHeld = notes;
		this.stepIndex++;

		this.showStepHint(); // 此時 stepIndex 已指向下一步
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
			for (const ch of ALL_CH) stopNote(i, ch);
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
