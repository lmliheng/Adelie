"""把帧序列 + 配音轨 + 字幕合成成竖屏 MP4（1080x1920，H.264/AAC，抖音可直传）。

用法: python lib/build.py lessons/ep00-pilot [--out out/pilot.mp4]
"""
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


def srt_time(sec: float) -> str:
    ms = int(round(sec * 1000))
    h, ms = divmod(ms, 3600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def write_srt(subs: list[dict], path: Path) -> None:
    lines = []
    for i, s in enumerate(subs, 1):
        lines += [str(i), f"{srt_time(s['start'])} --> {srt_time(s['end'])}", s["text"], ""]
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("dir")
    ap.add_argument("--out")
    ap.add_argument("--crf", type=int, default=18)
    args = ap.parse_args()

    d = Path(args.dir).resolve()
    lesson = json.loads((d / "lesson.json").read_text(encoding="utf-8"))
    frames = sorted((d / "frames").glob("f_*.jpg"))
    if not frames:
        raise SystemExit(f"没有帧，先跑 render.mjs：{d / 'frames'}")
    audio = d / "audio" / "narration.wav"
    out = Path(args.out) if args.out else d / "out" / f"{lesson['meta']['id']}.mp4"
    if not out.is_absolute():
        out = d / out
    out.parent.mkdir(parents=True, exist_ok=True)

    fps = lesson["fps"]
    expect = round(lesson["duration"] * fps)
    if abs(len(frames) - expect) > 2:
        print(f"⚠ 帧数与时间轴不符：{len(frames)} vs {expect}")

    write_srt(lesson["subtitles"], out.with_suffix(".srt"))

    cmd = [
        FFMPEG, "-y", "-hide_banner", "-loglevel", "error",
        "-framerate", str(fps), "-start_number", "0", "-i", str(d / "frames" / "f_%05d.jpg"),
        "-i", str(audio),
        # JPEG 帧是全范围，转成广播标准的 limited range + bt709，避免平台转码后发灰
        "-vf", "scale=in_range=full:out_range=tv,format=yuv420p",
        "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
        "-c:v", "libx264", "-preset", "slow", "-crf", str(args.crf),
        "-profile:v", "high", "-level", "4.2",
        # 社媒响度：-14 LUFS / 真峰值 -1.5 dBTP
        "-af", "loudnorm=I=-14:TP=-1.5:LRA=11",
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "1",
        "-shortest", "-movflags", "+faststart",
        str(out),
    ]
    subprocess.run(cmd, check=True)
    print(f"OK {out}  {out.stat().st_size / 1024**2:.1f} MB  "
          f"{lesson['duration']:.1f}s @ {fps}fps  字幕 {out.with_suffix('.srt').name}")


if __name__ == "__main__":
    main()
