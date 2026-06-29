#!/usr/bin/env node
/**
 * build.js — zero-dependency static site builder
 *
 * reads markdown files from content/, wraps them in layout/template.html,
 * auto-generates the sidebar from the folder structure, and writes
 * finished html into dist/.
 *
 * run with: node build.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const CONTENT_DIR = path.join(ROOT, "content");
const LAYOUT_FILE = path.join(ROOT, "layout", "template.html");
const STYLE_FILE = path.join(ROOT, "style.css");
const DIST_DIR = path.join(ROOT, "dist");

const BLOG_SECTIONS = ["devlogs", "talks", "tutorial"]; // sub-categories under blog/
const TOP_SECTIONS = ["journal", "notes", "poems"];      // flat categories at content root

// -----------------------------------------------------------
// tiny frontmatter parser — expects:
// ---
// key: value
// ---
// body...
// -----------------------------------------------------------
function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { data: {}, body: raw };

  const data = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    data[key] = value;
  }
  return { data, body: match[2] };
}

// -----------------------------------------------------------
// tiny markdown -> html converter
// supports: headings (##), paragraphs, bold/italic, links,
// inline code, fenced code blocks, blockquotes, unordered lists,
// images, horizontal rules. enough for this site, not a full parser.
// -----------------------------------------------------------
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inlineMarkdown(text) {
  let out = escapeHtml(text);
  // inline code (before other inline rules so contents aren't touched)
  out = out.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);
  // images: ![alt](src)
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
  // links: [text](href)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  // bold
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // italic
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return out;
}

function markdownToHtml(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let i = 0;
  let inList = false;
  let inQuote = false;

  function closeList() {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  }
  function closeQuote() {
    if (inQuote) {
      html.push("</blockquote>");
      inQuote = false;
    }
  }

  while (i < lines.length) {
    const line = lines[i];

    // fenced code block
    if (line.trim().startsWith("```")) {
      closeList();
      closeQuote();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      i++; // skip closing fence
      continue;
    }

    // heading
    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      closeList();
      closeQuote();
      const level = headingMatch[1].length;
      html.push(`<h${level}>${inlineMarkdown(headingMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // horizontal rule
    if (/^---+$/.test(line.trim())) {
      closeList();
      closeQuote();
      html.push("<hr>");
      i++;
      continue;
    }

    // blockquote
    if (line.trim().startsWith(">")) {
      closeList();
      if (!inQuote) {
        html.push("<blockquote>");
        inQuote = true;
      }
      const content = line.replace(/^\s*>\s?/, "");
      if (content.trim() === "") { i++; continue; }
      html.push(`<p>${inlineMarkdown(content)}</p>`);
      i++;
      continue;
    } else {
      closeQuote();
    }

    // unordered list item
    if (/^\s*-\s+/.test(line)) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      const content = line.replace(/^\s*-\s+/, "");
      html.push(`<li>${inlineMarkdown(content)}</li>`);
      i++;
      continue;
    } else {
      closeList();
    }

    // blank line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // standalone image line
    const imgOnly = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgOnly) {
      html.push(`<img src="${imgOnly[2]}" alt="${imgOnly[1]}">`);
      i++;
      continue;
    }

    // paragraph — collect until blank line
    const paraLines = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== "" &&
           !lines[i].match(/^#{1,3}\s/) &&
           !lines[i].trim().startsWith(">") &&
           !lines[i].trim().startsWith("```") &&
           !/^\s*-\s+/.test(lines[i]) &&
           !/^---+$/.test(lines[i].trim())) {
      paraLines.push(lines[i]);
      i++;
    }
    html.push(`<p>${paraLines.map(inlineMarkdown).join("<br>\n")}</p>`);
  }

  closeList();
  closeQuote();
  return html.join("\n\n");
}

// -----------------------------------------------------------
// homepage custom block renderers
// (LINKROW / PROJECTCARD / AVATARROW / WEBRING — see content/home.md)
//
// strategy: pull each block OUT of the markdown source and replace
// it with a unique placeholder token, run normal markdown on
// everything else, then splice the real HTML back in afterward.
// this avoids the html ever passing through the markdown escaper.
// -----------------------------------------------------------
function extractHomeBlocks(md) {
  const lines = md.split("\n");
  const out = [];
  const blocks = [];
  let cardBuffer = [];

  function tokenFor(html) {
    const token = `@@BLOCK_${blocks.length}@@`;
    blocks.push(html);
    return token;
  }

  function flushCards() {
    if (cardBuffer.length === 0) return;
    const cardsHtml = cardBuffer.map((card) => {
      const [title, desc, img, href] = card.split("|");
      return `<a href="${href}" class="project-card">
  <img src="${img}" alt="">
  <div class="project-card-body">
    <p class="project-card-title">${title}</p>
    <p class="project-card-desc">${desc}</p>
  </div>
</a>`;
    });
    out.push(tokenFor(`<div class="project-grid">\n${cardsHtml.join("\n")}\n</div>`));
    cardBuffer = [];
  }

  // splits "label|href" pairs that are separated by single spaces,
  // where the label itself may contain spaces (e.g. "x dot com|https://...")
  // by requiring each token to end in a |href segment with no spaces.
  function splitLabelHrefPairs(str) {
    const re = /(\S(?:.*?\S)?)\|(\S+)(?=\s|$)/g;
    const pairs = [];
    let m;
    while ((m = re.exec(str)) !== null) {
      pairs.push([m[1], m[2]]);
    }
    return pairs;
  }

  for (const line of lines) {
    if (line.startsWith("PROJECTCARD ")) {
      cardBuffer.push(line.slice("PROJECTCARD ".length));
      continue;
    } else {
      flushCards();
    }

    if (line.startsWith("LINKROW ")) {
      const pairs = splitLabelHrefPairs(line.slice("LINKROW ".length));
      const links = pairs.map(([text, href]) => `<a href="${href}">${text}</a>`);
      out.push(tokenFor(`<p class="link-row">\n${links.join("\n")}\n</p>`));
      continue;
    }

    if (line.startsWith("AVATARROW ")) {
      const pairs = splitLabelHrefPairs(line.slice("AVATARROW ".length));
      const avatars = pairs.map(([img, href]) => `<a href="${href}"><img src="${img}" alt=""></a>`);
      out.push(tokenFor(`<p class="avatar-row">\n${avatars.join("\n")}\n</p>`));
      continue;
    }

    if (line.startsWith("WEBRING ")) {
      const rest = line.slice("WEBRING ".length);
      const labelMatch = rest.match(/^(.*?:)\s*(.*)$/);
      const label = labelMatch ? labelMatch[1] : "";
      const itemsStr = labelMatch ? labelMatch[2] : rest;
      const pairs = splitLabelHrefPairs(itemsStr);
      const items = pairs.map(([text, href]) => `<a href="${href}">${text}</a>`);
      out.push(tokenFor(`<p class="webring-line">\n<span class="muted">${label}</span>\n${items.join("\n")}\n</p>`));
      continue;
    }

    out.push(line);
  }

  flushCards();
  return { md: out.join("\n"), blocks };
}

function reinsertHomeBlocks(html, blocks) {
  // first, unwrap any <p>...</p> that contains ONLY block tokens
  // (possibly several, since adjacent block lines get merged into
  // one paragraph by the markdown paragraph-collector)
  let out = html.replace(/<p>((?:\s*@@BLOCK_\d+@@\s*)+)<\/p>/g, "$1");
  // then substitute every remaining token with its real html
  out = out.replace(/@@BLOCK_(\d+)@@/g, (_, n) => blocks[Number(n)]);
  return out;
}

// -----------------------------------------------------------
// sidebar generation — walks content/blog/*, journal, notes, poems
// -----------------------------------------------------------
function titleFromFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const { data } = parseFrontmatter(raw);
  return data.title || path.basename(filePath, ".md");
}

function outputHrefFor(category, slug, fromDepth) {
  // fromDepth: how many folders deep the CURRENT page is (0 = root)
  const target = category ? `${category}/${slug}.html` : `${slug}.html`;
  const upPrefix = "../".repeat(fromDepth);
  return upPrefix + target;
}

function buildSidebarTree(currentDepth) {
  const lines = [];

  // blog section (two levels deep: blog/<sub>/<slug>.html)
  lines.push("      <details open>");
  lines.push("        <summary>blog</summary>");
  lines.push('        <div class="tree-children">');

  for (const sub of BLOG_SECTIONS) {
    const dir = path.join(CONTENT_DIR, "blog", sub);
    const files = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort()
      : [];

    lines.push("          <details" + (files.length ? "" : "") + ">");
    lines.push(`            <summary>${sub}</summary>`);
    if (files.length === 0) {
      lines.push('            <ul><li class="muted">nothing here yet</li></ul>');
    } else {
      lines.push("            <ul>");
      for (const file of files) {
        const slug = path.basename(file, ".md");
        const title = titleFromFile(path.join(dir, file));
        const href = "../".repeat(currentDepth) + `blog/${sub}/${slug}.html`;
        lines.push(`              <li><a href="${href}">${title}</a></li>`);
      }
      lines.push("            </ul>");
    }
    lines.push("          </details>");
  }
  lines.push("        </div>");
  lines.push("      </details>");

  // flat top-level sections: journal, notes, poems
  for (const section of TOP_SECTIONS) {
    const dir = path.join(CONTENT_DIR, section);
    const files = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort()
      : [];

    lines.push(`      <details${section === "journal" ? " open" : ""}>`);
    lines.push(`        <summary>${section}</summary>`);
    if (files.length === 0) {
      lines.push('        <ul><li class="muted">nothing here yet</li></ul>');
    } else {
      lines.push("        <ul>");
      for (const file of files) {
        const slug = path.basename(file, ".md");
        const title = titleFromFile(path.join(dir, file));
        const href = "../".repeat(currentDepth) + `${section}/${slug}.html`;
        lines.push(`          <li><a href="${href}">${title}</a></li>`);
      }
      lines.push("        </ul>");
    }
    lines.push("      </details>");
  }

  return lines.join("\n");
}

// -----------------------------------------------------------
// render a single post (depth = 1 for journal/notes/poems, 2 for blog/sub)
// -----------------------------------------------------------
function renderPost({ title, description, body, depth, category, date }) {
  const layout = fs.readFileSync(LAYOUT_FILE, "utf8");
  const assetPrefix = "../".repeat(depth);
  const sidebar = buildSidebarTree(depth);

  const metaLine = date
    ? `${date} <span class="muted">·</span> ${category}`
    : category;

  const pageBody = `    <article class="post">
      <p class="back-link"><a href="${assetPrefix}index.html">← back home</a></p>

      <h1 class="post-title">${title}</h1>
      <p class="post-meta">${metaLine}</p>

      <div class="post-body">

${body}

      </div>
    </article>`;

  return layout
    .replace(/{{TITLE}}/g, title)
    .replace(/{{DESCRIPTION}}/g, description || "")
    .replace(/{{ASSET_PREFIX}}/g, assetPrefix)
    .replace(/{{WRAP_MODIFIER}}/g, " wrap--post")
    .replace(/{{SIDEBAR}}/g, sidebar)
    .replace(/{{BODY}}/g, pageBody);
}

// -----------------------------------------------------------
// render homepage
// -----------------------------------------------------------
function renderHome() {
  const raw = fs.readFileSync(path.join(CONTENT_DIR, "home.md"), "utf8");
  const { data, body } = parseFrontmatter(raw);

  const { md: strippedMd, blocks } = extractHomeBlocks(body);
  const rawHtml = markdownToHtml(strippedMd);
  const bodyHtml = reinsertHomeBlocks(rawHtml, blocks);

  const layout = fs.readFileSync(LAYOUT_FILE, "utf8");
  const sidebar = buildSidebarTree(0);

  const pageBody = `    <section class="intro">
${bodyHtml}
    </section>`;

  return layout
    .replace(/{{TITLE}}/g, data.title || "index")
    .replace(/{{DESCRIPTION}}/g, data.description || "")
    .replace(/{{ASSET_PREFIX}}/g, "")
    .replace(/{{WRAP_MODIFIER}}/g, "")
    .replace(/{{SIDEBAR}}/g, sidebar)
    .replace(/{{BODY}}/g, pageBody);
}

// -----------------------------------------------------------
// directory helpers
// -----------------------------------------------------------
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function clearDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  ensureDir(dir);
}

// -----------------------------------------------------------
// main build
// -----------------------------------------------------------
function build() {
  clearDir(DIST_DIR);

  // homepage
  fs.writeFileSync(path.join(DIST_DIR, "index.html"), renderHome());
  console.log("built  index.html");

  // style.css passthrough
  fs.copyFileSync(STYLE_FILE, path.join(DIST_DIR, "style.css"));
  console.log("copied style.css");

  // blog/<sub>/*.md  (depth 2)
  for (const sub of BLOG_SECTIONS) {
    const dir = path.join(CONTENT_DIR, "blog", sub);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
    if (files.length === 0) continue;

    const outDir = path.join(DIST_DIR, "blog", sub);
    ensureDir(outDir);

    for (const file of files) {
      const raw = fs.readFileSync(path.join(dir, file), "utf8");
      const { data, body } = parseFrontmatter(raw);
      const slug = path.basename(file, ".md");
      const html = renderPost({
        title: data.title || slug,
        description: data.description,
        date: data.date,
        category: data.category || sub,
        body: markdownToHtml(body),
        depth: 2,
      });
      fs.writeFileSync(path.join(outDir, `${slug}.html`), html);
      console.log(`built  blog/${sub}/${slug}.html`);
    }
  }

  // journal, notes, poems  (depth 1)
  for (const section of TOP_SECTIONS) {
    const dir = path.join(CONTENT_DIR, section);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
    if (files.length === 0) continue;

    const outDir = path.join(DIST_DIR, section);
    ensureDir(outDir);

    for (const file of files) {
      const raw = fs.readFileSync(path.join(dir, file), "utf8");
      const { data, body } = parseFrontmatter(raw);
      const slug = path.basename(file, ".md");
      const html = renderPost({
        title: data.title || slug,
        description: data.description,
        date: data.date,
        category: data.category || section,
        body: markdownToHtml(body),
        depth: 1,
      });
      fs.writeFileSync(path.join(outDir, `${slug}.html`), html);
      console.log(`built  ${section}/${slug}.html`);
    }
  }

  console.log("\nbuild complete -> dist/");
}

build();
