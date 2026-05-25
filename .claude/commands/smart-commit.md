请帮我将当前所有未提交的改动智能上传到 git：

1. 先运行 `git status` 和 `git diff` 分析所有改动
2. 按功能模块或文件类型**分批**暂存和提交，不要一次性 `git add .`
3. 每个 commit 自动生成符合 Conventional Commits 规范的信息：
   - 格式：`<type>(<scope>): <中文描述>`
   - 根据改动内容智能判断 type（feat/fix/docs/chore 等）
4. 每次提交前告诉我本批包含哪些文件、准备用什么 message，**等我确认后再执行**
5. 全部完成后运行 `git push`
