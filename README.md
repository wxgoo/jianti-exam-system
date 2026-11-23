# 拣题（教师题库助手）项目全局说明

架构：B/S（Next.js 16 前端 + NestJS 后端 + SQLite），多租户（学校+学科）。

核心模块：题库管理、试卷组卷、三格式导出（Word/PDF/LaTeX）、错题本、学生练习/考试、题目讲解、学习分析、学校模式作业批改、教师认证（多租户 v13）。

关键文档：
- USER_MANUAL.md（使用手册）
- teethTask.md（TeethTask 全球统一冠名标准方案）
- 评估-pdfmanage.md（pdf-manage 精华评估）

测试：npm test（280+ pass）。

启动：node scripts/run-local.mjs（端口 3050，后端 3051）。
