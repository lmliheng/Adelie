"""把分镜脚本变成「配音 + 精确时间轴」。

流程：edge-tts 逐幕合成配音（同时拿到逐词边界）→ 转 48k 单声道 wav 量长度 →
拼出全局时间轴 → 写出 lesson.json（课件渲染与视频合成共用这一份数据）。

用法: python lib/tts.py lessons/ep00-pilot
"""
from __future__ import annotations

import asyncio
import json
import re
import subprocess
import sys
import time
import wave
from pathlib import Path

import edge_tts
import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
PUNCT = "，。！？；：、"


async def synth(text: str, voice: str, rate: str, mp3: Path) -> list[dict]:
    """合成一段配音，返回逐词边界（秒）。

    edge-tts 7.x 默认 boundary='SentenceBoundary'，拿不到逐词时间——必须显式要 WordBoundary，
    字幕才能贴着人声逐句走。
    """
    comm = edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary")
    words: list[dict] = []
    with open(mp3, "wb") as f:
        async for chunk in comm.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                words.append({
                    "text": chunk["text"],
                    "start": chunk["offset"] / 1e7,
                    "dur": chunk["duration"] / 1e7,
                })
    return words


def synth_retry(text: str, voice: str, rate: str, mp3: Path, tries: int = 4) -> list[dict]:
    """edge-tts 偶尔会空手而归（NoAudioReceived），重试几次就好。"""
    last: Exception | None = None
    for i in range(tries):
        try:
            words = asyncio.run(synth(text, voice, rate, mp3))
            if words:
                return words
            last = RuntimeError("没有拿到逐词边界")
        except Exception as e:  # noqa: BLE001
            last = e
        time.sleep(1.5 * (i + 1))
        print(f"     重试 {i + 1}/{tries - 1}：{type(last).__name__}")
    raise SystemExit(f"配音合成失败：{last}")


def to_wav(mp3: Path, wav: Path) -> None:
    subprocess.run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error",
                    "-i", str(mp3), "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", str(wav)], check=True)


def wav_duration(p: Path) -> float:
    with wave.open(str(p), "rb") as w:
        return w.getnframes() / w.getframerate()


def join_words(group: list[dict]) -> str:
    """把词拼回一行；中文与西文交界处补一个空格，中英混排才不挤。"""
    out = ""
    for w in group:
        t = w["text"]
        if out and t:
            a, b = out[-1], t[0]
            ascii_a, ascii_b = a.isascii() and a.isalnum(), b.isascii() and b.isalnum()
            if (ascii_a and ascii_b) or (ascii_a != ascii_b and (a.isalnum() or b.isalnum())):
                out += " "
        out += t
    return out


def build_subtitles(text: str, words: list[dict], lead: float, max_len: int = 13) -> list[dict]:
    """先按标点断句，再按**词**切短行——不能按字数硬切，否则会把 Kaggle 切一半。

    时间直接取该行首词与末词的 WordBoundary，所以字幕贴着人声走。
    句尾标点补回最后一行。
    """
    subs: list[dict] = []
    wi = 0
    for sent in re.findall(rf"[^{PUNCT}]+[{PUNCT}]*", text):
        if not sent.strip():
            continue
        m = re.search(rf"[{PUNCT}]+$", sent)
        tail = m.group(0) if m else ""
        need = len(re.sub(r"\s", "", sent[: m.start()] if m else sent))

        groups: list[list[dict]] = []
        cur: list[dict] = []
        consumed = 0   # 本句已吃掉的字数，用来判断这句的词吃完了没有
        curlen = 0     # 当前这一行的字数，用来判断该不该换行
        while consumed < need and wi < len(words):
            t = words[wi]["text"]
            if cur and curlen + len(t) > max_len:
                groups.append(cur)
                cur, curlen = [], 0
            cur.append(words[wi])
            curlen += len(t)
            consumed += len(t)
            wi += 1
        if cur:
            groups.append(cur)

        for gi, g in enumerate(groups):
            subs.append({
                "text": join_words(g) + (tail if gi == len(groups) - 1 else ""),
                "start": round(lead + g[0]["start"], 3),
                "end": round(lead + g[-1]["start"] + g[-1]["dur"], 3),
            })
    return subs


def cue_time(cue: str, words: list[dict]) -> float | None:
    """在逐词流里找到这句关键词，返回它第一个字被念到的时间（相对本幕）。

    刻意按「词」而不是按「字幕行」匹配：字幕行长度有限，像
    「X 转置 X 的逆」这种 cue 很可能正好横跨两行，按行匹配会匹配不到。
    """
    joined, owner = "", []
    for wi, w in enumerate(words):
        t = re.sub(r"\s", "", w["text"])
        joined += t
        owner.extend([wi] * len(t))
    p = joined.find(re.sub(r"\s", "", cue))
    return None if p < 0 else words[owner[p]]["start"]


def apply_cues(node, words: list[dict], lead: float = 0.15) -> None:
    """把脚本里的 "cue": "关键词"（或 "<名>_cue"）解析成出现秒数。

    写作时只写「念到这个词的时候，这块内容出现」，不用手算时间；
    配音合成后拿逐词时间反过来标定，画面和讲解自动咬合。已经写了 at 的不覆盖。
    """
    if isinstance(node, dict):
        for k in [kk for kk in list(node) if kk.endswith("_cue") and isinstance(node[kk], str)]:
            t = cue_time(node[k], words)
            if t is not None:
                node.setdefault(k[:-4] + "_at", max(0.0, round(t - lead, 2)))
        if isinstance(node.get("cue"), str) and "at" not in node:
            t = cue_time(node["cue"], words)
            if t is not None:
                node["at"] = max(0.0, round(t - lead, 2))
        for v in node.values():
            apply_cues(v, words, lead)
    elif isinstance(node, list):
        for v in node:
            apply_cues(v, words, lead)


def main() -> None:
    lesson_dir = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path("lessons/ep00-pilot").resolve()
    script = json.loads((lesson_dir / "script.json").read_text(encoding="utf-8"))
    audio_dir = lesson_dir / "audio"
    audio_dir.mkdir(exist_ok=True)

    voice, rate, gap = script["voice"], script["rate"], script.get("gap", 0.35)
    scenes, subs, cursor = [], [], 0.0

    for i, sc in enumerate(script["scenes"]):
        mp3 = audio_dir / f"{sc['id']}.mp3"
        wav = audio_dir / f"{sc['id']}.wav"
        words = synth_retry(sc["narration"], voice, rate, mp3)
        to_wav(mp3, wav)
        dur = wav_duration(wav)

        scene_subs = build_subtitles(sc["narration"], words, cursor)
        entry = {k: v for k, v in sc.items() if k != "narration"}
        apply_cues(entry, words)
        entry.update({"start": round(cursor, 3), "dur": round(dur + gap, 3), "audio": round(dur, 3)})
        scenes.append(entry)
        subs.extend(scene_subs)
        print(f"  {sc['id']:>4}  {dur:5.2f}s  {sc['narration']}")
        cursor += dur + gap

    duration = round(cursor, 3)
    # meta 里除 scenes 之外的顶层标量原样传下去：deck.html 用 meta.wm / meta.mark 渲染
    # 右上角水印、台标字母，脚本里写什么就显示什么，模板本身不含任何固定文案。
    meta = {"series": script["series"], "episode": script["episode"], "id": script["id"],
            "brand": script.get("brand", script["series"]), "voice": voice, "rate": rate}
    meta.update({k: v for k, v in script.items() if isinstance(v, (str, int, float, bool))})
    lesson = {
        "meta": meta,
        "fps": 30,
        "duration": duration,
        "scenes": scenes,
        "subtitles": [{"text": s["text"], "start": round(s["start"], 3), "end": round(s["end"], 3)} for s in subs],
    }
    (lesson_dir / "lesson.json").write_text(json.dumps(lesson, ensure_ascii=False, indent=2), encoding="utf-8")

    # 配音轨：每幕之间补上 gap 长度的静音，最后也补一段
    concat = audio_dir / "concat.txt"
    lines = []
    for i, sc in enumerate(scenes):
        lines.append(f"file '{(audio_dir / (sc['id'] + '.wav')).as_posix()}'")
        lines.append(f"file '{(audio_dir / 'gap.wav').as_posix()}'")
    with wave.open(str(audio_dir / "gap.wav"), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(48000)
        w.writeframes(b"\x00" * int(48000 * 2 * gap))
    concat.write_text("\n".join(lines) + "\n", encoding="utf-8")
    subprocess.run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error",
                    "-f", "concat", "-safe", "0", "-i", str(concat),
                    str(audio_dir / "narration.wav")], check=True)

    print(f"OK 时长 {duration:.2f}s -> {lesson_dir / 'lesson.json'}")
    print(f"   配音 -> {audio_dir / 'narration.wav'}  ({wav_duration(audio_dir / 'narration.wav'):.2f}s)")


if __name__ == "__main__":
    main()
