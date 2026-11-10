# SENKIRO（センキロ）

> **Every line, a story.**

SENKIRO 是一个面向日本铁路的探索、换乘规划与旅行记录平台（線・記・路）。

## 当前阶段

**立项与原型实验阶段，尚无可用产品。** 本仓库目前只包含项目文档和若干独立原型实验（SENKIRO Lab），用于验证数据、领域模型与关键技术路线。

## 仓库结构

```
.
├── README.md              本文件
├── LICENSE                AGPL-3.0 全文
├── TRADEMARKS.md          名称与标识说明
├── docs/                  项目文档（索引见 docs/README.md）
│   ├── 00-shared-contract.md   原型阶段的共享契约
│   ├── plan-v0.1.md            开发规划（历史代号 Japan Railway Atlas）
│   ├── brand-v1.0.md           品牌命名与名称规范
│   └── lab-reports/            原型评审记录
└── labs/                  SENKIRO Lab 原型（见 labs/README.md）
```

## SENKIRO Lab

三个原型各在自己的分支和子目录中独立开发，完成并评审后通过 PR 合并进 `main`。

| 原型 | 内容 | 分支 | 目录 |
| --- | --- | --- | --- |
| A | 东京线路地图 | `lab/a-tokyo-atlas` | `labs/a-tokyo-atlas/` |
| B | JR 运价规则实验室 | `lab/b-fare` | `labs/b-fare/` |
| C | 新宿站 3D | `lab/c-shinjuku-3d` | `labs/c-shinjuku-3d/` |

共同约定见 [docs/00-shared-contract.md](docs/00-shared-contract.md)。

## 许可说明

1. **代码**按 AGPL-3.0-only 授权，全文见 [LICENSE](LICENSE)。
2. **数据**各自沿用其原始许可，详见各原型目录下的 `SOURCES.md`。代码许可证不覆盖数据。
3. **SENKIRO 名称与标识**不随代码许可授权，见 [TRADEMARKS.md](TRADEMARKS.md)。
4. 原型中的 **synthetic（合成）数据**不是真实票价、站内结构或运行信息，不可作为出行依据。

## 贡献

本项目计划在接受外部贡献前引入贡献者许可协议（CLA）。在此之前暂不接受代码贡献，欢迎提 issue。

---

## English summary

**SENKIRO** is a planned platform for exploring Japanese railways, planning transfers, and keeping travel records. Tagline: *Every line, a story.*

The project is at the **planning and prototype stage; there is no usable product yet.** This repository holds project documents and three independent prototypes (SENKIRO Lab): A) a Tokyo line map, B) a JR fare-rules lab, C) a 3D Shinjuku Station model. Each lives on its own `lab/*` branch and under `labs/`.

Licensing: code is AGPL-3.0-only; data keeps its original licenses (see each prototype's `SOURCES.md`; the code license does not cover data); the SENKIRO name and marks are not licensed with the code (see `TRADEMARKS.md`); synthetic data in prototypes is not real fare, station-layout, or operational information.

We plan to introduce a Contributor License Agreement (CLA) before accepting external contributions. Until then, code contributions are not accepted, but issues are welcome.
