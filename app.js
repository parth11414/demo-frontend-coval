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
    const featured = projects.filter(item=>user.projects.includes(item.id)).slice(0,3);
    return `${sectionHeader("ENGINEERING SIGNAL / 01",`Good morning, ${esc(user.name.split(" ")[0])} <span class="heading-caret">${icon("sparkles")}</span>`,"A live-window into the people, projects, and systems shaping your engineering org.",`<button class="button button-quiet" data-go="engineering">${icon("users")}&nbsp; Explore team</button>`)}
      ${profileHero(user)}
      <div class="overview-grid"><div class="overview-main">${githubCard(user,true)}
        <div class="panel project-overview"><div class="panel-heading"><div><span class="eyebrow">ACTIVE REPOSITORIES</span><h2>Current projects <span class="count-badge">${featured.length}</span></h2></div><button class="text-link" data-go="projects">ALL PROJECTS ${icon("arrow-up-right")}</button></div><div class="project-list">${featured.map(item=>`<button class="repo-row" data-project="${item.id}"><span class="repo-icon">${icon("repo")}</span><span class="repo-row-main"><strong>${esc(item.path.split("/")[1])}</strong><small>${esc(item.description)}</small></span><span class="repo-row-stars">${icon("star")} ${item.stars}</span><span class="row-arrow">${icon("arrow-up-right")}</span></button>`).join("")}</div></div>
        <div class="panel activity-preview"><div class="panel-heading"><div><span class="eyebrow">RECENT SIGNAL</span><h2>What’s moving</h2></div><button class="text-link" data-go="activity">VIEW ACTIVITY ${icon("arrow-up-right")}</button></div><div class="activity-row"><span class="activity-icon activity-green">${icon("git-pr")}</span><div><strong>${esc(user.activity)}</strong><small>in <button data-project="${user.projects[0]}">${esc(project(user.projects[0]).path.split("/")[1])}</button> · 18 min ago</small></div><span class="activity-state">MERGED</span></div><div class="activity-row"><span class="activity-icon activity-purple">${icon("sparkles")}</span><div><strong>Reviewed retrieval benchmark results</strong><small>with ${person(user.id==="maya-chen"?"evan-brooks":"maya-chen").name} · 1h ago</small></div><span class="activity-state">REVIEW</span></div></div>
      </div><aside class="overview-aside">${scoreCard(user)}
        <article class="panel leetcode-card"><div class="panel-heading"><div><span class="eyebrow">LEETCODE / PROBLEM SOLVING</span><h2>Pattern recognition.</h2></div><span class="leetcode-mark">LC</span></div><div class="leetcode-score"><strong>${user.leetcode.rating.toLocaleString()}</strong><span>CONTEST RATING <i>${icon("trending-up")} 36</i></span></div><div class="problem-total"><strong>${user.leetcode.solved}</strong><span>problems<br>solved</span></div><div class="difficulty-row"><span>Easy <b>${user.leetcode.easy}</b></span><i><em style="width:${user.leetcode.easy/user.leetcode.solved*100}%"></em></i></div><div class="difficulty-row medium"><span>Medium <b>${user.leetcode.medium}</b></span><i><em style="width:${user.leetcode.medium/user.leetcode.solved*100}%"></em></i></div><div class="difficulty-row hard"><span>Hard <b>${user.leetcode.hard}</b></span><i><em style="width:${user.leetcode.hard/user.leetcode.solved*100}%"></em></i></div><button class="text-link wide-link" data-go="engineering">VIEW PROBLEM HISTORY ${icon("arrow-up-right")}</button></article>
        <article class="panel skills-card"><div class="panel-heading"><div><span class="eyebrow">TECHNICAL TOOLKIT</span><h2>Fluent in the stack.</h2></div><button class="link-arrow" data-go="engineering">${icon("arrow-up-right")}</button></div><div class="skill-cloud">${user.skills.slice(0,5).map(([name,level],index)=>`<span class="skill-chip skill-${index%5}">${esc(name)} <b>${level}</b></span>`).join("")}</div></article>
      </aside></div>
      <div class="panel featured-projects"><div class="panel-heading"><div><span class="eyebrow">IN THE WORKS</span><h2>Building with ${user.projects.length} connected projects.</h2></div><button class="button button-outline" data-go="projects">Open project explorer <span>${icon("arrow-up-right")}</span></button></div><div class="project-grid compact-project-grid">${featured.map(projectCard).join("")}</div></div>`;
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

  document.addEventListener("click",event=>{
    const route=event.target.closest("[data-route]");if(route){event.preventDefault();navigate(route.dataset.route);return;}
    const go=event.target.closest("[data-go]");if(go){navigate(go.dataset.go);return;}
    const collapse=event.target.closest("[data-collapse]");if(collapse){const branch=$(`[data-branch="${collapse.dataset.collapse}"]`);if(branch)branch.hidden=!branch.hidden;collapse.innerHTML=branch?.hidden?icon("plus"):icon("minus");collapse.setAttribute("aria-label",`${branch?.hidden?"Expand":"Collapse"} branch`);return;}
    const profile=event.target.closest("[data-person]");if(profile){closeModal();goProfile(profile.dataset.person);return;}
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
    if(event.key==="Escape"){closeModal();$("#sidebar").classList.remove("sidebar-open");}
    if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="k"){event.preventDefault();openSearch();}
    if((event.key==="Enter"||event.key===" ")&&event.target.matches(".org-node")){event.preventDefault();goProfile(event.target.dataset.person);}
    if(event.target.id==="messageInput"&&event.key==="Enter"&&!event.shiftKey){event.preventDefault();$("#composer")?.requestSubmit();}
  });
  window.addEventListener("popstate",()=>{if(!$("#modalBackdrop").hidden)closeModal();render();});
  $("#modalClose").addEventListener("click",closeModal);
  $("#mobileMenu").addEventListener("click",()=>$("#sidebar").classList.toggle("sidebar-open"));
  $("#liveClock").textContent=new Date().toLocaleDateString("en-US",{weekday:"short",month:"short",day:"2-digit"}).toUpperCase();
  $("#projectCount").textContent=projects.length;
  $("#pinnedProjects").innerHTML=projects.slice(0,4).map(item=>`<button class="pinned-project" data-project="${item.id}"><i class="pinned-dot"></i>${esc(item.id)}<span>${item.stars}</span></button>`).join("");
  render();
  if("serviceWorker" in navigator && (location.protocol==="https:" || location.hostname==="localhost" || location.hostname==="127.0.0.1")) {
    window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js").catch(error=>console.error("Devsignal offline caching could not be enabled.",error)));
  }
})();
