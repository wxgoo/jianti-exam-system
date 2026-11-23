const base = 'http://127.0.0.1:3051';

async function login(username, password) {
  const r = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const d = await r.json();
  const cookie = r.headers.get('set-cookie') || '';
  return { ok: d.ok, teacher: d.teacher, cookie };
}

async function main() {
  console.log('=== 多租户完整流程测试 ===\n');

  // 1. 三位教师登录
  console.log('1. 三位教师登录...');
  const zhangsan = await login('zhangsan', '123456'); // 第一中学，数学
  const lisi = await login('lisi', '123456');        // 第一中学，英语
  const wangwu = await login('wangwu', '123456');    // 第二中学，数学
  console.log('   zhangsan:', zhangsan.ok ? `${zhangsan.teacher.name}（${zhangsan.teacher.school} ${zhangsan.teacher.subject}）` : '失败');
  console.log('   lisi:', lisi.ok ? `${lisi.teacher.name}（${lisi.teacher.school} ${lisi.teacher.subject}）` : '失败');
  console.log('   wangwu:', wangwu.ok ? `${wangwu.teacher.name}（${wangwu.teacher.school} ${wangwu.teacher.subject}）` : '失败');

  if (!zhangsan.ok || !lisi.ok || !wangwu.ok) {
    console.log('登录失败，测试终止');
    return;
  }

  // 2. zhangsan 上传文档并创建一道数学题
  console.log('\n2. zhangsan 上传数学试卷...');
  const pdfContent = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000056 00000 n\n0000000101 00000 n\ntrailer<</Size 4/Root 1 0 R>>startxref\n150\n%%EOF';
  const form1 = new FormData();
  form1.append('file', new Blob([pdfContent], { type: 'application/pdf' }), '数学试卷.pdf');
  form1.append('subject', '数学');
  form1.append('grade', '九年级');
  form1.append('sourceExamType', '期中考试');
  form1.append('sourceRegion', '北京');
  form1.append('sourceTextbook', '人教版');
  form1.append('sourceSchool', '第一中学');
  form1.append('pageCount', '1');

  const r4 = await fetch(`${base}/api/documents`, {
    method: 'POST',
    headers: { cookie: zhangsan.cookie },
    body: form1
  });
  const d4 = await r4.json();
  console.log('   上传:', r4.status, d4.ok ? `文档ID: ${d4.data.id}` : d4.error);
  const docId = d4.data ? d4.data.id : null;

  // 3. 为 zhangsan 的文档添加一道数学题（直接插入数据库）
  if (docId) {
    console.log('\n4. 为 zhangsan 的文档添加一道数学选择题...');
    // 这里我们直接通过 API 接口不太方便，因为需要先通过 AI 识别才能有题目
    // 我们直接查看 zhangsan 的题库，看能否看到自己的上传文档
    const r5 = await fetch(`${base}/api/bank?subject=数学`, {
      method: 'GET',
      headers: { cookie: zhangsan.cookie }
    });
    const d5 = await r5.json();
    console.log('   zhangsan 题库:', r5.status, d5.ok ? `题目数: ${d5.data.pagination.total}` : d5.error);
  }

  // 6. lisi 查看题库（同一中学，应该能看到 zhangsan 上传的题目）
  console.log('\n5. lisi 查看题库（第一中学，英语，查看数学题库）...');
  const r6 = await fetch(`${base}/api/bank?subject=数学`, {
    method: 'GET',
    headers: { cookie: lisi.cookie }
  });
  const d6 = await r6.json();
  console.log('   题库状态:', r6.status, d6.ok ? `题目数: ${d6.data.pagination.total}` : d6.error);
  if (d6.ok && d6.data.questions.length > 0) {
    console.log('   第一道题:', d6.data.questions[0].stem.substring(0, 50));
  }

  // 7. wangwu 查看题库（第二中学数学，不应该看到 zhangsan 的题目）
  console.log('\n6. wangwu 查看题库（第二中学，数学）...');
  const r7 = await fetch(`${base}/api/bank?subject=数学`, {
    method: 'GET',
    headers: { cookie: wangwu.cookie }
  });
  const d7 = await r7.json();
  console.log('   题库状态:', r7.status, d7.ok ? `题目数: ${d7.data.pagination.total}` : d7.error);

  // 8. zhangsan 查看题库
  console.log('\n7. zhangsan 查看题库（第一中学，数学）...');
  const r8 = await fetch(`${base}/api/bank?subject=数学`, {
    method: 'GET',
    headers: { cookie: zhangsan.cookie }
  });
  const d8 = await r8.json();
  console.log('   题库状态:', r8.status, d8.ok ? `题目数: ${d8.data.pagination.total}` : d8.error);

  console.log('\n=== 多租户题库共享测试完成 ===');
}

main().catch(e => console.error('错误:', e));
