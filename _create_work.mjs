import fs from 'node:fs';

const home = process.env.HOME;
const tok = JSON.parse(fs.readFileSync(home + '/.tks-edu/oauth-token.json', 'utf8'));
const token = tok.access_token;
const base = (process.env.EDU_API_BASE || 'https://edu.tksai.com/app-api').replace(/\/+$/, '');

const CONTENT = 'https://tksai.oss-cn-hangzhou.aliyuncs.com/WebPage/PLAT/2026/11/02/cb8c4cf258/3D地球仪.html';
const COVER = 'https://tksai.oss-cn-hangzhou.aliyuncs.com/cover/2026/11/02/d61b632fed/A_stunning_3D_Earth_globe_floa_2026-11-02T09-03-43.png';

// 复刻 EduMcpTools.createWork 的字段映射
const data = {
  name: '旋转地球仪',
  productType: 2, // app
  introduction: '拖动转动地球仪，点击球面读出经纬度，切换昼夜光照还能看到晨昏线和极昼极夜。',
  picUrl: COVER,
  sliderPicUrls: [COVER],
  price: Math.round(0 * 100),       // 在线使用 0 元（免费）
  costPrice: Math.round(9.9 * 100),  // 下载 9.9 元
  visibilityScope: 1,                // 公开
  type: 'html',
  previewUrl: CONTENT,
  extension: {
    type: 'html',
    url: CONTENT,
    subjects: ['7'],                                   // 地理
    grades: ['高中必修1', '高中必修2', '高中必修3'],
    materials: ['1'],                                  // 人教版
    units: ['所有单元'],
    labes: ['地理', '经纬网', '地球自转', '晨昏线', '3D地球仪'],
  },
};

const res = await fetch(`${base}/product/spu/create`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    terminal: '20',
  },
  body: JSON.stringify(data),
});
const text = await res.text();
console.log('HTTP', res.status);
console.log('BODY', text.slice(0, 1000));
try {
  const j = JSON.parse(text);
  if (j.code === 0) {
    console.log('CREATE OK id =', j.data && (j.data.id ?? j.data));
  } else {
    console.log('CREATE FAIL msg =', j.msg);
  }
} catch (e) {
  console.log('parse fail', e.message);
}
