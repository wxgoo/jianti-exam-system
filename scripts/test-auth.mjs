const base = 'http://127.0.0.1:3051';

async function main() {
  console.log('=== 多租户完整测试 ===\n');

  // 1. 注册第一位教师（同一中学，数学）
  console.log('1. 注册教师 zhangsan（第一中学，数学）...');
  const r1 = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: 'zhangsan',
      password: '123456',
      name: '张三',
      school: '第一中学',
      subject: '数学'
    })
  });
  const d1 = await r1.json();
  console.log('   状态:', r1.status, d1.ok ? d1.teacher.role : d1.error);
  const cookie1 = r1.headers.get('set-cookie') || '';

  // 2. 注册第二位教师（同一中学，英语）
  console.log('\n2. 注册教师 lisi（第一中学，英语）...');
  const r2 = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: 'lisi',
      password: '123456',
      name: '李四',
      school: '第一中学',
      subject: '英语'
    })
  });
  const d2 = await r2.json();
  console.log('   状态:', r2.status, d2.ok ? d2.teacher.role : d2.error);

  // 3. 注册第三位教师（不同中学，数学）
  console.log('\n3. 注册教师 wangwu（第二中学，数学）...');
  const r3 = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: 'wangwu',
      password: '123456',
      name: '王五',
      school: '第二中学',
      subject: '数学'
    })
  });
  const d3 = await r3.json();
  console.log('   状态:', r3.status, d3.ok ? d3.teacher.role : d3.error);

  // 4. zhangsan 登录
  console.log('\n4. zhangsan 登录...');
  const r4 = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'zhangsan', password: '123456' })
  });
  const d4 = await r4.json();
  console.log('   状态:', r4.status, d4.ok ? d4.teacher.username : d4.error);
  const zhangsanCookie = r4.headers.get('set-cookie') || '';

  // 5. lisi 登录
  console.log('\n5. lisi 登录...');
  const r5 = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'lisi', password: '123456' })
  });
  const d5 = await r5.json();
  console.log('   状态:', r5.status, d5.ok ? d5.teacher.username : d5.error);
  const lisiCookie = r5.headers.get('set-cookie') || '';

  console.log('\n=== 多租户注册登录测试完成 ===');
}

main().catch(e => console.error('错误:', e));
