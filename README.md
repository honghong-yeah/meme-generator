# meme-generator

表情包工厂 - 通过自然语言交互生成表情包的 AI Agent Skill。支持 AI 自动抠图、白色描边、云朵气泡配文。

## Install

```bash
npx skills add honghong-yeah/meme-generator
```

## Features

- AI 自动抠图（@imgly background-removal，默认轻量模型；`--hd` 高精度模式可选）
- 白色描边效果，突出主体
- 云朵气泡配文，支持中文字体
- 剪贴板直接读取图片（macOS / Windows / Linux）
- CLI 命令行模式，适合 AI Agent 调用
- 两种可爱中文字体：站酷快乐体、白白胖胖无敌可爱

## Usage

```bash
# 从文件生成
cd <skill-dir>/scripts && npx tsx cli.ts --image /path/to/photo.jpg --caption "今天超开心" --output ~/Documents/meme-out

# 从剪贴板生成（截图后直接运行）
cd <skill-dir>/scripts && npx tsx cli.ts --clipboard --caption "萌娃驾到" --output ~/Documents/meme-out
```

### Options

| Parameter | Required | Default | Description |
|-----------|:--------:|---------|-------------|
| `--image <path>` | No* | - | Input image path |
| `--clipboard` | No* | - | Read image from clipboard |
| `--caption <text>` | Yes | - | Caption text |
| `--output <dir>` | Yes | `./output` | Output directory |
| `--style <id>` | No | `zhanku` | Font style: `zhanku` or `baibai` |
| `--font-size <num>` | No | `90` | Font size in px |
| `--text-color <hex>` | No | `#FF6B6B` | Text color |
| `--text-bg-color <hex>` | No | `#FFF5E6` | Text background color |
| `--bg-color <hex>` | No | `#EBE0F0` | Background color |
| `--text-placement <mode>` | No | `below` | `overlay` or `below` |
| `--hd` | No | off | High-precision background removal (slower) |

> \* `--image` and `--clipboard` are mutually exclusive; one is required.

## Requirements

- Node.js (recommended: manage via [fnm](https://github.com/Schniz/fnm))
- First run will auto-install npm dependencies (`@napi-rs/canvas`, `@imgly/background-removal-node`)
- `--hd` mode additionally requires Python 3 + rembg (optional, not enabled by default)

## License

MIT
