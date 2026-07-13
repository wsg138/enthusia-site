# Cinematic mask editor — quick guide

This tool runs only on your computer. It does not change the active website mask.

## Start

1. Open PowerShell in the website project folder.
2. Run:

   ```powershell
   npm run mask-editor
   ```

3. Your browser should open automatically at [http://127.0.0.1:8765/](http://127.0.0.1:8765/). If it does not, open that address yourself.

## Correct each checkpoint

1. Start with **Sun behind right trees** and move through every checkpoint button.
2. Choose **Terrain — cover the sun/moon** and paint over leaves, branches, trunks, stone, or mountain blocks that should hide the disk.
3. Choose **Sky — let the background show** only for genuine empty holes.
4. Use **Soft edge** only on a real outside boundary. Most edits should use the hard Terrain or Sky brush.
5. Turn **Glow** off while checking physical edges.
6. Turn **Glow** back on to check the finished appearance.
7. Use the mouse wheel or Zoom buttons to reach 800%–1600%. Hold Space and drag, or choose **Pan**, to move around.
8. Bright green pixels are optional local suggestions. Accept or reject them checkpoint by checkpoint.

Orange means Terrain repair. Blue means Sky repair. Neither color is written into the actual landscape.

## Finish

1. Visit all six checkpoints.
2. Click **Validate**.
3. Fix anything shown in red.
4. Click **Save Repairs**.
5. Wait for **Repairs saved successfully**.
6. Tell Codex: “The mask repairs are finished.”

Save Repairs creates these files directly in the repository:

- `public/assets/minecraft-occlusion-add-v2.png`
- `public/assets/minecraft-occlusion-subtract-v2.png`
- `public/assets/minecraft-occlusion-repair-v2.json`

The existing `minecraft-terrain-mask-v1.png` and phase foregrounds are not modified.

Press `Ctrl+C` in PowerShell when you are done to stop the editor.
