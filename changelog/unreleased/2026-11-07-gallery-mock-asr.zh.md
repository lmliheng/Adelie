# 组件演示里也有语音输入了，四个接口不再漏在 mock 外面

- **日期：** 2026-11-07
- **类型：** fix
- **范围：** `ui-gallery`
- **破坏性：** 否

[English](2026-11-07-gallery-mock-asr.md)

组件演示（gallery）里的每一个页面都对着同一份内存里的演示数据跑，那套 mock 要回答 Web App 会调的
每一个接口——有一条用例逐个调用 `packages/web/src/api/endpoints.ts` 里的封装，缺一条就报出来。语音
输入随 0.6.5 进了 Web App，`getAsrConfig` / `putAsrConfig` / `testAsrConfig` / `asrTranscribe`
四个封装也在其中，而 mock 当时没有它们的路由：那一页在演示里点麦克风、点「测试连通性」都只会得到
`gallery_unmocked`，整包用例也因此红了。

现在四个接口都答：读取按服务端的样子**只报 `hasKey`**、不回密钥；保存把地址、模型写进演示数据，
密钥只要非空就记成「已存」；连通性检查按表单里那几个字段（缺省回落已存的）答 `ok` 与这次用的端点；
转写照实说这是演示的替身文字。演示数据里因此多一行已配好的语音模型，设置页打开就是填好的样子。

## 明细

- `packages/ui-gallery/src/app/mock/routes.ts`：四个路由，紧跟在 `/api/admin/settings` 之后
  （`endpoints.ts` 里也是这个顺序）；`asrEndpoint()` 照服务端 `asrWebSocketUrl` 的规则推出端点。
- `packages/ui-gallery/src/app/mock/fixtures.ts`：`DemoFixtures.asrConfig` 一行（默认网关地址、
  它那一个模型、`hasKey: true`），行按服务端 DTO（`AsrConfig`）标注，DTO 变了这里会先红。
