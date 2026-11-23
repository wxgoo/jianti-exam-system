import { searchShijuan, SHIJUAN1_SUBJECTS, SHIJUAN1_GRADES } from './server/services/shijuan1.ts';
console.log('subjects:', SHIJUAN1_SUBJECTS);
console.log('grades:', SHIJUAN1_GRADES);
try {
  const r = await searchShijuan('数学', '九年级');
  console.log('items:', r.items.length, 'pages:', r.pageCount);
  if (r.items[0]) console.log('first:', JSON.stringify(r.items[0], null, 2));
} catch (e) {
  console.error('ERROR:', e?.message, e?.cause);
}
