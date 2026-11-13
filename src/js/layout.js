import { marked } from "marked";
import DOMPurify from "dompurify";

const workspace = document.getElementById("workspace");
const splitter = document.getElementById("splitter");
const docContent = document.getElementById("docContent");

document.getElementById("navToggle").addEventListener("click", () => {
	document.body.classList.toggle("nav-collapsed");
});

// ---- 分界線拖曳 ----
const saved = localStorage.getItem("splitRatio");
if (saved) workspace.style.setProperty("--left-w", saved + "%");

splitter.addEventListener("pointerdown", (e) => {
	splitter.setPointerCapture(e.pointerId); // 滑鼠移出分界線也持續收到事件
	document.body.classList.add("dragging");
});

splitter.addEventListener("pointermove", (e) => {
	if (!splitter.hasPointerCapture(e.pointerId)) return;
	const rect = workspace.getBoundingClientRect();
	let ratio = ((e.clientX - rect.left) / rect.width) * 100;
	ratio = Math.min(80, Math.max(20, ratio)); // 限制 20% ~ 80%
	workspace.style.setProperty("--left-w", ratio + "%");
	splitter.dataset.ratio = ratio;
});

splitter.addEventListener("pointerup", (e) => {
	splitter.releasePointerCapture(e.pointerId);
	document.body.classList.remove("dragging");
	if (splitter.dataset.ratio) localStorage.setItem("splitRatio", splitter.dataset.ratio);
	window.osmd?.render(); // 樂譜寬度變了，放開後重新排版
});

// ---- Markdown ----
export function renderMarkdown(text) {
	docContent.innerHTML = DOMPurify.sanitize(marked.parse(text));
}

const BASE = import.meta.env.BASE_URL;
const SCORE_BASE = BASE + "score/";

let docReq = 0; // 請求編號，避免快速切換時舊的回應蓋掉新的

export function clearDoc() {
	docReq++;
	docContent.innerHTML = "";
}

// 只負責讀取：成功回傳文字，失敗回傳 null
async function fetchMd(url) {
	try {
		const res = await fetch(url);
		if (!res.ok) return null;

		// Vite dev server 對不存在的檔案會回傳 index.html（狀態 200），要擋掉
		const type = res.headers.get("content-type") ?? "";
		if (type.includes("text/html")) return null;

		const text = await res.text();
		if (/^\s*<!doctype html/i.test(text)) return null;
		return text;
	} catch {
		return null;
	}
}

async function loadDocFromUrl(url) {
	const myReq = ++docReq;
	docContent.innerHTML = "";

	let text = await fetchMd(url);
	if (myReq !== docReq) return; // 已經切到別份，丟棄

	if (text === null) {
		text = await fetchMd(SCORE_BASE + "wip.md"); // 找不到，改讀 wip.md
		if (myReq !== docReq) return;
	}

	if (text !== null) renderMarkdown(text);
}

export function loadDocFor(scoreFile) {
	const mdName = scoreFile.replace(/\.(xml|musicxml|mxl)$/i, ".md");
	return loadDocFromUrl(SCORE_BASE + encodeURIComponent(mdName));
}

export function loadWelcome() {
	return loadDocFromUrl(SCORE_BASE + "welcome.md");
}
