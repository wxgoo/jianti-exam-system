const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const dbPath = 'C:/Users/anan/Documents/默认项目/jianti-exam-system/data/teacher-question-bank.sqlite3';
const db = new Database(dbPath);

console.log('=== 多租户题库共享数据测试 ===\n');

console.log('1. 查询教师信息...');
const zhangsan = db.prepare('SELECT * FROM teachers WHERE username = ?').get('zhangsan');
const lisi = db.prepare('SELECT * FROM teachers WHERE username = ?').get('lisi');
const wangwu = db.prepare('SELECT * FROM teachers WHERE username = ?').get('wangwu');

console.log('   zhangsan:', zhangsan ? zhangsan.name + '（' + zhangsan.school + ' ' + zhangsan.subject + '）' : '不存在');
console.log('   lisi:', lisi ? lisi.name + '（' + lisi.school + ' ' + lisi.subject + '）' : '不存在');
console.log('   wangwu:', wangwu ? wangwu.name + '（' + wangwu.school + ' ' + wangwu.subject + '）' : '不存在');

if (!zhangsan || !lisi || !wangwu) {
  console.log('教师不存在，请先注册');
  process.exit(1);
}

console.log('\n2. 为 zhangsan 创建文档...');
const docId = crypto.randomUUID();
db.prepare(`
  INSERT INTO documents (id, owner_id, name, mime_type, original_key, status, page_count,
    subject, grade, source_year, source_exam_type, source_region, source_textbook, source_school,
    school, checksum, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  docId,
  zhangsan.id,
  '数学期中试卷',
  'application/pdf',
  'documents/' + docId + '/original/数学试卷.pdf',
  'complete',
  1,
  '数学',
  '九年级',
  2024,
  '期中考试',
  '北京',
  '人教版',
  '第一中学',
  zhangsan.school,
  'test_checksum_123',
  new Date().toISOString(),
  new Date().toISOString()
);
console.log('   文档创建:', docId);

console.log('\n3. 添加数学选择题...');
const q1Id = crypto.randomUUID();
db.prepare(`
  INSERT INTO questions (id, document_id, number, type, stem, answer, difficulty, page_number, bbox_json, status, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  q1Id,
  docId,
  '1',
  'single',
  '已知函数 f(x) = x^2 + 2x + 1，求 f(3) 的值。',
  'A',
  'medium',
  1,
  JSON.stringify({x: 0, y: 0, width: 100, height: 10}),
  'approved',
  new Date().toISOString(),
  new Date().toISOString()
);
console.log('   题目创建:', q1Id, '- 已知函数 f(x) = x^2 + 2x + 1，求 f(3) 的值。');

console.log('\n4. lisi 查看数学题库（第一中学）...');
const lisiQuestions = db.prepare(`
  SELECT q.id, q.stem, q.type, q.number, d.name AS docName, d.school, d.owner_id
  FROM questions q
  JOIN documents d ON q.document_id = d.id
  WHERE q.status = 'approved'
    AND (d.owner_id = ? OR d.school = ?)
    AND d.subject = ?
  ORDER BY d.created_at DESC
  LIMIT 10
`).all(lisi.id, lisi.school, '数学');

console.log('   lisi 可见题目数:', lisiQuestions.length);
lisiQuestions.forEach(function(q) {
  console.log('   -', q.stem.substring(0, 40), '-', q.docName, '-', q.school, '- owner:', q.owner_id === zhangsan.id ? 'zhangsan' : q.owner_id);
});

console.log('\n6. wangwu 查看数学题库（第二中学）...');
const wangwuQuestions = db.prepare(`
  SELECT q.id, q.stem, q.type, q.number, d.name AS docName, d.school
  FROM questions q
  JOIN documents d ON q.document_id = d.id
  WHERE q.status = 'approved'
    AND (d.owner_id = ? OR d.school = ?)
    AND d.subject = ?
  ORDER BY d.created_at DESC
  LIMIT 10
`).all(wangwu.id, wangwu.school, '数学');

console.log('   wangwu 可见题目数:', wangwuQuestions.length);
wangwuQuestions.forEach(function(q) {
  console.log('   -', q.stem.substring(0, 40), '-', q.docName, '-', q.school);
});

console.log('\n7. zhangsan 查看数学题库（第一中学）...');
const zhangsanQuestions = db.prepare(`
  SELECT q.id, q.stem, q.type, q.number, d.name AS docName, d.school
  FROM questions q
  JOIN documents d ON q.document_id = d.id
  WHERE q.status = 'approved'
    AND (d.owner_id = ? OR d.school = ?)
    AND d.subject = ?
  ORDER BY d.created_at DESC
  LIMIT 10
`).all(zhangsan.id, zhangsan.school, '数学');

console.log('   zhangsan 可见题目数:', zhangsanQuestions.length);
zhangsanQuestions.forEach(function(q) {
  console.log('   -', q.stem.substring(0, 40), '-', q.docName, '-', q.school);
});

console.log('\n=== 验证结果 ===');
const lisiSeesZhangsan = lisiQuestions.some(function(q) { return q.id === q1Id; });
const wangwuSeesZhangsan = wangwuQuestions.some(function(q) { return q.id === q1Id; });
const zhangsanSeesOwn = zhangsanQuestions.some(function(q) { return q.id === q1Id; });

console.log('   lisi 看到 zhangsan 的题目:', lisiSeesZhangsan ? '是（同校共享）' : '否');
console.log('   wangwu 看到 zhangsan 的题目:', wangwuSeesZhangsan ? '是（跨校不应共享）' : '否（跨校隔离）');
console.log('   zhangsan 看到自己的题目:', zhangsanSeesOwn ? '是' : '否');

if (lisiSeesZhangsan && !wangwuSeesZhangsan && zhangsanSeesOwn) {
  console.log('\n多租户题库共享测试全部通过！');
} else {
  console.log('\n多租户题库共享测试失败！');
}

db.close();
