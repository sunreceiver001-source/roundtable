# 圆桌讨论（DeepSeek 版）

AI 多角色独立辩论工具，使用 DeepSeek API。

## 获取 DeepSeek API Key

1. 打开 platform.deepseek.com
2. 注册账号（国内手机号即可）
3. 进入「API Keys」→ 创建新 Key
4. 新账号有免费额度，够用很久

## 部署到 Vercel（3步）

1. 推到 GitHub：git init && git add . && git commit -m "init" && gh repo create roundtable --public --push
2. vercel.com → Import Git Repository → 选仓库 → Deploy
3. Settings → Environment Variables → 添加 DEEPSEEK_API_KEY=sk-xxxx → Redeploy

## 本地运行

npm install
echo "DEEPSEEK_API_KEY=sk-xxxx" > .env.local
npm run dev

## 和 Claude 版的区别

背景调研：Claude 版用真实 web search，DeepSeek 版用模型知识生成（标注「待核实」）
费用：deepseek-chat 约 1元/百万token，极便宜
注册：国内手机号即可 
