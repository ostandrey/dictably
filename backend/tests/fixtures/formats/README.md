# Synthetic media fixtures (T-046)

Generated with ffmpeg (`sine=f=440:d=0.3`), not human recordings.

```bash
ffmpeg -y -f lavfi -i sine=f=440:d=0.3 -c:a libopus sample.opus
ffmpeg -y -f lavfi -i sine=f=440:d=0.3 -ar 8000 -ac 1 -c:a libopencore_amrnb sample.amr
ffmpeg -y -f lavfi -i sine=f=440:d=0.3 -c:a aac -f 3gp sample.3gp
ffmpeg -y -f lavfi -i sine=f=440:d=0.3 -c:a aac -f mp4 sample.m4v
ffmpeg -y -f lavfi -i sine=f=440:d=0.3 -c:a pcm_s16le -f avi sample.avi
ffmpeg -y -f lavfi -i sine=f=440:d=0.3 -c:a wmav2 -f asf sample.wma
```
