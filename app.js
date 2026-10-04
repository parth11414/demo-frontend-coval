(() => {
  "use strict";
  const { people, projects, conversations, hierarchy } = window.DemoData;
  const root = document.getElementById("viewRoot");
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const esc = value => String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  const person = id => people.find(item => item.id === id);
  const project = id => projects.find(item => item.id === id);
  let activePersonId = "maya-chen";
  let activeRoute = "overview";
  let projectFilter = "All";
  let engineeringQuery = "";
  let projectQuery = "";
  let selectedTeam = "All";
  let selectedConversation = "proj-neural";
  let chatQuery = "";
  let chatMessages = Object.fromEntries(conversations.map(item => [item.id, item.messages.map(([sender,text,mine,time]) => ({sender,text,mine,time}))]));
  let typing = false;
  let typingConversation = "";
  let projectReturnHash = "#projects";
  let typingTimer;
  let toastTimer;
  let graphZoom = 1;
  let graphOffset = {x:0,y:0};
  let graphDragging = false;
  let dragStart = null;
  let graphExpanded = true;

  function avatar(user, small = false) {
    return `<span class="avatar avatar-${esc(user.tone)}${small ? " avatar-small" : ""}" role="img" aria-label="${esc(user.name)}">${esc(user.initials)}</span>`;
  }
  function personLink(id, extra = "") {
    const user = person(id);
    if (!user) return "";
    return `<button class="person-chip ${extra}" data-person="${esc(id)}">${avatar(user,true)}<span>${esc(user.name)}</span></button>`;
  }
  function pill(text, style = "") { return `<span class="tag ${style}">${esc(text)}</span>`; }
  function sectionHeader(kicker,title,sub="",action="") {
    return `<div class="page-heading"><div><span class="eyebrow">${esc(kicker)}</span><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ""}</div>${action}</div>`;
  }
  function heatmap(id, count = 196) {
    const seed = id.split("").reduce((sum,char) => sum + char.charCodeAt(0), 0);
    return `<div class="heatmap" role="img" aria-label="Contribution activity over the last 28 weeks">${Array.from({length:count},(_,i) => {
      const level = (Math.sin((i + seed) * 12.9898) * 43758.5453 % 1 + 1) % 1;
      const bucket = level > .84 ? 4 : level > .62 ? 3 : level > .37 ? 2 : level > .15 ? 1 : 0;
      return `<span class="heat-cell level-${bucket}" title="${Math.round(level * 9 + 1)} contributions"></span>`;
    }).join("")}</div>`;
  }
  function sparkline(color = "#4f46e5", values = [30,39,34,51,42,63,58,70,62,85,74,92]) {
    const points = values.map((n,i) => `${(i / (values.length - 1)) * 100},${100 - n}`).join(" ");
    return `<svg class="sparkline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg>`;
  }
  function lineChart(label, values, color = "#4f46e5") {
    const max = Math.max(...values), min = Math.min(...values);
    const points = values.map((value,index) => `${38 + index * (590 / (values.length - 1))},${20 + (max - value) / Math.max(1,max-min) * 126}`).join(" ");
    const circles = values.map((value,index) => `<circle cx="${38 + index * (590 / (values.length - 1))}" cy="${20 + (max - value) / Math.max(1,max-min) * 126}" r="3" fill="${color}"><title>${label}: ${value}</title></circle>`).join("");
    return `<svg class="line-chart" viewBox="0 0 660 180" role="img" aria-label="${esc(label)} history"><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".18"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><path d="M ${points.replaceAll(" "," L ")} L 628 165 L 38 165 Z" fill="url(#chartFill)"/><polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.5" vector-effect="non-scaling-stroke"/>${circles}<line x1="38" x2="628" y1="165" y2="165" stroke="#e3e0da"/></svg>`;
  }
  function getPageTitle(route) {
    return ({overview:"OVERVIEW",engineering:"ENGINEERING",career:"CAREER PATH",projects:"PROJECT EXPLORER",network:"NETWORK GRAPH",activity:"ACTIVITY STREAM",chat:"COLLABORATE"})[route] || "DEVELOPER PROFILE";
  }
  function navigate(route) {
    activeRoute = route;
    const hash = `#${route}`;
    if (location.hash !== hash) history.pushState(null,"",hash);
    render();
  }
  function goProfile(id) {
    if (!person(id)) return;
    activePersonId = id;
    const hash = `#profile/${id}`;
    if (location.hash !== hash) history.pushState(null,"",hash);
    render();
  }
  function render() {
    const profileMatch = location.hash.match(/^#profile\/([a-z0-9-]+)$/);
    if (profileMatch && person(profileMatch[1])) {
      activePersonId = profileMatch[1];
      activeRoute = "profile";
    } else if (location.hash.startsWith("#project/")) {
      activeRoute = "projects";
    } else {
      const route = location.hash.slice(1);
      activeRoute = ["overview","engineering","career","projects","network","activity","chat"].includes(route) ? route : "overview";
    }
    document.querySelectorAll("[data-route]").forEach(link => link.classList.toggle("active",link.dataset.route === activeRoute));
    $("#breadcrumb").textContent = activeRoute === "profile" ? `PEOPLE / ${person(activePersonId).username.toUpperCase()}` : getPageTitle(activeRoute);
    $("#sidebar").classList.remove("sidebar-open");
    $("#sidebarBackdrop")?.classList.remove("visible");
    const pages = {overview:renderOverview,engineering:renderEngineering,career:renderCareer,projects:renderProjects,network:renderNetwork,activity:renderActivity,chat:renderChat,profile:renderProfile};
    root.innerHTML = `<section class="page-view">${pages[activeRoute]()}</section>`;
    if (activeRoute === "engineering") applyDirectoryFilter();
    if (activeRoute === "chat") scrollChat();
    if (activeRoute === "network") bindNetworkCanvas();
    animateCounters();
  }
  function bindNetworkCanvas() {
    const canvas = $("#networkCanvas");
    if (!canvas) return;
    canvas.addEventListener("pointerdown",event=>{
      if(event.target.closest("button"))return;
      graphDragging=true;dragStart={x:event.clientX-graphOffset.x,y:event.clientY-graphOffset.y};
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove",event=>{
      if(!graphDragging)return;
      graphOffset={x:event.clientX-dragStart.x,y:event.clientY-dragStart.y};
      const stage=$("#networkStage");
      if(stage)stage.style.transform=`translate(${graphOffset.x}px,${graphOffset.y}px) scale(${graphZoom})`;
    });
    canvas.addEventListener("pointerup",()=>{graphDragging=false;});
    canvas.addEventListener("pointercancel",()=>{graphDragging=false;});
  }
  function animateCounters() {
    root.querySelectorAll("[data-count]").forEach(node => {
      const end = Number(node.dataset.count);
      if (!Number.isFinite(end)) return;
      const start = performance.now();
      const duration = 620;
      const step = now => {
        const progress = Math.min(1,(now-start)/duration);
        node.textContent = Math.round(end * (1 - Math.pow(1-progress,3))).toLocaleString();
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }
  function scoreRing(score) {
    return `<div class="score-ring" style="--score:${score * 3.6}deg"><div><strong>${score}</strong><small>OUT OF 100</small></div></div>`;
  }
  function profileHero(user, detail = false) {
    const projectsIn = user.projects.map(project).filter(Boolean);
    return `<section class="profile-hero panel">
      <div class="profile-cover"><div class="cover-grid"></div><span class="cover-coordinate">37°46′49″N&nbsp;&nbsp; 122°25′09″W</span><span class="cover-badge"><i></i> OPEN TO COLLABORATION</span></div>
      <div class="profile-main">
        <div class="profile-identity">${avatar(user)}<div><div class="identity-title"><h1>${esc(user.name)}</h1><span class="verified-mark" title="Identity verified">${icon("check")}</span></div><p class="handle">@${esc(user.username)} <span>·</span> <span class="presence"><i></i>${user.active ? "online now":"last active 2h ago"}</span></p></div></div>
        <div class="profile-hero-actions"><button class="button button-quiet" data-message-person="${esc(user.id)}">${icon("arrow-up-right")}&nbsp; Message</button><button class="button button-green" data-copy-profile="${esc(user.id)}">${icon("plus")}&nbsp; Connect</button></div>
      </div>
      <p class="profile-bio">${esc(user.bio)}</p>
      <div class="profile-meta"><span>${icon("map-pin")} ${esc(user.location)}</span><span>${icon("briefcase")} ${esc(user.role)} <i>@</i> ${esc(user.company)}</span><span>${icon("clock")} ${esc(user.experience)} experience</span><span>${icon("users")} ${esc(user.team)}</span></div>
      <div class="profile-project-strip"><span class="mono-label">CURRENTLY BUILDING</span>${projectsIn.slice(0,3).map(item=>`<button class="project-mini-link" data-project="${item.id}"><span class="repo-dot"></span>${esc(item.path.split("/")[1])}<span class="arrow">${icon("arrow-up-right")}</span></button>`).join("")}</div>
    </section>`;
  }
  function scoreCard(user) {
    const metrics = [["GitHub signal",user.github.contributions,"contributions"],["Problem solving",user.leetcode.rating,"contest rating"],["System design",Math.round(user.skills.reduce((sum,item)=>sum+item[1],0)/user.skills.length),"skill avg"],["Community",user.github.followers,"followers"]];
    return `<article class="panel score-card"><div class="panel-heading"><div><span class="eyebrow">DEVELOPER SIGNAL</span><h2>Technical score</h2></div><button class="info-button" title="Composite score from public demo signals">${icon("info")}</button></div><div class="score-overview">${scoreRing(user.score)}<div><span class="score-change">${icon("trending-up")} 4.2%</span><p>vs. last quarter</p><small>TOP 6% IN ATLAS LABS</small></div></div><div class="metric-list">${metrics.map(([name,value,label])=>`<div class="metric-row"><span>${esc(name)}</span><strong>${Number(value).toLocaleString()} <small>${esc(label)}</small></strong></div>`).join("")}</div><div class="score-foot"><span class="tiny-square"></span> Updated moments ago</div></article>`;
  }
  function stackMarkup(user) {
    const colors = ["lime","cyan","purple","blue","orange","pink"];
    return `<div class="stack-list">${user.skills.map(([name,value],index)=>`<div class="stack-row"><div class="stack-label"><span>${esc(name)}</span><span class="stack-level">${value}<small>%</small></span></div><div class="skill-track"><i class="${colors[index % colors.length]}" style="width:${value}%"></i></div></div>`).join("")}</div>`;
  }
  function githubCard(user, compact = false) {
    return `<article class="panel github-card ${compact ? "github-compact":""}"><div class="panel-heading"><div><span class="eyebrow"><span class="brand-github">${icon("git-branch")}</span> GITHUB ACTIVITY</span><h2>Code, in motion.</h2></div><button class="link-arrow" data-go="activity">${icon("arrow-up-right")}</button></div>
      <div class="github-stats"><div><strong data-count="${user.github.contributions}">${user.github.contributions}</strong><span>CONTRIBUTIONS</span></div><div><strong>${user.github.streak}<small> days</small></strong><span>BEST STREAK</span></div><div><strong>${user.github.prs}</strong><span>MERGED PRS</span></div><div><strong>${user.github.stars.toLocaleString()}</strong><span>STARS EARNED</span></div></div>
      ${heatmap(user.id,compact ? 112:196)}<div class="heatmap-caption"><span>LESS</span><i class="heat-cell level-0"></i><i class="heat-cell level-1"></i><i class="heat-cell level-2"></i><i class="heat-cell level-3"></i><i class="heat-cell level-4"></i><span>MORE</span><small>LAST 28 WEEKS</small></div>
      <div class="language-list">${user.languages.slice(0,4).map(([language,percent])=>`<span><i class="language-dot lang-${language.toLowerCase().replace(/[^a-z]/g,"")}"></i>${esc(language)} <b>${percent}%</b></span>`).join("")}</div>
    </article>`;
  }
  function projectCard(item) {
    return `<article class="project-card" data-project-card="${item.id}"><div class="project-card-top"><span class="repo-icon">${icon("repo")}</span><span class="project-status ${item.status}"><i></i>${esc(item.status)}</span></div>
      <button class="project-path" data-project="${item.id}">github.com/${esc(item.path)} <span>${icon("arrow-up-right")}</span></button>
      <div class="project-hover"><p>${esc(item.description)}</p><div class="project-tags">${item.stack.slice(0,4).map(tech=>pill(tech)).join("")}</div><div class="hover-contributors"><span>CONTRIBUTORS</span><div>${item.contributors.slice(0,5).map(([id,percent])=>`<button data-person="${id}" title="${esc(person(id).name)} · ${percent}%">${avatar(person(id),true)}</button>`).join("")}</div><small>${item.contributors.length} people · click to explore</small></div></div>
      <p class="project-description">${esc(item.description)}</p><div class="project-tags">${item.stack.slice(0,3).map(tech=>pill(tech)).join("")}</div>
      <div class="project-card-bottom"><span>${icon("star")} ${item.stars}</span><span>${icon("clock")} ${esc(item.updated)}</span><span class="contributor-avatars">${item.contributors.slice(0,3).map(([id])=>avatar(person(id),true)).join("")}<small>+${item.contributors.length-3}</small></span></div>
    </article>`;
  }
  function renderOverview() {
    const user = person(activePersonId);
    const userProjects = user.projects.map(project).filter(Boolean);
    const collaborators = [...new Set(userProjects.flatMap(proj => proj.contributors.map(([id]) => id)))].filter(id => id !== user.id);

    const timelineEvents = [
      {
        icon: "git-pr",
        badge: "MERGED",
        badgeColor: "green",
        person: user,
        projectId: user.projects[0] || "neural-search",
        projectName: project(user.projects[0]) ? project(user.projects[0]).path.split("/")[1] : "neural-search",
        time: "18m ago",
        title: user.activity || "Pushed to neural-search",
        desc: "Merged PR #418: Improved cache invalidation for hybrid keyword & vector queries."
      },
      {
        icon: "check",
        badge: "MERGED",
        badgeColor: "green",
        person: person("leo-martinez") || user,
        projectId: "infra-core",
        projectName: "infra-core",
        time: "35m ago",
        title: "Merged infra-core #418 into main",
        desc: "Canary is green across all three regions. Workload identity policies verified."
      },
      {
        icon: "sparkles",
        badge: "EVAL",
        badgeColor: "purple",
        person: person("evan-brooks") || user,
        projectId: "neural-search",
        projectName: "neural-search",
        time: "1h ago",
        title: "Updated ranking evaluation suite",
        desc: "The reranker eval cleared 0.84 NDCG on the holdout set with long-tail holding at +11%."
      },
      {
        icon: "git-branch",
        badge: "RELEASE",
        badgeColor: "blue",
        person: person("priya-nair") || user,
        projectId: "signal-board",
        projectName: "signal-board",
        time: "2h ago",
        title: "Shipped the new signal-board",
        desc: "Real-time engineering health surface with accessibility enhancements and side-by-side view."
      },
      {
        icon: "message",
        badge: "REVIEW",
        badgeColor: "amber",
        person: person("jonah-reed") || user,
        projectId: "infra-core",
        projectName: "infra-core",
        time: "4h ago",
        title: "Reviewed 3 pull requests",
        desc: "Pushed cache invalidation notes to the RFC and signed off on staging deployment plan."
      }
    ];

    return `
      <!-- 1. GREETING -->
      <header class="overview-greeting">
        <div class="overview-greeting-text">
          <span class="eyebrow">ENGINEERING INTELLIGENCE</span>
          <h1 class="overview-heading">Good morning, ${esc(user.name.split(" ")[0])}</h1>
          <p class="overview-subtext">Engineering intelligence for your team.</p>
        </div>
        <div class="overview-greeting-actions">
          <button class="button button-quiet" data-go="engineering">${icon("users")}&nbsp; Explore team</button>
        </div>
      </header>

      <!-- 2. PROFILE HERO (Visual Anchor) -->
      <article class="overview-profile-hero" aria-label="Engineering Profile Hero">
        <div class="hero-header-row">
          <div class="hero-identity-group">
            <div class="hero-avatar-container">
              ${avatar(user)}
              <span class="hero-presence-indicator ${user.active ? 'online' : ''}" title="${user.active ? 'Online now' : 'Last active 2h ago'}"></span>
            </div>
            <div class="hero-identity-copy">
              <div class="hero-name-badge-row">
                <h2>${esc(user.name)}</h2>
                <span class="verified-icon" title="Identity verified">${icon("check")}</span>
                <span class="hero-status-pill ${user.active ? 'online' : ''}">
                  <i></i>${user.active ? 'Online now' : 'Away · last active 2h ago'}
                </span>
              </div>
              <div class="hero-meta-inline">
                <span>${icon("briefcase")}&nbsp; ${esc(user.role)} <small>at</small> ${esc(user.company)}</span>
                <span class="meta-sep">·</span>
                <span>${icon("users")}&nbsp; ${esc(user.team)}</span>
                <span class="meta-sep">·</span>
                <span>${icon("map-pin")}&nbsp; ${esc(user.location)}</span>
                <span class="meta-sep">·</span>
                <span>${icon("clock")}&nbsp; ${esc(user.experience)} exp</span>
              </div>
            </div>
          </div>
          <div class="hero-action-buttons">
            <button class="button button-quiet" data-message-person="${esc(user.id)}">${icon("message")}&nbsp; Message</button>
            <button class="button button-quiet" data-copy-profile="${esc(user.id)}">${icon("plus")}&nbsp; Connect</button>
            <button class="button button-green" data-person="${esc(user.id)}">${icon("user")}&nbsp; Full profile</button>
          </div>
        </div>
        <p class="hero-bio-text">${esc(user.bio)}</p>
        <div class="hero-footer-bar">
          <div class="hero-stats-group">
            <div class="hero-stat-cell">
              <span class="stat-cell-label">GITHUB HANDLE</span>
              <span class="stat-cell-val">@${esc(user.username)}</span>
            </div>
            <div class="stat-cell-divider"></div>
            <div class="hero-stat-cell">
              <span class="stat-cell-label">TECH SIGNAL</span>
              <span class="stat-cell-val">${user.score} <small>/ 100</small></span>
            </div>
            <div class="stat-cell-divider"></div>
            <div class="hero-stat-cell">
              <span class="stat-cell-label">SOLVED LC</span>
              <span class="stat-cell-val">${user.leetcode.solved} <small>problems</small></span>
            </div>
            <div class="stat-cell-divider"></div>
            <div class="hero-stat-cell">
              <span class="stat-cell-label">STREAK</span>
              <span class="stat-cell-val">${user.github.streak} <small>days</small></span>
            </div>
          </div>
          <div class="hero-active-projects">
            <span class="stat-cell-label">CURRENT REPOSITORIES:</span>
            <div class="hero-repo-links">
              ${userProjects.slice(0, 3).map(proj => `
                <button class="hero-repo-chip" data-project="${proj.id}" title="${esc(proj.description)}">
                  <span class="repo-glyph">${icon("repo")}</span>
                  <span>${esc(proj.path.split("/")[1])}</span>
                  <span class="stars">${icon("star")}&nbsp;${proj.stars}</span>
                </button>
              `).join("")}
            </div>
          </div>
        </div>
      </article>

      <!-- 3. METRICS ROW -->
      <section class="overview-metrics-grid" aria-label="Key Engineering Metrics">
        <!-- Metric 1: GitHub contributions -->
        <article class="metric-card">
          <div class="metric-card-top">
            <span class="metric-card-label">GITHUB CONTRIBUTIONS</span>
            <span class="metric-trend-tag positive">${icon("trending-up")} +18%</span>
          </div>
          <div class="metric-number-row">
            <strong class="metric-hero-num" data-count="${user.github.contributions}">${user.github.contributions}</strong>
          </div>
          <div class="metric-card-foot">
            <span class="metric-foot-desc">${user.github.streak}d streak · ${user.github.prs} merged PRs</span>
            <div class="metric-mini-chart">
              ${sparkline("#4f46e5", [24, 35, 28, 49, 40, 60, 52, 74, 62, 85, 77, 91])}
            </div>
          </div>
        </article>

        <!-- Metric 2: Technical signal -->
        <article class="metric-card">
          <div class="metric-card-top">
            <span class="metric-card-label">TECHNICAL SIGNAL</span>
            <span class="metric-trend-tag positive">${icon("trending-up")} +4.2%</span>
          </div>
          <div class="metric-number-row">
            <strong class="metric-hero-num" data-count="${user.score}">${user.score}</strong>
            <span class="metric-hero-unit">/100</span>
          </div>
          <div class="metric-card-foot">
            <span class="metric-foot-desc">Top 6% across Atlas Labs</span>
            <span class="metric-badge-quiet">LEADERSHIP</span>
          </div>
        </article>

        <!-- Metric 3: Connected Repositories -->
        <article class="metric-card">
          <div class="metric-card-top">
            <span class="metric-card-label">CONNECTED REPOS</span>
            <span class="metric-badge-quiet">SHIPPING</span>
          </div>
          <div class="metric-number-row">
            <strong class="metric-hero-num" data-count="${userProjects.length}">${userProjects.length}</strong>
            <span class="metric-hero-unit">repos</span>
          </div>
          <div class="metric-card-foot">
            <span class="metric-foot-desc">All production builds healthy</span>
            <span class="tiny-square"></span>
          </div>
        </article>

        <!-- Metric 4: Network Collaborators -->
        <article class="metric-card">
          <div class="metric-card-top">
            <span class="metric-card-label">COLLABORATORS</span>
            <span class="metric-trend-tag positive">+2 new</span>
          </div>
          <div class="metric-number-row">
            <strong class="metric-hero-num" data-count="${collaborators.length}">${collaborators.length}</strong>
            <span class="metric-hero-unit">peers</span>
          </div>
          <div class="metric-card-foot">
            <span class="metric-foot-desc">Across 3 active squads</span>
            <div class="metric-avatar-stack">
              ${collaborators.slice(0, 3).map(id => avatar(person(id), true)).join("")}
            </div>
          </div>
        </article>

        <!-- Metric 5: Recent Velocity -->
        <article class="metric-card">
          <div class="metric-card-top">
            <span class="metric-card-label">RECENT VELOCITY</span>
            <span class="metric-trend-tag positive">${icon("check")} ACTIVE</span>
          </div>
          <div class="metric-number-row">
            <strong class="metric-hero-num" data-count="${user.github.prs}">${user.github.prs}</strong>
            <span class="metric-hero-unit">PRs</span>
          </div>
          <div class="metric-card-foot">
            <span class="metric-foot-desc">${user.github.issues} issues closed · 9.2h SLA</span>
          </div>
        </article>
      </section>

      <!-- 4. CURRENT PROJECTS -->
      <section class="overview-projects-section" aria-label="Current Projects">
        <div class="overview-section-title-bar">
          <div>
            <span class="eyebrow">REPOSITORIES & SYSTEMS</span>
            <h2 class="overview-section-title">Current projects <span class="count-badge">${userProjects.length}</span></h2>
          </div>
          <button class="text-link" data-go="projects">EXPLORE ALL 12 REPOSITORIES ${icon("arrow-up-right")}</button>
        </div>
        <div class="overview-projects-grid">
          ${userProjects.map(item => `
            <article class="overview-project-card" data-project="${item.id}" tabindex="0" role="button" aria-label="Open ${esc(item.id)} project details">
              <div class="opc-top">
                <div class="opc-name-box">
                  <span class="opc-repo-icon">${icon("repo")}</span>
                  <div>
                    <h3 class="opc-title">${esc(item.id)}</h3>
                    <span class="opc-path">${esc(item.path)}</span>
                  </div>
                </div>
                <span class="project-status ${item.status}"><i></i>${esc(item.status)}</span>
              </div>
              <p class="opc-description">${esc(item.description)}</p>
              <div class="opc-tech-tags">
                ${item.stack.map(tech => `<span class="opc-tag">${esc(tech)}</span>`).join("")}
              </div>
              <div class="opc-footer">
                <div class="opc-contributors-box">
                  <span class="opc-footer-label">CONTRIBUTORS</span>
                  <div class="opc-avatar-list">
                    ${item.contributors.slice(0, 4).map(([id, pct]) => `
                      <span class="opc-avatar-wrap" title="${esc(person(id)?.name || id)} · ${pct}%">
                        ${avatar(person(id), true)}
                      </span>
                    `).join("")}
                    ${item.contributors.length > 4 ? `<span class="opc-more-count">+${item.contributors.length - 4}</span>` : ""}
                  </div>
                </div>
                <div class="opc-stats-row">
                  <span class="opc-stat">${icon("star")}&nbsp;${item.stars}</span>
                  <span class="opc-stat-sep">·</span>
                  <span class="opc-stat">${icon("clock")}&nbsp;${esc(item.updated)}</span>
                </div>
              </div>
            </article>
          `).join("")}
        </div>
      </section>

      <!-- 5 & 6. LOWER GRID: RECENT ACTIVITY TIMELINE & TECHNICAL SKILLS PROFILE -->
      <div class="overview-lower-grid">
        <!-- 5. ACTIVITY TIMELINE -->
        <article class="overview-timeline-card" aria-label="Recent Engineering Activity">
          <div class="overview-card-heading">
            <div>
              <span class="eyebrow">ACTIVITY STREAM</span>
              <h2 class="overview-card-title">Recent activity</h2>
            </div>
            <button class="text-link" data-go="activity">VIEW ALL STREAM ${icon("arrow-up-right")}</button>
          </div>
          <div class="overview-timeline-list">
            ${timelineEvents.map((item, idx) => `
              <div class="timeline-row ${idx === 0 ? 'is-latest' : ''}">
                <div class="timeline-track">
                  <span class="timeline-bullet">${icon(item.icon)}</span>
                  ${idx < timelineEvents.length - 1 ? '<span class="timeline-line"></span>' : ''}
                </div>
                <div class="timeline-content">
                  <div class="timeline-meta-bar">
                    <span class="timeline-badge badge-${item.badgeColor}">${item.badge}</span>
                    <span class="timeline-meta-text">
                      <button class="person-chip" data-person="${item.person.id}">${avatar(item.person, true)} <span>${esc(item.person.name)}</span></button>
                      <span>·</span>
                      <button class="timeline-proj-link" data-project="${item.projectId}">${esc(item.projectName)}</button>
                      <span>·</span>
                      <time>${item.time}</time>
                    </span>
                  </div>
                  <h4 class="timeline-title">${esc(item.title)}</h4>
                  <p class="timeline-desc">${esc(item.desc)}</p>
                </div>
              </div>
            `).join("")}
          </div>
        </article>

        <!-- 6. SKILLS / TECHNICAL PROFILE -->
        <article class="overview-skills-card" aria-label="Technical Skills and Profile">
          <div class="overview-card-heading">
            <div>
              <span class="eyebrow">TECHNICAL PROFILE</span>
              <h2 class="overview-card-title">Skills & competency</h2>
            </div>
            <button class="text-link" data-go="engineering">VIEW DIRECTORY ${icon("arrow-up-right")}</button>
          </div>

          <!-- Skills breakdown -->
          <div class="skills-section-block">
            <span class="skills-subhead">CORE TECHNICAL COMPETENCIES</span>
            <div class="skills-bars-list">
              ${user.skills.map(([name, value]) => `
                <div class="skill-meter-row">
                  <div class="skill-meter-labels">
                    <span class="skill-meter-name">${esc(name)}</span>
                    <span class="skill-meter-val">${value}%</span>
                  </div>
                  <div class="skill-meter-track">
                    <div class="skill-meter-fill" style="width: ${value}%"></div>
                  </div>
                </div>
              `).join("")}
            </div>
          </div>

          <!-- Language distribution -->
          <div class="skills-section-block">
            <span class="skills-subhead">LANGUAGE DISTRIBUTION</span>
            <div class="language-progress-stacked" role="img" aria-label="Language distribution">
              ${user.languages.map(([name, pct]) => `
                <div class="lang-bar-segment lang-${name.toLowerCase().replace(/[^a-z]/g, '')}" style="width: ${pct}%" title="${esc(name)}: ${pct}%"></div>
              `).join("")}
            </div>
            <div class="language-legend-row">
              ${user.languages.map(([name, pct]) => `
                <span class="lang-legend-item">
                  <i class="lang-color-dot lang-${name.toLowerCase().replace(/[^a-z]/g, '')}"></i>
                  <span class="lang-name">${esc(name)}</span>
                  <span class="lang-pct">${pct}%</span>
                </span>
              `).join("")}
            </div>
          </div>

          <!-- Problem Solving / LeetCode Signal -->
          <div class="skills-section-block">
            <span class="skills-subhead">PROBLEM SOLVING SIGNAL</span>
            <div class="leetcode-overview-box">
              <div class="leetcode-header-line">
                <span class="leetcode-pill">CONTEST RATING: <b>${user.leetcode.rating.toLocaleString()}</b></span>
                <span class="metric-trend-tag positive">${icon("trending-up")} Top 4.8%</span>
              </div>
              <div class="leetcode-numbers-row">
                <div class="lc-stat">
                  <span class="lc-num">${user.leetcode.solved}</span>
                  <span class="lc-lbl">SOLVED</span>
                </div>
                <div class="lc-stat">
                  <span class="lc-num text-green">${user.leetcode.easy}</span>
                  <span class="lc-lbl">EASY</span>
                </div>
                <div class="lc-stat">
                  <span class="lc-num text-amber">${user.leetcode.medium}</span>
                  <span class="lc-lbl">MEDIUM</span>
                </div>
                <div class="lc-stat">
                  <span class="lc-num text-danger">${user.leetcode.hard}</span>
                  <span class="lc-lbl">HARD</span>
                </div>
              </div>
            </div>
          </div>
        </article>
      </div>
    `;
  }
  function developerCard(user) {
    return `<article class="developer-card"><div class="developer-card-top">${avatar(user)}<span class="presence-label ${user.active?"is-online":""}"><i></i>${user.active?"ONLINE":"AWAY"}</span></div><button class="developer-name" data-person="${user.id}">${esc(user.name)} <span>${icon("arrow-up-right")}</span></button><div class="developer-role">${esc(user.role)} <span>·</span> ${esc(user.team)}</div><p>${esc(user.bio)}</p><div class="developer-tags">${user.skills.slice(0,3).map(([name])=>pill(name)).join("")}</div><div class="developer-card-bottom"><span>${icon("signal")} ${user.score} SIGNAL</span><button data-message-person="${user.id}">MESSAGE ${icon("arrow-right")}</button></div></article>`;
  }
  function renderEngineering() {
    const user = person(activePersonId);
    return `${sectionHeader("PEOPLE / ENGINEERING","Engineering, connected.","12 practitioners. 4 disciplines. One very opinionated shared terminal.",`<button class="button button-quiet" data-go="network">${icon("network")}&nbsp; Org graph</button>`)}
      <div class="engineering-summary"><article class="panel summary-tile"><span>PEOPLE</span><strong>${people.length}</strong><small>across 4 teams</small></article><article class="panel summary-tile"><span>COMBINED COMMITS</span><strong>14,128</strong><small class="positive">${icon("trending-up")} 12% this quarter</small></article><article class="panel summary-tile"><span>SHIPPED PROJECTS</span><strong>12</strong><small>3 in active development</small></article><article class="panel summary-tile"><span>ORG SIGNAL</span><strong>91.4</strong><small class="positive">top quartile</small></article></div>
      <div class="directory-toolbar"><div class="team-tabs"><button class="filter-chip ${selectedTeam==="All"?"selected":""}" data-team-filter="All">All people <b>12</b></button>${["Applied AI","Platform","Developer Experience","Trust & Security","Product Design","Product Systems"].map(team=>`<button class="filter-chip ${selectedTeam===team?"selected":""}" data-team-filter="${esc(team)}">${esc(team)}</button>`).join("")}</div><label class="inline-search"><span>${icon("search")}</span><input id="engineeringSearch" value="${esc(engineeringQuery)}" placeholder="Find a specialist…" aria-label="Search developers"></label></div>
      <div class="developer-grid" id="developerGrid">${people.map(developerCard).join("")}</div>
      <div class="leetcode-detail panel"><div class="panel-heading"><div><span class="eyebrow">PROBLEM SOLVING / LEETCODE</span><h2>Practice compounds.</h2></div><div class="chart-switcher"><button class="chart-tab active" data-chart="rating">RATING</button><button class="chart-tab" data-chart="solved">SOLVED</button><button class="chart-tab" data-chart="contests">CONTESTS</button></div></div><div class="leetcode-detail-grid"><div><div class="big-rating">${user.leetcode.rating.toLocaleString()} <small>current rating</small></div><div class="chart-caption">+184 points across the last 12 contests <span>${icon("trending-up")} +8.6%</span></div>${lineChart("Contest rating",[1580,1620,1602,1710,1680,1776,1818,1799,1912,1950,2072,user.leetcode.rating])}<div class="chart-months"><span>APR</span><span>MAY</span><span>JUN</span><span>JUL</span><span>AUG</span><span>SEP</span><span>OCT</span></div></div><div class="contest-side"><span class="eyebrow">RECENT CONTESTS</span><div class="contest-row"><b>#462</b><span>Weekly Contest</span><strong>Top 4.8%</strong></div><div class="contest-row"><b>#461</b><span>Weekly Contest</span><strong>Top 8.2%</strong></div><div class="contest-row"><b>#188</b><span>Biweekly Contest</span><strong>Top 3.1%</strong></div><div class="contest-row"><b>#460</b><span>Weekly Contest</span><strong>Top 12%</strong></div><span class="demo-caption">Illustrative demo rating history</span></div></div></div>`;
  }
  function renderCareer() {
    const user = person(activePersonId);
    return `${sectionHeader("CAREER / TRAJECTORY",`${esc(user.name.split(" ")[0])}, by the work.`,"A career is less a ladder than a set of increasingly interesting problems.",`<button class="button button-quiet" data-person="${user.id==="maya-chen"?"amara-okafor":"maya-chen"}">${icon("arrow-left-right")}&nbsp; Compare profiles</button>`)}
      <div class="career-layout"><div class="career-main"><div class="career-intro panel"><div class="career-total"><strong>${user.experience.split(" ")[0]}</strong><span>YEARS<br>BUILDING</span></div><div><span class="eyebrow">THE THROUGHLINE</span><h2>From making it work<br>to making it work for everyone.</h2><p>${esc(user.bio)}</p></div></div><div class="timeline">${user.experienceHistory.map((entry,index)=>`<article class="timeline-entry"><span class="timeline-node ${index===0?"current":""}"></span><div class="timeline-card panel"><div class="timeline-card-top"><div><span class="eyebrow">${esc(entry.company.toUpperCase())} ${index===0?'<i class="current-tag">CURRENT</i>':""}</span><h2>${esc(entry.role)}</h2></div><span class="timeline-duration">${esc(entry.duration)}</span></div><div class="timeline-period">${esc(entry.period)}</div><p>${index===0?"Setting technical direction, unblocking teams, and staying close to the details.":"Built foundations, shipped product, and grew a larger technical surface area."}</p><div class="project-tags">${entry.skills.map(skill=>pill(skill)).join("")}</div>${index===0?`<div class="career-promotion"><span>${icon("arrow-up")}</span> Promoted to ${esc(entry.role)} · Jan 2023</div>`:""}</div></article>`).join("")}</div></div>
      <aside class="career-aside"><article class="panel career-signal"><span class="eyebrow">CAREER VELOCITY</span><strong>2.4×</strong><p>role scope expanded since first engineering role</p>${sparkline("#7c3aed")}<div class="signal-foot"><span>2018</span><span>NOW</span></div></article><article class="panel growth-card"><span class="eyebrow">SKILLS GAINED ALONG THE WAY</span><h2>A wider lens, same curiosity.</h2>${[["Technical leadership",98],["System architecture",94],["Mentoring",91],["Product thinking",86]].map(([name,value])=>`<div class="stack-row"><div class="stack-label"><span>${name}</span><span class="stack-level">${value}%</span></div><div class="skill-track"><i class="purple" style="width:${value}%"></i></div></div>`).join("")}</article><article class="panel milestone-card"><span class="eyebrow">CAREER MILESTONE</span><div class="milestone-icon">${icon("sparkles")}</div><h3>From first PR<br>to platform ownership.</h3><p>${esc(user.experienceHistory.length)} roles · ${user.projects.length} active projects · one evolving toolkit.</p></article></aside></div>`;
  }
  function renderProjects() {
    const technologies = ["All",...new Set(projects.flatMap(item=>item.stack))];
    const filtered = projects.filter(item=>(projectFilter==="All"||item.stack.includes(projectFilter)) && `${item.path} ${item.description} ${item.team}`.toLowerCase().includes(projectQuery.toLowerCase()));
    return `${sectionHeader("REPOSITORY INTELLIGENCE / 12 REPOS","Projects with people attached.","Every repository is a collaboration graph. Hover for the signal; follow a contributor to their profile.",`<span class="live-count"><i></i> ${projects.filter(item=>item.status==="shipping").length} SHIPPING</span>`)}
      <div class="project-toolbar"><label class="inline-search project-search"><span>${icon("search")}</span><input id="projectSearch" value="${esc(projectQuery)}" placeholder="Search repositories…" aria-label="Search projects"></label><div class="technology-filters">${technologies.map(tech=>`<button class="filter-chip ${projectFilter===tech?"selected":""}" data-tech="${esc(tech)}">${esc(tech)}</button>`).join("")}</div></div>
      <div class="project-grid" id="projectGrid">${filtered.map(projectCard).join("")}</div>${filtered.length===0?`<div class="empty-state"><span>${icon("search")}</span><h3>No matching repositories.</h3><p>Try another technology or clear your search.</p><button class="button button-quiet" data-clear-project-filters>Clear filters</button></div>`:""}
      <div class="project-footer-note"><span class="demo-pulse"></span> Hover any repository to inspect contributors and contribution share <span>·</span> ${filtered.length} / ${projects.length} repositories</div>`;
  }
  function orgNode(id, collapsed = false) {
    const user = person(id);
    if (!user) return "";
    const childNodes = hierarchyChildren(id);
    return `<li><div class="org-node" role="button" tabindex="0" data-person="${id}" title="Open ${esc(user.name)}'s profile"><div class="org-node-person">${avatar(user,true)}<span class="org-presence ${user.active?"online":""}"></span></div><strong>${esc(user.name)}</strong><small>${esc(user.role)}</small><span class="org-team">${esc(user.team)}</span>${childNodes.length?`<button class="branch-toggle" aria-label="Collapse ${esc(user.name)} branch" data-collapse="${id}">${collapsed?icon("plus"):icon("minus")}</button>`:""}</div>${childNodes.length?`<ul class="org-children" data-branch="${id}" ${collapsed?"hidden":""}>${childNodes.map(child=>orgNode(child.id)).join("")}</ul>`:""}</li>`;
  }
  function hierarchyChildren(id) {
    const find = node => { if(node.id===id)return node.children||[]; for(const child of node.children||[]){const result=find(child);if(result.length)return result;}return []; };
    return find(hierarchy);
  }
  function renderNetwork() {
    const relationPoints = [[145,80],[370,80],[595,80],[820,80],[145,250],[370,250],[595,250],[820,250],[145,420],[370,420],[595,420],[820,420]];
    const nodes = people.map((user,index)=>({...user,x:relationPoints[index][0],y:relationPoints[index][1]}));
    const projectNodes = projects.slice(0,6).map((item,index)=>({item,x:240+(index%3)*245,y:165+Math.floor(index/3)*165}));
    const edges = projects.slice(0,6).flatMap(item=>item.contributors.slice(0,3).map(([id])=>{const user=nodes.find(entry=>entry.id===id), projectIndex=projects.indexOf(item), target=projectNodes.find(entry=>entry.item.id===item.id);return user&&target?`<line x1="${user.x}" y1="${user.y}" x2="${target.x}" y2="${target.y}" class="network-edge edge-${projectIndex%4}"/>`:"";})).join("");
    return `${sectionHeader("NETWORK / RELATIONSHIP MAP","The shape of the work.","People ↔ projects ↔ teams ↔ technologies. Follow the connections, find the edges.",`<button class="button button-quiet" data-go="engineering">${icon("arrow-left")}&nbsp; People directory</button>`)}
      <div class="network-toolbar panel"><div class="graph-legend"><span><i class="legend-person"></i> PEOPLE</span><span><i class="legend-project"></i> PROJECTS</span><span><i class="legend-connection"></i> SHARED CONTRIBUTION</span></div><div class="graph-controls"><button id="graphZoomOut" aria-label="Zoom out">${icon("minus")}</button><span id="zoomLabel">100%</span><button id="graphZoomIn" aria-label="Zoom in">${icon("plus")}</button><button id="graphReset" title="Reset view">${icon("rotate")}</button></div></div>
      <div class="network-canvas panel" id="networkCanvas"><div class="network-stage" id="networkStage" style="transform:translate(${graphOffset.x}px,${graphOffset.y}px) scale(${graphZoom})"><svg class="network-lines" viewBox="0 0 970 500" aria-hidden="true">${edges}</svg>${nodes.map(user=>`<button class="network-person" data-person="${user.id}" style="left:${user.x}px;top:${user.y}px">${avatar(user,true)}<span><strong>${esc(user.name.split(" ")[0])} ${esc(user.name.split(" ")[1])}</strong><small>${esc(user.team)}</small></span></button>`).join("")}${projectNodes.map(({item,x,y})=>`<button class="network-project" data-project="${item.id}" style="left:${x}px;top:${y}px"><span>${icon("repo")}</span><strong>${esc(item.id)}</strong><small>${item.contributors.length} contributors</small></button>`).join("")}</div><div class="canvas-hint">DRAG TO PAN <span>·</span> CLICK A NODE TO EXPLORE</div></div>
      <div class="org-section"><div class="panel-heading"><div><span class="eyebrow">ATLAS LABS / ORG STRUCTURE</span><h2>Reporting lines, shared craft.</h2></div><button class="button button-quiet" id="toggleBranches">${icon("minus")}&nbsp; Collapse branches</button></div><div class="org-canvas panel" id="orgCanvas"><div class="org-tree"><ul>${orgNode(hierarchy.id)}</ul></div></div></div>
      <div class="team-relationship-grid">${["Applied AI","Platform","Developer Experience","Trust & Security"].map(team=>`<button class="team-relation panel" data-team-jump="${esc(team)}"><span class="eyebrow">TEAM NODE</span><strong>${esc(team)}</strong><small>${people.filter(user=>user.team===team).length} people · ${projects.filter(item=>item.team===team).length} projects</small><span>EXPLORE ${icon("arrow-right")}</span></button>`).join("")}</div>`;
  }
  function renderActivity() {
    const user = person(activePersonId);
    return `${sectionHeader("ACTIVITY / CONTRIBUTION GRAPH","A year, in commits.","A small, very illustrative picture of consistent, collaborative work.",`<button class="button button-quiet" data-go="engineering">${icon("code")}&nbsp; Engineering</button>`)}
      <div class="activity-kpis"><article class="panel activity-kpi"><span class="eyebrow">COMMITS THIS YEAR</span><strong>1,842</strong><small class="positive">${icon("trending-up")} 18% vs last year</small>${sparkline()}</article><article class="panel activity-kpi"><span class="eyebrow">PULL REQUESTS</span><strong>${user.github.prs}</strong><small>86 merged · 4 in review</small>${sparkline("#0d9488",[24,35,28,49,40,60,52,74,62,85,77,91])}</article><article class="panel activity-kpi"><span class="eyebrow">ISSUES CLOSED</span><strong>${user.github.issues}</strong><small>Median close 1.8 days</small>${sparkline("#7c3aed",[33,27,41,34,51,47,60,54,71,65,82,90])}</article><article class="panel activity-kpi"><span class="eyebrow">CODE REVIEWS</span><strong>204</strong><small>9.2h median turnaround</small>${sparkline("#059669",[18,32,25,43,40,54,48,65,59,73,81,94])}</article></div>
      <article class="panel activity-heatmap"><div class="panel-heading"><div><span class="eyebrow">GITHUB / CONTRIBUTION GRAPH</span><h2>Showing up is a superpower.</h2></div><span class="chart-caption">JUN 2025 — ${new Date().toLocaleString("en-US",{month:"short",year:"numeric"}).toUpperCase()}</span></div><div class="activity-month-labels"><span>JUN</span><span>JUL</span><span>AUG</span><span>SEP</span><span>OCT</span><span>NOV</span><span>DEC</span><span>JAN</span><span>FEB</span><span>MAR</span><span>APR</span><span>MAY</span></div>${heatmap(user.id,364)}<div class="heatmap-caption"><span>LESS</span>${[0,1,2,3,4].map(level=>`<i class="heat-cell level-${level}"></i>`).join("")}<span>MORE</span><small>${user.github.contributions.toLocaleString()} CONTRIBUTIONS IN THE LAST YEAR</small></div></article>
      <div class="activity-lower"><article class="panel"><div class="panel-heading"><div><span class="eyebrow">PULL REQUESTS</span><h2>Recent changes</h2></div><span class="tag status-tag">MERGED</span></div>${[["#418","Improve cache invalidation for hybrid queries","neural-search","12m"],["#402","Add bounded retry to the ingestion worker","agent-runtime","3h"],["#387","Document the index recovery path","vector-kernel","Yesterday"]].map(([n,title,repo,time])=>`<div class="pr-row"><span class="pr-icon">${icon("git-pr")}</span><div><strong>${esc(title)}</strong><small>${esc(repo)} ${n} · ${time} ago</small></div><span class="merged-state">${icon("check")}</span></div>`).join("")}</article><article class="panel"><div class="panel-heading"><div><span class="eyebrow">LANGUAGES / LAST YEAR</span><h2>Polyglot, practically.</h2></div></div><div class="language-bars">${user.languages.map(([name,value])=>`<div><span>${esc(name)}</span><i><b style="width:${value}%"></b></i><strong>${value}%</strong></div>`).join("")}</div><div class="language-donut"><div><strong>${user.languages.length}</strong><small>languages</small></div></div></article></div>
      <article class="panel instagram-card"><div class="panel-heading"><div><span class="eyebrow">INSTAGRAM / @${esc(user.username.toUpperCase())}</span><h2>Life outside the diff.</h2></div><span class="demo-caption">FRONTEND PREVIEW · ${user.posts} RECENT POSTS</span></div><div class="instagram-grid">${["A quiet corner office, finally.","The team shipped. We went outside.","notes from systems club #08","Coffee / compile / repeat"].slice(0,user.posts).map((caption,index)=>`<button class="social-post social-post-${index%4}" data-social-post="${esc(caption)}"><span>${[icon("code"),icon("sparkles"),icon("image"),icon("heart")][index%4]}</span><small>${esc(caption)}</small><b>${icon("heart")} ${34+index*17}</b></button>`).join("")}</div></article>`;
  }
  function renderProfile() {
    const user = person(activePersonId);
    return `${sectionHeader(`PEOPLE / ${esc(user.username.toUpperCase())}`,"<span>Developer profile</span>","A living index of what they build, how they work, and who they work with.",`<button class="button button-quiet" data-go="engineering">${icon("arrow-left")}&nbsp; All engineers</button>`)}
      ${profileHero(user,true)}
      <div class="profile-tabs"><button class="active" data-profile-tab="overview">OVERVIEW</button><button data-profile-tab="career">CAREER <span>03</span></button><button data-profile-tab="projects">PROJECTS <span>${user.projects.length}</span></button><button data-profile-tab="activity">ACTIVITY</button></div>
      <div class="overview-grid profile-overview"><div class="overview-main">${githubCard(user)}<div class="panel profile-career-preview"><div class="panel-heading"><div><span class="eyebrow">CAREER PATH</span><h2>Experience, with context.</h2></div><button class="text-link" data-go="career">FULL TIMELINE ${icon("arrow-up-right")}</button></div>${user.experienceHistory.slice(0,2).map(entry=>`<div class="career-preview-row"><span class="timeline-dot"></span><div><strong>${esc(entry.role)} · ${esc(entry.company)}</strong><small>${esc(entry.period)} <span>·</span> ${esc(entry.duration)}</small></div></div>`).join("")}</div></div><aside class="overview-aside">${scoreCard(user)}<article class="panel skills-card"><div class="panel-heading"><div><span class="eyebrow">TECH STACK</span><h2>Working fluency.</h2></div></div>${stackMarkup(user)}</article><article class="panel peer-card"><span class="eyebrow">COLLABORATES WITH</span><div class="peer-list">${[...new Set(user.projects.flatMap(id=>project(id).contributors.map(([pid])=>pid)))].filter(id=>id!==user.id).slice(0,5).map(id=>personLink(id)).join("")}</div></article></aside></div>
      <div class="panel featured-projects"><div class="panel-heading"><div><span class="eyebrow">CURRENT PROJECTS</span><h2>${esc(user.name.split(" ")[0])} is actively building on ${user.projects.length} repos.</h2></div></div><div class="project-grid compact-project-grid">${user.projects.map(project).filter(Boolean).map(projectCard).join("")}</div></div>`;
  }
  function renderChat() {
    const selected = conversations.find(item=>item.id===selectedConversation)||conversations[0];
    const filtered = conversations.filter(item=>item.title.toLowerCase().includes(chatQuery.toLowerCase())||item.people.some(id=>person(id).name.toLowerCase().includes(chatQuery.toLowerCase())));
    const currentMessages = chatMessages[selected.id]||[];
    const otherPeople = selected.people.filter(id=>id!=="maya-chen");
    return `${sectionHeader("COLLABORATE / LOCAL DEMO","The work, in conversation.","A frontend-only collaboration preview. Nothing is sent, synchronized, or stored remotely.",`<span class="demo-mode-label"><i></i> LOCAL MOCK MODE</span>`)}
      <div class="chat-shell panel"><aside class="chat-sidebar"><div class="chat-sidebar-heading"><span class="eyebrow">INBOX <b>06</b></span><button class="link-arrow" aria-label="New conversation" id="newConversation">${icon("plus")}</button></div><label class="inline-search chat-search"><span>${icon("search")}</span><input id="chatSearch" value="${esc(chatQuery)}" placeholder="Find a conversation…" aria-label="Search conversations"></label><div class="conversation-list">${filtered.map(item=>{const recent=(chatMessages[item.id]||[]).slice(-1)[0], sender=person(recent?.sender);return `<button class="conversation-item ${item.id===selected.id?"selected":""}" data-conversation="${item.id}"><span class="conversation-avatar">${item.kind==="project"?`<span class="repo-icon">${icon("repo")}</span>`:avatar(person(item.people.find(id=>id!=="maya-chen")),true)}${item.kind==="direct"&&person(item.people.find(id=>id!=="maya-chen")).active?'<i class="online-dot"></i>':""}</span><span class="conversation-copy"><strong>${esc(item.title)}</strong><small>${recent?.mine?"You":sender?.name.split(" ")[0]}: ${esc(recent?.text||"")}</small></span><span class="conversation-meta">${esc(recent?.time||"")} ${item.unread?`<i>${item.unread}</i>`:""}</span></button>`;}).join("")}${filtered.length===0?`<div class="chat-empty-small">No conversations match that search.</div>`:""}</div><div class="chat-sidebar-foot"><span class="demo-pulse"></span> DEMO DATA · LOCAL STATE ONLY</div></aside>
      <section class="chat-main"><header class="chat-header"><div class="chat-room-icon">${selected.kind==="project"?icon("repo"):avatar(person(otherPeople[0]),true)}</div><div><strong>${esc(selected.title)}</strong><small>${selected.kind==="project"?`${otherPeople.length} members · project room`:person(otherPeople[0]).active?"Online":"Last seen recently"}</small></div><div class="chat-header-actions"><button class="top-icon mobile-chat-list" title="Show conversations" aria-label="Show conversations" id="toggleChatList">${icon("list")}</button><button class="top-icon" title="Conversation details" id="chatDetails">${icon("info")}</button><button class="top-icon" title="More options">${icon("more")}</button></div></header><div class="chat-context">${selected.kind==="project"?`PROJECT ROOM <span>${icon("arrow-up-right")}</span> <i>·</i> ${esc(project(selected.id.replace("proj-",""))?.team||"ENGINEERING")}`:"DIRECT MESSAGE"} <span class="context-lock">${icon("lock")} FRONTEND DEMO</span></div><div class="message-list" id="messageList">${currentMessages.map(messageMarkup).join("")}${typing&&typingConversation===selected.id?`<div class="typing-indicator"><span>${esc(person(otherPeople[0]).name.split(" ")[0])} is typing</span><i></i><i></i><i></i></div>`:""}</div><form class="composer" id="composer"><div class="composer-tools"><button type="button" title="Formatting">B</button><button type="button" title="Add attachment">${icon("paperclip")}</button><span>DEMO COMPOSER</span></div><textarea id="messageInput" rows="2" placeholder="Message ${esc(selected.title)}… (Enter to send)" aria-label="Compose a message"></textarea><div class="composer-bottom"><span>Enter to send &nbsp; · &nbsp; Shift + Enter for a new line</span><button type="submit" class="send-button" aria-label="Send message">${icon("arrow-up")}</button></div></form></section>
      <aside class="chat-details"><span class="eyebrow">CONVERSATION</span><h3>${esc(selected.title)}</h3><span class="project-status ${selected.kind==="project"?"shipping":"active"}"><i></i>${selected.kind==="project"?"PROJECT ROOM":"DIRECT MESSAGE"}</span><div class="chat-details-section"><span class="eyebrow">PEOPLE <b>${selected.people.length}</b></span><div class="chat-people">${selected.people.map(id=>`<button data-person="${id}">${avatar(person(id),true)}<span><strong>${esc(person(id).name)}</strong><small>${esc(person(id).role)}</small></span><i class="person-online ${person(id).active?"online":""}"></i></button>`).join("")}</div></div>${selected.kind==="project"?`<div class="chat-details-section"><span class="eyebrow">LINKED PROJECT</span><button class="linked-project" data-project="${selected.id.replace("proj-","")}">${icon("repo")} &nbsp; ${esc(selected.title)} <span>${icon("arrow-up-right")}</span></button></div>`:""}<div class="chat-demo-warning">${icon("info")} This is a local-only prototype. Messages exist only in this open browser session and are never transmitted.</div></aside></div>`;
  }
  function messageMarkup(message) {
    const user = person(message.sender);
    return `<div class="message-row ${message.mine?"mine":""}">${message.mine?"":avatar(user,true)}<div class="message-body">${message.mine?"":`<strong>${esc(user.name.split(" ")[0])}</strong>`}<div class="message-bubble">${esc(message.text)}</div><small>${esc(message.time)} ${message.mine?icon("check"):""}</small></div></div>`;
  }
  function scrollChat() { const list=$("#messageList"); if(list)list.scrollTop=list.scrollHeight; }
  function showToast(message) {
    const toast=$("#toast");toast.textContent=message;toast.classList.add("visible");clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove("visible"),2600);
  }
  function openModal(html) {
    $("#modalContent").innerHTML=html;$("#modalBackdrop").hidden=false;document.body.classList.add("modal-open");$("#modalClose").focus();
  }
  function closeModal() {
    $("#modalBackdrop").hidden=true;
    document.body.classList.remove("modal-open");
    if(location.hash.startsWith("#project/"))history.replaceState(null,"",projectReturnHash);
  }
  function showProject(item) {
    openModal(`<span class="eyebrow">REPOSITORY / ${esc(item.team.toUpperCase())}</span><h2 class="modal-title" id="modalTitle">${esc(item.path)}</h2><p class="modal-description">${esc(item.description)}</p><div class="modal-project-status"><span class="project-status ${item.status}"><i></i>${esc(item.status)}</span><span>${icon("star")} ${item.stars} stars</span><span>UPDATED ${esc(item.updated.toUpperCase())}</span></div><span class="eyebrow modal-section-label">TECHNOLOGY STACK</span><div class="project-tags modal-tags">${item.stack.map(tech=>pill(tech)).join("")}</div><span class="eyebrow modal-section-label">CONTRIBUTORS / CONTRIBUTION SHARE</span><div class="modal-contributors">${item.contributors.map(([id,percent])=>`<div class="modal-contributor">${personLink(id)}<strong>${percent}%</strong><i><b style="width:${percent*2.4}%"></b></i></div>`).join("")}</div><p class="demo-caption">All repository details and contribution percentages are illustrative demo data.</p>`);
  }
  function openSearch() {
    openModal(`<span class="eyebrow">GLOBAL DIRECTORY / LOCAL SEARCH</span><h2 class="modal-title" id="modalTitle">Find your next connection.</h2><label class="global-search-input"><span>${icon("search")}</span><input id="globalSearch" placeholder="Search people, projects, teams…" autofocus></label><div class="global-search-results" id="globalSearchResults">${searchResults("")}</div>`);
    $("#globalSearch").focus();
  }
  function searchResults(query) {
    const q=query.toLowerCase();
    const users=people.filter(item=>`${item.name} ${item.username} ${item.role} ${item.team}`.toLowerCase().includes(q)).slice(0,5);
    const repos=projects.filter(item=>`${item.path} ${item.team} ${item.stack.join(" ")}`.toLowerCase().includes(q)).slice(0,4);
    return `<span class="eyebrow">PEOPLE</span>${users.map(item=>`<button class="search-result" data-person="${item.id}">${avatar(item,true)}<span><strong>${esc(item.name)}</strong><small>${esc(item.role)} · ${esc(item.team)}</small></span><kbd>↵</kbd></button>`).join("")}<span class="eyebrow search-subhead">PROJECTS</span>${repos.map(item=>`<button class="search-result" data-project="${item.id}"><span class="repo-icon">${icon("repo")}</span><span><strong>${esc(item.path.split("/")[1])}</strong><small>github.com/${esc(item.path)}</small></span><kbd>↵</kbd></button>`).join("")}${users.length+repos.length===0?`<div class="empty-state compact-empty">No matches yet.</div>`:""}`;
  }
  function switchConversation(id) {
    selectedConversation=id;
    const item=conversations.find(entry=>entry.id===id);
    if(item)item.unread=0;
    render();
  }
  function applyDirectoryFilter(team=selectedTeam) {
    const query=($("#engineeringSearch")?.value||engineeringQuery).toLowerCase();
    root.querySelectorAll(".developer-card").forEach(card=>{
      const user=person(card.querySelector("[data-person]")?.dataset.person);
      card.hidden=!(team==="All"||user.team===team) || !`${user.name} ${user.role} ${user.team} ${user.skills.map(skill=>skill[0]).join(" ")}`.toLowerCase().includes(query);
    });
  }
  function setGraphZoom(value) {
    graphZoom=Math.min(1.5,Math.max(.55,value));
    const stage=$("#networkStage");
    if(stage)stage.style.transform=`translate(${graphOffset.x}px,${graphOffset.y}px) scale(${graphZoom})`;
    const label=$("#zoomLabel");if(label)label.textContent=`${Math.round(graphZoom*100)}%`;
  }

  function closeSidebar() {
    $("#sidebar")?.classList.remove("sidebar-open");
    $("#sidebarBackdrop")?.classList.remove("visible");
  }

  function toggleSidebar() {
    const isOpen = $("#sidebar")?.classList.toggle("sidebar-open");
    $("#sidebarBackdrop")?.classList.toggle("visible", Boolean(isOpen));
  }

  function updateThemeDisplay(theme) {
    document.querySelectorAll(".theme-icon-current use, .icon-theme-toggle use").forEach(use => {
      use.setAttribute("href", theme === "dark" ? "#i-sun" : "#i-moon");
    });
    document.querySelectorAll(".theme-select-btn").forEach(btn => {
      btn.classList.toggle("selected", btn.dataset.themeChoice === theme);
    });
    const switchControl = $("#themeSwitchControl");
    if (switchControl) {
      switchControl.setAttribute("aria-checked", theme === "dark" ? "true" : "false");
      switchControl.classList.toggle("is-dark", theme === "dark");
      switchControl.setAttribute("title", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
      const modeText = $("#switchModeText");
      if (modeText) modeText.textContent = theme === "dark" ? "Light" : "Dark";
    }
  }

  function toggleTheme(explicit) {
    const current = document.documentElement.getAttribute("data-theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = explicit || (current === "dark" ? "light" : "dark");
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("devsignal_theme", next); } catch(e){}
    updateThemeDisplay(next);
    showToast(`Switched to ${next} theme.`);
  }

  function openNotifications() {
    closeSidebar();
    openModal(`<span class="eyebrow">ACTIVITY NOTIFICATIONS</span><h2 class="modal-title" id="modalTitle">Recent Signals & Activity</h2><div class="notifications-list"><button class="notification-item unread" data-go="activity"><span class="notif-icon notif-icon-pr">${icon("git-pr")}</span><div class="notif-content"><strong>PR #418 merged into neural-search</strong><p>Improved cache invalidation for hybrid queries merged by Maya Chen.</p><small>18m ago · Engineering</small></div><span class="notif-badge">MERGED</span></button><button class="notification-item unread" data-route="chat"><span class="notif-icon notif-icon-msg">${icon("message")}</span><div class="notif-content"><strong>New message in #proj-neural</strong><p>Evan Brooks: “Good call — I’ll take a look at the benchmark results.”</p><small>42m ago · Collaboration</small></div><span class="notif-badge">NEW</span></button><button class="notification-item" data-person="elena-rostova"><span class="notif-icon notif-icon-user">${icon("user")}</span><div class="notif-content"><strong>Elena Rostova updated agent-runtime</strong><p>Pushed 3 commits to branch feature/bounded-retry.</p><small>3h ago · Platform</small></div><span class="notif-state">PUSH</span></button></div>`);
  }

  function openSettings() {
    closeSidebar();
    const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
    openModal(`<span class="eyebrow">WORKSPACE PREFERENCES</span><h2 class="modal-title" id="modalTitle">Settings & Configuration</h2><div class="settings-modal-grid"><div class="settings-group"><span class="eyebrow">DISPLAY THEME</span><div class="settings-row"><div><strong>Appearance Mode</strong><p>Switch between light studio canvas and high-contrast dark mode.</p></div><div class="theme-choice-buttons"><button class="button button-quiet theme-select-btn ${currentTheme==='light'?'selected':''}" data-theme-choice="light">${icon("sun")}&nbsp; Light</button><button class="button button-quiet theme-select-btn ${currentTheme==='dark'?'selected':''}" data-theme-choice="dark">${icon("moon")}&nbsp; Dark</button></div></div></div><div class="settings-group"><span class="eyebrow">ACTIVE WORKSPACE</span><div class="settings-row"><div><strong>Organization</strong><p>Atlas Labs · Engineering Intelligence Platform (Production)</p></div><span class="tag">PRODUCTION</span></div><div class="settings-row"><div><strong>Practitioner Profile</strong><p>Maya Chen · Staff Engineer (@mayachen)</p></div><button class="button button-quiet" data-person="maya-chen">View Profile</button></div></div><div class="settings-group"><span class="eyebrow">KEYBOARD SHORTCUTS</span><div class="settings-shortcuts-list"><div class="shortcut-row"><span>Global Search</span><kbd>⌘ K</kbd></div><div class="shortcut-row"><span>Overview</span><kbd>⌘ 1</kbd></div><div class="shortcut-row"><span>Dismiss Dialog / Drawer</span><kbd>Esc</kbd></div><div class="shortcut-row"><span>Send Message</span><kbd>Enter</kbd></div></div></div></div>`);
  }

  document.addEventListener("click",event=>{
    if(event.target.closest("#sidebarBackdrop")){closeSidebar();return;}
    if(event.target.closest("#themeToggle") || event.target.closest("#sidebarThemeToggle") || event.target.closest("#themeSwitchControl")){toggleTheme();return;}
    if(event.target.closest("[data-theme-choice]")){toggleTheme(event.target.closest("[data-theme-choice]").dataset.themeChoice);return;}
    if(event.target.closest("#notificationsButton")){openNotifications();return;}
    if(event.target.closest("#sidebarSettingsBtn") || event.target.closest("#settingsBtn")){openSettings();return;}
    const route=event.target.closest("[data-route]");if(route){event.preventDefault();closeSidebar();navigate(route.dataset.route);return;}
    const go=event.target.closest("[data-go]");if(go){closeSidebar();navigate(go.dataset.go);return;}
    const collapse=event.target.closest("[data-collapse]");if(collapse){const branch=$(`[data-branch="${collapse.dataset.collapse}"]`);if(branch)branch.hidden=!branch.hidden;collapse.innerHTML=branch?.hidden?icon("plus"):icon("minus");collapse.setAttribute("aria-label",`${branch?.hidden?"Expand":"Collapse"} branch`);return;}
    const profile=event.target.closest("[data-person]");if(profile){closeModal();closeSidebar();goProfile(profile.dataset.person);return;}
    const repo=event.target.closest("[data-project]");if(repo){const item=project(repo.dataset.project);if(item){projectReturnHash=location.hash.startsWith("#project/")?"#projects":location.hash||"#overview";history.pushState(null,"",`#project/${item.id}`);showProject(item);}return;}
    const personMessage=event.target.closest("[data-message-person]");if(personMessage){const recipient=personMessage.dataset.messagePerson;selectedConversation=conversations.find(item=>item.kind==="direct"&&item.people.includes(recipient))?.id||"dm-priya";navigate("chat");return;}
    const connect=event.target.closest("[data-copy-profile]");if(connect){showToast(`Connection request staged locally for ${person(connect.dataset.copyProfile).name}.`);return;}
    const tech=event.target.closest("[data-tech]");if(tech){projectFilter=tech.dataset.tech;render();return;}
    const team=event.target.closest("[data-team-filter]");if(team){selectedTeam=team.dataset.teamFilter;root.querySelectorAll("[data-team-filter]").forEach(button=>button.classList.toggle("selected",button===team));applyDirectoryFilter();return;}
    const conversation=event.target.closest("[data-conversation]");if(conversation){switchConversation(conversation.dataset.conversation);return;}
    if(event.target.closest("#toggleBranches")){graphExpanded=!graphExpanded;root.querySelectorAll(".org-children").forEach(branch=>branch.hidden=!graphExpanded);root.querySelectorAll(".branch-toggle").forEach(button=>button.innerHTML=graphExpanded?icon("minus"):icon("plus"));$("#toggleBranches").innerHTML=graphExpanded?`${icon("minus")}&nbsp; Collapse branches`:`${icon("plus")}&nbsp; Expand branches`;return;}
    if(event.target.closest("#graphZoomIn")){setGraphZoom(graphZoom+.1);return;}if(event.target.closest("#graphZoomOut")){setGraphZoom(graphZoom-.1);return;}
    if(event.target.closest("#graphReset")){graphOffset={x:0,y:0};setGraphZoom(1);return;}
    if(event.target.closest("#newConversation")){openModal(`<span class="eyebrow">LOCAL DEMO / NEW CONVERSATION</span><h2 class="modal-title" id="modalTitle">Start with a person.</h2><div class="new-conversation-list">${people.filter(user=>user.id!=="maya-chen").map(user=>`<button class="search-result" data-start-chat="${user.id}">${avatar(user,true)}<span><strong>${esc(user.name)}</strong><small>${esc(user.role)} · ${esc(user.team)}</small></span><kbd>+</kbd></button>`).join("")}</div>`);return;}
    const startChat=event.target.closest("[data-start-chat]");if(startChat){const id=startChat.dataset.startChat;let item=conversations.find(entry=>entry.kind==="direct"&&entry.people.includes(id));if(!item){item={id:`dm-${id}`,title:person(id).name,kind:"direct",people:["maya-chen",id],unread:0,messages:[]};conversations.unshift(item);chatMessages[item.id]=[];}closeModal();selectedConversation=item.id;navigate("chat");return;}
    if(event.target.closest("#chatDetails")){document.querySelector(".chat-shell")?.classList.toggle("details-hidden");return;}
    if(event.target.closest("#toggleChatList")){document.querySelector(".chat-shell")?.classList.toggle("chat-list-open");return;}
    if(event.target.closest("#modalClose")||event.target=== $("#modalBackdrop")){closeModal();return;}
    const post=event.target.closest("[data-social-post]");if(post){showToast(`Demo post: “${post.dataset.socialPost}”`);return;}
    if(event.target.closest("[data-clear-project-filters]")){projectFilter="All";projectQuery="";render();return;}
    if(event.target.closest("[data-team-jump]")){navigate("engineering");setTimeout(()=>{const chip=[...root.querySelectorAll("[data-team-filter]")].find(button=>button.dataset.teamFilter===event.target.closest("[data-team-jump]").dataset.teamJump);chip?.click();},0);return;}
    if(event.target.closest("#globalSearchButton")){openSearch();return;}
    if(event.target.closest("[data-profile-tab]")){const tab=event.target.closest("[data-profile-tab]").dataset.profileTab;if(tab==="career"||tab==="projects"||tab==="activity")navigate(tab);else showToast("You’re viewing the profile overview.");return;}
    if(event.target.closest("[data-chart]")){
      const button=event.target.closest("[data-chart]");
      root.querySelectorAll("[data-chart]").forEach(item=>item.classList.toggle("active",item===button));
      const series={
        rating:{label:"Contest rating",values:[1580,1620,1602,1710,1680,1776,1818,1799,1912,1950,2072,person(activePersonId).leetcode.rating],color:"#4f46e5",caption:"+184 points across the last 12 contests"},
        solved:{label:"Problems solved",values:[9,18,29,39,51,63,81,94,117,136,162,person(activePersonId).leetcode.solved],color:"#0d9488",caption:"Consistent practice across the last 12 months"},
        contests:{label:"Contest placement",values:[68,62,76,48,53,39,32,36,24,19,14,8],color:"#7c3aed",caption:"Median contest placement improved 60 points"}
      }[button.dataset.chart];
      const chart=root.querySelector(".line-chart");
      if(chart)chart.outerHTML=lineChart(series.label,series.values,series.color);
      const caption=root.querySelector(".chart-caption");
      if(caption)caption.innerHTML=`${esc(series.caption)} <span>${icon("trending-up")} UPDATED</span>`;
      return;
    }
  });
  document.addEventListener("input",event=>{
    if(event.target.id==="engineeringSearch"){engineeringQuery=event.target.value;applyDirectoryFilter();}
    if(event.target.id==="projectSearch"){projectQuery=event.target.value;const query=projectQuery.toLowerCase();root.querySelectorAll(".project-card").forEach(card=>{const item=project(card.dataset.projectCard);card.hidden=!(projectFilter==="All"||item.stack.includes(projectFilter))||!`${item.path} ${item.description} ${item.team}`.toLowerCase().includes(query);});}
    if(event.target.id==="chatSearch"){chatQuery=event.target.value;const cursor=event.target.selectionStart;render();const input=$("#chatSearch");input?.focus();input?.setSelectionRange(cursor,cursor);}
    if(event.target.id==="globalSearch"){const results=$("#globalSearchResults");if(results)results.innerHTML=searchResults(event.target.value);}
  });
  document.addEventListener("submit",event=>{
    if(event.target.id!=="composer")return;
    event.preventDefault();
    const input=$("#messageInput"),text=input.value.trim();if(!text)return;
    const messages=chatMessages[selectedConversation]||[];
    messages.push({sender:"maya-chen",text,mine:true,time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})});
    chatMessages[selectedConversation]=messages;input.value="";typing=true;typingConversation=selectedConversation;render();
    clearTimeout(typingTimer);
    const replyTo=selectedConversation;
    typingTimer=setTimeout(()=>{const selected=conversations.find(item=>item.id===replyTo);if(!selected)return;const replyId=selected.people.find(id=>id!=="maya-chen")||"maya-chen",replies=["Good call — I’ll take a look.","Makes sense. I’ll add a note to the thread.","Thanks for the context. Let’s sync on the next pass.","On it — I’ll share an update here shortly."];(chatMessages[replyTo]||[]).push({sender:replyId,text:replies[Math.floor(Math.random()*replies.length)],mine:false,time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})});typing=false;if(selectedConversation===replyTo)render();},1450);
  });
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape"){closeModal();closeSidebar();}
    if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="k"){event.preventDefault();openSearch();}
    if((event.key==="Enter"||event.key===" ")&&event.target.matches(".org-node")){event.preventDefault();closeSidebar();goProfile(event.target.dataset.person);}
    if(event.target.id==="messageInput"&&event.key==="Enter"&&!event.shiftKey){event.preventDefault();$("#composer")?.requestSubmit();}
  });
  window.addEventListener("popstate",()=>{if(!$("#modalBackdrop").hidden)closeModal();closeSidebar();render();});
  $("#modalClose").addEventListener("click",closeModal);
  $("#mobileMenu")?.addEventListener("click",toggleSidebar);
  $("#liveClock").textContent=new Date().toLocaleDateString("en-US",{weekday:"short",month:"short",day:"2-digit"}).toUpperCase();
  $("#projectCount").textContent=projects.length;
  $("#pinnedProjects").innerHTML=projects.map(item=>`<button class="pinned-project" data-project="${item.id}" title="${esc(item.description)}"><i class="pinned-dot ${item.status}"></i><span class="pinned-name">${esc(item.id)}</span><span class="pinned-stars">${icon("star")}&nbsp;${item.stars}</span></button>`).join("");
  render();
  updateThemeDisplay(document.documentElement.getAttribute("data-theme")||"light");
  if("serviceWorker" in navigator && (location.protocol==="https:" || location.hostname==="localhost" || location.hostname==="127.0.0.1")) {
    window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js").catch(error=>console.error("Devsignal offline caching could not be enabled.",error)));
  }
})();
