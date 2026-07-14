/**
 * 萌娃表情包工厂 CLI
 *
 * 用法:
 *   npx tsx scripts/cli.ts --image <path> --caption <text> [options]
 *   npx tsx scripts/cli.ts --clipboard --caption <text> [options]
 *
 * 必需参数:
 *   --image <path>      输入图片路径（与 --clipboard 二选一）
 *   --clipboard         从剪贴板读取图片（与 --image 二选一）
 *   --caption <text>    配文内容
 *
 * 可选参数:
 *   --style <id>        字体风格: baibai | zhanku (默认: zhanku)
 *   --font-size <num>   字号 (默认: 90)
 *   --text-color <hex>  文字颜色 (默认: #FF6B6B)
 *   --text-bg-color <hex>  文字底色 (默认: #FFF5E6)
 *   --bg-color <hex>    背景色 (默认: #EBE0F0)
 *   --text-placement <mode>  文字位置: overlay | below (默认: below)
 *   --text-x <0-1>      文字 X 位置 (默认: 0.5)
 *   --text-y <0-1>      文字 Y 位置 (默认: 0.85)
 *   --output <dir>      输出目录 (默认: ./output)
 *   --help              显示帮助
 */

import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { removeBackground } from '@imgly/background-removal-node';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Blob } from 'buffer';
import { execSync } from 'child_process';
import * as os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============ 常量 ============

const STROKE_PADDING = 16;
const TEXT_PADDING = 20;
const TEXT_GAP = 20;
const BASE_W = 1080;
const MAX_CANVAS_W = 1080;

const DEFAULTS = {
  style: 'zhanku' as string,
  fontSize: 90,
  textColor: '#FF6B6B',
  textBgColor: '#FFF5E6',
  bgColor: '#EBE0F0',
  textPlacement: 'below' as string,
  textX: 0.5,
  textY: 0.85,
  output: './output',
  hd: false,
};

const FONT_FAMILIES: Record<string, string> = {
  baibai: 'BaiBaiPangPang',
  zhanku: 'ZhanKuKuaiLe',
};

const FONT_PATHS: Record<string, string> = {
  baibai: 'assets/fonts/BaiBaiPangPang-WuDiKeAi-2.ttf',
  zhanku: 'assets/fonts/ZhanKuKuaiLeTi2016XiuDingBan-1.ttf',
};

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'];

// ============ 帮助信息 ============

function printHelp() {
  const isBundled = __filename.endsWith('.mjs');
  const cmd = isBundled ? 'node scripts/cli.mjs' : 'npx tsx scripts/cli.ts';
  console.log(`
萌娃表情包工厂 CLI

用法:
  ${cmd} --image <path> --caption <text> [options]
  ${cmd} --clipboard --caption <text> [options]

必需参数:
  --image <path>         输入图片路径（与 --clipboard 二选一）
  --clipboard            从剪贴板读取图片（与 --image 二选一）
  --caption <text>       配文内容

可选参数:
  --style <id>           字体风格: baibai | zhanku (默认: zhanku)
  --font-size <num>      字号，单位 px (默认: 90)
  --text-color <hex>     文字颜色，如 #FF6B6B (默认: #FF6B6B)
  --text-bg-color <hex>  文字底色，如 #FFF5E6, transparent (默认: #FFF5E6)
  --bg-color <hex>       背景色，如 #EBE0F0, transparent, gradient-pink (默认: #EBE0F0)
  --text-placement <mode> 文字位置: overlay（悬浮在图上）| below（图片下方） (默认: below)
  --text-x <0-1>         文字 X 位置，0=左 1=右 (默认: 0.5)
  --text-y <0-1>         文字 Y 位置，0=上 1=下 (默认: 0.85)
  --output <dir>         输出目录 (默认: ./output)
  --hd                   高精度抠图（birefnet 模型，耗时约 2-3 分钟/张，默认关闭）
  --help                 显示此帮助信息

示例:
  ${cmd} --image ./baby.jpg --caption "今天也是可爱的一天"
  ${cmd} --clipboard --caption "刚从截图来的萌娃"
  ${cmd} --image ./baby.jpg --caption "开心" --style baibai --font-size 120 --bg-color transparent
  ${cmd} --image ./baby.jpg --caption "精细抠图" --hd
`);
}

// ============ 参数解析 ============

interface CliOptions {
  image?: string;
  caption: string;
  style: string;
  fontSize: number;
  textColor: string;
  textBgColor: string;
  bgColor: string;
  textPlacement: string;
  textX: number;
  textY: number;
  output: string;
  clipboard: boolean;
  help: boolean;
  hd: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    caption: '',
    style: DEFAULTS.style,
    fontSize: DEFAULTS.fontSize,
    textColor: DEFAULTS.textColor,
    textBgColor: DEFAULTS.textBgColor,
    bgColor: DEFAULTS.bgColor,
    textPlacement: DEFAULTS.textPlacement,
    textX: DEFAULTS.textX,
    textY: DEFAULTS.textY,
    output: DEFAULTS.output,
    clipboard: false,
    help: false,
    hd: DEFAULTS.hd,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--image':
        if (!next) { console.error('错误: --image 需要提供路径'); process.exit(1); }
        options.image = next;
        i++;
        break;
      case '--caption':
        if (!next) { console.error('错误: --caption 需要提供文本'); process.exit(1); }
        options.caption = next;
        i++;
        break;
      case '--style':
        if (!next || !['baibai', 'zhanku'].includes(next)) {
          console.error('错误: --style 必须是 baibai 或 zhanku');
          process.exit(1);
        }
        options.style = next;
        i++;
        break;
      case '--font-size': {
        if (!next) { console.error('错误: --font-size 需要提供数字'); process.exit(1); }
        const n = parseInt(next, 10);
        if (isNaN(n) || n <= 0) { console.error('错误: --font-size 必须是正整数'); process.exit(1); }
        options.fontSize = n;
        i++;
        break;
      }
      case '--text-color':
        if (!next) { console.error('错误: --text-color 需要提供颜色值'); process.exit(1); }
        options.textColor = next;
        i++;
        break;
      case '--text-bg-color':
        if (!next) { console.error('错误: --text-bg-color 需要提供颜色值'); process.exit(1); }
        options.textBgColor = next;
        i++;
        break;
      case '--bg-color':
        if (!next) { console.error('错误: --bg-color 需要提供颜色值'); process.exit(1); }
        options.bgColor = next;
        i++;
        break;
      case '--text-placement':
        if (!next || !['overlay', 'below'].includes(next)) {
          console.error('错误: --text-placement 必须是 overlay 或 below');
          process.exit(1);
        }
        options.textPlacement = next;
        i++;
        break;
      case '--text-x': {
        if (!next) { console.error('错误: --text-x 需要提供数字'); process.exit(1); }
        const n = parseFloat(next);
        if (isNaN(n) || n < 0 || n > 1) { console.error('错误: --text-x 必须是 0-1 之间的数字'); process.exit(1); }
        options.textX = n;
        i++;
        break;
      }
      case '--text-y': {
        if (!next) { console.error('错误: --text-y 需要提供数字'); process.exit(1); }
        const n = parseFloat(next);
        if (isNaN(n) || n < 0 || n > 1) { console.error('错误: --text-y 必须是 0-1 之间的数字'); process.exit(1); }
        options.textY = n;
        i++;
        break;
      }
      case '--output':
        if (!next) { console.error('错误: --output 需要提供目录路径'); process.exit(1); }
        options.output = next;
        i++;
        break;
      case '--help':
        options.help = true;
        break;
      case '--clipboard':
        options.clipboard = true;
        break;
      case '--hd':
        options.hd = true;
        break;
      default:
        if (arg.startsWith('--')) {
          console.error(`未知参数: ${arg}`);
          process.exit(1);
        }
    }
  }

  return options;
}

// ============ 剪贴板读取 ============

/** 将文本当作文件路径尝试，如果是有效图片路径则复制到 tmpFile */
function tryTextAsFilePath(text: string, tmpFile: string): string | null {
  const trimmed = text.trim();

  // 跳过明显不是路径的内容（多行文本、过短等）
  if (trimmed.includes('\n') || trimmed.length < 2 || trimmed.length > 4096) {
    return null;
  }

  if (!fs.existsSync(trimmed)) return null;

  const stat = fs.statSync(trimmed);
  if (!stat.isFile()) return null;

  const ext = path.extname(trimmed).toLowerCase();
  if (!IMAGE_EXTENSIONS.includes(ext)) return null;

  fs.copyFileSync(trimmed, tmpFile);
  return trimmed; // 返回原路径用于日志
}

/**
 * 从剪贴板读取图片，兼容三种复制方式：
 * 1. 复制图像内容（截图、浏览器中"复制图片"）
 * 2. 复制图片文件（Finder 中 Cmd+C 复制文件）
 * 3. 复制图片文件路径文本（如 "/Users/xxx/photo.jpg"）
 *
 * 返回临时文件路径，调用方负责后续处理。
 */
function readClipboardImage(): string {
  const platform = os.platform();
  const tmpFile = path.join(os.tmpdir(), `meme-clipboard-${Date.now()}.png`);

  const cleanup = () => { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); };

  try {
    if (platform === 'darwin') {
      readClipboardImageDarwin(tmpFile);
    } else if (platform === 'win32') {
      readClipboardImageWin32(tmpFile);
    } else {
      readClipboardImageLinux(tmpFile);
    }

    if (!fs.existsSync(tmpFile) || fs.statSync(tmpFile).size === 0) {
      throw new Error('剪贴板中没有可识别的图片');
    }

    console.log(`✓ 从剪贴板读取图片 (${(fs.statSync(tmpFile).size / 1024).toFixed(1)} KB)`);
    return tmpFile;
  } catch (err) {
    cleanup();
    if (err instanceof Error) {
      // 保留原始错误信息，不额外包装
      throw err;
    }
    throw new Error('剪贴板读取失败：未知错误');
  }
}

/** macOS: 检测顺序：文件引用 > 图像数据 > 文本内容 */
function readClipboardImageDarwin(tmpFile: string): void {
  // 使用 clipboard info 精确检测剪贴板内容类型
  let info: string;
  try {
    info = execSync(`osascript -e 'clipboard info'`, {
      stdio: 'pipe', encoding: 'utf8'
    }).trim();
  } catch {
    throw new Error('剪贴板中没有内容');
  }

  if (!info) {
    throw new Error('剪贴板中没有内容');
  }

  // 优先检测文件引用（Finder 中复制文件）
  // 注意：Finder 复制图片文件时剪贴板会同时包含 furl 和 TIFF 缩略图，
  // 必须优先读 furl 才能拿到原始文件内容，否则会用到 Finder 的缩略图。
  if (info.includes('«class furl»')) {
    let filePath: string;
    try {
      filePath = execSync(
        `osascript -e 'POSIX path of (the clipboard as «class furl»)'`,
        { stdio: 'pipe', encoding: 'utf8' }
      ).trim();
    } catch {
      throw new Error('无法读取剪贴板中的文件路径');
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`剪贴板中的文件不存在: ${filePath}`);
    }

    const ext = path.extname(filePath).toLowerCase();
    if (!IMAGE_EXTENSIONS.includes(ext)) {
      throw new Error(`剪贴板中的文件不是图片格式 (${ext})，请复制图片文件或截图`);
    }

    fs.copyFileSync(filePath, tmpFile);
    return;
  }

  // 检测图像数据（截图 / 复制图片内容）
  if (info.includes('«class PNGf»') || info.includes('«class jpgf»') || info.includes('«class TIFF»') || info.includes('«class GIFf»') || info.includes('«class 8BPS»')) {
    try {
      execSync(
        `osascript -e 'write (the clipboard as «class PNGf») to (open for access POSIX file "${tmpFile}" with write permission)'`,
        { stdio: 'pipe' }
      );
    } catch {
      // PNGf 失败时尝试 TIFF（某些应用复制图片使用 TIFF 格式）
      try {
        execSync(
          `osascript -e 'write (the clipboard as TIFF picture) to (open for access POSIX file "${tmpFile}" with write permission)'`,
          { stdio: 'pipe' }
        );
      } catch {
        throw new Error('无法读取剪贴板中的图片数据');
      }
    }
    return;
  }

  // 检测文本内容
  if (info.includes('string') || info.includes('Unicode text') || info.includes('«class utf8»') || info.includes('«class ut16»')) {
    let text = '';
    try {
      text = execSync('pbpaste', { stdio: 'pipe', encoding: 'utf8' }).trim();
    } catch { /* ignore */ }

    // 兼容：文本可能是图片文件路径
    const resolvedPath = tryTextAsFilePath(text, tmpFile);
    if (resolvedPath) {
      console.log(`✓ 剪贴板文本为图片路径，已读取: ${resolvedPath}`);
      return;
    }

    const preview = text.length > 50 ? text.slice(0, 50) + '...' : text;
    throw new Error(`剪贴板中是文本内容，不是图片（内容: "${preview}"）`);
  }

  throw new Error('剪贴板中没有可识别的内容，请先截图或复制图片');
}

/** Windows: 优先读图像数据，fallback 读文件列表 */
function readClipboardImageWin32(tmpFile: string): void {
  const psScript = `
    Add-Type -AssemblyName System.Windows.Forms;
    Add-Type -AssemblyName System.Drawing;

    # 检查是否有图像数据
    if ([Windows.Forms.Clipboard]::ContainsImage()) {
      $img = [Windows.Forms.Clipboard]::GetImage();
      $img.Save('${tmpFile.replace(/\\/g, '\\\\')}');
      Write-Output 'image';
      exit;
    }

    # 检查是否有文件引用
    if ([Windows.Forms.Clipboard]::ContainsFileDropList()) {
      $files = [Windows.Forms.Clipboard]::GetFileDropList();
      if ($files.Count -gt 0) {
        $file = $files[0];
        $ext = [System.IO.Path]::GetExtension($file).ToLower();
        $validExts = @('.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp');
        if ($validExts -contains $ext) {
          Copy-Item $file '${tmpFile.replace(/\\/g, '\\\\')}';
          Write-Output 'file';
          exit;
        } else {
          Write-Output ('error: not_image:' + $ext);
          exit;
        }
      }
    }

    # 检查是否有文本
    if ([Windows.Forms.Clipboard]::ContainsText()) {
      Write-Output 'text';
      exit;
    }

    Write-Output 'error: empty';
  `;

  let result: string;
  try {
    result = execSync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"')}"`, {
      stdio: 'pipe',
      encoding: 'utf8',
    }).trim();
  } catch {
    throw new Error('无法访问剪贴板');
  }

  if (result === 'text') {
    // 兼容：文本可能是图片文件路径
    let text = '';
    try {
      text = execSync(
        `powershell -NoProfile -Command "[Windows.Forms.Clipboard]::GetText()"`,
        { stdio: 'pipe', encoding: 'utf8' }
      ).trim();
    } catch { /* ignore */ }

    const resolvedPath = tryTextAsFilePath(text, tmpFile);
    if (resolvedPath) {
      console.log(`✓ 剪贴板文本为图片路径，已读取: ${resolvedPath}`);
      return;
    }

    const preview = text.length > 50 ? text.slice(0, 50) + '...' : text;
    throw new Error(`剪贴板中是文本内容，不是图片（内容: "${preview}"）`);
  }

  if (result.startsWith('error:')) {
    const detail = result.substring(6);
    if (detail === 'empty') throw new Error('剪贴板中没有可识别的内容，请先截图或复制图片');
    if (detail.startsWith('not_image:')) throw new Error(`剪贴板中的文件不是图片格式 (${detail.substring(10)})，请复制图片文件或截图`);
    throw new Error('剪贴板中没有可识别的图片');
  }
}

/** Linux: 优先读图像数据，fallback 读文件 URI */
function readClipboardImageLinux(tmpFile: string): void {
  // 尝试读取图像数据
  const imageMimeTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/bmp', 'image/gif'];

  let imageData: Buffer | null = null;
  const cmd = process.env.WAYLAND_DISPLAY ? 'wl-paste' : 'xclip';

  if (cmd === 'wl-paste') {
    for (const mime of imageMimeTypes) {
      try {
        imageData = execSync(`wl-paste -t ${mime}`, { stdio: 'pipe', encoding: 'buffer' });
        if (imageData.length > 0) break;
      } catch { /* try next */ }
    }
  } else {
    for (const mime of imageMimeTypes) {
      try {
        imageData = execSync(`xclip -selection clipboard -t ${mime} -o`, { stdio: 'pipe', encoding: 'buffer' });
        if (imageData.length > 0) break;
      } catch { /* try next */ }
    }
  }

  if (imageData && imageData.length > 0) {
    fs.writeFileSync(tmpFile, imageData);
    return;
  }

  // 尝试读取文件 URI 列表
  try {
    let uriData: string;
    if (cmd === 'wl-paste') {
      uriData = execSync('wl-paste -t text/uri-list', { stdio: 'pipe', encoding: 'utf8' });
    } else {
      uriData = execSync('xclip -selection clipboard -t text/uri-list -o', { stdio: 'pipe', encoding: 'utf8' });
    }

    const uris = uriData.trim().split('\n').filter(u => u.startsWith('file://'));
    if (uris.length > 0) {
      const filePath = decodeURIComponent(uris[0].replace('file://', ''));
      if (!fs.existsSync(filePath)) {
        throw new Error(`剪贴板中的文件不存在: ${filePath}`);
      }
      const ext = path.extname(filePath).toLowerCase();
      if (!IMAGE_EXTENSIONS.includes(ext)) {
        throw new Error(`剪贴板中的文件不是图片格式 (${ext})，请复制图片文件或截图`);
      }
      fs.copyFileSync(filePath, tmpFile);
      return;
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('剪贴板中')) throw e;
  }

  // 检测是否有文本
  try {
    let text: string;
    if (cmd === 'wl-paste') {
      text = execSync('wl-paste -t text/plain', { stdio: 'pipe', encoding: 'utf8' });
    } else {
      text = execSync('xclip -selection clipboard -o', { stdio: 'pipe', encoding: 'utf8' });
    }
    const trimmed = text.trim();
    if (trimmed.length > 0) {
      // 兼容：文本可能是图片文件路径
      const resolvedPath = tryTextAsFilePath(trimmed, tmpFile);
      if (resolvedPath) {
        console.log(`✓ 剪贴板文本为图片路径，已读取: ${resolvedPath}`);
        return;
      }

      const preview = trimmed.length > 50 ? trimmed.slice(0, 50) + '...' : trimmed;
      throw new Error(`剪贴板中是文本内容，不是图片（内容: "${preview}"）`);
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('剪贴板中')) throw e;
  }

  throw new Error('剪贴板中没有可识别的内容，请先截图或复制图片（Linux 需要安装 wl-clipboard 或 xclip）');
}

// ============ 图片处理 ============

/**
 * 高精度抠图：通过 Python 子进程调用 rembg + birefnet-general 模型。
 * 需要用户已安装 `pip install rembg onnxruntime click filetype asyncer watchdog aiohttp`。
 * 首次运行会下载模型（约 973MB），之后本地缓存。
 * 耗时：Intel Mac CPU 约 2-3 分钟/张。
 */
async function removeBackgroundHd(imagePath: string): Promise<string> {
  // HEIC 需先转 JPG（rembg 不支持 HEIC）
  let inputPath = imagePath;
  const ext = path.extname(imagePath).toLowerCase();
  const tmpDir = path.join(os.tmpdir(), 'meme-cli-hd');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  if (ext === '.heic' || ext === '.heif') {
    const converted = path.join(tmpDir, `${path.basename(imagePath, ext)}.jpg`);
    try {
      execSync(`sips -s format jpeg "${imagePath}" --out "${converted}"`, { stdio: 'pipe' });
      inputPath = converted;
    } catch {
      throw new Error('HEIC 转换失败，请安装 macOS 自带工具 sips 或先手动转为 JPG');
    }
  }

  const outputPath = path.join(tmpDir, `${path.basename(inputPath, path.extname(inputPath))}_hd.png`);
  const pyScript = path.join(tmpDir, 'rembg_hd.py');
  const pyCode = `import sys, time
from rembg import remove, new_session
input_path, output_path, model_name = sys.argv[1], sys.argv[2], sys.argv[3]
t0 = time.time()
session = new_session(model_name=model_name)
with open(input_path, "rb") as f:
    data = f.read()
out = remove(data, session=session)
with open(output_path, "wb") as f:
    f.write(out)
print(f"[rembg-hd] done in {time.time()-t0:.1f}s", file=sys.stderr)
`;

  fs.writeFileSync(pyScript, pyCode);

  // 查找 python3
  let pythonBin = 'python3';
  try {
    execSync(`${pythonBin} -c "import rembg"`, { stdio: 'pipe' });
  } catch {
    // 尝试用户安装路径
    const userPy = path.join(os.homedir(), 'Library/Python/3.9/bin/python3');
    try {
      execSync(`test -x "${userPy}"`, { stdio: 'pipe' });
      pythonBin = userPy;
    } catch {
      throw new Error(
        '未找到 rembg Python 模块。请先安装：\n' +
        '  pip3 install rembg onnxruntime click filetype asyncer watchdog aiohttp --user\n' +
        '首次使用 --hd 会下载模型（约 973MB）。'
      );
    }
  }

  try {
    execSync(
      `"${pythonBin}" "${pyScript}" "${inputPath}" "${outputPath}" birefnet-general`,
      { stdio: 'inherit' }
    );
  } catch {
    throw new Error('rembg 抠图失败，请检查 Python 环境和 rembg 安装');
  }

  // 读取结果为 dataUrl
  const buffer = fs.readFileSync(outputPath);
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

async function imageToBlob(imagePath: string): Promise<Blob> {
  const buffer = fs.readFileSync(imagePath);
  const ext = path.extname(imagePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
  };
  return new Blob([buffer], { type: mimeMap[ext] || 'image/png' });
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const buffer = Buffer.from(await blob.arrayBuffer());
  const mime = blob.type || 'image/png';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

// ============ Canvas 渲染（适配 @napi-rs/canvas） ============

function findSubjectBounds(img: { width: number; height: number }, canvas: import('@napi-rs/canvas').Canvas): { left: number; top: number; right: number; bottom: number } | null {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const w = canvas.width;
  const h = canvas.height;

  let left = w, top = h, right = 0, bottom = 0;
  let hasPixel = false;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const alpha = data[(y * w + x) * 4 + 3];
      if (alpha > 10) {
        hasPixel = true;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }

  return hasPixel ? { left, top, right, bottom } : null;
}

function cropToSubject(
  imgCanvas: import('@napi-rs/canvas').Canvas,
  bounds: { left: number; top: number; right: number; bottom: number }
): { canvas: import('@napi-rs/canvas').Canvas; subjectW: number; subjectH: number } {
  const subjectW = bounds.right - bounds.left + 1;
  const subjectH = bounds.bottom - bounds.top + 1;

  const canvas = createCanvas(subjectW, subjectH);
  const ctx = canvas.getContext('2d');

  ctx.drawImage(
    imgCanvas as any,
    bounds.left, bounds.top, subjectW, subjectH,
    0, 0, subjectW, subjectH
  );

  return { canvas, subjectW, subjectH };
}

function dilateAlpha(
  alpha: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(alpha);
  for (let pass = 0; pass < radius; pass++) {
    const src = new Uint8ClampedArray(result);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let maxVal = src[y * w + x];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              maxVal = Math.max(maxVal, src[ny * w + nx]);
            }
          }
        }
        result[y * w + x] = maxVal;
      }
    }
  }
  return result;
}

function drawStrokeOnSubject(
  subjectCanvas: import('@napi-rs/canvas').Canvas,
  subjectW: number,
  subjectH: number,
  strokeWidth: number
): import('@napi-rs/canvas').Canvas {
  const w = subjectW + STROKE_PADDING * 2;
  const h = subjectH + STROKE_PADDING * 2;

  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');

  const sx = STROKE_PADDING;
  const sy = STROKE_PADDING;
  ctx.drawImage(subjectCanvas as any, sx, sy, subjectW, subjectH);

  const imageData = ctx.getImageData(0, 0, w, h);
  const alphaData = new Uint8ClampedArray(w * h);
  for (let i = 0; i < imageData.data.length; i += 4) {
    alphaData[i / 4] = imageData.data[i + 3];
  }

  const dilated = dilateAlpha(alphaData, w, h, strokeWidth);

  const strokeData = ctx.createImageData(w, h);
  for (let i = 0; i < dilated.length; i++) {
    if (dilated[i] > 0) {
      const idx = i * 4;
      strokeData.data[idx] = 255;
      strokeData.data[idx + 1] = 255;
      strokeData.data[idx + 2] = 255;
      strokeData.data[idx + 3] = dilated[i];
    }
  }

  ctx.putImageData(strokeData, 0, 0);
  ctx.drawImage(subjectCanvas as any, sx, sy, subjectW, subjectH);

  return canvas;
}

function wrapText(
  ctx: import('@napi-rs/canvas').SKRSContext2D,
  text: string,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  const paragraphs = text.split('\n');
  for (const para of paragraphs) {
    const chars = para.split('');
    let currentLine = '';
    for (const char of chars) {
      const testLine = currentLine + char;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = char;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
  }
  return lines;
}

function drawCloudBubble(
  ctx: import('@napi-rs/canvas').SKRSContext2D,
  bx: number, by: number, bw: number, bh: number, bumpR: number
) {
  const cx = bx + bw / 2;
  const cy = by + bh / 2;
  const halfW = bw / 2;
  const halfH = bh / 2;

  const bump = bumpR * 0.8;
  const corners = bumpR * 0.6;

  ctx.beginPath();

  // 左上角 → 顶部（两个凸起）
  ctx.moveTo(bx + corners, by);
  ctx.quadraticCurveTo(cx - halfW * 0.6, by - bump, cx - halfW * 0.2, by - bump * 0.3);
  ctx.quadraticCurveTo(cx, by - bump * 1.2, cx + halfW * 0.2, by - bump * 0.3);
  ctx.quadraticCurveTo(cx + halfW * 0.6, by - bump, bx + bw - corners, by);

  // 右上角圆角
  ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + corners);

  // 右侧（单凸起）
  ctx.quadraticCurveTo(bx + bw + bump * 0.5, cy, bx + bw, by + bh - corners);

  // 右下角圆角
  ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - corners, by + bh);

  // 底部（两个凸起）
  ctx.quadraticCurveTo(cx + halfW * 0.6, by + bh + bump, cx + halfW * 0.2, by + bh + bump * 0.3);
  ctx.quadraticCurveTo(cx, by + bh + bump * 1.2, cx - halfW * 0.2, by + bh + bump * 0.3);
  ctx.quadraticCurveTo(cx - halfW * 0.6, by + bh + bump, bx + corners, by + bh);

  // 左下角圆角
  ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - corners);

  // 左侧（单凸起）
  ctx.quadraticCurveTo(bx - bump * 0.5, cy, bx, by + corners);

  ctx.closePath();
}

function drawCaption(
  ctx: import('@napi-rs/canvas').SKRSContext2D,
  text: string,
  fontFamily: string,
  fontSize: number,
  color: string,
  posX: number,
  posY: number,
  canvasW: number,
  canvasH: number,
  captionBgColor: string
) {
  if (!text.trim()) return;

  ctx.font = `bold ${fontSize}px ${fontFamily}, "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const maxWidth = canvasW - TEXT_PADDING * 2;
  const lines = wrapText(ctx, text, maxWidth);
  const lineHeight = fontSize * 1.3;
  const totalHeight = lines.length * lineHeight;

  const centerX = posX * canvasW;
  let centerY = posY * canvasH;

  const halfH = totalHeight / 2;
  if (centerY - halfH < TEXT_PADDING) centerY = halfH + TEXT_PADDING;
  if (centerY + halfH > canvasH - TEXT_PADDING) centerY = canvasH - TEXT_PADDING - halfH;

  let maxLineW = 0;
  lines.forEach((line) => {
    const m = ctx.measureText(line);
    if (m.width > maxLineW) maxLineW = m.width;
  });

  const bgPaddingX = fontSize * 0.15;
  const bgPaddingY = fontSize * 0.08;
  const bgW = maxLineW + bgPaddingX * 2;
  const bgH = totalHeight + bgPaddingY * 2;
  const bgX = centerX - bgW / 2;
  const bgY = centerY - bgH / 2;

  if (captionBgColor !== 'transparent') {
    ctx.save();
    drawCloudBubble(ctx, bgX, bgY, bgW, bgH, fontSize * 0.4);
    ctx.fillStyle = captionBgColor;
    ctx.fill();
    ctx.restore();
  }

  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = Math.max(fontSize * 0.08, 3);
  ctx.lineJoin = 'round';

  const firstLineOffset = (lines.length - 1) * lineHeight / 2;

  lines.forEach((line, i) => {
    const y = centerY + i * lineHeight - firstLineOffset;
    ctx.strokeText(line, centerX, y);
    ctx.fillText(line, centerX, y);
  });
}

async function renderBaseImage(fgImageUrl: string): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = await loadImage(fgImageUrl);

  const tempCanvas = createCanvas(img.width, img.height);
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.drawImage(img, 0, 0);

  const bounds = findSubjectBounds(img, tempCanvas);
  if (!bounds) {
    const canvas = createCanvas(200, 200);
    return { dataUrl: await canvas.toDataURL('image/png'), width: 200, height: 200 };
  }

  const { canvas: subjectCanvas, subjectW, subjectH } = cropToSubject(tempCanvas, bounds);

  const strokeWidth = Math.max(Math.round(Math.max(subjectW, subjectH) * 0.02), 2);
  const strokedCanvas = drawStrokeOnSubject(subjectCanvas, subjectW, subjectH, strokeWidth);

  // 大图下采样到最大宽度，避免输出过大且字号失真
  let finalCanvas = strokedCanvas;
  if (strokedCanvas.width > MAX_CANVAS_W) {
    const ratio = MAX_CANVAS_W / strokedCanvas.width;
    const w = MAX_CANVAS_W;
    const h = Math.round(strokedCanvas.height * ratio);
    finalCanvas = createCanvas(w, h);
    const fctx = finalCanvas.getContext('2d');
    fctx.drawImage(strokedCanvas as any, 0, 0, w, h);
  }

  const dataUrl = await finalCanvas.toDataURL('image/png');
  return { dataUrl, width: finalCanvas.width, height: finalCanvas.height };
}

async function renderMeme(
  baseImageUrl: string,
  baseWidth: number,
  baseHeight: number,
  captionText: string,
  fontFamily: string,
  captionFontSize: number,
  captionColor: string,
  captionPositionX: number,
  captionPositionY: number,
  backgroundColor: string,
  textPlacement: string,
  captionBgColor: string
): Promise<string> {
  // 字号按画布宽度自适应缩放（基准 1080）
  const actualFontSize = captionFontSize * (baseWidth / BASE_W);

  let textAreaH = 0;
  if (captionText.trim()) {
    const tempCanvas = createCanvas(baseWidth, 1);
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.font = `bold ${actualFontSize}px ${fontFamily}`;
    const lines = wrapText(tempCtx, captionText, baseWidth - TEXT_PADDING * 2);
    textAreaH = lines.length * actualFontSize * 1.3 + TEXT_PADDING * 2;
  }

  const isBelow = textPlacement === 'below' && textAreaH > 0;
  const canvasW = baseWidth;
  const canvasH = isBelow ? baseHeight + TEXT_GAP + textAreaH : baseHeight;

  const canvas = createCanvas(canvasW, canvasH);
  const ctx = canvas.getContext('2d');

  // 填充背景色
  if (backgroundColor !== 'transparent') {
    if (backgroundColor === 'gradient-pink') {
      const gradient = ctx.createLinearGradient(0, 0, 0, canvasH);
      gradient.addColorStop(0, '#F8E8E8');
      gradient.addColorStop(1, '#FFD1D1');
      ctx.fillStyle = gradient;
    } else {
      ctx.fillStyle = backgroundColor;
    }
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  // 绘制基础图
  const baseImage = await loadImage(baseImageUrl);
  ctx.drawImage(baseImage, 0, 0, baseWidth, baseHeight);

  // 绘制文字
  if (captionText.trim()) {
    if (isBelow) {
      const normY = (baseHeight + TEXT_GAP + textAreaH / 2) / canvasH;
      drawCaption(
        ctx, captionText, fontFamily, actualFontSize, captionColor,
        captionPositionX, normY, canvasW, canvasH, captionBgColor
      );
    } else {
      drawCaption(
        ctx, captionText, fontFamily, actualFontSize, captionColor,
        captionPositionX, captionPositionY, canvasW, canvasH, captionBgColor
      );
    }
  }

  return canvas.toDataURL('image/png');
}

// ============ 主处理流程 ============

async function processImage(imagePath: string, caption: string, options: CliOptions): Promise<string> {
  const imageName = path.basename(imagePath, path.extname(imagePath));
  const fontFamily = FONT_FAMILIES[options.style] || FONT_FAMILIES.zhanku;

  console.log(`  处理: ${imagePath}`);

  // 1. 读取图片并去除背景
  console.log('    → AI 抠图中...');
  let removedBgDataUrl: string;

  if (options.hd) {
    console.log('    （高精度模式 birefnet，预计 2-3 分钟）');
    removedBgDataUrl = await removeBackgroundHd(imagePath);
  } else {
    const imageBlob = await imageToBlob(imagePath);
    const removedBgBlob = await removeBackground(imageBlob, {
      model: 'medium',
      output: { format: 'image/png' },
    });
    removedBgDataUrl = await blobToDataUrl(removedBgBlob);
  }

  // 2. 渲染基础图（裁剪 + 描边）
  console.log('    → 渲染基础图...');
  const { dataUrl: baseDataUrl, width: baseWidth, height: baseHeight } = await renderBaseImage(removedBgDataUrl);

  // 3. 渲染完整表情包
  console.log('    → 渲染表情包...');
  const memeDataUrl = await renderMeme(
    baseDataUrl, baseWidth, baseHeight,
    caption, fontFamily, options.fontSize,
    options.textColor, options.textX, options.textY,
    options.bgColor, options.textPlacement, options.textBgColor
  );

  // 4. 保存输出
  const outputDir = path.resolve(options.output);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, `${imageName}_meme.png`);
  const base64Data = memeDataUrl.split(',')[1];
  fs.writeFileSync(outputPath, Buffer.from(base64Data, 'base64'));
  console.log(`    ✓ 已保存: ${outputPath}`);

  return outputPath;
}

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  // 注册字体（自动适配项目目录和 skill 目录）
  const root = path.resolve(__dirname, '..');
  for (const [style, fontRelPath] of Object.entries(FONT_PATHS)) {
    let fullPath = path.join(root, fontRelPath);
    if (fs.existsSync(fullPath)) {
      GlobalFonts.registerFromPath(fullPath, FONT_FAMILIES[style]);
      console.log(`✓ 已注册字体: ${FONT_FAMILIES[style]}`);
    } else {
      console.warn(`⚠ 字体文件未找到: ${fullPath}`);
    }
  }

  // 剪贴板模式
  if (options.clipboard) {
    if (options.image) {
      console.error('错误: --clipboard 与 --image 不能同时使用');
      process.exit(1);
    }

    try {
      options.image = readClipboardImage();
    } catch (err) {
      console.error(`错误: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  }

  // 单张模式
  if (!options.image) {
    console.error('错误: 需要 --image 参数或 --clipboard 参数');
    console.error('使用 --help 查看帮助');
    process.exit(1);
  }

  if (!options.caption) {
    console.error('错误: 需要 --caption 参数');
    process.exit(1);
  }

  const imagePath = path.resolve(options.image);
  if (!fs.existsSync(imagePath)) {
    console.error(`错误: 图片文件不存在: ${imagePath}`);
    process.exit(1);
  }

  console.log('\n开始处理...\n');
  try {
    await processImage(imagePath, options.caption, options);
    console.log(`\n✓ 完成！`);
  } catch (err) {
    console.error(`\n✗ 处理失败: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

main();