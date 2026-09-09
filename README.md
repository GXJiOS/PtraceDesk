# PtraceDesk

个人 macOS ptrace 工单工作台，使用 Tauri、React 和 TypeScript。支持工作台、工单列表、月历、甘特图、工单详情及原生指派通知，ptrace 集成为只读。

## 发给同事使用

分享 [GitHub 仓库](https://github.com/GXJiOS/PtraceDesk)：接收方获取源码后，在自己的 Mac 上构建、签名并安装 App。仓库包含安装脚本、源码和依赖锁文件，本机工单缓存、OAuth 凭据、测试截图、依赖目录和编译产物由 Git 忽略规则排除。

## 接收方安装

当前安装流程面向 Apple Silicon（M 系列）Mac，需要：

- Xcode 命令行工具：`xcode-select --install`。
- Node.js 20.19+（20.x）或 22.12+，以及 npm。
- Apple Silicon 原生 Rust/Cargo 工具链，建议使用当前 stable 版本。
- 可访问 npm、Rust 依赖仓库及 ptrace 服务的网络。

在终端获取项目并安装：

```bash
git clone https://github.com/GXJiOS/PtraceDesk.git
cd PtraceDesk
bash install.sh --check
bash install.sh
```

脚本安装锁定的 npm 依赖，构建并签名 App，验证签名后安装到 `/Applications/PtraceDesk.app`，然后启动。构建或签名失败时现有 App 保留，替换安装失败时恢复旧版。

首次启动时点击连接 ptrace，在浏览器中使用自己的账号完成授权，再选择自己的身份。每个人的授权、偏好和工单缓存保存在各自 Mac 上。需要指派通知时，允许系统通知权限。

安装目录没有写权限时，可以安装到自己的应用目录：

```bash
bash install.sh --destination "$HOME/Applications"
```

## 签名

安装脚本优先使用项目配置中且本机可用的签名证书，其次选择本机有效的 Apple Development 或 Developer ID Application 证书；没有证书时使用 ad-hoc 临时签名。这个流程不要求接收方购买 Apple 开发者账号。

签名覆盖只用于当次构建，各台 Mac 的证书独立选择。也可以明确指定：

```bash
SIGN_ID="本机证书的SHA-1" bash install.sh
SIGN_ID=- bash install.sh
```

临时签名重建后可能再次出现钥匙串授权提示。本机构建流程与 Apple 公证分发是两种交付方式；该脚本执行本地签名，正式直接分发预编译 App 时应另行配置 Developer ID 签名和公证。系统或公司设备管理策略仍可能要求额外授权。

## 更新与开发

在仓库目录拉取新版并重新安装：

```bash
git pull --ff-only
bash install.sh
```

应用使用同一 Bundle ID，用户数据继续保存在系统的应用数据目录和钥匙串中。当前更新方式为手动安装新版。

```bash
make check                         # 检查构建工具
make build                         # 安装依赖、构建并签名
make install                       # 构建、安装并启动
make package                       # 生成源码安装 ZIP
bash install.sh --build-only --skip-deps  # 复用本机已有 npm 依赖
bash install.sh --no-launch         # 安装后保持关闭
npm test                           # 运行测试
```

构建产物位于 `src-tauri/target/release/bundle/macos/PtraceDesk.app`。

需要离线传递源码时，`make package` 可生成 `distribution/PtraceDesk-source.zip`，接收方解压后执行同一安装脚本。
