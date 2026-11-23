const base3051 = 'http://127.0.0.1:3051';
const base3050 = 'http://127.0.0.1:3050';

async function test() {
  // Test backend directly (port 3051)
  console.log('=== 测试后端 3051 ===');
  const r1 = await fetch(`${base3051}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: 'test1',
      password: '123456',
      name: '测试1',
      school: '测试中学',
      subject: '数学'
    })
  });
  const d1 = await r1.json();
  console.log('Backend 3051 注册:', r1.status, JSON.stringify(d1));

  // Test via Next.js proxy (port 3050)
  console.log('\n=== 测试 Next.js 代理 3050 ===');
  const r2 = await fetch(`${base3050}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: 'test2',
      password: '123456',
      name: '测试2',
      school: '测试中学',
      subject: '英语'
    })
  });
  const d2 = await r2.json();
  console.log('Next 3050 注册:', r2.status, JSON.stringify(d2));

  // Test login
  console.log('\n=== 测试登录 ===');
  const r3 = await fetch(`${base3051}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'test1', password: '123456' })
  });
  const d3 = await r3.json();
  console.log('Backend 3051 登录:', r3.status, JSON.stringify(d3));
  const cookie = r3.headers.get('set-cookie');
  console.log('Cookie:', cookie ? cookie.substring(0, 60) + '...' : '无');

  // Test me endpoint
  console.log('\n=== 测试 /api/auth/me ===');
  const r4 = await fetch(`${base3051}/api/auth/me`, {
    headers: { cookie: cookie || '' }
  });
  const d4 = await r4.json();
  console.log('Backend 3051 me:', r4.status, JSON.stringify(d4));
}

test().catch(e => console.error('错误:', e));
