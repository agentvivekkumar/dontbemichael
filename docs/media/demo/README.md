# Demo videos

`agents.mp4` and `agents-poster.jpg` are embedded in the repo `README.md` (the "agents at
work" section). They are the old project's recording and are due to be replaced; see
"Record demo videos of Don't Be Michael" in `TODOS.md`.

## Encoding a new video

Re-encode the recording with faststart (without it the browser downloads the whole file
before playback starts) and a moderate CRF:

```sh
ffmpeg -i NewRecording.mov \
  -vf "scale='min(1440,iw)':-2" -c:v libx264 -crf 26 -preset slow -pix_fmt yuv420p \
  -c:a aac -b:a 128k -movflags +faststart \
  docs/media/demo/<name>.mp4

# poster (frame at 1.5s)
ffmpeg -y -ss 1.5 -i docs/media/demo/<name>.mp4 -frames:v 1 -q:v 4 docs/media/demo/<name>-poster.jpg
```

Notes:
- Target about 16:10, at most 1440px wide. CRF 26 keeps screen-recording text crisp at
  roughly a sixth of the raw size.
- Do not commit raw recordings; `.gitignore` already keeps `docs/media/*.mov` out.
