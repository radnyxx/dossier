#!/usr/bin/env node

const fs   = require("fs");
const path = require("path");

const ROOT        = __dirname;
const CONTENT_DIR = path.join(ROOT, "content");
const LAYOUT_FILE = path.join(ROOT, "layout", "template.html");
const STYLE_FILE  = path.join(ROOT, "style.css");
const DIST_DIR    = path.join(ROOT, "dist");

const BLOG_SECTIONS  = ["devlogs", "talks", "tutorial"];
const FLAT_SECTIONS  = ["thinks", "poems"];

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return { data: {}, body: raw };
  const data = {};
  for (const line of m[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    data[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { data, body: m[2] };
}

function escHtml(s) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function inline(text) {
  let o = escHtml(text);
  o = o.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  o = o.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
  o = o.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  o = o.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  o = o.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return o;
}

function mdToHtml(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out   = [];
  let i = 0, inList = false, inQuote = false;

  const closeList  = () => { if (inList)  { out.push("</ul>");         inList  = false; } };
  const closeQuote = () => { if (inQuote) { out.push("</blockquote>"); inQuote = false; } };

  while (i < lines.length) {
    const line = lines[i];

    // fenced code block
    if (line.trim().startsWith("```")) {
      closeList(); closeQuote();
      const code = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) code.push(lines[i++]);
      out.push(`<pre><code>${escHtml(code.join("\n"))}</code></pre>`);
      i++; continue;
    }

    // heading
    const hm = line.match(/^(#{1,3})\s+(.+)$/);
    if (hm) {
      closeList(); closeQuote();
      out.push(`<h${hm[1].length}>${inline(hm[2])}</h${hm[1].length}>`);
      i++; continue;
    }

    // hr
    if (/^---+$/.test(line.trim())) {
      closeList(); closeQuote();
      out.push("<hr>"); i++; continue;
    }

    // blockquote
    if (line.trim().startsWith(">")) {
      closeList();
      if (!inQuote) { out.push("<blockquote>"); inQuote = true; }
      const c = line.replace(/^\s*>\s?/, "");
      if (c.trim()) out.push(`<p>${inline(c)}</p>`);
      i++; continue;
    } else { closeQuote(); }

    // list item
    if (/^\s*-\s+/.test(line)) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inline(line.replace(/^\s*-\s+/, ""))}</li>`);
      i++; continue;
    } else { closeList(); }

    // blank
    if (!line.trim()) { i++; continue; }

    // standalone image
    const im = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (im) { out.push(`<img src="${im[2]}" alt="${im[1]}">`); i++; continue; }

    // paragraph (preserve line breaks for poems)
    const para = [line]; i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].match(/^#{1,3}\s/) &&
      !lines[i].trim().startsWith(">") &&
      !lines[i].trim().startsWith("```") &&
      !/^\s*-\s/.test(lines[i]) &&
      !/^---+$/.test(lines[i].trim())
    ) { para.push(lines[i]); i++; }
    out.push(`<p>${para.map(inline).join("<br>\n")}</p>`);
  }

  closeList(); closeQuote();
  return out.join("\n\n");
}

function extractHomeBlocks(md) {
  const lines  = md.split("\n");
  const out    = [];
  const blocks = [];
  let cardBuf  = [];

  const token = (html) => { const t = `@@BLOCK_${blocks.length}@@`; blocks.push(html); return t; };

  const pairs = (str) => {
    const re = /(\S(?:.*?\S)?)\|(\S+)(?=\s|$)/g;
    const r = []; let m;
    while ((m = re.exec(str)) !== null) r.push([m[1], m[2]]);
    return r;
  };

  const flushCards = () => {
    if (!cardBuf.length) return;
    const cards = cardBuf.map(c => {
      const [title, desc, , href] = c.split("|");
      return `<a href="${href}" class="project-card">
  <div class="project-card-title">${title}</div>
  <div class="project-card-desc">${desc}</div>
</a>`;
    });
    out.push(token(`<div class="project-grid">\n${cards.join("\n")}\n</div>`));
    cardBuf = [];
  };

  for (const line of lines) {
    if (line.startsWith("PROJECTCARD ")) { cardBuf.push(line.slice(12)); continue; }
    else flushCards();

    if (line.startsWith("LINKROW ")) {
      const links = pairs(line.slice(8)).map(([t, h]) => `<a href="${h}">${t}</a>`);
      out.push(token(`<p class="link-row">${links.join(" ")}</p>`));
    } else if (line.startsWith("AVATARROW ")) {
      const avs = pairs(line.slice(10)).map(([img, h]) => `<a href="${h}"><img src="${img}" alt=""></a>`);
      out.push(token(`<div class="avatar-row">${avs.join("")}</div>`));
    } else if (line.startsWith("WEBRING ")) {
      const rest = line.slice(8);
      const lm   = rest.match(/^(.*?:)\s*(.*)$/);
      const lbl  = lm ? lm[1] : "";
      const items = pairs(lm ? lm[2] : rest).map(([t, h]) => `<a href="${h}">${t}</a>`);
      out.push(token(`<p class="webring-line"><span class="fg-muted">${lbl}</span> ${items.join(" ")}</p>`));
    } else {
      out.push(line);
    }
  }

  flushCards();
  return { md: out.join("\n"), blocks };
}

function reinsert(html, blocks) {
  let o = html.replace(/<p>((?:\s*@@BLOCK_\d+@@\s*)+)<\/p>/g, "$1");
  return o.replace(/@@BLOCK_(\d+)@@/g, (_, n) => blocks[+n]);
}

function applyLayout({ title, description, assetPrefix, body }) {
  const layout = fs.readFileSync(LAYOUT_FILE, "utf8");
  return layout
    .replace(/{{TITLE}}/g,        title)
    .replace(/{{DESCRIPTION}}/g,  description || "")
    .replace(/{{ASSET_PREFIX}}/g, assetPrefix)
    .replace(/{{BODY}}/g,         body);
}

function collectPosts(section, subdir) {
  const dir = subdir
    ? path.join(CONTENT_DIR, section, subdir)
    : path.join(CONTENT_DIR, section);

  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter(f => f.endsWith(".md"))
    .map(f => {
      const raw        = fs.readFileSync(path.join(dir, f), "utf8");
      const { data }   = parseFrontmatter(raw);
      const slug       = path.basename(f, ".md");
      const outputPath = subdir
        ? `blog/${subdir}/${slug}.html`
        : `${section}/${slug}.html`;
      return {
        title:      data.title || slug,
        date:       data.date  || "",
        year:       data.date  ? data.date.split(" ").pop() : "",
        category:   data.category || subdir || section,
        outputPath,
        slug,
        section,
        subdir,
        srcPath: path.join(dir, f),
      };
    })
    .sort((a, b) => (b.date > a.date ? 1 : -1));
}

function renderListing({ title, posts, assetPrefix }) {
  const byYear = {};
  for (const p of posts) {
    const y = p.year || "—";
    (byYear[y] = byYear[y] || []).push(p);
  }

  const years = Object.keys(byYear).sort((a, b) => b - a);

  const rows = years.map(yr => {
    const items = byYear[yr].map(p => {
      const href = assetPrefix + p.outputPath;
      const meta = p.date ? `<span class="post-item-meta">${p.date}</span>` : "";
      return `<div class="post-item"><a href="${href}">${p.title}</a>${meta}</div>`;
    }).join("\n");
    return `<div class="posts-year">${yr}</div>\n${items}`;
  }).join("\n\n");

  const body = `  <section class="posts-page">
    <h1>${title}</h1>
${rows}
  </section>`;

  return applyLayout({ title, description: "", assetPrefix, body });
}

function renderPost({ post, assetPrefix }) {
  const raw          = fs.readFileSync(post.srcPath, "utf8");
  const { data, body } = parseFrontmatter(raw);
  const htmlBody     = mdToHtml(body);

  const backLabel = post.subdir || post.section;
  const backHref  = assetPrefix + backLabel + ".html";

  const metaLine = [data.date, data.category].filter(Boolean).join(" · ");

  const pageBody = `  <article>
    <a href="${backHref}" class="back-link">← ${backLabel}</a>
    <div class="post-header">
      <h1 class="post-title">${data.title || post.slug}</h1>
      ${metaLine ? `<p class="post-meta">${metaLine}</p>` : ""}
    </div>
    <div class="post-body">
${htmlBody}
    </div>
  </article>`;

  return applyLayout({
    title:       data.title || post.slug,
    description: data.description || "",
    assetPrefix,
    body:        pageBody,
  });
}

function collectFlatMeta(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith(".md"))
    .map(f => {
      const raw = fs.readFileSync(path.join(dir, f), "utf8");
      const { data, body } = parseFrontmatter(raw);
      return { data, body, slug: path.basename(f, ".md") };
    })
    .sort((a, b) => (b.data.date || "") > (a.data.date || "") ? 1 : -1);
}

function renderProjects() {
  const items = collectFlatMeta(path.join(CONTENT_DIR, "projects"));

  const body_inner = items.length
    ? `    <div class="project-grid project-grid-full">
${items.map(p => {
      const title = escHtml(p.data.title || p.slug);
      const desc  = inline(p.data.description || "");
      const link  = p.data.link || "#";
      const thumb = p.data.image
        ? `<div class="project-card-thumb"><img src="${p.data.image}" alt=""></div>`
        : "";
      return `<a href="${link}" class="project-card">
  ${thumb}
  <div class="project-card-title">${title}</div>
  <div class="project-card-desc">${desc}</div>
</a>`;
    }).join("\n")}
    </div>`
    : `    <p class="fg-muted">nothing here yet.</p>`;

  const body = `  <section class="posts-page">
    <h1>projects</h1>
${body_inner}
  </section>`;

  return applyLayout({ title: "projects", description: "all projects", assetPrefix: "", body });
}

function renderArt() {
  const items = collectFlatMeta(path.join(CONTENT_DIR, "art"));
  const categories = [...new Set(items.map(i => i.data.category).filter(Boolean))];

  if (!items.length) {
    const body = `  <section class="posts-page">
    <h1>art</h1>
    <p class="fg-muted">nothing here yet.</p>
  </section>`;
    return applyLayout({ title: "art", description: "art & moodboard", assetPrefix: "", body });
  }

  const filterBar = categories.length
    ? `    <div class="art-filters">
      <button type="button" class="art-filter-btn active" data-filter="all">all</button>
${categories.map(c => `      <button type="button" class="art-filter-btn" data-filter="${escHtml(c)}">${escHtml(c)}</button>`).join("\n")}
    </div>`
    : "";

  const tiles = items.map(i => {
    const cat     = escHtml(i.data.category || "");
    const caption = escHtml(i.data.title || "");
    const desc    = i.data.description ? `<span class="art-desc">${inline(i.data.description)}</span>` : "";
    const cap     = (caption || desc)
      ? `<figcaption>${caption}${desc}</figcaption>`
      : "";
    return `      <figure class="art-item" data-category="${cat}">
        <img src="${i.data.image}" alt="${caption}" loading="lazy">
        ${cap}
      </figure>`;
  }).join("\n");

  const body = `  <section class="posts-page">
    <h1>art</h1>
${filterBar}
    <div class="art-masonry" id="art-masonry">
${tiles}
    </div>
  </section>

  <script>
    (function () {
      var btns  = document.querySelectorAll(".art-filter-btn");
      var tiles = document.querySelectorAll(".art-item");
      btns.forEach(function (btn) {
        btn.addEventListener("click", function () {
          btns.forEach(function (b) { b.classList.remove("active"); });
          btn.classList.add("active");
          var f = btn.getAttribute("data-filter");
          tiles.forEach(function (el) {
            el.style.display = (f === "all" || el.getAttribute("data-category") === f) ? "" : "none";
          });
        });
      });
    })();
  </script>`;

  return applyLayout({ title: "art", description: "art & moodboard", assetPrefix: "", body });
}

function renderLinks() {
  const items = collectFlatMeta(path.join(CONTENT_DIR, "links"));

  if (!items.length) {
    const body = `  <section class="posts-page">
    <h1>links</h1>
    <p class="fg-muted">nothing here yet.</p>
  </section>`;
    return applyLayout({ title: "links", description: "things i like", assetPrefix: "", body });
  }

  const grouped = {};
  for (const i of items) {
    const cat = i.data.category || "misc";
    (grouped[cat] = grouped[cat] || []).push(i);
  }
  const cats = Object.keys(grouped).sort();

  const sections = cats.map(cat => {
    const rows = grouped[cat].map(i => {
      const title = escHtml(i.data.title || i.slug);
      const url   = i.data.url || "#";
      let domain  = "";
      try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch (e) {}
      const desc  = i.data.description ? `<span class="link-desc">${inline(i.data.description)}</span>` : "";
      return `    <div class="link-item">
      <a href="${url}" target="_blank" rel="noopener">${title}</a>${domain ? ` <span class="link-domain">${domain}</span>` : ""}
      ${desc}
    </div>`;
    }).join("\n");
    return `  <div class="posts-year">${escHtml(cat)}</div>\n${rows}`;
  }).join("\n");

  const body = `  <section class="posts-page">
    <h1>links</h1>
    <p class="fg-muted">things i like, in no particular order.</p>
${sections}
  </section>`;

  return applyLayout({ title: "links", description: "things i like", assetPrefix: "", body });
}

function renderHome() {
  const raw            = fs.readFileSync(path.join(CONTENT_DIR, "home.md"), "utf8");
  const { data, body } = parseFrontmatter(raw);
  const { md, blocks } = extractHomeBlocks(body);
  const rawHtml        = mdToHtml(md);
  const bodyHtml       = reinsert(rawHtml, blocks);

  const pageBody = `  <section class="intro">
${bodyHtml}
  </section>`;

  return applyLayout({
    title:       data.title || "home",
    description: data.description || "",
    assetPrefix: "",
    body:        pageBody,
  });
}

function ensureDir(d)  { fs.mkdirSync(d, { recursive: true }); }
function clearDir(d)   { fs.rmSync(d, { recursive: true, force: true }); ensureDir(d); }
function write(f, html) {
  ensureDir(path.dirname(f));
  fs.writeFileSync(f, html);
  console.log("built ", path.relative(DIST_DIR, f));
}

function build() {
  clearDir(DIST_DIR);

  // homepage
  write(path.join(DIST_DIR, "index.html"), renderHome());

  // style
  fs.copyFileSync(STYLE_FILE, path.join(DIST_DIR, "style.css"));
  console.log("copied style.css");

  const allBlogPosts = [];
  for (const sub of BLOG_SECTIONS) {
    const posts = collectPosts("blog", sub);
    allBlogPosts.push(...posts);
    for (const post of posts) {
      write(
        path.join(DIST_DIR, post.outputPath),
        renderPost({ post, assetPrefix: "../../" })
      );
    }
  }

  write(
    path.join(DIST_DIR, "blog.html"),
    renderListing({ title: "blog", posts: allBlogPosts, assetPrefix: "" })
  );

  const flatToProcess = new Set();
  for (const s of FLAT_SECTIONS) {
    const dir = path.join(CONTENT_DIR, s);
    if (fs.existsSync(dir) && fs.readdirSync(dir).some(f => f.endsWith(".md"))) {
      flatToProcess.add(s);
    }
  }

  for (const section of flatToProcess) {
    const posts = collectPosts(section);
    for (const post of posts) {
      write(
        path.join(DIST_DIR, post.outputPath),
        renderPost({ post, assetPrefix: "../" })
      );
    }
    write(
      path.join(DIST_DIR, `${section}.html`),
      renderListing({ title: section, posts, assetPrefix: "" })
    );
  }

  write(path.join(DIST_DIR, "links.html"), renderLinks());

  write(path.join(DIST_DIR, "projects.html"), renderProjects());
  write(path.join(DIST_DIR, "art.html"), renderArt());

  console.log("\nbuild complete →", DIST_DIR);
}

build();
