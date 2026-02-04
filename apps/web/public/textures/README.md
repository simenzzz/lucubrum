# Paper Textures

This directory contains texture files for the cartographic theme.

## paper-noise.png

A subtle paper grain/noise texture that is overlaid on the parchment background to give it an aged, tactile feel.

### Generation Instructions

If you need to regenerate this texture:

1. Using ImageMagick:
```bash
convert -size 1920x1080 xc:#F7F3E8 \
  +noise Random \
  -blur 0x2 \
  -modulate 100,97,100 \
  -normalize \
  public/textures/paper-noise.png
```

2. Or use any noise texture generator:
   - Base color: `#F7F3E8` (parchment)
   - Noise intensity: 3-5%
   - Blur radius: 1-2px for subtle effect

### Usage in CSS

```css
.paper-texture {
  background-color: #F7F3E8;
  background-image: url('/textures/paper-noise.png');
  background-blend-mode: overlay;
}
```
