import { playNote, stopNote } from "./piano.js";

export class Player {
	// _INIT_
	constructor(osmd) {
		this.ac = new AbortController();
		const opt = { signal: this.ac.signal };

		this.osmd = osmd;

		this.cursors;
		this.cursorFlag = 0;
		this.bpm = 60;
		this.timeSignature = 1;
		this.playbackData = [];
		this.timers = [];

		this.isPlaying = false;
		this.playStartTimestamp = 0; // performance.now() 記錄的實際開始時間
		this.playFromTime = 0; // 這次播放是從歌曲的第幾拍開始的
		this.curCursorTime = 0;

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
				this.setBpm(Number(e.target.value));
			},
			opt,
		);
	}

	getOSMDInfo(osmd = this.osmd) {
		//console.log(this.osmd);
		this.cursors = osmd.cursors;
		this.bpm = osmd.Sheet.SourceMeasures[0].tempoInBPM;
		this.setBpm(this.bpm);
		this.timeSignature =
			osmd.sheet.sourceMeasures[0].activeTimeSignature.realValue;
	}

	//===============
	// Playback data
	//===============

	pushPlayBackData(pitch, time, dur, lyrics) {
		this.playbackData.push({
			pitch: pitch,
			time: time * 4,
			dur: dur * 4,
			lyrics: lyrics,
		});
	}

	parserOSMDcursor() {
		const cursor = this.cursors[0];
		const bartime = this.timeSignature;
		let offset = 0;
		let tieNote = [];

		this.playbackData = [];

		while (!cursor.iterator.EndReached) {
			// voice part
			for (const VoiceEntries of cursor.iterator.currentVoiceEntries) {
				//console.dir(VoiceEntries);

				// note part
				for (const note of VoiceEntries.notes) {
					//console.dir(note);

					// note: implicit
					let implicit =
						cursor.iterator.currentMeasure.ImplicitMeasureFromXml;

					// note: pitch
					let pitch = 0;
					if (!note.isRestFlag) pitch = note.halfTone + 12;

					// note: time
					let bar =
						cursor.iterator.currentMeasure.MeasureNumberXML - 1; // from bar 1
					if (bar < 0) bar = 0;
					let time = VoiceEntries.timestamp.realValue;
					time = bar * bartime + time + offset;

					// note: durng
					let dur = note.length.realValue;

					// note: lyrics
					let lyrics = VoiceEntries.lyricsEntries;
					if (lyrics.nElements > 0)
						lyrics = lyrics.table.$$s1.value.text;
					else lyrics = false;
					//console.dir(lyrics);

					// check tie
					if (note.tie) {
						// start of tie
						if (tieNote.length == 0)
							// first tie
							tieNote.push([pitch, time, dur, lyrics]);
						else if (pitch != tieNote[0][0])
							// not stored in tie list
							tieNote.push([pitch, time, dur, lyrics]);
						// end of tie
						else {
							this.pushPlayBackData(0, time, dur, lyrics);
							//
							time = tieNote[0][1];
							dur += tieNote[0][2];
							tieNote.shift();
							this.pushPlayBackData(pitch, time, dur, lyrics);
						}
					} else {
						// no tie
						this.pushPlayBackData(pitch, time, dur, lyrics);
						if (implicit) {
							offset = dur;
							console.log("implicit!, offset = ", offset);
						}
					}
				}
			}
			cursor.next();
		}
		cursor.reset();
		this.playbackData.sort((a, b) => {
			a.time - b.time;
		});
		//console.dir(this.playbackData);
	}

	//===================================
	// Playback & Cursors Control
	//===================================

	getCurrentSongTime() {
		if (!this.isPlaying) return this.curCursorTime;

		const elapsedRealSeconds =
			(performance.now() - this.playStartTimestamp) / 1000;
		const bps = 60 / this.bpm;
		const elapsedSongTime = elapsedRealSeconds / bps;

		return this.playFromTime + elapsedSongTime;
	}

	// BPM 改變時呼叫：從目前播放進度用新 BPM 重新排程
	restartFromCurrentTime() {
		const currentTime = this.getCurrentSongTime();
		this.startPlayback(currentTime);
	}

	setBpm(newBpm) {
		this.bpm = newBpm;
		this.bpmValue.textContent = newBpm;

		// 如果正在播放中，重新排程剩餘音符（見下方說明）
		if (this.timers.length > 0) {
			this.restartFromCurrentTime();
		}
	}

	// 將 cursor 快進到指定位置
	acclerCursor(toTime = 0) {
		let i = 0;
		while (true) {
			let time = this.playbackData[i].time;
			if (time > toTime) break;

			if (this.curCursorTime != time) {
				this.curCursorTime = time;
				this.cursors[0].next();
			}
			i++;
		}
	}

	startPlayback(fromTime = 0) {
		this.stopPlayback();
		this.cursors[0].hide();
		this.cursors[0].reset();
		this.cursors[0].show();
		this.acclerCursor(fromTime);

		// set beat per second
		const bps = 60 / this.bpm;

		// 只排程「時間點 >= fromTime」的音符
		const remainingNotes = this.playbackData.filter(
			(note) => note.time >= fromTime,
		);

		remainingNotes.forEach((note) => {
			const delta = (note.time - fromTime) * 1000 * bps;

			// note on
			const onTimer = setTimeout(() => {
				if (note.pitch == 0) {
					// rest
				} else if (!note.lyrics) {
					playNote(note.pitch);
				} else {
					playNote(note.pitch, 100, true);
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
						stopNote(note.pitch, true);
					}
				},
				delta + note.dur * 1000 * bps,
			);

			this.timers.push(onTimer);
			this.timers.push(offTimer);
		});
	}

	stopPlayback() {
		this.timers.forEach((timer) => {
			clearTimeout(timer);
		});

		this.timers = [];
		this.curCursorTime = 0;

		// ALL note off
		for (let i = 0; i < 128; i++) {
			stopNote(i);
			stopNote(i, true);
		}
	}

	cursorNext() {
		this.cursors[0].next();
	}

	showIdicatorBar() {}

	dispose() {
		this.stopPlayback();
		this.ac.abort(); // 一次移除這個 Player 綁的所有監聽器
	}
}
