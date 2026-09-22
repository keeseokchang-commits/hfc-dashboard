// tests/_e2e_helpers.js — jsdom 기반 E2E 테스트 공용 유틸.
// 화면(HTML) 자체의 조작 순서·이벤트 발화까지 재현해야 잡히는 결함(예: 체크박스 상태 꼬임, 저장 버튼 비활성)을
// 검증하려면 순수 함수 테스트로는 부족하다. 이 파일은 로컬 정적 서버 + jsdom으로 실제 화면을 띄우는 공통 절차를 제공한다.
const { JSDOM } = require('jsdom');
const http = require('http');
const fs = require('fs');
const path = require('path');

// 정적 서버는 프로세스당 하나만 띄우고 재사용한다(연속 테스트 실행 시 포트 충돌 방지).
// portFor()는 이제 단순 호환용 — 실제로는 무시되고 공용 서버 포트가 쓰인다.
let _sharedServer = null, _sharedPort = null;
function portFor() { return 0; } // 호환 유지(반환값은 openPage에서 사용하지 않음)

function startStaticServer(root) {
  if (_sharedServer) return Promise.resolve({ server: _sharedServer, port: _sharedPort });
  const server = http.createServer((req, res) => {
    let p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    fs.readFile(p, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200); res.end(data);
    });
  });
  return new Promise(resolve => server.listen(0, () => { // 포트 0 = OS가 빈 포트 자동 할당(충돌 원천 차단)
    _sharedServer = server; _sharedPort = server.address().port;
    resolve({ server, port: _sharedPort });
  }));
}

// sheetData: { 'S04_REVENUE': [[header],[row1],...], ... } 형태로 fetch 스텁에 물릴 고정 응답.
// writeCapture: { S04: null, S05: null, ... } 형태 객체를 넘기면 PUT 바디를 해당 키에 기록(마지막 쓰기 기준).
async function openPage(root, _portIgnored, htmlFile, sheetData, opts = {}) {
  const { port } = await startStaticServer(root);
  const writeCapture = opts.writeCapture || {};
  const dom = await JSDOM.fromURL(`http://localhost:${port}/${htmlFile}`, {
    resources: 'usable', runScripts: 'dangerously',
    beforeParse(w) {
      w.confirm = opts.confirm || (() => true);
      w.HTMLElement.prototype.scrollIntoView = function () {};
      w.fetch = async (u, o) => {
        const us = String(u);
        if (o && o.method === 'PUT') {
          const key = Object.keys(sheetData).find(k => us.includes(k));
          if (key) writeCapture[key.replace(/_.*/, '')] = JSON.parse(o.body).values;
          return { ok: true, json: async () => ({}) };
        }
        if (o && o.method === 'POST') return { ok: true, json: async () => ({}) };
        const key = Object.keys(sheetData).find(k => us.includes(k));
        return { ok: true, json: async () => ({ values: key ? sheetData[key] : [[]] }) };
      };
      w.google = { accounts: { oauth2: { initTokenClient: () => ({ requestAccessToken() {} }) } } };
      if (opts.Chart) w.Chart = Object.assign(function () { return { destroy() {}, update() {} }; }, { register: () => {} });
    }
  });
  await new Promise(r => setTimeout(r, opts.waitMs || 1300));
  return { dom, writeCapture };
}

function closeSharedServer() {
  if (_sharedServer) { _sharedServer.close(); _sharedServer = null; }
}

module.exports = { portFor, openPage, closeSharedServer };
