/**
 * JSX 사전 컴파일 — build-bo.py 가 호출한다.
 *
 * BO 는 원래 admin.html 이 JSX 19개(약 364KB)를 그대로 내려받아 브라우저에서
 * @babel/standalone 으로 매번 컴파일했다. 부팅할 때마다 babel 660KB(gzip)를 받고
 * 컴파일에 CPU 를 쓰느라, 현장 노트북에서는 이 준비에만 수 초가 걸렸다.
 * 빌드 때 한 번 컴파일해 두면 babel 자체가 필요 없어진다.
 *
 * 컴파일러는 브라우저가 쓰던 vendor/babel-standalone 을 그대로 쓴다. 결과물이
 * 지금까지 브라우저에서 만들어지던 것과 같아야 하기 때문이다.
 *
 * preset 은 react + env — babel-standalone 이 data-presets 없는 type="text/babel"
 * 스크립트에 실제로 적용하던 조합이다(브라우저에서 확인: `"use strict"; var f =
 * function f(x) {...}` 형태의 ES5 출력). react 만 쓰면 최신 문법이 그대로 남아
 * 지금 운영에서 돌던 코드와 달라지므로 맞춘다.
 *
 * 사용법: node precompile-jsx.js <babel-standalone.js> <file.jsx> [file.jsx ...]
 *   각 X.jsx 를 같은 자리에 X.js 로 쓴다. 원본 .jsx 는 지우지 않는다(호출부 담당).
 */
const fs = require("fs");
const path = require("path");

const [babelPath, ...files] = process.argv.slice(2);

if (!babelPath || files.length === 0) {
  console.error("usage: node precompile-jsx.js <babel-standalone.js> <file.jsx> ...");
  process.exit(2);
}

// babel-standalone 은 UMD — 브라우저 전역에 붙는 형태라 window 를 만들어 준다.
global.window = global;
global.self = global;

const mod = require(path.resolve(babelPath));
const Babel = mod && typeof mod.transform === "function" ? mod : global.Babel;

if (!Babel || typeof Babel.transform !== "function") {
  console.error("babel-standalone 을 불러오지 못했습니다: " + babelPath);
  process.exit(3);
}

let failed = 0;
for (const file of files) {
  try {
    const src = fs.readFileSync(file, "utf8");
    const out = Babel.transform(src, { presets: ["react", "env"], filename: file }).code;
    fs.writeFileSync(file.replace(/\.jsx$/, ".js"), out, "utf8");
  } catch (err) {
    console.error(`컴파일 실패 ${file}: ${err.message}`);
    failed += 1;
  }
}

if (failed) process.exit(1);
console.log(`precompiled ${files.length} jsx`);
