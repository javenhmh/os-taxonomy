# Marble 技能分类体系

一个开放、结构化的**儿童小学阶段学习内容分类体系**——将儿童在小学阶段学习的内容拆解为细粒度的“微主题（micro-topics）”，构建前置依赖关系图，并与各国课程标准进行对应。由 [Marble](https://withmarble.com) 制作。

> **版本：** `v1` · **主题数：** 1,590 · **前置依赖关系：** 3,221 · **学科：** 8

## 查看

![分类体系作为旋转的 3D 图谱：每个点代表一个微主题，按学科着色，并通过前置依赖关系连接](media/curriculum-viz.gif)

每个点代表一个微主题，并按学科着色；高度代表年龄；每条连线代表一项前置依赖关系（[高质量完整视频](media/curriculum-viz.mp4)）。你可以在 [withmarble.com/curriculum](https://withmarble.com/curriculum) 中进行交互式探索——点击任意概念，即可追踪学习者在掌握该概念之前必须掌握的全部内容。

## 这是什么

大多数课程数据要么只是标准的扁平列表，要么被锁定在某个产品内部。而这个数据集则是一个**相互连接的学习图谱**：

- **1,590 个微主题**——每个微主题代表一个单一的、可教学的知识点（例如 *“构建句子”*、*“恒星的视星等”*），每个主题都包含通俗易懂的描述、掌握程度的**可观察证据（evidence）**标准、主题类型（概念 / 程序 / 表征 / 语言 / 元认知）、所属学科与领域，以及大致的适龄范围。

- **3,221 个前置依赖关系**——构成一个有向无环图：*“主题 X 依赖于前置主题 Y”*。每条关系都标记为 `hard` / `soft`，并附带一条简短的**原因（reason）**说明。

- **课程标准对应**——每个微主题都关联到其提炼所依据的课程标准（包括 NGSS、Common Core、英国国家课程等）。

- **领域集群**——针对每个（学科、领域、年龄段）组合，共提供 183 个适合家长阅读的一段式总结。

### 学科

| 学科 | 主题数 |
|---|---:|
| 科学 | 547 |
| 数学 | 503 |
| 英语 | 286 |
| 历史 | 90 |
| 个人与社会发展 | 88 |
| 生活技能 | 37 |
| 计算机 | 21 |
| 学会学习 | 18 |

## 文件

所有数据均以 UTF-8 JSON 格式存储于 [`data/`](data/) 中。JSON Schema 见 [`schema/`](schema/)，数据数量及 SHA-256 校验和见 [`manifest.json`](data/manifest.json)。

| 文件 | 内容 |
|---|---|
| [`data/topics.json`](data/topics.json) | 微主题（图谱**节点**）。 |
| [`data/dependencies.json`](data/dependencies.json) | 前置依赖关系**边**（`topicId` 依赖于 `prerequisiteId`）。 |
| [`data/curriculum-standards.json`](data/curriculum-standards.json) | 来源课程标准，按课程体系分组。 |
| [`data/clusters.json`](data/clusters.json) | 适合家长阅读的领域总结。 |
| [`data/manifest.json`](data/manifest.json) | 数据数量、各学科分布、各文件校验和。 |

### 一个主题

```json
{
  "id": "mt_N8CpN1EJrP",
  "type": "CONCEPTUAL",
  "subject": "English",
  "domain": "Grammar & Punctuation",
  "name": "Building sentences",
  "description": "Understand that words combine to make sentences — a sentence expresses a complete thought…",
  "ageRangeStart": 4,
  "ageRangeEnd": 6,
  "centrality": 0.257,
  "evidence": [
    "Distinguish between complete sentences and fragments",
    "Compose a complete sentence with a subject and verb"
  ],
  "assessmentPrompt": "If {{name}} says something like \"The dog\", can they tell you that's not a complete sentence…?",
  "standards": ["ccss-ela:L.K.1f", "uk-nc-2013:Eng.App2.Y1.Sent.1"]
}
````

* `id` — 稳定标识符（`mt_…`），由依赖关系以及相邻节点引用。
* `standards` — 对应 [`curriculum-standards.json`](data/curriculum-standards.json) 中的键（`"<curriculum-slug>:<code>"`）。
* `assessmentPrompt` — 针对该知识点的自然语言检查问题。其中包含 `{{name}}` 占位符（儿童姓名）；在展示之前应替换或移除该占位符。

### 一个依赖关系

```json
{ "topicId": "mt__00ZSLnB7p", "prerequisiteId": "mt_VBl1T1sFCM", "strength": "hard",
  "reason": "Must understand vibrations make sound before finding volume patterns" }
```

`topicId` **依赖于** `prerequisiteId`。将这条边反向，即可得到“解锁（unlocks）”关系。

## 使用方式

纯数据——没有运行时、没有依赖项。加载 JSON 后即可使用。

```js
import topics from './data/topics.json' with { type: 'json' };

import deps from './data/dependencies.json' with { type: 'json' };

const byId = new Map(topics.topics.map(t => [t.id, t]));

const prereqs = deps.dependencies
  .filter(d => d.topicId === 'mt_N8CpN1EJrP')
  .map(d => byId.get(d.prerequisiteId).name);
```

验证数据结构及引用完整性：

```bash
node scripts/validate.mjs
```

## 许可证

本数据集采用**多重许可证（multi-licensed）**——在使用或再分发之前，请阅读以下内容。

| 层级                                                                                                              | 许可证                                                                                                         |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **数据库**——包括数据集合、结构、ID、主题↔主题以及主题↔标准之间的关系                                                                         | [**ODbL 1.0**](LICENSE) — 可免费用于研究**和**商业用途，但必须进行**署名**，并遵循**相同方式共享（share-alike）**要求（衍生的*数据库*必须继续以 ODbL 开放）。 |
| **Marble 创作的文本内容**——主题的 `description` / `name` / `evidence` / `assessmentPrompt`、依赖关系的 `reason`、领域集群的 `summary` | [**CC BY-SA 4.0**](LICENSE-CONTENT) — 核心原则相同：署名 + 相同方式共享。                                                   |
| **`curriculum-standards.json`**——从第三方课程框架中提取的内容                                                                 | **不属于** Marble 可重新授权的内容。每个来源均受**其各自上游许可证**约束——详见 [**PROVENANCE.md**](PROVENANCE.md)。                        |

**为什么要求相同方式共享，同时仍然对商业使用友好：** ODbL 区分了*衍生数据库（derivative database）*与*产生作品（produced work）*：对分类体系进行扩展或修改，即构成衍生数据库，必须继续保持开放；而将其用于产品、模型或应用程序内部，则属于产生作品，该产品本身仍归你所有。因此，你可以基于本数据集构建商业产品，而无需将你的产品开源；你只需要将对**分类体系本身**所做的改进回馈开放。

### 署名

任何使用都必须注明：

> Marble Skill Taxonomy (v1) · © Generative Spark, Inc. (Marble) · [https://withmarble.com](https://withmarble.com) · licensed under ODbL 1.0 (database) and CC BY-SA 4.0 (content).

此外，对于使用的任何课程标准，还必须包含 [PROVENANCE.md](PROVENANCE.md) 中相应的上游版权及许可证声明。正式引用格式请参见 [CITATION.cff](CITATION.cff)。

## **这里没有什么**

本次发布明确排除了以下内容：语义嵌入（属于派生数据，可重新计算）以及任何按儿童 / 用户维度的数据（从未公开发布）。详见 [CHANGELOG.md](CHANGELOG.md)。
