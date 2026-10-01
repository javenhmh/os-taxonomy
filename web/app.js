(() => {
  const STORAGE_KEY = 'os-taxonomy-learning-planner';
  const LANGUAGE_KEY = 'os-taxonomy-language';
  const DATA_PATHS = ['../data/topics.json', '../data/dependencies.json', '../data/clusters.json'];
  const SUBJECTS = [
    { key: 'Mathematics', primary: true },
    { key: 'English', primary: true },
    { key: 'Science', primary: true },
    { key: 'History' },
    { key: 'Computing' },
    { key: 'Life Skills' },
    { key: 'Personal & Social Development' },
    { key: 'Learning to Learn' }
  ];
  const localeBundles = window.OS_TAXONOMY_I18N || {};
  const topicTranslations = window.OS_TAXONOMY_TOPIC_ZH || {};
  const clusterTranslations = window.OS_TAXONOMY_CLUSTERS_ZH || {};
  const app = document.querySelector('#app');
  function detectLanguage() {
    try {
      const saved = localStorage.getItem(LANGUAGE_KEY);
      if (saved === 'en') return 'en';
      if (saved === 'zh-CN' && localeBundles['zh-CN']) return 'zh-CN';
      if (saved !== null) {
        try { localStorage.setItem(LANGUAGE_KEY, 'en'); } catch { /* Keep the fallback even if storage is unavailable. */ }
        return 'en';
      }
    } catch { /* Storage may be disabled; use the browser preference. */ }
    const preferences = navigator.languages?.length ? navigator.languages : [navigator.language];
    return localeBundles['zh-CN'] && preferences.some((language) => /^zh(?:-|$)/i.test(language || '')) ? 'zh-CN' : 'en';
  }
  const state = {
    language: detectLanguage(),
    data: null,
    loading: true,
    loadError: null,
    profile: null,
    view: 'home',
    selectedTopicId: null,
    selectedSubject: 'Mathematics',
    query: '',
    expandedDomains: new Set(),
    visibleCounts: new Map(),
    notice: '',
    storageAvailable: true
  };

  const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const translate = (key, values = {}) => {
    const message = localeBundles[state.language]?.ui?.[key] ?? localeBundles.en?.ui?.[key] ?? key;
    return message.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
  };
  const translateValue = (group, value) => localeBundles[state.language]?.[group]?.[value] ?? localeBundles.en?.[group]?.[value] ?? value ?? translate('其他');
  const subjectLabel = (subject) => translateValue('subjects', subject);
  const domainLabel = (domain) => translateValue('domains', domain);
  const statusLabel = (status) => translateValue('statuses', status);
  const typeLabel = (type) => translateValue('types', type);
  const clusterSummary = (cluster) => state.language === 'zh-CN'
    ? clusterTranslations[`${cluster.subject}|${cluster.domain}|${cluster.ageRangeStart}`] ?? cluster.summary
    : cluster.summary;
  const topicField = (topic, field) => {
    const localized = state.language === 'zh-CN' ? topicTranslations[topic.id]?.[field] : null;
    return localized ?? topic[field] ?? '';
  };
  const topicName = (topic) => topicField(topic, 'name');
  const topicDescription = (topic) => topicField(topic, 'description');
  const topicEvidence = (topic) => topicField(topic, 'evidence');
  const topicAssessmentPrompt = (topic) => topicField(topic, 'assessmentPrompt');
  const countText = (count, kind) => state.language === 'zh-CN'
    ? (kind === 'topic' ? `${count} 个知识点` : `${count} 项`)
    : `${count} ${kind === 'topic' ? (count === 1 ? 'topic' : 'topics') : (count === 1 ? 'item' : 'items')}`;
  const ageRangeLabel = (topic) => state.language === 'zh-CN'
    ? `${topic.ageRangeStart}–${topic.ageRangeEnd} 岁`
    : `Ages ${topic.ageRangeStart}–${topic.ageRangeEnd}`;
  function setLanguage(language) {
    state.language = language === 'zh-CN' && localeBundles['zh-CN'] ? 'zh-CN' : 'en';
    try { localStorage.setItem(LANGUAGE_KEY, state.language); } catch { /* Language remains active for this session. */ }
    document.documentElement.lang = state.language;
    document.title = localeBundles[state.language]?.title || localeBundles.en?.title || 'OS-Taxonomy Learning Planner';
    render();
  }
  function languageControl() {
    return `<div class="language-switch" role="group" aria-label="${escapeHTML(translate('语言'))}">
      <button class="language-option ${state.language === 'zh-CN' ? 'active' : ''}" data-language="zh-CN" type="button" aria-pressed="${state.language === 'zh-CN'}">中文</button>
      <button class="language-option ${state.language === 'en' ? 'active' : ''}" data-language="en" type="button" aria-pressed="${state.language === 'en'}">English</button>
    </div>`;
  }
  const topicStatus = (topicId) => state.profile?.mastery?.[topicId] || 'not_started';
  const visibleTopics = () => state.data?.topicsByAge.get(state.profile?.child?.age || 9) || [];

  function readProfile() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw);
      if (!saved || saved.version !== 1 || typeof saved !== 'object') return null;
      const age = Number(saved.child?.age);
      return {
        version: 1,
        child: { name: typeof saved.child?.name === 'string' ? saved.child.name : '', age: Number.isFinite(age) && age >= 4 && age <= 18 ? age : 9 },
        mastery: saved.mastery && typeof saved.mastery === 'object' && !Array.isArray(saved.mastery) ? saved.mastery : {},
        weeklyGoals: Array.isArray(saved.weeklyGoals) ? saved.weeklyGoals.filter((goal) => goal && typeof goal.topicId === 'string').slice(0, 3) : [],
        settings: { primarySubjects: ['Mathematics', 'English', 'Science'] }
      };
    } catch {
      state.storageAvailable = false;
      state.notice = '无法保存本地学习记录。';
      return null;
    }
  }

  function saveProfile() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.profile));
      state.storageAvailable = true;
      state.notice = '';
      return true;
    } catch {
      state.storageAvailable = false;
      state.notice = '无法保存本地学习记录。';
      return false;
    }
  }

  function buildData(topicsData, dependenciesData, clustersData) {
    const topics = Array.isArray(topicsData?.topics) ? topicsData.topics : [];
    const dependencies = Array.isArray(dependenciesData?.dependencies) ? dependenciesData.dependencies : [];
    const clusters = Array.isArray(clustersData?.clusters) ? clustersData.clusters : [];
    if (!topics.length) throw new Error('empty');
    const topicsById = new Map(topics.map((topic) => [topic.id, topic]));
    const prerequisitesByTopic = new Map();
    const unlocksByTopic = new Map();
    const topicsBySubject = new Map();
    const topicsByAge = new Map();
    for (const dependency of dependencies) {
      if (!topicsById.has(dependency.topicId) || !topicsById.has(dependency.prerequisiteId)) continue;
      if (!prerequisitesByTopic.has(dependency.topicId)) prerequisitesByTopic.set(dependency.topicId, []);
      if (!unlocksByTopic.has(dependency.prerequisiteId)) unlocksByTopic.set(dependency.prerequisiteId, []);
      prerequisitesByTopic.get(dependency.topicId).push(dependency);
      unlocksByTopic.get(dependency.prerequisiteId).push(dependency);
    }
    for (const topic of topics) {
      if (!topicsBySubject.has(topic.subject)) topicsBySubject.set(topic.subject, []);
      topicsBySubject.get(topic.subject).push(topic);
      for (let age = Number(topic.ageRangeStart); age <= Number(topic.ageRangeEnd); age += 1) {
        if (!Number.isFinite(age)) break;
        if (!topicsByAge.has(age)) topicsByAge.set(age, []);
        topicsByAge.get(age).push(topic);
      }
    }
    return { topics, dependencies, clusters, topicsById, prerequisitesByTopic, unlocksByTopic, topicsBySubject, topicsByAge };
  }

  function renderWelcome() {
    app.innerHTML = `<main class="welcome-screen">${languageControl()}<form class="welcome-card" id="profile-form">
      <div class="brand"><span class="brand-mark">OS</span><div><div class="brand-name">${translate('我的成长地图')}</div><div class="brand-caption">OS-Taxonomy · ${translate('学习规划')}</div></div></div>
      <p class="eyebrow">${translate('从好奇开始，慢慢长大')}</p>
      <h1>${translate('欢迎建立孩子的成长学习地图')}</h1>
      <p>${translate('从真实的学习知识地图出发，一起发现已经掌握的内容和下一步可以探索的方向。')}</p>
      ${!state.storageAvailable ? `<div class="notice">${translate('无法保存本地学习记录。你仍可继续使用本页面。')}</div>` : ''}
      <div class="form-field"><label for="child-name">${translate('孩子昵称')}</label><input id="child-name" name="name" maxlength="30" autocomplete="off" placeholder="${translate('怎么称呼孩子？')}" required></div>
      <div class="form-field"><label for="child-age">${translate('年龄')}</label><input id="child-age" name="age" type="number" min="4" max="18" value="9" required></div>
      <button class="button primary" type="submit">${translate('开始规划')}</button>
    </form></main>`;
    document.querySelector('#profile-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const name = String(form.get('name') || '').trim();
      const age = Number(form.get('age'));
      if (!name || !Number.isFinite(age) || age < 4 || age > 18) return;
      state.profile = { version: 1, child: { name, age }, mastery: {}, weeklyGoals: [], settings: { primarySubjects: ['Mathematics', 'English', 'Science'] } };
      saveProfile();
      state.view = 'home';
      render();
    });
    bindLanguageControls();
  }

  function getRecommendations() {
    const ageTopics = visibleTopics();
    const ageTopicIds = new Set(ageTopics.map((topic) => topic.id));
    const learningIds = new Set(Object.entries(state.profile.mastery).filter(([, status]) => status === 'learning').map(([id]) => id));
    const learningDescendants = new Set();
    for (const id of learningIds) {
      for (const edge of state.data.unlocksByTopic.get(id) || []) {
        if (ageTopicIds.has(edge.topicId)) learningDescendants.add(edge.topicId);
      }
    }
    const candidates = ageTopics.filter((topic) => topicStatus(topic.id) !== 'mastered').map((topic) => {
      const hard = (state.data.prerequisitesByTopic.get(topic.id) || []).filter((edge) => edge.strength === 'hard');
      const ready = hard.filter((edge) => topicStatus(edge.prerequisiteId) === 'mastered').length;
      return { topic, hardCount: hard.length, readyCount: ready, readyRatio: hard.length ? ready / hard.length : 1, linkedToLearning: learningDescendants.has(topic.id), primary: SUBJECTS.find((item) => item.key === topic.subject)?.primary || false };
    });
    let pool = candidates.filter((candidate) => candidate.readyCount === candidate.hardCount);
    if (!pool.length) {
      const bestRatio = Math.max(0, ...candidates.map((candidate) => candidate.readyRatio));
      pool = candidates.filter((candidate) => candidate.readyRatio === bestRatio || candidate.readyRatio >= 0.5);
    }
    pool.sort((a, b) => Number(b.linkedToLearning) - Number(a.linkedToLearning) || Number(b.primary) - Number(a.primary) || b.readyRatio - a.readyRatio || Number(b.topic.centrality || 0) - Number(a.topic.centrality || 0) || a.topic.name.localeCompare(b.topic.name));
    const chosen = [];
    const usedSubjects = new Set();
    const usedDomains = new Set();
    while (chosen.length < 3 && chosen.length < pool.length) {
      const next = pool.find((candidate) => !chosen.includes(candidate) && !usedSubjects.has(candidate.topic.subject))
        || pool.find((candidate) => !chosen.includes(candidate) && !usedDomains.has(`${candidate.topic.subject}|${candidate.topic.domain}`))
        || pool.find((candidate) => !chosen.includes(candidate));
      if (!next) break;
      chosen.push(next);
      usedSubjects.add(next.topic.subject);
      usedDomains.add(`${next.topic.subject}|${next.topic.domain}`);
    }
    return chosen.map((candidate, index) => {
      let reason;
      if (candidate.linkedToLearning) reason = '连接到正在学习的知识点';
      else if (candidate.hardCount === 0) reason = '适合当前年龄阶段，可以从这里开始';
      else if (candidate.readyCount === candidate.hardCount) reason = '必要前置知识已经掌握';
      else reason = '必要前置知识已掌握 {ready}/{total} 项，可先一起回顾';
      return { ...candidate, reason, reasonValues: { ready: candidate.readyCount, total: candidate.hardCount }, addWeeklySuffix: index === 2 && !candidate.linkedToLearning };
    });
  }

  function navButton(view, icon, label) {
    return `<button class="nav-button ${state.view === view ? 'active' : ''}" data-view="${view}" type="button"><span class="nav-icon" aria-hidden="true">${icon}</span><span>${translate(label)}</span></button>`;
  }

  function layout(content) {
    const name = escapeHTML(state.profile.child.name);
    const age = escapeHTML(state.profile.child.age);
    return `<div class="layout">
      <aside class="sidebar"><div class="brand"><span class="brand-mark">OS</span><div><div class="brand-name">${translate('我的成长地图')}</div><div class="brand-caption">OS-Taxonomy · ${translate('学习规划')}</div></div></div>
        <div class="nav-label">${translate('学习空间')}</div><nav class="nav-list">${navButton('home', '⌂', '我的成长')}${navButton('map', '⌘', '学习地图')}${navButton('plan', '▤', '本周计划')}${navButton('records', '◷', '成长记录')}</nav>
        <div class="sidebar-bottom"><strong>${name} · ${escapeHTML(state.profile.child.age)}${translate(' 岁')}</strong>${translate('每一步探索，都算数。')}</div>
      </aside>
      <main class="main"><div class="main-toolbar">${languageControl()}</div><div class="content">${state.notice ? `<div class="notice" role="status">${escapeHTML(translate(state.notice))}</div>` : ''}${content}</div></main>
      <nav class="mobile-nav" aria-label="${escapeHTML(translate('主导航'))}">${navButton('home', '⌂', '我的成长')}${navButton('map', '⌘', '学习地图')}${navButton('plan', '▤', '本周计划')}${navButton('records', '◷', '成长记录')}</nav>
    </div>`;
  }

  function pageHeading(title, eyebrow, subtitle = '') {
    return `<header class="page-heading"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1>${subtitle ? `<p class="subheading">${subtitle}</p>` : ''}</div><div class="profile-chip"><span class="avatar">${escapeHTML((state.profile.child.name || '孩').slice(0, 1))}</span><span>${escapeHTML(state.profile.child.name)} · ${escapeHTML(state.profile.child.age)}${translate(' 岁')}</span></div></header>`;
  }

  function renderRecommendations(compact = false) {
    const recommendations = getRecommendations();
    if (!recommendations.length) return `<p class="empty-note">${translate('当前年龄范围内的学习内容都已掌握，继续保持探索。')}</p>`;
    return `<div class="recommend-list">${recommendations.map(({ topic, reason, reasonValues, addWeeklySuffix }, index) => `<div class="recommend-item"><span class="number-pill">${index + 1}</span><div><div class="recommend-title">${escapeHTML(topicName(topic))}</div><div class="recommend-meta">${escapeHTML(subjectLabel(topic.subject))} · ${escapeHTML(domainLabel(topic.domain))} · ${escapeHTML(translate(reason, reasonValues))}${addWeeklySuffix ? escapeHTML(translate('，也适合作为本周探索主题')) : ''}</div></div>${compact ? `<button class="text-button" data-topic="${escapeHTML(topic.id)}" type="button">${translate('查看')}</button>` : `<button class="button" data-add-goal="${escapeHTML(topic.id)}" type="button" ${state.profile.weeklyGoals.some((goal) => goal.topicId === topic.id) || state.profile.weeklyGoals.length >= 3 ? 'disabled' : ''}>${translate('加入计划')}</button>`}</div>`).join('')}</div>`;
  }

  function progressText(topics) {
    const mastered = topics.filter((topic) => topicStatus(topic.id) === 'mastered').length;
    const assessed = topics.filter((topic) => topicStatus(topic.id) !== 'not_started').length;
    if (!assessed) return translate('尚未开始评估');
    return `${translate('已掌握 ')}${mastered}${translate(' / ')}${assessed}${translate(' 个已评估知识点')}`;
  }

  function renderHome() {
    const ageTopics = visibleTopics();
    const masteredCount = ageTopics.filter((topic) => topicStatus(topic.id) === 'mastered').length;
    const learningCount = ageTopics.filter((topic) => topicStatus(topic.id) === 'learning').length;
    const subjects = SUBJECTS.map((item) => {
      const topics = ageTopics.filter((topic) => topic.subject === item.key);
      if (!topics.length) return '';
      return `<button class="subject-card ${item.primary ? 'primary' : 'secondary'}" data-subject="${escapeHTML(item.key)}" type="button"><strong>${escapeHTML(subjectLabel(item.key))}</strong><span>${escapeHTML(progressText(topics))}</span></button>`;
    }).join('');
    return layout(`${pageHeading(translate('我的成长'), translate('GROWING MAP'), `${translate('你好，')}${escapeHTML(state.profile.child.name)}${translate('。今天想从哪里开始探索？')}`)}
      <section class="overview-grid">
        <div class="panel welcome-panel"><div class="welcome-copy"><p class="eyebrow">${translate('本阶段 · ')}${escapeHTML(state.profile.child.age)}${translate(' 岁')}</p><h2>${translate('每一次尝试，都在向前一步')}</h2><p>${translate('学习地图会根据年龄和知识前置关系，帮你找到适合现在探索的内容。')}</p><div class="metrics"><div class="metric"><strong>${masteredCount}</strong><span>${translate('已掌握')}</span></div><div class="metric"><strong>${learningCount}</strong><span>${translate('学习中')}</span></div></div></div></div>
        <div class="panel"><div class="small-panel-title"><h3>${translate('下一步可以探索')}</h3><button class="text-button" data-view="map" type="button">${translate('学习地图')}</button></div>${renderRecommendations(true)}</div>
      </section>
      <section class="section"><div class="section-heading"><div><h2>${translate('学习方向')}</h2><p>${translate('数学、英语和科学是主要方向，也可以看看其他领域。')}</p></div></div><div class="subject-grid">${subjects || `<p class="empty-note">${translate('暂时没有可用学习数据。')}</p>`}</div></section>
      <section class="section"><div class="section-heading"><div><h2>${translate('本周计划')}</h2><p>${translate('一次选几个小目标就好。')}</p></div><button class="text-button" data-view="plan" type="button">${translate('查看计划')}</button></div>${renderGoalPreview()}</section>`);
  }

  function renderGoalPreview() {
    const goals = state.profile.weeklyGoals;
    if (!goals.length) return `<div class="panel"><p class="empty-note">${translate('还没有本周目标。可以从下一步推荐中添加一个知识点。')}</p></div>`;
    return `<div class="goal-list">${goals.map((goal) => renderGoal(goal, true)).join('')}</div>`;
  }

  function renderGoal(goal, compact = false) {
    const topic = state.data.topicsById.get(goal.topicId);
    if (!topic) return '';
    const name = topicName(topic);
    return `<article class="goal-item ${goal.completed ? 'done' : ''}"><div><div class="goal-subject">${escapeHTML(subjectLabel(topic.subject))} · ${escapeHTML(domainLabel(topic.domain))}</div><div class="goal-name">${escapeHTML(name)}</div><div class="goal-objective">${goal.completed ? translate('本周目标已完成') : `${translate('学习目标：了解并尝试说明“')}${escapeHTML(name)}${translate('”')}`}</div></div>${compact ? '' : `<div class="goal-actions">${goal.completed ? `<span class="tag">${translate('已完成')}</span>` : `<button class="button primary" data-complete-goal="${escapeHTML(goal.topicId)}" type="button">${translate('完成')}</button>`}<button class="button danger" data-remove-goal="${escapeHTML(goal.topicId)}" type="button">${translate('移除')}</button></div>`}</article>`;
  }

  function renderPlan() {
    const goals = state.profile.weeklyGoals;
    return layout(`${pageHeading(translate('本周计划'), translate('THIS WEEK'), translate('最多安排 3 个目标，留出时间慢慢练习。'))}
      <section class="panel"><div class="section-heading"><div><h2>${translate('本周目标')} <span class="count-label">${goals.length} / 3</span></h2><p>${translate('完成后，知识点会自动标记为已掌握，并重新计算下一步推荐。')}</p></div><button class="text-button" data-view="map" type="button">${translate('从学习地图添加')}</button></div>
      ${goals.length ? `<div class="goal-list">${goals.map((goal) => renderGoal(goal)).join('')}</div>` : `<p class="empty-note">${translate('本周还没有目标。先从推荐内容或学习地图里挑选一个想探索的知识点。')}</p>`}</section>
      ${goals.length < 3 ? `<section class="section"><div class="section-heading"><div><h2>${translate('推荐学习')}</h2><p>${translate('根据适龄范围、前置知识和当前学习状态生成。')}</p></div></div><div class="panel">${renderRecommendations()}</div></section>` : ''}`);
  }

  function renderMap() {
    const subjects = SUBJECTS.filter((item) => state.data.topicsByAge.get(state.profile.child.age)?.some((topic) => topic.subject === item.key));
    const selectedTopics = visibleTopics().filter((topic) => topic.subject === state.selectedSubject);
    const query = state.query.trim().toLocaleLowerCase();
    const filtered = query ? selectedTopics.filter((topic) => `${topic.name} ${topicName(topic)} ${topic.domain} ${domainLabel(topic.domain)} ${topic.description || ''} ${topicDescription(topic)}`.toLocaleLowerCase().includes(query)) : selectedTopics;
    const domains = [...new Set(filtered.map((topic) => topic.domain || '其他'))].sort((a, b) => a.localeCompare(b));
    const clusterFor = (domain) => state.data.clusters.filter((cluster) => cluster.subject === state.selectedSubject && cluster.domain === domain && cluster.ageRangeStart <= state.profile.child.age).sort((a, b) => b.ageRangeStart - a.ageRangeStart)[0];
    const groups = domains.map((domain) => {
      const items = filtered.filter((topic) => (topic.domain || '其他') === domain).sort((a, b) => a.name.localeCompare(b.name));
      const key = `${state.selectedSubject}|${domain}`;
      const limit = state.expandedDomains.has(key) || query ? items.length : (state.visibleCounts.get(key) || 4);
      const cluster = clusterFor(domain);
      return `<section class="map-domain"><div class="domain-heading"><div><h3>${escapeHTML(domainLabel(domain))}</h3>${cluster?.summary ? `<p>${escapeHTML(clusterSummary(cluster))}</p>` : ''}</div><span class="count-label">${countText(items.length, 'topic')}</span></div><div class="topic-list">${items.slice(0, limit).map((topic) => `<button class="topic-card" data-topic="${escapeHTML(topic.id)}" type="button"><span class="status-dot ${topicStatus(topic.id)}"></span><span><strong>${escapeHTML(topicName(topic))}</strong><small>${escapeHTML(statusLabel(topicStatus(topic.id)))} · ${escapeHTML(ageRangeLabel(topic))}</small></span></button>`).join('')}</div>${items.length > limit ? `<button class="more-button" data-expand-domain="${escapeHTML(key)}" data-next-count="${limit + 8}" type="button">${translate('再看 ')}${Math.min(8, items.length - limit)}${translate(' 个')}</button>` : items.length > 4 && !state.expandedDomains.has(key) && !query ? `<button class="more-button" data-collapse-domain="${escapeHTML(key)}" type="button">${translate('收起部分知识点')}</button>` : ''}</section>`;
    }).join('');
    return layout(`${pageHeading(translate('学习地图'), translate('LEARNING MAP'), `${translate('当前展示与 ')}${escapeHTML(state.profile.child.age)}${translate(' 岁年龄范围相符的知识点；这只是探索起点，不代表完整课程。')}`)}
      <div class="toolbar"><input class="search-input" id="topic-search" type="search" placeholder="${translate('搜索知识点或领域')}" value="${escapeHTML(state.query)}" aria-label="${translate('搜索知识点或领域')}"><span class="count-label">${countText(filtered.length, 'topic')}</span></div>
      <div class="filter-row" role="tablist" aria-label="${translate('学习学科')}">${subjects.map((subject) => `<button class="filter-button ${state.selectedSubject === subject.key ? 'active' : ''}" data-select-subject="${escapeHTML(subject.key)}" type="button">${escapeHTML(subjectLabel(subject.key))}${subject.primary ? translate(' · 主方向') : ''}</button>`).join('')}</div>
      ${groups || `<div class="panel"><p class="empty-note">${translate('没有找到相符的知识点，试试其他关键词或学科。')}</p></div>`}`);
  }

  function relationRows(edges, idKey, currentTopic) {
    if (!edges.length) return `<p class="empty-note">${translate('暂无相关知识点。')}</p>`;
    return `<div class="relation-list">${edges.slice(0, 8).map((edge) => {
      const topic = state.data.topicsById.get(edge[idKey]);
      if (!topic) return '';
      const status = topicStatus(topic.id);
      const strength = edge.strength === 'hard' ? translate('必要前置') : translate('建议前置');
      const detail = idKey === 'prerequisiteId'
        ? `${strength}${state.language === 'en' && edge.reason ? ` · ${escapeHTML(edge.reason)}` : ''}`
        : `${translate('掌握后可以继续 · ')}${escapeHTML(subjectLabel(topic.subject))} · ${escapeHTML(domainLabel(topic.domain))}`;
      return `<button class="relation-item" data-topic="${escapeHTML(topic.id)}" type="button"><span class="relation-symbol ${status}">${status === 'mastered' ? '●' : status === 'learning' ? '◐' : '○'}</span><span><span class="relation-name">${escapeHTML(topicName(topic))}</span><span class="relation-note">${detail}</span></span></button>`;
    }).join('')}</div>${edges.length > 8 ? `<p class="empty-note">${translate('还有 ')}${edges.length - 8}${translate(' 个相关知识点。')}</p>` : ''}`;
  }

  function renderTopicDetail() {
    const topic = state.data.topicsById.get(state.selectedTopicId);
    if (!topic) { state.view = 'map'; return renderMap(); }
    const status = topicStatus(topic.id);
    const prerequisites = state.data.prerequisitesByTopic.get(topic.id) || [];
    const unlocks = state.data.unlocksByTopic.get(topic.id) || [];
    const rawEvidence = topicEvidence(topic);
    const evidence = Array.isArray(rawEvidence) ? rawEvidence : rawEvidence ? [rawEvidence] : [];
    const rawPrompt = topicAssessmentPrompt(topic);
    const prompt = typeof rawPrompt === 'string' ? rawPrompt.replaceAll('{{name}}', state.profile.child.name || (state.language === 'zh-CN' ? '孩子' : 'your child')) : '';
    return layout(`<button class="detail-back" data-back="map" type="button">${translate('← 返回学习地图')}</button>
      <div class="detail-layout"><div class="detail-main">
        <section class="panel detail-title-card"><p class="eyebrow">${escapeHTML(subjectLabel(topic.subject))} · ${escapeHTML(domainLabel(topic.domain))}</p><h1>${escapeHTML(topicName(topic))}</h1><div class="tag-row"><span class="tag">${state.language === 'zh-CN' ? `${translate('适合 ')}${escapeHTML(ageRangeLabel(topic))}` : escapeHTML(ageRangeLabel(topic))}</span><span class="tag">${escapeHTML(typeLabel(topic.type || '学习知识点'))}</span></div><p class="detail-copy">${escapeHTML(topicDescription(topic) || translate('暂无知识简介。'))}</p></section>
        <section class="panel"><h3>${translate('如何判断孩子已经掌握')}</h3>${evidence.length ? `<ul class="evidence-list">${evidence.map((item) => `<li>${escapeHTML(item)}</li>`).join('')}</ul>` : `<p class="empty-note">${translate('数据中暂无掌握证据。')}</p>`}</section>
        <section class="panel"><h3>${translate('可以这样观察')}</h3><p class="detail-copy">${prompt ? escapeHTML(prompt) : translate('数据中暂无评估提示，可以结合上方的掌握证据进行观察。')}</p></section>
        <section class="panel"><div class="small-panel-title"><h3>${translate('掌握状态')}</h3><span>${translate('更改后会重新计算推荐')}</span></div><div class="status-control">${['not_started', 'learning', 'mastered'].map((key) => `<button class="status-button ${status === key ? 'active' : ''}" data-status="${key}" data-status-topic="${escapeHTML(topic.id)}" type="button">${key === 'not_started' ? '○' : key === 'learning' ? '◐' : '●'} ${escapeHTML(statusLabel(key))}</button>`).join('')}</div><div class="section-heading" style="margin:17px 0 0"><span class="count-label">${translate('本周计划 ')}${state.profile.weeklyGoals.length}/3</span><button class="button primary" data-add-goal="${escapeHTML(topic.id)}" type="button" ${state.profile.weeklyGoals.some((goal) => goal.topicId === topic.id) || state.profile.weeklyGoals.length >= 3 ? 'disabled' : ''}>${translate('加入本周计划')}</button></div></section>
      </div><aside class="side-stack"><section class="panel"><div class="small-panel-title"><h3>${translate('学习这个之前')}</h3><span>${countText(prerequisites.length, 'item')}</span></div>${relationRows(prerequisites, 'prerequisiteId', topic)}</section><section class="panel"><div class="small-panel-title"><h3>${translate('掌握后可以继续学习')}</h3><span>${countText(unlocks.length, 'item')}</span></div>${relationRows(unlocks, 'topicId', topic)}</section></aside></div>`);
  }

  function renderRecords() {
    const records = { mastered: [], learning: [], not_started: [] };
    for (const topic of visibleTopics()) records[topicStatus(topic.id)].push(topic);
    const renderRecordPanel = (key, label) => {
      const list = records[key].sort((a, b) => a.name.localeCompare(b.name));
      const shown = key === 'not_started' ? list.slice(0, 8) : list.slice(0, 20);
      return `<section class="panel record-panel ${key}"><h3><span></span>${label} <span class="count-label">${list.length}</span></h3>${shown.length ? `<div class="record-list">${shown.map((topic) => `<div class="record-entry"><button data-topic="${escapeHTML(topic.id)}" type="button">${escapeHTML(topicName(topic))}</button><small>${escapeHTML(subjectLabel(topic.subject))} · ${escapeHTML(domainLabel(topic.domain))}</small></div>`).join('')}</div>${list.length > shown.length ? `<p class="empty-note">${translate('另有 ')}${list.length - shown.length}${translate(' 个知识点。')}</p>` : ''}` : `<p class="empty-note">${translate('这里还没有内容。')}</p>`}</section>`;
    };
    const next = getRecommendations();
    return layout(`${pageHeading(translate('成长记录'), translate('GROWTH NOTES'), translate('回看已经掌握的内容，也看看还在探索的知识点。'))}
      <section class="section"><div class="section-heading"><div><h2>${translate('成长记录')}</h2><p>${translate('仅显示当前年龄范围内的知识点。')}</p></div></div><div class="record-grid">${renderRecordPanel('mastered', statusLabel('mastered'))}${renderRecordPanel('learning', statusLabel('learning'))}${renderRecordPanel('not_started', statusLabel('not_started'))}</div></section>
      <section class="section"><div class="section-heading"><div><h2>${translate('下一步')}</h2><p>${translate('根据年龄适用范围、前置知识状态和学习中节点推荐。')}</p></div><button class="text-button" data-view="map" type="button">${translate('打开学习地图')}</button></div><div class="panel">${next.length ? renderRecommendations() : `<p class="empty-note">${translate('当前年龄范围内的学习内容都已掌握。')}</p>`}</div></section>`);
  }

  function render() {
    if (state.loading) {
      app.innerHTML = `<div class="loading-screen">${languageControl()}<div class="loading-state" role="status">${translate('正在整理学习地图…')}</div></div>`;
      bindLanguageControls();
      return;
    }
    if (state.loadError) {
      const empty = state.loadError === 'empty';
      app.innerHTML = `<main class="error-screen">${languageControl()}<section class="error-panel"><h1>${translate(empty ? '暂时没有可用学习数据。' : '无法加载 OS-Taxonomy 数据')}</h1><p>${translate(empty ? '请检查 data/topics.json 是否包含 Topic 数据。' : '请确认你正在通过本地 HTTP 服务运行本项目。')}</p></section></main>`;
      bindLanguageControls();
      return;
    }
    if (!state.profile) return renderWelcome();
    const views = { home: renderHome, map: renderMap, detail: renderTopicDetail, plan: renderPlan, records: renderRecords };
    app.innerHTML = (views[state.view] || renderHome)();
    bindEvents();
  }

  function bindLanguageControls() {
    app.querySelectorAll('[data-language]').forEach((button) => button.addEventListener('click', () => setLanguage(button.dataset.language)));
  }

  function bindEvents() {
    bindLanguageControls();
    app.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => { state.view = button.dataset.view; state.selectedTopicId = null; render(); }));
    app.querySelectorAll('[data-topic]').forEach((button) => button.addEventListener('click', () => { state.selectedTopicId = button.dataset.topic; state.view = 'detail'; render(); }));
    app.querySelectorAll('[data-subject]').forEach((button) => button.addEventListener('click', () => { state.selectedSubject = button.dataset.subject; state.view = 'map'; state.query = ''; render(); }));
    app.querySelectorAll('[data-select-subject]').forEach((button) => button.addEventListener('click', () => { state.selectedSubject = button.dataset.selectSubject; render(); }));
    app.querySelectorAll('[data-status-topic]').forEach((button) => button.addEventListener('click', () => {
      const id = button.dataset.statusTopic;
      if (button.dataset.status === 'not_started') delete state.profile.mastery[id];
      else state.profile.mastery[id] = button.dataset.status;
      saveProfile();
      render();
    }));
    app.querySelectorAll('[data-add-goal]').forEach((button) => button.addEventListener('click', () => {
      const id = button.dataset.addGoal;
      if (state.profile.weeklyGoals.length >= 3 || state.profile.weeklyGoals.some((goal) => goal.topicId === id)) return;
      state.profile.weeklyGoals.push({ topicId: id, addedAt: new Date().toISOString(), completed: false });
      saveProfile();
      render();
    }));
    app.querySelectorAll('[data-remove-goal]').forEach((button) => button.addEventListener('click', () => {
      state.profile.weeklyGoals = state.profile.weeklyGoals.filter((goal) => goal.topicId !== button.dataset.removeGoal);
      saveProfile();
      render();
    }));
    app.querySelectorAll('[data-complete-goal]').forEach((button) => button.addEventListener('click', () => {
      const id = button.dataset.completeGoal;
      const goal = state.profile.weeklyGoals.find((item) => item.topicId === id);
      if (goal) goal.completed = true;
      state.profile.mastery[id] = 'mastered';
      saveProfile();
      render();
    }));
    app.querySelectorAll('[data-expand-domain]').forEach((button) => button.addEventListener('click', () => { state.visibleCounts.set(button.dataset.expandDomain, Number(button.dataset.nextCount)); render(); }));
    app.querySelectorAll('[data-collapse-domain]').forEach((button) => button.addEventListener('click', () => { state.expandedDomains.delete(button.dataset.collapseDomain); state.visibleCounts.set(button.dataset.collapseDomain, 4); render(); }));
    app.querySelectorAll('[data-back]').forEach((button) => button.addEventListener('click', () => { state.view = button.dataset.back; render(); }));
    const search = document.querySelector('#topic-search');
    if (search) search.addEventListener('input', (event) => {
      const cursor = event.target.selectionStart;
      state.query = event.target.value;
      const position = window.scrollY;
      render();
      const nextSearch = document.querySelector('#topic-search');
      nextSearch?.focus();
      nextSearch?.setSelectionRange(cursor, cursor);
      window.scrollTo(0, position);
    });
  }

  async function start() {
    document.documentElement.lang = state.language;
    document.title = localeBundles[state.language]?.title || localeBundles.en?.title || 'OS-Taxonomy Learning Planner';
    state.profile = readProfile();
    app.innerHTML = `<div class="loading-screen">${languageControl()}<div class="loading-state" role="status">${translate('正在整理学习地图…')}</div></div>`;
    bindLanguageControls();
    try {
      const responses = await Promise.all(DATA_PATHS.map((path) => fetch(path)));
      if (responses.some((response) => !response.ok)) throw new Error('load');
      const payloads = await Promise.all(responses.map((response) => response.json()));
      state.data = buildData(...payloads);
      state.loading = false;
      if (!state.profile) renderWelcome();
      else render();
    } catch (error) {
      state.loading = false;
      state.loadError = error.message === 'empty' ? 'empty' : 'load';
      render();
    }
  }

  start();
})();