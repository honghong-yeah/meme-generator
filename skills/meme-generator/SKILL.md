---
name: "meme-generator"
description: "表情包工厂——通过自然语言交互生成表情包。支持 CLI 命令行模式。AI 自动抠图、白色描边、云朵气泡配文。Invoke when user wants to create meme images, 表情包生成+配文, or image captioning with AI background removal."
---

# 萌娃表情包工厂 CLI

## 用法

```bash
cd <skill-dir>/scripts && npx tsx cli.ts --image <图片路径> --caption <配文> --output ~/Documents/meme-out [options]
# 或从剪贴板读取图片
cd <skill-dir>/scripts && npx tsx cli.ts --clipboard --caption <配文> --output ~/Documents/meme-out [options]
```

## 参数

| 参数 | 必需 | 默认值 |
|------|:---:|--------|
| `--image <path>` | 否* | - |
| `--clipboard` | 否* | - |
| `--caption <text>` | 是 | 配文内容 |
| `--output <dir>` | 是 | `./output` |
| `--style <id>` | 否 | `zhanku` |
| `--font-size <num>` | 否 | `90` |
| `--text-color <hex>` | 否 | `#FF6B6B` |
| `--text-bg-color <hex>` | 否 | `#FFF5E6` |
| `--bg-color <hex>` | 否 | `#EBE0F0` |
| `--text-placement <mode>` | 否 | `below` |
| `--text-x <0-1>` | 否 | `0.5` |
| `--text-y <0-1>` | 否 | `0.85` |
| `--hd` | 否 | 关闭 |

> \* `--image` 与 `--clipboard` 二选一，不能同时使用。

## 值映射

**字体 --style**：站酷/zhanku → `zhanku` | 白白/baibai → `baibai`

**文字色 --text-color**：白→`#FFFFFF` 黑→`#2D3436` 粉→`#FF6B6B` 嫩绿→`#4ECDC4` 天蓝→`#74B9FF` 鹅黄→`#FFE066` 淡紫→`#A29BFE` 暖橙→`#FDCB6E` 灰→`#636E72`

**文字底色 --text-bg-color**：透明→`transparent` 杏色→`#FAD6C2` 淡粉→`#FFE0E5` 奶油→`#FFF5E6` 薄荷→`#C8E6D0` 淡蓝→`#D0E4F5` 淡紫→`#E8D8F0` 浅灰→`#F0F0F0` 纯白→`#FFFFFF`

**背景色 --bg-color**：透明→`transparent` 纯白→`#FFFFFF` 浅粉→`#F8E8E8` 渐变粉→`gradient-pink` 抹茶→`#D4E0C8` 浅棕→`#E8D5C4` 燕麦→`#F5ECD7` 雾蓝→`#D8E8F0` 淡紫→`#EBE0F0`

**文字位置 --text-placement**：图上/悬浮→`overlay` | 图下/下方→`below`

## 示例

单张（文件路径）：
```bash
cd <skill-dir>/scripts && npx tsx cli.ts --image /path/to/baby.jpg --caption "今天超开心" --output ~/Documents/meme-out
```

剪贴板（截图 / 复制图片后直接粘贴）：
```bash
cd <skill-dir>/scripts && npx tsx cli.ts --clipboard --caption "萌娃驾到" --output ~/Documents/meme-out
```

自定义参数：
```bash
cd <skill-dir>/scripts && npx tsx cli.ts \
  --image /path/to/baby.jpg --caption "萌萌哒" \
  --style baibai --font-size 120 --text-color "#FFFFFF" \
  --bg-color transparent --text-bg-color "#FFF5E6" --output ~/Documents/meme-out
```

## 剪贴板支持

`--clipboard` 自动识别三种复制方式：

1. **截图 / 复制图片内容**（如浏览器右键"复制图片"、系统截图后 Cmd+C）
2. **复制图片文件**（如 Finder 中选中图片文件 Cmd+C）
3. **复制图片文件路径文本**（如 `/Users/xxx/photo.jpg` 路径字符串）

非图片内容（纯文本、非图片文件等）会给出明确错误提示。

> 平台兼容：macOS 原生支持，Windows 依赖 PowerShell，Linux 需安装 `wl-clipboard`（Wayland）或 `xclip`（X11）。

## 多图片处理

当用户提供多张图片时（如多个文件路径、Finder 多选复制、或一次性提供多张图片），CLI 一次只处理一张图片，需由 SKILL 负责按顺序循环调用。配文匹配规则如下：

1. **配文数量 = 图片数量**：按顺序一一对应，每张图片使用各自配文，依次调用 CLI。
2. **配文数量 ≠ 图片数量**：必须先与用户确认，不要擅自处理。确认话术示例：
   - "检测到 N 张图片，但只有 M 条配文。请确认：是为每张图片分别提供配文，还是用同一条配文应用到所有图片？"
3. **用户确认使用单一配文**：所有图片共用同一条配文，依次调用 CLI（每张图片调用一次，`--caption` 传同一条文案）。
4. **用户确认为每张图片分别配文**：请用户补齐配文至与图片数量一致，再按顺序一一对应处理。

### 调用方式

对每张图片分别调用一次 CLI，使用各自配文：

```bash
# 第 1 张
cd <skill-dir>/scripts && npx tsx cli.ts --image /path/to/img1.jpg --caption "配文1" --output ~/Documents/meme-out
# 第 2 张
cd <skill-dir>/scripts && npx tsx cli.ts --image /path/to/img2.jpg --caption "配文2" --output ~/Documents/meme-out
# ...依此类推
```

> 注意：输出目录 `--output` 保持一致，方便用户统一查看结果。其他可选参数（`--style`、`--font-size` 等）按用户指定统一应用。

## 高精度抠图（--hd）

默认使用浏览器端轻量模型（@imgly isnet，约 3-5 秒/张）。当用户对默认抠图效果不满意（多抠/少抠/边缘不精确），可加 `--hd` 参数切换到 birefnet 高精度模型：

```bash
cd <skill-dir>/scripts && npx tsx cli.ts --image /path/to/baby.jpg --caption "精细抠图" --hd --output ~/Documents/meme-out
```

**使用场景**：仅在用户明确反馈抠图不精确时使用（毛发/复杂背景/边缘细节多的图片）。日常使用不要加 `--hd`。

**限制**：
- 耗时长：Intel Mac CPU 约 2-3 分钟/张（vs 默认 3-5 秒）
- 首次使用需安装 Python 依赖并下载模型（约 973MB）：
  ```bash
  pip3 install rembg onnxruntime click filetype asyncer watchdog aiohttp --user
  ```
- 如未安装依赖，CLI 会报错并提示安装命令

## 注意

- 本 SKILL 依赖 nodejs 环境，可先尝试执行，如发现缺少 node 环境，可提醒用户，并协助安装。推荐使用 fnm 来管理 nodejs 环境，安装步骤：
  - 安装 fnm：Mac 上优先用 `brew install fnm`，如不可行则 `curl -fsSL https://fnm.vercel.app/install | bash`
  - 生效 fnm 环境：`eval "$(fnm env --use-on-cd)"`
  - 安装 nodejs：`fnm install --lts`
- 当用户未给出图片路径时，默认图片在剪贴板里，如果尝试剪贴板也失败，则提醒用户需要以几种方式给出图片输入。
- `--hd` 模式额外依赖 Python3 + rembg，默认不启用。仅当用户反馈抠图不精确时才建议使用。