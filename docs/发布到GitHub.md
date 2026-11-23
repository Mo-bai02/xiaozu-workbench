# 把项目发布到 GitHub

从零开始，包含打包、提交、推送，以及以后怎么更新。

---

## 一、推送前先检查三件事

### 1. 密钥不能进仓库

项目根目录有个 `.env`，里面是模型 API Key。确认它在忽略列表里：

```powershell
cd "C:\Users\Mobai\Documents\deepseek-harness\default-workspace\ai-console"
type .gitignore | findstr /c:".env"
```

能匹配到 `.env` 就说明不会被提交。如果没有，手动在 `.gitignore` 里加一行 `.env`。

### 2. 数据库和上传文件不提交

`server/data/` 是你的真实数据（用户、任务、账目），`.gitignore` 里已经排除：

```
data/
*.db
*.db-wal
*.db-shm
```

仓库应该带上的是代码，不是数据。

### 3. 改过代码要先构建

```powershell
npm run build
```

`dist/` 已在忽略列表里（GitHub 不保存构建产物），但本地构建能提前发现错误，免得推上去的代码跑不起来。

---

## 二、在本地建立仓库

如果这个目录还不是 git 仓库：

```powershell
cd "C:\Users\Mobai\Documents\deepseek-harness\default-workspace\ai-console"
git init
git add -A
git commit -m "初始提交：小组工作台"
```

如果已经是仓库（之前提交过），直接跳到下一步。

先看一眼准备提交哪些文件，确认没有 `.env`、没有 `data/`：

```powershell
git status --short
```

---

## 三、在 GitHub 建仓库

1. 打开 <https://github.com/new>
2. **Repository name** 填 `ai-console`
3. 选 **Public**（公开）或 **Private**（私有）
4. **不要**勾选「Add a README」「Add .gitignore」「Choose a license」，本地已经有了，勾了会冲突
5. 点 **Create repository**

创建完页面会给你一个仓库地址，形如：

```
https://github.com/你的用户名/ai-console.git
```

---

## 四、关联远程仓库并推送

```powershell
git remote add origin https://github.com/你的用户名/ai-console.git
git branch -M main
git push -u origin main
```

第一次推送会要求登录。2021 年之后 GitHub 不再接受账号密码，需要用 **Personal Access Token**：

1. 打开 <https://github.com/settings/tokens> → **Generate new token (classic)**
2. Note 随便写，Expiration 选 90 天
3. 勾选 **repo** 这一整项
4. 生成后复制那串 `ghp_` 开头的字符（**只显示一次**）
5. 回到终端，用户名填 GitHub 用户名，密码粘贴这串 token

推送成功后刷新仓库页面，代码就上去了。

> 想避免每次输 token，可以配置凭据缓存：
> ```powershell
> git config --global credential.helper manager
> ```

---

## 五、把 README 和截图核对一遍

仓库首页显示的就是 `README.md`。确认：

- 顶部的截图路径能打开（`docs/images/...`）
- 快速开始里的命令和你的实际命令一致
- 使用说明链接有效：`docs/使用说明.md`

GitHub 会自动把 `.md` 渲染成网页，相对路径的图片能直接显示。

---

## 六、以后怎么更新

改完代码：

```powershell
git add -A
git commit -m "说明这次改了什么"
git push
```

只改了几个文件也可以单独指定：

```powershell
git add src/features/board
git commit -m "看板列顺序调整"
git push
```

---

## 七、常见报错

| 报错 | 原因 | 处理 |
|---|---|---|
| `Authentication failed` | 用了账号密码 | 改用 Personal Access Token |
| `remote origin already exists` | 之前加过远程地址 | 先 `git remote remove origin` 再加 |
| `failed to push some refs` / `rejected` | 远程有本地没有的提交（通常是建仓库时勾了 README） | 先 `git pull --rebase origin main` 再推 |
| `file is 105 MB` | 提交了大文件 | 检查是不是把 `data/` 或 `node_modules/` 提交了，从 `git add` 里排除 |
| `LF will be replaced by CRLF` | Windows 换行提示，不影响提交 | 可以忽略，或 `git config core.autocrlf true` |

---

## 八、如果密钥不小心提交了

1. 立刻去模型服务商后台**作废那个 Key**，重新生成
2. 把新 Key 写进本地 `.env`（这个文件永远不提交）
3. 用 `git rm --cached .env` 把它从版本控制里移除，再提交一次

历史提交里还能查到旧 Key，所以**第一步一定要先作废旧 Key**，改代码只是补救。

---

## 九、想做成在线可访问的版本

GitHub 只放代码，不会替你跑 Node 服务。要给别人一个链接，可以：

- 用 `docker build` 打包后在任意有公网 IP 的机器上跑（见 README「部署」）
- 或者本地跑 `start.bat`，用 cpolar 之类的工具做内网穿透（见 README「给别人用」）

两种情况都要注意：**对外开放前把 `.env` 里的 `ALLOW_REGISTER` 设成 0**，否则别人能注册并用你的 API Key 调用模型。
