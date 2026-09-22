# COMETS Creator Pay

COMETS Creator Pay 是面向网红/创作者的支付协作门户，覆盖账号注册、社媒认证、个人与收款档案、合同、Invoice 和收款进度。

## 技术栈

- React 19
- TypeScript
- Vite 6
- React Router
- Vitest

## 本地开发

```bash
pnpm install
pnpm dev -- --host 0.0.0.0 --port 4173 --strictPort
```

本地测试端：`http://localhost:4173`

## 验证

```bash
pnpm test
pnpm build
pnpm test:sites
```

`pnpm build` 会生成 Sites 兼容产物：

- `dist/client/index.html`
- `dist/server/index.js`
- `dist/.openai/hosting.json`

## 环境约定

- 本地测试端：`http://localhost:4173`
- Mac 用户端：`http://192.168.88.188:8772`
- 默认只修改本地测试端，明确要求“推送”后才更新 Mac 用户端。

## 数据与接口

当前使用类型化 service 接口和 `MockApiAdapter`。Mock 状态保存在浏览器 `localStorage`，后续接入真实后端时只需替换 service adapter。

合同先于 Invoice 创建。合同使用独立的“待签署 / 执行中 / 已过期”生命周期，不随 Invoice 审核或付款状态变化。创作者首页的“收款”只展示合同与 Invoice 项目名匹配的项目。

## 目录

- `src/`：应用源码与单元测试
- `public/`：合同、Invoice 和品牌静态资源
- `tests/`：Sites worker 测试
- `worker/`：Sites 运行入口
- `scripts/`：构建与本地服务脚本
- `deploy/`：Mac 用户端 8772 服务配置
- `AGENTS.md`：持续迭代时必须遵守的产品与原型决策
- `design-qa.md`：历史设计 QA 记录
